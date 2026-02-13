import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../guards/roles.guard';

export type UserRole = 'listener' | 'creator' | 'admin';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
