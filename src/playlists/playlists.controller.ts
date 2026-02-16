import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { Types } from 'mongoose';
import { IsString, IsOptional, IsArray } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListenerOrCreatorGuard } from '../auth/guards/listener-creator.guard';
import { PlaylistsService } from './playlists.service';
import { UserDocument } from '../users/schemas/user.schema';
import { EpisodeDocument } from '../episodes/schemas/episode.schema';
import { PlaylistDocument } from './schemas/playlist.schema';

function toEpisodeResponse(doc: EpisodeDocument): Record<string, unknown> {
  const pid = doc.podcastId;
  const podcastIdStr =
    typeof pid === 'object' && pid && '_id' in pid
      ? (pid as { _id: Types.ObjectId })._id.toString()
      : String(pid);
  const podcast =
    typeof pid === 'object' && pid && 'coverUrl' in pid
      ? (pid as { coverUrl?: string | null })
      : null;
  const fallbackCover = podcast?.coverUrl ?? null;
  const cover = doc.coverUrl ?? fallbackCover;
  const timestamps = doc as { createdAt?: Date };
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
    createdAt: timestamps.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function toPlaylistResponse(
  doc: PlaylistDocument,
  episodes?: EpisodeDocument[],
): Record<string, unknown> {
  const timestamps = doc as { createdAt?: Date; updatedAt?: Date };
  const episodeMap = episodes
    ? new Map(episodes.map((e) => [e._id.toString(), e]))
    : null;
  const orderedEpisodes = doc.episodeIds
    ? doc.episodeIds
        .map((id) => episodeMap?.get(id.toString()))
        .filter((e): e is EpisodeDocument => !!e)
    : [];
  return {
    id: doc._id.toString(),
    name: doc.name,
    episodeIds: (doc.episodeIds ?? []).map((id) => id.toString()),
    episodes: orderedEpisodes.map(toEpisodeResponse),
    createdAt: timestamps.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: timestamps.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

class CreatePlaylistDto {
  @IsString()
  name!: string;
}

class UpdatePlaylistDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  episodeIds?: string[];
}

@Controller('playlists')
@UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
export class PlaylistsController {
  constructor(private readonly playlistsService: PlaylistsService) {}

  @Get()
  async list(@Req() req: Request & { user: UserDocument }) {
    const items = await this.playlistsService.findAll(req.user._id);
    const result = [];
    for (const doc of items) {
      const episodes = await this.playlistsService.getEpisodesForPlaylist(doc);
      result.push(toPlaylistResponse(doc, episodes));
    }
    return result;
  }

  @Post()
  async create(
    @Req() req: Request & { user: UserDocument },
    @Body() dto: CreatePlaylistDto,
  ) {
    const doc = await this.playlistsService.create(req.user._id, dto.name);
    return toPlaylistResponse(doc, []);
  }

  @Get(':playlistId')
  async getOne(
    @Req() req: Request & { user: UserDocument },
    @Param('playlistId') playlistId: string,
  ) {
    const doc = await this.playlistsService.findByIdOrThrow(
      playlistId,
      req.user._id,
    );
    const episodes = await this.playlistsService.getEpisodesForPlaylist(doc);
    return toPlaylistResponse(doc, episodes);
  }

  @Patch(':playlistId')
  async update(
    @Req() req: Request & { user: UserDocument },
    @Param('playlistId') playlistId: string,
    @Body() dto: UpdatePlaylistDto,
  ) {
    const updates: { name?: string; episodeIds?: string[] } = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.episodeIds !== undefined) updates.episodeIds = dto.episodeIds;
    const doc = await this.playlistsService.update(
      playlistId,
      req.user._id,
      updates,
    );
    const episodes = await this.playlistsService.getEpisodesForPlaylist(doc);
    return toPlaylistResponse(doc, episodes);
  }

  @Delete(':playlistId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Req() req: Request & { user: UserDocument },
    @Param('playlistId') playlistId: string,
  ) {
    await this.playlistsService.delete(playlistId, req.user._id);
  }
}
