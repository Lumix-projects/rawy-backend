import { Module } from '@nestjs/common';
import { CoverUploadService } from './upload.service';
import { AudioUploadService } from './audio-upload.service';

@Module({
  providers: [CoverUploadService, AudioUploadService],
  exports: [CoverUploadService, AudioUploadService],
})
export class SharedUploadModule {}
