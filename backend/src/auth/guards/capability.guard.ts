import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { getUserCapabilities, hasCapability } from '../capabilities.helper';

export const CAPABILITY_KEY = 'requiredCapability';

export interface CapabilityRequirement {
  discipline: 'mechanical' | 'electrical';
  feature: 'material' | 'labor' | 'dwg';
}

/**
 * Endpoint icin yetenek kontrolu zorunlu kil.
 *
 * Kullanim:
 *   @RequireCapability({ discipline: 'mechanical', feature: 'labor' })
 *   async pricelLabor() { ... }
 */
export const RequireCapability = (...reqs: CapabilityRequirement[]) =>
  SetMetadata(CAPABILITY_KEY, reqs);

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reqs = this.reflector.get<CapabilityRequirement[]>(
      CAPABILITY_KEY,
      context.getHandler(),
    );
    if (!reqs || reqs.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.user?.id;
    if (!userId) throw new ForbiddenException('Kullanici bulunamadi');

    const caps = await getUserCapabilities(this.prisma, userId);
    // Tum gereklilikleri saglamali (AND)
    for (const req of reqs) {
      if (!hasCapability(caps, req.discipline, req.feature)) {
        throw new ForbiddenException(
          `Bu islem icin "${req.discipline} / ${req.feature}" yetkisi gerekiyor. Lutfen ilgili paketi satin alin.`,
        );
      }
    }
    return true;
  }
}
