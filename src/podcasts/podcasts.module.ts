import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Podcast, PodcastSchema } from './schemas/podcast.schema';
import { Rating, RatingSchema } from './schemas/rating.schema';
import { PodcastsController } from './podcasts.controller';
import { PodcastsService } from './podcasts.service';
import { RssService } from './rss/rss.service';
import { RatingsController } from './ratings/ratings.controller';
import { RatingsService } from './ratings/ratings.service';
import { CategoriesModule } from '../categories/categories.module';
import { SharedUploadModule } from '../shared/upload/upload.module';
import { EpisodesModule } from '../episodes/episodes.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Podcast.name, schema: PodcastSchema },
      { name: Rating.name, schema: RatingSchema },
    ]),
    CategoriesModule,
    SharedUploadModule,
    forwardRef(() => EpisodesModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [PodcastsController, RatingsController],
  providers: [PodcastsService, RssService, RatingsService],
  exports: [PodcastsService],
})
export class PodcastsModule {}
