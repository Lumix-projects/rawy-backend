import { ApiProperty } from '@nestjs/swagger';

/** Category response for list endpoint */
export class CategoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'tech', description: 'URL-friendly slug' })
  slug!: string;

  @ApiProperty({ example: 'Technology' })
  name!: string;
}
