// ════════════════════════════════════════════════════════════════════
// PROFESYONEL TEKLIF CIKTISI MOTORU (PRD Teklif Formatim v2.1) — SAF, DB YOK
//
// SÖZLEŞME — Z4 (Fiyatlandırılmış Excel) + Z5 (Teklif Formatı) — ARINMA
// Faz 1, 27.07.2026. İKİ export yolu TEK doldurma motorunu
// (writePricesToWorkbook) ve TEK kolon haritasını kullanır (KF7).
// Çıktı DEĞİŞMEZLERİ:
//  1. GRID ↔ ÇIKTI BİREBİR: grid'de görünen her dolu değer dosyada
//     (yoksa kolon eklenir — KF2); grid'de olmayan hiçbir fiyat dosyada
//     kalamaz (K-A hayalet temizliği). Verisiz kolon eklenmez (KE8);
//     türetilmiş Toplam şablonda yoksa üretilmez (KE11).
//  2. Hedef kolon: colN → round-trip; sistem alanı → BAŞLIK ANLAMIYLA
//     (KE1-KE7); ekleme ucu başlık ekseninin sağı (DT120 tuzağı yok).
//  3. Tutar = ETKİN miktar × birim, hücre-referanslı CANLI formül; stale
//     değer asla kalmaz (KG1); TL değer yabancı para biçimiyle basılmaz
//     (K-C); shared-formula zincirleri yazım öncesi dondurulur (KH1).
//  4. SELF-CHECK: beklenen/yazılan sayısı + formül-hata artışı — uyumsuzluk
//     X-Export-Warning ile KULLANICIYA görünür; endpoint hiçbir girdiyle
//     500 dönmez (KH2). Z5 ek: format sayfaları natif korunur, liste
//     yuvası değişimi, İCMAL SUM'ları DOLU kolonlara bağlanır.
//  Mühür: test:ke (KE/KF/KG) + test:export (T) + test:livesim (SIM/G) +
//  test:tf (KH1 + ALTIN YOL).
//
// MIMARI v2 (kullanici karari 20.07 — "yuklendigim dosya birebir cikmali,
// is sayfalari TEK TUSLA yer degistirmeli"):
//   TABAN = FORMAT workbook'unun KENDISI (ExcelJS load → kapak GORSELLERI,
//   sartlar, kur sayfasi vb. NATIF korunur — hucre kopyasi resim tasiyamaz,
//   kullanicinin kapagi tamamen logoydu). 'liste' rollu sayfalar (eski is
//   sayfalari) SILINIR; teklifin liste sayfalari MUSTERI workbook'undan
//   fiyatlari yazilmis halde ayni KONUMA kopyalanir.
// T6: fiyatsiz hucre HIC yazilmaz (0 asla).
// T7: tutar hucreleri CANLI FORMUL (=miktar*birim); icmal/genel toplam
//     formullu (SUM parcalari SON sayfa adlariyla kurulur).
// Test: test/export-format-test.ts
// ════════════════════════════════════════════════════════════════════
import * as ExcelJS from 'exceljs';
import {
  fillPlaceholders, applyOverrides, KOLON_HARF, sayfaRolleriTahminEt,
  FillContext, SekmeOzet, YerTutucu, ExportOverrides, SheetRoles,
} from '../../cikti/quote-formats/format-engine';
import { standartSayfaYaz } from './standart-cikti';

/** TR-bilinçli sayi parse (Bulgu B7/B8 siniri): "1.234,56" → 1234.56,
 *  "87,5" → 87.5, "313" → 313. Grid hucreleri metin tasiyabilir. */
