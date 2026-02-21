import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersRepository } from './users.repository';
import { UserDocument } from './schemas/user.schema';
import { S3UploadService } from '../upload/upload.service';
import { CategoriesService } from '../categories/categories.service';
import * as bcrypt from 'bcrypt';

export interface UpgradeCreatorInput {
  showName: string;
  categoryId: string;
  avatar?: { buffer: Buffer; mimetype: string; size: number };
}

export interface UpdateProfileInput {
  bio?: string;
  website?: string;
  twitter?: string;
  instagram?: string;
  isPrivate?: boolean;
  avatar?: { buffer: Buffer; mimetype: string; size: number };
}

export interface UpdateCreatorProfileInput {
  showName?: string;
  categoryId?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly s3UploadService: S3UploadService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async findById(id: string | Types.ObjectId): Promise<UserDocument | null> {
    return this.usersRepository.findById(id);
  }

  async updateProfile(
    userId: string | Types.ObjectId,
    input: UpdateProfileInput,
    creatorInput?: UpdateCreatorProfileInput,
  ): Promise<UserDocument> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const updates: Record<string, unknown> = {};

    if (input.bio !== undefined) {
      updates.bio = input.bio.trim() || null;
    }

    if (
      input.website !== undefined ||
      input.twitter !== undefined ||
      input.instagram !== undefined
    ) {
      const socialLinks: {
        website?: string;
        twitter?: string;
        instagram?: string;
      } = {};
      socialLinks.website =
        input.website !== undefined
          ? input.website.trim() || undefined
          : user.socialLinks?.website;
      socialLinks.twitter =
        input.twitter !== undefined
          ? input.twitter.trim() || undefined
          : user.socialLinks?.twitter;
      socialLinks.instagram =
        input.instagram !== undefined
          ? input.instagram.trim() || undefined
          : user.socialLinks?.instagram;
      updates.socialLinks = socialLinks;
    }

    if (input.avatar) {
      const result = await this.s3UploadService.uploadAvatar(input.avatar);
      updates.avatarUrl = result?.url ?? null;
    }

    if (input.isPrivate !== undefined) {
      updates.isPrivate = input.isPrivate;
    }

    if (creatorInput && user.creatorProfile) {
      if (creatorInput.showName !== undefined) {
        updates['creatorProfile.showName'] = creatorInput.showName.trim();
      }
      if (creatorInput.categoryId !== undefined) {
        const category = await this.categoriesService.findById(
          creatorInput.categoryId,
        );
        if (!category) {
          throw new BadRequestException('Invalid category');
        }
        updates['creatorProfile.category'] = category._id.toString();
      }
    }

    const updatedUser = await this.usersRepository.updateById(userId, updates);
    if (!updatedUser) {
      throw new BadRequestException('User not found');
    }
    return updatedUser;
  }

  async upgradeToCreator(
    userId: string | Types.ObjectId,
    input: UpgradeCreatorInput,
  ): Promise<UserDocument> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.role !== 'listener') {
      throw new ForbiddenException('Already a Creator or Admin');
    }

    const category = await this.categoriesService.findById(input.categoryId);
    if (!category) {
      throw new BadRequestException('Invalid category');
    }

    let avatarUrl: string | null = null;
    if (input.avatar) {
      const result = await this.s3UploadService.uploadAvatar(input.avatar);
      avatarUrl = result?.url ?? null;
    }

    const updates: Record<string, unknown> = {
      role: 'creator',
      creatorProfile: {
        showName: input.showName.trim(),
        category: category._id.toString(),
      },
    };

    if (avatarUrl !== null) {
      updates.avatarUrl = avatarUrl;
    }

    const updatedUser = await this.usersRepository.updateById(userId, updates);
    if (!updatedUser) {
      throw new BadRequestException('User not found');
    }

    this.logger.log({
      event: 'auth.upgrade',
      userId: updatedUser._id.toString(),
      email: updatedUser.email,
      role: 'creator',
    });

    return updatedUser;
  }

  async changePassword(
    userId: string | Types.ObjectId,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Account does not have a password set');
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new ForbiddenException('Current password is incorrect');
    }

    const SALT_ROUNDS = 12;
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.usersRepository.updateById(userId, { passwordHash: newHash });
  }
}
