import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';

export class UpgradeCreatorDto {
  @ApiProperty({
    example: 'The Daily Podcast',
    minLength: 1,
    maxLength: 100,
    description: 'Display name for your podcast show',
  })
  @IsString()
  @IsNotEmpty({ message: 'Show name is required' })
  @MinLength(1, { message: 'Show name must be at least 1 character' })
  @MaxLength(100, { message: 'Show name must be at most 100 characters' })
  showName!: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'ID of the category for your show',
  })
  @IsString()
  @IsNotEmpty({ message: 'Category is required' })
  categoryId!: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Avatar image (max 5MB)',
  })
  @IsOptional()
  avatar?: Express.Multer.File;
}
