import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Follow, FollowDocument } from './schemas/follow.schema';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FollowsService {
    constructor(
        @InjectModel(Follow.name) private readonly followModel: Model<FollowDocument>,
        @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
        private readonly notificationsService: NotificationsService,
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

        // Fire-and-forget: notify the followed user
        const follower = await this.usersService.findById(followerId.toString());
        if (follower) {
            this.notificationsService
                .notifyNewFollower(followingId, follower.username, followerId)
                .catch(() => { /* non-critical */ });
        }
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

    async getFollowers(userId: string, limit = 20, offset = 0) {
        const userObjId = new Types.ObjectId(userId);
        const [docs, total] = await Promise.all([
            this.followModel
                .find({ followingId: userObjId })
                .skip(offset)
                .limit(limit)
                .populate('followerId', 'username avatarUrl bio role')
                .lean()
                .exec(),
            this.followModel.countDocuments({ followingId: userObjId }).exec(),
        ]);
        const items = docs.map((d: any) => ({
            id: d.followerId._id?.toString() ?? d.followerId.toString(),
            username: d.followerId.username ?? '',
            avatarUrl: d.followerId.avatarUrl ?? null,
            bio: d.followerId.bio ?? null,
            role: d.followerId.role ?? 'listener',
        }));
        return { items, total };
    }

    async getFollowing(userId: string, limit = 20, offset = 0) {
        const userObjId = new Types.ObjectId(userId);
        const [docs, total] = await Promise.all([
            this.followModel
                .find({ followerId: userObjId })
                .skip(offset)
                .limit(limit)
                .populate('followingId', 'username avatarUrl bio role')
                .lean()
                .exec(),
            this.followModel.countDocuments({ followerId: userObjId }).exec(),
        ]);
        const items = docs.map((d: any) => ({
            id: d.followingId._id?.toString() ?? d.followingId.toString(),
            username: d.followingId.username ?? '',
            avatarUrl: d.followingId.avatarUrl ?? null,
            bio: d.followingId.bio ?? null,
            role: d.followingId.role ?? 'listener',
        }));
        return { items, total };
    }
}
