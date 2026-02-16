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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from './users.service';
import { UserDocument } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpgradeCreatorDto } from './dto/upgrade-creator.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { toUserResponse } from './dto/user-response.dto';

@ApiTags('Users')
@ApiBearerAuth('bearerAuth')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(EmailVerifiedGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
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
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: 200,
    description: 'Updated profile',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async updateProfile(
    @Req() req: Request & { user: UserDocument },
    @Body() dto: UpdateProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    const creatorInput: { showName?: string; categoryId?: string } | undefined =
      req.user.creatorProfile && req.user.role === 'creator' ? {} : undefined;
    if (creatorInput) {
      if (dto.showName !== undefined) creatorInput.showName = dto.showName;
      if (dto.categoryId !== undefined)
        creatorInput.categoryId = dto.categoryId;
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
  @ApiOperation({ summary: 'Upgrade Listener to Creator' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpgradeCreatorDto })
  @ApiResponse({
    status: 200,
    description: 'Upgraded to creator',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Already Creator or missing fields',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Not a Listener' })
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
