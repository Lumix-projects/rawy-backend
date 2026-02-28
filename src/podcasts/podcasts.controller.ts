import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
  Header,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { Types } from 'mongoose';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatorRoleGuard } from '../auth/guards/creator-role.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { PodcastsService } from './podcasts.service';
import { EpisodesService } from '../episodes/episodes.service';
import { RssService } from './rss/rss.service';
import { CreatePodcastDto } from './dto/create-podcast.dto';
import { UpdatePodcastDto } from './dto/update-podcast.dto';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';

function toPodcastResponse(
  doc: {
    _id: Types.ObjectId;
    title: string;
    description?: string | null;
    coverUrl: string;
    language: string;
    tags: string[];
    status: string;
    explicit: boolean;
    episodeOrder: string;
    websiteUrl?: string | null;
    ownerId: Types.ObjectId;
    categoryIds?: Array<{ _id: Types.ObjectId; slug: string; name: string } | Types.ObjectId>;
    createdAt?: Date;
    updatedAt?: Date;
  },
  baseUrl: string,
) {
  const categories = (doc.categoryIds ?? [])
    .filter((c) => c && typeof c === 'object' && 'slug' in c)
    .map((c) => {
      const cat = c as { _id: Types.ObjectId; slug: string; name: string };
      return { id: cat._id?.toString(), slug: cat.slug, name: cat.name };
    });

  return {
    id: doc._id.toString(),
    title: doc.title,
    description: doc.description,
    categories,
    // backward compat: keep single category for older clients
    category: categories[0] ?? undefined,
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

@Controller('podcasts')
export class PodcastsController {
  private readonly baseUrl: string;

  constructor(
    private readonly podcastsService: PodcastsService,
    private readonly episodesService: EpisodesService,
    private readonly rssService: RssService,
    private readonly usersService: UsersService,
  ) {
    const port = process.env.PORT ?? '3000';
    this.baseUrl =
      process.env.API_BASE_URL ?? `http://localhost:${port}/api/v1`;
  }

  @Post()
  @UseGuards(JwtAuthGuard, CreatorRoleGuard)
  @UseInterceptors(
    FileInterceptor('cover', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async create(
    @Req() req: Request & { user: UserDocument },
    @Body() dto: CreatePodcastDto,
    @UploadedFile() cover?: Express.Multer.File,
  ) {
    const doc = await this.podcastsService.create({
      dto,
      ownerId: req.user._id,
      cover: cover
        ? { buffer: cover.buffer, mimetype: cover.mimetype, size: cover.size }
        : undefined,
    });
    return toPodcastResponse(doc, this.baseUrl);
  }

  @Get()
  @UseGuards(JwtAuthGuard, CreatorRoleGuard)
  async listMyPodcasts(
    @Req() req: Request & { user: UserDocument },
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const { items, total } = await this.podcastsService.findAllByOwner(
      req.user._id,
      {
        status:
          status && ['draft', 'published', 'archived'].includes(status)
            ? status
            : undefined,
        limit: limit ? Math.min(Number(limit), 100) : 20,
        offset: offset ? Number(offset) : 0,
      },
    );
    return {
      items: items.map((doc) => toPodcastResponse(doc, this.baseUrl)),
      total,
    };
  }

  @Get('by-user/:ownerId')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  async listPublicPodcastsByUser(
    @Param('ownerId') ownerId: string,
    @Req() req: Request & { user?: UserDocument },
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    let ownerObjId: Types.ObjectId;
    try {
      ownerObjId = new Types.ObjectId(ownerId);
    } catch {
      return { items: [], total: 0 };
    }
    // Check privacy
    const owner = await this.usersService.findById(ownerId);
    if (!owner) return { items: [], total: 0 };
    const requesterId = req.user?._id?.toString();
    if (owner.isPrivate && requesterId !== ownerId) {
      return { items: [], total: 0 };
    }
    const { items, total } = await this.podcastsService.findAllByOwner(
      ownerObjId,
      {
        status: 'published',
        limit: limit ? Math.min(Number(limit), 50) : 20,
        offset: offset ? Number(offset) : 0,
      },
    );
    return {
      items: items.map((doc) => toPodcastResponse(doc, this.baseUrl)),
      total,
    };
  }

  @Get(':podcastId')
  @Public()
  async getById(@Param('podcastId') podcastId: string) {
    const doc = await this.podcastsService.findByIdOrThrow(podcastId);
    if (doc.status !== 'published') {
      throw new NotFoundException('Podcast not found');
    }
    return toPodcastResponse(doc, this.baseUrl);
  }

  @Patch(':podcastId')
  @UseGuards(JwtAuthGuard, CreatorRoleGuard)
  @UseInterceptors(
    FileInterceptor('cover', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async update(
    @Req() req: Request & { user: UserDocument },
    @Param('podcastId') podcastId: string,
    @Body() dto: UpdatePodcastDto,
    @UploadedFile() cover?: Express.Multer.File,
  ) {
    const doc = await this.podcastsService.update(podcastId, req.user._id, {
      dto,
      cover: cover
        ? { buffer: cover.buffer, mimetype: cover.mimetype, size: cover.size }
        : undefined,
    });
    this.rssService.invalidateCache(podcastId);
    return toPodcastResponse(doc, this.baseUrl);
  }

  @Delete(':podcastId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, CreatorRoleGuard)
  async delete(
    @Req() req: Request & { user: UserDocument },
    @Param('podcastId') podcastId: string,
  ) {
    await this.podcastsService.delete(podcastId, req.user._id);
    this.rssService.invalidateCache(podcastId);
  }

  @Get(':podcastId/rss')
  @Public()
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  async getRss(@Param('podcastId') podcastId: string): Promise<string> {
    const podcast = await this.podcastsService.findPublishedById(podcastId);
    if (!podcast) {
      throw new NotFoundException('Podcast not found');
    }

    const episodes =
      await this.episodesService.findPublishedByPodcast(podcastId);
    const items = episodes.map((ep) => ({
      title: ep.title,
      description: ep.description ?? undefined,
      audioUrl: ep.audioUrl,
      audioLength: 0,
      publishedAt:
        ep.publishedAt ?? (ep as { createdAt?: Date }).createdAt ?? new Date(),
      guid: ep._id.toString(),
      duration: ep.duration,
    }));
    return this.rssService.generateFeed(podcast, items);
  }
}
