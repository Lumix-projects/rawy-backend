import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FollowDocument = Follow & Document;

@Schema({ timestamps: true })
export class Follow {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    followerId!: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    followingId!: Types.ObjectId;
}

export const FollowSchema = SchemaFactory.createForClass(Follow);

FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
FollowSchema.index({ followingId: 1 });
