import {
  ConflictException,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';

const INITIAL_CATEGORIES = [
  { slug: 'music', name: 'Music' },
  { slug: 'tech', name: 'Technology' },
  { slug: 'business', name: 'Business' },
  { slug: 'comedy', name: 'Comedy' },
  { slug: 'education', name: 'Education' },
  { slug: 'news', name: 'News & Politics' },
  { slug: 'society', name: 'Society & Culture' },
  { slug: 'arts', name: 'Arts' },
  { slug: 'sports', name: 'Sports' },
  { slug: 'science', name: 'Science' },
];

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.categoryModel.estimatedDocumentCount().exec();
    if (count === 0) {
      await this.categoryModel.insertMany(INITIAL_CATEGORIES);
    }
  }

  async findAll(): Promise<CategoryDocument[]> {
    return this.categoryModel.find().sort({ name: 1 }).exec();
  }

  async findById(id: string): Promise<CategoryDocument | null> {
    return this.categoryModel.findById(id).exec();
  }

  async findBySlug(slug: string): Promise<CategoryDocument | null> {
    return this.categoryModel.findOne({ slug }).exec();
  }

  async create(dto: CreateCategoryDto): Promise<CategoryDocument> {
    const slug = this.normalizeSlug(dto.slug);
    const name = dto.name.trim();

    const existingBySlug = await this.findBySlug(slug);
    if (existingBySlug) {
      throw new ConflictException('Category slug already exists');
    }

    const existingByName = await this.categoryModel.findOne({ name }).exec();
    if (existingByName) {
      throw new ConflictException('Category name already exists');
    }

    return this.categoryModel.create({ slug, name });
  }

  private normalizeSlug(rawSlug: string): string {
    return rawSlug.trim().toLowerCase();
  }
}
