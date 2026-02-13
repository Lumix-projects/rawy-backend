import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Public } from './decorators/public.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { UserDocument } from '../users/schemas/user.schema';
import { RegisterListenerDto } from './dto/register-listener.dto';
import { RegisterCreatorDto } from './dto/register-creator.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { toUserResponse } from '../users/dto/user-response.dto';

@Controller('auth')
@Public()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/listener')
  @Throttle({ 'auth-sensitive': { limit: 3, ttl: 3600000 } })
  async registerListener(@Body() dto: RegisterListenerDto) {
    const user = await this.authService.registerListener(dto);
    return toUserResponse(user);
  }

  @Post('register/creator')
  @Throttle({ 'auth-sensitive': { limit: 3, ttl: 3600000 } })
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async registerCreator(
    @Body() dto: RegisterCreatorDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    const user = await this.authService.registerCreator(
      dto,
      avatar
        ? {
            buffer: avatar.buffer,
            mimetype: avatar.mimetype,
            size: avatar.size,
          }
        : undefined,
    );
    return toUserResponse(user);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ 'auth-sensitive': { limit: 3, ttl: 3600000 } })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const user = await this.authService.verifyEmail(dto.token);
    return toUserResponse(user);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ login: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ 'auth-sensitive': { limit: 3, ttl: 3600000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Guard redirects to Google - no body executed
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request & { user?: UserDocument }) {
    const user = req.user;
    if (!user) {
      throw new BadRequestException('OAuth authentication failed');
    }
    return this.authService.issueTokensForUser(user);
  }
}
