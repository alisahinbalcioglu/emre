import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Anthropic from '@anthropic-ai/sdk';
// watch-trigger: force NestJS reload
// pdf-parse v2 has breaking API changes — use safe wrapper
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Try pdf-parse v1 API (default export as function)
    const mod = require('pdf-parse');
    if (typeof mod === 'function') {
      const data = await mod(buffer);
      return data.text ?? '';
    }
    // Try pdf-parse v2 API (PDFParse class)
    if (mod.PDFParse) {
      const parser = new mod.PDFParse();
      // v2 API is unstable — skip and rely on Vision
      return '';
    }
    return '';
  } catch {
    return '';
  }
}
import * as XLSX from 'xlsx';

export interface ParsedMaterial {
  materialName: string;
  quantity: number;
  unit?: string;
}

export interface ParsedGlobalMaterial {
  materialName: string;
  unit: string;
  unitPrice: number;
}

// Token → USD maliyet tahmini (yaklaşık)
const COST_PER_1K: Record<string, { input: number; output: number }> = {
  claude: { input: 0.003, output: 0.015 },
  gemini: { input: 0.0001, output: 0.0004 },
  openrouter: { input: 0.003, output: 0.015 },
};

// Görev türleri
type AiTask = 'PDF_EXTRACTION' | 'EXCEL_MAPPING' | 'MATERIAL_PRICING' | 'QUOTE_ANALYSIS';

// Varsayılan görev → sağlayıcı eşleştirmesi
const DEFAULT_TASK_PROVIDERS: Record<AiTask, string> = {
  PDF_EXTRACTION: 'claude',
  EXCEL_MAPPING: 'gemini',
  MATERIAL_PRICING: 'gemini',
  QUOTE_ANALYSIS: 'claude',
};

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService) {}

  /** Görev bazlı sağlayıcı seç — DB'den oku, yoksa default kullan */
  async getProviderForTask(task: AiTask): Promise<{ provider: string; apiKey: string }> {
    const settings = await this.getSettings();

    // Görev bazlı ayar var mı? (örn: TASK_PDF_EXTRACTION = 'gemini')
    const taskSetting = settings[`TASK_${task}`];
    const provider = taskSetting || settings['ACTIVE_AI_PROVIDER'] || DEFAULT_TASK_PROVIDERS[task];

    const keyMap: Record<string, string> = {
      claude: settings['CLAUDE_API_KEY'] || '',
      gemini: settings['GEMINI_API_KEY'] || '',
      openrouter: settings['OPENROUTER_API_KEY'] || '',
    };

    const apiKey = keyMap[provider] || '';

    // Eğer seçilen provider'ın key'i yoksa, key'i olan başka bir provider'a düş
    if (!apiKey) {
      for (const [p, k] of Object.entries(keyMap)) {
        if (k) return { provider: p, apiKey: k };
      }
    }

    return { provider, apiKey };
  }

  /** Tüm görevlerin mevcut sağlayıcı atamasını döndür */
  async getTaskAssignments(): Promise<Record<string, { provider: string; hasKey: boolean }>> {
    const settings = await this.getSettings();
    const result: Record<string, { provider: string; hasKey: boolean }> = {};

    for (const task of Object.keys(DEFAULT_TASK_PROVIDERS) as AiTask[]) {
      const taskSetting = settings[`TASK_${task}`];
      const provider = taskSetting || DEFAULT_TASK_PROVIDERS[task];
      const keyMap: Record<string, string> = {
        claude: settings['CLAUDE_API_KEY'] || '',
        gemini: settings['GEMINI_API_KEY'] || '',
        openrouter: settings['OPENROUTER_API_KEY'] || '',
      };
      result[task] = { provider, hasKey: !!keyMap[provider] };
    }

    return result;
  }

  /** AI kullanımını veritabanına logla */
  private async logUsage(params: {
    feature: string;
    provider: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    success: boolean;
    errorMessage?: string;
  }): Promise<void> {
    try {
      const rates = COST_PER_1K[params.provider] ?? COST_PER_1K.claude;
      const inputCost = ((params.inputTokens ?? 0) / 1000) * rates.input;
      const outputCost = ((params.outputTokens ?? 0) / 1000) * rates.output;
      await this.prisma.aiUsageLog.create({
        data: {
          feature: params.feature,
          provider: params.provider,
          model: params.model,
          inputTokens: params.inputTokens ?? 0,
          outputTokens: params.outputTokens ?? 0,
          estimatedCost: Math.round((inputCost + outputCost) * 10000) / 10000,
          success: params.success,
          errorMessage: params.errorMessage,
        },
      });
    } catch (e) {
      console.error('[AiUsageLog] Log yazma hatasi:', (e as Error).message);
    }
  }

  // SystemSettings'den API key ve strateji oku
  private async getSettings(): Promise<Record<string, string>> {
    const settings = await this.prisma.systemSettings.findMany();
    const result: Record<string, string> = {};
    settings.forEach((s) => (result[s.key] = s.value));
    return result;
  }

  // Dosyadan metin cikar
  private async extractText(buffer: Buffer, mimetype: string): Promise<string> {
    if (mimetype === 'application/pdf' || mimetype === 'application/octet-stream') {
      const text = await extractPdfText(buffer);
      if (!text || text.trim().length < 10) {
        throw new BadRequestException('PDF okunamadi — metin icermiyor olabilir.');
      }
      return text;
    }

    // Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    return rows.map((r) => Object.values(r).join(' | ')).join('\n');
  }

  // Claude ile analiz et
  private async analyzeWithClaude(text: string, apiKey: string): Promise<ParsedMaterial[]> {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `Sen bir insaat/elektrik malzeme uzmanisin. Asagidaki metraj listesinden TUM malzeme isimlerini ve miktarlarini cikar.

SADECE su formatta JSON dondur, baska hicbir sey yazma:
[{"materialName": "malzeme adi", "quantity": 10, "unit": "adet"}]

Kurallar:
- materialName: orijinal dildeki tam malzeme adi (kisaltma acma)
- quantity: sayisal deger (0 ise 1 varsay)
- unit: adet, metre, kg, m2, m3 vb.
- Belirsiz satirlari atla

Metin:
${text.slice(0, 8000)}`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');
    return this.robustJsonParse<ParsedMaterial>(content.text);
  }

  // Gemini ile analiz et (REST API)
  private async analyzeWithGemini(text: string, apiKey: string): Promise<ParsedMaterial[]> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Sen bir insaat/elektrik malzeme uzmanisin. Asagidaki metraj listesinden TUM malzeme isimlerini ve miktarlarini cikar.

