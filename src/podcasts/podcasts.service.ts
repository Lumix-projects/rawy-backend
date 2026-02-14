import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Podcast, PodcastDocument } from './schemas/podcast.schema';
import { CreatePodcastDto } from './dto/create-podcast.dto';
import { UpdatePodcastDto } from './dto/update-podcast.dto';
import { CategoriesService } from '../categories/categories.service';
import { CoverUploadService } from '../shared/upload/upload.service';
import { EpisodesService } from '../episodes/episodes.service';

export interface CreatePodcastInput {
  dto: CreatePodcastDto;
  ownerId: Types.ObjectId;
  cover?: { buffer: Buffer; mimetype: string; size: number };
}

export interface UpdatePodcastInput {
  dto: UpdatePodcastDto;
  cover?: { buffer: Buffer; mimetype: string; size: number };
}

@Injectable()
export class PodcastsService {
  private readonly logger = new Logger(PodcastsService.name);

  constructor(
    @InjectModel(Podcast.name) private readonly podcastModel: Model<PodcastDocument>,
    private readonly categoriesService: CategoriesService,
    private readonly coverUploadService: CoverUploadService,
    @Inject(forwardRef(() => EpisodesService))
    private readonly episodesService: EpisodesService,
  ) {}

  async create(input: CreatePodcastInput): Promise<PodcastDocument> {
    const { dto, ownerId, cover } = input;

    if (!cover) {
      throw new BadRequestException('Cover image is required');
    }

    const category = await this.categoriesService.findById(dto.categoryId);
    if (!category) {
      throw new BadRequestException('Invalid categoryId');
    }

    let subcategory = null;
    if (dto.subcategoryId) {
      subcategory = await this.categoriesService.findById(dto.subcategoryId);
      if (!subcategory) {
        throw new BadRequestException('Invalid subcategoryId');
      }
    }

    const uploadResult = await this.coverUploadService.uploadCover(cover);
    if (!uploadResult) {
      throw new BadRequestException('Cover upload failed. S3 may not be configured.');
    }

    const status = dto.status ?? 'draft';
    const doc = await this.podcastModel.create({
      ownerId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      categoryId: new Types.ObjectId(dto.categoryId),
      subcategoryId: subcategory?._id ?? null,
      coverUrl: uploadResult.url,
      language: dto.language.trim(),
      tags: dto.tags ?? [],
      status,
      explicit: dto.explicit ?? false,
      episodeOrder: dto.episodeOrder ?? 'newest_first',
      websiteUrl: dto.websiteUrl?.trim() || null,
    });

    this.logger.log(`Podcast created id=${doc._id} ownerId=${ownerId} title=${dto.title}`);
    return doc;
  }

  async findAllByOwner(
    ownerId: Types.ObjectId,
    options?: { status?: string; limit?: number; offset?: number },
  ): Promise<{ items: PodcastDocument[]; total: number }> {
    const filter: Record<string, unknown> = { ownerId };
    if (options?.status) {
      filter.status = options.status;
    }

    const [items, total] = await Promise.all([
      this.podcastModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(options?.offset ?? 0)
        .limit(Math.min(options?.limit ?? 20, 100))
        .populate('categoryId', 'slug name')
        .exec(),
      this.podcastModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async findById(id: string | Types.ObjectId): Promise<PodcastDocument | null> {
    return this.podcastModel
      .findById(id)
      .populate('categoryId', 'slug name')
      .populate('subcategoryId', 'slug name')
      .exec();
  }

  async findByIdOrThrow(id: string | Types.ObjectId): Promise<PodcastDocument> {
    const doc = await this.findById(id);
    if (!doc) {
      throw new NotFoundException('Podcast not found');
    }
    return doc;
  }

  async update(
    id: string | Types.ObjectId,
    ownerId: Types.ObjectId,
    input: UpdatePodcastInput,
  ): Promise<PodcastDocument> {
    const doc = await this.findByIdOrThrow(id);
    if (!doc.ownerId.equals(ownerId)) {
      throw new ForbiddenException('Not the owner of this podcast');
    }

    const { dto, cover } = input;

    if (dto.categoryId) {
      const category = await this.categoriesService.findById(dto.categoryId);
      if (!category) {
        throw new BadRequestException('Invalid categoryId');
      }
    }
    if (dto.subcategoryId) {
      const subcategory = await this.categoriesService.findById(dto.subcategoryId);
      if (!subcategory) {
        throw new BadRequestException('Invalid subcategoryId');
      }
    }

    const updates: Record<string, unknown> = {};

    if (dto.title !== undefined) updates.title = dto.title.trim();
    if (dto.description !== undefined) updates.description = dto.description?.trim() || null;
    if (dto.categoryId !== undefined) updates.categoryId = new Types.ObjectId(dto.categoryId);
    if (dto.subcategoryId !== undefined) {
      updates.subcategoryId = dto.subcategoryId ? new Types.ObjectId(dto.subcategoryId) : null;
    }
    if (dto.tags !== undefined) updates.tags = dto.tags;
    if (dto.explicit !== undefined) updates.explicit = dto.explicit;
    if (dto.episodeOrder !== undefined) updates.episodeOrder = dto.episodeOrder;
    if (dto.websiteUrl !== undefined) updates.websiteUrl = dto.websiteUrl?.trim() || null;

    if (cover) {
      const uploadResult = await this.coverUploadService.uploadCover(cover);
      if (uploadResult) {
        updates.coverUrl = uploadResult.url;
      }
    }

    if (dto.status !== undefined) {
      if (dto.status === 'archived') {
        updates.status = 'archived';
        updates.archivedAt = new Date();
        await this.episodesService.cancelScheduledByPodcast(id);
      } else if (dto.status === 'published') {
        updates.status = 'published';
        updates.archivedAt = null;
      } else if (dto.status === 'draft') {
        updates.status = 'draft';
        updates.archivedAt = null;
      }
    }

    const updated = await this.podcastModel
      .findByIdAndUpdate(id, { $set: updates }, { returnDocument: 'after' })
      .populate('categoryId', 'slug name')
      .populate('subcategoryId', 'slug name')
      .exec();

    if (!updated) {
      throw new NotFoundException('Podcast not found');
    }

    this.logger.log(`Podcast updated id=${id}`);
    return updated;
  }

  async delete(id: string | Types.ObjectId, ownerId: Types.ObjectId): Promise<void> {
    const doc = await this.findByIdOrThrow(id);
    if (!doc.ownerId.equals(ownerId)) {
      throw new ForbiddenException('Not the owner of this podcast');
    }

    await this.podcastModel.findByIdAndDelete(id).exec();
    this.logger.log(`Podcast deleted id=${id}`);
  }

  async findPublishedById(id: string | Types.ObjectId): Promise<PodcastDocument | null> {
    return this.podcastModel
      .findOne({ _id: id, status: 'published' })
      .populate('categoryId', 'slug name')
      .populate('subcategoryId', 'slug name')
      .exec();
  }
}
