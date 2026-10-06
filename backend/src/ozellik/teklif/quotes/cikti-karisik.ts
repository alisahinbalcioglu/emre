/**
 * FIYATLI CIKTI — KARISIK PARA BIRIMI (F5, Emre karari 04.10; Excel prototipi
 * onayi 05.10 "uygula").
 *
 * Teklif karisik kipteyse taraflar (malzeme / iscilik) KENDI biriminde kalir;
 * dolar liraya EKLENMEZ, cevrim YAPILMAZ. Bu dosya kurallari ve birim basina
 * toplam satirlarini tasir; kalem satiri yazimi `standart-cikti.ts`de.
 *
 * ── DUZEN (onayli prototip) ──
 *  · Hucre bicimi tarafin birimi ($/€ basta, ₺ sonda — `paraBicimi`).
 *  · Gizli J/K sutunlari taraf birimini tasir (TRY/USD/EUR); baski alani A:I.
 *  · SAYFA TOPLAMI birim BASINA ayri satir: SUMIF(J/K, birim). ARA TOPLAM
 *    (`_ozet`) satirinin birim hucresi BOSTUR → toplama girmez (13.09 "3 kat").
 *  · GENEL TOPLAM sekmesi: sayfa × birim satirlari + birim basina TEKLİF GENEL
 *    TOPLAMI.
 *
 * IKIZ: duzen ve taraf birimi kurali on yuzde `frontend/ozellik/fiyat/
 * taraf-para-birimi.ts` (`dovizliTarafVarMi`, `tarafPB`, `paraHanesi`). Kayitta
 * ayri kip alani YOK: karisik kip her fiyat yaziminda tarafin birimini yazar.
 * F6a (karar K1, 06.10): karisik DUZEN yalniz $/€ taraf varken — yalniz-₺
 * karisik teklif tek birimli yolun BAYT BAYT aynisini uretir.
 */
import * as ExcelJS from 'exceljs';
import { ONDALIK, kurusTamsayi } from '../../fiyat/matching/pricing';
import { AntetBilgi, antetYaz } from '../../cikti/utils/antet';
import { ciktiMetni } from './cikti-dil';
import {
  ALT_CIZGI, RENK, baskiAyarla, baslikBloguYaz, dolgu, kolonHarfi as harf, kolonPx, paraBicimi, tabloBasligiYaz,
  tarihMetni, toplamSatiriBicimle, yazi,
} from './cikti-stil';

export type ParaBirimi = 'TRY' | 'USD' | 'EUR';

/** Kova sirasi — sabit (ekranla ayni: ₺, $, €). */
export const BIRIM_SIRASI: readonly ParaBirimi[] = ['TRY', 'USD', 'EUR'];
const GECERLI = new Set<string>(BIRIM_SIRASI);
export const SEMBOL: Record<ParaBirimi, string> = { TRY: '₺', USD: '$', EUR: '€' };

/** Gizli birim sutunlari (J, K) — kalem sayfasinin 9 sutunundan sonra. */
export const BIRIM_SUTUNLARI = { malzeme: 10, iscilik: 11 } as const;
export const BIRIM_SUTUN_GENISLIGI = 10;
export const birimSutunBasliklari = (dil?: string): string[] => (dil === 'en' ? ['Cur. (mat.)', 'Cur. (lab.)'] : ['PB malz.', 'PB işç.']);

type Satir = Record<string, any>;

const DOVIZ: ReadonlySet<unknown> = new Set(['USD', 'EUR']);

/**
 * Karisik DUZEN mi? (F6a, karar K1 — Emre'nin onerilen onayi, 05.10): $ ya da €
 * taraf (ya da fitting birim parcasi) varsa. Yalniz ₺ birimli karisik satirlar
 * (yeni teklif ₺ tarafa da birim yazar) TL teklifle ayni dosyayi uretir:
 * "yeni teklif karisik" ile "yalniz-TL teklifin Excel'i bayt bayt ayni" ancak
 * boyle birlikte tutar. IKIZ: on yuz `dovizliTarafVarMi` (test:ex-karisik KR0e).
 */
