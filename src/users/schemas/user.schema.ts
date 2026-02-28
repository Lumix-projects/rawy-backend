import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ _id: false })
export class CreatorProfile {
  @Prop({ required: true })
  showName!: string;
}

const CreatorProfileSchema = SchemaFactory.createForClass(CreatorProfile);

@Schema({ _id: false })
export class SocialLinks {
  @Prop()
  website?: string;

  @Prop()
  twitter?: string;

  @Prop()
  instagram?: string;
}

const SocialLinksSchema = SchemaFactory.createForClass(SocialLinks);

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, minlength: 3, maxlength: 30 })
  username!: string;

  @Prop({ required: true, unique: true })
  email!: string;

  @Prop({ type: String, default: null })
  passwordHash!: string | null;

  @Prop({ required: true, enum: ['listener', 'creator', 'admin'] })
  role!: 'listener' | 'creator' | 'admin';

  @Prop({ type: String, default: null })
  avatarUrl!: string | null;

  @Prop({ type: String, default: null })
  bio!: string | null;

  @Prop({ type: SocialLinksSchema, default: null })
  socialLinks!: SocialLinks | null;

  @Prop({ required: true, default: false })
  emailVerified!: boolean;

  @Prop({ type: String, default: null })
  googleId!: string | null;

  @Prop({ type: CreatorProfileSchema, default: null })
  creatorProfile!: CreatorProfile | null;

  @Prop({ type: Boolean, default: false })
  isPrivate!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Partial unique index: only enforces uniqueness when googleId is a real string (not null).
UserSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
);
