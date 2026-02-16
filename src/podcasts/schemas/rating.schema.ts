import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RatingDocument = Rating & Document;

@Schema({ timestamps: true })
export class Rating {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Podcast', required: true })
  podcastId!: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  stars!: number;

  @Prop({ type: String, default: null })
  reviewText!: string | null;

  @Prop({ required: true, default: () => new Date() })
  createdAt!: Date;

  @Prop({ required: true, default: () => new Date() })
  updatedAt!: Date;
}

export const RatingSchema = SchemaFactory.createForClass(Rating);

RatingSchema.index({ userId: 1, podcastId: 1 }, { unique: true });
RatingSchema.index({ podcastId: 1 });
