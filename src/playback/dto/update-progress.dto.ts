import { IsString, IsNumber, Min } from 'class-validator';

export class UpdateProgressDto {
  @IsString()
  episodeId!: string;

  @IsNumber()
  @Min(0)
  positionSeconds!: number;
}
