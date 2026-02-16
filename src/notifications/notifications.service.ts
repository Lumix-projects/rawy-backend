import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';
import { NotificationPreferenceService } from './notification-preference.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  static readonly MILESTONES = [10, 100, 1000, 10000, 100000];

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly notificationPreferenceService: NotificationPreferenceService,
  ) {}

  async create(
    userId: Types.ObjectId,
    type: NotificationType,
    title: string,
    options?: { body?: string; refType?: string; refId?: Types.ObjectId },
  ): Promise<NotificationDocument | null> {
    const enabled = await this.notificationPreferenceService.isEnabledFor(
      userId,
      type,
    );
    if (!enabled) {
      return null;
    }

    const doc = await this.notificationModel.create({
      userId,
      type,
      title,
      body: options?.body ?? null,
      refType: options?.refType ?? null,
      refId: options?.refId ?? null,
      read: false,
    });
    this.logger.log(
      `Notification created id=${doc._id} userId=${userId} type=${type}`,
    );
    return doc;
  }

  async notifyNewEpisode(
    subscriberUserIds: Types.ObjectId[],
    episodeId: string,
    episodeTitle: string,
    podcastTitle: string,
  ): Promise<void> {
    const body = `${podcastTitle}: ${episodeTitle}`;
    for (const uid of subscriberUserIds) {
      await this.create(uid, 'new_episode', `New episode: ${episodeTitle}`, {
        body,
        refType: 'episode',
        refId: new Types.ObjectId(episodeId),
      });
    }
    if (subscriberUserIds.length > 0) {
      this.logger.log(
        `Notified ${subscriberUserIds.length} subscribers for new episode ${episodeId}`,
      );
    }
  }

  async notifyMilestone(
    creatorId: Types.ObjectId,
    podcastId: string,
    subscriberCount: number,
    podcastTitle: string,
  ): Promise<void> {
    if (!NotificationsService.MILESTONES.includes(subscriberCount)) {
      return;
    }
    await this.create(
      creatorId,
      'milestone',
      `Milestone: ${subscriberCount} subscribers for "${podcastTitle}"`,
      {
        body: `Your podcast "${podcastTitle}" reached ${subscriberCount} subscribers!`,
        refType: 'podcast',
        refId: new Types.ObjectId(podcastId),
      },
    );
  }

  async notifyReview(
    creatorId: Types.ObjectId,
    podcastId: string,
    podcastTitle: string,
    stars: number,
    hasReviewText: boolean,
  ): Promise<void> {
    const title = hasReviewText
      ? `New review on "${podcastTitle}" (${stars} stars)`
      : `New rating on "${podcastTitle}" (${stars} stars)`;
    await this.create(creatorId, 'review', title, {
      body: hasReviewText
        ? `Someone left a review on your podcast "${podcastTitle}".`
        : `Someone rated your podcast "${podcastTitle}" ${stars} stars.`,
      refType: 'podcast',
      refId: new Types.ObjectId(podcastId),
    });
  }

  async listForUser(
    userId: Types.ObjectId,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
    },
  ): Promise<{ items: NotificationDocument[]; total: number }> {
    const filter: Record<string, unknown> = { userId };
    if (options?.unreadOnly === true) {
      filter.read = false;
    }

    const limit = Math.min(options?.limit ?? 20, 100);
    const offset = options?.offset ?? 0;

    const [items, total] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      this.notificationModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as NotificationDocument[],
      total,
    };
  }

  async markAsRead(
    id: string,
    userId: Types.ObjectId,
  ): Promise<NotificationDocument> {
    const doc = await this.notificationModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), userId },
        { $set: { read: true } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!doc) {
      throw new NotFoundException('Notification not found');
    }
    return doc;
  }

  async markAllAsRead(userId: Types.ObjectId): Promise<number> {
    const result = await this.notificationModel
      .updateMany({ userId, read: false }, { $set: { read: true } })
      .exec();
    return result.modifiedCount;
  }
}
