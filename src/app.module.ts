import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { UploadModule } from './upload/upload.module';
import { EmailModule } from './common/email/email.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

function createRedisWithErrorHandler(
  url: string,
  type?: string,
): Redis {
  // Bull requires bclient/subscriber to have maxRetriesPerRequest: null, enableReadyCheck: false
  const opts =
    type === 'subscriber' || type === 'bclient'
      ? { maxRetriesPerRequest: null, enableReadyCheck: false }
      : { maxRetriesPerRequest: 3, retryStrategy: () => null as number | null };
  const redis = new Redis(url, opts);
  redis.on('error', () => {
    // Suppress unhandled ECONNREFUSED spam when Redis is not running
  });
  return redis;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        uri: config.get('MONGODB_URI', 'mongodb://localhost:27017/raawy'),
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get('REDIS_URL', '');
        const useRedis =
          redisUrl &&
          redisUrl !== 'memory' &&
          !redisUrl.startsWith('skip');
        return {
          throttlers: [
            { ttl: 60000, limit: 100 },
            { name: 'login', ttl: 60000, limit: 5 },
            { name: 'auth-sensitive', ttl: 3600000, limit: 3 },
          ],
          storage: useRedis
            ? new ThrottlerStorageRedisService(
                createRedisWithErrorHandler(redisUrl),
              )
            : undefined, // In-memory when Redis disabled
        };
      },
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        const raw = config.get('REDIS_URL', '');
        const redisUrl =
          raw && raw !== 'memory' && !raw.startsWith('skip')
            ? raw
            : 'redis://localhost:6379';
        return {
          redis: redisUrl,
          createClient: (type: string) =>
            createRedisWithErrorHandler(redisUrl, type),
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    CategoriesModule,
    UploadModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
