import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { PipelineStage } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Podcast, PodcastDocument } from '../podcasts/schemas/podcast.schema';
import { Episode, EpisodeDocument } from '../episodes/schemas/episode.schema';
import { PlayEvent, PlayEventDocument } from '../playback/schemas/play-event.schema';

const TRENDING_CACHE_KEY = 'discovery:trending_podcasts';
const TRENDING_TTL_SEC = 3600; // 1 hour

export interface BrowseOptions {
  categoryId?: string;
  subcategoryId?: string;
  limit?: number;
  offset?: number;
}

export interface SearchOptions {
  q: string;
  type?: 'podcast' | 'episode' | 'all';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  podcasts: Array<{
    id: string;
    title: string;
    description?: string | null;
    coverUrl: string;
    category?: { id: string; slug: string; name: string };
    status: string;
  }>;
  episodes: Array<{
    id: string;
    podcastId: string;
    title: string;
    description?: string | null;
    duration: number;
    coverUrl?: string | null;
    status: string;
    publishedAt?: string | null;
  }>;
}

@Injectable()
export class DiscoveryService {
  private redis: Redis | null = null;

  constructor(
    @InjectModel(Podcast.name) private readonly podcastModel: Model<PodcastDocument>,
    @InjectModel(Episode.name) private readonly episodeModel: Model<EpisodeDocument>,
    @InjectModel(PlayEvent.name) private readonly playEventModel: Model<PlayEventDocument>,
    private readonly configService: ConfigService,
  ) {
    const url = this.configService.get('REDIS_URL', '');
    if (url && url !== 'memory' && !url.startsWith('skip')) {
      this.redis = new Redis(url);
      this.redis.on('error', () => {});
    }
  }

  async browse(options: BrowseOptions): Promise<{ items: PodcastDocument[]; total: number }> {
    const filter: Record<string, unknown> = { status: 'published' };
    if (options.categoryId) {
      filter.categoryId = new Types.ObjectId(options.categoryId);
    }
    if (options.subcategoryId) {
      filter.subcategoryId = new Types.ObjectId(options.subcategoryId);
    }

    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    const [items, total] = await Promise.all([
      this.podcastModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate('categoryId', 'slug name')
        .populate('subcategoryId', 'slug name')
        .exec(),
      this.podcastModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const q = options.q?.trim();
    if (!q) {
      throw new BadRequestException('Search query (q) is required');
    }

    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;
    const type = options.type ?? 'all';

    const result: SearchResult = { podcasts: [], episodes: [] };

    const podcastFilter: Record<string, unknown> = {
      status: 'published',
      $text: { $search: this.escapeTextSearch(q) },
    };
    const episodeFilter: Record<string, unknown> = {
      status: 'published',
      $text: { $search: this.escapeTextSearch(q) },
    };

    try {
      if (type === 'podcast' || type === 'all') {
        const [podcasts, _] = await Promise.all([
          this.podcastModel
            .find(podcastFilter)
            .limit(limit)
            .skip(offset)
            .populate('categoryId', 'slug name')
            .exec(),
          this.podcastModel.countDocuments(podcastFilter).exec(),
        ]);
        result.podcasts = podcasts.map((p) => this.toSearchPodcast(p));
      }

      if (type === 'episode' || type === 'all') {
        const episodes = await this.episodeModel
          .find(episodeFilter)
          .limit(limit)
          .skip(offset)
          .populate('podcastId', 'title coverUrl')
          .sort({ publishedAt: -1 })
          .exec();
        result.episodes = episodes.map((e) => this.toSearchEpisode(e));
      }
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('text index') || msg.includes('no such index')) {
        result.podcasts = [];
        result.episodes = [];
      } else {
        throw err;
      }
    }

    return result;
  }

  private escapeTextSearch(q: string): string {
    return q.replace(/[-\s]+/g, ' ').trim();
  }

  private toSearchPodcast(p: PodcastDocument) {
    const raw = p.categoryId as unknown;
    const cat = raw && typeof raw === 'object' && 'slug' in raw
      ? (raw as { _id: Types.ObjectId; slug: string; name: string })
      : null;
    return {
      id: p._id.toString(),
      title: p.title,
      description: p.description,
      coverUrl: p.coverUrl,
      category: cat ? { id: cat._id.toString(), slug: cat.slug, name: cat.name } : undefined,
      status: p.status,
    };
  }

  private toSearchEpisode(e: EpisodeDocument) {
    const pid = e.podcastId;
    const podcastIdStr =
      typeof pid === 'object' && pid && '_id' in pid
        ? (pid as { _id: Types.ObjectId })._id.toString()
        : String(pid);
    return {
      id: e._id.toString(),
      podcastId: podcastIdStr,
      title: e.title,
      description: e.description,
      duration: e.duration,
      coverUrl: e.coverUrl,
      status: e.status,
      publishedAt: e.publishedAt?.toISOString() ?? null,
    };
  }

  async getTrending(limit = 10): Promise<{ items: PodcastDocument[]; total: number }> {
    const cacheKey = `${TRENDING_CACHE_KEY}:${limit}`;
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          const ids = JSON.parse(cached) as string[];
          if (ids.length > 0) {
            const items = await this.podcastModel
              .find({ _id: { $in: ids }, status: 'published' })
              .populate('categoryId', 'slug name')
              .populate('subcategoryId', 'slug name')
              .exec();
            const ordered = ids
              .map((id) => items.find((p) => p._id.toString() === id))
              .filter(Boolean) as PodcastDocument[];
            return { items: ordered, total: ordered.length };
          }
        } catch {
          // ignore parse error
        }
      }
    }

    const pipeline: PipelineStage[] = [
      { $match: { podcastId: { $exists: true } } },
      { $group: { _id: '$podcastId', plays: { $sum: 1 } } },
      { $sort: { plays: -1 } },
      { $limit: limit },
      { $lookup: { from: 'podcasts', localField: '_id', foreignField: '_id', as: 'podcast' } },
      { $unwind: '$podcast' },
      { $match: { 'podcast.status': 'published' } },
      { $replaceRoot: { newRoot: '$podcast' } },
    ];

    const items = await this.playEventModel.aggregate(pipeline).exec();
    const docs = await this.podcastModel
      .find({ _id: { $in: items.map((p: { _id: Types.ObjectId }) => p._id) } })
      .populate('categoryId', 'slug name')
      .populate('subcategoryId', 'slug name')
      .exec();

    if (this.redis && docs.length > 0) {
      const ids = docs.map((d) => d._id.toString());
      await this.redis.setex(cacheKey, TRENDING_TTL_SEC, JSON.stringify(ids));
    }

    return { items: docs, total: docs.length };
  }

  async getNewReleases(options?: { limit?: number; offset?: number }): Promise<{
    items: EpisodeDocument[];
    total: number;
  }> {
    const limit = Math.min(options?.limit ?? 20, 100);
    const offset = options?.offset ?? 0;

    const filter = { status: 'published' };

    const [items, total] = await Promise.all([
      this.episodeModel
        .find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate('podcastId', 'title coverUrl')
        .exec(),
      this.episodeModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async getFeatured(): Promise<{ items: PodcastDocument[]; total: number }> {
    // Featured is admin-curated (Phase 12). For Phase 5, return same as trending.
    return this.getTrending(20);
  }
}
