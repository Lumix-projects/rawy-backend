import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly preferenceService: NotificationPreferenceService,
  ) {}

  @Get()
  async list(
    @Req() req: Request & { user: UserDocument },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const opts = {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      unreadOnly:
        unreadOnly === 'true' || unreadOnly === '1' ? true : undefined,
    };
    return this.notificationsService.listForUser(req.user._id, opts);
  }

  @Patch(':id/read')
  async markAsRead(
    @Req() req: Request & { user: UserDocument },
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(id, req.user._id);
  }

  @Post('read-all')
  async markAllAsRead(@Req() req: Request & { user: UserDocument }) {
    const count = await this.notificationsService.markAllAsRead(req.user._id);
    return { markedCount: count };
  }

  @Get('preferences')
  async getPreferences(@Req() req: Request & { user: UserDocument }) {
    return this.preferenceService.getPreferences(req.user._id);
  }

  @Patch('preferences')
  async updatePreferences(
    @Req() req: Request & { user: UserDocument },
    @Body()
    body: Partial<{
      newEpisode: boolean;
      milestone: boolean;
      review: boolean;
      system: boolean;
    }>,
  ) {
    return this.preferenceService.updatePreferences(req.user._id, body);
  }
}
