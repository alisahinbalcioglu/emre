/**
 * STANDART ÇIKTI — EX1-EX8 (PRD_Standart_Grid_Semasi_ve_Aday_Ayirt_Edicilik §C)
 *
 * KULLANICI KARARI (30.07.2026): "fiyatlı çıktı standart 9 kolon olsun,
 * müşterinin şablonuna yazmayı bırak."
 *
 * Bu modül, teklifi MUSTERININ dosyasina yazmak yerine SIFIRDAN 9 kolonluk
 * standart bir workbook uretir:
 *   No · Malzeme Adı · Miktar · Birim · Malz. Birim Fiyat · Malz. Toplam ·
 *   İşç. Birim Fiyat · İşç. Toplam · Genel Toplam
 *
 * NEDEN: kolon-haritalama sinifindaki hatalar (KE1-KE21, KF1-KF7) sablona
 * yazma yuzunden vardi — hangi kolon nereye? Standart ciktida bu soru yok.
 * Kar orani ve marka/firma IC BILGIDIR, musteriye gitmez (EX1/EX2).
 */
import * as ExcelJS from 'exceljs';
import {
  STANDART_KOLONLAR_EN, OZET_KOLONLAR_EN, birimCevir,
} from './cikti-dil';

/** EX1 — degismez 9 kolon, bu sirada. */
export const STANDART_CIKTI_KOLONLARI = [
  'No', 'Malzeme Adı', 'Miktar', 'Birim',
  'Malz. Birim Fiyat', 'Malz. Toplam',
  'İşç. Birim Fiyat', 'İşç. Toplam', 'Genel Toplam',
];

/** Cikti dili basliklari — SIRA ayni, yalniz metin degisir. */
const kolonlar = (dil?: string) => (dil === 'en' ? STANDART_KOLONLAR_EN : STANDART_CIKTI_KOLONLARI);

export interface CiktiBirim {
  kod: 'TRY' | 'USD' | 'EUR';
  katsayi: number;
  not: string;
}

export interface StandartCiktiGirdi {
  sheetsArr: any[];
  birim?: CiktiBirim | null;
  /** Kapak/bilgi satiri (opsiyonel) — musteri/proje adi */
  baslik?: string;
  /** 'en' → basliklar + birimler Ingilizce (sabit sozluk, AI yok). */
  dil?: string;
}

export interface StandartCiktiSonuc {
  buffer: Buffer;
  /** EX7: gorunur self-check ozeti */
  ozet: string;
  /** Ozet sayfalar HARIC teklif geneli toplam */
  genelToplam: number;
  /** Dosyaya yazilan fiyat/tutar hucresi sayisi */
  yazilan: number;
}

/** TR-bilinçli sayi parse (Bulgu B7/B8 siniri): "1.234,56" → 1234.56,
 *  "87,5" → 87.5, "313" → 313.
 *  ⚠ ILK SURUM HATALIYDI: duz `.replace(',', '.')` "1.234,56"yi "1.234.56"
 *  yapip parseFloat ile **1.234**'e dusuruyordu (386.417,28 → 386.417).
 *  Eski format testleri bunu yakaladi; export-engine'deki dogru mantik
 *  buraya alindi. */
const sayi = (v: unknown): number => {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).replace(/[₺$€\s]/g, '').trim();
  if (s === '') return 0;
  const virgul = s.includes(',');
  const nokta = s.includes('.');
  if (virgul && nokta) s = s.replace(/\./g, '').replace(',', '.'); // TR: nokta binlik
  else if (virgul) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const simge = (kod?: string) => (kod === 'USD' ? '$' : kod === 'EUR' ? '€' : '₺');
const paraBicimi = (kod?: string) =>
  kod === 'USD' ? '"$"#,##0.00' : kod === 'EUR' ? '"€"#,##0.00' : '#,##0.00 "₺"';

/**
 * EX1-EX7: teklifi 9 kolonluk standart workbook olarak uretir.
 * Ozet sayfalarin satirlari GORUNUR ama teklif geneli toplamina GIRMEZ
 * (kullanici karari — aksi halde İcmal detaylari ikinci kez sayardi).
 */
/** Bir teklif sayfasinin standart tabloya yazilmasindan donen bilgi —
 *  format yolunda ICMAL SUM formullerini kurmak icin gerekir (EX8/KF7). */
export interface StandartSayfaBilgi {
  wsName: string;
  /** Malz. Toplam kolonu (9 kolonluk semada 6) */
  matCol: number;
  /** İşç. Toplam kolonu (9 kolonluk semada 8) */
  labCol: number;
  /** Ilk/son VERI satiri (1-tabanli, baslik satiri 1) */
  ilkVeri: number;
  sonVeri: number;
  matDeger: number;
  labDeger: number;
  yazilan: number;
  ozet: boolean;
}

