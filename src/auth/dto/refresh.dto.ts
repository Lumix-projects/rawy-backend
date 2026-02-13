import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description: 'Refresh token from login or previous refresh',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
