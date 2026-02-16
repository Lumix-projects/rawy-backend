import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeaturedPodcastDocument = FeaturedPodcast & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class FeaturedPodcast {
  @Prop({ type: Types.ObjectId, ref: 'Podcast', required: true })
  podcastId!: Types.ObjectId;

  @Prop({ required: true })
  order!: number;
}

export const FeaturedPodcastSchema =
  SchemaFactory.createForClass(FeaturedPodcast);

FeaturedPodcastSchema.index({ order: 1 });
FeaturedPodcastSchema.index({ podcastId: 1 }, { unique: true });
