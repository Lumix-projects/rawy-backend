import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BookmarkDocument = Bookmark & Document;

@Schema({ timestamps: false })
export class Bookmark {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Episode', required: true })
  episodeId!: Types.ObjectId;

  @Prop({ required: true, default: () => new Date() })
  createdAt!: Date;
}

export const BookmarkSchema = SchemaFactory.createForClass(Bookmark);

BookmarkSchema.index({ userId: 1, episodeId: 1 }, { unique: true });
BookmarkSchema.index({ userId: 1 });
