/**
 * merge-multisheet — Excel yeniden yuklemede VERI KORUMA (PRD).
 *
 * Sorun: yeni Excel yuklenince setMultiSheet(incoming) mevcut grid state'ini
 * TAMAMEN eziyordu — kullanicinin girdigi kar marjlari, marka secimleri ve
 * fiyatlar kayboluyordu.
 *
 * Cozum: sheet'ler ada gore, satirlar "en yakin bolum basligi + poz no + is
 * tanimi" anahtarina gore eslestirilir (D6 — bkz. `anahtarla`):
 *   - ESLESEN satir: dosyadan gelen kaynak hucreler guncellenir; kullanicinin
 *     sistem alanlari (_malzKar, _marka, _firma, kar'li fiyatlar...) ve dolu
 *     fiyat hucreleri AYNEN KORUNUR.
 *   - YENI satir: tabloya eklenir.
 *   - SADECE ESKIDE olan satir (kullanici manuel eklemis / eski dosyada var):
 *     SILINMEZ, sheet sonuna korunarak tasinir.
 *   - Kullanicinin context-menu ile ekledigi OZEL SUTUNLAR columnDefs'te korunur.
 * Tum sheet'ler islenir (multi-sheet) — yeni sheet eklenir, eski sheet durur.
 */

import type {
  MultiSheetData, SheetData, ExcelRowData, ColumnRoles, ExcelColumnDef,
} from '@/ozellik/tablo/excel-grid/types';
// NOT: goreli yol ZORUNLU — vitest'te '@/' alias'i yok (yalniz tip importu silinir).
import { sayiOku } from '../fiyat/sayi-alani';

/** Kullanici emegi tasiyan alanlar — merge'de HER ZAMAN eski satirdan korunur. */
const SYSTEM_FIELDS = [
  '_malzKar', '_iscKar', '_marka', '_firma',
  '_matNetPrice', '_labNetPrice', '_candidates', '_draftDiscount',
] as const;

export interface MergeStats {
  matchedRows: number;
  newRows: number;
  preservedRows: number; // yalniz eski dosyada olan, sona tasinan
  newSheets: number;
}

/** Birlestirmeye giren satir: veri satiri; yedek satir ve kullanicinin grup bandi DEGIL. */
const birlesebilir = (r: ExcelRowData) => r._isDataRow && !r._isSpareRow && !r._isGroupRow;

function rowKey(row: ExcelRowData, roles: ColumnRoles): string {
  const no = roles.noField ? String(row[roles.noField] ?? '').trim().toLowerCase() : '';
  const name = roles.nameField ? String(row[roles.nameField] ?? '').trim().toLowerCase() : '';
  if (!no && !name) return '';
  return `${no}|${name}`;
}

/**
 * Bolum basligi: dosyanin VERI OLMAYAN metinli satiri ("KAT 1 TESİSATI").
 * Kolon basligi bolum DEGILDIR: revizyonda basligi degisen dosyada ilk bolumun
 * tekrarlari eslesmesini kaybederdi. (Grup bandi etiketi `_groupLabel`da,
 * dosya hucreleri bos — metni olmadigi icin bolum acmaz.) Metin sirasiyla ad
 * hucresinden, sira no hucresinden, satirin kaynak metinlerinden (`_kaynak` —
 * sabit semada dosya kolonlari ALT CIZGILI alanlarda durur; basligi Sira No
 * kolonuna yazilmis dosyada `_ad` bostur, inceleme 05.10) ve en son eski
 * kayittaki (colN) dosya hucrelerinden; buyuk/kucuk harf (TR) ve bosluk farki
 * ayni bolumdur.
 */
function bolumMetni(row: ExcelRowData, roles: ColumnRoles): string | null {
  if (row._isDataRow || row._isHeaderRow) return null;
  const kaynak = row._kaynak && typeof row._kaynak === 'object' ? Object.values(row._kaynak as Record<string, unknown>) : [];
  const adaylar = [roles.nameField ? row[roles.nameField] : undefined, roles.noField ? row[roles.noField] : undefined,
    ...kaynak, ...Object.keys(row).filter((k) => !k.startsWith('_')).map((k) => row[k])];
  const metin = adaylar.map((v) => String(v ?? '').replace(/\s+/g, ' ').trim()).find(Boolean);
  return metin ? metin.toLocaleLowerCase('tr') : null;
}

interface Anahtar {
  /** bolum + no|ad + bolumdeki sira — tekrarlar SIRAYLA eslenir */
  tam: string;
  /** no|ad — tam eslesmeyen kalan kopyalarin yedek eslesmesi */
  temel: string;
}

/**
 * D6 (koordinator karari 05.10; canli: 12 teklifin 7'sinde tekrar, 458 risk
 * satiri, hepsinde No BOS): anahtar yalniz "no|ad" iken ayni ad farkli
 * bolumlerde tekrar edince ikinci kopya fiyatini kaybediyor, one eklenen
 * bolumde fiyat YANLIS satira gidiyordu. Anahtara en yakin bolum basligi ve
 * bolumdeki sira eklenir.
 */
