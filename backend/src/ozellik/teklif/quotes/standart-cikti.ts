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
import { kurusTamsayi } from '../../fiyat/matching/pricing';
// A2 (tur 3): kayitli grid hucresi MAKINE sinirindadir — on yuz `sayiOku` ikizi
import { makineSayiOku } from '../../kutuphane/utils/import-fidelity';
import { AntetBilgi, antetYaz } from '../../cikti/utils/antet';

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
  /** Firma anteti (antet.ts antetKur) — null/yok ise antet basilmaz */
  antet?: AntetBilgi | null;
  /**
   * Dosya acilinca GORUNEN sekmenin (ilk yazilan sayfa) tablo basliginin
   * ustune yazilan not.
   *
   * ⚠ NEDEN YALNIZ `baslik` YETMEZ (Faz 6.10 inceleme ORTA-1, 16.09): `baslik`
   * yalniz SON sekmeye (GENEL TOPLAM) yazilir; calisma kitabi etkin sekme
   * ayarlamaz ve Excel dosyayi ILK sekmede acar. KVKK baglantisindan Turkceye
   * indirgenmis dosyanin "İngilizce çevirisi yok" notu boylece kullaniciya hic
   * gorunmuyordu (HTTP uyari basligi da ham indirmede gorunmez).
   */
  acilisNotu?: string;
}

export interface StandartCiktiSonuc {
  buffer: Buffer;
  /** EX7: gorunur self-check ozeti */
  ozet: string;
  /** Ozet sayfalar HARIC teklif geneli toplam */
  genelToplam: number;
  /** Dosyaya yazilan fiyat/tutar hucresi sayisi */
  yazilan: number;
  /** Fiyatsiz (eslesmemis) veri satiri toplami — format yoluyla AYNI olcut */
  fiyatsizSatir: number;
}

/** TR-bilinçli sayi parse (Bulgu B7/B8 siniri): "1.234,56" → 1234.56,
 *  "87,5" → 87.5, "313" → 313.
 *  ⚠ ILK SURUM HATALIYDI: duz `.replace(',', '.')` "1.234,56"yi "1.234.56"
 *  yapip parseFloat ile **1.234**'e dusuruyordu (386.417,28 → 386.417).
 *  Eski format testleri bunu yakaladi; export-engine'deki dogru mantik
 *  buraya alindi.
 *  ⚠ A2 (tur 3, olculdu): `parseFloat` metnin basindaki rakami SAYI yapiyordu —
 *  musterinin Excel'inde "35x240mm kanal" Malz. Birim 35, "3 adet" Miktar 3
 *  (ekran ve kayit 0 okurken). Okuyucu artik ekranla AYNI makine kurali
 *  (`makineSayiOku` ≡ on yuz `sayiOku`, parite H12): harf/olcu metni sayi degil. */
const sayi = (v: unknown): number => makineSayiOku(v) ?? 0;

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
  /**
   * ICMAL'e KATKI VEREN satirlarin GERCEK satir numaralari (1-tabanli) —
   * `matDeger`/`labDeger`e giren satirlarin TAMAMI ve YALNIZI.
   *
   * ⚠ NEDEN `ilkVeri..sonVeri` ARALIGI DEGIL (hesap dogrulugu turu, 13.09):
   * bitisik aralik, sayfa ortasindaki ARA TOPLAM (`_ozet`) satirlarini ve
   * musterinin kendi İcmal sayfasini da kapsiyordu. Onbellek dogru, formul
   * YANLIS cikiyordu: FIRMA-C'de GENEL TOPLAM onbellekte 74.452.440, Excel
   * yeniden hesaplayinca 223.357.320 (3 kat). SUM bu listeden kurulur
   * (export-engine.ts `sekmeOzetiKur`); satir numarasi yazim ANINDA
   * `satir.number`dan okunur, sabit bir baslik konumu VARSAYILMAZ.
   */
  toplamSatirlari: number[];
  matDeger: number;
  labDeger: number;
  yazilan: number;
  /** Ne birim ne toplam fiyati olan (ozet olmayan) veri satiri — rol alanlariyla */
  fiyatsizSatir: number;
  ozet: boolean;
}

/** Ciktinin kendi ozet sayfasi — teklif sayfalari bu adi ALAMAZ (I9). */
export const GENEL_TOPLAM_SAYFA_ADI = 'GENEL TOPLAM';

/**
 * Workbook'ta ALINMAMIS sayfa adi: cakisirsa " (2)", " (3)" … eklenir, Excel'in
 * 31 karakter siniri korunur.
 *
 * ⚠ IKI KUCULTME BIRDEN (para dogrulugu turu, 14.09 — I10, olculdu): Turkce
 * yerel ayarli kucultme "ICMAL"i "ıcmal" yapar, ExcelJS'in kendi kontrolu duz
 * `toLowerCase` ile "icmal" yapar. Yalniz TR kuralina bakan kontrol "ICMAL" +
 * "icmal" ciftini FARKLI sanip gecirir, ExcelJS "Worksheet name already exists"
 * ile ciktiyi DUSURURDU (HTTP 400, dosya inmez). Iki kuraldan BIRINDE esit olan
 * ad alinmis sayilir.
 * ⚠ REZERVE AD (I9): fiyatli cikti sonuna kendi "GENEL TOPLAM" sayfasini ekler;
 * teklifte ayni adli sayfa varsa once o adi alip ozet sayfasini dusuruyordu.
 */
