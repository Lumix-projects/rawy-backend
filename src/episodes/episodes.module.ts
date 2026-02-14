import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Episode, EpisodeSchema } from './schemas/episode.schema';
import { EpisodesService } from './episodes.service';
import { EpisodesController } from './episodes.controller';
import { PodcastEpisodesController } from './podcast-episodes.controller';
import { PodcastsModule } from '../podcasts/podcasts.module';
import { SharedUploadModule } from '../shared/upload/upload.module';
import { RateLimitModule } from '../shared/rate-limit/rate-limit.module';
import { QueueModule } from '../shared/queue/queue.module';
import { ScheduleEpisodesProcessor } from './jobs/schedule-episodes.processor';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Episode.name, schema: EpisodeSchema }]),
    forwardRef(() => PodcastsModule),
    SharedUploadModule,
    RateLimitModule,
    QueueModule,
  ],
  controllers: [EpisodesController, PodcastEpisodesController],
  providers: [EpisodesService, ScheduleEpisodesProcessor],
  exports: [EpisodesService],
})
export class EpisodesModule {}
