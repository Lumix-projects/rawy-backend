import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { Types } from 'mongoose';
import { IsString, IsOptional, IsNumberString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListenerOrCreatorGuard } from '../auth/guards/listener-creator.guard';
import { PlaybackService } from './playback.service';
import { UserDocument } from '../users/schemas/user.schema';
import { EpisodeDocument } from '../episodes/schemas/episode.schema';

function toEpisodeResponse(
  doc: EpisodeDocument,
  podcastCoverUrl?: string | null,
): Record<string, unknown> {
  const cover = doc.coverUrl ?? podcastCoverUrl;
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
    coverUrl: cover ?? fallbackCover,
    chapterMarkers: doc.chapterMarkers,
    transcription: doc.transcription,
    status: doc.status,
    publishedAt: doc.publishedAt?.toISOString() ?? null,
    createdAt: timestamps.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

class AddBookmarkDto {
  @IsString()
  episodeId!: string;
}

class HistoryQueryDto {
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsNumberString()
  offset?: string;
}

@Controller('library')
@UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
export class LibraryController {
  constructor(private readonly playbackService: PlaybackService) {}

  @Get('history')
  async getHistory(
    @Req() req: Request & { user: UserDocument },
    @Query() query: HistoryQueryDto,
  ) {
    const { items, total } = await this.playbackService.getHistory(
      req.user._id,
      {
        limit: query.limit ? Number(query.limit) : 50,
        offset: query.offset ? Number(query.offset) : 0,
      },
    );
    return {
      items: items.map((doc) => toEpisodeResponse(doc)),
      total,
    };
  }

  @Get('bookmarks')
  async getBookmarks(@Req() req: Request & { user: UserDocument }) {
    const { items, total } = await this.playbackService.getBookmarks(
      req.user._id,
    );
    return {
      items: items.map((doc) => toEpisodeResponse(doc)),
      total,
    };
  }

  @Post('bookmarks')
  @HttpCode(HttpStatus.CREATED)
  async addBookmark(
    @Req() req: Request & { user: UserDocument },
    @Body() dto: AddBookmarkDto,
  ) {
    await this.playbackService.addBookmark(req.user._id, dto.episodeId);
    return { message: 'Bookmarked' };
  }

  @Delete('bookmarks')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeBookmark(
    @Req() req: Request & { user: UserDocument },
    @Query('episodeId') episodeId: string,
  ) {
    if (!episodeId || typeof episodeId !== 'string') {
      throw new BadRequestException('episodeId query is required');
    }
    await this.playbackService.removeBookmark(req.user._id, episodeId);
  }
}
