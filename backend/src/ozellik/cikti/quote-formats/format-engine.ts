// ════════════════════════════════════════════════════════════════════
// TEKLIF FORMATI MOTORU (PRD Teklif Formatim v2.1) — SAF MODUL, DB YOK
//
// Kullanicinin KENDI teklif sablonu (.xlsx: KAPAK + ICMAL + ...) uzerinde:
//  - {{YER_TUTUCU}} tarama (T3: bulunan listelenir, taninmayan uyarilir)
//  - ornek/yerlesik format uretimi (T8 geri dusus + indirilebilir ornek)
//  - ExcelJS sayfa → ExcelGrid SheetData donusumu (FE onizleme)
//
// ALTIN KURAL (T3): yer tutucusuz hucreye ASLA dokunulmaz — doldurma
// yalniz taranan adreslere yazar (quotes.service P2 doldurucusu bu
// mapping'i kullanir). Test: test/export-format-test.ts
// ════════════════════════════════════════════════════════════════════
import * as ExcelJS from 'exceljs';
import { kurusTamsayi } from '../../fiyat/matching/pricing';
// A2 (tur 3): kullanicinin yazdigi override metni INSAN sinirindadir — tek sayi kurali
import { insanSayiOku } from '../../kutuphane/utils/import-fidelity';
import { BIRIM_SIRASI, ParaBirimi, SEMBOL, paraMetni } from '../../teklif/quotes/cikti-karisik';
import { satirEkle } from './satir-ekleme';

/** PRD §2 tablosu — bilinen yer tutucular. Disindaki her {{ETIKET}} T3
 *  geregi "taninmayan" olarak uyarilir (ama hucreye DOKUNULMAZ). */
export const TANINAN_ETIKETLER: ReadonlySet<string> = new Set([
  'TEKLIF_NO', 'REV', 'TARIH',
  'MUSTERI', 'PROJE', 'HAZIRLAYAN', 'GECERLILIK',
  'MALZEME_TOPLAMI', 'ISCILIK_TOPLAMI', 'KDV', 'GENEL_TOPLAM',
  'KUR_NOTU', 'ICMAL_SATIRLARI',
]);

/**
 * COKLU PARA BIRIMI (İCMAL, 05.10): dort toplam etiketinin BIRIM EKLI bicimi —
 * {{GENEL_TOPLAM_USD}}. O birimin toplamini tasir; tek birimli teklifte
 * teklifin birimi tum toplami, digerleri 0 alir. Yerlesik format karisik
 * teklifte toplam blogunu bunlarla birim basina yazar (`yerlesikToplamlariBirimle`).
 * Ayri kume: ornek format (tek birimli) bunlari TASIMAZ.
 */
export const TOPLAM_ETIKETLERI = ['MALZEME_TOPLAMI', 'ISCILIK_TOPLAMI', 'KDV', 'GENEL_TOPLAM'] as const;
export const birimliEtiket = (etiket: string, pb: ParaBirimi): string => `${etiket}_${pb}`;
// Kume YUKLEME ANINDA kurulur: ice aktarilan bir sabite (BIRIM_SIRASI) dayanmaz —
// ileride bir ice aktarma dongusu modulu yari yuklu birakirsa cokmesin (inceleme L9).
// Kumede sira onemsiz; doldurma sirasi cagri aninda BIRIM_SIRASI'ndan.
export const BIRIMLI_ETIKETLER: ReadonlySet<string> = new Set(
  TOPLAM_ETIKETLERI.flatMap((e) => (['TRY', 'USD', 'EUR'] as const).map((pb) => birimliEtiket(e, pb))),
);

export interface YerTutucu {
  etiket: string; // kanonik (buyuk harf, suslu parantezsiz)
  sheet: string;
  addr: string; // "B4" gibi
  /** Doldurulan para hucresinin birimi (karisik kip ya da birim ekli etiket) —
   *  cikti hucre bicimini buna gore kurar. Yoksa teklifin goruntuleme birimi. */
  pb?: ParaBirimi;
}
export interface FormatMapping {
  bulunan: YerTutucu[];
  taninmayan: YerTutucu[];
}

const ETIKET_RE = /\{\{\s*([A-Za-z_]+)\s*\}\}/g;

/** Hucre gorunur metni — string/richText/formula-result hepsi tek yoldan. */
export function hucreMetni(cell: ExcelJS.Cell): string {
  const v: any = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text ?? '').join('');
    if (v.formula !== undefined) return String(v.result ?? '');
    if (v.text !== undefined) return String(v.text); // hyperlink
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
}

/** T3 taramasi: tum sayfalarda {{ETIKET}} ara. Ayni hucrede birden cok
 *  etiket olabilir (orn "Teklif No: {{TEKLIF_NO}} Rev {{REV}}"). */
export function scanWorkbook(wb: ExcelJS.Workbook): FormatMapping {
  const bulunan: YerTutucu[] = [];
  const taninmayan: YerTutucu[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const text = hucreMetni(cell);
        if (!text.includes('{{')) return;
        let m: RegExpExecArray | null;
        ETIKET_RE.lastIndex = 0;
        while ((m = ETIKET_RE.exec(text)) !== null) {
          const etiket = m[1].toUpperCase();
          const kayit: YerTutucu = { etiket, sheet: ws.name, addr: cell.address };
          if (TANINAN_ETIKETLER.has(etiket) || BIRIMLI_ETIKETLER.has(etiket)) bulunan.push(kayit);
          else taninmayan.push(kayit);
        }
      });
    });
  }
  return { bulunan, taninmayan };
}

