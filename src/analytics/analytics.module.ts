import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PlayEvent, PlayEventSchema } from '../playback/schemas/play-event.schema';
import {
  DownloadEvent,
  DownloadEventSchema,
} from '../playback/schemas/download-event.schema';
import { Episode, EpisodeSchema } from '../episodes/schemas/episode.schema';
import { Podcast, PodcastSchema } from '../podcasts/schemas/podcast.schema';
import {
  Subscription,
  SubscriptionSchema,
} from '../subscriptions/schemas/subscription.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlayEvent.name, schema: PlayEventSchema },
      { name: DownloadEvent.name, schema: DownloadEventSchema },
      { name: Episode.name, schema: EpisodeSchema },
      { name: Podcast.name, schema: PodcastSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
