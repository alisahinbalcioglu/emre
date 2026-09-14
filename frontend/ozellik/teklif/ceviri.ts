/**
 * TEKLIF METNI CEVIRISI — EKRANDA UYGULAMA VE GERI ALMA (13.08 · 14.09).
 *
 * ── KARAR BURADA DEGIL (Faz 6.2, 14.09.2026) ───────────────────────────────
 * 13.08–14.09 arasi "hangi hucre motora gider, hangisine ASLA dokunulmaz"
 * karari (`dokunulmazMi`, `cevrilecekMetinler`) bu modulde yasiyordu ve
 * istemci metin listesini kendisi gonderiyordu. Cevirinin kotasi olunca bu
 * liste KOTADAN DUSECEK SATIRI da belirler hale geldi — istemciye birakilamaz.
 * Kural sunucuya TASINDI: `backend/src/ozellik/giris/ai/ceviri-kurali.ts`
 * (vakalar `backend/test/ceviri-kota-uygulama-test.ts`, K bloku). Iki kopya
 * tutulmadi: ayrisan ikiz, ekranda sayilan ile faturalanan satiri ayirirdi.
 * K21 bu dosyada kuralin YENIDEN belirmesini kirmizi yakar.
 *
 * Burada kalan: sunucunun dondurdugu haritayi satirlara yazmak ve geri almak.
 */
import type { ColumnRoles, ExcelRowData } from '../tablo/excel-grid/types';

/** Hedef dil — su an yalniz Ingilizce (kullanici karari, 13.08). */
export type HedefDil = 'en';

/** Kaynak metin → ceviri. Backend'den bu sekilde doner. */
export type CeviriHaritasi = Record<string, string>;

/** Grid hucresinden ceviri anahtarina giden TEK normalizasyon.
 *  Onbellek anahtari da bu — yoksa "PVC BORU" ile "PVC BORU " ayri satir olur. */
export function ceviriAnahtari(metin: unknown): string {
  return String(metin ?? '').trim().replace(/\s+/g, ' ');
}

/** Orijinal metnin satirda saklandigi alan (sunucuda `CEVIRI_KAYNAK_ALANI`). */
const CEVIRI_KAYNAK_ALANI = '_ceviriKaynak';

/**
 * Satirin CEVIRI KAYNAGI: cevrilmis satirda Turkce asil, degilse ad hucresi.
 *
 * ⚠ SUNUCUDAKI IKIZIYLE GOVDESI BIREBIR AYNI (`ceviri-kurali.ts`, K29):
 * sunucu haritayi bu anahtarla kurar ve satiri bu anahtarla sayar; ekran
 * ayni anahtarla yazar. Iki taraf farkli anahtar kullanirsa (14.09 incelemesi
 * O3/O6) ya sayilmayan satir ekranda cevrilir ya da Ingilizce kayitli teklifte
 * kota duser ama hicbir hucre degismez.
 */
export function satirKaynagi(row: Record<string, unknown>, adAlan: string): unknown {
  const kaynak = row[CEVIRI_KAYNAK_ALANI];
  return typeof kaynak === 'string' && ceviriAnahtari(kaynak) !== '' ? kaynak : row[adAlan];
}

/**
 * Satirlarda gecerli `_ceviriKaynak` isareti var mi — varsa ekran Ingilizce
 * gosteriyordur (isareti yalniz `ceviriUygula` yazar, `ceviriGeriAl` siler).
 */
export function cevrilmisSatirVarMi(sayfalar: ReadonlyArray<{ rowData?: ExcelRowData[] } | null | undefined> | null | undefined): boolean {
  if (!Array.isArray(sayfalar)) return false;
  return sayfalar.some((s) => {
    const satirlar: ExcelRowData[] = s?.rowData ?? [];
    return satirlar.some((r) => typeof r?._ceviriKaynak === 'string' && ceviriAnahtari(r._ceviriKaynak) !== '');
  });
}

/** Ceviriye girecek sayfa kesiti (SheetData uyumlu). */
export interface CeviriSayfasi {
  index: number;
  isEmpty?: boolean;
  rowData?: ExcelRowData[];
  columnRoles?: ColumnRoles;
}

/**
 * Ceviri haritasini satirlara uygular. Yazilan hucre sayisini doner.
 *
 * ⚠ ORIJINAL METIN KORUNUR (`_ceviriKaynak`): dil "Türkçe"ye alindiginda geri
 * donebilmek icin. Ceviriyi tek yon uygulayip orijinali kaybetmek, kullanicinin
 * emegini (elle duzelttigi adlari) geri alinamaz sekilde silerdi.
 *
 * Satirlar YERINDE guncellenir — cagiran taraf degisiklik varsa state'i
 * yeniden spread eder (ExcelGrid yazim yollari da node.data'yi dogrudan yazar).
 */
export function ceviriUygula(
  sayfalar: CeviriSayfasi[],
  harita: CeviriHaritasi,
  live?: Record<number, ExcelRowData[]>,
): number {
  let yazilan = 0;
  for (const sayfa of sayfalar) {
    if (sayfa.isEmpty) continue;
    const roles = sayfa.columnRoles ?? {};
    const adAlan = roles.nameField;
    if (!adAlan) continue;
    const rows = live?.[sayfa.index] ?? sayfa.rowData ?? [];
    for (const row of rows) {
      if (!row) continue;
      const anahtar = ceviriAnahtari(satirKaynagi(row, adAlan));
      const ceviri = Object.prototype.hasOwnProperty.call(harita, anahtar) ? harita[anahtar] : undefined;
      if (!ceviri || ceviri === row[adAlan]) continue;
      // Orijinali BIR KEZ sakla — ikinci ceviride ceviriyi orijinal sanmayalim.
      // Bos kaynak "orijinal yok" demektir (satirKaynagi da ada duser).
      if (satirKaynagi(row, adAlan) === row[adAlan]) row._ceviriKaynak = row[adAlan];
      row[adAlan] = ceviri;
      yazilan++;
    }
  }
  return yazilan;
}

/**
 * Ceviriyi geri alir — `_ceviriKaynak`teki orijinal metni yerine koyar.
 * Dil seciciyi "Türkçe"ye almak bunu cagirir.
 */
export function ceviriGeriAl(
  sayfalar: CeviriSayfasi[],
  live?: Record<number, ExcelRowData[]>,
): number {
  let geri = 0;
  for (const sayfa of sayfalar) {
    if (sayfa.isEmpty) continue;
    const adAlan = sayfa.columnRoles?.nameField;
    if (!adAlan) continue;
    const rows = live?.[sayfa.index] ?? sayfa.rowData ?? [];
    for (const row of rows) {
      if (!row || row._ceviriKaynak === undefined) continue;
      row[adAlan] = row._ceviriKaynak;
      delete row._ceviriKaynak;
      geri++;
    }
  }
  return geri;
}
