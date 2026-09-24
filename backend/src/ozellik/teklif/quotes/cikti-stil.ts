/**
 * FIYATLI CIKTI — GORUNUM (23.09.2026, Emre'nin tasarim referansi:
 * `MetaPriceX-Teklif-Excel-Yeni-Tasarim-Ornek.xlsx`)
 *
 * Renk, yazi, para bicimi, her sayfanin ortak baslik blogu ve baski ayarlari
 * TEK yerde. Hucre yerlesimi `standart-cikti.ts`de.
 *
 * ── SATIR KONUMU SABIT DEGIL ───────────────────────────────────────────────
 * Tarifte `HEADER_ROW = 4`, `FIRST_DATA_ROW = 5`: antetsiz duzen budur. Firma
 * anteti (plan 4.4) basligin USTUNE yazilir ve bu numaralari kaydirir; bu
 * yuzden yazici satir numarasini yazim ANINDA `satir.number`dan okur —
 * hicbir SUM araligi, donmus bolme ya da baski satiri sabit yazilmaz (antetin
 * İCMAL toplamini bozdugu 13.09 dersi).
 */
import * as ExcelJS from 'exceljs';

export const RENK = {
  LACIVERT: 'FF0F1A31',
  ARDUVAZ: 'FF475569',
  METIN: 'FF1F2937',
  SOLUK: 'FF64748B',
  CIZGI: 'FFE2E8F0',
  ARA_BASLIK: 'FFEEF2F7',
  TOPLAM_ZEMIN: 'FFF1F5F9',
  BEYAZ: 'FFFFFFFF',
  UYARI: 'FFB45309',
  SEKME_OZET: 'FF0F1A31',
  SEKME_KALEM: 'FF2563EB',
  SEKME_METIN: 'FF94A3B8',
} as const;

/** Tum dosyada Arial (tarif §7): Windows, Mac ve LibreOffice'te ayni gorunur. */
export function yazi(boyut: number, renk: string, ek: { bold?: boolean; italic?: boolean } = {}): Partial<ExcelJS.Font> {
  return { name: 'Arial', size: boyut, color: { argb: renk }, ...ek };
}

