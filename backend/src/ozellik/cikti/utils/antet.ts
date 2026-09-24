/**
 * TEKLIF CIKTISI ANTETI (plan 4.4 — hesap dogrulugu turu, 13.09.2026)
 *
 * Firma kaydindan (Faz 4: unvan, adres, vergi, iletisim, logo) antet bilgisi
 * uretir ve cikti sayfasinin USTUNE yazar. Iki cikti yolu da (fiyatli +
 * teklif formati) liste sayfalarini `standartSayfaYaz` ile yazdigi icin antet
 * TEK yerden iki yola birden girer (KF7 ikiz kurali).
 *
 * ── KURAL 1: BILGI YOKSA SATIR YOK ──────────────────────────────────────────
 * "[FİRMA UNVANI]" yazan bir antet bos antetten kotudur (Faz 5.7 altbilgi
 * kurali). Bos alanin satiri HIC basilmaz; hicbir alan ve logo yoksa antet
 * YOKTUR ve sayfa bugunku haliyle (baslik 1. satirda) cikar.
 *
 * ── KURAL 2: TEHLIKELI YEDEKLER KULLANILMAZ ────────────────────────────────
 *  · `unvan ?? ad` YOK: `Firma.ad` kayit sirasinda e-postanin @ oncesinden
 *    turetilir ("acme") — musteriye firma adi diye gidemez.
 *  · `faturaEposta ?? yetkiliEposta` YOK: yetkiliEposta giris e-postasiyla
 *    doldurulmus olabilir ve profil formunda duzenlenemiyor.
 *  · `vergiNo ?? tcKimlikNo` YOK: TC kimlik no kisisel veridir; teklif
 *    belgesine sessizce basilmaz.
 *
 * ── KURAL 3: KIRIK GORSEL YOK ──────────────────────────────────────────────
 * Logo yalniz PNG/JPEG ve boyutu dosyanin KENDI basligindan okunabiliyorsa
 * gomulur. WEBP gomulmez: ExcelJS yazar ama Excel surumlerinde gorunurlugu
 * dogrulanamadi — kirik gorsel kutusu logosuz antetten kotudur. Okunamayan
 * gorsel → logosuz antet (cikti DUSMEZ).
 *
 * ── SUM GUVENLIGI ──────────────────────────────────────────────────────────
 * Antet, tablo YAZILMADAN ONCE `addRow` ile eklenir; ICMAL SUM araliklari
 * satir numaralarini yazim anindaki `satir.number`dan aldigi icin kendiliginden
 * kayar. Tablo yazildiktan SONRA satir eklemek (spliceRows/insertRow) YASAK:
 * ExcelJS formul referanslarini guncellemez, ICMAL sessizce yanlis toplar.
 * Kapi: test/antet-test.ts + test/hesap-dogrulugu-test.ts (antetli kosum).
 */
import * as ExcelJS from 'exceljs';

/** Antete girebilecek Firma alanlari — `select` ile AYNI liste. */
export const ANTET_FIRMA_ALANLARI = {
  unvan: true, faturaAdresi: true, ilce: true, il: true,
  telefon: true, faturaEposta: true, vergiDairesi: true, vergiNo: true,
  logoBytes: true, logoMime: true,
} as const;

export interface FirmaAntetKaydi {
  unvan?: string | null;
  faturaAdresi?: string | null;
  ilce?: string | null;
  il?: string | null;
  telefon?: string | null;
  faturaEposta?: string | null;
  vergiDairesi?: string | null;
  vergiNo?: string | null;
  logoBytes?: Uint8Array | Buffer | null;
  logoMime?: string | null;
}

export interface AntetLogo {
  buffer: Buffer;
  uzanti: 'png' | 'jpeg';
  genislik: number;
  yukseklik: number;
}

export interface AntetBilgi {
  /** Basilacak metin satirlari, SIRAYLA; ilki unvansa `unvanVar` true */
  satirlar: string[];
  unvanVar: boolean;
  logo: AntetLogo | null;
}

const ETIKET = {
  tr: { tel: 'Tel', eposta: 'E-posta', vd: 'Vergi Dairesi', vkn: 'Vergi No' },
  en: { tel: 'Tel', eposta: 'E-mail', vd: 'Tax Office', vkn: 'Tax No' },
};

/** Bos/bosluk → null. Suslu parantezin HER biri ayiklanir: antet hucresi
 *  format motorunun yer tutucu taramasina girer, kullanici metni etiket gibi
 *  islenmemeli.
 *  ⚠ YALNIZ `{{`/`}}` CIFTLERINI silmek YETMEZ (13.09 incelemesinde olculdu):
 *  `"{}}{ICMAL_SATIRLARI}{{}"` tek geciste `"{{ICMAL_SATIRLARI}}"`e donusur;
 *  tarama antet hucresini ICMAL sablonu sanip liste sayfasina `duplicateRow`
 *  uygular ve toplam satir numaralari kayar. */
