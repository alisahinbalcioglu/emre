import { PrismaService } from '../db/prisma.service';
import { abonelikErisimi } from './abonelik-erisim';

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
 *  yalniz tier yazar, `admin.addUserSubscription` yalniz abonelik yazar
 *  (ikisi de 17.09 / 24.09'da kapatildi; paket artik yalniz abonelikten).
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
 *  ── 2.13 (22.09.2026): YETENEK ARTIK ERISIM KARARINDAN SUZULUR ─────────
 *  ESKI HAL: "yetenek DURUMDAN bagimsiz doner; kapatmayi ErisimServisi
 *  yapar." Gerekce soyleydi: "odemesi geciken firmanin yetenekleri
 *  sifirlansaydi on yuz 'Pro paketiniz askida' diyemezdi, cunku paketin Pro
 *  oldugunu artik bilemezdi."
 *
 *  ⚠ O GEREKCENIN IKI AYAGI DA OLCULDU, IKISI DE CURUK:
 *
 *  1) "On yuz paketi bilemezdi" ARTIK DOGRU DEGIL. ADIM 2'den beri
 *     `/auth/me` ayni yanitta `erisim`i de doneriyor (auth.service.ts:329)
 *     ve `ErisimKarari` `paketKodu` + `durum` + `uyari` tasiyor — durumdan
 *     BAGIMSIZ olarak (erisim.servisi.ts `temel` nesnesi). Ustelik `tier`
 *     alani da ayni yanitta. "Hangi paketteydim" sorusu bu dosyadan DEGIL,
 *     oradan cevaplaniyor; `CapabilitiesContext` ikisini birden tutuyor.
 *
 *  2) KORKULAN SENARYO ZATEN ETKILENMIYOR. "Odemesi geciken" firma
 *     `ODEME_BEKLIYOR` (tolerans) ya da `KISITLI` (salt-okunur) durumundadir
 *     ve `abonelikErisimi` IKISINE DE `erisimVar: true` verir → yetenekler
 *     SIFIRLANMAZ. Sifirlanan tek kume gercekten erisimi OLMAYANLAR:
 *     `ASKIDA`, `SONA_ERDI`, suresi dolmus `DENEME`, suresi dolmus `IPTAL`.
 *
 *  Yeni kural: yetenek = SATIN ALINAN (disiplin+seviye) ∧ ERISIM VAR.
 *  Olcut ham `durum` DEGIL, `abonelik-erisim.ts` karari — ayni cekirdegi
 *  `ErisimServisi.karar` ve `seviye.ts` de okur, ikiz kural YOK.
 *
 *  ⚠ `saltOkunur` BURADA UYGULANMAZ: salt-okunur firma yeteneklerini
 *  KORUR (kutuphanesini gorur), yazmayi `ErisimGuard` kapatir. Ikisi ayri
 *  sorudur ve `KISITLI_MODDA_ACIK` kumesi o ayrimin tek yeridir.
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

/** Firmanin aboneliginden ETKIN yetenek matrisini turetir (erisim suzgecli). */
export async function getFirmaCapabilities(
  prisma: PrismaService,
  firmaId: string | null | undefined,
  simdi: Date = new Date(),
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

  // ── 2.13: ERISIM YOKSA YETENEK DE YOK ────────────────────────────────
  // Olcut ham `durum` DEGIL, saf cekirdegin karari: odenmis donemi suren
  // IPTAL aboneligi `erisimVar: true` alir ve yeteneklerini KORUR.
  if (!abonelikErisimi({ durum: ab.durum, erisimSonu: ab.erisimSonu }, simdi).erisimVar) {
    return emptyCapabilities();
  }

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
  simdi: Date = new Date(),
): Promise<UserCapabilities> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firmaId: true },
  });
  return getFirmaCapabilities(prisma, user?.firmaId, simdi);
}