export interface SayfaYazOpsiyon {
  /** EX6: hedef para birimi (null = TRY, cevrim yok) */
  birim?: CiktiBirim | null;
  /** Sayfa alti toplam satiri eklensin mi (fiyatli cikti: EVET,
   *  format yolu: ICMAL zaten topluyor → HAYIR) */
  toplamSatiri?: boolean;
  /** 'en' → kolon basliklari ve BIRIM kisaltmalari Ingilizce yazilir.
   *  Bu metinler SABIT oldugu icin AI'ya gitmez (bkz. `cikti-dil.ts`). */
  dil?: string;
}

/**
 * EX1/EX8 — TEK DOLDURMA MOTORU (KF7).
 * Bir teklif sayfasini verilen workbook'a 9 kolonluk STANDART tablo olarak
 * yazar. Hem "Fiyatlandırılmış Excel" hem "Teklif Formatında Aktar" bunu
 * kullanir; ikisi arasinda ikinci bir yazim yolu YOKTUR.
 */
export function standartSayfaYaz(
  wb: ExcelJS.Workbook,
  sh: any,
  ops: SayfaYazOpsiyon = {},
): StandartSayfaBilgi {
  const birim = ops.birim ?? null;
  const kod = birim?.kod ?? 'TRY';
  const cevir = (v: number) => (birim && birim.kod !== 'TRY'
    ? Math.round(v * birim.katsayi * 100) / 100
    : v);
  const fmt = paraBicimi(kod);

  // Ad cakismasi: format dosyasinda AYNI adda bir sayfa olabilir (YILDIZ'da
  // format sablonunun "İcmal"i ile teklifin "İcmal" sayfasi cakisti →
  // ExcelJS "Worksheet name already exists" ile export'u DUSURDU).
  // Bos bulunana kadar " (2)", " (3)" … denenir; 31 karakter siniri korunur.
  // NOT: karsilastirma HARF DUYARSIZ olmali — ExcelJS "İCMAL" ile "İcmal"i
  // ayni sayar; harf duyarli kontrol cakismayi kaciriyor ve export 500 ile
  // dusuyordu (Bolum F bulgusu).
  const kucuk = (x: string) => x.toLocaleLowerCase('tr');
  const temel = String(sh.name ?? 'Sayfa').slice(0, 31);
  let ad0 = temel;
  for (let n = 2; wb.worksheets.some((w) => kucuk(w.name) === kucuk(ad0)); n++) {
    const ek = ` (${n})`;
    ad0 = temel.slice(0, 31 - ek.length) + ek;
  }
  const ws = wb.addWorksheet(ad0);

  const bas = ws.addRow(kolonlar(ops.dil));
  bas.font = { bold: true };
  bas.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    c.border = { bottom: { style: 'thin' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  ws.columns = [
    { width: 8 }, { width: 58 }, { width: 10 }, { width: 10 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 },
  ];
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]; // GS9 ikizi

  // ── ESKI KAYIT UYUMU (kullanici karari 30.07: "acilista donustur") ──
  // Sabit semadan ONCE kaydedilmis tekliflerde roller DOSYA kolonlarini
  // (col3, col4 …) gosterir. Alanlar rol uzerinden okunur; sabit semada
  // rol zaten `_ad`/`_matBirim` oldugu icin AYNI kod iki sekli de tasir.
  const rol = (sh.columnRoles ?? {}) as Record<string, string>;
  const A = (ad: string, sabit: string) => (typeof rol[ad] === 'string' && rol[ad] ? rol[ad] : sabit);
  const F = {
    no: A('noField', '_no'),
    ad: A('nameField', '_ad'),
    miktar: A('quantityField', '_miktar'),
    birim: A('unitField', '_birim'),
    matBirim: A('materialUnitPriceField', '_matBirim'),
    matToplam: A('materialTotalField', '_matToplam'),
    labBirim: A('laborUnitPriceField', '_labBirim'),
    labToplam: A('laborTotalField', '_labToplam'),
  };

  let matToplam = 0; let labToplam = 0; let yazilan = 0;
  let ilkVeri = 0; let sonVeri = 0;

  for (const r of sh.rowData ?? []) {
    if (!r) continue;
    const ad = String(r[F.ad] ?? '').trim();
    if (!r._isDataRow) {
      // Dosyanin KENDI baslik satiri ciktiya YAZILMAZ — ustte zaten standart
      // baslik var; yazilirsa grid'de duzelttigimiz "cift baslik" hatasi
      // ciktiya tasinir (FAZ0 §A.2).
      if (r._isHeaderRow) continue;
      if (!ad) continue;
      const satir = ws.addRow(['', ad, '', '', '', '', '', '', '']);
      satir.getCell(2).font = { italic: true, color: { argb: 'FF64748B' } };
      continue;
    }

    const matBirim = cevir(sayi(r[F.matBirim]));
    const matTot = cevir(sayi(r[F.matToplam]));
    const labBirim = cevir(sayi(r[F.labBirim]));
    const labTot = cevir(sayi(r[F.labToplam]));
    const genel = matTot + labTot;

    const satir = ws.addRow([
      String(r[F.no] ?? ''),
      ad,
      r[F.miktar] === '' || r[F.miktar] === null || r[F.miktar] === undefined ? '' : sayi(r[F.miktar]),
      // Birim SABIT bir kumedir ("mt", "ad", "set") — sozlukle cevrilir,
      // AI'ya gitmez; zaten ceviri katmaninda DOKUNULMAZ sayiliyor.
      birimCevir(r[F.birim], ops.dil),
      matBirim || '', matTot || '',
      labBirim || '', labTot || '',
      genel || '',
    ]);
    if (!ilkVeri) ilkVeri = satir.number;
    sonVeri = satir.number;
    for (const c of [5, 6, 7, 8, 9]) {
      const h = satir.getCell(c);
      if (typeof h.value === 'number') { h.numFmt = fmt; yazilan++; }
    }
    if (!r._ozet) { matToplam += matTot; labToplam += labTot; }
  }

  if (ops.toplamSatiri !== false) {
    // EX3: sayfa alti toplam satiri — EX4 geregi DEGER yazilir, formul degil
    ws.addRow([]);
    const tSatir = ws.addRow(['', 'SAYFA TOPLAMI', '', '', '', matToplam, '', labToplam, matToplam + labToplam]);
    tSatir.font = { bold: true };
    for (const c of [6, 8, 9]) {
      tSatir.getCell(c).numFmt = fmt;
      tSatir.getCell(c).border = { top: { style: 'thin' } };
    }
  }

  return {
    wsName: ws.name,
    matCol: 6,
    labCol: 8,
    ilkVeri,
    sonVeri,
    matDeger: matToplam,
    labDeger: labToplam,
    yazilan,
    ozet: !!sh.isOzet,
  };
}

export async function standartCiktiUret(g: StandartCiktiGirdi): Promise<StandartCiktiSonuc> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MetaPrice';
  wb.created = new Date();

  const birim = g.birim ?? null;
  const kod = birim?.kod ?? 'TRY';
  const fmt = paraBicimi(kod);

  let yazilan = 0;
  let genelToplam = 0;
  const sayfaOzetleri: { ad: string; mat: number; lab: number; toplam: number; ozet: boolean }[] = [];

  // KF7: sayfalar TEK motorla yazilir — format yolu da ayni fonksiyonu cagirir
  for (const sh of g.sheetsArr ?? []) {
    if (!sh || sh.isEmpty) continue;
    const b = standartSayfaYaz(wb, sh, { birim, toplamSatiri: true, dil: g.dil });
    yazilan += b.yazilan;
    sayfaOzetleri.push({ ad: b.wsName, mat: b.matDeger, lab: b.labDeger, toplam: b.matDeger + b.labDeger, ozet: b.ozet });
    if (!b.ozet) genelToplam += b.matDeger + b.labDeger;
  }

  // ── EX3/EX6: dosya sonunda GENEL TOPLAM + kur notu ─────────────────────
  const ozetWs = wb.addWorksheet('GENEL TOPLAM');
  ozetWs.columns = [{ width: 38 }, { width: 18 }, { width: 18 }, { width: 20 }];
  if (g.baslik) {
    const b = ozetWs.addRow([g.baslik]);
    b.font = { bold: true, size: 12 };
    ozetWs.addRow([]);
  }
  const oBas = ozetWs.addRow(
    g.dil === 'en' ? OZET_KOLONLAR_EN : ['Sayfa', 'Malz. Toplam', 'İşç. Toplam', 'Genel Toplam'],
  );
  oBas.font = { bold: true };
  oBas.eachCell((c) => { c.border = { bottom: { style: 'thin' } }; });
  for (const s of sayfaOzetleri) {
    const ozetNotu = g.dil === 'en' ? '(summary — not included in total)' : '(özet — toplama dahil değil)';
    const satir = ozetWs.addRow([s.ozet ? `${s.ad} ${ozetNotu}` : s.ad, s.mat, s.lab, s.toplam]);
    for (const c of [2, 3, 4]) satir.getCell(c).numFmt = fmt;
    if (s.ozet) satir.font = { color: { argb: 'FF94A3B8' }, italic: true };
  }
  ozetWs.addRow([]);
  const gSatir = ozetWs.addRow(['TEKLİF GENEL TOPLAMI', '', '', genelToplam]);
  gSatir.font = { bold: true, size: 12 };
  gSatir.getCell(4).numFmt = fmt;
  gSatir.getCell(4).border = { top: { style: 'double' } };
  if (birim && birim.not) {
    ozetWs.addRow([]);
    const n = ozetWs.addRow([birim.not]);
    n.font = { italic: true, color: { argb: 'FF64748B' } };
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  // EX7: gorunur self-check
  const ozet = [
    `${yazilan} değer aktarıldı ✓`,
    // P2-1b: 2 hane — ekran (PARA_ONDALIK) ve bu dosyanin numFmt'i ile ayni.
    `genel toplam ${simge(kod)}${genelToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `${sayfaOzetleri.filter((s) => s.ozet).length ? sayfaOzetleri.filter((s) => s.ozet).length + ' özet sayfa toplama dahil değil' : ''}`,
  ].filter(Boolean).join(' · ');

  return { buffer, ozet, genelToplam, yazilan };
}
