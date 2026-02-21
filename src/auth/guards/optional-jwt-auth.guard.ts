import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Tries to authenticate via JWT but never throws.
 * If the token is valid  → req.user is populated.
 * If no token / invalid  → req.user stays undefined (unauthenticated).
 * Use this on endpoints that are public but need to know the caller's identity when available.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // Swallow auth errors — the request continues unauthenticated
    }
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest<T>(_err: any, user: T): T | null {
    return user ?? null;
  }
}
