/**
 * PAKET SEVIYESI — TEK KAYNAK (Faz 7 · 2.12, 17.09.2026).
 *
 * ⚠ OLCULEN KUSUR (Faz 2, 07.09): yetki iki yerden okunuyordu — `User.tier`
 * ve firmanin `Abonelik`i — ve `TierGuard` YUKSEK olani aliyordu. `User.tier`i
 * hicbir odeme yolu YAZMIYOR (olculdu: `ozellik/odeme` altinda sifir
 * `user.update({ data: { tier } })`); tek yazan yer yonetici panelinin elle
 * degistirdigi uctu. Yani seviye, satin almayla degil elle dagitilan bir
 * alandan geliyordu ve iptal/dusurme hicbir zaman ERISIMI DARALTMIYORDU.
 *
 * Artik yetki YALNIZ abonelikten gelir. `User.tier` kolonu SILINMEZ (KVKK disa
 * aktarimi saklanan degeri aynen verir, `hesap.servisi.ts`) ama YETKI KAYNAGI
 * olmaktan cikar.
 *
 * ⚠ `durum` ve `erisimSonu` BURADA BILEREK SUZULMEZ. SEVIYE ("hangi paket?")
 * ile SAGLIK ("aboneligi yuruyor mu?") ayri eksenlerdir: saglik `ErisimGuard`
 * ve `capabilities.helper.ts` isidir, ikisi de bilerek suzgecsizdir. Ikisini
 * burada birlestirmek o iki tuketiciyle celisirdi.
 */

/**
 * Seviye siralamasi: Core < Pro < Suite.
 *
 * ⚠ `suite` BUGUN Prisma `PackageLevel` enum'unda YOK (olculdu, 17.09:
 * `schema.prisma` `enum PackageLevel { core pro }`). Burada yine de tanimli:
 * harita `Record<string, number>` oldugu icin enum'a bagli degil ve Blok 2
 * `suite`i actiginda bu dosyaya donmek gerekmesin. Bilinmeyen deger 0'dir —
 * yani hicbir kapiyi acmaz (fail-closed).
 */
export const SEVIYE_SIRASI: Record<string, number> = { core: 1, pro: 2, suite: 3 };

/** Seviye kodunun sira degeri. Bilinmeyen ya da yok → 0 (hicbir kapi acilmaz). */
export function seviyeSirasi(seviye: string | null | undefined): number {
  if (!seviye) return 0;
  return SEVIYE_SIRASI[seviye] ?? 0;
}

/**
 * MUSTERIYE GORUNEN AD (Emre karari, 15.09 · R1/E-5).
 *
 * Teknik enum `core` DEGISMEZ (SQL'ler, `SEVIYE_SIRASI`, API yanitlari,
 * localStorage). Degisen yalnizca EKRANA/METNE giden ad: musteri "CORE"
 * diye bir sey satin almadi, "Basic" satin aldi. On yuzdeki ikizi
 * `frontend/ozellik/odeme/paket-bicim.ts` `SEVIYE_AD`.
 */
export const SEVIYE_GORUNEN_AD: Record<string, string> = {
  core: 'Basic',
  pro: 'Pro',
  suite: 'Suite',
};

/** Kodun musteriye gosterilen adi. Taninmayan kod AYNEN doner — sessizce
 *  "Basic" demez (yanlis ad, yanlis paket satin aldirir). */
export function seviyeGorunenAd(seviye: string | null | undefined): string {
  if (!seviye) return '';
  return SEVIYE_GORUNEN_AD[seviye] ?? seviye;
}

/** `firmaPaketSeviyesi`nin ihtiyac duydugu en dar Prisma yuzeyi. Testler
 *  gercek `PrismaService` kurmadan sahte bir nesne verebilsin diye yapisal. */
export type SeviyePrisma = {
  abonelik: {
    findUnique: (args: unknown) => Promise<unknown>;
  };
};

/**
 * Firmanin abonelik paket seviyesi. Abonelik ya da firma yoksa `null`.
 *
 * ⚠ `firmaId` YOKSA SORGU ATILMAZ. `where: { firmaId: undefined }` Prisma'da
 * kosulu SESSIZCE DUSURUR ve ILK aboneligi dondururdu — firmasiz bir hesap
 * baskasinin paketiyle kapidan gecerdi. Ayni gerekce `kimlik.ts` ve
 * `capabilities.helper.ts:98-101`te de yazili.
 */
export async function firmaPaketSeviyesi(
  prisma: SeviyePrisma,
  firmaId: string | null | undefined,
): Promise<string | null> {
  if (!firmaId) return null;
  const ab = (await prisma.abonelik.findUnique({
    where: { firmaId },
    select: { paketSurumu: { select: { paket: { select: { seviye: true } } } } },
  })) as { paketSurumu?: { paket?: { seviye?: string | null } | null } | null } | null;
  return ab?.paketSurumu?.paket?.seviye ?? null;
}
