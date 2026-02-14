import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

export const EPISODE_SCHEDULE_QUEUE = 'episode-schedule';
export const RSS_QUEUE = 'rss';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: EPISODE_SCHEDULE_QUEUE },
      { name: RSS_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
