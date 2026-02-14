import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { Request } from 'express';
import { Types } from 'mongoose';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatorRoleGuard } from '../auth/guards/creator-role.guard';
import { EpisodesService } from './episodes.service';
import { PodcastsService } from '../podcasts/podcasts.service';
import { UpdateEpisodeDto } from './dto/update-episode.dto';
import { UserDocument } from '../users/schemas/user.schema';
import { EpisodeDocument } from './schemas/episode.schema';

function toEpisodeResponse(doc: EpisodeDocument, podcastCoverUrl?: string | null) {
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
    createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

@Controller('episodes')
export class EpisodesController {
  constructor(
    private readonly episodesService: EpisodesService,
    private readonly podcastsService: PodcastsService,
  ) {}

  @Get(':episodeId')
  @Public()
  async getById(@Param('episodeId') episodeId: string) {
    const doc = await this.episodesService.findByIdOrThrow(episodeId);
    let podcastCoverUrl: string | null = null;
    try {
      const podcast = await this.podcastsService.findById(doc.podcastId);
      podcastCoverUrl = podcast?.coverUrl ?? null;
    } catch {
      podcastCoverUrl = null;
    }
    return toEpisodeResponse(doc, podcastCoverUrl);
  }

  @Patch(':episodeId')
  @UseGuards(JwtAuthGuard, CreatorRoleGuard)
  async update(
    @Req() req: Request & { user: UserDocument },
    @Param('episodeId') episodeId: string,
    @Body() body: UpdateEpisodeDto,
  ) {
    const doc = await this.episodesService.update(episodeId, req.user._id, {
      dto: body,
    });
    let podcastCoverUrl: string | null = null;
    try {
      const podcast = await this.podcastsService.findById(doc.podcastId);
      podcastCoverUrl = podcast?.coverUrl ?? null;
    } catch {
      podcastCoverUrl = null;
    }
    return toEpisodeResponse(doc, podcastCoverUrl);
  }

  @Delete(':episodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, CreatorRoleGuard)
  async delete(
    @Req() req: Request & { user: UserDocument },
    @Param('episodeId') episodeId: string,
  ) {
    await this.episodesService.delete(episodeId, req.user._id);
  }
}
