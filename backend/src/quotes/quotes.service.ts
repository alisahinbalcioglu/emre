import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
// PRD Teklif Formatim (v2.1): profesyonel cikti motoru
import { buildExportWorkbook, writePricesToWorkbook, ExportSonucu, ExportBirim } from './export-engine';
import { buildSampleFormat, ExportOverrides, FillContext } from '../quote-formats/format-engine';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

/** KDV orani — kod sabiti (ayarlanabilirlik backlog) */
const KDV_ORAN = 0.20;

@Injectable()
export class QuotesService {
  constructor(
    private prisma: PrismaService,
    private exchangeRates: ExchangeRatesService,
  ) {}

  async parseExcel(userId: string, fileBuffer: Buffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) return { headers: [], rows: [], brands: [] };

    const headers = Object.keys(rows[0]);
    console.log(`[Excel] ${rows.length} satır, ${headers.length} sütun: [${headers.join(', ')}]`);

    const brands = await this.prisma.brand.findMany({ select: { id: true, name: true } });

    return { headers, rows, brands };
  }

  async create(userId: string, dto: CreateQuoteDto) {
    const items = dto.items.map((item) => {
      const qty = item.quantity ?? 1;
      const matUp = item.materialUnitPrice ?? item.unitPrice ?? 0;
      const labUp = item.laborUnitPrice ?? 0;
      const matMargin = item.materialMargin ?? 0;
      const labMargin = item.laborMargin ?? 0;

      // Malzeme hesaplama (marja dahil)
      const matWithMargin = matUp * (1 + matMargin / 100);
      const materialTotalPrice = matWithMargin * qty;

      // İşçilik hesaplama (marja dahil)
      const labWithMargin = labUp * (1 + labMargin / 100);
      const laborTotalPrice = labWithMargin * qty;

      // Toplamlar
      const totalUnitPrice = matWithMargin + labWithMargin;
      const totalPrice = materialTotalPrice + laborTotalPrice;

      // Eski alan geriye uyum
      const discount = item.discount ?? 0;
      const profitMargin = item.profitMargin ?? matMargin;
      const netPrice = matUp * (1 - discount / 100);
      const finalPrice = totalPrice;

      return {
        materialName: item.materialName,
        unit: item.unit ?? 'Adet',
        brandId: item.brandId || null,
        quantity: qty,
        materialUnitPrice: matUp,
        materialTotalPrice,
        materialMargin: matMargin,
        laborUnitPrice: labUp,
        laborTotalPrice,
        laborMargin: labMargin,
        totalUnitPrice,
        totalPrice,
        // Geriye uyumluluk
        unitPrice: matUp,
        discount,
        netPrice,
        profitMargin,
        finalPrice,
      };
    });

    // Orijinal dosya binary'si (base64 → Buffer)
    let originalFile: Buffer | undefined;
    if (dto.originalFileBase64) {
      try {
        originalFile = Buffer.from(dto.originalFileBase64, 'base64');
      } catch {}
    }

    return this.prisma.quote.create({
      data: {
        userId,
        title: dto.title || `Teklif ${new Date().toLocaleDateString('tr-TR')}`,
        sheets: dto.sheets ? (dto.sheets as any) : undefined,
        originalFile: originalFile ?? undefined,
        originalName: dto.originalFileName ?? undefined,
        items: { create: items },
      },
      include: {
        items: { include: { brand: true } },
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.quote.findMany({
      where: { userId },
      include: {
        items: { include: { brand: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, userId },
      include: {
        items: { include: { brand: true } },
        user: { select: { email: true } },
      },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  async remove(userId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({ where: { id, userId } });
    if (!quote) throw new NotFoundException('Quote not found');
    return this.prisma.quote.delete({ where: { id } });
  }


  // ═══════════════════════════════════════════════════════════════════
  // PRD TEKLIF FORMATIM (v2.1) — profesyonel cikti: format kapak/icmal +
  // musteri workbook kopyasi (T1) + formullu fiyatlar + rev arsivi (T10)
  // ═══════════════════════════════════════════════════════════════════

  /** Teklif bilgileri (kapak alanlari) + format secimi. */
  async updateInfo(userId: string, id: string, dto: {
    musteri?: string; proje?: string; hazirlayan?: string; gecerlilik?: string; formatId?: string | null;
    displayCurrency?: string; displayRate?: number | null; displayRateDate?: string | null;
  }) {
    const quote = await this.prisma.quote.findFirst({ where: { id, userId } });
    if (!quote) throw new NotFoundException('Quote not found');
    if (dto.formatId) {
      const f = await (this.prisma as any).quoteFormat.findFirst({ where: { id: dto.formatId, userId } });
      if (!f) throw new NotFoundException('Format bulunamadi');
    }
    // KISMI GUNCELLEME (KH8): gonderilMEyen alan DOKUNULMAZ — detay
    // sayfasinin para-birimi toggle'i yalniz displayCurrency yollar; eski
    // "hep null'a ez" davranisi kapak alanlarini SILERDI.
    const alan = (v?: string) => (v === undefined ? undefined : v.trim() || null);
    return this.prisma.quote.update({
      where: { id },
      data: {
        musteri: alan(dto.musteri),
        proje: alan(dto.proje),
        hazirlayan: alan(dto.hazirlayan),
        gecerlilik: alan(dto.gecerlilik),
        formatId: dto.formatId === null ? null : dto.formatId ?? undefined,
        // SORUN 16: goruntuleme birimi + kayit-ani kuru (arsiv)
        displayCurrency: ['TRY', 'USD', 'EUR'].includes(dto.displayCurrency ?? '')
          ? dto.displayCurrency : undefined,
        displayRate: dto.displayRate === undefined ? undefined : dto.displayRate,
        displayRateDate: dto.displayRateDate === undefined ? undefined : dto.displayRateDate,
      } as any,
      select: { id: true, musteri: true, proje: true, hazirlayan: true, gecerlilik: true, formatId: true, displayCurrency: true } as any,
    });
  }

  /** Format cozumu (Bulgu B1/B2 sertlestirmesi): teklifte secili → kullanicinin
   *  varsayilani → kullanicinin EN SON formati → yerlesik sade (YALNIZ hic
   *  format yoksa, T8). Kullanicinin formati varken sample'a SESSIZ dusus
   *  YASAK; hangi formatin kullanildigi loglanir ve FE'ye tasinir.
   *  DB'deki bytes DEGISMEZ (T13) — her cagri taze kopya yukler. */
  private async resolveFormatWb(userId: string, quote: any): Promise<{
    wb: ExcelJS.Workbook; formatAdi: string; formatKaynak: 'kullanici' | 'yerlesik';
    sheetRoles: Record<string, 'sabit' | 'liste'> | null;
  }> {
    let kayit = quote.formatId
      ? await (this.prisma as any).quoteFormat.findFirst({ where: { id: quote.formatId, userId } })
      : null;
    if (!kayit) {
      kayit = await (this.prisma as any).quoteFormat.findFirst({ where: { userId, isDefault: true } });
    }
    if (!kayit) {
      // Varsayilan isaretli yoksa EN SON yuklenen format kullanilir
      kayit = await (this.prisma as any).quoteFormat.findFirst({
        where: { userId }, orderBy: { createdAt: 'desc' },
      });
    }
    if (kayit) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(kayit.fileBytes) as any);
      console.log(`[Export] Format: "${kayit.name}" (kullanici formati${kayit.isDefault ? ', varsayilan' : ''})`);
      return { wb, formatAdi: kayit.name, formatKaynak: 'kullanici', sheetRoles: (kayit.mapping as any)?.sheetRoles ?? null };
    }
    console.warn('[Export] Kullanicinin formati YOK — yerlesik sade kapak+icmal (T8)');
    return { wb: buildSampleFormat(), formatAdi: 'MetaPrice Varsayılan', formatKaynak: 'yerlesik', sheetRoles: null };
  }

  /** T12: kur notu — ekrandaki (TCMB) kur + tarih. Cikti aninda soru YOK. */
  private async kurNotuUret(): Promise<string> {
    try {
      const r = await this.exchangeRates.getRates();
      const tarih = r.date || new Date().toLocaleDateString('tr-TR');
      return `Kur: 1 USD = ${r.usdTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL · 1 EUR = ${r.eurTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL (TCMB, ${tarih})`;
    } catch {
      return '';
    }
  }

  private async ctxTemelUret(quote: any, rev: number): Promise<Omit<FillContext, 'sekmeler'>> {
    return {
      teklifNo: quote.quoteNo ?? `MP-${new Date().getFullYear()}-TASLAK`,
      rev,
      tarih: new Date().toLocaleDateString('tr-TR'),
      musteri: quote.musteri,
      proje: quote.proje,
      hazirlayan: quote.hazirlayan,
      gecerlilik: quote.gecerlilik,
      kurNotu: await this.kurNotuUret(),
      kdvOran: KDV_ORAN,
    };
  }

  private async quoteGetir(userId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({ where: { id, userId } });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote as any;
  }

  /** PANO 18: teklifin GORUNTULEME birimi → export cevirisi (canli TCMB;
   *  kutuphane orijinal birimleri DEGISMEZ — yalniz cikti goruntusu). */
  private async exportBirimi(quote: any): Promise<ExportBirim | null> {
    const kod = quote.displayCurrency;
    if (kod !== 'USD' && kod !== 'EUR') return null;
    try {
      const r: any = await this.exchangeRates.getRates();
      const tryPer = kod === 'USD' ? r?.usdTry : r?.eurTry;
      if (!tryPer || tryPer <= 1) return null; // kur alinamadi → guvenli TL
      const kur = Number(tryPer).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return {
        kod,
        katsayi: 1 / Number(tryPer),
        not: `Fiyatlar ${kod} — 1 ${kod} = ₺${kur} (TCMB, ${r?.date ?? new Date().toLocaleDateString('tr-TR')})`,
      };
    } catch {
      return null; // kur servisi hatasi exportu DUSUREMEZ — TL yazilir
    }
  }

  /** PANO 21a/c: gorunur self-check ozeti ("N değer aktarıldı ✓ …"). */
  private exportOzeti(
    t: { yazilan: number; beklenen: number; fiyatsiz: number; toplam: number },
    birim: ExportBirim | null,
  ): string {
    const simge = birim?.kod === 'USD' ? '$' : birim?.kod === 'EUR' ? '€' : '₺';
    const parca = [`${Math.max(t.yazilan, t.beklenen)} değer aktarıldı ✓`,
      `toplam ${simge}${t.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`];
    if (t.fiyatsiz > 0) parca.push(`${t.fiyatsiz} satır fiyatsız (eşleşmemiş)`);
    return parca.join(' · ');
  }

  private async ciktiKur(userId: string, quote: any, rev: number): Promise<ExportSonucu & { formatAdi: string; formatKaynak: 'kullanici' | 'yerlesik' }> {
    // Bulgu Raporu kok neden: grid'den uretim SILINDI — orijinal dosya ZORUNLU.
    if (!quote.originalFile) {
      throw new BadRequestException(
        'Bu teklifte orijinal Excel dosyası kayıtlı değil — dışa aktarım için keşif Excel\'ini yükleyip teklifi yeniden kaydedin.',
      );
    }
    const { wb: formatWb, formatAdi, formatKaynak, sheetRoles } = await this.resolveFormatWb(userId, quote);
    const sheetsArr = Array.isArray(quote.sheets) ? (quote.sheets as any[]) : [];
    const sonuc = await buildExportWorkbook({
      originalFile: Buffer.from(quote.originalFile),
      sheetsArr,
      formatWb,
      sheetRoles,
      ctxTemel: await this.ctxTemelUret(quote, rev),
      overrides: (quote.exportOverrides ?? null) as ExportOverrides | null,
      birim: await this.exportBirimi(quote), // PANO 18 (KF7: iki yol ayni)
    });
    return { ...sonuc, formatAdi, formatKaynak };
  }

  // ARINMA Faz 2 (A+B): exportPreview + saveOverrides SILINDI — Cikti
  // Onizleme sayfasi c947983'te kaldirilmisti, FE'de 0 cagri kalmisti.
  // quote.exportOverrides ALANI ve applyOverrides motoru KORUNUR (T13/T14):
  // eski kayitli override'lar ciktiKur uzerinden islenmeye devam eder.

  /** .xlsx uret + REV artir + arsivle (T10). */
  async exportXlsx(userId: string, id: string): Promise<{ buffer: Buffer; filename: string; rev: number; quoteNo: string; uyari?: string; ozet?: string }> {
    const quote = await this.quoteGetir(userId, id);

    // Teklif no ILK aktarimda atanir, sonra SABIT (T10)
    let quoteNo: string = quote.quoteNo;
    if (!quoteNo) {
      const yil = new Date().getFullYear();
      const sayac = await this.prisma.quote.count({
        where: { userId, quoteNo: { not: null } } as any,
      });
      quoteNo = `MP-${yil}-${String(sayac + 1).padStart(3, '0')}`;
    }
    const yeniRev = (quote.rev ?? 0) + 1;

    const sonuc = await this.ciktiKur(userId, { ...quote, quoteNo }, yeniRev);
    const out = await sonuc.wb.xlsx.writeBuffer();
    const buffer = Buffer.from(out);

    const temizBaslik = String(quote.title ?? 'Teklif').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
    const filename = `${quoteNo} Rev.${String(yeniRev).padStart(2, '0')} - ${temizBaslik}.xlsx`;

    await this.prisma.$transaction([
      this.prisma.quote.update({ where: { id }, data: { quoteNo, rev: yeniRev } as any }),
      (this.prisma as any).quoteExport.create({
        data: {
          quoteId: id,
          rev: yeniRev,
          fileName: filename,
          xlsxBytes: buffer,
          overridesSnapshot: (quote.exportOverrides ?? undefined) as any,
        },
      }),
    ]);

    console.log(`[Export] ${quoteNo} Rev.${yeniRev} uretildi (${(buffer.length / 1024).toFixed(0)} KB)`);
    // KF6/KF7 + K-D: teklif-format yolu da AYNI self-check'i tasir (tek motor)
    const parcalar: string[] = [];
    if ((sonuc.eksikDeger ?? 0) > 0) parcalar.push(`${sonuc.eksikDeger} fiyat değeri dosyaya yazılamadı`);
    if ((sonuc.hataArtisi ?? 0) > 0) parcalar.push(`${sonuc.hataArtisi} hücrede formül hatası oluştu`);
    const uyari = parcalar.length > 0 ? `${parcalar.join('; ')} — çıktıyı kontrol edin.` : undefined;
    if (uyari) console.warn(`[Export] ⚠ SELF-CHECK (teklif format): ${uyari}`);
    // PANO 21a: gorunur ozet (KF7 — iki yol ayni self-check'i tasir)
    const ozet = this.exportOzeti({
      yazilan: sonuc.yazilanDeger ?? 0,
      beklenen: sonuc.beklenenDeger ?? 0,
      fiyatsiz: sonuc.fiyatsizSatir ?? 0,
      toplam: sonuc.sekmeler.reduce((a, b) => a + b.matDeger + b.labDeger, 0),
    }, await this.exportBirimi(quote));
    return { buffer, filename, rev: yeniRev, quoteNo, uyari, ozet };
  }

  /** Fiyatlandirilmis kesif Excel'i: MUSTERININ ORIJINAL dosyasi, fiyatlar
   *  yazilmis — teklif formati (kapak/icmal) YOK, REV ARTMAZ, arsivlenmez.
   *  Kullanici karari 24.07: "sadece fiyatlandirdigi exceli indirmek
   *  isteyebilir (teklif formatinda gondermek istemeyebilir)". */
  async exportPricedXlsx(userId: string, id: string): Promise<{ buffer: Buffer; filename: string; uyari?: string; ozet?: string }> {
    const quote = await this.quoteGetir(userId, id);
    if (!quote.originalFile) {
      throw new BadRequestException(
        'Bu teklifte orijinal Excel dosyası kayıtlı değil — dışa aktarım için keşif Excel\'ini yükleyip teklifi yeniden kaydedin.',
      );
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(quote.originalFile) as any);
    const sheetsArr = Array.isArray(quote.sheets) ? (quote.sheets as any[]) : [];
    const birim = await this.exportBirimi(quote); // PANO 18: ekrandaki birim
    const bilgiler = writePricesToWorkbook(wb, sheetsArr, birim);
    // KF6 + K-D self-check: dolu deger sayisi ↔ yazilan + hata artisi.
    // Uyusmazlik SESSIZ GECILMEZ — kullaniciya gorunur uyari (header → toast).
    const eksik = bilgiler.reduce((a, b) => a + Math.max(0, b.beklenen - b.yazilan), 0);
    const hataArt = bilgiler.reduce((a, b) => a + (b.hataArtisi ?? 0), 0);
    const parcalar: string[] = [];
    if (eksik > 0) parcalar.push(`${eksik} fiyat değeri dosyaya yazılamadı`);
    if (hataArt > 0) parcalar.push(`${hataArt} hücrede formül hatası oluştu`);
    const uyari = parcalar.length > 0 ? `${parcalar.join('; ')} — çıktıyı kontrol edin.` : undefined;
    if (uyari) console.warn(`[Export] ⚠ SELF-CHECK (fiyatli kesif): ${uyari}`);
    // PANO 21a: BASARIDA da gorunur ozet (self-check kaniti)
    const ozet = this.exportOzeti({
      yazilan: bilgiler.reduce((a, b) => a + b.yazilan, 0),
      beklenen: bilgiler.reduce((a, b) => a + b.beklenen, 0),
      fiyatsiz: bilgiler.reduce((a, b) => a + (b.fiyatsizSatir ?? 0), 0),
      toplam: bilgiler.reduce((a, b) => a + b.matDeger + b.labDeger, 0),
    }, birim);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const temizBaslik = String(quote.title ?? 'Teklif').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
    const filename = `${temizBaslik} - Fiyatlandırılmış Keşif.xlsx`;
    console.log(`[Export] Fiyatlandirilmis kesif indirildi (${(buffer.length / 1024).toFixed(0)} KB) — ${ozet}`);
    return { buffer, filename, uyari, ozet };
  }

  /** T10 arsivi: uretilmis revizyonlar. */
  async listExports(userId: string, id: string) {
    await this.quoteGetir(userId, id);
    return (this.prisma as any).quoteExport.findMany({
      where: { quoteId: id },
      select: { id: true, rev: true, fileName: true, createdAt: true },
      orderBy: { rev: 'desc' },
    });
  }

  async downloadExport(userId: string, id: string, rev: number): Promise<{ buffer: Buffer; filename: string }> {
    await this.quoteGetir(userId, id);
    const e = await (this.prisma as any).quoteExport.findFirst({ where: { quoteId: id, rev } });
    if (!e) throw new NotFoundException('Revizyon bulunamadi');
    return { buffer: Buffer.from(e.xlsxBytes), filename: e.fileName };
  }

  // ARINMA Faz 2C: exportPdfPro + HTML-PDF fallback (listeBloklariHtml +
  // puppeteer) SILINDI — kullanici karari 24.07 "pdf olmasin", FE'de 0
  // cagri. xlsx-to-pdf util'i KORUNDU (quote-formats preview-pdf canli).
  // Geri getirme: git show pre-arinma:backend/src/quotes/quotes.service.ts
}
