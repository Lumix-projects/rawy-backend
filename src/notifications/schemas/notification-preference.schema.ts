import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationPreferenceDocument = NotificationPreference & Document;

@Schema({ timestamps: true })
export class NotificationPreference {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId!: Types.ObjectId;

  @Prop({ type: Boolean, default: true })
  newEpisode!: boolean;

  @Prop({ type: Boolean, default: true })
  milestone!: boolean;

  @Prop({ type: Boolean, default: true })
  review!: boolean;

  @Prop({ type: Boolean, default: true })
  system!: boolean;
}

export const NotificationPreferenceSchema =
  SchemaFactory.createForClass(NotificationPreference);
