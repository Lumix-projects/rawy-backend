import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type QueueDocument = Queue & Document;

/**
 * Optional Queue entity for cross-device sync.
 * One queue per user; stores ordered episode IDs.
 * Sleep timer is client-side only.
 */
@Schema({ timestamps: true })
export class Queue {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Episode' }],
    required: true,
    default: [],
  })
  episodeIds!: Types.ObjectId[];
}

export const QueueSchema = SchemaFactory.createForClass(Queue);

QueueSchema.index({ userId: 1 }, { unique: true });