export function dolgu(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

export const ALT_CIZGI: Partial<ExcelJS.Borders> = { bottom: { style: 'thin', color: { argb: RENK.CIZGI } } };
export const UST_KALIN_CIZGI: Partial<ExcelJS.Borders> = { top: { style: 'medium', color: { argb: RENK.LACIVERT } } };

/**
 * Para bicimi: pozitif; negatif; SIFIR "–". Formulun `""` sonucu (fiyatsiz satir)
 * bos gorunur, gercek sifir tire.
 */
export function paraBicimi(kod?: string): string {
  if (kod === 'USD') return '"$"#,##0.00;-"$"#,##0.00;"–"';
  if (kod === 'EUR') return '"€"#,##0.00;-"€"#,##0.00;"–"';
  return '#,##0.00 "₺";-#,##0.00 "₺";"–"';
}

/** Miktar: tam sayiysa `#,##0`, degilse `#,##0.00` (tarif §3). */
export const miktarBicimi = (m: number): string => (Number.isInteger(m) ? '#,##0' : '#,##0.00');

/**
 * "gg.aa.yyyy" — ciktinin alindigi gun, TURKIYE saatiyle. Sunucu UTC calisir;
 * yerel ayarsiz `toLocaleDateString` gece 00:00-03:00 arasi DUNU yazardi.
 */
export function tarihMetni(t: Date): string {
  const parca = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(t);
  const al = (tur: string) => parca.find((p) => p.type === tur)?.value ?? '';
  return `${al('day')}.${al('month')}.${al('year')}`;
}

export const kolonHarfi = (n: number): string => String.fromCharCode(64 + n); // yalniz A–Z (en fazla 9 kolon)

export interface BaslikBlogu {
  /** 1. satir — teklif adi */
  baslik: string;
  /** 2. satir solu — sayfa adi (ozette "Fiyatlandırılmış teklif · Özet") */
  altBaslik: string;
  /** 2. satir, son kolonda saga hizali "Tarih: gg.aa.yyyy" */
  tarih: string;
  /** Metnin yazildigi ilk kolon (metin sayfasinda B) */
  ilkKolon: number;
  /** Tablonun son kolonu — tarih buraya, ust cizgi A'dan buraya */
  sonKolon: number;
}

/** Tarif §2: teklif adi · sayfa adi + tarih · 8 pt bosluk (tablo genisliginde ust cizgi). */
export function baslikBloguYaz(ws: ExcelJS.Worksheet, b: BaslikBlogu): void {
  const ad = ws.addRow([]);
  ad.height = 24;
  if (b.baslik) {
    const h = ad.getCell(b.ilkKolon);
    h.value = b.baslik;
    h.font = yazi(14, RENK.LACIVERT, { bold: true });
  }
  const alt = ws.addRow([]);
  alt.height = 18;
  const s = alt.getCell(b.ilkKolon);
  s.value = b.altBaslik;
  s.font = yazi(10, RENK.ARDUVAZ, { bold: true });
  const t = alt.getCell(b.sonKolon);
  t.value = b.tarih;
  t.font = yazi(9, RENK.ARDUVAZ);
  t.alignment = { horizontal: 'right' };
  const cizgi = ws.addRow([]);
  cizgi.height = 8;
  for (let k = 1; k <= b.sonKolon; k++) cizgi.getCell(k).border = UST_KALIN_CIZGI;
}

/** Lacivert tablo basligi (tarif §3): Arial 9 kalin beyaz, ortali (verilen kolonlar sola); kalem sayfasinda kaydirmali. */
export function tabloBasligiYaz(
  ws: ExcelJS.Worksheet, basliklar: readonly string[], solaKolonlar: readonly number[], yukseklik: number, kaydir = true,
): ExcelJS.Row {
  const row = ws.addRow([...basliklar]);
  row.height = yukseklik;
  row.eachCell((c, k) => {
    c.fill = dolgu(RENK.LACIVERT);
    c.font = yazi(9, RENK.BEYAZ, { bold: true });
    c.alignment = { horizontal: solaKolonlar.includes(k) ? 'left' : 'center', vertical: 'middle', ...(kaydir ? { wrapText: true } : {}) };
  });
  return row;
}

/**
 * Alt bilgi (tarif §6): solda teklif adi, ortada sayfa adi, sagda sayfa no.
 * ⚠ `&` alt bilgi KODUDUR: teklif adindaki "A&B" kacislanmazsa Excel onu kod
 * sanar. Boyut kodu (`&8`) yazi adindan ONCE: ad rakamla baslarsa ("2026
 * teklifi") `&8` onu boyuta katip `&82026` okurdu. Excel ust/alt bilgiyi 255
 * karakterle sinirlar — ad kisaltilir.
 */
export function altBilgi(teklifAdi: string, dil?: string): string {
  const yz = '&8&"Arial,Regular"';
  const ad = teklifAdi.slice(0, 90).replace(/&/g, '&&');
  return `&L${yz}${ad}&C${yz}&A&R${yz}${dil === 'en' ? 'Page' : 'Sayfa'} &P / &N`;
}

export interface BaskiAyari {
  yatay: boolean;
  sonKolon: number;
  sonSatir: number;
  /** Her baski sayfasinda tekrar eden satir (tablo basligi) */
  tekrarSatiri?: number;
  teklifAdi: string;
  dil?: string;
}

/**
 * Tarif §6: A4, genislige sigdir, yatayda ortali, kenarlar 0,4/0,5/0,6″.
 * ⚠ ExcelJS baski alani ve tekrar satirinin tanimli adini `'${ad}'!$A1…`
 * diye TIRNAK KACISLAMADAN yazar (workbook-xform.js): "O'Neil Blok" gibi bir
 * sayfa adi gecersiz ad uretir ve Excel dosyayi ONARIR. O sayfalarda bu iki
 * ayar yazilmaz — Excel'in varsayilani zaten kullanilan alani basar.
 */
export function baskiAyarla(ws: ExcelJS.Worksheet, b: BaskiAyari): void {
  const adGuvenli = !ws.name.includes("'");
  ws.pageSetup = {
    ...ws.pageSetup,
    paperSize: 9,
    orientation: b.yatay ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    ...(adGuvenli ? { printArea: `A1:${kolonHarfi(b.sonKolon)}${Math.max(1, b.sonSatir)}` } : {}),
    ...(adGuvenli && b.tekrarSatiri ? { printTitlesRow: `${b.tekrarSatiri}:${b.tekrarSatiri}` } : {}),
  };
  ws.headerFooter = { ...ws.headerFooter, oddFooter: altBilgi(b.teklifAdi, b.dil) };
}
