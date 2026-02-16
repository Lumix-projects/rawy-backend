import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ListeningProgressDocument = ListeningProgress & Document;

@Schema({ timestamps: false })
export class ListeningProgress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Episode', required: true })
  episodeId!: Types.ObjectId;

  @Prop({ required: true })
  positionSeconds!: number;

  @Prop({ required: true, default: () => new Date() })
  updatedAt!: Date;
}

export const ListeningProgressSchema =
  SchemaFactory.createForClass(ListeningProgress);

ListeningProgressSchema.index({ userId: 1, episodeId: 1 }, { unique: true });
ListeningProgressSchema.index({ userId: 1 });
