import { PrismaService } from '../prisma/prisma.service';

export interface DisciplineCapability {
  material: boolean;
  labor: boolean;
  dwg: boolean;
}

export interface UserCapabilities {
  mechanical: DisciplineCapability;
  electrical: DisciplineCapability;
}

export function emptyCapabilities(): UserCapabilities {
  return {
    mechanical: { material: false, labor: false, dwg: false },
    electrical: { material: false, labor: false, dwg: false },
  };
}

/**
 * Kullanicinin aktif aboneliklerini okuyup yetenek matrisini turetir.
 *
 * Mantik:
 * - Her abonelik bir level (core/pro) ve scope (mechanical/electrical/mep) icerir
 * - mep scope iki disiplini de kapsar
 * - core seviyesi malzeme yetkisi verir
 * - pro seviyesi malzeme + iscilik + dwg verir
 * - Birden fazla abonelik UNION (en yuksek yetki) olarak hesaplanir
 */
export async function getUserCapabilities(
  prisma: PrismaService,
  userId: string,
): Promise<UserCapabilities> {
  const now = new Date();
  const subs = await prisma.userSubscription.findMany({
    where: {
      userId,
      active: true,
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
  });

  const caps = emptyCapabilities();

  for (const sub of subs) {
    const disciplines: ('mechanical' | 'electrical')[] =
      sub.scope === 'mep'
        ? ['mechanical', 'electrical']
        : sub.scope === 'mechanical'
          ? ['mechanical']
          : ['electrical'];

    for (const d of disciplines) {
      caps[d].material = true;
      if (sub.level === 'pro') {
        caps[d].labor = true;
        caps[d].dwg = true;
      }
    }
  }

  return caps;
}

/**
 * Hizli kontrol helper'i — guard'larda kullanilir.
 */
export function hasCapability(
  caps: UserCapabilities,
  discipline: 'mechanical' | 'electrical',
  feature: 'material' | 'labor' | 'dwg',
): boolean {
  return caps[discipline]?.[feature] === true;
}
