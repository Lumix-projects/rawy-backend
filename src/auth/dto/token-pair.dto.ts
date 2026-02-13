import { ApiProperty } from '@nestjs/swagger';

/** Token pair returned by login, refresh, and OAuth endpoints */
export class TokenPairDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken!: string;

  @ApiProperty({ description: 'Refresh token for obtaining new access tokens' })
  refreshToken!: string;

  @ApiProperty({
    description: 'Access token expiry in seconds',
    example: 900,
  })
  expiresIn!: number;
}
