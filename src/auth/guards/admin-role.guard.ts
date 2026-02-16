import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }
    if (user.role !== 'admin') {
      throw new ForbiddenException('This action requires Admin role');
    }
    return true;
  }
}
