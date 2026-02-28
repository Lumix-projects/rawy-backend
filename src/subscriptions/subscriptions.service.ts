import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Subscription,
  SubscriptionDocument,
} from './schemas/subscription.schema';
import { PodcastsService } from '../podcasts/podcasts.service';
import { PodcastDocument } from '../podcasts/schemas/podcast.schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
    @Inject(forwardRef(() => PodcastsService))
    private readonly podcastsService: PodcastsService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async subscribe(userId: Types.ObjectId, podcastId: string): Promise<void> {
    const podcast = await this.podcastsService.findById(podcastId);
    if (!podcast) {
      throw new NotFoundException('Podcast not found');
    }
    if (podcast.status !== 'published') {
      throw new BadRequestException('Can only subscribe to published podcasts');
    }

    const podcastObjId = new Types.ObjectId(podcastId);
    const existing = await this.subscriptionModel
      .findOne({ userId, podcastId: podcastObjId })
      .exec();
    if (existing) {
      throw new BadRequestException('Already subscribed');
    }

    await this.subscriptionModel.create({
      userId,
      podcastId: podcastObjId,
    });

    const count =
      await this.getSubscriberCountByPodcast(podcastId);
    this.notificationsService
      .notifyMilestone(
        podcast.ownerId,
        podcastId,
        count,
        podcast.title,
      )
      .catch(() => {});
  }

  async unsubscribe(userId: Types.ObjectId, podcastId: string): Promise<void> {
    const result = await this.subscriptionModel
      .deleteOne({
        userId,
        podcastId: new Types.ObjectId(podcastId),
      })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException('Subscription not found');
    }
  }

  async getSubscriberUserIdsByPodcast(
    podcastId: string,
  ): Promise<Types.ObjectId[]> {
    const subs = await this.subscriptionModel
      .find({ podcastId: new Types.ObjectId(podcastId) })
      .select('userId')
      .lean()
      .exec();
    return subs.map((s) => s.userId as Types.ObjectId);
  }

  async getSubscriberCountByPodcast(podcastId: string): Promise<number> {
    return this.subscriptionModel
      .countDocuments({ podcastId: new Types.ObjectId(podcastId) })
      .exec();
  }

  async listSubscriptions(
    userId: Types.ObjectId,
    options?: { limit?: number; offset?: number },
  ): Promise<{ items: PodcastDocument[]; total: number }> {
    const limit = Math.min(options?.limit ?? 50, 100);
    const offset = options?.offset ?? 0;

    const subs = await this.subscriptionModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate({
        path: 'podcastId',
        populate: [
          { path: 'categoryIds', select: 'slug name' },
        ],
      })
      .exec();

    const podcasts: PodcastDocument[] = [];
    for (const sub of subs) {
      const podcastRaw = sub.podcastId;
      const podcast =
        podcastRaw && typeof podcastRaw === 'object' && '_id' in podcastRaw
          ? (podcastRaw as unknown as PodcastDocument)
          : null;
      if (podcast) {
        podcasts.push(podcast);
      }
    }

    const total = await this.subscriptionModel
      .countDocuments({ userId })
      .exec();

    return {
      items: podcasts,
      total,
    };
  }
}
