import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  MinLength,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePodcastDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  subcategoryId?: string;

  @IsString()
  language!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
          ? parsed
          : value
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean);
      } catch {
        return value
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  explicit?: boolean;

  @IsOptional()
  @IsEnum(['newest_first', 'oldest_first'])
  episodeOrder?: 'newest_first' | 'oldest_first';

  @IsOptional()
  @IsString()
  websiteUrl?: string;

  @IsOptional()
  @IsEnum(['draft', 'published'])
  status?: 'draft' | 'published';
}
