import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserDocument } from '../schemas/user.schema';

/** Swagger schema for user response */
export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: ['listener', 'creator', 'admin'] })
  role!: string;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  bio!: string | null;

  @ApiPropertyOptional({ nullable: true })
  socialLinks!: { website?: string; twitter?: string; instagram?: string } | null;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    properties: { showName: { type: 'string' }, categoryId: { type: 'string' } },
  })
  creatorProfile!: { showName: string; categoryId: string } | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  bio: string | null;
  socialLinks: {
    website?: string;
    twitter?: string;
    instagram?: string;
  } | null;
  emailVerified: boolean;
  creatorProfile?: {
    showName: string;
    categoryId: string;
  } | null;
  createdAt: string;
}

export function toUserResponse(user: UserDocument): UserResponse {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    socialLinks: user.socialLinks
      ? {
          website: user.socialLinks.website,
          twitter: user.socialLinks.twitter,
          instagram: user.socialLinks.instagram,
        }
      : null,
    emailVerified: user.emailVerified,
    creatorProfile: user.creatorProfile
      ? {
          showName: user.creatorProfile.showName,
          categoryId: user.creatorProfile.category,
        }
      : null,
    createdAt: (user as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
  };
}
