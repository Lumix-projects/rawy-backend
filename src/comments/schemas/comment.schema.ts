import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommentDocument = Comment & Document;

@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['episode', 'podcast'] })
  targetType!: string;

  @Prop({ type: Types.ObjectId, required: true })
  targetId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Comment', default: null })
  parentId?: Types.ObjectId | null;

  @Prop({ required: true })
  text!: string;

  @Prop({ required: true, default: 0 })
  likesCount!: number;

  @Prop({ required: true, default: 0 })
  repliesCount!: number;

  @Prop({ required: true, default: false })
  isDeleted!: boolean;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
CommentSchema.index({ userId: 1, targetType: 1, targetId: 1 });
