import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { teklifKapsamiCoz, type TeklifKapsami } from '../../ozellik/firma/uye-izinleri';

/**
 * KIMLIK — bir istegin hangi KISI ve hangi FIRMA adina koştugu (ADIM 1, 28.08).
 *
 * Hesap artik kisi degil FIRMA: teklifler, kutuphane ve abonelik firmaya ait.
 * Ama "kim yaratti" bilgisi kisiye ait kalir. Bu yuzden iki alan da tasinir:
 *   firmaId → SUZGEC (ne gorurum, neye dokunabilirim)
 *   userId  → YAZAR  (kaydi kim olusturdu)
 */
export type Kimlik = { userId: string; firmaId: string };

/**
 * Istek sahibinden kimligi cozer.
 *
 * ⚠ EN KRITIK KURAL — FIRMASIZ HESAP GECEMEZ. Prisma'da `where: { firmaId: undefined }`
 * kosulu SESSIZCE DUSURUR: firmasiz bir hesap butun firmalarin tekliflerini
 * gorurdu. `where: { firmaId: null }` ise henuz atanmamis TUM satirlari doner —
 * yine capraz-tenant sizinti. Ikisi de sessiz oldugu icin burada GURULTULU
 * durulur: firmasi olmayan hesap 403 alir.
 *
 * Firmasiz hesap normalde OLUSMAZ (backfill mevcutlari atadi, kayit akisi
 * yenilere firma aciyor); bu kapi o iki yolun birinde acilacak deligi yakalar.
 */
export function kimlikCoz(user: unknown): Kimlik {
  const u = user as { id?: string; firmaId?: string | null } | undefined;
  if (!u?.id) throw new UnauthorizedException();
  if (!u.firmaId) {
    throw new ForbiddenException(
      'Hesabiniz bir firmaya bagli degil. Yoneticinize basvurun (firma atamasi gerekiyor).',
    );
  }
  return { userId: u.id, firmaId: u.firmaId };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TEKLIF KIMLIGI — kimlik + TEKLIF KAPSAMI (23.09.2026, "Ekip & Izinler")
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Emre karari: "Son teklifler & tutar" izni KAPALI alt kullanici YALNIZ KENDI
 * hazirladigi teklifleri gorur. Kapsam `Quote.userId` (YAZAR) ile daralir;
 * `firmaId` suzgeci AYNEN kalir (kapsam firma suzgecini GENISLETEMEZ).
 *
 * ⚠ AYRI TIP, `Kimlik`e opsiyonel alan DEGIL: teklif OKUYAN her servis
 * metodu `TeklifKimligi` ister; duz `Kimlik` gecen bir cagri DERLENMEZ.
 * Opsiyonel alan olsaydi unutulan bir cagri kapsamsiz (= firmanin tamami)
 * kosardi ve hic kimse fark etmezdi.
 */
export type TeklifKimligi = Kimlik & { teklifKapsami: TeklifKapsami };

/** Istek sahibinden teklif kimligini cozer (kapsam `uye-izinleri.ts`ten). */
export function teklifKimligiCoz(user: unknown): TeklifKimligi {
  return { ...kimlikCoz(user), teklifKapsami: teklifKapsamiCoz(user as never) };
}

/**
 * TEKLIF SORGUSUNUN TEK `where` URETICISI. Teklif okuyan/yazan her sorgu
 * buradan gecer (liste, ekran, guncelleme, silme, cikti, ceviri, pano
 * sayisi). `ek` once yayilir, sonra kapsam alanlari YAZILIR — cagiran
 * `firmaId`/`userId`i ezemez.
 */
export function teklifKosulu<T extends Record<string, unknown>>(
  k: TeklifKimligi,
  ek?: T,
): T & { firmaId: string; userId?: string } {
  const temel = { ...(ek ?? ({} as T)), firmaId: k.firmaId };
  // ⚠ FAIL-CLOSED: `'firma'` DISINDA her deger (bozuk/eksik alan dahil)
  // yalniz kendi tekliflerine daralir.
  return k.teklifKapsami === 'firma' ? temel : { ...temel, userId: k.userId };
}
