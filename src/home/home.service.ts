import { Injectable, Logger } from '@nestjs/common';
import { HomeResponseDto, MediaItemDto, ContinueItemDto } from './dto/home-response.dto';
import { DiscoveryService } from '../discovery/discovery.service';
import { PlaybackService } from '../playback/playback.service';
import { Types } from 'mongoose';

@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly playbackService: PlaybackService,
  ) {}

  private toMediaFromPodcast(p: any): MediaItemDto {
    return {
      id: p._id.toString(),
      type: 'podcast',
      title: p.title,
      subtitle: p.description ?? undefined,
      imageUrl: p.coverUrl ?? undefined,
      durationSeconds: undefined,
      publishedAt: undefined,
      tags: Array.isArray(p.tags) ? p.tags : undefined,
    };
  }

  private toMediaFromEpisode(e: any): MediaItemDto {
    const podcastTitle =
      typeof e.podcastId === 'object' && e.podcastId ? e.podcastId.title : undefined;
    return {
      id: e._id.toString(),
      type: 'episode',
      title: e.title,
      subtitle: podcastTitle ?? e.description ?? undefined,
      imageUrl: e.coverUrl ?? undefined,
      durationSeconds: e.duration ?? undefined,
      publishedAt: e.publishedAt ? new Date(e.publishedAt).toISOString() : undefined,
      tags: undefined,
    };
  }

  async getHome(userId?: string, _locale?: string, limit = 6): Promise<HomeResponseDto> {
    const lim = Math.min(Math.max(1, Number(limit) || 6), 50);

    // Featured
    const featured: MediaItemDto[] = await this.discoveryService
      .getFeatured()
      .then((r) => r.items.slice(0, lim).map((p) => this.toMediaFromPodcast(p)))
      .catch((e) => { this.logger.error('getFeatured failed', e); return []; });

    // Latest episodes
    const latest: MediaItemDto[] = await this.discoveryService
      .getNewReleases({ limit: lim })
      .then((r) => r.items.slice(0, lim).map((e) => this.toMediaFromEpisode(e)))
      .catch((e) => { this.logger.error('getNewReleases failed', e); return []; });

    // Continue Listening & Recommendations (user-specific)
    let continueListening: ContinueItemDto[] = [];
    let recommendations: MediaItemDto[] = [];

    if (userId) {
      try {
        const uid = new Types.ObjectId(userId);

        const history = await this.playbackService
          .getHistory(uid, { limit: lim })
          .catch((e) => { this.logger.error('getHistory failed', e); return { items: [] }; });

        if (history.items.length) {
          const episodeIds = history.items.map((e: any) => e._id.toString());
          const progressMap = await this.playbackService
            .getProgress(uid, episodeIds)
            .catch(() => ({} as Record<string, number>));

          continueListening = history.items
            .slice(0, lim)
            .map((e: any) => ({
              ...this.toMediaFromEpisode(e),
              playbackPosition: progressMap[e._id.toString()] ?? 0,
            })) as ContinueItemDto[];
        }

        const rec = await this.discoveryService
          .getRecommendations(uid, { limit: lim })
          .catch((err: unknown) => { this.logger.error('getRecommendations failed', err); return { items: [] as import('../podcasts/schemas/podcast.schema').PodcastDocument[], total: 0 }; });
        recommendations = rec.items.slice(0, lim).map((p) => this.toMediaFromPodcast(p));
      } catch (e) {
        this.logger.error('User-specific home section failed', e);
        recommendations = await this.discoveryService
          .getTrending(lim)
          .then((r) => r.items.slice(0, lim).map((p) => this.toMediaFromPodcast(p)))
          .catch(() => []);
      }
    } else {
      recommendations = await this.discoveryService
        .getTrending(lim)
        .then((r) => r.items.slice(0, lim).map((p) => this.toMediaFromPodcast(p)))
        .catch((err: unknown) => { this.logger.error('getTrending failed', err); return []; });
    }

    return { featured, latest, continueListening, recommendations };
  }
}
