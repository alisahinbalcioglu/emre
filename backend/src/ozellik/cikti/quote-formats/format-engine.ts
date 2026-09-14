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

/** PRD §2 tablosu — bilinen yer tutucular. Disindaki her {{ETIKET}} T3
 *  geregi "taninmayan" olarak uyarilir (ama hucreye DOKUNULMAZ). */
export const TANINAN_ETIKETLER: ReadonlySet<string> = new Set([
  'TEKLIF_NO', 'REV', 'TARIH',
  'MUSTERI', 'PROJE', 'HAZIRLAYAN', 'GECERLILIK',
  'MALZEME_TOPLAMI', 'ISCILIK_TOPLAMI', 'KDV', 'GENEL_TOPLAM',
  'KUR_NOTU', 'ICMAL_SATIRLARI',
]);

export interface YerTutucu {
  etiket: string; // kanonik (buyuk harf, suslu parantezsiz)
  sheet: string;
  addr: string; // "B4" gibi
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
          if (TANINAN_ETIKETLER.has(etiket)) bulunan.push(kayit);
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
  const toplamlar: Array<[string, string]> = [
    ['Malzeme Toplamı', '{{MALZEME_TOPLAMI}}'],
    ['İşçilik Toplamı', '{{ISCILIK_TOPLAMI}}'],
    ['KDV (%20)', '{{KDV}}'],
    ['GENEL TOPLAM', '{{GENEL_TOPLAM}}'],
  ];
  let tr2 = 5;
  for (const [ad, tag] of toplamlar) {
    const a = icmal.getCell(tr2, 2);
    const b = icmal.getCell(tr2, 5);
    a.value = ad;
    a.font = { bold: tr2 === 8 };
    b.value = tag;
    b.numFmt = '#,##0.00';
    b.alignment = { horizontal: 'right' };
    b.font = { bold: ad === 'GENEL TOPLAM' };
    if (ad === 'GENEL TOPLAM') {
      a.border = { top: { style: 'medium' } };
      b.border = { top: { style: 'medium' } };
    }
    tr2++;
  }
  icmal.getCell(tr2 + 1, 2).value = '{{KUR_NOTU}}';
  icmal.getCell(tr2 + 1, 2).font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };

  return wb;
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

const sinirda = (f: string | null, etiket: string): string | null => {
  if (f && f.length > EXCEL_FORMUL_AZAMI) {
    console.warn(`[Export] ⚠ ${etiket} formulu ${f.length} karakter — Excel siniri asiliyor, DEGER yazilacak`);
    return null;
  }
  return f;
};

/**
 * Format workbook'undaki yer tutuculari ctx ile doldurur.
 * SIRA ONEMLI: once ICMAL_SATIRLARI (satir ekleme adresleri kaydirir),
 * sonra YENIDEN taranarak kalan etiketler doldurulur.
 * Kurallar:
 *  - Hucre YALNIZ etiketten ibaretse tip korunur (sayi/formul yazilabilir).
 *  - Etiket metnin ICINDEYSE ("Müşteri: {{MUSTERI}}") string replace yapilir
 *    (toplamlar tr-TR bicimli metin olur).
 *  - ICMAL_SATIRLARI konvansiyonu: etiket hucresinin kolonu = bolum adi;
 *    +1 malzeme, +2 iscilik, +3 toplam (ornek format bu duzendedir).
 */
