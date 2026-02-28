import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EpisodeDocument = Episode & Document;

export type EpisodeStatus = 'draft' | 'scheduled' | 'published' | 'archived';
export type AudioFormat = 'mp3' | 'wav' | 'm4a';

export interface ChapterMarker {
  title: string;
  startSeconds: number;
}

@Schema({ timestamps: true })
export class Episode {
  @Prop({ type: Types.ObjectId, ref: 'Podcast', required: true })
  podcastId!: Types.ObjectId;

  @Prop({ required: true, minlength: 1, maxlength: 200 })
  title!: string;

  @Prop({ type: String, default: null })
  description!: string | null;

  @Prop({ required: true })
  duration!: number;

  @Prop({ type: Number, default: null })
  seasonNumber!: number | null;

  @Prop({ type: Number, default: null })
  episodeNumber!: number | null;

  @Prop({ type: String, default: null })
  showNotes!: string | null;

  @Prop({ required: true })
  audioUrl!: string;

  @Prop({ required: true, enum: ['mp3', 'wav', 'm4a'] })
  audioFormat!: AudioFormat;

  @Prop({ type: String, default: null })
  coverUrl!: string | null;

  @Prop({ type: String, default: null })
  transcription!: string | null;

  @Prop({
    type: [{ title: String, startSeconds: Number }],
    default: [],
  })
  chapterMarkers!: ChapterMarker[];

  @Prop({
    required: true,
    enum: ['draft', 'scheduled', 'published', 'archived'],
  })
  status!: EpisodeStatus;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Category' }], default: [] })
  categoryIds!: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  publishedAt!: Date | null;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export const EpisodeSchema = SchemaFactory.createForClass(Episode);

EpisodeSchema.index({ podcastId: 1 });
EpisodeSchema.index({ status: 1 });
EpisodeSchema.index({ publishedAt: 1 });
EpisodeSchema.index({ archivedAt: 1 });
EpisodeSchema.index(
  { title: 'text', description: 'text', showNotes: 'text' },
  { weights: { title: 3, description: 2, showNotes: 1 } },
);
