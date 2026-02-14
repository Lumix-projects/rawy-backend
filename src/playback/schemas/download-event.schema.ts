import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DownloadEventDocument = DownloadEvent & Document;

@Schema({ timestamps: true })
export class DownloadEvent {
  @Prop({ type: Types.ObjectId, ref: 'Episode', required: true })
  episodeId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;
}

export const DownloadEventSchema = SchemaFactory.createForClass(DownloadEvent);

DownloadEventSchema.index({ episodeId: 1 });
DownloadEventSchema.index({ userId: 1 });
