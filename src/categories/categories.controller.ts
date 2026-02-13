import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { CategoryResponseDto } from './dto/category-response.dto';
import type { CategoryDocument } from './schemas/category.schema';

function toCategoryResponse(cat: CategoryDocument) {
  return {
    id: cat._id.toString(),
    slug: cat.slug,
    name: cat.name,
  };
}

@ApiTags('Categories')
@Controller('categories')
@Public()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories' })
  @ApiResponse({
    status: 200,
    description: 'List of categories',
    type: [CategoryResponseDto],
  })
  async list() {
    const categories = await this.categoriesService.findAll();
    return categories.map(toCategoryResponse);
  }
}
