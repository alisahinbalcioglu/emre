import { PrismaService } from '../db/prisma.service';

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
 * ═══════════════════════════════════════════════════════════════════════════
 *  YETENEK MATRISI — "firma NEYI SATIN ALDI"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ KAYNAK DEGISTI (ADIM 2, 28.08). Onceden `UserSubscription` (KISI bazli)
 *  okunuyordu; artik firmanin Abonelik→PaketSurumu→Paket zincirinden
 *  TURETILIYOR. Karar gerekcesi:
 *
 *  Sistemde UC ayri erisim kaynagi birikmisti ve UCU DE ayri cevap
 *  verebiliyordu:
 *    (a) `User.tier` (core/pro/suite) — TierGuard, 2 ucta,
 *    (b) `UserSubscription` (level × scope) — capabilities, KISI bazli,
 *    (c) ADIM 2'nin `Abonelik`i — FIRMA bazli.
 *  (a) ile (b) hicbir yerde uzlastirilmiyordu: `admin.updateUserTier`
 *  yalniz tier yazar, `admin.addUserSubscription` yalniz abonelik yazar.
 *  Yani tier='pro' ama aboneligi olmayan (ya da tersi) kullanicilar
 *  uretilebiliyordu ve hangi kapinin hangisini okudugu tesadufiydi.
 *
 *  ADIM 2 ucuncu bir kaynak EKLEMEK yerine tekillestirdi: Abonelik TEK
 *  DOGRU KAYNAK, digerleri ondan turetilir.
 *
 *  ── SOZLESME AYNEN KORUNDU ──────────────────────────────────────────────
 *  Donen sekil ({mechanical:{material,labor,dwg}, electrical:{...}})
 *  DEGISMEDI. `CapabilitiesContext` ve `useCapabilities` tuketicileri
 *  (dashboard, labor-firms, quotes/new, quotes/[id], profile) hicbir
 *  degisiklik gerektirmez.
 *
 *  ── YETENEK ≠ ERISIM (ikisi DIK, biri digerini kapsamaz) ───────────────
 *  Bu dosya "NE SATIN ALINDI" sorusunu cevaplar (disiplin + seviye).
 *  "SU AN KULLANILABILIR MI" sorusu AYRIDIR ve `ErisimServisi`e aittir
 *  (odeme gecikti mi, askida mi, deneme bitti mi).
 *
 *  Ikisini birlestirmek CAZIP ama YANLIS olurdu: odemesi geciken bir
 *  firmanin yetenekleri SIFIRLANSAYDI, on yuz "Pro paketiniz askida"
 *  diyemezdi — cunku paketin Pro oldugunu artik bilemezdi. Kullanici
 *  "hangi paketteydim" sorusunun cevabini odeme sorununu cozmek icin
 *  gorebilmeli. Bu yuzden yetenek DURUMDAN bagimsiz doner; kapatmayi
 *  ErisimServisi yapar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Paketin kapsam+seviyesini yetenek matrisine cevirir. Saf fonksiyon. */
export function paketiYetenegeCevir(p: {
  kapsam: 'mechanical' | 'electrical' | 'mep' | string;
  seviye: 'core' | 'pro' | string;
  dwgAktif: boolean;
}): UserCapabilities {
  const caps = emptyCapabilities();

  const disiplinler: ('mechanical' | 'electrical')[] =
    p.kapsam === 'mep'
      ? ['mechanical', 'electrical']
      : p.kapsam === 'mechanical'
        ? ['mechanical']
        : p.kapsam === 'electrical'
          ? ['electrical']
          : [];

  for (const d of disiplinler) {
    caps[d].material = true;
    if (p.seviye === 'pro') {
      caps[d].labor = true;
      // dwg seviyeden BAGIMSIZ bir anahtar: "dwg'siz pro" ya da ileride
      // "dwg'li core" satilabilsin diye Paket'te ayri alan tutuluyor.
      caps[d].dwg = p.dwgAktif;
    }
  }

  return caps;
}

/** Firmanin aboneliginden yetenek matrisini turetir. */
export async function getFirmaCapabilities(
  prisma: PrismaService,
  firmaId: string | null | undefined,
): Promise<UserCapabilities> {
  // ⚠ firmaId yoksa SORGU ATILMAZ. Prisma'da `where: { firmaId: undefined }`
  // kosulu SESSIZCE DUSER ve findFirst rastgele bir firmanin aboneligini
  // dondururdu — capraz-tenant yetki sizintisi. Bkz. kimlik.ts uyarisi.
  if (!firmaId) return emptyCapabilities();

  const ab = await prisma.abonelik.findUnique({
    where: { firmaId },
    include: { paketSurumu: { include: { paket: true } } },
  });
  if (!ab) return emptyCapabilities();

  return paketiYetenegeCevir({
    kapsam: ab.paketSurumu.paket.kapsam,
    seviye: ab.paketSurumu.paket.seviye,
    dwgAktif: ab.paketSurumu.paket.dwgAktif,
  });
}

/**
 * Kullanicidan yola cikan eski imza — cagiranlar korunsun diye duruyor.
 * Kullanicinin firmasini cozup {@link getFirmaCapabilities}'e devreder.
 */
export async function getUserCapabilities(
  prisma: PrismaService,
  userId: string,
): Promise<UserCapabilities> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firmaId: true },
  });
  return getFirmaCapabilities(prisma, user?.firmaId);
}
