import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListenerOrCreatorGuard } from '../auth/guards/listener-creator.guard';
import { PlaybackService } from './playback.service';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { UserDocument } from '../users/schemas/user.schema';

@Controller()
export class PlaybackController {
  constructor(private readonly playbackService: PlaybackService) {}

  @Get('episodes/:episodeId/stream-url')
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  async getStreamUrl(
    @Req() req: Request & { user: UserDocument },
    @Param('episodeId') episodeId: string,
  ) {
    return this.playbackService.getStreamUrl(episodeId, req.user._id);
  }

  @Get('episodes/:episodeId/download-url')
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  async getDownloadUrl(
    @Req() req: Request & { user: UserDocument },
    @Param('episodeId') episodeId: string,
  ) {
    return this.playbackService.getDownloadUrl(episodeId, req.user._id);
  }

  @Post('episodes/:episodeId/record-play')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  async recordPlay(
    @Req() req: Request & { user: UserDocument },
    @Param('episodeId') episodeId: string,
    @Body() body: { listenedSeconds?: number; deviceInfo?: string },
  ) {
    await this.playbackService.recordPlay(episodeId, req.user._id, body);
  }

  @Put('playback/progress')
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  async putProgress(
    @Req() req: Request & { user: UserDocument },
    @Body() body: UpdateProgressDto,
  ) {
    await this.playbackService.upsertProgress(
      req.user._id,
      body.episodeId,
      body.positionSeconds,
    );
  }

  @Get('playback/progress')
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  async getProgress(
    @Req() req: Request & { user: UserDocument },
    @Query('episodeIds') episodeIds?: string | string[],
  ) {
    const ids = Array.isArray(episodeIds)
      ? episodeIds
      : typeof episodeIds === 'string'
        ? episodeIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    return this.playbackService.getProgress(req.user._id, ids);
  }
}