// ────────────────────────────────────────────────────────────────────
// ORNEK / YERLESIK FORMAT (T8): sade KAPAK + ICMAL, yer tutuculu.
// Ayni uretici hem "Ornek Format Indir" hem format-yoksa geri dusus.
// ────────────────────────────────────────────────────────────────────
export function buildSampleFormat(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();

  // ── KAPAK ──
  const kapak = wb.addWorksheet('KAPAK');
  kapak.getColumn(1).width = 4;
  kapak.getColumn(2).width = 22;
  kapak.getColumn(3).width = 46;
  kapak.mergeCells('B3:C4');
  const baslik = kapak.getCell('B3');
  baslik.value = 'FİYAT TEKLİFİ';
  baslik.font = { size: 26, bold: true };
  baslik.alignment = { horizontal: 'center', vertical: 'middle' };
  const satirlar: Array<[string, string]> = [
    ['Teklif No', '{{TEKLIF_NO}}'],
    ['Revizyon', '{{REV}}'],
    ['Tarih', '{{TARIH}}'],
    ['Müşteri', '{{MUSTERI}}'],
    ['Proje', '{{PROJE}}'],
    ['Hazırlayan', '{{HAZIRLAYAN}}'],
    ['Geçerlilik', '{{GECERLILIK}}'],
  ];
  let r = 7;
  for (const [ad, tag] of satirlar) {
    const a = kapak.getCell(r, 2);
    const b = kapak.getCell(r, 3);
    a.value = ad;
    a.font = { bold: true };
    a.border = { bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } } };
    b.value = tag;
    b.border = { bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } } };
    r++;
  }

  // ── İCMAL ──
  const icmal = wb.addWorksheet('İCMAL');
  icmal.getColumn(1).width = 4;
  icmal.getColumn(2).width = 40;
  icmal.getColumn(3).width = 18;
  icmal.getColumn(4).width = 18;
  icmal.getColumn(5).width = 18;
  const hdr = ['', 'Bölüm', 'Malzeme', 'İşçilik', 'Toplam'];
  const hrow = icmal.getRow(2);
  hdr.forEach((h, i) => {
    if (!h) return;
    const c = hrow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    c.alignment = { horizontal: i === 1 ? 'left' : 'right' };
  });
  // ICMAL_SATIRLARI sablon satiri — sistem her sekme icin bu satirin
  // bicimini kopyalayarak satir ekler (T5)
  const tpl = icmal.getRow(3);
  tpl.getCell(2).value = '{{ICMAL_SATIRLARI}}';
  for (let c = 2; c <= 5; c++) {
    tpl.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    if (c >= 3) {
      tpl.getCell(c).numFmt = '#,##0.00';
      tpl.getCell(c).alignment = { horizontal: 'right' };
    }
  }
  const tr2 = toplamBlokuYaz(icmal, 5);
  kurNotuYaz(icmal, tr2 + 1);

  sablonBaskisi(kapak);
  sablonBaskisi(icmal);
  return wb;
}

/**
 * Yerlesik sablon sayfalarinin baskisi (06.10, P3): A4 dikey, genislige 1
 * sayfa, yukseklik serbest — fiyatli ciktinin kurali (Tarif §6, `baskiAyarla`).
 * Olculdu (COM PageSetup.Pages): ayarsiz İCMAL Letter %100'de 2 sayfaya
 * bolunuyordu (sutunlar 4+40+18+18+18 karakter — "Toplam" ikinci sayfada).
 * Baski alani YAZILMAZ: İCMAL satirlari bolum sayisiyla buyur, Excel'in
 * varsayilani kullanilan alani basar. Musteri formatinin ayarina dokunulmaz.
 */
function sablonBaskisi(ws: ExcelJS.Worksheet): void {
  ws.pageSetup = {
    ...ws.pageSetup,
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
}

const TOPLAM_SATIRLARI: Array<[string, (typeof TOPLAM_ETIKETLERI)[number]]> = [
  ['Malzeme Toplamı', 'MALZEME_TOPLAMI'],
  ['İşçilik Toplamı', 'ISCILIK_TOPLAMI'],
  ['KDV (%20)', 'KDV'],
  ['GENEL TOPLAM', 'GENEL_TOPLAM'],
];

/** İCMAL toplam blogu: dort satir (B etiket, E yer tutucu). `pb` verilirse
 *  etiket birim simgesi, yer tutucu birim eki alir. Blogun ALTINDAKI satiri doner. */
function toplamBlokuYaz(icmal: ExcelJS.Worksheet, ilk: number, pb?: ParaBirimi): number {
  let r = ilk;
  for (const [ad, etiket] of TOPLAM_SATIRLARI) {
    const a = icmal.getCell(r, 2);
    const b = icmal.getCell(r, 5);
    a.value = pb ? `${ad} ${SEMBOL[pb]}` : ad;
    a.font = { bold: etiket === 'GENEL_TOPLAM' };
    b.value = `{{${pb ? birimliEtiket(etiket, pb) : etiket}}}`;
    b.numFmt = '#,##0.00';
    b.alignment = { horizontal: 'right' };
    b.font = { bold: etiket === 'GENEL_TOPLAM' };
    if (etiket === 'GENEL_TOPLAM') {
      a.border = { top: { style: 'medium' } };
      b.border = { top: { style: 'medium' } };
    }
    r++;
  }
  return r;
}

function kurNotuYaz(icmal: ExcelJS.Worksheet, r: number): void {
  icmal.getCell(r, 2).value = '{{KUR_NOTU}}';
  icmal.getCell(r, 2).font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };
}

