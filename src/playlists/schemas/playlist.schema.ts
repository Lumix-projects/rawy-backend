import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PlaylistDocument = Playlist & Document;

@Schema({ timestamps: true })
export class Playlist {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, minlength: 1, maxlength: 100 })
  name!: string;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Episode' }],
    required: true,
    default: [],
  })
  episodeIds!: Types.ObjectId[];

  @Prop({ default: () => new Date() })
  createdAt!: Date;

  @Prop({ default: () => new Date() })
  updatedAt!: Date;
}

export const PlaylistSchema = SchemaFactory.createForClass(Playlist);

PlaylistSchema.index({ userId: 1 });
