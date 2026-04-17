import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as XLSX from 'xlsx';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface ExcelRow {
  [key: string]: any;
}

// ────────────────────────────────────────────
// Service
// ────────────────────────────────────────────

@Injectable()
export class ExcelEngineService {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════
  // 1. ANALYZE — Excel yukle, aynen dondur
  // ═══════════════════════════════════════════

  async analyze(userId: string, fileBuffer: Buffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Raw array oku — merge sorunu olmaz
    const rawGrid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rawGrid.length < 2) throw new BadRequestException('Excel dosyasi bos.');

    // Ilk 20 satiri Gemini'ye gonder — header satiri + kolon rolleri
    const sample = rawGrid.slice(0, Math.min(20, rawGrid.length));
    const geminiKey = await this.getGeminiKey();
    const geminiResult = await this.askGeminiHeaderAndRoles(geminiKey, sample);

    console.log(`[ExcelEngine] Gemini: headerRow=${geminiResult.headerRowIndex}, cols=${geminiResult.columns.length}`);

    // Header satirindan kolon isimlerini al
    const headerRow = rawGrid[geminiResult.headerRowIndex];
    const columns = geminiResult.columns;

    // headers + columnRoles olustur
    const headers: string[] = [];
    const columnRoles: Record<string, string> = {};
    const colIndexMap: number[] = [];

    for (const col of columns) {
      const name = String(headerRow[col.index] ?? col.label).trim() || col.label;
      headers.push(name);
      colIndexMap.push(col.index);
      if (col.role !== 'other') columnRoles[name] = col.role;
    }

    // Data satirlarini oku (eski sistem — sadece dolu satirlar)
    const dataRows = rawGrid.slice(geminiResult.headerRowIndex + 1);
    const rows: ExcelRow[] = [];
    for (const raw of dataRows) {
      if (!raw.some((c: any) => c !== '' && c != null)) continue;
      const obj: ExcelRow = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = raw[colIndexMap[i]] ?? '';
      }
      rows.push(obj);
    }

    // Eksik rolleri deterministik fallback ile doldur
    for (const h of headers) {
      if (columnRoles[h]) continue; // zaten role atanmis
      const hn = this.normalize(h);
      if (/sira|^no$/.test(hn) && !Object.values(columnRoles).includes('no')) columnRoles[h] = 'no';
      else if (/imalat|tanim|desc|malzeme\s*ad|cinsi|aciklama/.test(hn) && !Object.values(columnRoles).includes('name')) columnRoles[h] = 'name';
      else if (/miktar|^mik$|qty|quantity/.test(hn) && !Object.values(columnRoles).includes('quantity')) columnRoles[h] = 'quantity';
      else if (/^birim$|^br$|^brm$|^unit$/.test(hn) && !Object.values(columnRoles).includes('unit')) columnRoles[h] = 'unit';
      else if (/marka|brand/.test(hn) && !Object.values(columnRoles).includes('brand')) columnRoles[h] = 'brand';
      else if (/birim\s*fiyat|br\.\s*fiyat|unit\s*price|^malzeme$/.test(hn) && !Object.values(columnRoles).includes('price')) columnRoles[h] = 'price';
      else if (/tutar|toplam|total|amount/.test(hn) && !Object.values(columnRoles).includes('total')) columnRoles[h] = 'total';
      else if (/iscilik|labor/.test(hn) && !Object.values(columnRoles).includes('labor_price')) columnRoles[h] = 'labor_price';
    }

    console.log(`[ExcelEngine] ${rows.length} satir, ${headers.length} sutun, roles: ${JSON.stringify(columnRoles)}`);

    const brands = await this.prisma.brand.findMany({ select: { id: true, name: true } });
    return { headers, rows, brands, columnRoles };
  }

  // ────────────────────────────────────────────
  // PRIVATE: Helpers
  // ────────────────────────────────────────────

  private async getGeminiKey(): Promise<string> {
    const settings = await this.prisma.systemSettings.findMany();
    const map: Record<string, string> = {};
    settings.forEach((s) => (map[s.key] = s.value));
    return map['GEMINI_API_KEY'] || '';
  }

  /**
   * normalize — SADECE fallback header/kolon tespitinde kullanilir.
   * Eslestirme amacli KULLANILMAZ (PRD geregi tum eslestirme LLM ile yapilir).
   */
  private normalize(s: string): string {
    return s
      .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
      .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c')
      .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ğĞ]/g, 'g')
      .toLowerCase()
      .replace(/i\u0307/g, 'i')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ────────────────────────────────────────────
  // Gemini: Header satiri + kolon rolleri (tek soru)
  // ────────────────────────────────────────────

  private async askGeminiHeaderAndRoles(
    apiKey: string,
    sampleRows: any[][],
  ): Promise<{ headerRowIndex: number; columns: { index: number; label: string; role: string }[] }> {
    const gridText = sampleRows.map((row, i) => `Row ${i}: ${JSON.stringify(row)}`).join('\n');

    const prompt = `Excel dosyasinin ilk satirlari (raw array):

${gridText}

GOREV:
1. Gercek header (baslik) satirinin indeksini bul — sutun isimleri iceren satir.
2. Her kolonun indeksini, adini ve rolunu belirle.
3. Bos kolonlari dahil etme.
4. Ayni isimli birden fazla kolon varsa (merge'li basliklar), ust/alt satirdan kategori ekle.

JSON dondur: {"headerRowIndex":N,"columns":[{"index":0,"label":"Ad","role":"rol"}]}
Roller: no, name, brand, quantity, unit, price, total, labor_price, labor_total, grand_total, other
Kurallar:
- name = malzeme/is aciklamasi (en uzun metin kolonu)
- quantity = miktar (MiKTAR, MiK, QTY)
- unit = birim (BiRiM, BR, UNIT)
- price = birim fiyat
- total = tutar/toplam
- Turkce ve Ingilizce Excel olabilir`;

    if (!apiKey) return this.fallbackHeaderDetection(sampleRows);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1500 },
          }),
        },
      );
      const data: any = await res.json();
      if (!res.ok) {
        console.error('[ExcelEngine] Gemini error:', data.error?.message);
        return this.fallbackHeaderDetection(sampleRows);
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) return this.fallbackHeaderDetection(sampleRows);

      const parsed = JSON.parse(match[0]);
      if (typeof parsed.headerRowIndex !== 'number' || !Array.isArray(parsed.columns)) {
        return this.fallbackHeaderDetection(sampleRows);
      }
      console.log(`[ExcelEngine] Gemini header: row ${parsed.headerRowIndex}, ${parsed.columns.length} cols`);
      return parsed;
    } catch (e) {
      console.error('[ExcelEngine] Gemini header error:', (e as Error).message);
      return this.fallbackHeaderDetection(sampleRows);
    }
  }

  private fallbackHeaderDetection(sampleRows: any[][]): { headerRowIndex: number; columns: { index: number; label: string; role: string }[] } {
    // En cok dolu hucreye sahip satir = header
    let bestIdx = 0, bestCount = 0;
    for (let i = 0; i < sampleRows.length; i++) {
      const count = sampleRows[i].filter((c) => String(c ?? '').trim().length > 0).length;
      if (count > bestCount) { bestCount = count; bestIdx = i; }
    }
    const headerRow = sampleRows[bestIdx];
    const columns = headerRow
      .map((cell: any, idx: number) => ({ index: idx, label: String(cell ?? '').trim(), role: 'other' }))
      .filter((c: any) => c.label.length > 0);
    return { headerRowIndex: bestIdx, columns };
  }
}