export function dovizliTarafVarMi(sayfalar: ReadonlyArray<{ rowData?: Satir[] | null } | null | undefined> | null | undefined): boolean {
  for (const s of sayfalar ?? []) {
    for (const r of s?.rowData ?? []) {
      if (!r) continue;
      if (DOVIZ.has(r._matPB) || DOVIZ.has(r._labPB)) return true;
      // Bozuk kayit (dizi olmayan mat/lab) ciktiyi DUSURMEZ (inceleme L4; `fittingParcalari` gibi)
      const fb = r._fittingBirimli;
      const parcalar = fb ? [...(Array.isArray(fb.mat) ? fb.mat : []), ...(Array.isArray(fb.lab) ? fb.lab : [])] : [];
      if (parcalar.some((x: any) => DOVIZ.has(x?.pb))) return true;
    }
  }
  return false;
}

/** IKIZ (on yuz `tarafPB`): alan yoksa ya da taninmiyorsa TRY. */
export function tarafPB(r: Satir, dal: 'malzeme' | 'iscilik'): ParaBirimi {
  const ham = r?.[dal === 'iscilik' ? '_labPB' : '_matPB'];
  return typeof ham === 'string' && GECERLI.has(ham) ? (ham as ParaBirimi) : 'TRY';
}

/** IKIZ (on yuz `paraHanesi`, karar 4): dovizde 2 hane yukari, ₺'de bugunku kural. */
export function paraHanesi(pb: ParaBirimi): number {
  return pb === 'TRY' ? ONDALIK : 2;
}

