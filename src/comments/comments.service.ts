import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { EpisodesService } from '../episodes/episodes.service';
import { PodcastsService } from '../podcasts/podcasts.service';

function toResponse(doc: CommentDocument | (Record<string, unknown> & { _id: Types.ObjectId })) {
  const d = doc as any;
  return {
    id: d._id.toString(),
    userId: d.userId.toString(),
    targetType: d.targetType,
    targetId: d.targetId.toString(),
    parentId: d.parentId ? d.parentId.toString() : null,
    text: d.text,
    likesCount: d.likesCount ?? 0,
    repliesCount: d.repliesCount ?? 0,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
  };
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @Inject(forwardRef(() => EpisodesService))
    private readonly episodesService: EpisodesService,
    @Inject(forwardRef(() => PodcastsService))
    private readonly podcastsService: PodcastsService,
  ) {}

  async create(userId: Types.ObjectId, input: { targetType: string; targetId: string; text: string; parentId?: string | null; }) {
    const { targetType, targetId, text, parentId } = input;

    // Basic validation of targetType
    if (targetType !== 'episode' && targetType !== 'podcast') {
      throw new NotFoundException('Invalid targetType');
    }

    // Optionally verify target exists
    if (targetType === 'episode') {
      await this.episodesService.findByIdOrThrow(targetId);
    } else {
      await this.podcastsService.findByIdOrThrow(targetId);
    }

    const doc = await this.commentModel.create({
      userId,
      targetType,
      targetId: new Types.ObjectId(targetId),
      parentId: parentId ? new Types.ObjectId(parentId) : null,
      text: text.trim(),
    });

    // If it's a reply, increment parent's repliesCount
    if (parentId) {
      await this.commentModel.updateOne({ _id: parentId }, { $inc: { repliesCount: 1 } }).exec();
    }

    return toResponse(doc);
  }

  async delete(userId: Types.ObjectId, id: string) {
    const doc = await this.commentModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Comment not found');
    // Only owner or admins (guards in controller) should call this; check owner here
    if (!doc.userId.equals(userId)) {
      throw new NotFoundException('Comment not found');
    }

    // Soft delete
    doc.isDeleted = true;
    await doc.save();

    // If it had a parent, decrement repliesCount
    if (doc.parentId) {
      await this.commentModel.updateOne({ _id: doc.parentId }, { $inc: { repliesCount: -1 } }).exec();
    }

    return;
  }

  async list(targetType: string, targetId: string, options?: { limit?: number; offset?: number; }) {
    const limit = Math.min(options?.limit ?? 20, 100);
    const offset = options?.offset ?? 0;

    const filter: Record<string, unknown> = {
      targetType,
      targetId: new Types.ObjectId(targetId),
      isDeleted: false,
    };

    const items = await this.commentModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean()
      .exec();

    const total = await this.commentModel.countDocuments(filter).exec();
    return { items: items.map(toResponse), total };
  }
}
