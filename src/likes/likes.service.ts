import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Like, LikeDocument } from './schemas/like.schema';
import { Comment, CommentDocument } from '../comments/schemas/comment.schema';

@Injectable()
export class LikesService {
  constructor(
    @InjectModel(Like.name)
    private readonly likeModel: Model<LikeDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
  ) {}

  async like(userId: Types.ObjectId, targetType: string, targetId: string) {
    const doc = new this.likeModel({ userId, targetType, targetId: new Types.ObjectId(targetId) });
    try {
      await doc.save();
    } catch (e) {
      // duplicate key -> already liked
      return;
    }

    // If target is comment, increment its likesCount
    if (targetType === 'comment') {
      await this.commentModel.updateOne({ _id: targetId }, { $inc: { likesCount: 1 } }).exec();
    }
  }

  async unlike(userId: Types.ObjectId, targetType: string, targetId: string) {
    const res = await this.likeModel.deleteOne({ userId, targetType, targetId: new Types.ObjectId(targetId) }).exec();
    if (res.deletedCount && targetType === 'comment') {
      await this.commentModel.updateOne({ _id: targetId }, { $inc: { likesCount: -1 } }).exec();
    }
  }

  async getStats(userId: Types.ObjectId | null, targetType: string, targetId: string) {
    const total = await this.likeModel.countDocuments({ targetType, targetId: new Types.ObjectId(targetId) }).exec();
    let isLiked = false;
    if (userId) {
      const exists = await this.likeModel.findOne({ userId, targetType, targetId: new Types.ObjectId(targetId) }).lean().exec();
      isLiked = !!exists;
    }
    return { total, isLiked };
  }
}