const sayi = (v: any): number => {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let s = String(v).replace(/[₺$€\s]/g, '').trim();
  if (s === '') return 0;
  const virgul = s.includes(',');
  const nokta = s.includes('.');
  if (virgul && nokta) s = s.replace(/\./g, '').replace(',', '.'); // TR: nokta binlik
  else if (virgul) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

/** Formul icindeki sayfa adi: tek tirnak kacisli */
const sayfaRef = (name: string) => `'${name.replace(/'/g, "''")}'`;

/** PANO 18: export EKRANDAKI para birimini alir — yalniz GORUNTULEME
 *  cevirisi (kutuphane orijinal birimleri degismez). */
export interface ExportBirim {
  kod: 'TRY' | 'USD' | 'EUR';
  /** TRY → hedef birim carpani (USD: 1/usdTry). TRY'de 1. */
  katsayi: number;
  /** Dosyaya yazilacak kur notu ("Fiyatlar USD — 1 USD = ₺47,35 …") */
  not: string | null;
}
const BIRIM_FMT: Record<ExportBirim['kod'], string> = {
  TRY: '#,##0.00" TL"',
  USD: '"$"#,##0.00',
  EUR: '"€"#,##0.00',
};

/** K-C (S3, EMO AYVAZ) + PANO 18: yazilan hucrenin sayi bicimi HEDEF
 *  birime cekilir — TL deger "USD" etiketiyle (veya tersi) basilamaz. */
const birimBicimiDuzelt = (cell: ExcelJS.Cell, kod: ExportBirim['kod']) => {
  const f = String(cell.numFmt ?? '');
  if (kod !== 'TRY') { cell.numFmt = BIRIM_FMT[kod]; return; }
  if (f && /USD|EUR|GBP|\$|€|£/i.test(f) && !/TL|₺/i.test(f)) cell.numFmt = BIRIM_FMT.TRY;
};

/** K-D (S4): sayfadaki formul-hata (cached #DEĞER!/#REF!/#AD?) hucre sayisi.
 *  Yazim oncesi/sonrasi karsilastirilir — yazim hata sayisini ARTIRAMAZ. */
const hataSay = (ws: ExcelJS.Worksheet): number => {
  let n = 0;
  ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
    const v: any = cell.value;
    if (v && typeof v === 'object'
        && (v.error || (v.result && typeof v.result === 'object' && v.result.error))) n++;
  }));
  return n;
};

/** TR-bilincli baslik normalizasyonu: harf-disi karakter at, kucult, TR
 *  harfleri katla. "Malz. Birim\nFiyat" → "malzbirimfiyat". */
const basNorm = (v: any): string =>
  String(v ?? '')
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's').replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g').replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

/** ExcelJS hucre degerinden duz metin (richText/formul-sonuc/duz). */
const hucreDeger = (v: any): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t?.text ?? '').join('');
    if (v.formula !== undefined) return String(v.result ?? '');
    if (v.text !== undefined) return String(v.text);
    return '';
  }
  return String(v);
};

/** Bir fiyat/tutar kolonunun ANLAMI — sistem alanini (fixedSchema) musteri
 *  workbook'unun KENDI basligina eslemek icin (Duzeltme Talebi 24.07). */
export type FiyatAnlam = 'matUnit' | 'matTot' | 'labUnit' | 'labTot' | 'grandUnit' | 'grandTot';

/** Normalize edilmis baslik verilen anlama uyar mi? Toleransli (KE3/KE7):
 *  "Malz."="Malzeme", "İşç."="İşçilik", "Bir. Fiyat"="Birim Fiyat". Birim
 *  fiyat ≠ tutar ayrimi kritik (aksi halde F↔H karisir). */
export function basligaUyar(hn: string, anlam: FiyatAnlam): boolean {
  const malz = hn.includes('malz');
  const isc = hn.includes('isc');
  const birimFiyat = hn.includes('bir') && hn.includes('fiyat');
  const tutar = hn.includes('tutar') || hn.includes('toplam');
  switch (anlam) {
    case 'matUnit': return malz && birimFiyat;
    case 'matTot': return malz && tutar && !birimFiyat;
    case 'labUnit': return isc && birimFiyat;
    case 'labTot': return isc && tutar && !birimFiyat;
    case 'grandUnit': return !malz && !isc && birimFiyat;
    case 'grandTot': return !malz && !isc && tutar && !birimFiyat;
  }
}

interface SheetJson {
  name?: string;
  index?: number;
  isEmpty?: boolean;
  headerEndRow?: number;
  /** KE15: grid col0'in Excel'deki 0-tabanli kolon indeksi (parse'in sheet
   *  range baslangici). SAHINKUL'da A bos → col0 = Excel B → colOffset=1.
   *  Yok/0 ise col0 = Excel A (eski davranis, tum mevcut fixture'lar). */
  colOffset?: number;
  columnDefs?: Array<{ field: string; headerName?: string }>;
  columnRoles?: Record<string, string | undefined>;
  rowData?: Array<Record<string, any>>;
}