SADECE su formatta JSON dondur:
[{"materialName": "malzeme adi", "quantity": 10, "unit": "adet"}]

Metin:
${text.slice(0, 8000)}`,
            }],
          }],
          generationConfig: { temperature: 0.1 },
        }),
      },
    );
    const data: any = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Gemini API hatasi');
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return this.robustJsonParse<ParsedMaterial>(rawText);
  }

  // OpenRouter ile analiz et
  private async analyzeWithOpenRouter(text: string, apiKey: string): Promise<ParsedMaterial[]> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{
          role: 'user',
          content: `Sen bir insaat/elektrik malzeme uzmanisin. Asagidaki metraj listesinden TUM malzeme isimlerini ve miktarlarini cikar.

SADECE su formatta JSON dondur:
[{"materialName": "malzeme adi", "quantity": 10, "unit": "adet"}]

Metin:
${text.slice(0, 8000)}`,
        }],
        temperature: 0.1,
      }),
    });
    const data: any = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'OpenRouter API hatasi');
    const rawText = data.choices?.[0]?.message?.content || '';
    return this.robustJsonParse<ParsedMaterial>(rawText);
  }

  // Failover mantigi ile analiz
  private async analyzeWithFailover(
    text: string,
    settings: Record<string, string>,
  ): Promise<{ materials: ParsedMaterial[]; usedProvider: string }> {
    const active = settings['ACTIVE_AI_PROVIDER'] || 'claude';
    const failover = settings['AI_FAILOVER'] || 'disabled';

    const tryProvider = async (provider: string): Promise<ParsedMaterial[]> => {
      if (provider === 'claude') {
        const key = settings['CLAUDE_API_KEY'];
        if (!key) throw new Error('Claude API key tanimli degil');
        return this.analyzeWithClaude(text, key);
      }
      if (provider === 'gemini') {
        const key = settings['GEMINI_API_KEY'];
        if (!key) throw new Error('Gemini API key tanimli degil');
        return this.analyzeWithGemini(text, key);
      }
      if (provider === 'openrouter') {
        const key = settings['OPENROUTER_API_KEY'];
        if (!key) throw new Error('OpenRouter API key tanimli degil');
        return this.analyzeWithOpenRouter(text, key);
      }
      throw new Error(`Bilinmeyen provider: ${provider}`);
    };

    // Aktif provider'i dene
    try {
      const materials = await tryProvider(active);
      return { materials, usedProvider: active };
    } catch (primaryError) {
      if (failover === 'disabled') throw primaryError;

      // Failover provider belirle
      const failoverMap: Record<string, string> = {
        claude_to_gemini: 'gemini',
        claude_to_openrouter: 'openrouter',
        gemini_to_claude: 'claude',
      };
      const fallbackProvider = failoverMap[failover];
      if (!fallbackProvider) throw primaryError;

      try {
        const materials = await tryProvider(fallbackProvider);
        return { materials, usedProvider: `${fallbackProvider} (failover)` };
      } catch {
        throw primaryError;
      }
    }
  }

  // DB ile eslestirme
  private async matchWithDatabase(userId: string, materials: ParsedMaterial[]) {
    const [allMaterials, userLibrary, brands] = await Promise.all([
      this.prisma.material.findMany({
        include: { materialPrices: { include: { brand: true } } },
      }),
      this.prisma.userLibrary.findMany({
        where: { userId },
        include: { material: true, brand: true },
      }),
      this.prisma.brand.findMany(),
    ]);

    const rows = materials.map((item) => {
      const nameLower = item.materialName.toLowerCase();

      // 1. Kullanici kutuphanesinde ara
      const libItem = userLibrary.find(
        (l) => l.materialName?.toLowerCase() === nameLower,
      );

      // 2. Global DB'de ara (tam eslesme)
      let globalMat = allMaterials.find(
        (m) => m.name.toLowerCase() === nameLower,
      );

      // 3. Kismi eslesme dene
      if (!globalMat) {
        globalMat = allMaterials.find(
          (m) =>
            m.name.toLowerCase().includes(nameLower) ||
            nameLower.includes(m.name.toLowerCase()),
        );
      }

      let unitPrice = 0;
      let brandId: string | null = null;
      let brandName: string | null = null;
      let discount = 0;
      const availableBrands: { id: string; name: string; price: number }[] = [];

      if (globalMat) {
        globalMat.materialPrices.forEach((mp) => {
          availableBrands.push({ id: mp.brandId, name: mp.brand.name, price: mp.price });
        });
      }

      if (libItem) {
        brandId = libItem.brandId;
        brandName = libItem.brand?.name ?? null;
        discount = libItem.discountRate ?? 0;
        unitPrice = libItem.customPrice ?? availableBrands.find((b) => b.id === brandId)?.price ?? 0;
      } else if (availableBrands.length > 0) {
        brandId = availableBrands[0].id;
        brandName = availableBrands[0].name;
        unitPrice = availableBrands[0].price;
      }

      return {
        materialName: item.materialName,
        quantity: item.quantity || 1,
        unit: item.unit || 'adet',
        brandId,
        brandName,
        unitPrice,
        discount,
        profitMargin: 0,
        availableBrands,
        matched: !!(libItem || globalMat),
      };
    });

    return { rows, brands };
  }

  // ── Robust JSON Parser ──
  private robustJsonParse<T>(rawText: string): T[] {
    if (!rawText || !rawText.trim()) {
      throw new Error('AI bos yanit dondurdu');
    }

    let text = rawText.trim();

    // 1. Markdown code block cikar
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    }

    // 2. Kontrol karakterlerini temizle (tab ve newline haric)
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    // 3. Array baslangiç noktasini bul
    const startIdx = text.indexOf('[');
    if (startIdx === -1) {
      // Array yok — object icinde ara
      const objStart = text.indexOf('{');
      if (objStart !== -1) {
        try {
          const obj = JSON.parse(text.slice(objStart));
          for (const val of Object.values(obj)) {
            if (Array.isArray(val) && val.length > 0) return val as T[];
          }
        } catch { /* devam */ }
      }
      throw new Error('AI yanitinda JSON array bulunamadi');
    }

    // 4. [ isareti bulundu — sondan ] ara
    let jsonStr = text.slice(startIdx);

    // Direkt parse dene
    try {
      return JSON.parse(jsonStr);
    } catch (e1) {
      console.log('[JSON Parser] Direkt parse basarisiz:', (e1 as Error).message?.slice(0, 100));
    }

    // 5. Kesilmis JSON kurtarma: son gecerli } dan sonra ] ekle
    // Sondan geriye dogru son } yi bul
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace > 0) {
      const truncated = jsonStr.slice(0, lastBrace + 1) + ']';
      try {
        return JSON.parse(truncated);
      } catch (e2) {
        console.log('[JSON Parser] Truncated parse basarisiz:', (e2 as Error).message?.slice(0, 100));
      }

      // 6. Trailing comma temizle + tekrar dene
      const cleaned = truncated
        .replace(/,\s*\]/g, ']')
        .replace(/,\s*\}/g, '}');
      try {
        return JSON.parse(cleaned);
      } catch { /* devam */ }
    }

    // 7. Satir satir obje toplama (en guclu fallback)
    const items: T[] = [];
    // Her {...} blogunu bul
    const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    let match: RegExpExecArray | null;
    while ((match = objRegex.exec(jsonStr)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.materialName || parsed.name) {
          items.push(parsed);
        }
      } catch {
        // tek obje parse edemedik — atla
      }
    }
    if (items.length > 0) {
      console.log(`[JSON Parser] Obje-obje parse: ${items.length} item kurtarildi`);
      return items;
    }

    throw new Error(`AI yanitindan JSON ayiklanamadi (${rawText.length} karakter yanit). Son 100 char: ${rawText.slice(-100)}`);
  }

  // Generic AI call helpers (robust parser ile)
  private async callClaude<T>(prompt: string, apiKey: string): Promise<T[]> {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');
    return this.robustJsonParse<T>(content.text);
  }

  private async callGemini<T>(prompt: string, apiKey: string): Promise<T[]> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      },
    );
    const data: any = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Gemini API hatasi');
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return this.robustJsonParse<T>(rawText);
  }

  private async callOpenRouter<T>(prompt: string, apiKey: string): Promise<T[]> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });
    const data: any = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'OpenRouter API hatasi');
    const rawText = data.choices?.[0]?.message?.content || '';
    return this.robustJsonParse<T>(rawText);
  }

  async analyze(userId: string, buffer: Buffer, mimetype: string) {
    const settings = await this.getSettings();
    const active = settings['ACTIVE_AI_PROVIDER'];
    if (!active) {
      throw new BadRequestException(
        'AI saglayici ayarlanmamis. Admin panelinden API key ve aktif saglayici ayarlayin.',
      );
    }

    const text = await this.extractText(buffer, mimetype);
    if (!text || text.trim().length < 10) {
      throw new BadRequestException('Dosyadan metin cikarilamadi');
    }

    const { materials, usedProvider } = await this.analyzeWithFailover(text, settings);

    const result = await this.matchWithDatabase(userId, materials);
    return { ...result, usedProvider, totalFound: materials.length };
  }

  // ═══════════════════════════════════════════════════════════════
  //  AI-NATIVE EXCEL PARSER
  // ═══════════════════════════════════════════════════════════════

  /**
   * AI'ya Excel header + sample satırları gönder, sütun mapping'i al.
   */
  async mapExcelColumns(
    headers: string[],
    sampleRows: Record<string, any>[],
  ): Promise<{ materialName: string | null; quantity: string | null; unit: string | null; laborPrice: string | null }> {
    const { provider, apiKey } = await this.getProviderForTask('EXCEL_MAPPING');
    if (!apiKey) return { materialName: null, quantity: null, unit: null, laborPrice: null };

    const prompt = `Sen bir Türk mekanik/elektrik tesisat Excel dosya analiz uzmanısın.

