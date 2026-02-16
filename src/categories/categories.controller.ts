import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CategoriesService } from './categories.service';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
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

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Create category (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Category created',
    type: CategoryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({
    status: 409,
    description: 'Category slug or name already exists',
  })
  async create(@Body() dto: CreateCategoryDto) {
    const category = await this.categoriesService.create(dto);
    return toCategoryResponse(category);
  }
}