/** Fiyat yazimindan donen HAM sekme bilgisi — SUM formulu SONRADAN
 *  (kopya sonrasi SON sayfa adiyla) kurulur. */
export interface SekmeBilgi {
  wsName: string;
  matCol: number | null;
  labCol: number | null;
  ilkVeri: number;
  sonVeri: number;
  matDeger: number;
  labDeger: number;
  /** KF6 self-check: uygulamada dolu (>0) fiyat/tutar hucre sayisi */
  beklenen: number;
  /** KF6 self-check: dosyaya GERCEKTEN yazilan hucre sayisi */
  yazilan: number;
  /** K-D (KG5): yazimla ARTAN formul-hata sayisi (0 olmali) */
  hataArtisi: number;
  /** PANO 21c: hic fiyati olmayan veri satiri sayisi (eslesmemis — bilgi) */
  fiyatsizSatir: number;
}

// ── T1/T3 (PRD_Standart_Grid §Bolum E): SABLONA YAZAN ESKI MOTOR SILINDI.
// `writePricesToWorkbook` (352 satir) + anlamsal baslik eslestirici
// (basNorm · basligaUyar · basligaGoreKolon · bosBaslikKolonu · kolonAta)
// musterinin workbook'una fiyat yaziyordu. Kullanici karari (30.07.2026)
// ile iki export yolu da 9 kolonluk STANDART tabloya gecti; bu katmanin
// URETIMDE TEK BIR CAGIRANI KALMADI (0 referans dogrulandi).
// Yerine: src/quotes/standart-cikti.ts → standartSayfaYaz (KF7 tek motor).
// Gecmis: git log -- src/quotes/export-engine.ts


/** SekmeBilgi + SON sayfa adi → icmal SUM formullu SekmeOzet (T5/T7). */
export function sekmeOzetiKur(b: SekmeBilgi, sonAd: string): SekmeOzet {
  const aralik = (col: number | null): string | null =>
    col && b.ilkVeri && b.sonVeri
      ? `SUM(${sayfaRef(sonAd)}!${KOLON_HARF(col)}${b.ilkVeri}:${KOLON_HARF(col)}${b.sonVeri})`
      : null;
  return {
    name: sonAd,
    matFormul: aralik(b.matCol),
    labFormul: aralik(b.labCol),
    matDeger: b.matDeger,
    labDeger: b.labDeger,
  };
}

// NOT (Bulgu Raporu 21.07, B1-B9 → kok neden): grid state'inden workbook
// ureten `buildListWorkbookFromSheets` SILINDI. Iki yol yan yana kalmaz —
// cikti YALNIZ iki gercek kaynaktan kurulur: format workbook'u (taban) +
// musterinin ORIJINAL workbook kopyasi (liste sayfalari). Orijinal dosya
// olmayan teklif DISA AKTARILAMAZ (acik hata; sessiz sahte cikti YASAK).

/** Format sayfasini hedef workbook'a hucre-hucre kopyalar (deger+stil+
 *  merge+kolon genisligi+satir yuksekligi). Ad cakisirsa " (Format)" eki. */
export function kopyalaSayfa(
  kaynak: ExcelJS.Worksheet,
  hedef: ExcelJS.Workbook,
): ExcelJS.Worksheet {
  let ad = kaynak.name;
  if (hedef.worksheets.some((w) => w.name === ad)) ad = `${ad} (2)`.slice(0, 31);
  const ws = hedef.addWorksheet(ad);

  const kolonSayisi = Math.max(kaynak.columnCount || 1, 1);
  for (let c = 1; c <= kolonSayisi; c++) {
    const src = kaynak.getColumn(c);
    if (src.width) ws.getColumn(c).width = src.width;
    if (src.hidden) ws.getColumn(c).hidden = true;
  }
  kaynak.eachRow({ includeEmpty: true }, (row, rn) => {
    const dRow = ws.getRow(rn);
    if (row.height) dRow.height = row.height;
    row.eachCell({ includeEmpty: true }, (cell, cn) => {
      const d = dRow.getCell(cn);
      d.value = cell.value as any;
      d.style = JSON.parse(JSON.stringify(cell.style ?? {}));
    });
  });
  for (const m of (kaynak.model?.merges ?? []) as string[]) {
    try { ws.mergeCells(m); } catch { /* cakisan merge atlanir */ }
  }
  return ws;
}

