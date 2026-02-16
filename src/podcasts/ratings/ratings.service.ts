import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Rating, RatingDocument } from '../schemas/rating.schema';
import { PodcastsService } from '../podcasts.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CreateRatingDto } from './dto/create-rating.dto';

@Injectable()
export class RatingsService {
  constructor(
    @InjectModel(Rating.name)
    private readonly ratingModel: Model<RatingDocument>,
    private readonly podcastsService: PodcastsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createOrUpdate(
    podcastId: string,
    userId: Types.ObjectId,
    dto: CreateRatingDto,
  ): Promise<RatingDocument> {
    const podcast = await this.podcastsService.findById(podcastId);
    if (!podcast) {
      throw new NotFoundException('Podcast not found');
    }
    if (podcast.status !== 'published') {
      throw new NotFoundException('Podcast not found');
    }

    const doc = await this.ratingModel
      .findOneAndUpdate(
        {
          userId,
          podcastId: new Types.ObjectId(podcastId),
        },
        {
          $set: {
            stars: dto.stars,
            reviewText: dto.reviewText ?? null,
            updatedAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();

    if (!podcast.ownerId.equals(userId)) {
      this.notificationsService
        .notifyReview(
          podcast.ownerId,
          podcastId,
          podcast.title,
          dto.stars,
          !!(dto.reviewText?.trim()),
        )
        .catch(() => {});
    }

    return doc;
  }

  async getRatings(
    podcastId: string,
    options?: { limit?: number },
  ): Promise<{
    averageStars: number;
    totalCount: number;
    ratings: Array<{
      id: string;
      userId: string;
      stars: number;
      reviewText: string | null;
      createdAt: string;
    }>;
  }> {
    const podcast = await this.podcastsService.findById(podcastId);
    if (!podcast) {
      throw new NotFoundException('Podcast not found');
    }

    const limit = Math.min(options?.limit ?? 20, 100);

    const [aggregated, ratings] = await Promise.all([
      this.ratingModel
        .aggregate<{ averageStars: number; totalCount: number }>([
          { $match: { podcastId: new Types.ObjectId(podcastId) } },
          {
            $group: {
              _id: null,
              averageStars: { $avg: '$stars' },
              totalCount: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              averageStars: { $round: ['$averageStars', 2] },
              totalCount: 1,
            },
          },
        ])
        .exec(),
      this.ratingModel
        .find({ podcastId: new Types.ObjectId(podcastId) })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const agg = aggregated[0];
    const averageStars = agg?.averageStars ?? 0;
    const totalCount = agg?.totalCount ?? 0;

    return {
      averageStars,
      totalCount,
      ratings: ratings.map((r) => ({
        id: r._id.toString(),
        userId: r.userId.toString(),
        stars: r.stars,
        reviewText: r.reviewText ?? null,
        createdAt:
          (r as { createdAt?: Date }).createdAt?.toISOString?.() ??
          new Date().toISOString(),
      })),
    };
  }
}
