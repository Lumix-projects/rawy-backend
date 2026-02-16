import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ListenerOrCreatorGuard } from '../../auth/guards/listener-creator.guard';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UserDocument } from '../../users/schemas/user.schema';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  async create(
    @Req() req: Request & { user: UserDocument },
    @Body() dto: CreateReportDto,
  ) {
    const doc = await this.reportsService.create(
      req.user._id,
      dto.targetType,
      dto.targetId,
      dto.reason,
    );
    return {
      id: doc._id.toString(),
      targetType: doc.targetType,
      targetId: doc.targetId.toString(),
      status: doc.status,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
