import { Processor, Process } from '@nestjs/bull';
import { InjectQueue } from '@nestjs/bull';
import { OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bull';
import { EpisodesService } from '../episodes.service';
import { EPISODE_SCHEDULE_QUEUE } from '../../shared/queue/queue.module';

export const SCHEDULE_CHECK_JOB = 'check-scheduled';

@Processor(EPISODE_SCHEDULE_QUEUE)
export class ScheduleEpisodesProcessor implements OnModuleInit {
  constructor(
    private readonly episodesService: EpisodesService,
    @InjectQueue(EPISODE_SCHEDULE_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue.add(
      SCHEDULE_CHECK_JOB,
      {},
      { repeat: { cron: '*/1 * * * *' } },
    ).catch(() => {});
  }

  @Process(SCHEDULE_CHECK_JOB)
  async handleScheduledCheck() {
    const published = await this.episodesService.publishScheduledEpisodes(new Date());
    return { published: published.length };
  }
}
