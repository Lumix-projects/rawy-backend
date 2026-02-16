import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatorRoleGuard } from '../auth/guards/creator-role.guard';
import { UserDocument } from '../users/schemas/user.schema';

@Controller()
@UseGuards(JwtAuthGuard, CreatorRoleGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /podcasts/:podcastId/analytics
   * Creator analytics for a podcast (plays, unique listeners, duration, geography, devices, growth, top episodes).
   */
  @Get('podcasts/:podcastId/analytics')
  async getPodcastAnalytics(
    @Param('podcastId') podcastId: string,
    @Req() req: Request & { user: UserDocument },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getPodcastAnalytics(
      podcastId,
      req.user._id,
      from,
      to,
    );
  }

  /**
   * GET /episodes/:episodeId/analytics
   * Creator analytics for an episode (plays, unique listeners, avg duration, downloads).
   */
  @Get('episodes/:episodeId/analytics')
  async getEpisodeAnalytics(
    @Param('episodeId') episodeId: string,
    @Req() req: Request & { user: UserDocument },
  ) {
    return this.analyticsService.getEpisodeAnalytics(episodeId, req.user._id);
  }
}
