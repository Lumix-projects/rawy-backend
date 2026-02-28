import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class RegisterCreatorDto {
  @ApiProperty({
    example: 'johndoe',
    minLength: 3,
    maxLength: 30,
    description: 'Username (letters, numbers, underscores only)',
  })
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(30, { message: 'Username must be at most 30 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores',
  })
  username!: string;

  @ApiProperty({ example: 'john@example.com', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'SecurePass123!',
    minLength: 8,
    format: 'password',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

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

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Avatar image (max 5MB)',
  })
  @IsOptional()
  avatar?: Express.Multer.File;
}
