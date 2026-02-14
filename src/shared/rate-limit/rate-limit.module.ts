import { Module } from '@nestjs/common';
import { UploadRateLimitService } from './upload-rate-limit.service';

@Module({
  providers: [UploadRateLimitService],
  exports: [UploadRateLimitService],
})
export class RateLimitModule {}