function anahtarla(rows: ExcelRowData[], roles: ColumnRoles): Map<ExcelRowData, Anahtar> {
  const sonuc = new Map<ExcelRowData, Anahtar>();
  const sayac = new Map<string, number>();
  let bolum = '';
  for (const r of rows) {
    const b = bolumMetni(r, roles);
    if (b !== null) { bolum = b; continue; }
    if (!birlesebilir(r)) continue;
    const temel = rowKey(r, roles);
    if (!temel) continue;
    const grup = `${bolum}\u0000${temel}`;
    const sira = sayac.get(grup) ?? 0;
    sayac.set(grup, sira + 1);
    sonuc.set(r, { tam: `${grup}\u0000${sira}`, temel });
  }
  return sonuc;
}

/**
 * Gelen satir → eski satir eslesmesi. Once TAM anahtar (ayni bolum, ayni sira).
 * Sonra YEDEK, ad (no|ad) basina: tam eslesmeyen KALAN kopyalarin sayisi iki
 * dosyada ESITSE sirayla eslenir — bolum adi degisti, bolum ortasina not satiri
 * girdi ya da bir satir miktar kazanip veri oldu (inceleme 05.10: kalan
 * tekrarlar fiyatini kaybediyordu). Sayilar farkliysa hangi kopyanin hangisi
 * oldugu bilinemez: tahmin YOK (yeni satir + korunan eski satir).
 */
function eslestir(prev: Map<ExcelRowData, Anahtar>, gelen: Map<ExcelRowData, Anahtar>): Map<ExcelRowData, ExcelRowData> {
  const eslesme = new Map<ExcelRowData, ExcelRowData>();
  const prevByTam = new Map<string, ExcelRowData>();
  prev.forEach((a, r) => prevByTam.set(a.tam, r));
  gelen.forEach((a, inc) => {
    const p = prevByTam.get(a.tam);
    if (p) eslesme.set(inc, p);
  });
  const kullanilan = new Set<ExcelRowData>(eslesme.values());
  /** Eslesmemis satirlar ad basina, satir sirasiyla. */
  const kalanlar = (m: Map<ExcelRowData, Anahtar>, eslesmis: (r: ExcelRowData) => boolean) => {
    const k = new Map<string, ExcelRowData[]>();
    m.forEach((a, r) => { if (!eslesmis(r)) k.set(a.temel, [...(k.get(a.temel) ?? []), r]); });
    return k;
  };
  const prevKalan = kalanlar(prev, (r) => kullanilan.has(r));
  kalanlar(gelen, (r) => eslesme.has(r)).forEach((liste, temel) => {
    const eski = prevKalan.get(temel);
    if (eski && eski.length === liste.length) liste.forEach((inc, i) => eslesme.set(inc, eski[i]));
  });
  return eslesme;
}

/** Fiyat rol alanlari — eski satirda DOLU ise korunur (kullanici/eslestirme emegi). */
function priceFields(roles: ColumnRoles): string[] {
  return [
    roles.materialUnitPriceField, roles.materialTotalField,
    roles.laborUnitPriceField, roles.laborTotalField,
    roles.grandUnitPriceField, roles.grandTotalField,
  ].filter(Boolean) as string[];
}

