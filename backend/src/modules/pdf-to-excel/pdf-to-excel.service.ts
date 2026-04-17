import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AiService } from '../../ai/ai.service';

/**
 * PDF'den malzeme ayiklama ve Excel'e cevirme servisi.
 * Normal kullanici (admin olmayan) icin tasarlandi — admin panel
 * bagimlisi degildir. AI parse sonucu Excel olarak indirilir,
 * kullanici elle kontrol/duzeltme yapar, sonra normal Excel upload
 * akisiyla sisteme yukler.
 */
@Injectable()
export class PdfToExcelService {
  constructor(private readonly aiService: AiService) {}

  async convert(fileBuffer: Buffer, brandName?: string): Promise<Buffer> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('PDF dosyasi bos.');
    }

    // AI ile PDF'den malzeme ayikla (mevcut extractGlobalMaterials)
    const { materials, usedProvider } =
      await this.aiService.extractGlobalMaterials(fileBuffer);

    if (!materials || materials.length === 0) {
      throw new BadRequestException('PDF\'den malzeme ayiklanamadi.');
    }

    // Excel olustur — basit duz tablo: Malzeme Adi | Birim | Birim Fiyat
    const header = ['Malzeme Adi', 'Birim', 'Birim Fiyat (TL)'];
    const rows: (string | number)[][] = [header];
    for (const m of materials) {
      rows.push([
        m.materialName ?? '',
        m.unit ?? 'Adet',
        Number(m.unitPrice ?? 0),
      ]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    // Kolon genislikleri (yaklasik)
    worksheet['!cols'] = [{ wch: 60 }, { wch: 10 }, { wch: 15 }];

    // Fiyat kolonu icin sayi formati (basit)
    for (let r = 2; r <= rows.length; r++) {
      const cellRef = `C${r}`;
      if (worksheet[cellRef]) {
        (worksheet[cellRef] as any).t = 'n';
        (worksheet[cellRef] as any).z = '#,##0.00';
      }
    }

    const workbook = XLSX.utils.book_new();
    const sheetName = (brandName?.trim() || 'Fiyat Listesi').slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    console.log(
      `[PdfToExcel] ${materials.length} malzeme Excel'e yazildi (provider: ${usedProvider})`,
    );

    const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buf);
  }
}