const temiz = (x: unknown): string | null => {
  const s = String(x ?? '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
};

/** PNG/JPEG boyutunu dosya basligindan okur; okunamazsa null. */
export function gorselBoyutu(b: Buffer, uzanti: 'png' | 'jpeg'): { genislik: number; yukseklik: number } | null {
  try {
    if (uzanti === 'png') {
      const imza = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      if (b.length < 24 || imza.some((v, i) => b[i] !== v) || b.toString('ascii', 12, 16) !== 'IHDR') return null;
      const genislik = b.readUInt32BE(16); const yukseklik = b.readUInt32BE(20);
      return genislik > 0 && yukseklik > 0 ? { genislik, yukseklik } : null;
    }
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const isaret = b[i + 1];
      if (isaret === 0xff) { i++; continue; } // dolgu
      if (isaret >= 0xd0 && isaret <= 0xd9) { i += 2; continue; } // uzunluksuz isaretler
      const uzunluk = b.readUInt16BE(i + 2);
      // SOF0-SOF15 (DHT C4, JPG C8, DAC CC haric): yukseklik, genislik
      if (isaret >= 0xc0 && isaret <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(isaret)) {
        const yukseklik = b.readUInt16BE(i + 5); const genislik = b.readUInt16BE(i + 7);
        return genislik > 0 && yukseklik > 0 ? { genislik, yukseklik } : null;
      }
      if (uzunluk < 2) return null;
      i += 2 + uzunluk;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Firma kaydi → antet bilgisi. Basilacak hicbir sey yoksa `null` (antet yok).
 * Saf fonksiyon: DB/ExcelJS yok.
 */
export function antetKur(firma: FirmaAntetKaydi | null | undefined, dil?: string): AntetBilgi | null {
  if (!firma) return null;
  const e = dil === 'en' ? ETIKET.en : ETIKET.tr;
  const katil = (parcalar: Array<string | null>) => {
    const dolu = parcalar.filter((p): p is string => !!p);
    return dolu.length ? dolu.join(' · ') : null;
  };
  const unvan = temiz(firma.unvan);
  const ilIlce = katil([temiz(firma.ilce), temiz(firma.il)])?.replace(' · ', ' / ') ?? null;
  const telefon = temiz(firma.telefon);
  const eposta = temiz(firma.faturaEposta);
  const vd = temiz(firma.vergiDairesi);
  const vkn = temiz(firma.vergiNo);

  const satirlar = [
    unvan,
    katil([temiz(firma.faturaAdresi), ilIlce]),
    katil([telefon ? `${e.tel}: ${telefon}` : null, eposta ? `${e.eposta}: ${eposta}` : null]),
    katil([vd ? `${e.vd}: ${vd}` : null, vkn ? `${e.vkn}: ${vkn}` : null]),
  ].filter((s): s is string => !!s);

  let logo: AntetLogo | null = null;
  const mime = String(firma.logoMime ?? '').toLowerCase();
  const uzanti = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpeg' : null;
  if (uzanti && firma.logoBytes && firma.logoBytes.length > 0) {
    const buffer = Buffer.from(firma.logoBytes);
    const boyut = gorselBoyutu(buffer, uzanti);
    if (boyut) logo = { buffer, uzanti, ...boyut };
  }

  if (satirlar.length === 0 && !logo) return null;
  return { satirlar, unvanVar: !!unvan, logo };
}

/**
 * Yuklenmis logo antete GIRMEDIYSE kullaniciya gosterilecek neden; girdiyse
 * ya da logo yoksa `null`. Indirme ozetine (X-Export-Summary → toast) eklenir.
 *
 * ⚠ SESSIZ ATLAMA YASAK (13.09 incelemesi): profil sayfasi WEBP kabul edip
 * "Teklif çıktısının antedinde kullanılır" diyor; KURAL 3 geregi WEBP gomulmez.
 * Neden soylenmezse kullanici logosunu yukler, ciktida goremez ve sebebini
 * hicbir yerde bulamaz (vaat var, baglanti yok).
 */
export function antetLogoNotu(firma: FirmaAntetKaydi | null | undefined): string | null {
  if (!firma?.logoBytes || firma.logoBytes.length === 0) return null;
  const mime = String(firma.logoMime ?? '').toLowerCase();
  if (mime === 'image/webp') return 'logo WEBP biçiminde olduğu için antete eklenmedi (PNG ya da JPEG yükleyin)';
  const uzanti = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpeg' : null;
  if (!uzanti) return 'logo biçimi desteklenmediği için antete eklenmedi (PNG ya da JPEG yükleyin)';
  return gorselBoyutu(Buffer.from(firma.logoBytes), uzanti) ? null : 'logo dosyası okunamadığı için antete eklenmedi';
}

/** Logo kutusu: antet satirlari kadar yukseklik, oran korunur. */
const SATIR_YUKSEKLIGI_PT = 18;
const LOGO_AZAMI_GENISLIK_PX = 220;
const LOGO_ASGARI_SATIR = 3;

/** Ayni workbook'a ayni logo bir kez gomulur (her sayfa ayni resim kimligini kullanir). */
const logoKimlikleri = new WeakMap<ExcelJS.Workbook, Map<AntetLogo, number>>();

/**
 * Anteti sayfanin SONUNA (tablodan once cagrilir → sayfanin ustu) yazar ve
 * tukettigi satir sayisini (bosluk satiri dahil) dondurur. Antet `null` ise
 * hicbir sey yazmaz, 0 doner.
 *
 * @param metinKolonu  metin satirlarinin yazildigi kolon (1-tabanli)
 * @param logoKolonu   logonun sol ust kosesinin kolonu (1-tabanli)
 * @param logoSagKenarPx verilirse logo, `logoKolonu`nun sol kenarindan bu kadar
 *   piksel otedeki cizgiye SAGDAN yaslanir (metin sayfasi: tek genis B
 *   kolonu, logo B+C'nin sag ucunda). ExcelJS'in kesirli kolon kestirimi
 *   genislik birimini yanlis cevirir (anchor.js `width * 10000` EMU) — ofset
 *   dogrudan EMU verilir.
 */
export function antetYaz(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  antet: AntetBilgi | null | undefined,
  konum: { metinKolonu: number; logoKolonu: number; logoSagKenarPx?: number },
): number {
  if (!antet) return 0;
  const satirSayisi = Math.max(antet.satirlar.length, antet.logo ? LOGO_ASGARI_SATIR : 0);
  const ilkSatir = ws.rowCount + 1;
  for (let i = 0; i < satirSayisi; i++) {
    const row = ws.addRow([]);
    row.height = SATIR_YUKSEKLIGI_PT;
    const metin = antet.satirlar[i];
    if (!metin) continue;
    const c = row.getCell(konum.metinKolonu);
    c.value = metin;
    const unvanSatiri = i === 0 && antet.unvanVar;
    // Arial: ciktinin geri kalaniyla ayni yazi (23.09 tasarimi)
    c.font = unvanSatiri
      ? { name: 'Arial', bold: true, size: 13, color: { argb: 'FF0F1A31' } }
      : { name: 'Arial', size: 9, color: { argb: 'FF475569' } };
    c.alignment = { vertical: 'middle' };
  }
  const bosluk = ws.addRow([]); // antet ile tablo arasi
  bosluk.height = 8;

  if (antet.logo) {
    let kimlikler = logoKimlikleri.get(wb);
    if (!kimlikler) { kimlikler = new Map(); logoKimlikleri.set(wb, kimlikler); }
    let kimlik = kimlikler.get(antet.logo);
    if (kimlik === undefined) {
      kimlik = wb.addImage({ buffer: antet.logo.buffer as any, extension: antet.logo.uzanti });
      kimlikler.set(antet.logo, kimlik);
    }
    const kutuYukseklik = Math.round((satirSayisi * SATIR_YUKSEKLIGI_PT * 96) / 72) - 4;
    const olcek = Math.min(kutuYukseklik / antet.logo.yukseklik, LOGO_AZAMI_GENISLIK_PX / antet.logo.genislik, 1);
    const genislik = Math.max(1, Math.round(antet.logo.genislik * olcek));
    const EMU_PIKSEL = 9525;
    const tl = konum.logoSagKenarPx === undefined
      ? { col: konum.logoKolonu - 1, row: ilkSatir - 1 }
      : { nativeCol: konum.logoKolonu - 1, nativeColOff: Math.max(0, konum.logoSagKenarPx - genislik) * EMU_PIKSEL, nativeRow: ilkSatir - 1, nativeRowOff: 0 };
    ws.addImage(kimlik, {
      tl: tl as any,
      ext: { width: genislik, height: Math.max(1, Math.round(antet.logo.yukseklik * olcek)) },
      editAs: 'oneCell',
    } as any);
  }
  return satirSayisi + 1;
}
