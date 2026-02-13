import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import type { Queue } from 'bull';
import { UsersRepository } from '../users/users.repository';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  VerificationToken,
  VerificationTokenDocument,
} from './schemas/verification-token.schema';
import { RegisterListenerDto } from './dto/register-listener.dto';
import { RegisterCreatorDto } from './dto/register-creator.dto';
import { VERIFICATION_EMAIL_QUEUE } from './processors/verification-email.processor';
import { PASSWORD_RESET_EMAIL_QUEUE } from './processors/password-reset.processor';
import { CategoriesService } from '../categories/categories.service';
import { S3UploadService } from '../upload/upload.service';
import { RefreshTokenService } from './refresh-token.service';

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY_HOURS = 24;
const PASSWORD_RESET_EXPIRY_HOURS = 1;

export interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly configService: ConfigService,
    private readonly categoriesService: CategoriesService,
    private readonly s3UploadService: S3UploadService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    @InjectModel(VerificationToken.name)
    private readonly verificationTokenModel: Model<VerificationTokenDocument>,
    @InjectQueue(VERIFICATION_EMAIL_QUEUE)
    private readonly verificationEmailQueue: Queue,
    @InjectQueue(PASSWORD_RESET_EMAIL_QUEUE)
    private readonly passwordResetEmailQueue: Queue,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async registerListener(dto: RegisterListenerDto): Promise<UserDocument> {
    const emailLower = dto.email.toLowerCase().trim();
    const usernameTrimmed = dto.username.trim();

    const [emailExists, usernameExists] = await Promise.all([
      this.usersRepository.existsByEmail(emailLower),
      this.usersRepository.existsByUsername(usernameTrimmed),
    ]);

    if (emailExists) {
      throw new ConflictException('Email already in use');
    }
    if (usernameExists) {
      throw new ConflictException('Username already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.usersRepository.create({
      username: usernameTrimmed,
      email: emailLower,
      passwordHash,
      role: 'listener',
      emailVerified: false,
    });

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(plainToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    await this.verificationTokenModel.create({
      userId: user._id,
      type: 'email_verification',
      token: tokenHash,
      expiresAt,
    });

    const baseUrl = this.configService.get(
      'FRONTEND_BASE_URL',
      'http://localhost:8081',
    );
    await this.verificationEmailQueue.add('send', {
      to: user.email,
      token: plainToken,
      baseUrl,
    });

    this.logger.log({
      event: 'auth.register',
      flow: 'listener',
      userId: user._id.toString(),
      email: user.email,
    });

    return user;
  }

  async registerCreator(
    dto: RegisterCreatorDto,
    avatar?: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<UserDocument> {
    const emailLower = dto.email.toLowerCase().trim();
    const usernameTrimmed = dto.username.trim();

    const category = await this.categoriesService.findById(dto.categoryId);
    if (!category) {
      throw new BadRequestException('Invalid category');
    }

    const [emailExists, usernameExists] = await Promise.all([
      this.usersRepository.existsByEmail(emailLower),
      this.usersRepository.existsByUsername(usernameTrimmed),
    ]);

    if (emailExists) {
      throw new ConflictException('Email already in use');
    }
    if (usernameExists) {
      throw new ConflictException('Username already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    let avatarUrl: string | null = null;
    if (avatar) {
      const result = await this.s3UploadService.uploadAvatar(avatar);
      avatarUrl = result?.url ?? null;
    }

    const user = await this.usersRepository.create({
      username: usernameTrimmed,
      email: emailLower,
      passwordHash,
      role: 'creator',
      emailVerified: false,
      avatarUrl,
      creatorProfile: {
        showName: dto.showName.trim(),
        category: category._id.toString(),
      },
    });

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(plainToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    await this.verificationTokenModel.create({
      userId: user._id,
      type: 'email_verification',
      token: tokenHash,
      expiresAt,
    });

    const baseUrl = this.configService.get(
      'FRONTEND_BASE_URL',
      'http://localhost:8081',
    );
    await this.verificationEmailQueue.add('send', {
      to: user.email,
      token: plainToken,
      baseUrl,
    });

    this.logger.log({
      event: 'auth.register',
      flow: 'creator',
      userId: user._id.toString(),
      email: user.email,
    });

    return user;
  }

  async forgotPassword(email: string): Promise<void> {
    const emailLower = email.toLowerCase().trim();
    const user = await this.usersRepository.findByEmail(emailLower);

    if (!user || !user.passwordHash) {
      return;
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(plainToken);
    const expiresAt = new Date();
    expiresAt.setHours(
      expiresAt.getHours() + PASSWORD_RESET_EXPIRY_HOURS,
    );

    await this.verificationTokenModel.create({
      userId: user._id,
      type: 'password_reset',
      token: tokenHash,
      expiresAt,
    });

    const baseUrl = this.configService.get(
      'FRONTEND_BASE_URL',
      'http://localhost:8081',
    );
    await this.passwordResetEmailQueue.add('send', {
      to: user.email,
      token: plainToken,
      baseUrl,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!token || token.trim().length === 0) {
      throw new BadRequestException('Invalid or expired token');
    }

    const tokenHash = this.hashToken(token.trim());
    const verificationToken = await this.verificationTokenModel
      .findOne({
        token: tokenHash,
        type: 'password_reset',
      })
      .exec();

    if (!verificationToken) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (verificationToken.expiresAt < new Date()) {
      await this.verificationTokenModel.deleteOne({
        _id: verificationToken._id,
      });
      throw new BadRequestException('Invalid or expired token');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.usersRepository.updateById(
      verificationToken.userId as Types.ObjectId,
      { passwordHash },
    );

    await this.verificationTokenModel.deleteOne({
      _id: verificationToken._id,
    });
  }

  async verifyEmail(token: string): Promise<UserDocument> {
    if (!token || token.trim().length === 0) {
      throw new BadRequestException('Invalid or expired token');
    }

    const tokenHash = this.hashToken(token.trim());
    const verificationToken = await this.verificationTokenModel
      .findOne({
        token: tokenHash,
        type: 'email_verification',
      })
      .exec();

    if (!verificationToken) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (verificationToken.expiresAt < new Date()) {
      await this.verificationTokenModel.deleteOne({ _id: verificationToken._id });
      throw new BadRequestException('Invalid or expired token');
    }

    const user = await this.usersRepository.updateById(
      verificationToken.userId as Types.ObjectId,
      { emailVerified: true },
    );

    await this.verificationTokenModel.deleteOne({ _id: verificationToken._id });

    if (!user) {
      throw new BadRequestException('Invalid or expired token');
    }

    return user;
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };
    return value * (multipliers[unit] ?? multipliers.m);
  }

  async login(
    email: string,
    password: string,
    deviceInfo?: string,
  ): Promise<TokenPairResponse> {
    const emailLower = email.toLowerCase().trim();
    const user = await this.usersRepository.findByEmail(emailLower);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Email not verified. Please verify your email before logging in.',
      );
    }

    const tokenPair = await this.refreshTokenService.create(
      user._id as Types.ObjectId,
      deviceInfo,
    );

    const accessToken = this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
    });

    const expiresIn = this.parseExpiryToSeconds(
      this.configService.get('JWT_ACCESS_EXPIRY', '15m'),
    );

    this.logger.log({
      event: 'auth.login',
      userId: user._id.toString(),
      email: user.email,
    });

    return {
      accessToken,
      refreshToken: tokenPair.plainToken,
      expiresIn,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPairResponse> {
    const { user, newTokenPair } =
      await this.refreshTokenService.validateAndRotate(refreshToken);

    const accessToken = this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
    });

    const expiresIn = this.parseExpiryToSeconds(
      this.configService.get('JWT_ACCESS_EXPIRY', '15m'),
    );

    this.logger.log({
      event: 'auth.refresh',
      userId: user._id.toString(),
      email: user.email,
    });

    return {
      accessToken,
      refreshToken: newTokenPair.plainToken,
      expiresIn,
    };
  }

  async validateOrCreateUserFromGoogle(
    googleId: string,
    email: string | undefined,
    displayName?: string,
  ): Promise<UserDocument> {
    if (!email) {
      throw new BadRequestException(
        'Google account must have a verified email address',
      );
    }

    const emailLower = email.toLowerCase().trim();

    let user = await this.usersRepository.findByGoogleId(googleId);
    if (user) {
      return user;
    }

    user = await this.usersRepository.findByEmail(emailLower);
    if (user) {
      const updated = await this.usersRepository.updateById(user._id, {
        googleId,
      });
      return updated!;
    }

    const username = await this.generateUniqueUsername(emailLower, displayName);

    return this.usersRepository.create({
      username,
      email: emailLower,
      passwordHash: null,
      role: 'listener',
      emailVerified: true,
      googleId,
    });
  }

  async issueTokensForUser(user: UserDocument): Promise<TokenPairResponse> {
    const tokenPair = await this.refreshTokenService.create(
      user._id as Types.ObjectId,
    );

    const accessToken = this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
    });

    const expiresIn = this.parseExpiryToSeconds(
      this.configService.get('JWT_ACCESS_EXPIRY', '15m'),
    );

    return {
      accessToken,
      refreshToken: tokenPair.plainToken,
      expiresIn,
    };
  }

  private async generateUniqueUsername(
    email: string,
    displayName?: string,
  ): Promise<string> {
    let localPart = email.split('@')[0] ?? 'user';
    if (localPart.length < 3 && displayName) {
      localPart = displayName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || localPart;
    }
    let base = localPart
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase()
      .slice(0, 27);
    if (base.length < 3) {
      base = 'user' + base;
    }
    if (base.length > 27) {
      base = base.slice(0, 27);
    }

    let username = base;
    let suffix = 0;
    while (await this.usersRepository.existsByUsername(username)) {
      suffix += 1;
      const suffixStr = String(suffix);
      username = (base.slice(0, 27 - suffixStr.length) || 'user') + suffixStr;
    }
    return username;
  }
}
