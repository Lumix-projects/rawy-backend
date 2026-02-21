import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Follow, FollowDocument } from './schemas/follow.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class FollowsService {
    constructor(
        @InjectModel(Follow.name) private readonly followModel: Model<FollowDocument>,
        @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
    ) { }

    async follow(followerId: Types.ObjectId, followingIdStr: string) {
        if (followerId.toString() === followingIdStr) {
            throw new BadRequestException('You cannot follow yourself');
        }

        const followingId = new Types.ObjectId(followingIdStr);
        const userToFollow = await this.usersService.findById(followingIdStr);
        if (!userToFollow) throw new NotFoundException('User not found');

        const existing = await this.followModel.findOne({ followerId, followingId }).exec();
        if (existing) throw new BadRequestException('Already following');

        await this.followModel.create({ followerId, followingId });
    }

    async unfollow(followerId: Types.ObjectId, followingIdStr: string) {
        const result = await this.followModel.deleteOne({
            followerId,
            followingId: new Types.ObjectId(followingIdStr),
        }).exec();

        if (result.deletedCount === 0) {
            throw new NotFoundException('Not following this user');
        }
    }

    async getStats(userId: string) {
        const userObjId = new Types.ObjectId(userId);
        const followers = await this.followModel.countDocuments({ followingId: userObjId }).exec();
        const following = await this.followModel.countDocuments({ followerId: userObjId }).exec();
        return { followers, following };
    }

    async checkIsFollowing(followerId: Types.ObjectId, followingIdStr: string) {
        const existing = await this.followModel.findOne({
            followerId,
            followingId: new Types.ObjectId(followingIdStr),
        }).exec();
        return !!existing;
    }
}
