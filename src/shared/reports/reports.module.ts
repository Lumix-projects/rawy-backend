import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Report, ReportSchema } from '../schemas/report.schema';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PodcastsModule } from '../../podcasts/podcasts.module';
import { EpisodesModule } from '../../episodes/episodes.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
    PodcastsModule,
    EpisodesModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
