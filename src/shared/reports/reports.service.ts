import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Report, ReportDocument } from '../schemas/report.schema';
import { EpisodesService } from '../../episodes/episodes.service';
import { PodcastsService } from '../../podcasts/podcasts.service';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    private readonly podcastsService: PodcastsService,
    private readonly episodesService: EpisodesService,
  ) {}

  async create(
    userId: Types.ObjectId,
    targetType: 'podcast' | 'episode' | 'comment',
    targetId: string,
    reason?: string,
  ): Promise<ReportDocument> {
    const targetObjectId = new Types.ObjectId(targetId);

    if (targetType === 'podcast') {
      const podcast = await this.podcastsService.findById(targetId);
      if (!podcast) {
        throw new BadRequestException('Target podcast not found');
      }
    } else if (targetType === 'episode') {
      const episode = await this.episodesService.findById(targetId);
      if (!episode) {
        throw new BadRequestException('Target episode not found');
      }
    }
    // comment: defer validation if/when comments feature exists

    const doc = await this.reportModel.create({
      userId,
      targetType,
      targetId: targetObjectId,
      reason: reason ?? null,
      status: 'pending',
    });

    return doc;
  }

  async list(
    options?: {
      status?: 'pending' | 'dismissed' | 'resolved';
      targetType?: 'podcast' | 'episode' | 'comment';
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: ReportDocument[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (options?.status) filter.status = options.status;
    if (options?.targetType) filter.targetType = options.targetType;

    const limit = Math.min(options?.limit ?? 50, 100);
    const offset = options?.offset ?? 0;

    const [items, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate('userId', 'username email')
        .populate('resolvedBy', 'username')
        .exec(),
      this.reportModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async dismiss(
    reportId: string,
    adminId: Types.ObjectId,
  ): Promise<ReportDocument> {
    const doc = await this.reportModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(reportId), status: 'pending' },
        {
          $set: {
            status: 'dismissed',
            resolvedBy: adminId,
            resolvedAt: new Date(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!doc) {
      throw new BadRequestException('Report not found or already resolved');
    }
    return doc;
  }

  async resolve(
    reportId: string,
    adminId: Types.ObjectId,
  ): Promise<ReportDocument> {
    const doc = await this.reportModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(reportId), status: 'pending' },
        {
          $set: {
            status: 'resolved',
            resolvedBy: adminId,
            resolvedAt: new Date(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!doc) {
      throw new BadRequestException('Report not found or already resolved');
    }
    return doc;
  }
}
