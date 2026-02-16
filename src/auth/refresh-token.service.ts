import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import * as crypto from 'node:crypto';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersRepository } from '../users/users.repository';

export interface TokenPair {
  plainToken: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly usersRepository: UsersRepository,
    private readonly configService: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseExpiryToMs(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * (multipliers[unit] ?? multipliers.d);
  }

  async create(
    userId: Types.ObjectId,
    deviceInfo?: string,
  ): Promise<TokenPair> {
    const plainToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(plainToken);
    const expiryStr = this.configService.get('JWT_REFRESH_EXPIRY', '7d');
    const expiresAt = new Date(Date.now() + this.parseExpiryToMs(expiryStr));

    await this.refreshTokenModel.create({
      userId,
      token: tokenHash,
      expiresAt,
      deviceInfo: deviceInfo ?? null,
    });

    return { plainToken, tokenHash, expiresAt };
  }

  async validateAndRotate(plainToken: string): Promise<{
    user: UserDocument;
    newTokenPair: TokenPair;
  }> {
    if (!plainToken || plainToken.trim().length === 0) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(plainToken.trim());
    const stored = await this.refreshTokenModel
      .findOne({ token: tokenHash })
      .exec();

    if (!stored) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.expiresAt < new Date()) {
      await this.refreshTokenModel.deleteOne({ _id: stored._id });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersRepository.findById(stored.userId);
    if (!user) {
      await this.refreshTokenModel.deleteOne({ _id: stored._id });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.refreshTokenModel.deleteOne({ _id: stored._id });

    const newTokenPair = await this.create(
      user._id,
      stored.deviceInfo ?? undefined,
    );

    return { user, newTokenPair };
  }
}
