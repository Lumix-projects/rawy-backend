import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListenerOrCreatorGuard } from '../auth/guards/listener-creator.guard';
import { DiscoveryService } from './discovery.service';
import { UserDocument } from '../users/schemas/user.schema';
import { Types } from 'mongoose';
import { EpisodeDocument } from '../episodes/schemas/episode.schema';
import { PodcastDocument } from '../podcasts/schemas/podcast.schema';

interface PopulatedCategory {
  _id: Types.ObjectId;
  slug: string;
  name: string;
}

function toPodcastResponse(doc: PodcastDocument, baseUrl: string) {
  const cat = doc.categoryId as unknown;
  const category =
    cat && typeof cat === 'object' && 'slug' in cat
      ? {
          id: (cat as PopulatedCategory)._id?.toString(),
          slug: (cat as PopulatedCategory).slug,
          name: (cat as PopulatedCategory).name,
        }
      : undefined;
  const sub = doc.subcategoryId as unknown;
  const subcategory =
    sub && typeof sub === 'object' && 'slug' in sub
      ? {
          id: (sub as PopulatedCategory)._id?.toString(),
          slug: (sub as PopulatedCategory).slug,
          name: (sub as PopulatedCategory).name,
        }
      : undefined;

  return {
    id: doc._id.toString(),
    title: doc.title,
    description: doc.description,
    category: category
      ? { id: category.id, slug: category.slug, name: category.name }
      : undefined,
    subcategory: subcategory
      ? { id: subcategory.id, slug: subcategory.slug, name: subcategory.name }
      : undefined,
    coverUrl: doc.coverUrl,
    language: doc.language,
    tags: doc.tags,
    status: doc.status,
    explicit: doc.explicit,
    episodeOrder: doc.episodeOrder,
    websiteUrl: doc.websiteUrl,
    ownerId: doc.ownerId.toString(),
    rssUrl: `${baseUrl}/podcasts/${doc._id}/rss`,
    episodeCount: 0,
    subscriberCount: 0,
    createdAt:
      (doc as { createdAt?: Date }).createdAt?.toISOString() ??
      new Date().toISOString(),
    updatedAt:
      (doc as { updatedAt?: Date }).updatedAt?.toISOString() ??
      new Date().toISOString(),
  };
}

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
  const podcast =
    typeof pid === 'object' && pid && 'coverUrl' in pid
      ? (pid as { coverUrl?: string | null })
      : null;
  const fallbackCover = podcast?.coverUrl ?? null;
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
    createdAt:
      (doc as { createdAt?: Date }).createdAt?.toISOString() ??
      new Date().toISOString(),
  };
}

@Controller('discovery')
export class DiscoveryController {
  private readonly baseUrl: string;

  constructor(private readonly discoveryService: DiscoveryService) {
    const port = process.env.PORT ?? '3000';
    this.baseUrl =
      process.env.API_BASE_URL ?? `http://localhost:${port}/api/v1`;
  }

  private parseTagsParam(
    tags: string | string[] | undefined,
  ): string[] | undefined {
    if (!tags) return undefined;
    const arr = Array.isArray(tags)
      ? tags
      : tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  }

  @Get('browse')
  @Public()
  async browse(
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('tags') tags?: string | string[],
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const { items, total } = await this.discoveryService.browse({
      categoryId,
      subcategoryId,
      tags: this.parseTagsParam(tags),
      limit: limit ? Math.min(Number(limit), 100) : 20,
      offset: offset ? Number(offset) : 0,
    });
    return {
      items: items.map((doc) => toPodcastResponse(doc, this.baseUrl)),
      total,
    };
  }

  @Get('search')
  @Public()
  async search(
    @Query('q') q?: string,
    @Query('type') type?: 'podcast' | 'episode' | 'all',
    @Query('tags') tags?: string | string[],
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const result = await this.discoveryService.search({
      q: (typeof q === 'string' ? q : '') || '',
      type: type && ['podcast', 'episode', 'all'].includes(type) ? type : 'all',
      tags: this.parseTagsParam(tags),
      limit: limit ? Math.min(Number(limit), 100) : 20,
      offset: offset ? Number(offset) : 0,
    });
    return result;
  }

  @Get('trending')
  @Public()
  async trending(@Query('limit') limit?: number) {
    const { items, total } = await this.discoveryService.getTrending(
      limit ? Math.min(Number(limit), 50) : 10,
    );
    return {
      items: items.map((doc) => toPodcastResponse(doc, this.baseUrl)),
      total,
    };
  }

  @Get('new-releases')
  @Public()
  async newReleases(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const { items, total } = await this.discoveryService.getNewReleases({
      limit: limit ? Math.min(Number(limit), 100) : 20,
      offset: offset ? Number(offset) : 0,
    });
    return {
      items: items.map((doc) => toEpisodeResponse(doc)),
      total,
    };
  }

  @Get('featured')
  @Public()
  async featured() {
    const { items, total } = await this.discoveryService.getFeatured();
    return {
      items: items.map((doc) => toPodcastResponse(doc, this.baseUrl)),
      total,
    };
  }

  @Get('recommendations')
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  async recommendations(
    @Req() req: Request & { user: UserDocument },
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const { items, total } = await this.discoveryService.getRecommendations(
      req.user._id,
      {
        limit: limit ? Math.min(Number(limit), 50) : 20,
        offset: offset ? Number(offset) : 0,
      },
    );
    return {
      items: items.map((doc) => toPodcastResponse(doc, this.baseUrl)),
      total,
    };
  }
}
