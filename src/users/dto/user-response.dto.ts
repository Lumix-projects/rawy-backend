import { UserDocument } from '../schemas/user.schema';

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