/** Hucre bicimiyle AYNI yonde metin: "$2.680,00" · "10.720,00 ₺" (karma satir). */
export function paraMetni(v: number, pb: ParaBirimi): string {
  const m = Math.abs(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isaret = v < 0 ? '-' : '';
  return pb === 'TRY' ? `${isaret}${m} ₺` : `${isaret}${SEMBOL[pb]}${m}`;
}

/**
 * Karisik kipte kalem satirinin Genel Toplam (I) hucresi:
 *  · iki taraf AYNI birimde → SUM(F,H), o birimin bicimi;
 *  · birimler farkli, ikisi de dolu → karma METIN (karar 1);
 *  · birimler farkli, yalniz biri dolu → YALNIZ o taraf. Bos tarafin birimi
 *    kayitta varsayilandir (TRY), gercek birimi bilinmez: SUM(F,H) musteri
 *    Excel'de bos tarafi doldurunca iki birimi toplardi (inceleme, 05.10);
 *  · birimler farkli, ikisi de bos → hucre bos.
 */
export type KarisikToplam =
  | { tur: 'metin'; metin: string }
  | { tur: 'formul'; kaynak: 'ikisi' | 'malzeme' | 'iscilik'; pb: ParaBirimi }
  | { tur: 'bos' };

export function karisikToplamHucresi(matPB: ParaBirimi, matK: number | null, labPB: ParaBirimi, labK: number | null): KarisikToplam {
  if (matPB === labPB) return { tur: 'formul', kaynak: 'ikisi', pb: matPB };
  const m = matK !== null && matK !== 0;
  const l = labK !== null && labK !== 0;
  if (m && l) return { tur: 'metin', metin: `${paraMetni(matK! / 100, matPB)} + ${paraMetni(labK! / 100, labPB)}` };
  if (m) return { tur: 'formul', kaynak: 'malzeme', pb: matPB };
  if (l) return { tur: 'formul', kaynak: 'iscilik', pb: labPB };
  return { tur: 'bos' };
}

/** Fitting satirinin bir birimlik parcasi (kurus; tutar yoksa null). */
export interface FittingParcasi { pb: ParaBirimi; matK: number | null; labK: number | null }

/**
 * Karar 2: karisik kapsamli fitting birim BASINA ayri satir. Tutarlar on yuzun
 * hesapladigi `_fittingBirimli` DEGERLERIDIR (kapsam × oran, birimin hanesiyle
 * yukari) — burada yeniden hesaplanmaz. Gecersiz birim / sayi olmayan tutar
 * atlanir; sifir tutar yazilmaz. Hic tutar yoksa tek bos ₺ parcasi.
 */
export function fittingParcalari(fb: unknown): FittingParcasi[] {
  const kur = (liste: unknown): Map<ParaBirimi, number> => {
    const m = new Map<ParaBirimi, number>();
    for (const x of Array.isArray(liste) ? liste : []) {
      const pb = (x as any)?.pb;
      const k = kurusTamsayi(Number((x as any)?.toplam));
      if (typeof pb === 'string' && GECERLI.has(pb) && k !== 0) m.set(pb as ParaBirimi, (m.get(pb as ParaBirimi) ?? 0) + k);
    }
    return m;
  };
  const mat = kur((fb as any)?.mat);
  const lab = kur((fb as any)?.lab);
  const parcalar = BIRIM_SIRASI
    .filter((pb) => mat.has(pb) || lab.has(pb))
    .map((pb) => ({ pb, matK: mat.get(pb) ?? null, labK: lab.get(pb) ?? null }));
  return parcalar.length ? parcalar : [{ pb: 'TRY', matK: null, labK: null }];
}

/** Sayfanin birim kovalari (kurus) — yalniz tutar yazan taraf kova acar. */
export type Kovalar = Map<ParaBirimi, { matK: number; labK: number }>;

export function kovayaEkle(kovalar: Kovalar, pb: ParaBirimi, dal: 'mat' | 'lab', k: number | null): void {
  if (k === null) return; // fiyatsiz taraf kova ACMAZ: birimi varsayilan (TRY), bos ₺ toplam satiri uretilmez
  const kv = kovalar.get(pb) ?? { matK: 0, labK: 0 };
  kovalar.set(pb, dal === 'mat' ? { ...kv, matK: kv.matK + k } : { ...kv, labK: kv.labK + k });
}

/** Sayfanin bir birimlik toplami (kurus) — format yolunun İCMAL'i buna baglanir. */
export interface BirimKovasi { pb: ParaBirimi; matK: number; labK: number }

/** Kovalar SABIT sirada (₺, $, €); bos sayfada bos liste. */
export function kovaListesi(kovalar: Kovalar): BirimKovasi[] {
  return BIRIM_SIRASI.filter((pb) => kovalar.has(pb)).map((pb) => ({ pb, ...kovalar.get(pb)! }));
}

/** Birim basina SAYFA TOPLAMI satiri (GENEL TOPLAM sekmesi buna baglanir). */
export interface BirimToplami { pb: ParaBirimi; satir: number; matK: number; labK: number }

/**
 * SAYFA TOPLAMI birim BASINA: F/H = SUMIF(J/K ilk:son, "birim", F/H ilk:son),
 * I = F + H. Sabit sira; yalniz tutari olan birimler — hic yoksa tek ₺ satiri
 * (bugunku bos toplam). Cagiran bos satiri ONCE ekler.
 */
export function birimToplamSatirlariYaz(
  ws: ExcelJS.Worksheet, kovalar: Kovalar, ilk: number, son: number, dil?: string,
): BirimToplami[] {
  const sirali = BIRIM_SIRASI.filter((pb) => kovalar.has(pb));
  const yazilacak = sirali.length ? sirali : (['TRY'] as ParaBirimi[]);
  const sonuc: BirimToplami[] = [];
  for (const pb of yazilacak) {
    const { matK, labK } = kovalar.get(pb) ?? { matK: 0, labK: 0 };
    const t = ws.addRow([null, `${ciktiMetni('SAYFA TOPLAMI', dil)} ${SEMBOL[pb]}`]);
    t.height = 22;
    const n = t.number;
    const sumif = (olcut: number, kol: number) => `SUMIF(${harf(olcut)}${ilk}:${harf(olcut)}${son},"${pb}",${harf(kol)}${ilk}:${harf(kol)}${son})`;
    const hucreler: Array<[number, string, number]> = [
      [6, sumif(BIRIM_SUTUNLARI.malzeme, 6), matK],
      [8, sumif(BIRIM_SUTUNLARI.iscilik, 8), labK],
      [9, `F${n}+H${n}`, matK + labK],
    ];
    for (const [k, formula, kurus] of hucreler) {
      t.getCell(k).value = { formula, result: kurus / 100 } as ExcelJS.CellFormulaValue;
      t.getCell(k).numFmt = paraBicimi(pb);
    }
    toplamSatiriBicimle(t);
    sonuc.push({ pb, satir: n, matK, labK });
  }
  return sonuc;
}

/** GENEL TOPLAM (karisik): Sayfa · Para birimi · Malzeme · İşçilik · Genel Toplam. */
const OZET_GENISLIKLERI = [44, 14, 20, 20, 22];
const OZET_BASLIKLARI = ['Sayfa', 'Para birimi', 'Malzeme', 'İşçilik', 'Genel Toplam'];
const OZET_BASLIKLARI_EN = ['Sheet', 'Currency', 'Material', 'Labour', 'Grand Total'];
const BIRIM_ETIKETI: Record<ParaBirimi, string> = { TRY: '₺ (TL)', USD: '$ (USD)', EUR: '€ (EUR)' };
export const CEVRIM_YOK_NOTU = 'Toplamlar para birimi başına ayrıdır; çevrim yapılmaz.';
const CEVRIM_YOK_NOTU_EN = 'Totals are per currency; no conversion is applied.';
export const cevrimYokNotu = (dil?: string): string => (dil === 'en' ? CEVRIM_YOK_NOTU_EN : CEVRIM_YOK_NOTU);

export interface BirimliSayfa { ad: string; toplamlar: BirimToplami[] }

/** Excel bir fonksiyona en fazla 255 arguman kabul eder — parcali SUM. */
export const hucreToplami = (hucreler: string[]): string => {
  const gruplar: string[] = [];
  for (let i = 0; i < hucreler.length; i += 255) gruplar.push(`SUM(${hucreler.slice(i, i + 255).join(',')})`);
  return gruplar.join('+');
};

/**
 * Tarif §5'in karisik ikizi: her kalem sayfasi × birimi bir satir, rakamlar o
 * sayfanin birim SAYFA TOPLAMI satirina formulle bagli; TEKLİF GENEL TOPLAMI
 * birim basina, yalniz o birimin satirlarini toplar.
 */
export function karisikOzetSayfasiYaz(
  wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, sayfalar: readonly BirimliSayfa[],
  g: { baslik?: string; dil?: string; antet?: AntetBilgi | null; acilisNotu?: string; tarih: Date },
): void {
  const dil = g.dil;
  const SON = OZET_GENISLIKLERI.length;
  ws.columns = OZET_GENISLIKLERI.map((width) => ({ width }));
  antetYaz(wb, ws, g.antet, { metinKolonu: 1, logoKolonu: 4, logoSagKenarPx: kolonPx(OZET_GENISLIKLERI[3]) + kolonPx(OZET_GENISLIKLERI[4]) - 8 });
  baslikBloguYaz(ws, {
    baslik: g.baslik ?? '', altBaslik: ciktiMetni('Fiyatlandırılmış teklif · Özet', dil),
    tarih: `${ciktiMetni('Tarih', dil)}: ${tarihMetni(g.tarih)}`,
    ilkKolon: 1, sonKolon: SON,
  });
  if (g.acilisNotu) {
    const n = ws.addRow([g.acilisNotu]);
    ws.mergeCells(n.number, 1, n.number, SON);
    n.height = 30;
    n.getCell(1).font = yazi(10, RENK.UYARI, { bold: true });
    n.getCell(1).alignment = { vertical: 'middle', wrapText: true };
  }
  const bas = tabloBasligiYaz(ws, dil === 'en' ? OZET_BASLIKLARI_EN : OZET_BASLIKLARI, [1], 26, false);
  const birimSatirlari = new Map<ParaBirimi, { satirlar: number[]; matK: number; labK: number }>();
  for (const s of sayfalar) {
    const ref = `'${s.ad.replace(/'/g, "''")}'`;
    for (const t of s.toplamlar) {
      const row = ws.addRow([s.ad, BIRIM_ETIKETI[t.pb]]);
      row.height = 20;
      const baglar: Array<[number, string, number]> = [[3, 'F', t.matK], [4, 'H', t.labK], [5, 'I', t.matK + t.labK]];
      for (const [k, kol, kurus] of baglar) {
        row.getCell(k).value = { formula: `${ref}!${kol}${t.satir}`, result: kurus / 100 } as ExcelJS.CellFormulaValue;
        row.getCell(k).numFmt = paraBicimi(t.pb);
      }
      row.eachCell({ includeEmpty: true }, (c, k) => {
        if (k > SON) return;
        c.font = yazi(10, RENK.METIN, { bold: k === SON });
        c.alignment = k === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
        c.border = ALT_CIZGI;
      });
      const b = birimSatirlari.get(t.pb) ?? { satirlar: [], matK: 0, labK: 0 };
      birimSatirlari.set(t.pb, { satirlar: [...b.satirlar, row.number], matK: b.matK + t.matK, labK: b.labK + t.labK });
    }
  }
  ws.addRow([]);
  const birimler = BIRIM_SIRASI.filter((pb) => birimSatirlari.has(pb));
  for (const pb of birimler.length ? birimler : (['TRY'] as ParaBirimi[])) {
    const b = birimSatirlari.get(pb);
    const gt = ws.addRow([`${ciktiMetni('TEKLİF GENEL TOPLAMI', dil)} ${SEMBOL[pb]}`]);
    gt.height = 28;
    const toplamlar: Array<[number, string, number]> = [[3, 'C', b?.matK ?? 0], [4, 'D', b?.labK ?? 0], [5, 'E', (b?.matK ?? 0) + (b?.labK ?? 0)]];
    for (const [k, kol, kurus] of toplamlar) {
      // Kalem sayfasi yoksa (bos teklif) toplanacak hucre olmaz — 0 deger
      gt.getCell(k).value = b
        ? ({ formula: hucreToplami(b.satirlar.map((r) => `${kol}${r}`)), result: kurus / 100 } as ExcelJS.CellFormulaValue)
        : 0;
      gt.getCell(k).numFmt = paraBicimi(pb);
    }
    for (let k = 1; k <= SON; k++) {
      const c = gt.getCell(k);
      c.fill = dolgu(RENK.LACIVERT);
      c.font = yazi(k === 1 || k === SON ? 11 : 10, RENK.BEYAZ, { bold: true });
      c.alignment = k === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
    }
  }
  ws.addRow([]);
  const not = ws.addRow([cevrimYokNotu(dil)]);
  ws.mergeCells(not.number, 1, not.number, SON);
  not.getCell(1).font = yazi(9, RENK.SOLUK, { italic: true });
  not.getCell(1).alignment = { vertical: 'middle', wrapText: true };
  ws.views = [{ showGridLines: false }];
  ws.properties.tabColor = { argb: RENK.SEKME_OZET };
  baskiAyarla(ws, { yatay: false, sonKolon: SON, sonSatir: ws.rowCount, tekrarSatiri: bas.number, teklifAdi: g.baslik ?? '', dil });
}
