import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUrl,
  MaxLength,
  MinLength,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 500, description: 'User bio' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ format: 'uri', maxLength: 2048 })
  @IsOptional()
  @ValidateIf((o) => o.website !== undefined && o.website !== '')
  @IsString()
  @IsUrl()
  @MaxLength(2048)
  website?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Twitter handle' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  twitter?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Instagram handle' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  instagram?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Show name (creators only)',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  showName?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Avatar image (max 5MB)',
  })
  @IsOptional()
  avatar?: Express.Multer.File;

  @ApiPropertyOptional({ description: 'Make profile private (hides bio, links, content)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isPrivate?: boolean;
}
