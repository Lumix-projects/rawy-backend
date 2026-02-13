import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VerificationTokenDocument = VerificationToken & Document;

@Schema({ timestamps: true })
export class VerificationToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['email_verification', 'password_reset'] })
  type!: 'email_verification' | 'password_reset';

  @Prop({ required: true, unique: true })
  token!: string;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const VerificationTokenSchema =
  SchemaFactory.createForClass(VerificationToken);

VerificationTokenSchema.index({ token: 1 }, { unique: true });
VerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL
