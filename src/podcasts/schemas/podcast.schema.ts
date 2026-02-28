import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PodcastDocument = Podcast & Document;

export type PodcastStatus = 'draft' | 'published' | 'archived';
export type EpisodeOrder = 'newest_first' | 'oldest_first';

@Schema({ timestamps: true })
export class Podcast {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, minlength: 1, maxlength: 200 })
  title!: string;

  @Prop({ type: String, default: null })
  description!: string | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Category' }], default: [] })
  categoryIds!: Types.ObjectId[];

  @Prop({ required: true })
  coverUrl!: string;

  @Prop({ required: true })
  language!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ required: true, enum: ['draft', 'published', 'archived'] })
  status!: PodcastStatus;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;

  @Prop({ required: true, default: false })
  explicit!: boolean;

  @Prop({ required: true, enum: ['newest_first', 'oldest_first'] })
  episodeOrder!: EpisodeOrder;

  @Prop({ type: String, default: null })
  websiteUrl!: string | null;
}

export const PodcastSchema = SchemaFactory.createForClass(Podcast);

PodcastSchema.index({ ownerId: 1 });
PodcastSchema.index({ status: 1 });
PodcastSchema.index({ categoryIds: 1 });
PodcastSchema.index({ archivedAt: 1 });
PodcastSchema.index(
  { title: 'text', description: 'text', tags: 'text' },
  { weights: { title: 3, description: 2, tags: 1 } },
);