/** Sayfalari verilen AD SIRASINA gore dizer. ExcelJS worksheets getter'i
 *  orderNo'ya gore SIRALAR (doc/workbook.js:123) — dizi manipulasyonu degil
 *  orderNo atamasi gerekir (testte kanitlandi). Listede olmayanlar sona. */
export function sayfalariSirala(wb: ExcelJS.Workbook, adSirasi: string[]): void {
  const hepsi: any[] = ((wb as any)._worksheets as any[]).filter(Boolean);
  const sirali = adSirasi
    .map((a) => hepsi.find((w: any) => w.name === a))
    .filter(Boolean);
  const kalan = hepsi
    .filter((w: any) => !sirali.includes(w))
    .sort((a: any, b: any) => (a.orderNo ?? 0) - (b.orderNo ?? 0));
  let sira = 1;
  for (const w of [...sirali, ...kalan]) w.orderNo = sira++;
}

export interface ExportGirdisi {
  /** Musterinin ORIJINAL Excel'i — ZORUNLU (Bulgu Raporu: grid'den uretim
   *  silindi; dosya yoksa cikti YOK, acik hata verilir). */
  originalFile: Buffer;
  sheetsArr: SheetJson[];
  formatWb: ExcelJS.Workbook;
  /** Format sayfa rolleri (mapping.sheetRoles); verilmezse sezgisel tahmin.
   *  'liste' sayfalari SILINIR ve teklif sayfalari o konuma girer. */
  sheetRoles?: SheetRoles | null;
  ctxTemel: Omit<FillContext, 'sekmeler'>;
  overrides?: ExportOverrides | null;
  /** PANO 18: ekrandaki goruntuleme birimi — iki export yolu da ayni (KF7) */
  birim?: ExportBirim | null;
  /** 13.08: 'en' → kolon basliklari + birim kisaltmalari Ingilizce.
   *  IKIZ KURALI: fiyatli cikti yolu bunu tasiyip bu yol tasimasaydi,
   *  kullanici hangi butona bastigina gore FARKLI bir dosya alirdi. */
  dil?: string;
}

export interface ExportSonucu {
  wb: ExcelJS.Workbook;
  sekmeler: SekmeOzet[];
  /** Otomatik doldurulan hucreler (T14 haritasi) */
  dolan: YerTutucu[];
  /** Formatin SABIT sayfalari (onizlemede duzenlenebilir olanlar) */
  formatSayfalari: string[];
  /** Ciktiya giren teklif liste sayfalarinin SON adlari */
  listeSayfalari: string[];
  /** KF6 self-check: dosyaya yazilamayan dolu deger sayisi (0 = kayip yok) */
  eksikDeger: number;
  /** K-D (KG5): yazimla artan formul-hata sayisi (0 olmali) */
  hataArtisi: number;
  /** PANO 21c: eslesmemis (tamamen fiyatsiz) veri satiri toplami */
  fiyatsizSatir: number;
  /** PANO 21a: gorunur ozet icin sayac toplamlari */
  yazilanDeger: number;
  beklenenDeger: number;
}

/**
 * TAM CIKTI KURUCUSU — MIMARI v2 (kullanici karari 20.07):
 *  1. TABAN = FORMAT workbook (gorseller/sartlar/kur sayfasi NATIF korunur)
 *  2. 'liste' rollu sayfalar (eski is sayfalari) SILINIR — konum not edilir
 *  3. Teklifin liste sayfalari musteri wb'sinde FIYATLARI YAZILIP (T6/T7)
 *     tabana kopyalanir, silinen yuvanin KONUMUNA yerlesir
 *  4. Yer tutucular doldurulur (T4/T5) + teklif override'lari (T13/T14)
 */
