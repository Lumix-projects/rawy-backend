import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { Podcast, PodcastSchema } from '../podcasts/schemas/podcast.schema';
import { Episode, EpisodeSchema } from '../episodes/schemas/episode.schema';
import { PlayEvent, PlayEventSchema } from '../playback/schemas/play-event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Podcast.name, schema: PodcastSchema },
      { name: Episode.name, schema: EpisodeSchema },
      { name: PlayEvent.name, schema: PlayEventSchema },
    ]),
  ],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
