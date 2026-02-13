import {
  IsEmail,
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class RegisterCreatorDto {
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(30, { message: 'Username must be at most 30 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores',
  })
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'Show name is required' })
  @MinLength(1, { message: 'Show name must be at least 1 character' })
  @MaxLength(100, { message: 'Show name must be at most 100 characters' })
  showName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Category is required' })
  categoryId!: string;
}