export function benzersizSayfaAdi(wb: ExcelJS.Workbook, istenen: string, rezerveAdlar: readonly string[] = []): string {
  const anahtarlar = (x: string) => [x.toLocaleLowerCase('tr'), x.toLowerCase()];
  const alinmis = new Set<string>();
  for (const ad of [...wb.worksheets.map((w) => w.name), ...rezerveAdlar]) anahtarlar(ad).forEach((k) => alinmis.add(k));
  const cakisir = (ad: string) => anahtarlar(ad).some((k) => alinmis.has(k));
  const temel = istenen.slice(0, 31);
  let ad = temel;
  for (let n = 2; cakisir(ad); n++) {
    const ek = ` (${n})`;
    ad = temel.slice(0, 31 - ek.length) + ek;
  }
  return ad;
}

export interface SayfaYazOpsiyon {
  /** Teklif sayfalarinin ALAMAYACAGI adlar (ciktinin kendi sayfalari — I9). */
  rezerveAdlar?: readonly string[];
  /** EX6: hedef para birimi (null = TRY, cevrim yok) */
  birim?: CiktiBirim | null;
  /** Sayfa alti toplam satiri eklensin mi (fiyatli cikti: EVET,
   *  format yolu: ICMAL zaten topluyor → HAYIR) */
  toplamSatiri?: boolean;
  /** 'en' → kolon basliklari ve BIRIM kisaltmalari Ingilizce yazilir.
   *  Bu metinler SABIT oldugu icin AI'ya gitmez (bkz. `cikti-dil.ts`). */
  dil?: string;
  /** Firma anteti — tablodan ONCE yazilir; baslik ve veri satirlari asagi kayar,
   *  ICMAL SUM araliklari `satir.number`dan geldigi icin birlikte kayar. */
  antet?: AntetBilgi | null;
  /** Antetten SONRA, tablo basligindan ONCE tek satir not (formulsuz). Baslik,
   *  veri ve `toplamSatirlari` numaralari yazim aninda `satir.number`dan
   *  okundugu icin birlikte kayar; donmus bolme notu da ustte tutar. */
  ustNot?: string;
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
  // PARA HUCRESI KURUS-TAMDIR (13.09): hucreye yazilan deger ile sayfa toplami
  // AYNI kurus tamsayidan dogar — Excel'in SUM'i, onbellek ve ekrandaki sayfa
  // toplami (frontend `sayfaToplamlari`) kurusu kurusuna tutar. Eskiden TL
  // hucre HAM yaziliyor ve ham float toplaniyordu: 3 ondalikli dosya
  // toplamlarinda Bursa/Mekanik ekranda 89.506.650,45, ciktida ,39 idi.
  // Gorunen rakam degismez (bicim zaten 2 hane); yalniz gizli 3. hane gider.
  const kurus = (v: number) => kurusTamsayi(birim && birim.kod !== 'TRY' ? v * birim.katsayi : v);
  const fmt = paraBicimi(kod);

  // Ad cakismasi: format dosyasinda AYNI adda bir sayfa olabilir (YILDIZ'da
  // format sablonunun "İcmal"i ile teklifin "İcmal" sayfasi cakisti →
  // ExcelJS "Worksheet name already exists" ile export'u DUSURDU).
  // Bos bulunana kadar " (2)", " (3)" … denenir; 31 karakter siniri korunur.
  // NOT: karsilastirma HARF DUYARSIZ olmali — ExcelJS "İCMAL" ile "İcmal"i
  // ayni sayar; harf duyarli kontrol cakismayi kaciriyor ve export 500 ile
  // dusuyordu (Bolum F bulgusu).
  const ws = wb.addWorksheet(benzersizSayfaAdi(wb, String(sh.name ?? 'Sayfa'), ops.rezerveAdlar));

  // ANTET (plan 4.4): tablo YAZILMADAN once. Sonradan satir eklemek YASAK —
  // ExcelJS formul referanslarini guncellemez (bkz. antet.ts SUM GUVENLIGI).
  antetYaz(wb, ws, ops.antet, { metinKolonu: 2, logoKolonu: 7 });
  if (ops.ustNot) {
    const notSatiri = ws.addRow(['', ops.ustNot]);
    notSatiri.height = 30; // genis B kolonunda iki satira sarar
    const h = notSatiri.getCell(2);
    h.font = { bold: true, color: { argb: 'FFB45309' } };
    h.alignment = { vertical: 'middle', wrapText: true };
  }

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
  // GS9 ikizi: donmus bolme BASLIK satirinin altindan — antet varsa baslik 1.
  // satirda degildir; sabit `ySplit: 1` anteti dondurup basligi kaydirirdi.
  ws.views = [{ state: 'frozen', ySplit: bas.number, xSplit: 2 }];

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

