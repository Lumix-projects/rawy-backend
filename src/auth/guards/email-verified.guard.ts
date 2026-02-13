import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserDocument } from '../../users/schemas/user.schema';

export const SKIP_EMAIL_VERIFIED_KEY = 'skipEmailVerified';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_EMAIL_VERIFIED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as UserDocument | undefined;

    if (!user) {
      return true;
    }

    if (user.passwordHash && !user.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email before accessing this resource.',
      );
    }

    return true;
  }
}
