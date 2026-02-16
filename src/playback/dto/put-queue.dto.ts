import { IsArray, IsMongoId, ArrayMaxSize } from 'class-validator';

/** Max queue size to prevent abuse (e.g. 500 episodes) */
const MAX_QUEUE_SIZE = 500;

export class PutQueueDto {
  @IsArray()
  @IsMongoId({ each: true })
  @ArrayMaxSize(MAX_QUEUE_SIZE)
  episodeIds!: string[];
}
