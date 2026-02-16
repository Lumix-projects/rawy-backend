import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import {
  FeaturedPodcast,
  FeaturedPodcastSchema,
} from './schemas/featured-podcast.schema';
import { PodcastsModule } from '../podcasts/podcasts.module';
import { ReportsModule } from '../shared/reports/reports.module';
import { CategoriesModule } from '../categories/categories.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FeaturedPodcast.name, schema: FeaturedPodcastSchema },
    ]),
    PodcastsModule,
    ReportsModule,
    CategoriesModule,
    AnalyticsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