SÜTUN BAŞLIKLARI: ${JSON.stringify(headers)}

İLK SATIRLAR:
${sampleRows.map((r, i) => `${i + 1}: ${JSON.stringify(r)}`).join('\n')}

Her sütunun ne anlama geldiğini belirle. SADECE JSON dön:
{"materialName":"sütun_adi","quantity":"sütun_adi","unit":"sütun_adi_veya_null","laborPrice":"sütun_adi_veya_null"}

KURALLAR:
- materialName: Malzeme/ürün ADI veya "YAPILACAK İMALAT" — uzun metinsel sütun. Sıra numarası (NO, POZ NO) DEĞİL.
- quantity: Miktar sütunu. Türkçe kısaltmalar: MİK, MIK, Miktar, ADET SAYISI, ADT.
- unit: Birim sütunu. Türkçe kısaltmalar: BR, BRM, BİRİM, Birim, ÖLÇÜ. İçindeki değerler: M, MT, Metre, AD, Adet, KG, TK, Set vs.
- laborPrice: İşçilik fiyatı. Yoksa null.
- Sütun adını AYNEN Excel'deki gibi, büyük-küçük harf dahil yaz.
- Sütun adı tek harf veya kısaltma olabilir (BR, P, F gibi). İçeriğine bakarak karar ver.`;

    console.log(`[AI MapCols] Task: EXCEL_MAPPING → Provider: ${provider}`);

    try {
      let text = '';
      if (provider === 'claude') {
        const client = new Anthropic({ apiKey });
        const msg = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 200, messages: [{ role: 'user', content: prompt }] });
        text = (msg.content[0] as any).text || '';
      } else if (provider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 200 } }),
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Gemini error');
        text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else if (provider === 'openrouter') {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'anthropic/claude-3.5-sonnet', messages: [{ role: 'user', content: prompt }], temperature: 0.1 }),
        });
        const data: any = await res.json();
        text = data.choices?.[0]?.message?.content || '';
      }

      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        await this.logUsage({ feature: 'excel_match', provider, inputTokens: 500, outputTokens: 50, success: true });
        return JSON.parse(match[0]);
      }
    } catch (e) {
      console.error(`[AI MapCols] ${provider} error:`, (e as Error).message);
      await this.logUsage({ feature: 'excel_match', provider, success: false, errorMessage: (e as Error).message });
    }

    return { materialName: null, quantity: null, unit: null, laborPrice: null };
  }

  // ── Global malzeme havuzu icin PDF ayiklama (Vision + text destegi) ──
  async extractGlobalMaterials(buffer: Buffer): Promise<{ materials: ParsedGlobalMaterial[]; usedProvider: string }> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Dosya bos (0 byte). Lutfen gecerli bir PDF yukleyin.');
    }
    if (buffer.length < 100) {
      throw new BadRequestException('Dosya cok kucuk, gecerli bir PDF olmayabilir.');
    }
    const headerStr = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('latin1');
    if (headerStr.includes('/Encrypt')) {
      throw new BadRequestException('PDF sifreli gorunuyor. Lutfen sifresiz bir PDF yukleyin.');
    }

    const settings = await this.getSettings();
    const active = settings['ACTIVE_AI_PROVIDER'];
    if (!active) {
      throw new BadRequestException('AI saglayici ayarlanmamis. API key ve aktif saglayici ayarlayin.');
    }

    let textFallback = '';
    try {
      textFallback = await extractPdfText(buffer);
    } catch {
      // sorun degil — Vision modu devrede
    }

    const GLOBAL_PROMPT = `Sen bir fiyat listesi ayiklama uzmanisin. Bu dokuman bir malzeme/urun fiyat listesi (PDF).
