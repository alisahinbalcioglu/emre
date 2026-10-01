import { HttpException, type LoggerService } from '@nestjs/common';

/**
 * TOPLU KAYITTA SATIR HATALARI — iscilik (labor-firms) ve malzeme (library)
 * izgara kayitlarinin ORTAK kurali (Paket 1 inceleme 2-3. tur; Paket 4a ikiz,
 * 01.10.2026).
 *
 * YANITA: kendi HTTP hatalarimizin metni (409, 404, 403 — kullaniciya
 * yazildi) aynen; gerisi (Prisma/DB, programlama hatasi) genel metin.
 * Eskiden iki yol da `e.message`i aynen donuyordu: Prisma hatasi sorgu ve alan
 * ayrintisini tarayiciya tasirdi.
 * GUNLUGE: beklenmeyenler istek sonunda TEK satirda (sayi + ilk 3 ornek, her
 * mesaj 500 karakterde kirpilir + ilkinin cagri yigini), JSON — istekten gelen
 * kimlik/mesajdaki satir sonu gunlugu bolemez; Prisma dogrulama hatasi istek
 * degerlerini metne katar, kirpilmazsa tek satir govde boyuna yaklasirdi.
 * Satir basina gunluk sinirsiz satir sayisiyla diski doldurabilirdi.
 */
export const SATIR_KAYDEDILEMEDI = 'Satır kaydedilemedi (beklenmeyen hata) — tekrar deneyin.';
export const GECERSIZ_SATIR_KIMLIGI = 'Geçersiz satır kimliği.';

/**
 * Istek govdesindeki satir kimligi (uuid) — DB'ye gitmeden once bicim
 * denetlenir: gercek Prisma'da dize olmayan kimlik dogrulama hatasi atar, o da
 * beklenmeyen hata olarak gunluge duserdi.
 */
export function satirKimligiGecerli(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 64;
}

/** Istek basina bir toplayici: `ekle` her satir hatasinda, `gunlukle` dongu bitince BIR KEZ. */
export function satirHatalari(logger: Pick<LoggerService, 'error'>, nerede: string, satirTuru: string) {
  const ornek: Array<{ id: unknown; hata: string }> = [];
  let yigin: string[] = [];
  let sayi = 0;
  return {
    ekle: (id: unknown, e: unknown): { id: unknown; error: string } => {
      if (e instanceof HttpException) return { id, error: e.message };
      sayi++;
      if (ornek.length < 3) {
        ornek.push({ id, hata: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
        if (ornek.length === 1 && e instanceof Error) {
          yigin = (e.stack ?? '').split('\n').filter((s) => /^\s+at /.test(s)).slice(0, 6).map((s) => s.trim());
        }
      }
      return { id, error: SATIR_KAYDEDILEMEDI };
    },
    gunlukle: (): void => {
      if (sayi === 0) return;
      logger.error(
        `${nerede}: ${sayi} ${satirTuru} beklenmeyen hatayla kaydedilemedi; ilk ${ornek.length}: ${JSON.stringify({ ornek, yigin })}`,
      );
    },
  };
}
