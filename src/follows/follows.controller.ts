import {
    Controller,
    Post,
    Delete,
    Get,
    Param,
    Req,
    Query,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { FollowsService } from './follows.service';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('follows')
export class FollowsController {
    constructor(private readonly followsService: FollowsService) { }

    @Post(':id')
    @UseGuards(JwtAuthGuard)
    async follow(
        @Req() req: Request & { user: UserDocument },
        @Param('id') id: string,
    ) {
        await this.followsService.follow(req.user._id, id);
        return { message: 'Followed' };
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    async unfollow(
        @Req() req: Request & { user: UserDocument },
        @Param('id') id: string,
    ) {
        await this.followsService.unfollow(req.user._id, id);
    }

    @Public()
    @UseGuards(OptionalJwtAuthGuard)
    @Get(':id/stats')
    async getStats(
        @Param('id') id: string,
        @Req() req: Request & { user?: UserDocument },
    ) {
        const stats = await this.followsService.getStats(id);
        let isFollowing = false;
        if (req.user) {
            isFollowing = await this.followsService.checkIsFollowing(req.user._id, id);
        }
        return { ...stats, isFollowing };
    }

    @Public()
    @Get(':id/followers')
    async getFollowers(
        @Param('id') id: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        return this.followsService.getFollowers(
            id,
            limit ? Number(limit) : 20,
            offset ? Number(offset) : 0,
        );
    }

    @Public()
    @Get(':id/following')
    async getFollowing(
        @Param('id') id: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        return this.followsService.getFollowing(
            id,
            limit ? Number(limit) : 20,
            offset ? Number(offset) : 0,
        );
    }
}
