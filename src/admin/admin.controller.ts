import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { AdminService } from './admin.service';
import { ReportsService } from '../shared/reports/reports.service';
import { CategoriesService } from '../categories/categories.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { CreateCategoryDto } from '../categories/dto/create-category.dto';
import { UpdateCategoryDto } from '../categories/dto/update-category.dto';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('admin')
@UseGuards(AdminRoleGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly reportsService: ReportsService,
    private readonly categoriesService: CategoriesService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  // --- Report moderation ---
  @Get('reports')
  async listReports(
    @Query('status') status?: 'pending' | 'dismissed' | 'resolved',
    @Query('targetType') targetType?: 'podcast' | 'episode' | 'comment',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.reportsService.list({
      status,
      targetType,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Patch('reports/:id/dismiss')
  async dismissReport(
    @Req() req: Request & { user: UserDocument },
    @Param('id') id: string,
  ) {
    return this.reportsService.dismiss(id, req.user._id);
  }

  @Patch('reports/:id/resolve')
  async resolveReport(
    @Req() req: Request & { user: UserDocument },
    @Param('id') id: string,
  ) {
    return this.reportsService.resolve(id, req.user._id);
  }

  // --- Featured podcast management ---
  @Get('featured-podcasts')
  async listFeaturedPodcasts() {
    return this.adminService.listFeaturedPodcasts();
  }

  @Post('featured-podcasts')
  async addFeaturedPodcast(
    @Body() body: { podcastId: string; order?: number },
  ) {
    return this.adminService.addFeaturedPodcast(
      body.podcastId,
      body.order,
    );
  }

  @Delete('featured-podcasts/:podcastId')
  async removeFeaturedPodcast(@Param('podcastId') podcastId: string) {
    await this.adminService.removeFeaturedPodcast(podcastId);
    return { success: true };
  }

  @Patch('featured-podcasts/:podcastId/order')
  async reorderFeaturedPodcast(
    @Param('podcastId') podcastId: string,
    @Body() body: { order: number },
  ) {
    return this.adminService.reorderFeaturedPodcast(
      podcastId,
      body.order,
    );
  }

  // --- Category CRUD (Admin) ---
  @Post('categories')
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    await this.categoriesService.delete(id);
    return { success: true };
  }

  // --- Platform analytics ---
  @Get('analytics')
  async getPlatformAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getPlatformAnalytics(from, to);
  }
}