export async function buildExportWorkbook(g: ExportGirdisi): Promise<ExportSonucu> {
  // ── 1. Taban: format dosyasinin kendisi ──
  const wb = g.formatWb;
  const roller = g.sheetRoles ?? sayfaRolleriTahminEt(wb);

  // Orijinal sayfa sirasi (silmeden ONCE) — yuva konumu icin
  const orijinalSira = wb.worksheets.map((w) => w.name);

  // ── 2. Liste yuvalarini sil ──
  const silinecek = wb.worksheets.filter((w) => roller[w.name] === 'liste');
  for (const w of silinecek) wb.removeWorksheet(w.id);
  const formatSayfalari = wb.worksheets.map((w) => w.name); // kalan = sabit

  // ── 3. Teklif liste sayfalari: ORIJINAL musteri wb kopyasi + fiyat yaz ──
  // (Bulgu Raporu kok neden: grid'den uretim SILINDI — tek yol budur.)
  // ── EX8 (kullanici karari 30.07): liste sayfalari artik MUSTERI
  // WORKBOOK'UNUN KOPYASI degil, 9 kolonluk STANDART TABLO. Format dosyasinin
  // kendisi (kapak/İCMAL/yer tutucular) AYNEN korunur — T-serisi gecerli.
  // KF7: iki export yolu da `standartSayfaYaz` motorunu kullanir; ikinci bir
  // yazim yolu YOK. Orijinal dosya artik ZORUNLU DEGIL (grid verisi yeterli).
  const bilgiler: SekmeBilgi[] = [];
  // KF6 self-check: yazilamayan dolu deger — sessiz veri kaybi YASAK,
  // cagiran (controller) kullaniciya gorunur uyari tasir.
  const eksikDeger = bilgiler.reduce((a, b) => a + Math.max(0, b.beklenen - b.yazilan), 0);
  if (eksikDeger > 0) {
    console.warn(`[Export] ⚠ SELF-CHECK: ${eksikDeger} dolu fiyat degeri dosyaya YAZILAMADI`);
  }
  const hataArtisi = bilgiler.reduce((a, b) => a + (b.hataArtisi ?? 0), 0);
  const fiyatsizSatir = bilgiler.reduce((a, b) => a + (b.fiyatsizSatir ?? 0), 0);
  const yazilanDeger = bilgiler.reduce((a, b) => a + b.yazilan, 0);
  const beklenenDeger = bilgiler.reduce((a, b) => a + b.beklenen, 0);

  const listeSayfalari: string[] = [];
  const sekmeler: SekmeOzet[] = [];
  for (const sh of g.sheetsArr ?? []) {
    if (!sh || sh.isEmpty) continue;
    // EX8: standart tablo DOGRUDAN format workbook'una yazilir.
    // toplamSatiri=false — İCMAL zaten SUM ile topluyor, cift toplam olmasin.
    const sb = standartSayfaYaz(wb, sh, { birim: g.birim as any, toplamSatiri: false, dil: g.dil });
    listeSayfalari.push(sb.wsName);
    const b: SekmeBilgi = {
      wsName: sb.wsName, matCol: sb.matCol, labCol: sb.labCol,
      ilkVeri: sb.ilkVeri, sonVeri: sb.sonVeri,
      matDeger: sb.matDeger, labDeger: sb.labDeger,
      beklenen: sb.yazilan, yazilan: sb.yazilan, hataArtisi: 0,
      fiyatsizSatir: (sh.rowData ?? []).filter((r: any) => r?._isDataRow && !r?._ozet
        && !(parseFloat(String(r?._matBirim ?? '')) > 0) && !(parseFloat(String(r?._labBirim ?? '')) > 0)).length,
    };
    bilgiler.push(b);
    sekmeler.push(sekmeOzetiKur(b, sb.wsName));
  }

  // ── Sira: ilk liste-yuvasinin konumuna teklif sayfalari girer ──
  const hedefSira: string[] = [];
  let listelerEklendi = false;
  for (const ad of orijinalSira) {
    if (roller[ad] === 'liste') {
      if (!listelerEklendi) { hedefSira.push(...listeSayfalari); listelerEklendi = true; }
      continue; // eski is sayfasi ciktida yok
    }
    hedefSira.push(ad);
  }
  if (!listelerEklendi) hedefSira.push(...listeSayfalari); // yuva yoksa sona
  sayfalariSirala(wb, hedefSira);

  // ── 4. Doldur + teklif katmani ──
  const dolan = fillPlaceholders(wb, { ...g.ctxTemel, sekmeler });
  applyOverrides(wb, g.overrides);

  return { wb, sekmeler, dolan, formatSayfalari, listeSayfalari, eksikDeger, hataArtisi, fiyatsizSatir, yazilanDeger, beklenenDeger };
}