/**
 * KARISIK teklif + YERLESIK format (İCMAL, 05.10 — Emre'nin onerilen onayi):
 * toplam blogu birim BASINA yazilir (₺, $, € sirasi; her biri dort satir, bir
 * bos satirla ayrilir), yer tutucular birim ekli. `buildSampleFormat`in tek
 * birimli blogunun ve kur notunun YERINE yazar — yalniz bizim duzenimiz oldugu
 * icin. Musteri formatina UYGULANMAZ: orada satir eklenmez, eksiz etiket karma
 * metin alir (`format-karisik.ts`).
 */
export function yerlesikToplamlariBirimle(wb: ExcelJS.Workbook, birimler: readonly ParaBirimi[]): void {
  const yer = scanWorkbook(wb).bulunan.find((b) => b.etiket === 'MALZEME_TOPLAMI');
  if (!yer) return;
  const icmal = wb.getWorksheet(yer.sheet)!;
  const ilk = (icmal.getCell(yer.addr) as any).row as number;
  // Eski blok: dort toplam satiri + bos satir + kur notu (yalniz B ve E yazilmisti)
  for (let r = ilk; r <= ilk + TOPLAM_SATIRLARI.length + 1; r++) {
    for (const c of [2, 5]) {
      icmal.getCell(r, c).value = null;
      icmal.getCell(r, c).style = {};
    }
  }
  let r = ilk;
  (birimler.length ? birimler : (['TRY'] as ParaBirimi[])).forEach((pb, i) => {
    r = toplamBlokuYaz(icmal, r + (i ? 1 : 0), pb);
  });
  kurNotuYaz(icmal, r + 1);
}

// ────────────────────────────────────────────────────────────────────
// ExcelJS sayfa → ExcelGrid SheetData (FE onizleme icin)
// ────────────────────────────────────────────────────────────────────
export interface GridSheet {
  name: string;
  columnDefs: Array<{ field: string; headerName: string; width: number; editable: boolean }>;
  rowData: Array<Record<string, any>>;
  columnRoles: Record<string, never>;
  headerEndRow: 0;
  /** "B3:C4" merge listesi — FE ileride kullanabilir (v1 gorsel yaklasik) */
  merges: string[];
  /** Sayfadaki gorsel sayisi — onizlemede "resimler ciktida korunur" notu
   *  (canli bulgu 20.07: kullanicinin kapagi tamamen logo/gorsel; hucre
   *  onizlemesi bos gorunuyordu). */
  resimSayisi: number;
}

