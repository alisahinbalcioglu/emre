import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

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
