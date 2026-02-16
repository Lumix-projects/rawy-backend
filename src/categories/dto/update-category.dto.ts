import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCategoryDto {
  @ApiProperty({
    example: 'History',
    minLength: 2,
    maxLength: 50,
    description: 'Display name of the category',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Category name must be at least 2 characters' })
  @MaxLength(50, { message: 'Category name must be at most 50 characters' })
  name?: string;

  @ApiProperty({
    example: 'history',
    minLength: 2,
    maxLength: 50,
    description:
      'Unique URL-friendly slug (lowercase letters, numbers, hyphens)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Category slug must be at least 2 characters' })
  @MaxLength(50, { message: 'Category slug must be at most 50 characters' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Category slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @ApiProperty({
    example: null,
    description: 'Parent category ID for subcategories (null for top-level)',
    required: false,
  })
  @IsOptional()
  parentId?: string | null;
}
