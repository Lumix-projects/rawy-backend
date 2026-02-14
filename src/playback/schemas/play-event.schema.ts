import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PlayEventDocument = PlayEvent & Document;

@Schema({ timestamps: true })
export class PlayEvent {
  @Prop({ type: Types.ObjectId, ref: 'Episode', required: true })
  episodeId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Podcast', required: true })
  podcastId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId!: Types.ObjectId | null;

  @Prop({ required: true })
  listenedSeconds!: number;

  @Prop({ type: String, default: null })
  deviceInfo!: string | null;

  @Prop({ type: String, default: null })
  geoCountry!: string | null;
}

export const PlayEventSchema = SchemaFactory.createForClass(PlayEvent);

PlayEventSchema.index({ episodeId: 1 });
PlayEventSchema.index({ podcastId: 1 });
PlayEventSchema.index({ userId: 1 });
PlayEventSchema.index({ createdAt: 1 });
