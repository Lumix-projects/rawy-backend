import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LikeDocument = Like & Document;

@Schema({ timestamps: true })
export class Like {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['comment', 'episode', 'podcast'] })
  targetType!: string;

  @Prop({ type: Types.ObjectId, required: true })
  targetId!: Types.ObjectId;
}

export const LikeSchema = SchemaFactory.createForClass(Like);
LikeSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });
LikeSchema.index({ targetType: 1, targetId: 1 });