  // Kurus tamsayi biriktirme — toplam SIRADAN bagimsiz (pricing.ts ADIM 7 gerekcesi)
  let matToplamK = 0; let labToplamK = 0; let yazilan = 0; let fiyatsizSatir = 0;
  const toplamSatirlari: number[] = [];

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

    const matBirimK = kurus(sayi(r[F.matBirim]));
    const matTotK = kurus(sayi(r[F.matToplam]));
    const labBirimK = kurus(sayi(r[F.labBirim]));
    const labTotK = kurus(sayi(r[F.labToplam]));
    const hucre = (k: number) => (k ? k / 100 : '');

    const satir = ws.addRow([
      String(r[F.no] ?? ''),
      ad,
      // A2: okunamayan miktar metni ("Ø100 PVC boru") BOS yazilir — 0 da uydurma sayi da degil
      makineSayiOku(r[F.miktar]) ?? '',
      // Birim SABIT bir kumedir ("mt", "ad", "set") — sozlukle cevrilir,
      // AI'ya gitmez; zaten ceviri katmaninda DOKUNULMAZ sayiliyor.
      birimCevir(r[F.birim], ops.dil),
      hucre(matBirimK), hucre(matTotK),
      hucre(labBirimK), hucre(labTotK),
      hucre(matTotK + labTotK),
    ]);
    for (const c of [5, 6, 7, 8, 9]) {
      const h = satir.getCell(c);
      if (typeof h.value === 'number') { h.numFmt = fmt; yazilan++; }
    }
    // Ozet (ARA TOPLAM / musterinin İcmal'i) satiri GORUNUR ama toplama ve
    // ICMAL SUM'ina GIRMEZ (30.07 karari — cift sayim yasagi).
    if (!r._ozet) {
      matToplamK += matTotK; labToplamK += labTotK;
      toplamSatirlari.push(satir.number);
      if (!(sayi(r[F.matBirim]) > 0) && !(sayi(r[F.labBirim]) > 0) && !matTotK && !labTotK) fiyatsizSatir++;
    }
  }
  const matToplam = matToplamK / 100;
  const labToplam = labToplamK / 100;

  if (ops.toplamSatiri !== false) {
    // EX3: sayfa alti toplam satiri — EX4 geregi DEGER yazilir, formul degil
    ws.addRow([]);
    const tSatir = ws.addRow(['', 'SAYFA TOPLAMI', '', '', '', matToplam, '', labToplam, (matToplamK + labToplamK) / 100]);
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
    toplamSatirlari,
    matDeger: matToplam,
    labDeger: labToplam,
    yazilan,
    fiyatsizSatir,
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
  let genelToplamK = 0; let fiyatsizSatir = 0;
  const sayfaOzetleri: { ad: string; mat: number; lab: number; toplam: number; ozet: boolean }[] = [];

  // KF7: sayfalar TEK motorla yazilir — format yolu da ayni fonksiyonu cagirir
  for (const sh of g.sheetsArr ?? []) {
    if (!sh || sh.isEmpty) continue;
    // Acilis notu YALNIZ ilk yazilan sayfaya: Excel dosyayi o sekmede acar (ORTA-1).
    const ustNot = wb.worksheets.length === 0 ? g.acilisNotu : undefined;
    const b = standartSayfaYaz(wb, sh, { birim, toplamSatiri: true, dil: g.dil, antet: g.antet, rezerveAdlar: [GENEL_TOPLAM_SAYFA_ADI], ustNot });
    yazilan += b.yazilan;
    fiyatsizSatir += b.fiyatsizSatir;
    // Kurus tamsayi — sayfa toplamlari ile teklif geneli AYNI kuralla toplanir
    const sayfaK = kurusTamsayi(b.matDeger) + kurusTamsayi(b.labDeger);
    sayfaOzetleri.push({ ad: b.wsName, mat: b.matDeger, lab: b.labDeger, toplam: sayfaK / 100, ozet: b.ozet });
    if (!b.ozet) genelToplamK += sayfaK;
  }

  // ── EX3/EX6: dosya sonunda GENEL TOPLAM + kur notu ─────────────────────
  const genelToplam = genelToplamK / 100;
  const ozetWs = wb.addWorksheet(GENEL_TOPLAM_SAYFA_ADI); // rezerve — teklif sayfalari bu adi alamaz (I9)
  ozetWs.columns = [{ width: 38 }, { width: 18 }, { width: 18 }, { width: 20 }];
  // Formulsuz sayfa (EX4) — antet satir kaydirmasi toplam riski tasimaz.
  // Logo D kolonunda: A+B (~56 karakter) uzun "Tel · E-posta" satirini
  // tasimaz, metin C'ye tasar — logo C'de baslasaydi metnin USTUNE binerdi.
  antetYaz(wb, ozetWs, g.antet, { metinKolonu: 1, logoKolonu: 4 });
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

  return { buffer, ozet, genelToplam, yazilan, fiyatsizSatir };
}
