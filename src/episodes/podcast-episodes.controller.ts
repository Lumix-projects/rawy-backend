import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatorRoleGuard } from '../auth/guards/creator-role.guard';
import { EpisodesService } from './episodes.service';
import { PodcastsService } from '../podcasts/podcasts.service';
import { CreateEpisodeDto } from './dto/create-episode.dto';
import { UserDocument } from '../users/schemas/user.schema';
import { EpisodeDocument } from './schemas/episode.schema';

const MAX_AUDIO_SIZE = 500 * 1024 * 1024;

function toEpisodeResponse(
  doc: EpisodeDocument,
  podcastCoverUrl?: string | null,
) {
  const cover = doc.coverUrl ?? podcastCoverUrl;
  const pid = doc.podcastId;
  const podcastIdStr =
    typeof pid === 'object' && pid && '_id' in pid
      ? (pid as { _id: { toString: () => string } })._id.toString()
      : String(pid);
  return {
    id: doc._id.toString(),
    podcastId: podcastIdStr,
    title: doc.title,
    description: doc.description,
    duration: doc.duration,
    seasonNumber: doc.seasonNumber,
    episodeNumber: doc.episodeNumber,
    showNotes: doc.showNotes,
    coverUrl: cover,
    chapterMarkers: doc.chapterMarkers,
    transcription: doc.transcription,
    status: doc.status,
    publishedAt: doc.publishedAt?.toISOString() ?? null,
    createdAt:
      (doc as { createdAt?: Date }).createdAt?.toISOString() ??
      new Date().toISOString(),
  };
}

@Controller('podcasts/:podcastId/episodes')
export class PodcastEpisodesController {
  constructor(
    private readonly episodesService: EpisodesService,
    private readonly podcastsService: PodcastsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, CreatorRoleGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'audio', maxCount: 1 },
        { name: 'cover', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_AUDIO_SIZE } },
    ),
  )
  async create(
    @Req() req: Request & { user: UserDocument },
    @Param('podcastId') podcastId: string,
    @Body() dto: CreateEpisodeDto,
    @UploadedFiles()
    files?: { audio?: Express.Multer.File[]; cover?: Express.Multer.File[] },
  ) {
    const audio = files?.audio?.[0];
    const cover = files?.cover?.[0];

    if (!audio || !audio.buffer) {
      throw new BadRequestException('Audio file is required');
    }

    const doc = await this.episodesService.create({
      podcastId,
      dto,
      ownerId: req.user._id,
      audio: {
        buffer: audio.buffer,
        mimetype: audio.mimetype,
        size: audio.size,
      },
      cover: cover?.buffer
        ? { buffer: cover.buffer, mimetype: cover.mimetype, size: cover.size }
        : undefined,
    });

    const podcast = await this.podcastsService.findById(doc.podcastId);
    return toEpisodeResponse(doc, podcast?.coverUrl ?? null);
  }

  @Get()
  @Public()
  async list(
    @Param('podcastId') podcastId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    await this.podcastsService.findByIdOrThrow(podcastId);
    const { items, total } = await this.episodesService.findAllByPodcast(
      podcastId,
      {
        status:
          status &&
          ['draft', 'scheduled', 'published', 'archived'].includes(status)
            ? status
            : undefined,
        limit: limit ? Math.min(Number(limit), 100) : 20,
        offset: offset ? Number(offset) : 0,
      },
    );

    const podcast = await this.podcastsService.findById(podcastId);
    const podcastCoverUrl = podcast?.coverUrl ?? null;

    return {
      items: items.map((doc) => toEpisodeResponse(doc, podcastCoverUrl)),
      total,
    };
  }
}
