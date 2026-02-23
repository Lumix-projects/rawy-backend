import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { Podcast, PodcastSchema } from '../podcasts/schemas/podcast.schema';
import { Episode, EpisodeSchema } from '../episodes/schemas/episode.schema';
import {
  PlayEvent,
  PlayEventSchema,
} from '../playback/schemas/play-event.schema';
import {
  ListeningProgress,
  ListeningProgressSchema,
} from '../playback/schemas/listening-progress.schema';
import {
  FeaturedPodcast,
  FeaturedPodcastSchema,
} from '../admin/schemas/featured-podcast.schema';
import {
  Subscription,
  SubscriptionSchema,
} from '../subscriptions/schemas/subscription.schema';
import { Follow, FollowSchema } from '../follows/schemas/follow.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Podcast.name, schema: PodcastSchema },
      { name: Episode.name, schema: EpisodeSchema },
      { name: PlayEvent.name, schema: PlayEventSchema },
      { name: ListeningProgress.name, schema: ListeningProgressSchema },
      { name: FeaturedPodcast.name, schema: FeaturedPodcastSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Follow.name, schema: FollowSchema },
    ]),
  ],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
