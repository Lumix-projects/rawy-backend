import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListenerOrCreatorGuard } from '../auth/guards/listener-creator.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { LikesService } from './likes.service';
import { UserDocument } from '../users/schemas/user.schema';

class LikeDto {
  @IsString()
  targetType!: string;

  @IsString()
  targetId!: string;
}

@Controller('likes')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  async like(@Req() req: Request & { user: UserDocument }, @Body() dto: LikeDto) {
    await this.likesService.like(req.user._id, dto.targetType, dto.targetId);
    return { message: 'Liked' };
  }

  @Delete()
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlike(@Req() req: Request & { user: UserDocument }, @Query('targetType') targetType: string, @Query('targetId') targetId: string) {
    await this.likesService.unlike(req.user._id, targetType, targetId);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async stats(@Req() req: Request & { user?: UserDocument }, @Query('targetType') targetType: string, @Query('targetId') targetId: string) {
    const userId = req.user ? req.user._id : null;
    return this.likesService.getStats(userId, targetType, targetId);
  }
}
