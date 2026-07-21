import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import * as XLSX from 'xlsx';
import * as puppeteer from 'puppeteer';
import * as ExcelJS from 'exceljs';
// PRD Teklif Formatim (v2.1): profesyonel cikti motoru
import { buildExportWorkbook, ExportSonucu } from './export-engine';
import { buildSampleFormat, sheetToGrid, ExportOverrides, FillContext } from '../quote-formats/format-engine';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { xlsxToPdf } from '../utils/xlsx-to-pdf';

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
  }) {
    const quote = await this.prisma.quote.findFirst({ where: { id, userId } });
    if (!quote) throw new NotFoundException('Quote not found');
    if (dto.formatId) {
      const f = await (this.prisma as any).quoteFormat.findFirst({ where: { id: dto.formatId, userId } });
      if (!f) throw new NotFoundException('Format bulunamadi');
    }
    return this.prisma.quote.update({
      where: { id },
      data: {
        musteri: dto.musteri?.trim() || null,
        proje: dto.proje?.trim() || null,
        hazirlayan: dto.hazirlayan?.trim() || null,
        gecerlilik: dto.gecerlilik?.trim() || null,
        formatId: dto.formatId === null ? null : dto.formatId ?? undefined,
      } as any,
      select: { id: true, musteri: true, proje: true, hazirlayan: true, gecerlilik: true, formatId: true } as any,
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
    });
    return { ...sonuc, formatAdi, formatKaynak };
  }

  /** Cikti Onizleme verisi: DOLDURULMUS kapak/icmal (ExcelGrid JSON) +
   *  otomatik alan haritasi (T14) + mevcut overrides + liste sekme adlari. */
  async exportPreview(userId: string, id: string) {
    const quote = await this.quoteGetir(userId, id);
    const sonuc = await this.ciktiKur(userId, quote, (quote.rev ?? 0) + 1);
    const formatSheets = sonuc.formatSayfalari
      .map((ad) => sonuc.wb.getWorksheet(ad))
      .filter(Boolean)
      .map((ws) => sheetToGrid(ws!, true));
    const listeAdlari = (Array.isArray(quote.sheets) ? (quote.sheets as any[]) : [])
      .filter((s) => !s.isEmpty)
      .map((s) => s.name ?? 'Sayfa');
    return {
      quoteId: quote.id,
      teklifNo: quote.quoteNo ?? null,
      rev: (quote.rev ?? 0) + 1,
      formatSheets,
      // B1 gorunurlugu: hangi format kullanildi? (yerlesik ise FE uyarir)
      formatAdi: sonuc.formatAdi,
      formatKaynak: sonuc.formatKaynak,
      dolan: sonuc.dolan,
      overrides: quote.exportOverrides ?? {},
      listeAdlari,
      info: {
        musteri: quote.musteri, proje: quote.proje,
        hazirlayan: quote.hazirlayan, gecerlilik: quote.gecerlilik,
        formatId: quote.formatId ?? null,
      },
    };
  }

  /** T13: onizleme duzenlemeleri teklif KATMANINA yazilir — format DEGISMEZ. */
  async saveOverrides(userId: string, id: string, overrides: ExportOverrides) {
    await this.quoteGetir(userId, id);
    await this.prisma.quote.update({
      where: { id },
      data: { exportOverrides: (overrides ?? {}) as any } as any,
    });
    return { ok: true };
  }

  /** .xlsx uret + REV artir + arsivle (T10). */
  async exportXlsx(userId: string, id: string): Promise<{ buffer: Buffer; filename: string; rev: number; quoteNo: string }> {
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
    return { buffer, filename, rev: yeniRev, quoteNo };
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

  /** T9: PDF — AYNI kurucudan (mevcut teklif durumu) uretilir.
   *  ONCE LibreOffice ile xlsx→pdf GERCEK gorunum (logolu kapak dahil,
   *  kullanici is akisi 20.07); soffice yoksa/basarisizsa HTML geri dususu
   *  (icerik/degerler yine birebir). */
  async exportPdfPro(userId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const quote = await this.quoteGetir(userId, id);
    const rev = Math.max(quote.rev ?? 0, 1);
    const sonuc = await this.ciktiKur(userId, quote, rev);

    const temizBaslikLO = String(quote.title ?? 'Teklif').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
    const pdfAdi = `${quote.quoteNo ?? 'TASLAK'} Rev.${String(rev).padStart(2, '0')} - ${temizBaslikLO}.pdf`;
    const xlsxBuf = Buffer.from(await sonuc.wb.xlsx.writeBuffer());
    const gercek = await xlsxToPdf(xlsxBuf);
    if (gercek) {
      console.log(`[Export] PDF (LibreOffice, gercek gorunum): ${pdfAdi} (${(gercek.length / 1024).toFixed(0)} KB)`);
      return { buffer: gercek, filename: pdfAdi };
    }
    console.warn('[Export] LibreOffice donusumu kullanilamadi — HTML geri dususu (dev ortami olabilir)');

    // Kapak/icmal sayfalari → basit tablo HTML (degerler sheetToGrid'den:
    // formul hucresi RESULT degerini verir → xlsx ile birebir)
    const fmtTR = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const kapakBloklari = sonuc.formatSayfalari.map((ad) => {
      const ws = sonuc.wb.getWorksheet(ad);
      if (!ws) return '';
      const grid = sheetToGrid(ws, false);
      const satirlar = grid.rowData.map((r) => {
        const hucreler = grid.columnDefs.map((c) => {
          const v = r[c.field];
          const s = typeof v === 'number' ? fmtTR(v) : String(v ?? '');
          return `<td style="padding:4px 10px;border:none">${s}</td>`;
        }).join('');
        return `<tr>${hucreler}</tr>`;
      }).join('');
      return `<section style="page-break-after:always"><h2 style="font-size:15px;margin-bottom:10px">${ad}</h2><table style="width:100%;border-collapse:collapse">${satirlar}</table></section>`;
    }).join('');

    const sheetsArray = Array.isArray(quote.sheets) ? (quote.sheets as any[]) : [];
    const listeBloklari = this.listeBloklariHtml(sheetsArray, fmtTR);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, sans-serif; font-size:12px; color:#1a1a1a; padding:32px; }
table { width:100%; border-collapse:collapse; margin-bottom:20px; }
th { background:#1f2937; color:#fff; padding:8px 10px; text-align:left; font-size:10px; }
td { padding:7px 10px; border-bottom:1px solid #e5e5e5; }
</style></head><body>${kapakBloklari}${listeBloklari}</body></html>`;

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
      const temizBaslik = String(quote.title ?? 'Teklif').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
      const filename = `${quote.quoteNo ?? 'TASLAK'} Rev.${String(rev).padStart(2, '0')} - ${temizBaslik}.pdf`;
      return { buffer: Buffer.from(pdf), filename };
    } finally {
      await browser.close();
    }
  }

  /** Liste sayfalari HTML bloklari (generatePdf ile ayni yapi — T2: ic
   *  bilgiler [kar/iskonto/maliyet] HICBIR kosulda yazilmaz). */
  private listeBloklariHtml(sheetsArray: any[], fmtTR: (v: number) => string): string {
    return sheetsArray
      .filter((s: any) => !s.isEmpty && Array.isArray(s.rowData) && s.rowData.length > 0)
      .map((s: any) => {
        const dataRows = (s.rowData as any[]).filter((r) => r._isDataRow);
        const roles = s.columnRoles || {};
        const nameF = roles.nameField; const qtyF = roles.quantityField; const unitF = roles.unitField;
        const matUpF = roles.materialUnitPriceField; const matTotF = roles.materialTotalField;
        const labUpF = roles.laborUnitPriceField; const labTotF = roles.laborTotalField;
        const hasMat = !!matUpF; const hasLab = !!labUpF;
        const rowsHtml = dataRows.map((r: any, i: number) => {
          const matUp = matUpF ? parseFloat(String(r[matUpF] ?? '')) || 0 : 0;
          const matTot = matTotF ? parseFloat(String(r[matTotF] ?? '')) || 0 : 0;
          const labUp = labUpF ? parseFloat(String(r[labUpF] ?? '')) || 0 : 0;
          const labTot = labTotF ? parseFloat(String(r[labTotF] ?? '')) || 0 : 0;
          return `<tr><td>${i + 1}</td><td>${(nameF ? r[nameF] : '') ?? ''}</td><td>${(unitF ? r[unitF] : '') ?? ''}</td><td>${(qtyF ? r[qtyF] : '') ?? ''}</td>
            ${hasMat ? `<td style="text-align:right">${matUp ? fmtTR(matUp) : ''}</td><td style="text-align:right">${matTot ? fmtTR(matTot) : ''}</td>` : ''}
            ${hasLab ? `<td style="text-align:right">${labUp ? fmtTR(labUp) : ''}</td><td style="text-align:right">${labTot ? fmtTR(labTot) : ''}</td>` : ''}
          </tr>`;
        }).join('');
        const sumMat = dataRows.reduce((sum: number, r: any) => sum + (matTotF ? parseFloat(String(r[matTotF] ?? '')) || 0 : 0), 0);
        const sumLab = dataRows.reduce((sum: number, r: any) => sum + (labTotF ? parseFloat(String(r[labTotF] ?? '')) || 0 : 0), 0);
        return `<section style="margin-bottom:24px">
          <h2 style="font-size:14px;margin-bottom:8px;padding:6px 10px;background:#1f2937;color:#fff">${s.name || ''}</h2>
          <table><thead><tr><th>#</th><th>Malzeme</th><th>Birim</th><th>Miktar</th>
            ${hasMat ? '<th>Malz. Br.</th><th>Malz. Top.</th>' : ''}
            ${hasLab ? '<th>İşç. Br.</th><th>İşç. Top.</th>' : ''}
          </tr></thead><tbody>${rowsHtml}</tbody>
          <tfoot><tr style="font-weight:bold;background:#f3f4f6">
            <td colspan="4" style="text-align:right">Sayfa Toplamı</td>
            ${hasMat ? `<td></td><td style="text-align:right">${fmtTR(sumMat)}</td>` : ''}
            ${hasLab ? `<td></td><td style="text-align:right">${fmtTR(sumLab)}</td>` : ''}
          </tr></tfoot></table></section>`;
      }).join('');
  }
}
