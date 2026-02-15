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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
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
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TokenPairDto } from './dto/token-pair.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { toUserResponse } from '../users/dto/user-response.dto';

@ApiTags('Auth')
@Controller('auth')
@Public()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/listener')
  @Throttle({ 'auth-sensitive': { limit: 3, ttl: 3600000 } })
  @ApiOperation({ summary: 'Register as Listener' })
  @ApiResponse({
    status: 201,
    description: 'Account created; verification email sent',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Email or username already in use' })
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
  @ApiOperation({ summary: 'Register as Creator' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: RegisterCreatorDto })
  @ApiResponse({
    status: 201,
    description: 'Creator account created; verification email sent',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Email or username already in use' })
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

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ 'auth-sensitive': { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'Resend verification email' })
  @ApiResponse({ status: 200, description: 'Email sent if user exists and not verified' })
  @ApiResponse({ status: 429, description: 'Wait 2 minutes before requesting again' })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.authService.resendVerificationEmail(dto.email);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ 'auth-sensitive': { limit: 3, ttl: 3600000 } })
  @ApiOperation({ summary: 'Verify email from link' })
  @ApiResponse({
    status: 200,
    description: 'Email verified',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const user = await this.authService.verifyEmail(dto.token);
    return toUserResponse(user);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ login: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    description: 'Success',
    type: TokenPairDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'New token pair',
    type: TokenPairDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ 'auth-sensitive': { limit: 3, ttl: 3600000 } })
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({
    status: 202,
    description: 'Reset email sent (or no-op if email not found)',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth' })
  @ApiResponse({ status: 302, description: 'Redirect to Google consent' })
  async googleAuth() {
    // Guard redirects to Google - no body executed
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({
    status: 200,
    description: 'Tokens on success',
    type: TokenPairDto,
  })
  @ApiResponse({ status: 400, description: 'OAuth error' })
  async googleCallback(@Req() req: Request & { user?: UserDocument }) {
    const user = req.user;
    if (!user) {
      throw new BadRequestException('OAuth authentication failed');
    }
    return this.authService.issueTokensForUser(user);
  }
}
