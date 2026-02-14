import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlaybackController } from './playback.controller';
import { PlaybackService } from './playback.service';
import { ListeningProgress, ListeningProgressSchema } from './schemas/listening-progress.schema';
import { PlayEvent, PlayEventSchema } from './schemas/play-event.schema';
import { DownloadEvent, DownloadEventSchema } from './schemas/download-event.schema';
import { EpisodesModule } from '../episodes/episodes.module';
import { PodcastsModule } from '../podcasts/podcasts.module';
import { SharedUploadModule } from '../shared/upload/upload.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ListeningProgress.name, schema: ListeningProgressSchema },
      { name: PlayEvent.name, schema: PlayEventSchema },
      { name: DownloadEvent.name, schema: DownloadEventSchema },
    ]),
    EpisodesModule,
    PodcastsModule,
    SharedUploadModule,
  ],
  controllers: [PlaybackController],
  providers: [PlaybackService],
  exports: [PlaybackService, MongooseModule],
})
export class PlaybackModule {}
