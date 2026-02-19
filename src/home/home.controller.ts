import { Controller, Get, Query, Req } from '@nestjs/common';
import { HomeService } from './home.service';
import { HomeResponseDto } from './dto/home-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller()
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Public()
  @Get('home')
  async getHome(
    @Req() req: any,
    @Query('locale') locale?: string,
    @Query('limit') limit?: string,
    @Query('userId') userIdParam?: string,
  ): Promise<HomeResponseDto> {
    // userId from JWT takes priority; fallback to query param (useful for testing/demo)
    const userId = req.user?.sub || userIdParam || undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.homeService.getHome(userId, locale, parsedLimit ?? 6);
  }
}
