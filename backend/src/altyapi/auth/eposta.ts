import type { User } from '@prisma/client';
import type { PrismaService } from '../db/prisma.service';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  E-POSTA ESLESMESI — kayit, giris ve parola sifirlama TEK kural
 *  (FAZ 6.12a / karar K-P6, 15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ OLCULEN ACIK (yol E): `User.email` duz `String @unique` (citext yok) ve
 *  kayit adresi normalize ETMIYORDU. "Ali@firma.com" ile kayitli kisi, hesabini
 *  kapatmadan "ali@firma.com" ile IKINCI hesap + yeni firma + yeni ucretsiz
 *  deneme aliyordu. Giris de birebir eslestirdigi icin kullanici adresini
 *  kayittaki harf bicimiyle yazmak zorundaydi.
 *
 *  KURAL:
 *    · Yeni kayit e-postayi KUCUK HARFLE saklar (`epostaKucult`).
 *    · Kayit, giris ve parola sifirlama buyuk/kucuk harfe DUYARSIZ eslesir
 *      (`epostaIleKullaniciBul`) — ayni adresin baska harf bicimiyle ikinci
 *      hesap acilamaz.
 *    · MEVCUT karisik harfli kayitlar DEGISTIRILMEZ; giris yine calisir.
 *
 *  ⚠ YALNIZ ASCII A-Z kucultulur. `toLocaleLowerCase('tr')` "I"yi "ı" yapar
 *  (ILKER@x.com → ılker@x.com), yerel ayarsiz `toLowerCase` ise "İ"yi iki
 *  karaktere boler; ikisi de adresi baska bir adrese cevirir.
 *
 *  ⚠ BU NORMALIZE SAKLAMA/ESLESME icindir; `+etiket` ve gmail noktasi
 *  ATILMAZ (onlar teslim edilebilir ayri adreslerdir). Deneme kotuye
 *  kullanim anahtari ayri ve daha genistir: odeme/abonelik/deneme-hakki.ts.
 */
const ASCII_BUYUK = /[A-Z]/g;

/** trim + yalniz ASCII A-Z kucuk harf. SAF. */
export function epostaKucult(ham: string | null | undefined): string {
  return String(ham ?? '').trim().replace(ASCII_BUYUK, (h) => h.toLowerCase());
}

/**
 * Duyarsiz aramada dondurulen azami aday. Normalde 0-2 satir doner (ikizler
 * yalniz K-P6 oncesi kayitlarda olabilir); sinir yalniz asagidaki joker
 * ihtimaline karsi bellegi korur.
 */
const ADAY_SINIRI = 20;

/**
 * E-postayla kullaniciyi bulur — buyuk/kucuk harfe duyarsiz.
 *
 * ⚠ IKI ASAMA, BILINCLI: Prisma PostgreSQL'de duyarsiz karsilastirmayi ILIKE
 * ile kurar; `_` ve `%` degerin icinde KACIRILMAZSA joker olur ve
 * "a_i@x.com" ile "ali@x.com" eslesirdi (davranis bu depoda olculmedi).
 * Bu yuzden veritabani yalniz ADAYLARI getirir, gercek esitlik burada, JS'te
 * `epostaKucult` ile kurulur — joker kacsa da yanlis hesaba giris olmaz.
 *
 * Birden cok aday (K-P6 oncesi acilmis harf ikizleri): BIREBIR ayni yazilan
 * once, yoksa SILINMEMIS hesap, yoksa EN ESKI. Parola dogrulamasi cagiranda
 * yapilir; yanlis ikiz secilse bile sonuc "gecersiz kimlik"tir, baskasinin
 * hesabi acilmaz. (Silinmis ikiz once gelseydi etkin hesabin sahibi baska
 * harf bicimiyle yazinca "hesabiniz kapatilmis" gorurdu.)
 */
export async function epostaIleKullaniciBul(
  db: { user: Pick<PrismaService['user'], 'findMany'> },
  ham: string | null | undefined,
): Promise<User | null> {
  const adres = String(ham ?? '').trim();
  if (!adres) return null;
  const adaylar = await db.user.findMany({
    where: { email: { equals: adres, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
    take: ADAY_SINIRI,
  });
  const anahtar = epostaKucult(adres);
  const eslesen = adaylar.filter((u) => epostaKucult(u.email) === anahtar);
  return (
    eslesen.find((u) => u.email === adres) ??
    eslesen.find((u) => !u.deletedAt) ??
    eslesen[0] ??
    null
  );
}
