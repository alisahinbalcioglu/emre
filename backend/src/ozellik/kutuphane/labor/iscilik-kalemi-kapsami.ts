/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ISCILIK KALEMI KAPSAMI — kiraci sinirinin TEK kural yeri (30.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  `LaborItem.ownerFirmaId`:
 *    null  → YONETICI KATALOGU. Herkes okur; yalniz yonetici (`/labor` yazma
 *            uclari) yazar.
 *    dolu  → o KIRACININ kalemi (yuklemesi acti). Yalniz o firma gorur,
 *            yalniz o firmanin islemleri yazar.
 *
 *  NEDEN (Paket 1 / C2-C1): kiraci yuklemesi `isGlobal: true` kalem aciyordu
 *  (ad + kiracinin birim fiyati) ve GET /labor filtresizdi — her pro kiraci
 *  baskasinin kalemini ve fiyatini goruyordu. Ayni adi yukleyen ikinci
 *  kiraci birincinin kalemine baglaniyor, satir adini degistiren kiraci
 *  ORTAK kalemin adini (baskasinin satiri dahil) degistiriyordu.
 *
 *  KURALLAR:
 *   · Kiraci bir kalemi YALNIZ kendi kalemleri ve katalog icinde arar
 *     (ayni ad, ayni disiplin, buyuk-kucuk harf duyarsiz); ikisi de varsa
 *     KENDI kalemi once. Bulamazsa KENDI kalemini acar. Baska kiracinin
 *     kalemi hicbir sorguda donmez.
 *   · Kiraci islemi katalog kalemine YAZMAZ: bayat indeks/etiket tazelemesi,
 *     yeniden indeksleme ve ad degisikligi yalniz kendi kaleminde. Katalogun
 *     bayat indeksi eslestirmede istek aninda uretilir (hazirlaLaborPool).
 *   · Ad degisikligi satirin BAGINI tasir (labor-firms.service
 *     `adDegisikligiHedefi`); ortak kalem yerinde adlanmaz.
 *
 *  ⚠ FAIL-CLOSED: firmasiz kimlik gelirse FIRLATIR. `{ ownerFirmaId:
 *    undefined }` Prisma'da kosulu DUSURUR ve `OR` her satiri dondururdu —
 *    tam da kapatilan sizinti. `kimlikCoz` firmasizi zaten 403'ler; bu,
 *    o kapiyi atlayan bir cagriya karsi ikinci kilit.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Kimlik } from '../../../altyapi/auth/kimlik';

function kiraciKimligi(k: Kimlik): string {
  if (!k?.firmaId) throw new ForbiddenException('İşçilik kalemi için firma kimliği gerekli');
  return k.firmaId;
}

/** Yonetici katalogu: sahipsiz kalemler (`ek` kosuluyla birlikte). */
export function katalogda(ek: Prisma.LaborItemWhereInput = {}): Prisma.LaborItemWhereInput {
  return { AND: [ek, { ownerFirmaId: null }] };
}

/** Kiracinin GORDUGU kalemler: katalog + KENDI kalemleri (`ek` ile birlikte). */
export function kiraciKapsaminda(k: Kimlik, ek: Prisma.LaborItemWhereInput = {}): Prisma.LaborItemWhereInput {
  return { AND: [ek, { OR: [{ ownerFirmaId: kiraciKimligi(k) }, { ownerFirmaId: null }] }] };
}

/** Kiracinin YAZABILDIGI kalemler: yalniz kendi kalemleri. */
export function kiracininKalemleri(k: Kimlik, ek: Prisma.LaborItemWhereInput = {}): Prisma.LaborItemWhereInput {
  return { AND: [ek, { ownerFirmaId: kiraciKimligi(k) }] };
}

export function kiracininKalemiMi(k: Kimlik, kalem: { ownerFirmaId?: string | null }): boolean {
  return kalem.ownerFirmaId != null && kalem.ownerFirmaId === kiraciKimligi(k);
}

/** Ayni adda hem kendi hem katalog kalemi varsa KENDI kalemi once; esitlikte en eski. */
export const KENDI_KALEMI_ONCE: Prisma.LaborItemOrderByWithRelationInput[] = [
  { ownerFirmaId: { sort: 'asc', nulls: 'last' } },
  { createdAt: 'asc' },
];

/**
 * ADA GORE KALEM ARAMASI (buyuk-kucuk harf duyarsiz, BIREBIR). Prisma 5.22
 * `equals` + `mode: 'insensitive'`i PostgreSQL'de `ILIKE $1`e cevirir ve
 * `%` `_` `\`i KACISLAMAZ — 01.10.2026 gercek PG 17'de olculdu: "a%" adi uc
 * farkli kaleme eslesti, sonda `\` PG 22025 hatasi (500) verdi. Kiracinin
 * yazdigi ad baska bir kaleme baglanmasin diye ucu de ters boluyle duz
 * yapilir; harf duyarsizligi korunur (olculdu).
 */
export function adEsit(ad: string): { equals: string; mode: 'insensitive' } {
  return { equals: ad.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' };
}

/** Kiracinin actigi kalemin sahiplik alanlari (`isGlobal` sahiplikten TURER). */
export function kiraciKalemiAlanlari(k: Kimlik): { ownerFirmaId: string; isGlobal: false } {
  return { ownerFirmaId: kiraciKimligi(k), isGlobal: false };
}