export const KOLON_HARF = (n: number): string => {
  // 1 → A, 27 → AA
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

// ────────────────────────────────────────────────────────────────────
// DOLDURMA (T4/T5/T12) — yalniz TARANAN yer tutucu hucreleri yazilir;
// yer tutucusuz hucreye ASLA dokunulmaz (T3 altin kurali burada yapisal:
// islenen adres listesi scan'den gelir, baska adres yazilamaz).
// ────────────────────────────────────────────────────────────────────

/** Bir sekmenin (liste sayfasinin) icmal ozeti. *Formul: cikti workbook'una
 *  yazilacak CANLI SUM ifadesi (orn "SUM('S1'!G3:G210)"); null = formul
 *  kurulamiyor → duz deger yazilir. Degerler ekrandaki guncel toplamlar. */
export interface SekmeOzet {
  name: string;
  matFormul: string | null;
  labFormul: string | null;
  matDeger: number;
  labDeger: number;
  /** KARISIK kip (İCMAL, 05.10): sayfanin birim basina parcalari (₺, $, €
   *  sirasi) — İCMAL sayfa × birim satiri yazar. Tek birimli teklifte YOK. */
  birimler?: SekmeBirimi[];
}

/** Sayfanin bir birimlik İCMAL parcasi: liste sayfasinin J/K birim sutunlarina
 *  SUMIF formulleri + degerler (cevrim yok). */
export interface SekmeBirimi {
  pb: ParaBirimi;
  matFormul: string | null;
  labFormul: string | null;
  matDeger: number;
  labDeger: number;
}

export interface FillContext {
  teklifNo: string;
  rev: number; // 1 → "Rev.01"
  tarih: string; // "20.07.2026"
  musteri?: string | null;
  proje?: string | null;
  hazirlayan?: string | null;
  gecerlilik?: string | null;
  sekmeler: SekmeOzet[];
  kurNotu: string;
  /** KDV orani (0.20). {{KDV}} = (malzeme+iscilik)×oran; {{GENEL_TOPLAM}}
   *  formatta KDV etiketi VARSA KDV dahil, yoksa malzeme+iscilik. */
  kdvOran: number;
  /** Tek birimli teklifin birimi (goruntuleme birimi): birim ekli etiketlerden
   *  tum toplami alacak olan. Verilmezse TRY. Karisik kipte kullanilmaz. */
  paraBirimi?: ParaBirimi;
}

const trSayi = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Excel formul metni siniri 8192 karakter; ASAN formul iceren dosyayi Excel
 *  HIC ACMAZ (13.09 gercek Excel'de olculdu: "Workbooks.Open ozelligi
 *  alinamiyor"). Payli sinirin ustundeki formul yazilmaz, deger yazilir. */
export const EXCEL_FORMUL_AZAMI = 8000;

/** Sekme toplam formul parcalarini birlestir; herhangi biri null ise
 *  formul kurulamaz (null) — duz deger kullanilir. */
function toplamFormul(sekmeler: SekmeOzet[], alan: 'matFormul' | 'labFormul'): string | null {
  if (sekmeler.length === 0) return null;
  const parcalar = sekmeler.map((s) => s[alan]);
  if (parcalar.some((p) => !p)) return null;
  return parcalar.join('+');
}

export const sinirda = (f: string | null, etiket: string): string | null => {
  if (f && f.length > EXCEL_FORMUL_AZAMI) {
    console.warn(`[Export] ⚠ ${etiket} formulu ${f.length} karakter — Excel siniri asiliyor, DEGER yazilacak`);
    return null;
  }
  return f;
};

/**
 * Format workbook'undaki yer tutuculari ctx ile doldurur — TEK BIRIMLI teklif
 * (karisik teklif: `format-karisik.ts` `karisikDoldur`, ayni iki adim).
 * SIRA ONEMLI: once ICMAL_SATIRLARI (satir ekleme adresleri kaydirir,
 * `icmalSatirlariniYaz`), sonra YENIDEN taranarak kalan etiketler doldurulur
 * (`etiketleriYaz` — tam hucre / metin ici kurallari orada).
 */
export function fillPlaceholders(wb: ExcelJS.Workbook, ctx: FillContext): YerTutucu[] {
  // Doldurulan hucrelerin SON (kaymis) adresleri — FE bu haritayla otomatik
  // alanlari isaretler; kullanici birini duzenlerse "manuel" rozeti (T14).
  const dolan: YerTutucu[] = [];
  // ── 1. ICMAL_SATIRLARI ──────────────────────────────────────────
  // Yazilan ICMAL bolum hucrelerinin bolgesi — toplamlar bunlari toplar (adim 2)
  const icmalBolge = icmalSatirlariniYaz(wb, ctx.sekmeler.map((s) => ({
    ad: s.name, mat: { formul: s.matFormul, deger: s.matDeger }, lab: { formul: s.labFormul, deger: s.labDeger },
  })), dolan);

  // ── 2. Kalan etiketler (adresler artik guncel) ──────────────────
  const tarama = scanWorkbook(wb);
  const matToplamDeger = ctx.sekmeler.reduce((a, s) => a + s.matDeger, 0);
  const labToplamDeger = ctx.sekmeler.reduce((a, s) => a + s.labDeger, 0);
  // TOPLAMLAR ICMAL BOLUM HUCRELERINI TOPLAR (13.09): eskiden her toplam
  // butun sayfa SUM'larini ART ARDA ekliyordu; ara toplam satirli gercek
  // tekliflerde (FIRMA-C, Bursa) KDV/GENEL TOPLAM formulu 10.215+ karaktere
  // cikip Excel'in 8192 sinirini asti ve dosya ACILMADI. Bolum hucrelerini
  // toplamak kisa, sayfa sayisindan bagimsiz ve musterinin gordugu ICMAL
  // satirlariyla yapisal olarak ayni rakam. ICMAL_SATIRLARI etiketi olmayan
  // formatta eski birlestirme kalir (sinir asilirsa deger yazilir).
  const bolgeTopla = (col: number) => (icmalBolge
    ? `SUM('${icmalBolge.sheet.replace(/'/g, "''")}'!${KOLON_HARF(col)}${icmalBolge.ilk}:${KOLON_HARF(col)}${icmalBolge.son})`
    : null);
  const matF = sinirda(icmalBolge ? bolgeTopla(icmalBolge.matCol) : toplamFormul(ctx.sekmeler, 'matFormul'), 'MALZEME_TOPLAMI');
  const labF = sinirda(icmalBolge ? bolgeTopla(icmalBolge.labCol) : toplamFormul(ctx.sekmeler, 'labFormul'), 'ISCILIK_TOPLAMI');
  const kdvVar = kdvVarMi(tarama.bulunan);
  const araFormul = sinirda(matF && labF ? `${matF}+${labF}` : null, 'ARA_TOPLAM');
  const araDeger = matToplamDeger + labToplamDeger;
  const kdvDeger = araDeger * ctx.kdvOran;

  const sayisal: Record<string, ParaDolgusu> = {
    MALZEME_TOPLAMI: { formula: matF, deger: matToplamDeger },
    ISCILIK_TOPLAMI: { formula: labF, deger: labToplamDeger },
    KDV: { formula: araFormul ? `(${araFormul})*${ctx.kdvOran}` : null, deger: kdvDeger },
    GENEL_TOPLAM: kdvVar
      ? { formula: araFormul ? `(${araFormul})*${1 + ctx.kdvOran}` : null, deger: araDeger + kdvDeger }
      : { formula: araFormul, deger: araDeger },
  };
  // Birim ekli etiketler (05.10): tek birimli teklifte teklifin birimi tum
  // toplami alir, diger birimler 0 — teklifte o birimde tutar YOKTUR.
  const tekBirim = ctx.paraBirimi ?? 'TRY';
  for (const e of TOPLAM_ETIKETLERI) {
    for (const pb of BIRIM_SIRASI) {
      sayisal[birimliEtiket(e, pb)] = pb === tekBirim ? { ...(sayisal[e] as SayiDolgusu), pb } : { formula: null, deger: 0, pb };
    }
  }

  etiketleriYaz(wb, tarama.bulunan, sabitDegerler(ctx), sayisal, dolan);
  return dolan;
}

/** İCMAL'e yazilacak bir bolum satiri. */
export interface IcmalSatiri {
  ad: string;
  mat: { formul: string | null; deger: number };
  lab: { formul: string | null; deger: number };
  /** Karisik kip: satirin birimi (hucre bicimi ve birim basina toplam). */
  pb?: ParaBirimi;
}
export interface IcmalBolgesi { sheet: string; ilk: number; son: number; matCol: number; labCol: number }

/**
 * Adim 1 — ICMAL_SATIRLARI: sablon satiri satir sayisi kadar cogaltilir, her
 * satira bolum adi + malzeme + iscilik + toplam yazilir. Konvansiyon: etiket
 * hucresinin kolonu = bolum adi; +1 malzeme, +2 iscilik, +3 toplam. Etiket ya
 * da satir yoksa null (toplamlar sayfa formullerini birlestirir).
 */
export function icmalSatirlariniYaz(wb: ExcelJS.Workbook, satirlar: readonly IcmalSatiri[], dolan: YerTutucu[]): IcmalBolgesi | null {
  const icmalYeri = scanWorkbook(wb).bulunan.find((b) => b.etiket === 'ICMAL_SATIRLARI');
  if (!icmalYeri) return null;
  const ws = wb.getWorksheet(icmalYeri.sheet)!;
  const tplCell = ws.getCell(icmalYeri.addr);
  const tplRow = (tplCell as any).row as number; // 1-based satir no
  const baseCol = (tplCell as any).col as number;
  const n = satirlar.length;
  if (n === 0) {
    tplCell.value = '';
    return null;
  }
  // Sablon satiri N-1 kez cogalt (stil kopyalanir — T5 "bicim formatin
  // satirindan"); eklenenler sablonun ALTINA girer. ExcelJS alttaki hucreleri
  // kaydirir ama formul BASVURULARINI guncellemez — musterinin kendi formulleri
  // (ARA TOPLAM/KDV, KAPAK'tan basvuru) yanlis hucreye bakiyordu (06.10, olculdu):
  // `satirEkle` Excel'in ekleme/kopyalama kuralini uygular (satir-ekleme.ts).
  if (n > 1) satirEkle(wb, ws, tplRow, n - 1);
  for (let i = 0; i < n; i++) {
    const s = satirlar[i];
    const r = tplRow + i;
    const adC = ws.getCell(r, baseCol);
    const matC = ws.getCell(r, baseCol + 1);
    const labC = ws.getCell(r, baseCol + 2);
    const topC = ws.getCell(r, baseCol + 3);
    adC.value = s.ad;
    matC.value = s.mat.formul ? ({ formula: s.mat.formul, result: s.mat.deger } as any) : s.mat.deger;
    labC.value = s.lab.formul ? ({ formula: s.lab.formul, result: s.lab.deger } as any) : s.lab.deger;
    topC.value = {
      formula: `${KOLON_HARF(baseCol + 1)}${r}+${KOLON_HARF(baseCol + 2)}${r}`,
      result: s.mat.deger + s.lab.deger,
    } as any;
    for (const c of [adC, matC, labC, topC]) {
      dolan.push({ etiket: 'ICMAL_SATIRLARI', sheet: ws.name, addr: c.address, ...(s.pb ? { pb: s.pb } : {}) });
    }
  }
  return { sheet: ws.name, ilk: tplRow, son: tplRow + n - 1, matCol: baseCol + 1, labCol: baseCol + 2 };
}

/** Bir para etiketinin dolgusu: sayi/formul (tam hucre) ya da metin icinde
 *  bicimli rakam; `karma` = birden cok birimde tutar, METIN (karisik kip). */
export type SayiDolgusu = { formula: string | null; deger: number; pb?: ParaBirimi };
export type ParaDolgusu = SayiDolgusu | { karma: string };

/** {{GENEL_TOPLAM}} KDV dahil mi: formatta (birim ekli ya da eksiz) KDV etiketi varsa. */
export const kdvVarMi = (bulunan: readonly YerTutucu[]): boolean =>
  bulunan.some((b) => b.etiket === 'KDV' || b.etiket.startsWith('KDV_'));

export function sabitDegerler(ctx: FillContext): Record<string, string> {
  return {
    TEKLIF_NO: ctx.teklifNo,
    REV: `Rev.${String(ctx.rev).padStart(2, '0')}`,
    TARIH: ctx.tarih,
    MUSTERI: ctx.musteri ?? '',
    PROJE: ctx.proje ?? '',
    HAZIRLAYAN: ctx.hazirlayan ?? '',
    GECERLILIK: ctx.gecerlilik ?? '',
    KUR_NOTU: ctx.kurNotu,
  };
}

/**
 * Adim 2 — taranan etiketleri yazar (ICMAL_SATIRLARI haric; adim 1'de islendi).
 *  - Hucre YALNIZ etiketten ibaretse tip korunur (sayi/formul yazilabilir).
 *  - Etiket metnin ICINDEYSE string replace: tek birimli rakam tr-TR bicimli,
 *    birimli rakam simgesiyle ("$1.234,00").
 *  - Karma (karisik kip, birden cok birim): tam hucrede de METIN.
 */
export function etiketleriYaz(
  wb: ExcelJS.Workbook, bulunan: readonly YerTutucu[], sabitler: Record<string, string>,
  sayisal: Record<string, ParaDolgusu>, dolan: YerTutucu[],
): void {
  for (const b of bulunan) {
    if (b.etiket === 'ICMAL_SATIRLARI') continue; // adim 1'de islendi
    const ws = wb.getWorksheet(b.sheet)!;
    const cell = ws.getCell(b.addr);
    const metin = hucreMetni(cell);
    const tamHucre = metin.trim().replace(/\s+/g, '') === `{{${b.etiket}}}`
      || new RegExp(`^\\{\\{\\s*${b.etiket}\\s*\\}\\}$`).test(metin.trim());
    const etiketRe = new RegExp(`\\{\\{\\s*${b.etiket}\\s*\\}\\}`, 'g');

    if (b.etiket in sayisal) {
      const p = sayisal[b.etiket];
      // Yerine konan metin FONKSIYONLA verilir: "$2.924,25" / "$&" gibi dizeler
      // `replace`in ozel kaliplari olarak yorumlanmaz (inceleme L5).
      if ('karma' in p) {
        cell.value = tamHucre ? p.karma : metin.replace(etiketRe, () => p.karma);
        dolan.push(b);
        continue;
      }
      if (tamHucre) {
        cell.value = p.formula ? ({ formula: p.formula, result: p.deger } as any) : p.deger;
      } else {
        const rakam = p.pb ? paraMetni(p.deger, p.pb) : trSayi(p.deger);
        cell.value = metin.replace(etiketRe, () => rakam);
      }
      dolan.push(p.pb ? { ...b, pb: p.pb } : b);
    } else if (b.etiket in sabitler) {
      const deger = sabitler[b.etiket];
      cell.value = tamHucre ? deger : metin.replace(etiketRe, () => deger);
      dolan.push(b);
    }
  }
}

/**
 * T13/T14: teklif-bazli onizleme duzenlemeleri — doldurma SONRASI uygulanir.
 * Boylece otomatik alanlar guncel degerle tazelenir, manuel hucreler
 * override ile korunur. Ana format dosyasina ASLA yazilmaz (cagiran kopya
 * uzerinde calisir).  overrides: {sheetName: {addr: {value}}}
 */
export type ExportOverrides = Record<string, Record<string, { value: string | number; manual?: boolean }>>;

export function applyOverrides(wb: ExcelJS.Workbook, overrides: ExportOverrides | null | undefined): void {
  if (!overrides) return;
  for (const [sheetName, cells] of Object.entries(overrides)) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;
    for (const [addr, o] of Object.entries(cells ?? {})) {
      if (o === null || o === undefined) continue;
      const v = o.value;
      // Sayiya benziyorsa sayi, degilse metin — formul yazilmaz (guvenlik).
      // A2 (tur 3, olculdu): eski hali TUM noktalari binlik sayiyordu — "12.5"
      // ve "1.25" 125 yaziliyordu. Insan kurali: tek anlamli sayi → sayi;
      // BELIRSIZ ("1.250") ve olcu metni kullanicinin yazdigi METIN olarak kalir
      // (sessiz 1250 varsayimi yok). Onizleme ucu silindi — yalniz eski kayitlar.
      const g = typeof v === 'number' ? null : insanSayiOku(String(v).trim(), 'fiyat');
      ws.getCell(addr).value =
        typeof v === 'number' ? v
        : g?.tur === 'sayi' && /^[\d.,\s+-]+$/.test(String(v).trim()) ? g.deger
        : String(v);
    }
  }
}

/** PARA tasiyan yer tutucular — sayi/formul yazilir, para bicimi alir. */
export const SAYISAL_ETIKETLER: ReadonlySet<string> = new Set([
  'ICMAL_SATIRLARI', 'MALZEME_TOPLAMI', 'ISCILIK_TOPLAMI', 'KDV', 'GENEL_TOPLAM', ...BIRIMLI_ETIKETLER,
]);

/**
 * Doldurulan PARA formullerinin onbellek (`result`) degerini, hucrelerin SON
 * degerlerinden yeniden hesaplar. `applyOverrides`tan SONRA cagrilir.
 *
 * ⚠ NEDEN (13.09 incelemesi): toplamlar ICMAL bolum hucrelerini topluyor
 * (`SUM('İCMAL'!C3:C5)`). Kayitli eski bir override bolum hucresine yeni bir
 * rakam yazarsa Excel yeniden hesaplayinca override'i katar, onbellek ise
 * `sekmeler` toplamindan kalir: Korumali Gorunum bir rakam, duzenleme modu
 * baska rakam gosterir — bu turun kapattigi kusurun ta kendisi.
 *
 * Yalniz bu motorun URETTIGI dilbilgisi degerlendirilir: sayi, `+`, `*`,
 * parantez, `SUM(aralik, ...)`, hucre/aralik (sayfa adi tirnakli ya da
 * yalin). SUM metin/bos hucreyi yok sayar (Excel gibi). Cozulemeyen formulun
 * onbellegine DOKUNULMAZ.
 */
export function paraOnbellekleriniTazele(wb: ExcelJS.Workbook, dolan: YerTutucu[]): number {
  let tazelenen = 0;
  for (const d of dolan) {
    if (!SAYISAL_ETIKETLER.has(d.etiket)) continue;
    const ws = wb.getWorksheet(d.sheet);
    const hucre = ws?.getCell(d.addr);
    const v: any = hucre?.value;
    if (!ws || !hucre || !v || typeof v !== 'object' || typeof v.formula !== 'string') continue;
    const sonuc = formulHesapla(wb, ws, v.formula);
    if (sonuc === null) continue;
    // KURUS duzeyinde karsilastir: yeniden toplamanin float gurultusu
    // (0,1+0,2) kurus-tam onbellegi bozmasin; yalniz GERCEK fark yazilir.
    // `result` yoksa 0 sayilir: ExcelJS SIFIR sonucu JS degerinden dusurur ama
    // dosyaya `<v>0</v>` yazar (13.09 olculdu) — "degisti" sayilmamali.
    const eski = typeof v.result === 'number' ? v.result : 0;
    if (kurusTamsayi(eski) !== kurusTamsayi(sonuc)) {
      hucre.value = { formula: v.formula, result: sonuc } as any;
      tazelenen++;
    }
  }
  return tazelenen;
}

/** `paraOnbellekleriniTazele`in dar degerlendiricisi; cozulemezse null. */
function formulHesapla(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, formul: string): number | null {
  const REF = /^(?:'((?:[^']|'')+)'!|([A-Za-z0-9_.]+)!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/;
  const kolonNo = (h: string) => [...h].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const sayisi = (s: ExcelJS.Worksheet, r: number, c: number): number | null => {
    const x: any = s.getCell(r, c).value;
    if (typeof x === 'number') return x;
    if (x && typeof x === 'object' && typeof x.result === 'number') return x.result;
    return null; // bos/metin/hata
  };
  let i = 0;
  const bosluk = () => { while (formul[i] === ' ') i++; };
  // aralik referansi → hucre degerleri (SUM icin) ya da tek deger
  const referans = (): { degerler: Array<number | null> } | null => {
    const m = REF.exec(formul.slice(i));
    if (!m) return null;
    i += m[0].length;
    const adi = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2];
    const s = adi !== undefined ? wb.getWorksheet(adi) : ws;
    if (!s) return null;
    const c1 = kolonNo(m[3]); const r1 = Number(m[4]);
    const c2 = m[5] ? kolonNo(m[5]) : c1; const r2 = m[6] ? Number(m[6]) : r1;
    if ((r2 - r1 + 1) * (c2 - c1 + 1) > 1_000_000) return null;
    const degerler: Array<number | null> = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) degerler.push(sayisi(s, r, c));
    }
    return { degerler };
  };
  const ifade = (): number | null => {
    let a = terim();
    bosluk();
    while (a !== null && formul[i] === '+') { i++; const b = terim(); a = b === null ? null : a + b; bosluk(); }
    return a;
  };
  const terim = (): number | null => {
    let a = carpan();
    bosluk();
    while (a !== null && formul[i] === '*') { i++; const b = carpan(); a = b === null ? null : a * b; bosluk(); }
    return a;
  };
  const carpan = (): number | null => {
    bosluk();
    if (formul[i] === '(') {
      i++; const a = ifade(); bosluk();
      if (formul[i] !== ')') return null;
      i++; return a;
    }
    if (formul.startsWith('SUM(', i)) {
      i += 4; let top = 0;
      for (;;) {
        bosluk();
        const ref = REF.test(formul.slice(i)) ? referans() : null;
        if (ref) { for (const x of ref.degerler) top += x ?? 0; } else {
          const a = ifade(); if (a === null) return null; top += a;
        }
        bosluk();
        if (formul[i] === ',') { i++; continue; }
        if (formul[i] === ')') { i++; return top; }
        return null;
      }
    }
    const sayiEslesme = /^\d+(?:\.\d+)?/.exec(formul.slice(i));
    if (sayiEslesme && !REF.test(formul.slice(i))) { i += sayiEslesme[0].length; return Number(sayiEslesme[0]); }
    const ref = referans();
    if (!ref || ref.degerler.length !== 1) return null;
    return ref.degerler[0] ?? 0;
  };
  const sonuc = ifade();
  bosluk();
  return i === formul.length && sonuc !== null && Number.isFinite(sonuc) ? sonuc : null;
}