Gorevin: dokumandaki TUM malzemeleri ve fiyatlarini eksiksiz olarak cikar.

KRITIK TALIMATLAR:
1. Dokumandaki HER sayfayi, HER tabloyu, HER satiri tara. HICBIR satiri atlama.
2. Tablolar birden fazla sutun icinde yan yana dizilmis olabilir — hepsini oku.
3. Tablolar birden fazla sayfaya yayilmis olabilir — hepsini oku.
4. Fiyatlar bazen ayri bir sutunda, bazen urun adinin yaninda olabilir — hepsini yakala.
5. Grup basliklari altindaki tum alt kalemleri dahil et.
6. Ara toplam ve genel toplam satirlarini ATLA, ama malzeme satirlarini ATLA-MA.

Ciktini SADECE JSON array olarak ver. Baska HICBIR sey yazma — aciklama, yorum, baslik YAZMA.
Yanitinin tamami [ ile baslamali ve ] ile bitmeli.

Format:
[{"materialName": "urun adi", "unit": "Adet", "unitPrice": 450.00}]

Kurallar:
- materialName: urunu/malzemeyi tanimlayan metin. PDF'deki orijinal adi oldugu gibi yaz, kisaltma acma.
  Ornek: "Pn16 Kuresel Vana 1/2" veya "PPR Boru 20mm PN20" gibi tam adi yaz.
