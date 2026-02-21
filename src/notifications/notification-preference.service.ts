import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  NotificationPreference,
  NotificationPreferenceDocument,
} from './schemas/notification-preference.schema';
import { NotificationType } from './schemas/notification.schema';

type PrefFields = keyof Omit<
  NotificationPreference,
  'userId' | 'createdAt' | 'updatedAt'
>;
const TYPE_TO_FIELD: Record<NotificationType, PrefFields> = {
  new_episode: 'newEpisode',
  milestone: 'milestone',
  review: 'review',
  system: 'system',
  new_follower: 'newFollower',
};

@Injectable()
export class NotificationPreferenceService {
  constructor(
    @InjectModel(NotificationPreference.name)
    private readonly prefModel: Model<NotificationPreferenceDocument>,
  ) {}

  async isEnabledFor(
    userId: Types.ObjectId,
    type: NotificationType,
  ): Promise<boolean> {
    const doc = await this.prefModel.findOne({ userId }).lean().exec();
    const field = TYPE_TO_FIELD[type];
    return doc?.[field] ?? true;
  }

  async getPreferences(
    userId: Types.ObjectId,
  ): Promise<{
    newEpisode: boolean;
    milestone: boolean;
    review: boolean;
    system: boolean;
    newFollower: boolean;
  }> {
    const doc = await this.prefModel.findOne({ userId }).lean().exec();
    return {
      newEpisode: doc?.newEpisode ?? true,
      milestone: doc?.milestone ?? true,
      review: doc?.review ?? true,
      system: doc?.system ?? true,
      newFollower: doc?.newFollower ?? true,
    };
  }

  async updatePreferences(
    userId: Types.ObjectId,
    prefs: Partial<{
      newEpisode: boolean;
      milestone: boolean;
      review: boolean;
      system: boolean;
      newFollower: boolean;
    }>,
  ): Promise<NotificationPreferenceDocument> {
    const updates: Record<string, boolean> = {};
    if (prefs.newEpisode !== undefined) updates.newEpisode = prefs.newEpisode;
    if (prefs.milestone !== undefined) updates.milestone = prefs.milestone;
    if (prefs.review !== undefined) updates.review = prefs.review;
    if (prefs.system !== undefined) updates.system = prefs.system;
    if (prefs.newFollower !== undefined) updates.newFollower = prefs.newFollower;

    if (Object.keys(updates).length === 0) {
      const existing = await this.prefModel.findOne({ userId }).exec();
      return (
        existing ??
        (await this.prefModel.create({
          userId,
          newEpisode: true,
          milestone: true,
          review: true,
          system: true,
          newFollower: true,
        }))
      );
    }

    const doc = await this.prefModel
      .findOneAndUpdate(
        { userId },
        { $set: updates },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
    return doc;
  }
}
