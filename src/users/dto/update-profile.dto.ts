import {
  IsString,
  IsOptional,
  IsUrl,
  MaxLength,
  MinLength,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @ValidateIf((o) => o.website !== undefined && o.website !== '')
  @IsString()
  @IsUrl()
  @MaxLength(2048)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  twitter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  instagram?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  showName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categoryId?: string;

  // avatar is passed via @UploadedFile() - not in DTO
}
