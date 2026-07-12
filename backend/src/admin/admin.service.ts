import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import {
  buildMaterialContextFromRows,
  ColumnRoles,
  RowData,
} from '../utils/build-material-context';
import {
  parseTrNumber,
  walkCategories,
  detectExtraRoles,
  ImportRowView,
} from '../utils/import-fidelity';

export interface MaterialSheetInput {
  name: string;
  index?: number;
  rowData: RowData[];
  columnRoles: ColumnRoles;
  isEmpty?: boolean;
  // Y2 (kaynak sadakati): header adlari — cins/cap rol tespiti + ek sutunlarin
  // (role oturmayanlarin) EK ALAN olarak korunmasi icin
  columnDefs?: { field: string; headerName: string }[];
}

@Injectable()
export class AdminService {
  private readonly SENSITIVE_KEYS = ['CLAUDE_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY'];

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private exchangeRates: ExchangeRatesService,
  ) {}

  // ═════════ USERS ═════════

  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true, email: true, role: true, status: true, tier: true, createdAt: true,
        _count: { select: { quotes: true, library: true } },
        subscriptions: {
          select: { id: true, level: true, scope: true, active: true, endsAt: true },
          where: { active: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUserRole(id: string, role: 'admin' | 'user') {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id }, data: { role },
      select: { id: true, email: true, role: true, status: true },
    });
  }

  async updateUserStatus(id: string, status: 'active' | 'banned') {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id }, data: { status },
      select: { id: true, email: true, role: true, status: true },
    });
  }

  async updateUserTier(id: string, tier: 'core' | 'pro' | 'suite') {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id }, data: { tier },
      select: { id: true, email: true, role: true, tier: true, status: true },
    });
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.delete({ where: { id } });
  }

  async getUserSubscriptions(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.userSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addUserSubscription(
    userId: string,
    level: 'core' | 'pro',
    scope: 'mechanical' | 'electrical' | 'mep',
    endsAt?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!['core', 'pro'].includes(level)) throw new BadRequestException('Gecersiz level');
    if (!['mechanical', 'electrical', 'mep'].includes(scope)) throw new BadRequestException('Gecersiz scope');

    return this.prisma.userSubscription.upsert({
      where: { userId_level_scope: { userId, level, scope } },
      create: {
        userId, level, scope,
        endsAt: endsAt ? new Date(endsAt) : null,
        active: true,
      },
      update: {
        active: true,
        endsAt: endsAt ? new Date(endsAt) : null,
      },
    });
  }

  async removeUserSubscription(userId: string, subId: string) {
    const sub = await this.prisma.userSubscription.findUnique({ where: { id: subId } });
    if (!sub || sub.userId !== userId) throw new NotFoundException('Subscription not found');
    return this.prisma.userSubscription.delete({ where: { id: subId } });
  }

  // ═════════ STATS ═════════

  async getStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      userCount, brandCount, materialCount, quoteCount, priceListCount,
      usersThisMonth, usersPrevMonth,
      quotesThisMonth, quotesPrevMonth,
      activeUsersThisMonth, activeUsersPrevMonth,
      dailyQuotes, libraryByBrand,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.brand.count(),
      this.prisma.material.count(),
      this.prisma.quote.count(),
      this.prisma.priceList.count(),
      // Aylik trendler (onceki aya gore %)
      this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: prevMonthStart, lt: monthStart } } }),
      this.prisma.quote.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.quote.count({ where: { createdAt: { gte: prevMonthStart, lt: monthStart } } }),
      // Aktif kullanici = bu ay teklif olusturan DISTINCT kullanici
      this.prisma.quote.findMany({
        where: { createdAt: { gte: monthStart } },
        distinct: ['userId'], select: { userId: true },
      }),
      this.prisma.quote.findMany({
        where: { createdAt: { gte: prevMonthStart, lt: monthStart } },
        distinct: ['userId'], select: { userId: true },
      }),
      // Son 30 gun: gun bazinda teklif sayisi (line chart)
      this.prisma.$queryRaw<Array<{ d: string; c: number }>>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS d,
               COUNT(*)::int AS c
        FROM "Quote"
        WHERE "createdAt" >= ${days30Ago}
        GROUP BY 1
      `,
      // Kutuphaneye aktarim: marka bazinda UserLibrary satir sayisi (Top 5)
      this.prisma.userLibrary.groupBy({
        by: ['brandId'],
        _count: { _all: true },
        orderBy: { _count: { brandId: 'desc' } },
        take: 5,
      }),
    ]);

    // % degisim helper — onceki donem 0 ise: yeni veri varsa +100, yoksa 0
    const pct = (cur: number, prev: number): number =>
      prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

    // 30 gunluk seri — bos gunler 0 ile doldurulur (grafik surekli olsun)
    const byDay = new Map(dailyQuotes.map((r) => [r.d, Number(r.c)]));
    const quoteTrend: Array<{ date: string; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      quoteTrend.push({
        date: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`,
        count: byDay.get(key) ?? 0,
      });
    }

    // Top-5 marka isimleri (tek sorgu)
    const topBrandIds = libraryByBrand.map((r) => r.brandId);
    const topBrandRows = topBrandIds.length
      ? await this.prisma.brand.findMany({
          where: { id: { in: topBrandIds } },
          select: { id: true, name: true },
        })
      : [];
    const brandById = new Map(topBrandRows.map((b) => [b.id, b.name]));
    const topBrands = libraryByBrand
      .map((r) => ({ name: brandById.get(r.brandId) ?? 'Bilinmeyen', count: r._count._all }))
      .sort((a, b) => b.count - a.count);

    // Disiplin dagilimi — kutuphanede FIILEN kullanilan malzemelerin markalari
    // uzerinden (teklif item'inda disiplin alani yok; en anlamli gercek veri bu)
    const discAgg = await this.prisma.$queryRaw<Array<{ discipline: string; c: number }>>`
      SELECT b.discipline AS discipline, COUNT(*)::int AS c
      FROM "UserLibrary" ul
      JOIN "Brand" b ON b.id = ul."brandId"
      GROUP BY 1
    `;
    const disciplineSplit = discAgg.map((r) => ({
      name: r.discipline === 'electrical' ? 'Elektrik' : 'Mekanik',
      value: Number(r.c),
    }));

    const activeCur = activeUsersThisMonth.length;
    const activePrev = activeUsersPrevMonth.length;
    const activeUserRate = userCount > 0 ? Math.round((activeCur / userCount) * 100) : 0;

    return {
      // Mevcut alanlar (geriye uyum)
      userCount, brandCount, materialCount, quoteCount, priceListCount,
      // GERCEK zaman-serisi/aggregation alanlari — Istatistikler sayfasi
      trends: {
        users: pct(usersThisMonth, usersPrevMonth),
        quotes: pct(quotesThisMonth, quotesPrevMonth),
        // Brand modelinde createdAt yok — trend hesaplanamiyor (durust null)
        brands: null as number | null,
        activeUsers: pct(activeCur, activePrev),
      },
      activeUserRate,
      quoteTrend,
      disciplineSplit,
      topBrands,
    };
  }

  // ═════════ AI TASKS / STATS / HEALTH ═════════

  async getAiTasks() {
    return this.aiService.getTaskAssignments();
  }

  async updateAiTask(task: string, provider: string) {
    const key = `TASK_${task}`;
    await this.prisma.systemSettings.upsert({
      where: { key },
      update: { value: provider },
      create: { key, value: provider },
    });
    return this.getAiTasks();
  }

  async getAiStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const logs = await this.prisma.aiUsageLog.findMany({
      where: { createdAt: { gte: monthStart } },
    });
    const pdfLogs = logs.filter((l) => l.feature === 'pdf_parse');
    const excelLogs = logs.filter((l) => l.feature === 'excel_match');
    const quoteLogs = logs.filter((l) => l.feature === 'quote_analyze');
    const sumTokens = (arr: typeof logs) => arr.reduce((s, l) => s + l.inputTokens + l.outputTokens, 0);
    const sumCost = (arr: typeof logs) => arr.reduce((s, l) => s + l.estimatedCost, 0);
    return {
      period: { from: monthStart.toISOString(), to: now.toISOString() },
      pdf: {
        totalCalls: pdfLogs.length,
        successCalls: pdfLogs.filter((l) => l.success).length,
        totalTokens: sumTokens(pdfLogs),
        estimatedCost: Math.round(sumCost(pdfLogs) * 10000) / 10000,
      },
      excel: {
        totalCalls: excelLogs.length,
        successCalls: excelLogs.filter((l) => l.success).length,
        totalTokens: sumTokens(excelLogs),
        estimatedCost: Math.round(sumCost(excelLogs) * 10000) / 10000,
      },
      quote: {
        totalCalls: quoteLogs.length,
        successCalls: quoteLogs.filter((l) => l.success).length,
        totalTokens: sumTokens(quoteLogs),
        estimatedCost: Math.round(sumCost(quoteLogs) * 10000) / 10000,
      },
      total: {
        totalCalls: logs.length,
        totalTokens: sumTokens(logs),
        estimatedCost: Math.round(sumCost(logs) * 10000) / 10000,
      },
    };
  }

  async checkAiHealth(provider: string): Promise<any> {
    const settings = await this.getRawSettings();
    if (provider === 'claude') {
      const key = settings['CLAUDE_API_KEY'];
      if (!key) return { provider, status: 'no_key', message: 'API key girilmemiş' };
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] }),
        });
        if (res.ok) return { provider, status: 'active', message: 'Bağlantı başarılı' };
        const err: any = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        if (msg.includes('credit balance')) return { provider, status: 'no_credit', message: 'Kredi yetersiz' };
        return { provider, status: 'error', message: msg };
      } catch (e) {
        return { provider, status: 'error', message: (e as Error).message };
      }
    }
    if (provider === 'gemini') {
      const key = settings['GEMINI_API_KEY'];
      if (!key) return { provider, status: 'no_key', message: 'API key girilmemiş' };
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 5 } }),
          },
        );
        if (res.ok) return { provider, status: 'active', message: 'Bağlantı başarılı' };
        const err: any = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        if (msg.includes('quota') || msg.includes('exceeded')) return { provider, status: 'no_credit', message: 'Kota dolmuş' };
        return { provider, status: 'error', message: msg };
      } catch (e) {
        return { provider, status: 'error', message: (e as Error).message };
      }
    }
    if (provider === 'openrouter') {
      const key = settings['OPENROUTER_API_KEY'];
      if (!key) return { provider, status: 'no_key', message: 'API key girilmemiş' };
      try {
        const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.ok) {
          const data: any = await res.json();
          const remaining = data?.data?.limit_remaining;
          return {
            provider, status: 'active', message: 'Bağlantı başarılı',
            balance: remaining != null ? `$${(remaining / 100).toFixed(2)}` : undefined,
          };
        }
        return { provider, status: 'error', message: `HTTP ${res.status}` };
      } catch (e) {
        return { provider, status: 'error', message: (e as Error).message };
      }
    }
    return { provider, status: 'unknown', message: 'Bilinmeyen sağlayıcı' };
  }

  // ═════════ SETTINGS ═════════

  private async getRawSettings(): Promise<Record<string, string>> {
    const settings = await this.prisma.systemSettings.findMany();
    const result: Record<string, string> = {};
    settings.forEach((s) => (result[s.key] = s.value));
    return result;
  }

  async getSettings(): Promise<Record<string, string>> {
    const result = await this.getRawSettings();
    for (const key of this.SENSITIVE_KEYS) {
      if (result[key]) {
        result[key] = result[key].slice(0, 4) + '••••••••' + result[key].slice(-4);
      }
    }
    return result;
  }

  async updateSettings(data: Record<string, string>) {
    const ops = Object.entries(data).map(([key, value]) =>
      this.prisma.systemSettings.upsert({ where: { key }, update: { value }, create: { key, value } }),
    );
    await Promise.all(ops);
    return this.getSettings();
  }

  // ═════════ PRICE LISTS ═════════

  async createPriceList(brandId: string, name: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadi');
    return this.prisma.priceList.create({ data: { name, brandId } });
  }

  async deletePriceList(id: string) {
    const pl = await this.prisma.priceList.findUnique({ where: { id } });
    if (!pl) throw new NotFoundException('Liste bulunamadi');
    return this.prisma.priceList.delete({ where: { id } });
  }

  // ═════════ MATERIALS: PDF EXTRACT ═════════

  async extractMaterialsPdf(fileBuffer: Buffer) {
    return this.aiService.extractGlobalMaterials(fileBuffer);
  }

  // ═════════ MATERIALS: SAVE BULK (from PDF extraction) ═════════

  // ═════════ MATERIALS: PRICE LIST EXCEL IMPORT ═════════

  /**
   * Admin fiyat listesine Excel'den toplu malzeme yukleme.
   *
   * Kesif Excel'inden FARKLI yapi: fiyat listesinde Miktar kolonu YOKTUR
   * (o yuzden excelGridService.prepare kullanilamaz — quantity'siz sheet'i
   * "bos" sayar). Beklenen kolonlar: Malzeme/Urun Adi + Liste/Birim Fiyat
   * (+ opsiyonel Malzeme Kodu, Birim, Para Birimi).
   *
   * USD/EUR fiyatlar TCMB kuru ile TL'ye cevrilir. Kayit, mevcut
   * saveBulkMaterials uzerinden yapilir (Material tag'leme + upsert ayni).
   */
  /**
   * Markaya dogrudan Excel yukleme — fiyat listesi OTOMATIK olusturulur.
   * Admin once liste acmak zorunda kalmasin diye: liste adi verilmezse
   * dosya adindan/tarihten uretilir, sonra normal import calisir.
   */
  async importBrandExcel(brandId: string, fileBuffer: Buffer, listName?: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadi');
    const name = (listName ?? '').trim()
      || `${brand.name} — ${new Date().toLocaleDateString('tr-TR')}`;
    const list = await this.prisma.priceList.create({ data: { name, brandId } });
    try {
      return await this.importPriceListExcel(list.id, fileBuffer);
    } catch (e) {
      // Import bastan basarisizsa (kolon bulunamadi vb.) bos liste birakma
      await this.prisma.priceList.delete({ where: { id: list.id } }).catch(() => {});
      throw e;
    }
  }

  async importPriceListExcel(priceListId: string, fileBuffer: Buffer) {
    const priceList = await this.prisma.priceList.findUnique({
      where: { id: priceListId },
      include: { brand: true },
    });
    if (!priceList) throw new NotFoundException('Fiyat listesi bulunamadi');

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    } catch (e) {
      throw new BadRequestException('Excel dosyasi okunamadi: ' + (e as Error).message);
    }

    const norm = (s: any) => String(s ?? '')
      .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
      .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c')
      .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[ğĞ]/g, 'g')
      .toLowerCase().trim();

    // Turkce/karisik sayi formati: "1.234,56" → 1234.56, "1,234.56" → 1234.56
    const parsePrice = (raw: any): number => {
      if (typeof raw === 'number') return raw;
      let s = String(raw ?? '').replace(/[₺$€]|TL|TRY|USD|EUR/gi, '').trim();
      if (!s) return NaN;
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
      } else if (lastDot > lastComma) {
        s = s.replace(/,/g, ''); // 1,234.56
      }
      return parseFloat(s);
    };

    const detectCurrency = (val: any): 'TRY' | 'USD' | 'EUR' | null => {
      const s = String(val ?? '');
      if (/USD|\$|DOLAR/i.test(s)) return 'USD';
      if (/EUR|€|AVRO/i.test(s)) return 'EUR';
      if (/TRY|TL|₺/i.test(s)) return 'TRY';
      return null;
    };

    const items: { materialName: string; unit: string; unitPrice: number }[] = [];
    const warnings: string[] = [];
    let converted = 0;
    let rates: { usdTry: number; eurTry: number } | null = null;
    const getRates = async () => {
      if (!rates) rates = await this.exchangeRates.getRates();
      return rates;
    };

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws || !ws['!ref']) continue;
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as any[][];
      if (grid.length === 0) continue;

      // Header satirini bul: ad + fiyat kolonu ayni satirda eslesmeli
      const NAME_RE = /(malzeme|urun|stok)\s*(adi|tanimi|tanim)|urun\s*ad|malzeme\s*ad|aciklama|tanim|cinsi/;
      const CODE_RE = /\bkod\b|kodu/;
      const UNIT_RE = /^birim$|^brm$|^br$|olcu\s*birim/;
      const PRICE_RE = /liste\s*fiyat|birim\s*fiyat|net\s*fiyat|satis\s*fiyat|\bfiyat\b|price/;
      const CURR_RE = /para\s*birimi|doviz|currency|\bpb\b/;
      // Ayirt edici ek kolonlar: ayni "Malzeme Adi"na farkli cap/cins/renk
      // satirlari gelir (orn. Borusan boru listesi) — ada EKLENMEZSE upsert
      // ayni isimde tum caplari tek kayda ezer (veri kaybi).
      const DESC_RE = /cinsi|\bcins\b|\btip\b|model|renk/;
      const DIAM_RE = /^cap$|\bcap\b|ebat|\bolcu\b|boyut/;

      let headerRow = -1;
      let cols: { name?: number; code?: number; unit?: number; price?: number; curr?: number; desc?: number; diam?: number } = {};
      const scanLimit = Math.min(15, grid.length);
      for (let r = 0; r < scanLimit; r++) {
        const found: typeof cols = {};
        (grid[r] ?? []).forEach((cell, c) => {
          const t = norm(cell);
          if (!t) return;
          if (found.name === undefined && NAME_RE.test(t)) found.name = c;
          else if (found.price === undefined && PRICE_RE.test(t)) found.price = c;
          else if (found.code === undefined && CODE_RE.test(t)) found.code = c;
          else if (found.unit === undefined && UNIT_RE.test(t)) found.unit = c;
          else if (found.curr === undefined && CURR_RE.test(t)) found.curr = c;
          else if (found.desc === undefined && DESC_RE.test(t)) found.desc = c;
          else if (found.diam === undefined && DIAM_RE.test(t)) found.diam = c;
        });
        if (found.name !== undefined && found.price !== undefined) {
          headerRow = r;
          cols = found;
          break;
        }
      }

      if (headerRow < 0) {
        warnings.push(`"${sheetName}": malzeme adi + fiyat kolonlari bulunamadi, sayfa atlandi`);
        continue;
      }

      // Para birimi baslikta olabilir: "Birim Fiyat (USD)" / "Liste Fiyati €"
      const headerCurrency = detectCurrency(grid[headerRow]?.[cols.price!]);

      let sheetCount = 0;
      for (let r = headerRow + 1; r < grid.length; r++) {
        const row = grid[r] ?? [];
        let name = String(row[cols.name!] ?? '').trim();
        // Ad bos ama kod doluysa kodu ad olarak kullan (schema'da ayri kod alani yok)
        if (!name && cols.code !== undefined) {
          name = String(row[cols.code] ?? '').trim();
        }
        const rawPrice = row[cols.price!];
        if (!name || name.length < 2) continue;
        let price = parsePrice(rawPrice);
        if (isNaN(price) || price <= 0) continue;

        // AD BENZERSIZLESTIRME: ayni "Malzeme Adi"na farkli cins/cap satirlari
        // gelir (orn. Borusan boru listesi: tek ad, 8 farkli cap). Material.name
        // @unique + upsert oldugundan cins/cap ada eklenmezse hepsi tek kayda
        // ezilir (veri kaybi). Cins + cap varsa ada birlestir.
        const desc = cols.desc !== undefined ? String(row[cols.desc] ?? '').trim() : '';
        const diam = cols.diam !== undefined ? String(row[cols.diam] ?? '').trim() : '';
        let fullName = name;
        if (desc && !name.toLowerCase().includes(desc.toLowerCase())) fullName += ` ${desc}`;
        if (diam && !fullName.toLowerCase().includes(diam.toLowerCase())) fullName += ` ${diam}`;
        fullName = fullName.trim();

        // Para birimi: satir kolonu > fiyat hucresi sembolu > baslik > TRY
        const curr = detectCurrency(cols.curr !== undefined ? row[cols.curr] : null)
          ?? detectCurrency(rawPrice)
          ?? headerCurrency
          ?? 'TRY';
        if (curr === 'USD') { price = price * (await getRates()).usdTry; converted++; }
        else if (curr === 'EUR') { price = price * (await getRates()).eurTry; converted++; }
        price = Math.round(price * 100) / 100;

        const unit = cols.unit !== undefined ? String(row[cols.unit] ?? '').trim() : '';
        items.push({ materialName: fullName, unit: unit || 'Adet', unitPrice: price });
        sheetCount++;
      }
      if (sheetCount > 0) {
        console.log(`[PriceListImport] "${sheetName}": ${sheetCount} kalem okundu`);
      }
    }

    if (items.length === 0) {
      throw new BadRequestException(
        'Excel\'de malzeme bulunamadi. Beklenen kolonlar: Malzeme/Urun Adi + Liste Fiyati' +
        (warnings.length ? ` — ${warnings.join(' · ')}` : ''),
      );
    }

    const result = await this.saveBulkMaterials(priceList.brandId, priceListId, items);
    return {
      ...result,
      warnings,
      convertedFxRows: converted,
      preview: items.slice(0, 50),
    };
  }

  async saveBulkMaterials(
    brandId: string,
    priceListId: string,
    items: { materialName: string; unit: string; unitPrice: number }[],
    exchangeRate?: number,
  ) {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadi');

    let priceList: { id: string; createdAt: Date; name: string; brandId: string } | null;
    if (priceListId === 'auto') {
      priceList = await this.prisma.priceList.findFirst({ where: { brandId }, orderBy: { createdAt: 'desc' } });
      if (!priceList) {
        priceList = await this.prisma.priceList.create({
          data: { name: `${brand.name} - ${new Date().toLocaleDateString('tr-TR')}`, brandId },
        });
      }
    } else {
      priceList = await this.prisma.priceList.findUnique({ where: { id: priceListId } });
      if (!priceList) throw new NotFoundException('Fiyat listesi bulunamadi');
    }

    const validItems = items.filter((item) => {
      const name = item.materialName?.trim();
      const price = Number(item.unitPrice);
      if (!name || name.length < 2) return false;
      if (isNaN(price) || price <= 0) return false;
      return true;
    });

    if (validItems.length === 0) {
      throw new BadRequestException('Kaydedilecek gecerli malzeme bulunamadi. Tum satirlar bos veya fiyatsiz.');
    }

    console.log(`[SaveBulk] ${validItems.length}/${items.length} gecerli satir, brand=${brand.name}, list=${priceList.name}`);

    let imported = 0;
    let skipped = 0;

    for (const item of validItems) {
      const name = item.materialName?.trim();
      const unit = item.unit?.trim() || 'Adet';
      let price = Number(item.unitPrice);
      if (!name || isNaN(price) || price <= 0) { skipped++; continue; }
      if (exchangeRate && exchangeRate > 0) {
        price = Math.round(price * exchangeRate * 100) / 100;
      }

      let material = await this.prisma.material.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });

      if (!material) {
        const { generateTags } = require('../modules/matching/tag-generator');
        const tagged = generateTags(name);
        material = await this.prisma.material.create({
          data: { name, unit, isGlobal: true, tags: tagged.tags, normalizedName: tagged.normalizedName, materialType: tagged.materialType },
        });
      } else if (!material.unit && unit) {
        await this.prisma.material.update({ where: { id: material.id }, data: { unit } });
      }

      if (material.tags?.length === 0) {
        const { generateTags } = require('../modules/matching/tag-generator');
        const tagged = generateTags(name);
        await this.prisma.material.update({
          where: { id: material.id },
          data: { tags: tagged.tags, normalizedName: tagged.normalizedName, materialType: tagged.materialType },
        });
      }

      await this.prisma.materialPrice.upsert({
        where: { materialId_brandId_priceListId: { materialId: material.id, brandId, priceListId } },
        update: { price },
        create: { materialId: material.id, brandId, priceListId, price },
      });
      imported++;
    }

    return { imported, skipped, total: items.length, brandName: brand.name, priceListName: priceList.name };
  }

  // ═════════ MATERIALS: SAVE FROM SHEETS (Excel multi-sheet) ═════════

  async saveMaterialsFromSheets(brandId: string, sheets: MaterialSheetInput[]) {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadi');
    if (!Array.isArray(sheets) || sheets.length === 0) {
      throw new BadRequestException('Sheets bos');
    }

    const { generateTags } = require('../modules/matching/tag-generator');
    const results: {
      sheetName: string; listName: string; guncellendi: boolean;
      imported: number; updated: number; skipped: number; kategoriSayisi: number;
      fiyatDegisimleri: { ad: string; eski: number; yeni: number }[];
    }[] = [];
    const warnings: string[] = [];

    for (const sheet of sheets) {
      if (sheet.isEmpty || !Array.isArray(sheet.rowData) || sheet.rowData.length === 0) continue;

      const roles: any = sheet.columnRoles || {};
      if (!roles.materialUnitPriceField) {
        warnings.push(`"${sheet.name}" sheet'inde malzeme birim fiyat kolonu bulunamadi`);
        continue;
      }
      if (!roles.nameField) {
        warnings.push(`"${sheet.name}" sheet'inde malzeme adi kolonu bulunamadi`);
        continue;
      }

      const hasAnyDataRow = sheet.rowData.some((row: any) => {
        if (!row?._isDataRow) return false;
        const name = String(row[roles.nameField] ?? '').trim();
        return name.length >= 2;
      });
      if (!hasAnyDataRow) {
        warnings.push(`"${sheet.name}" sheet'inde malzeme satiri bulunamadi (atlandi)`);
        continue;
      }

      // ── Y2: cins/cap kolon tespiti (roller > header regex) + ek sutunlar ──
      const defs = (sheet.columnDefs ?? []).filter((d) => d.field && !d.field.startsWith('_'));
      const detected = detectExtraRoles(defs);
      const cinsField: string | undefined = roles.cinsField ?? detected.cinsField;
      const capField: string | undefined = roles.capField ?? roles.diameterField ?? detected.capField;
      const roleFields = new Set(
        [roles.nameField, roles.unitField, roles.materialUnitPriceField, roles.noField, cinsField, capField].filter(Boolean),
      );

      // ── Y1: kategori basligi yuruyusu (dosyadaki hiyerarsi BIREBIR) ──
      const rowViews: ImportRowView[] = sheet.rowData.map((r: any) => ({
        isDataRow: !!r?._isDataRow,
        name: String(r?.[roles.nameField] ?? ''),
        priceRaw: r?.[roles.materialUnitPriceField],
      }));
      const kategoriPerRow = walkCategories(rowViews);

      // ── Y7: ayni adli liste varsa GUNCELLEME modu — mukerrer "(2)" YOK ──
      const listName = sheet.name || `Sayfa ${sheet.index ?? 0}`;
      const existingList = await this.prisma.priceList.findFirst({ where: { brandId, name: listName } });
      const priceList = existingList
        ?? await this.prisma.priceList.create({ data: { brandId, name: listName } });

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      const fiyatDegisimleri: { ad: string; eski: number; yeni: number }[] = [];
      const kategoriler = new Set<string>();

      for (let rowIdx = 0; rowIdx < sheet.rowData.length; rowIdx++) {
        const row: any = sheet.rowData[rowIdx];
        if (!row || !row._isDataRow) continue;

        const adRaw = String(row[roles.nameField] ?? '').trim();

        // ── Y4: TR sayi ayristirma — belirsizde SESSIZ VARSAYIM YOK ──
        const priceRaw = row[roles.materialUnitPriceField];
        const { value: fiyatVal, ambiguous } = parseTrNumber(priceRaw);
        if (ambiguous) {
          skipped++;
          warnings.push(`"${sheet.name}" satır ${rowIdx + 1} "${adRaw.slice(0, 40)}": fiyat belirsiz ("${String(priceRaw)}") — binlik mi ondalık mı? Grid'de düzeltip yeniden kaydedin.`);
          continue;
        }
        const unitPrice = fiyatVal == null || fiyatVal < 0 ? 0 : fiyatVal;

        const fullName = buildMaterialContextFromRows(sheet.rowData, rowIdx, roles);
        if (!fullName || fullName.length < 2) {
          skipped++;
          if (adRaw) warnings.push(`"${sheet.name}" satır ${rowIdx + 1}: malzeme adı çözümlenemedi (atlandı)`);
          continue;
        }

        const cins = cinsField ? String(row[cinsField] ?? '').trim() : '';
        const cap = capField ? String(row[capField] ?? '').trim() : '';
        const birimRaw = roles.unitField ? String(row[roles.unitField] ?? '').trim() : '';
        const unit = birimRaw || 'Adet';
        const kategori = kategoriPerRow[rowIdx];
        if (kategori) kategoriler.add(kategori);

        // Y2: role oturmayan sutunlar EK ALAN olarak korunur (dusurulmez)
        const extra: Record<string, string> = {};
        for (const d of defs) {
          if (roleFields.has(d.field)) continue;
          const v = String(row[d.field] ?? '').trim();
          if (v) extra[d.headerName || d.field] = v;
        }

        // Material benzersiz adi: ad + (icinde gecmiyorsa) cins + cap —
        // ayni-ad-farkli-cap satirlar TEK kayda cokertilmez.
        const lowerFull = fullName.toLowerCase();
        const nameParts = [fullName];
        if (cins && !lowerFull.includes(cins.toLowerCase())) nameParts.push(cins);
        if (cap && !lowerFull.includes(cap.toLowerCase())) nameParts.push(cap);
        const materialName = nameParts.join(' ');

        // E6: tag metni kategori + ad + cins + cap — aile kilidi (N1) ve cap
        // cevrimi AYRI SUTUNLARDAN gelen bilgiyle de calisir.
        const tagText = [kategori ?? '', materialName].filter(Boolean).join(' ');
        const tagged = generateTags(tagText);

        let material = await this.prisma.material.findFirst({
          where: { name: { equals: materialName, mode: 'insensitive' } },
        });
        if (!material) {
          material = await this.prisma.material.create({
            data: {
              name: materialName, unit, isGlobal: true,
              category: kategori ?? undefined,
              tags: tagged.tags, normalizedName: tagged.normalizedName, materialType: tagged.materialType,
            },
          });
        } else {
          await this.prisma.material.update({
            where: { id: material.id },
            data: {
              tags: tagged.tags, normalizedName: tagged.normalizedName, materialType: tagged.materialType,
              category: kategori ?? material.category,
            },
          });
        }

        // Kaynak sadakati alanlari + Y7 fiyat degisim takibi
        const whereKey = { materialId_brandId_priceListId: { materialId: material.id, brandId, priceListId: priceList.id } };
        const prev = await (this.prisma as any).materialPrice.findUnique({ where: whereKey });
        const fidelity: any = {
          kategori: kategori ?? null,
          cins: cins || null,
          cap: cap || null,
          adRaw: adRaw || null,
          birimRaw: birimRaw || null,
          sortOrder: rowIdx,
        };
        if (Object.keys(extra).length > 0) fidelity.extra = extra;
        await (this.prisma as any).materialPrice.upsert({
          where: whereKey,
          update: { price: unitPrice, ...fidelity },
          create: { materialId: material.id, brandId, priceListId: priceList.id, price: unitPrice, ...fidelity },
        });
        if (prev) {
          updated++;
          if (Math.abs(prev.price - unitPrice) > 0.001 && fiyatDegisimleri.length < 50) {
            fiyatDegisimleri.push({ ad: adRaw || materialName, eski: prev.price, yeni: unitPrice });
          }
        } else {
          imported++;
        }
      }

      results.push({
        sheetName: sheet.name, listName, guncellendi: !!existingList,
        imported, updated, skipped, kategoriSayisi: kategoriler.size, fiyatDegisimleri,
      });
      console.log(`[saveMaterialsFromSheets] "${sheet.name}" → "${listName}"${existingList ? ' (GUNCELLEME)' : ''}: ${imported} yeni, ${updated} guncel, ${skipped} atlandi, ${kategoriler.size} kategori`);
    }

    const totalImported = results.reduce((s, r) => s + r.imported, 0);
    const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
    return {
      totalImported,
      totalUpdated,
      totalSkipped,
      totalListsCreated: results.filter((r) => !r.guncellendi).length,
      brandName: brand.name,
      sheets: results,
      warnings,
    };
  }

  // ═════════ BRAND / PRICE LIST VIEWS ═════════

  async getBrandMaterials(brandId: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadi');
    const priceLists = await this.prisma.priceList.findMany({
      where: { brandId },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { brand, priceLists };
  }

  async getPriceListMaterials(priceListId: string) {
    const pl = await this.prisma.priceList.findUnique({
      where: { id: priceListId },
      include: { brand: true },
    });
    if (!pl) throw new NotFoundException('Liste bulunamadi');
    // Y5: KAYNAK SIRASI korunur (sortOrder) — sistem alfabetik dayatmaz.
    // Eski listelerde sortOrder=0 → ad sirasi ikincil (legacy fallback).
    const items = await (this.prisma as any).materialPrice.findMany({
      where: { priceListId },
      include: { material: true },
      orderBy: [{ sortOrder: 'asc' }, { material: { name: 'asc' } }],
    });
    return {
      priceList: pl,
      brand: pl.brand,
      materials: items.map((p: any) => ({
        id: p.id,
        materialId: p.materialId,
        materialName: p.material.name,
        unit: p.birimRaw || p.material.unit || 'Adet',
        price: p.price,
        // Y1/Y2/Y5 kaynak sadakati alanlari (eski kayitlarda null — legacy gorunum)
        kategori: p.kategori ?? null,
        cins: p.cins ?? null,
        cap: p.cap ?? null,
        adRaw: p.adRaw ?? null,
        extra: p.extra ?? null,
        sortOrder: p.sortOrder ?? 0,
      })),
      totalCount: items.length,
    };
  }
}