- unit: Birim (Adet, Metre, Takim, kg, m2, m3, Lt, Set, Kutu, Paket vb). Bulamazsan "Adet" yaz.
- unitPrice: Fiyat. SADECE sayi. TL/$/ isareti koyma. Turkce format "1.234,56" ise 1234.56 yaz.
  Binlik ayiraci nokta, ondalik virgul olan Turkce formati DOGRU cevir: 12.500,00 → 12500.00
- Fiyati 0 veya bos olan satirlari ATLA.
- Baslik satirlarini ATLA (ornek: "URUN ADI | BIRIM | FIYAT" gibi basliklar).
- "TOPLAM", "ARA TOPLAM", "KDV" gibi ozet satirlarini ATLA.
- Ayni urun farkli cap/boyutlarda listeleniyorsa (1/2", 3/4", 1" gibi) HER birini ayri satir olarak yaz.

ONEMLI: Eksik malzeme kabul edilemez. Dokumandaki malzeme sayisi ne kadarsa, o kadar JSON objesi dondur.`;

    const claudeKey = settings['CLAUDE_API_KEY'];
    const geminiKey = settings['GEMINI_API_KEY'];

    // Deneme 1: Claude Vision (PDF document olarak)
    if (active === 'claude' && claudeKey) {
      try {
        console.log('[AI] Claude Vision deneniyor...');
        const raw = await this.callClaudeVision(buffer, GLOBAL_PROMPT, claudeKey);
        const cleaned = this.cleanExtractedPrices(raw);
        if (cleaned.length > 0) {
          console.log(`[AI] Claude Vision basarili: ${cleaned.length} malzeme`);
          await this.logUsage({ feature: 'pdf_parse', provider: 'claude', model: 'claude-sonnet-4-6', inputTokens: 1000, outputTokens: cleaned.length * 30, success: true });
          return { materials: cleaned, usedProvider: 'claude (vision)' };
        }
        console.log('[AI] Claude Vision sonuc bos, text fallback deneniyor...');
      } catch (visionErr) {
        console.error('[AI] Claude Vision hatasi:', (visionErr as Error).message);
      }
    }

    // Deneme 2: Claude Text (metin cikarilmissa)
    if (active === 'claude' && claudeKey && textFallback.trim().length > 20) {
      try {
        console.log('[AI] Claude Text deneniyor...');
        const prompt = `${GLOBAL_PROMPT}\n\nAsagidaki metin bir PDF fiyat listesinden cikarilmistir:\n\n${textFallback.slice(0, 30000)}`;
        const raw = await this.callClaude<ParsedGlobalMaterial>(prompt, claudeKey);
        const cleaned = this.cleanExtractedPrices(raw);
        if (cleaned.length > 0) {
          console.log(`[AI] Claude Text basarili: ${cleaned.length} malzeme`);
          await this.logUsage({ feature: 'pdf_parse', provider: 'claude', model: 'claude-sonnet-4-6', inputTokens: Math.round(textFallback.length / 4), outputTokens: cleaned.length * 30, success: true });
          return { materials: cleaned, usedProvider: 'claude (text)' };
        }
      } catch (textErr) {
        console.error('[AI] Claude Text hatasi:', (textErr as Error).message);
      }
    }

    // Deneme 3: Gemini Vision
    if (geminiKey) {
      try {
        console.log('[AI] Gemini Vision deneniyor...');
        const raw = await this.callGeminiVision(buffer, GLOBAL_PROMPT, geminiKey);
        const cleaned = this.cleanExtractedPrices(raw);
        if (cleaned.length > 0) {
          console.log(`[AI] Gemini Vision basarili: ${cleaned.length} malzeme`);
          await this.logUsage({ feature: 'pdf_parse', provider: 'gemini', model: 'gemini-2.5-flash', inputTokens: 1000, outputTokens: cleaned.length * 30, success: true });
          return { materials: cleaned, usedProvider: 'gemini (vision, failover)' };
        }
      } catch (gemErr) {
        console.error('[AI] Gemini Vision hatasi:', (gemErr as Error).message);
      }
    }

    // Deneme 4: Gemini Text
    if (geminiKey && textFallback.trim().length > 20) {
      try {
        console.log('[AI] Gemini Text deneniyor...');
        const prompt = `${GLOBAL_PROMPT}\n\nMetin:\n${textFallback.slice(0, 30000)}`;
        const raw = await this.callGemini<ParsedGlobalMaterial>(prompt, geminiKey);
        const cleaned = this.cleanExtractedPrices(raw);
        if (cleaned.length > 0) {
          console.log(`[AI] Gemini Text basarili: ${cleaned.length} malzeme`);
          await this.logUsage({ feature: 'pdf_parse', provider: 'gemini', model: 'gemini-2.5-flash', inputTokens: Math.round(textFallback.length / 4), outputTokens: cleaned.length * 30, success: true });
          return { materials: cleaned, usedProvider: 'gemini (text, failover)' };
        }
      } catch (gemTextErr) {
        console.error('[AI] Gemini Text hatasi:', (gemTextErr as Error).message);
      }
    }

    // Hepsi basarisiz — detayli hata
    const hasText = textFallback.trim().length > 20;
    const detail = hasText
      ? `PDF metin iceriyor (${textFallback.trim().length} karakter) ama AI fiyat verisi bulamadi.`
      : 'PDF metin icermiyor (taranmis/gorsel PDF olabilir) ve Vision modu basarisiz oldu.';
    await this.logUsage({ feature: 'pdf_parse', provider: active, success: false, errorMessage: detail });
    throw new BadRequestException(
      `PDF'den malzeme ayiklanamadi. ${detail} Lutfen farkli bir PDF deneyin veya Excel olarak yukleyin.`,
    );
  }

  // Claude Vision: PDF'i dogrudan base64 olarak gonder
  private async callClaudeVision(pdfBuffer: Buffer, prompt: string, apiKey: string): Promise<ParsedGlobalMaterial[]> {
    const base64 = pdfBuffer.toString('base64');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    const data: any = await response.json();
    if (!response.ok) {
      const errMsg = data?.error?.message || JSON.stringify(data);
      console.error('[Claude Vision] API Error:', response.status, errMsg);
      throw new Error(`Claude Vision API: ${errMsg}`);
    }
    const text = data?.content?.[0]?.text || '';
    console.log('[Claude Vision] Yanit uzunlugu:', text.length, '| Ilk 200 char:', text.slice(0, 200));
    return this.robustJsonParse<ParsedGlobalMaterial>(text);
  }

  // Gemini Vision: PDF inline data
  private async callGeminiVision(pdfBuffer: Buffer, prompt: string, apiKey: string): Promise<ParsedGlobalMaterial[]> {
    const base64 = pdfBuffer.toString('base64');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: base64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
        }),
      },
    );
    const data: any = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Gemini Vision hatasi');
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return this.robustJsonParse<ParsedGlobalMaterial>(rawText);
  }

  // Fiyat temizligi: TL, $, €, nokta/virgul ayiklama
  private cleanExtractedPrices(materials: ParsedGlobalMaterial[]): ParsedGlobalMaterial[] {
    return materials
      .map((m) => {
        let priceStr = String(m.unitPrice ?? '');
        priceStr = priceStr.replace(/[TLtl$€₺\s]/g, '');
        if (priceStr.includes(',') && priceStr.includes('.')) {
          const lastComma = priceStr.lastIndexOf(',');
          const lastDot = priceStr.lastIndexOf('.');
          if (lastComma > lastDot) {
            priceStr = priceStr.replace(/\./g, '').replace(',', '.');
          } else {
            priceStr = priceStr.replace(/,/g, '');
          }
        } else if (priceStr.includes(',')) {
          priceStr = priceStr.replace(',', '.');
        }
        const price = parseFloat(priceStr);
        if (!m.materialName?.trim() || isNaN(price) || price <= 0) return null;
        return {
          materialName: m.materialName.trim(),
          unit: m.unit?.trim() || 'Adet',
          unitPrice: Math.round(price * 100) / 100,
        };
      })
      .filter((m): m is ParsedGlobalMaterial => m !== null);
  }
}