export function sheetToGrid(ws: ExcelJS.Worksheet, editable: boolean): GridSheet {
  const colCount = Math.max(1, Math.min(ws.columnCount || 1, 30));
  const rowCount = Math.max(1, Math.min(ws.rowCount || 1, 200));
  const columnDefs = [] as GridSheet['columnDefs'];
  for (let c = 1; c <= colCount; c++) {
    const w = ws.getColumn(c).width;
    columnDefs.push({
      field: `col${c - 1}`,
      headerName: KOLON_HARF(c),
      width: Math.round((w ?? 12) * 7.5), // Excel genislik → px yaklasik
      editable,
    });
  }
  const rowData: GridSheet['rowData'] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row: Record<string, any> = { _rowIdx: r - 1, _isDataRow: true, _isHeaderRow: false };
    const wsRow = ws.getRow(r);
    for (let c = 1; c <= colCount; c++) {
      const cell = wsRow.getCell(c);
      // BIRLESIK HUCRE (canli bulgu 20.07): ExcelJS slave hucreler master'in
      // degerini dondurur → "TEKLİF ESASLARI" 4 kolonda tekrarlaniyordu.
      // Yalniz MASTER hucre deger tasir, slave'ler bos gosterilir.
      if ((cell as any).isMerged && (cell as any).master && (cell as any).master.address !== cell.address) {
        row[`col${c - 1}`] = '';
        continue;
      }
      const v: any = cell.value;
      row[`col${c - 1}`] =
        v === null || v === undefined ? ''
        : typeof v === 'number' ? v
        : hucreMetni(cell);
    }
    rowData.push(row);
  }
  const merges: string[] = Object.keys((ws as any)._merges ?? {});
  let resimSayisi = 0;
  try { resimSayisi = (ws.getImages?.() ?? []).length; } catch { resimSayisi = 0; }
  return { name: ws.name, columnDefs, rowData, columnRoles: {} as Record<string, never>, headerEndRow: 0, merges, resimSayisi };
}

// ────────────────────────────────────────────────────────────────────
// SAYFA ROLLERI (kullanici karari 20.07): format dosyasi KOMPLE bir teklif
// sablonudur — kapak/sartlar/icmal SABIT kalir, eski is sayfalari "LISTE
// YUVASI"dir: ciktida teklifin liste sayfalariyla TEK TUSLA yer degistirir.
// Yukleme aninda sezgisel atanir; kullanici onizlemede degistirebilir
// (mapping.sheetRoles'a yazilir).
// ────────────────────────────────────────────────────────────────────
export type SayfaRol = 'sabit' | 'liste';
export type SheetRoles = Record<string, SayfaRol>;

const SABIT_AD_DESENI = /kapak|icmal|İcmal|özet|ozet|esas|şart|sart|not|kur|exchange|cover|summary|terms/i;

/** VERI TABLOSU tespiti (GENELLIK bulgusu G1, 21.07): en az `esik` satirda
 *  ≥2 SAYISAL hucre varsa sayfa eski-is/fiyat tablosu gibidir. */
function veriTablosuGibi(ws: ExcelJS.Worksheet, esik = 5): boolean {
  let sayisalSatir = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    let sayisal = 0;
    row.eachCell({ includeEmpty: false }, (c) => {
      if (typeof c.value === 'number') sayisal++;
    });
    if (sayisal >= 2) sayisalSatir++;
  });
  return sayisalSatir >= esik;
}

/** Sezgisel rol atamasi — MUHAFAZAKAR (genellik bulgusu G1: rastgele adli
 *  statik sayfa 'liste' sayilip SESSIZCE siliniyordu; herkesin formati
 *  baskadir). Kural: 'liste' YALNIZ guclu kanitla (veri-tablosu gorunumu)
 *  onerilir; suphede SABIT — icerik silmek, eski is sayfasi birakmaktan
 *  cok daha kotu. Kullanici onizlemede ⇄ ile degistirir (mapping.sheetRoles). */
export function sayfaRolleriTahminEt(wb: ExcelJS.Workbook): SheetRoles {
  const mapping = scanWorkbook(wb);
  const yerTutuculu = new Set(mapping.bulunan.concat(mapping.taninmayan).map((y) => y.sheet));
  const roller: SheetRoles = {};
  for (const ws of wb.worksheets) {
    let resim = 0;
    try { resim = (ws.getImages?.() ?? []).length; } catch { resim = 0; }
    const kesinSabit = yerTutuculu.has(ws.name) || SABIT_AD_DESENI.test(ws.name) || resim > 0;
    roller[ws.name] = !kesinSabit && veriTablosuGibi(ws) ? 'liste' : 'sabit';
  }
  return roller;
}
