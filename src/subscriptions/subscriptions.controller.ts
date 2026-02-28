import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Query,
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
import { SubscriptionsService } from './subscriptions.service';
import { UserDocument } from '../users/schemas/user.schema';
import { PodcastDocument } from '../podcasts/schemas/podcast.schema';

function toPodcastResponse(
  doc: PodcastDocument,
  baseUrl: string,
): Record<string, unknown> {
  const categories = (doc.categoryIds as unknown[])?.map((cat) => {
    if (cat && typeof cat === 'object' && 'slug' in cat) {
      return {
        id: (cat as { _id?: Types.ObjectId })._id?.toString(),
        slug: (cat as { slug: string }).slug,
        name: (cat as unknown as { name: string }).name,
      };
    }
    return cat?.toString();
  }) ?? [];
  const timestamps = doc as { createdAt?: Date; updatedAt?: Date };
  return {
    id: doc._id.toString(),
    title: doc.title,
    description: doc.description,
    categories,
    coverUrl: doc.coverUrl,
    language: doc.language,
    tags: doc.tags,
    status: doc.status,
    explicit: doc.explicit,
    episodeOrder: doc.episodeOrder,
    websiteUrl: doc.websiteUrl,
    ownerId: doc.ownerId.toString(),
    rssUrl: `${baseUrl}/podcasts/${doc._id.toString()}/rss`,
    episodeCount: 0,
    subscriberCount: 0,
    createdAt: timestamps.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: timestamps.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

class SubscribeDto {
  @IsString()
  podcastId!: string;
}

class ListQueryDto {
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsNumberString()
  offset?: string;
}

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
export class SubscriptionsController {
  private readonly baseUrl: string;

  constructor(private readonly subscriptionsService: SubscriptionsService) {
    const port = process.env.PORT ?? '3000';
    this.baseUrl =
      process.env.API_BASE_URL ?? `http://localhost:${port}/api/v1`;
  }

  @Post()
  async subscribe(
    @Req() req: Request & { user: UserDocument },
    @Body() dto: SubscribeDto,
  ) {
    await this.subscriptionsService.subscribe(req.user._id, dto.podcastId);
    return { message: 'Subscribed' };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Req() req: Request & { user: UserDocument },
    @Query('podcastId') podcastId: string,
  ) {
    if (!podcastId || typeof podcastId !== 'string') {
      throw new BadRequestException('podcastId query is required');
    }
    await this.subscriptionsService.unsubscribe(req.user._id, podcastId);
  }

  @Get()
  async list(
    @Req() req: Request & { user: UserDocument },
    @Query() query: ListQueryDto,
  ) {
    const { items, total } = await this.subscriptionsService.listSubscriptions(
      req.user._id,
      {
        limit: query.limit ? Number(query.limit) : 50,
        offset: query.offset ? Number(query.offset) : 0,
      },
    );
    return {
      items: items.map((doc) => toPodcastResponse(doc, this.baseUrl)),
      total,
    };
  }
}
