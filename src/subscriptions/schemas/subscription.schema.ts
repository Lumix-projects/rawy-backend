import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubscriptionDocument = Subscription & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Subscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Podcast', required: true })
  podcastId!: Types.ObjectId;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({ userId: 1, podcastId: 1 }, { unique: true });
SubscriptionSchema.index({ userId: 1 });
SubscriptionSchema.index({ podcastId: 1 });
