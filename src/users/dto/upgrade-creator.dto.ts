import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MinLength,
  MaxLength,
} from 'class-validator';

export class UpgradeCreatorDto {
  @IsString()
  @IsNotEmpty({ message: 'Show name is required' })
  @MinLength(1, { message: 'Show name must be at least 1 character' })
  @MaxLength(100, { message: 'Show name must be at most 100 characters' })
  showName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Category is required' })
  categoryId!: string;

  // avatar is passed via @UploadedFile() - not in DTO
}
