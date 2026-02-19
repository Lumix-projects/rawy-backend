import { Module } from '@nestjs/common';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { DiscoveryModule } from '../discovery/discovery.module';
import { PlaybackModule } from '../playback/playback.module';

@Module({
  imports: [DiscoveryModule, PlaybackModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
