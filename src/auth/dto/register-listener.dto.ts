import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class RegisterListenerDto {
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
    description: 'Password (min 8 characters)',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;
}
