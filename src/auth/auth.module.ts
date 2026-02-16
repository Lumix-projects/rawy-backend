import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';
import {
  VerificationToken,
  VerificationTokenSchema,
} from './schemas/verification-token.schema';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailVerifiedGuard } from './guards/email-verified.guard';
import { RolesGuard } from './guards/roles.guard';
import { CreatorRoleGuard } from './guards/creator-role.guard';
import { ListenerOrCreatorGuard } from './guards/listener-creator.guard';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../common/email/email.module';
import { CategoriesModule } from '../categories/categories.module';
import { UploadModule } from '../upload/upload.module';
import {
  VerificationEmailProcessor,
  VERIFICATION_EMAIL_QUEUE,
} from './processors/verification-email.processor';
import {
  PasswordResetEmailProcessor,
  PASSWORD_RESET_EMAIL_QUEUE,
} from './processors/password-reset.processor';

// Throttle limits for auth routes (use @Throttle() when endpoints are added):
// login: 5/min (ttl: 60000, limit: 5)
// forgot-password, verify-email: 3/hour (ttl: 3600000, limit: 3)
export const THROTTLE_LOGIN = { ttl: 60000, limit: 5 };
export const THROTTLE_AUTH_SENSITIVE = { ttl: 3600000, limit: 3 };

@Module({
  imports: [
    BullModule.registerQueue(
      { name: VERIFICATION_EMAIL_QUEUE },
      { name: PASSWORD_RESET_EMAIL_QUEUE },
    ),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'change-me-in-production'),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_EXPIRY', '15m'),
        },
      }),
    }),
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: VerificationToken.name, schema: VerificationTokenSchema },
    ]),
    forwardRef(() => UsersModule),
    EmailModule,
    CategoriesModule,
    UploadModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    JwtStrategy,
    GoogleStrategy,
    VerificationEmailProcessor,
    PasswordResetEmailProcessor,
    JwtAuthGuard,
    EmailVerifiedGuard,
    RolesGuard,
    CreatorRoleGuard,
    ListenerOrCreatorGuard,
  ],
  exports: [
    AuthService,
    JwtModule,
    JwtAuthGuard,
    EmailVerifiedGuard,
    RolesGuard,
    CreatorRoleGuard,
    ListenerOrCreatorGuard,
  ],
})
export class AuthModule {}