export function fillPlaceholders(wb: ExcelJS.Workbook, ctx: FillContext): YerTutucu[] {
  // Doldurulan hucrelerin SON (kaymis) adresleri — FE bu haritayla otomatik
  // alanlari isaretler; kullanici birini duzenlerse "manuel" rozeti (T14).
  const dolan: YerTutucu[] = [];
  // ── 1. ICMAL_SATIRLARI ──────────────────────────────────────────
  const ilkTarama = scanWorkbook(wb);
  const icmalYeri = ilkTarama.bulunan.find((b) => b.etiket === 'ICMAL_SATIRLARI');
  // Yazilan ICMAL bolum hucrelerinin bolgesi — toplamlar bunlari toplar (adim 2)
  let icmalBolge: { sheet: string; ilk: number; son: number; matCol: number; labCol: number } | null = null;
  if (icmalYeri) {
    const ws = wb.getWorksheet(icmalYeri.sheet)!;
    const tplCell = ws.getCell(icmalYeri.addr);
    const tplRow = (tplCell as any).row as number; // 1-based satir no
    const baseCol = (tplCell as any).col as number;
    const n = ctx.sekmeler.length;
    if (n === 0) {
      tplCell.value = '';
    } else {
      // Sablon satiri N-1 kez cogalt (stil kopyalanir — T5 "bicim formatin
      // satirindan"); eklenenler sablonun ALTINA girer.
      if (n > 1) ws.duplicateRow(tplRow, n - 1, true);
      for (let i = 0; i < n; i++) {
        const s = ctx.sekmeler[i];
        const r = tplRow + i;
        const adC = ws.getCell(r, baseCol);
        const matC = ws.getCell(r, baseCol + 1);
        const labC = ws.getCell(r, baseCol + 2);
        const topC = ws.getCell(r, baseCol + 3);
        adC.value = s.name;
        matC.value = s.matFormul ? ({ formula: s.matFormul, result: s.matDeger } as any) : s.matDeger;
        labC.value = s.labFormul ? ({ formula: s.labFormul, result: s.labDeger } as any) : s.labDeger;
        topC.value = {
          formula: `${KOLON_HARF(baseCol + 1)}${r}+${KOLON_HARF(baseCol + 2)}${r}`,
          result: s.matDeger + s.labDeger,
        } as any;
        for (const c of [adC, matC, labC, topC]) {
          dolan.push({ etiket: 'ICMAL_SATIRLARI', sheet: ws.name, addr: c.address });
        }
      }
      icmalBolge = { sheet: ws.name, ilk: tplRow, son: tplRow + n - 1, matCol: baseCol + 1, labCol: baseCol + 2 };
    }
  }

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
  const kdvVar = tarama.bulunan.some((b) => b.etiket === 'KDV');
  const araFormul = sinirda(matF && labF ? `${matF}+${labF}` : null, 'ARA_TOPLAM');
  const araDeger = matToplamDeger + labToplamDeger;
  const kdvDeger = araDeger * ctx.kdvOran;

  // Etiket → {metin} veya {formul, deger} (tam-hucre ise formul yazilir)
  const sabitler: Record<string, string> = {
    TEKLIF_NO: ctx.teklifNo,
    REV: `Rev.${String(ctx.rev).padStart(2, '0')}`,
    TARIH: ctx.tarih,
    MUSTERI: ctx.musteri ?? '',
    PROJE: ctx.proje ?? '',
    HAZIRLAYAN: ctx.hazirlayan ?? '',
    GECERLILIK: ctx.gecerlilik ?? '',
    KUR_NOTU: ctx.kurNotu,
  };
  const sayisal: Record<string, { formula: string | null; deger: number }> = {
    MALZEME_TOPLAMI: { formula: matF, deger: matToplamDeger },
    ISCILIK_TOPLAMI: { formula: labF, deger: labToplamDeger },
    KDV: { formula: araFormul ? `(${araFormul})*${ctx.kdvOran}` : null, deger: kdvDeger },
    GENEL_TOPLAM: kdvVar
      ? { formula: araFormul ? `(${araFormul})*${1 + ctx.kdvOran}` : null, deger: araDeger + kdvDeger }
      : { formula: araFormul, deger: araDeger },
  };

  for (const b of tarama.bulunan) {
    if (b.etiket === 'ICMAL_SATIRLARI') continue; // adim 1'de islendi
    const ws = wb.getWorksheet(b.sheet)!;
    const cell = ws.getCell(b.addr);
    const metin = hucreMetni(cell);
    const tamHucre = metin.trim().replace(/\s+/g, '') === `{{${b.etiket}}}`
      || new RegExp(`^\\{\\{\\s*${b.etiket}\\s*\\}\\}$`).test(metin.trim());

    if (b.etiket in sayisal) {
      const { formula, deger } = sayisal[b.etiket];
      if (tamHucre) {
        cell.value = formula ? ({ formula, result: deger } as any) : deger;
      } else {
        cell.value = metin.replace(new RegExp(`\\{\\{\\s*${b.etiket}\\s*\\}\\}`, 'g'), trSayi(deger));
      }
      dolan.push(b);
    } else if (b.etiket in sabitler) {
      const deger = sabitler[b.etiket];
      cell.value = tamHucre
        ? deger
        : metin.replace(new RegExp(`\\{\\{\\s*${b.etiket}\\s*\\}\\}`, 'g'), deger);
      dolan.push(b);
    }
  }
  return dolan;
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
      const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
      // Sayiya benziyorsa sayi, degilse metin — formul yazilmaz (guvenlik)
      ws.getCell(addr).value =
        typeof v === 'number' ? v
        : String(v).trim() !== '' && !isNaN(num) && /^[\d.,\s-]+$/.test(String(v).trim()) ? num
        : String(v);
    }
  }
}

/** PARA tasiyan yer tutucular — sayi/formul yazilir, para bicimi alir. */
export const SAYISAL_ETIKETLER: ReadonlySet<string> = new Set([
  'ICMAL_SATIRLARI', 'MALZEME_TOPLAMI', 'ISCILIK_TOPLAMI', 'KDV', 'GENEL_TOPLAM',
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
