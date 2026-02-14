import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Podcast, PodcastSchema } from './schemas/podcast.schema';
import { PodcastsController } from './podcasts.controller';
import { PodcastsService } from './podcasts.service';
import { RssService } from './rss/rss.service';
import { CategoriesModule } from '../categories/categories.module';
import { SharedUploadModule } from '../shared/upload/upload.module';
import { EpisodesModule } from '../episodes/episodes.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Podcast.name, schema: PodcastSchema }]),
    CategoriesModule,
    SharedUploadModule,
    forwardRef(() => EpisodesModule),
  ],
  controllers: [PodcastsController],
  providers: [PodcastsService, RssService],
  exports: [PodcastsService],
})
export class PodcastsModule {}
