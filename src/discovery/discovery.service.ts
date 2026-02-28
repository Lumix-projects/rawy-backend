import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { PipelineStage } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Podcast, PodcastDocument } from '../podcasts/schemas/podcast.schema';
import { Episode, EpisodeDocument } from '../episodes/schemas/episode.schema';
import {
  PlayEvent,
  PlayEventDocument,
} from '../playback/schemas/play-event.schema';
import {
  ListeningProgress,
  ListeningProgressDocument,
} from '../playback/schemas/listening-progress.schema';
import {
  FeaturedPodcast,
  FeaturedPodcastDocument,
} from '../admin/schemas/featured-podcast.schema';
import { Subscription, SubscriptionDocument } from '../subscriptions/schemas/subscription.schema';
import { Follow, FollowDocument } from '../follows/schemas/follow.schema';

const TRENDING_CACHE_KEY = 'discovery:trending_podcasts';
const TRENDING_TTL_SEC = 3600; // 1 hour

export interface BrowseOptions {
  categoryId?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface SearchOptions {
  q: string;
  type?: 'podcast' | 'episode' | 'all';
  tags?: string[];
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
    @InjectModel(Podcast.name)
    private readonly podcastModel: Model<PodcastDocument>,
    @InjectModel(Episode.name)
    private readonly episodeModel: Model<EpisodeDocument>,
    @InjectModel(PlayEvent.name)
    private readonly playEventModel: Model<PlayEventDocument>,
    @InjectModel(ListeningProgress.name)
    private readonly progressModel: Model<ListeningProgressDocument>,
    @InjectModel(FeaturedPodcast.name)
    private readonly featuredPodcastModel: Model<FeaturedPodcastDocument>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Follow.name)
    private readonly followModel: Model<FollowDocument>,
    private readonly configService: ConfigService,
  ) {
    const url = this.configService.get('REDIS_URL', '');
    if (url && url !== 'memory' && !url.startsWith('skip')) {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        lazyConnect: true,
      });
      this.redis.on('error', () => {});
    }
  }

  async browse(
    options: BrowseOptions,
  ): Promise<{ items: PodcastDocument[]; total: number }> {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    const filter: Record<string, unknown> = { status: 'published' };
    if (options.categoryId) {
      filter.categoryIds = new Types.ObjectId(options.categoryId);
    }
    if (options.tags && options.tags.length > 0) {
      filter.tags = { $in: options.tags };
    }

    const [items, total] = await Promise.all([
      this.podcastModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate('categoryIds', 'slug name')
        .exec(),
      this.podcastModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;
    const type = options.type ?? 'all';

    const result: SearchResult = { podcasts: [], episodes: [] };

    if (!options.q || options.q.trim() === '') {
      return result;
    }

    const textQuery = this.escapeTextSearch(options.q);

    const podcastFilter: Record<string, unknown> = {
      status: 'published',
      $text: { $search: textQuery },
    };
    const episodeFilter: Record<string, unknown> = {
      status: 'published',
      $text: { $search: textQuery },
    };

    if (options.tags && options.tags.length > 0) {
      podcastFilter.tags = { $in: options.tags };
    }

    try {
      if (type === 'podcast' || type === 'all') {
        const podcasts = await this.podcastModel
          .find(podcastFilter)
          .limit(limit)
          .skip(offset)
          .populate('categoryIds', 'slug name')
          .exec();
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
    const cats = (p.categoryIds ?? []) as unknown as Array<{
      _id: Types.ObjectId;
      slug: string;
      name: string;
    }>;
    const categories = cats
      .filter((c) => c && typeof c === 'object' && 'slug' in c)
      .map((c) => ({ id: c._id.toString(), slug: c.slug, name: c.name }));
    return {
      id: p._id.toString(),
      title: p.title,
      description: p.description,
      coverUrl: p.coverUrl,
      categories,
      category: categories[0] ?? undefined,
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

  async getTrending(
    limit = 10,
  ): Promise<{ items: PodcastDocument[]; total: number }> {
    const cacheKey = `${TRENDING_CACHE_KEY}:${limit}`;
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const ids = JSON.parse(cached) as string[];
          if (ids.length > 0) {
            const items = await this.podcastModel
              .find({ _id: { $in: ids }, status: 'published' })
              .populate('categoryIds', 'slug name')
              .exec();
            const ordered = ids
              .map((id) => items.find((p) => p._id.toString() === id))
              .filter(Boolean) as PodcastDocument[];
            return { items: ordered, total: ordered.length };
          }
        }
      } catch {
        // Redis unavailable  fall through to DB query
      }
    }

    const pipeline: PipelineStage[] = [
      { $match: { podcastId: { $exists: true } } },
      { $group: { _id: '$podcastId', plays: { $sum: 1 } } },
      { $sort: { plays: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'podcasts',
          localField: '_id',
          foreignField: '_id',
          as: 'podcast',
        },
      },
      { $unwind: '$podcast' },
      { $match: { 'podcast.status': 'published' } },
      { $replaceRoot: { newRoot: '$podcast' } },
    ];

    const items = await this.playEventModel.aggregate(pipeline).exec();
    const docs = await this.podcastModel
      .find({ _id: { $in: items.map((p: { _id: Types.ObjectId }) => p._id) } })
      .populate('categoryIds', 'slug name')
      .exec();

    if (this.redis && docs.length > 0) {
      try {
        const ids = docs.map((d) => d._id.toString());
        await this.redis.setex(cacheKey, TRENDING_TTL_SEC, JSON.stringify(ids));
      } catch {
        // Redis unavailable  skip cache write
      }
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
    const featured = await this.featuredPodcastModel
      .find()
      .sort({ order: 1 })
      .limit(20)
      .exec();

    if (featured.length === 0) {
      // No featured list and no play events -> fallback to latest published podcasts
      const trending = await this.getTrending(20);
      if (trending.items.length > 0) return trending;

      const items = await this.podcastModel
        .find({ status: 'published' })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('categoryIds', 'slug name')
        .exec();
      return { items, total: items.length };
    }

    const podcastIds = featured.map((f) => f.podcastId);
    const podcasts = await this.podcastModel
      .find({ _id: { $in: podcastIds }, status: 'published' })
      .populate('categoryIds', 'slug name')
      .exec();

    const podcastMap = new Map(
      podcasts.map((p) => [p._id.toString(), p]),
    );
    const ordered = featured
      .map((f) => podcastMap.get(f.podcastId.toString()))
      .filter(Boolean) as PodcastDocument[];

    return { items: ordered, total: ordered.length };
  }

  async getRecommendations(
    userId: Types.ObjectId,
    options?: { limit?: number; offset?: number },
  ): Promise<{ items: PodcastDocument[]; total: number }> {
    const limit = Math.min(options?.limit ?? 20, 50);
    const offset = options?.offset ?? 0;

    // Collect listened podcast IDs to exclude
    const progressList = await this.progressModel
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(200)
      .exec();

    const listenedPodcastIds = new Set<string>();
    if (progressList.length > 0) {
      const episodeIds = progressList.map((p) => p.episodeId);
      const episodes = await this.episodeModel
        .find({ _id: { $in: episodeIds }, status: 'published' })
        .populate('podcastId')
        .exec();
      for (const ep of episodes) {
        const podcast = ep.podcastId;
        if (podcast && typeof podcast === 'object' && '_id' in podcast) {
          listenedPodcastIds.add((podcast as { _id: Types.ObjectId })._id.toString());
        }
      }
    }

    // 1) Follow-based: find users the current user follows, get their subscriptions
    const followDocs = await this.followModel
      .find({ followerId: userId })
      .select('followingId')
      .lean()
      .exec();

    const followingUserIds = (followDocs as Array<{ followingId: Types.ObjectId | string | null }>)
      .map((d) => d.followingId)
      .filter((id): id is Types.ObjectId | string => id != null);

    let followBasedPodcastIds: string[] = [];
    if (followingUserIds.length > 0) {
      const subs = await this.subscriptionModel
        .find({ userId: { $in: followingUserIds } })
        .select('podcastId')
        .lean()
        .exec();
      const counts = new Map<string, number>();
      for (const s of subs) {
        const pid = (s as { podcastId: unknown }).podcastId?.toString?.() ?? String((s as { podcastId: unknown }).podcastId);
        if (!pid) continue;
        if (listenedPodcastIds.has(pid)) continue;
        counts.set(pid, (counts.get(pid) ?? 0) + 1);
      }
      followBasedPodcastIds = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map((e) => e[0]);
    }

    // 2) Popularity-based: recent play events (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
    const popPipeline: PipelineStage[] = [
      { $match: { podcastId: { $exists: true }, createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: '$podcastId', plays: { $sum: 1 } } },
      { $sort: { plays: -1 } },
      { $limit: Math.max(limit * 2, 50) },
    ];
    const popAgg = (await this.playEventModel.aggregate(popPipeline).exec()) as Array<{ _id: Types.ObjectId; plays: number }>;
    const popularIds = popAgg
      .map((r) => r._id.toString())
      .filter((id) => !listenedPodcastIds.has(id));

    // Merge: follow-based first, then popular (dedup)
    const orderedIds: string[] = [];
    const addId = (id: string) => {
      if (!id || orderedIds.includes(id)) return;
      orderedIds.push(id);
    };
    for (const id of followBasedPodcastIds) {
      addId(id);
      if (orderedIds.length >= limit + offset) break;
    }
    for (const id of popularIds) {
      addId(id);
      if (orderedIds.length >= limit + offset) break;
    }

    if (orderedIds.length === 0) {
      return this.getTrending(limit);
    }

    const slice = orderedIds.slice(offset, offset + limit).map((id) => new Types.ObjectId(id));

    const docs = await this.podcastModel
      .find({ _id: { $in: slice }, status: 'published' })
      .populate('categoryIds', 'slug name')
      .exec();

    const orderedDocs = slice
      .map((oid) => docs.find((d) => d._id.toString() === oid.toString()))
      .filter(Boolean) as PodcastDocument[];

    return { items: orderedDocs, total: orderedIds.length };
  }
}
