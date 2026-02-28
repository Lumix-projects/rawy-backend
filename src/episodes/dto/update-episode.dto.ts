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

export class UpdateEpisodeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  seasonNumber?: number;

  @IsOptional()
  @IsNumber()
  episodeNumber?: number;

  @IsOptional()
  @IsString()
  showNotes?: string;

  @IsOptional()
  @IsString()
  transcription?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChapterMarkerDto)
  chapterMarkers?: ChapterMarkerDto[];

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch {
        return value
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    }
    return Array.isArray(value) ? value : value ? [value] : [];
  })
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsEnum(['draft', 'scheduled', 'published', 'archived'])
  status?: 'draft' | 'scheduled' | 'published' | 'archived';

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}
