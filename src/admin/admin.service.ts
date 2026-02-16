import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  FeaturedPodcast,
  FeaturedPodcastDocument,
} from './schemas/featured-podcast.schema';
import { PodcastsService } from '../podcasts/podcasts.service';
import { PodcastDocument } from '../podcasts/schemas/podcast.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(FeaturedPodcast.name)
    private readonly featuredPodcastModel: Model<FeaturedPodcastDocument>,
    private readonly podcastsService: PodcastsService,
  ) {}

  async listFeaturedPodcasts(): Promise<{
    items: PodcastDocument[];
    total: number;
  }> {
    const featured = await this.featuredPodcastModel
      .find()
      .sort({ order: 1 })
      .exec();

    if (featured.length === 0) {
      return { items: [], total: 0 };
    }

    const podcastIds = featured.map((f) => f.podcastId);
    const podcasts = await this.podcastsService.findByIds(
      podcastIds,
      'published',
    );
    const podcastMap = new Map(
      podcasts.map((p) => [p._id.toString(), p]),
    );

    const ordered = featured
      .map((f) => podcastMap.get(f.podcastId.toString()))
      .filter(Boolean) as PodcastDocument[];

    return { items: ordered, total: ordered.length };
  }

  async addFeaturedPodcast(
    podcastId: string,
    order?: number,
  ): Promise<FeaturedPodcastDocument> {
    const podcast = await this.podcastsService.findById(podcastId);
    if (!podcast) {
      throw new NotFoundException('Podcast not found');
    }
    if (podcast.status !== 'published') {
      throw new BadRequestException(
        'Only published podcasts can be featured',
      );
    }

    const existing = await this.featuredPodcastModel
      .findOne({ podcastId: new Types.ObjectId(podcastId) })
      .exec();
    if (existing) {
      throw new ConflictException('Podcast is already featured');
    }

    let orderNum = order;
    if (orderNum === undefined) {
      const max = await this.featuredPodcastModel
        .findOne()
        .sort({ order: -1 })
        .select('order')
        .lean()
        .exec();
      orderNum = (max?.order ?? -1) + 1;
    }

    return this.featuredPodcastModel.create({
      podcastId: new Types.ObjectId(podcastId),
      order: orderNum,
    });
  }

  async removeFeaturedPodcast(podcastId: string): Promise<void> {
    const result = await this.featuredPodcastModel
      .deleteOne({ podcastId: new Types.ObjectId(podcastId) })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException('Featured podcast not found');
    }
  }

  async reorderFeaturedPodcast(
    podcastId: string,
    order: number,
  ): Promise<FeaturedPodcastDocument> {
    const doc = await this.featuredPodcastModel
      .findOneAndUpdate(
        { podcastId: new Types.ObjectId(podcastId) },
        { $set: { order } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!doc) {
      throw new NotFoundException('Featured podcast not found');
    }
    return doc;
  }
}
