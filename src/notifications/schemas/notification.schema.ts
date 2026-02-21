import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export type NotificationType =
  | 'new_episode'
  | 'milestone'
  | 'review'
  | 'system'
  | 'new_follower';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['new_episode', 'milestone', 'review', 'system', 'new_follower'],
  })
  type!: NotificationType;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: String, default: null })
  body!: string | null;

  @Prop({ type: String, default: null })
  refType!: string | null;

  @Prop({ type: Types.ObjectId, default: null })
  refId!: Types.ObjectId | null;

  @Prop({ required: true, default: false })
  read!: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1 });
NotificationSchema.index({ read: 1 });
NotificationSchema.index({ createdAt: -1 });
