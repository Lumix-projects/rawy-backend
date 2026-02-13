import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import type { CategoryDocument } from './schemas/category.schema';

function toCategoryResponse(cat: CategoryDocument) {
  return {
    id: cat._id.toString(),
    slug: cat.slug,
    name: cat.name,
  };
}

@Controller('categories')
@Public()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async list() {
    const categories = await this.categoriesService.findAll();
    return categories.map(toCategoryResponse);
  }
}
