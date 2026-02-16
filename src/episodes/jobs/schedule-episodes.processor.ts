import { Processor, Process } from '@nestjs/bull';
import { InjectQueue } from '@nestjs/bull';
import { OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bull';
import { EpisodesService } from '../episodes.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PodcastsService } from '../../podcasts/podcasts.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { EPISODE_SCHEDULE_QUEUE } from '../../shared/queue/queue.module';

export const SCHEDULE_CHECK_JOB = 'check-scheduled';

@Processor(EPISODE_SCHEDULE_QUEUE)
export class ScheduleEpisodesProcessor implements OnModuleInit {
  constructor(
    private readonly episodesService: EpisodesService,
    private readonly notificationsService: NotificationsService,
    private readonly podcastsService: PodcastsService,
    private readonly subscriptionsService: SubscriptionsService,
    @InjectQueue(EPISODE_SCHEDULE_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(SCHEDULE_CHECK_JOB, {}, { repeat: { cron: '*/1 * * * *' } })
      .catch(() => {});
  }

  @Process(SCHEDULE_CHECK_JOB)
  async handleScheduledCheck() {
    const published = await this.episodesService.publishScheduledEpisodes(
      new Date(),
    );

    for (const ep of published) {
      const pid = ep.podcastId;
      const podcastId =
        pid instanceof Object && pid !== null && '_id' in pid
          ? String((pid as { _id: unknown })._id)
          : String(pid);
      const podcast = await this.podcastsService.findById(podcastId);
      if (podcast) {
        const userIds =
          await this.subscriptionsService.getSubscriberUserIdsByPodcast(
            podcastId,
          );
        await this.notificationsService.notifyNewEpisode(
          userIds,
          ep._id.toString(),
          ep.title,
          podcast.title,
        );
      }
    }

    return { published: published.length };
  }
}
