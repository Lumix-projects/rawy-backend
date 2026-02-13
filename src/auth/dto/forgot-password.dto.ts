import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'john@example.com',
    format: 'email',
    description: 'Email address to send password reset link',
  })
  @IsEmail()
  email!: string;
}