function mergeSheetRows(
  prevRows: ExcelRowData[],
  incoming: SheetData,
  prevDefs: ExcelColumnDef[],
  stats: MergeStats,
): { rows: ExcelRowData[]; columnDefs: ExcelColumnDef[] } {
  const roles = incoming.columnRoles ?? {};
  const pFields = priceFields(roles);

  // D6: bolum + no|ad + sira ile eslestir (bkz. `anahtarla`, `eslestir`)
  const prevAnahtar = anahtarla(prevRows, roles);
  const eslesme = eslestir(prevAnahtar, anahtarla(incoming.rowData ?? [], roles));
  const consumed = new Set<ExcelRowData>(eslesme.values());
  const merged: ExcelRowData[] = [];
  const yeniNo = new Map<number, number>(); // eski satirin _rowIdx'i → birlesik tablodaki _rowIdx
  let idx = 0;

  for (const inc of incoming.rowData ?? []) {
    if (!inc._isDataRow) {
      // Baslik/grup satirlari dosyadan aynen gelir
      merged.push({ ...inc, _rowIdx: idx++ });
      continue;
    }
    const prev = eslesme.get(inc);
    if (prev) {
      stats.matchedRows++;
      // Taban: yeni dosya satiri (kaynak hucreler guncel — miktar/birim/ad)
      const out: ExcelRowData = { ...prev, ...inc, _rowIdx: idx++ };
      yeniNo.set(prev._rowIdx, out._rowIdx);
      // Sistem alanlari eski satirdan geri yaz (kullanici emegi)
      for (const f of SYSTEM_FIELDS) {
        if (prev[f] !== undefined) (out as any)[f] = prev[f];
      }
      // Dolu fiyat hucreleri eski satirdan korunur (dosya fiyat tasimiyor;
      // stripPrices'li prepare bos gonderir — bosla ezme!)
      // A2 (tur 3, olculdu): "dolu" olcutu `parseFloat(metin) !== 0` idi —
      // NaN !== 0 oldugu icin METIN fiyat ("35x240mm Üç bölmeli…") "dolu"
      // sayilip yeni dosyanin degerine karsi KORUNUYORDU. Dolu = makine
      // okuyucusuyla sifirdan farkli SAYI.
      // Ice aktarma sayi isareti YENI dosyanindir; korunan fiyatin isareti duser.
      out._sayiUyari = inc._sayiUyari ? { ...inc._sayiUyari } : undefined;
      for (const f of pFields) {
        const prevSayi = sayiOku(prev[f]);
        if (prevSayi !== null && prevSayi !== 0) {
          out[f] = prev[f];
          if (out._sayiUyari) delete out._sayiUyari[f];
        }
      }
      if (out._sayiUyari && Object.keys(out._sayiUyari).length === 0) out._sayiUyari = undefined;
      // Kullanicinin ozel sutunlarindaki degerler (incoming'de alan yok) —
      // spread sirasi geregi zaten prev'den geliyor ✓
      merged.push(out);
    } else {
      stats.newRows++;
      merged.push({ ...inc, _rowIdx: idx++ });
    }
  }

  // Yalniz eskide kalan satirlar — KAYBETME, sona tasi. D6: eskiden yalniz her
  // anahtarin ILK satiri tasiniyordu; eslesmeyen tekrarlar SESSIZCE dusuyordu.
  for (const r of prevRows) {
    if (!prevAnahtar.has(r) || consumed.has(r)) continue;
    stats.preservedRows++;
    yeniNo.set(r._rowIdx, idx);
    merged.push({ ...r, _rowIdx: idx++ });
  }

  // Fitting kapsami ayni sayfadaki satirlarin `_rowIdx` listesidir; yukarida satirlar
  // YENIDEN numaralandi. Kapsam eski numarada kalirsa fitting tutari BASKA satirlardan
  // hesaplanir (inceleme 05.10). Tabloda artik olmayan satir kapsamdan duser.
  const rows = merged.map((r) => (r._fitting && Array.isArray(r._fitting.kapsam)
    ? { ...r, _fitting: { ...r._fitting, kapsam: r._fitting.kapsam.map((i) => yeniNo.get(i)).filter((i): i is number => i !== undefined) } }
    : r));

  // Sutunlar: dosyanin yapisi taban + kullanicinin ekledigi ozel sutunlar
  const incFields = new Set((incoming.columnDefs ?? []).map((c) => c.field));
  const extraDefs = prevDefs.filter((c) => !incFields.has(c.field));
  const columnDefs = [...(incoming.columnDefs ?? []), ...extraDefs];

  return { rows, columnDefs };
}

export function mergeMultiSheet(
  prev: MultiSheetData | null,
  prevLive: Record<number, ExcelRowData[]>,
  incoming: MultiSheetData,
): { merged: MultiSheetData; live: Record<number, ExcelRowData[]>; stats: MergeStats } {
  const stats: MergeStats = { matchedRows: 0, newRows: 0, preservedRows: 0, newSheets: 0 };

  if (!prev || !prev.sheets?.length) {
    const live: Record<number, ExcelRowData[]> = {};
    incoming.sheets.forEach((s) => { live[s.index] = s.rowData; });
    stats.newSheets = incoming.sheets.length;
    stats.newRows = incoming.sheets.reduce(
      (n, s) => n + (s.rowData?.filter((r) => r._isDataRow).length ?? 0), 0,
    );
    return { merged: incoming, live, stats };
  }

  const prevByName = new Map<string, SheetData>();
  for (const s of prev.sheets) prevByName.set(s.name, s);

  const outSheets: SheetData[] = [];
  const live: Record<number, ExcelRowData[]> = {};
  const usedPrev = new Set<string>();
  let nextIndex = 0;

  for (const incSheet of incoming.sheets) {
    const prevSheet = prevByName.get(incSheet.name);
    const index = nextIndex++;
    if (!prevSheet) {
      stats.newSheets++;
      const s = { ...incSheet, index };
      outSheets.push(s);
      live[index] = s.rowData;
      continue;
    }
    usedPrev.add(prevSheet.name);
    const prevRows = prevLive[prevSheet.index] ?? prevSheet.rowData ?? [];
    const { rows, columnDefs } = mergeSheetRows(prevRows, incSheet, prevSheet.columnDefs ?? [], stats);
    const s: SheetData = { ...incSheet, index, columnDefs, rowData: rows };
    outSheets.push(s);
    live[index] = rows;
  }

  // Yalniz eski dosyada olan sheet'ler — aynen korunur
  for (const s of prev.sheets) {
    if (usedPrev.has(s.name)) continue;
    const index = nextIndex++;
    const rows = prevLive[s.index] ?? s.rowData ?? [];
    outSheets.push({ ...s, index, rowData: rows });
    live[index] = rows;
  }

  return {
    merged: { sheets: outSheets, brands: incoming.brands ?? prev.brands },
    live,
    stats,
  };
}
