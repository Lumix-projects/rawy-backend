import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { IsString, IsOptional, IsNumberString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListenerOrCreatorGuard } from '../auth/guards/listener-creator.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CommentsService } from './comments.service';
import { UserDocument } from '../users/schemas/user.schema';

class CreateCommentDto {
  @IsString()
  targetType!: string;

  @IsString()
  targetId!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsString()
  text!: string;
}

class ListQueryDto {
  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsNumberString()
  offset?: string;
}

@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  async create(
    @Req() req: Request & { user: UserDocument },
    @Body() dto: CreateCommentDto,
  ) {
    const doc = await this.commentsService.create(req.user._id, {
      targetType: dto.targetType,
      targetId: dto.targetId,
      text: dto.text,
      parentId: dto.parentId,
    });
    return doc;
  }

  @Public()
  @Get()
  async list(@Query('targetType') targetType: string, @Query('targetId') targetId: string, @Query() query: ListQueryDto) {
    if (!targetType || !targetId) throw new BadRequestException('targetType and targetId are required');
    const res = await this.commentsService.list(targetType, targetId, {
      limit: query.limit ? Number(query.limit) : 20,
      offset: query.offset ? Number(query.offset) : 0,
    });
    return res;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, ListenerOrCreatorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request & { user: UserDocument }, @Param('id') id: string) {
    await this.commentsService.delete(req.user._id, id);
  }
}
