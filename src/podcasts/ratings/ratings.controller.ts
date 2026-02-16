import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ListenerOrCreatorGuard } from '../../auth/guards/listener-creator.guard';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UserDocument } from '../../users/schemas/user.schema';

@Controller('podcasts')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post(':podcastId/ratings')
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  async create(
    @Req() req: Request & { user: UserDocument },
    @Param('podcastId') podcastId: string,
    @Body() dto: CreateRatingDto,
  ) {
    const doc = await this.ratingsService.createOrUpdate(
      podcastId,
      req.user._id,
      dto,
    );
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      stars: doc.stars,
      reviewText: doc.reviewText ?? null,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  @Get(':podcastId/ratings')
  @Public()
  async getRatings(
    @Param('podcastId') podcastId: string,
    @Query('limit') limit?: number,
  ) {
    return this.ratingsService.getRatings(podcastId, {
      limit: limit ? Number(limit) : undefined,
    });
  }
}
