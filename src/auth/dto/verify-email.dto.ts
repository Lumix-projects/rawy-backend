import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Verification token from confirmation email',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
