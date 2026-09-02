/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TELEFON MASKESI — `+90 (5xx) (xxx) (xx) (xx)`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  02.09 kullanici karari: "+90'i otomatik verelim, `+90 (5xx) (xxx) (xx) (xx)`
 *  seklinde gosterelim — daha profesyonel gorunur."
 *
 *  Ayni gun canli turda musteri `05330983663` yazmisti ve iyzico
 *  "Gecersiz telefon numarasi" ile REDDETMISTI. Sunucu tarafinda donusum
 *  zaten var (`telefonuNormalize`), ama kullanicinin dogru bicimi GORMESI
 *  daha iyidir: hata hic olusmaz.
 *
 *  ── DURUMDA NE TUTULUR ─────────────────────────────────────────────────
 *  ⚠ Durumda MASKELI METIN DEGIL, YALNIZ HANELER tutulur.
 *  Sebep olculdu: maske her zaman "+90 " ile basladigi icin, maskeli metni
 *  durumda tutsaydik BOS bir telefon alani DOLU gorunurdu ve
 *  `eksikAlanlar` (bos-dize kontrolu) onu EKSIK SAYMAZDI. Yani zorunlu
 *  alan kapisi sessizce delinirdi.
 *
 *  Ekran maskeyi `bicimle()` ile cizer; sunucuya `e164()` gider.
 */

/** Turkiye cep numarasi: 10 hane, 5 ile baslar. */
export const HANE_SAYISI = 10;

/** Ekran maskesinin grup uzunluklari: `(5xx) (xxx) (xx) (xx)`. */
export const GRUP_UZUNLUKLARI = [3, 3, 2, 2] as const;

/**
 * Herhangi bir girdiden YALNIZ anlamli haneleri cikarir. SAF fonksiyon.
 *
 * Kullanici ne yazarsa yazsin ayni sonuca varilir:
 *   "0533 098 36 63" · "+90 533 098 36 63" · "905330983663" · "5330983663"
 *   → "5330983663"
 *
 * Ulke kodu ve bastaki sifir ATILIR; kalan ilk 10 hane alinir.
 */
export function haneleriAl(ham: string): string {
  let h = (ham ?? '').replace(/\D/g, '');
  // ⚠ SIRA ONEMLI ve testle yakalandi: once ULUSLARARASI onek (`00`), sonra
  // ULKE KODU (`90`), en son yerel sifir. `0090533...` girildiginde yalnizca
  // tek sifir atilirsa numara BIR HANE KAYAR ve sessizce yanlis numara
  // gonderilir — kullanici bunu fark edemez.
  if (h.startsWith('00')) h = h.slice(2);
  if (h.startsWith('90')) h = h.slice(2);
  if (h.startsWith('0')) h = h.slice(1);
  return h.slice(0, HANE_SAYISI);
}

/**
 * Haneleri `+90 (533) (098) (36) (63)` bicimine sokar. SAF fonksiyon.
 *
 * Yazarken KISMI gosterim uretir — kullanici her tusta ilerlediğini gorur:
 *   ""      → "+90 "
 *   "5"     → "+90 (5"
 *   "533"   → "+90 (533)"
 *   "533098"→ "+90 (533) (098)"
 */
export function bicimle(ham: string): string {
  const h = haneleriAl(ham);
  if (!h) return '+90 ';

  let metin = '+90';
  let i = 0;
  for (const uzunluk of GRUP_UZUNLUKLARI) {
    const g = h.slice(i, i + uzunluk);
    if (!g) break;
    // Grup TAMAMLANDIYSA kapanir; yarim kalan grup ACIK birakilir ki
    // kullanici yazarken imlec dogal ilerlesin.
    metin += g.length === uzunluk ? ` (${g})` : ` (${g}`;
    i += uzunluk;
  }
  return metin;
}

/** Numara TAM mi (10 hane)? SAF fonksiyon. */
export function tamMi(ham: string): boolean {
  return haneleriAl(ham).length === HANE_SAYISI;
}

/**
 * Sunucuya/iyzico'ya gidecek bicim. SAF fonksiyon.
 * Eksikse bos dize doner — yarim numara GONDERILMEZ.
 */
export function e164(ham: string): string {
  const h = haneleriAl(ham);
  return h.length === HANE_SAYISI ? `+90${h}` : '';
}

/**
 * Kullaniciya gosterilecek hata; sorun yoksa null. SAF fonksiyon.
 *
 * ⚠ "Bos" ile "eksik hane" AYRI mesaj alir: bos alan zaten `eksikAlanlar`
 * tarafindan bildiriliyor, burada tekrar edilirse kullanici ayni sey icin
 * iki uyari gorur.
 */
export function telefonHatasi(ham: string): string | null {
  const h = haneleriAl(ham);
  if (h.length === 0) return null;
  if (h.length < HANE_SAYISI) return 'Telefon numarasi 10 haneli olmali';
  if (!h.startsWith('5')) return 'Cep telefonu 5 ile baslamali';
  return null;
}
