import {
  IsEnum,
  IsOptional,
  IsString,
  IsMongoId,
  MaxLength,
} from 'class-validator';

export class CreateReportDto {
  @IsEnum(['podcast', 'episode', 'comment'])
  targetType!: 'podcast' | 'episode' | 'comment';

  @IsMongoId()
  targetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
