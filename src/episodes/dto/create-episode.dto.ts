import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  MinLength,
  MaxLength,
  IsEnum,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ChapterMarkerDto {
  @IsString()
  title!: string;

  @IsNumber()
  startSeconds!: number;
}

export class CreateEpisodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== '' ? Number(value) : undefined,
  )
  @IsNumber()
  duration?: number;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== '' ? Number(value) : undefined,
  )
  @IsNumber()
  seasonNumber?: number;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== '' ? Number(value) : undefined,
  )
  @IsNumber()
  episodeNumber?: number;

  @IsOptional()
  @IsString()
  showNotes?: string;

  @IsOptional()
  @IsString()
  transcription?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return value ?? [];
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChapterMarkerDto)
  chapterMarkers?: ChapterMarkerDto[];

  @IsOptional()
  @IsEnum(['draft', 'published'])
  status?: 'draft' | 'published';

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}
