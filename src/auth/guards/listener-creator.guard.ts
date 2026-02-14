import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class ListenerOrCreatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }
    const allowedRoles = ['listener', 'creator', 'admin'];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        'This action requires Listener, Creator, or Admin role',
      );
    }
    return true;
  }
}
