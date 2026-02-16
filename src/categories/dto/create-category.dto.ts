import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'History',
    minLength: 2,
    maxLength: 50,
    description: 'Display name of the category',
  })
  @IsString()
  @IsNotEmpty({ message: 'Category name is required' })
  @MinLength(2, { message: 'Category name must be at least 2 characters' })
  @MaxLength(50, { message: 'Category name must be at most 50 characters' })
  name!: string;

  @ApiProperty({
    example: 'history',
    minLength: 2,
    maxLength: 50,
    description:
      'Unique URL-friendly slug (lowercase letters, numbers, hyphens)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Category slug is required' })
  @MinLength(2, { message: 'Category slug must be at least 2 characters' })
  @MaxLength(50, { message: 'Category slug must be at most 50 characters' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Category slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug!: string;
}
