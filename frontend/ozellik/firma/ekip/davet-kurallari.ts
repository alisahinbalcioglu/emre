/**
 * 23.09.2026 — DAVET PENCERESİ: e-posta alanının İSTEMCİ denetimi (saf, IMPORT'SUZ).
 *
 * Tasarım: "e-posta alanı format kontrolü ve 'Bu adres zaten ekipte'
 * kontrolü yapar". İki kontrol de KOLAYLIKTIR — karar sunucudadır:
 * biçimi `DavetOlusturDto` (`@IsEmail`), ekipte olmayı `davetOlustur`
 * (`ZATEN_EKIPTE`) sınar. Buradaki amaç düğmeye basmadan önce söylemek.
 *
 * ⚠ KARŞILAŞTIRMA YALNIZ ASCII KÜÇÜLTMEYLE — sunucunun `epostaKucult`
 * kuralı (trim + A-Z). `toLocaleLowerCase('tr')` "I"yı "ı" yapar
 * (GMAIL → gmaıl), yerel ayarsız `toLowerCase()` "İ"yi iki karaktere böler;
 * ikisi de sunucunun "aynı adres" dediğini "farklı" sanardı.
 *
 * ⚠ Bekleyen davetle aynı adres AYRI metin alır: sunucu bu isteği REDDETMEZ,
 * yeniden gönderim sayar (yeni bağlantı + seçilen izinler). Pencereden bunu
 * sessizce yapmak eski bağlantıyı geçersiz kılardı; kullanıcı satırdaki
 * "Yeniden gönder"i ya da izin panelini kullanmalı.
 */

const ASCII_BUYUK = /[A-Z]/g;
export const epostaKucult = (s: string): string => s.trim().replace(ASCII_BUYUK, (h) => h.toLowerCase());

/**
 * Pratik biçim denetimi: tek `@`, iki yanda boşluksuz metin, alan adında
 * nokta ve en az iki harfli uzantı. RFC'nin tamamı DEĞİL — son söz sunucuda.
 */
const EPOSTA_BICIMI = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;

export function epostaBicimiGecerli(s: string): boolean {
  return EPOSTA_BICIMI.test(s.trim());
}

export type DavetEpostaHatasi = 'bos' | 'bicim' | 'ekipte' | 'davetli';

export const DAVET_EPOSTA_HATA_METNI: Readonly<Record<DavetEpostaHatasi, string>> = {
  bos: 'E-posta adresini yaz.',
  bicim: 'Geçerli bir e-posta adresi yaz (ornek@firmaniz.com).',
  ekipte: 'Bu adres zaten ekipte.',
  davetli: 'Bu adrese zaten davet gönderildi. Listeden “Yeniden gönder”i kullan.',
};

/** Adres gönderilebilir mi? `null` → evet; değilse neden kodu. */
export function davetEpostaHatasi(
  eposta: string,
  ekip: { uyeler: readonly { eposta: string }[]; bekleyenDavetler: readonly { eposta: string }[] },
): DavetEpostaHatasi | null {
  const adres = epostaKucult(eposta);
  if (adres === '') return 'bos';
  if (!epostaBicimiGecerli(adres)) return 'bicim';
  if (ekip.uyeler.some((u) => epostaKucult(u.eposta) === adres)) return 'ekipte';
  if (ekip.bekleyenDavetler.some((d) => epostaKucult(d.eposta) === adres)) return 'davetli';
  return null;
}
