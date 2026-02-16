import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class UploadRateLimitService {
  private readonly redis: Redis | null;
  private readonly limitPerDay: number;
  private readonly keyPrefix = 'upload_count';

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get('REDIS_URL', '');
    const useRedis =
      redisUrl && redisUrl !== 'memory' && !redisUrl.startsWith('skip');
    this.redis = useRedis ? new Redis(redisUrl) : null;
    this.limitPerDay = this.configService.get('UPLOAD_LIMIT_PER_DAY', 10);
  }

  /**
   * Check and increment upload count for a creator on the current day.
   * Rejects (throws) if limit exceeded.
   */
  async checkAndIncrement(creatorId: string): Promise<void> {
    if (!this.redis) {
      return; // No Redis: skip rate limiting
    }

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `${this.keyPrefix}:${creatorId}:${date}`;

    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, 86400 * 2); // 2 days TTL so key expires after day ends
    }

    if (count > this.limitPerDay) {
      await this.redis.decr(key); // Rollback the increment
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Upload limit exceeded. Maximum ${this.limitPerDay} uploads per day.`,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Get current upload count for a creator today (without incrementing).
   */
  async getCount(creatorId: string): Promise<number> {
    if (!this.redis) return 0;

    const date = new Date().toISOString().slice(0, 10);
    const key = `${this.keyPrefix}:${creatorId}:${date}`;
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }
}
