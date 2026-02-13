import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from './users.service';
import { UserDocument } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpgradeCreatorDto } from './dto/upgrade-creator.dto';
import { toUserResponse } from './dto/user-response.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(EmailVerifiedGuard)
  async getProfile(@Req() req: Request & { user: UserDocument }) {
    const user = await this.usersService.findById(req.user._id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toUserResponse(user);
  }

  @Patch('me')
  @UseGuards(EmailVerifiedGuard)
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async updateProfile(
    @Req() req: Request & { user: UserDocument },
    @Body() dto: UpdateProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    const creatorInput: { showName?: string; categoryId?: string } | undefined =
      req.user.creatorProfile && req.user.role === 'creator'
        ? {}
        : undefined;
    if (creatorInput) {
      if (dto.showName !== undefined) creatorInput.showName = dto.showName;
      if (dto.categoryId !== undefined) creatorInput.categoryId = dto.categoryId;
    }

    const user = await this.usersService.updateProfile(
      req.user._id,
      {
        bio: dto.bio,
        website: dto.website,
        twitter: dto.twitter,
        instagram: dto.instagram,
        avatar: avatar
          ? {
              buffer: avatar.buffer,
              mimetype: avatar.mimetype,
              size: avatar.size,
            }
          : undefined,
      },
      creatorInput,
    );
    return toUserResponse(user);
  }

  @Post('me/upgrade-creator')
  @UseGuards(EmailVerifiedGuard, RolesGuard)
  @Roles('listener')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async upgradeCreator(
    @Req() req: Request & { user: UserDocument },
    @Body() dto: UpgradeCreatorDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    const user = await this.usersService.upgradeToCreator(req.user._id, {
      showName: dto.showName,
      categoryId: dto.categoryId,
      avatar: avatar
        ? {
            buffer: avatar.buffer,
            mimetype: avatar.mimetype,
            size: avatar.size,
          }
        : undefined,
    });
    return toUserResponse(user);
  }
}
