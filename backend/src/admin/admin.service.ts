import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import {
  buildMaterialContextFromRows,
  ColumnRoles,
  RowData,
} from '../utils/build-material-context';
import {
  parseTrNumber,
  walkCategories,
  detectExtraRoles,
  detectCurrency,
  inferPriceFormat,
  flagPriceOutliers,
  DotMeaning,
  ImportRowView,
} from '../utils/import-fidelity';
import { deriveEtiketler, isValidAdOverride } from '../utils/etiket-display';

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

/** Onizleme satiri (Z3/Z5): parse edilen her kalem — havuza YAZILMADAN once
 *  frontend'e doner, onay sonrasi commit ucuna aynen geri gelir. */
export interface ImportPreviewItem {
  materialName: string;
  unit: string;
  /** Cozulmus fiyat (orijinal para biriminde). null = belirsiz/okunamadi. */
  unitPrice: number | null;
  /** Ham hucre degeri — gosterim + commit'te yeniden cozum icin. */
  priceRaw?: string | number | null;
  /** Z2: bicim onayi bekliyor (tek nokta + 3 hane, dosya karari yok). */
  ambiguous?: boolean;
  /** Belirsiz satirda iki yorum (dialog gosterimi icin, backend hesaplar). */
  asThousands?: number | null;
  asDecimal?: number | null;
  /** Z4: satirin orijinal para birimi — CEVRIM YAPILMAZ. */
  currency?: 'TRY' | 'USD' | 'EUR';
  kategori?: string | null;
  cins?: string | null;
  cap?: string | null;
  adRaw?: string | null;
  birimRaw?: string | null;
  sortOrder?: number;
  /** Z6: makulluk isareti (sifir/negatif, kategori medyanina gore ×1000). */
  sapma?: string | null;
  // ── 3-ETIKET MODELI: onizlemede AD/CINS/CAP gosterimi ──
  /** AD gosterimi ("Küresel Vana") — cozulemezse null → satir isaretlenir */
  etiketAd?: string | null;
  etiketAdSlug?: string | null;
  etiketCins?: string;
  etiketCap?: string | null;
  /** Admin duzeltmesi: AD cozulemedi → elle secilen aile slug'i; commit'te
   *  Material.materialType/tags'e islenir ("etiketsiz urun eslestirmeye
   *  giremez" kurali boylece kapanir). */
  adOverride?: string | null;
}

@Injectable()
export class AdminService {
  private readonly SENSITIVE_KEYS = ['CLAUDE_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY'];

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
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
   * Admin fiyat listesine Excel'den toplu malzeme yukleme — IKI FAZLI
   * (Fiyat Bicimi Duzeltme Talebi Z1-Z6):
   *
   *   1. PREVIEW: dosya parse edilir, HICBIR SATIR YAZILMAZ (Z5). Fiyat
   *      bicimi KOLON DUZEYINDE cikarilir (Z1); cozulemezse dosya basina
   *      TEK soru doner (Z2, formatQuestion). Para birimi satir bazinda
   *      etiketlenir, CEVRIM YAPILMAZ (Z4). Sapan fiyatlar isaretlenir (Z6).
   *   2. COMMIT: kullanici onizlemeyi onaylayinca cozulmus kalemler yazilir
   *      (replaceExisting) + rapor doner (Z5).
   *
   * Kesif Excel'inden FARKLI yapi: fiyat listesinde Miktar kolonu YOKTUR
   * (o yuzden excelGridService.prepare kullanilamaz). Beklenen kolonlar:
   * Malzeme/Urun Adi + Liste/Birim Fiyat (+ opsiyonel Kod, Birim, Para Birimi).
   */
  private parsePriceListExcel(fileBuffer: Buffer, dotMeaningIn?: DotMeaning | null) {
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

    type Cols = { name?: number; code?: number; unit?: number; price?: number; curr?: number; desc?: number; diam?: number };
    const sheetPlans: { sheetName: string; grid: any[][]; headerRow: number; cols: Cols }[] = [];
    const warnings: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      if (!ws || !ws['!ref']) continue;
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as any[][];
      if (grid.length === 0) continue;

      let headerRow = -1;
      let cols: Cols = {};
      const scanLimit = Math.min(15, grid.length);
      for (let r = 0; r < scanLimit; r++) {
        const found: Cols = {};
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
      sheetPlans.push({ sheetName, grid, headerRow, cols });
    }

    // ── Z1: KOLON DUZEYINDE BICIM CIKARIMI — dosyadaki TUM fiyat degerleri
    // birlikte analiz edilir. Kanit varsa (1.234,56 / 540,50 / 540.5) bicim
    // kesindir, soru sorulmaz (F5). Yoksa dosya basina TEK soru (Z2).
    const allPriceRaws: unknown[] = [];
    for (const p of sheetPlans) {
      for (let r = p.headerRow + 1; r < p.grid.length; r++) {
        allPriceRaws.push((p.grid[r] ?? [])[p.cols.price!]);
      }
    }
    const inferred = inferPriceFormat(allPriceRaws);
    // Oncelik: kullanicinin verdigi karar (Z2 cevabi) > dosya ici kanit
    const effectiveDot: DotMeaning | null = dotMeaningIn ?? inferred.dotMeaning;

    const items: ImportPreviewItem[] = [];
    for (const p of sheetPlans) {
      const { sheetName, grid, headerRow, cols } = p;
      // Para birimi baslikta olabilir: "Birim Fiyat (USD)" / "Liste Fiyati €"
      const headerCurrency = detectCurrency(grid[headerRow]?.[cols.price!]);

      let sheetCount = 0;
      let aktifKategori: string | null = null;
      for (let r = headerRow + 1; r < grid.length; r++) {
        const row = grid[r] ?? [];
        let name = String(row[cols.name!] ?? '').trim();
        // Ad bos ama kod doluysa kodu ad olarak kullan (schema'da ayri kod alani yok)
        if (!name && cols.code !== undefined) {
          name = String(row[cols.code] ?? '').trim();
        }
        const rawPrice = row[cols.price!];
        const parsed = typeof rawPrice === 'number'
          ? { value: rawPrice, ambiguous: false }
          : parseTrNumber(String(rawPrice ?? ''), effectiveDot);

        // ── Y1: KATEGORI SATIRI — fiyati olmayan, tek anlamli metin tasiyan
        // satir (kirmizi/merge basliklar; merge metni ilk kolona duser).
        if (parsed.value == null && !parsed.ambiguous) {
          const cells = (row as any[]).map((v) => String(v ?? '').trim()).filter(Boolean);
          const catText = name || (cells[0] ?? '');
          if (catText.length > 2 && cells.length <= 2) {
            aktifKategori = catText;
          }
          continue;
        }
        if (!name || name.length < 2) continue;

        // AD BENZERSIZLESTIRME: ayni "Malzeme Adi"na farkli cins/cap satirlari
        // gelir (orn. Borusan boru listesi: tek ad, 8 farkli cap). Material.name
        // @unique + upsert oldugundan cins/cap ada eklenmezse hepsi tek kayda
        // ezilir (veri kaybi). Cins + cap varsa ada birlestir.
        // Contains kontrolu TR-KATLAMALI (norm) — "Boyalı"/"Boyali" farki yuzunden
        // ad iki kez ekleniyordu ("Boyalı Düz Uçlu Boyalı Düz Uçlu" bug'i).
        const desc = cols.desc !== undefined ? String(row[cols.desc] ?? '').trim() : '';
        const diam = cols.diam !== undefined ? String(row[cols.diam] ?? '').trim() : '';
        let fullName = name;
        if (desc && !norm(name).includes(norm(desc))) fullName += ` ${desc}`;
        if (diam && !norm(fullName).includes(norm(diam))) fullName += ` ${diam}`;
        fullName = fullName.trim();

        // ── Z4: para birimi satir bazinda ETIKETLENIR, CEVRIM YAPILMAZ.
        // Oncelik: satir kolonu > fiyat hucresi sembolu > baslik > TRY
        const curr = detectCurrency(cols.curr !== undefined ? row[cols.curr] : null)
          ?? detectCurrency(rawPrice)
          ?? headerCurrency
          ?? 'TRY';

        const price = parsed.value != null ? Math.round(parsed.value * 100) / 100 : null;
        const unit = cols.unit !== undefined ? String(row[cols.unit] ?? '').trim() : '';
        const rawStr = typeof rawPrice === 'number' ? rawPrice : String(rawPrice ?? '').trim();
        // 3-ETIKET MODELI: urun 3 etikete ayristirilir (kategori baglami
        // dahil — kayit tarafindaki tagText ile AYNI metin), onizlemede
        // gosterilir; AD cozulemezse isaretlenir + admin duzeltebilir.
        const etiket = deriveEtiketler([aktifKategori ?? '', fullName].filter(Boolean).join(' '));
        items.push({
          materialName: fullName, unit: unit || 'Adet',
          unitPrice: price,
          priceRaw: rawStr,
          // Z2: belirsiz satir HATA DEGIL — onizlemede isaretli, dosya karari
          // ile toplu cozulur. Satir basina uyari uretmek YASAK.
          ambiguous: parsed.ambiguous || undefined,
          asThousands: parsed.ambiguous ? parseTrNumber(String(rawPrice), 'thousands').value : undefined,
          asDecimal: parsed.ambiguous ? parseTrNumber(String(rawPrice), 'decimal').value : undefined,
          currency: curr,
          // Y1/Y2/Y3/Y5 kaynak sadakati
          kategori: aktifKategori, cins: desc || null, cap: diam || null,
          adRaw: name, birimRaw: unit || null, sortOrder: items.length,
          // 3-Etiket gosterimi
          etiketAd: etiket.ad, etiketAdSlug: etiket.adSlug,
          etiketCins: etiket.cins, etiketCap: etiket.cap,
        });
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

    const ambiguousCount = items.filter((i) => i.ambiguous).length;
    // Z2: dosya basina TEK soru — ornek degerler iki yorumla birlikte doner.
    const formatQuestion = effectiveDot == null && ambiguousCount > 0
      ? {
          count: ambiguousCount,
          samples: inferred.samples.map((raw) => ({
            raw,
            asThousands: parseTrNumber(raw, 'thousands').value,
            asDecimal: parseTrNumber(raw, 'decimal').value,
          })),
        }
      : null;

    return { items, warnings, formatQuestion, dotMeaning: effectiveDot };
  }

  /** Onizleme cevabi: Z6 sapma isaretleri + ozet istatistikler eklenir. */
  private buildImportPreview(
    parsed: ReturnType<AdminService['parsePriceListExcel']>,
    meta: { brandName: string; priceListName?: string | null },
  ) {
    const flags = flagPriceOutliers(
      parsed.items.map((i) => ({ price: i.unitPrice, kategori: i.kategori })),
    );
    parsed.items.forEach((it, idx) => { if (flags[idx]) it.sapma = flags[idx]; });

    const kategoriler = new Set(parsed.items.map((i) => i.kategori).filter(Boolean));
    const currencies: Record<string, number> = {};
    for (const it of parsed.items) {
      const c = it.currency ?? 'TRY';
      currencies[c] = (currencies[c] ?? 0) + 1;
    }
    return {
      ...meta,
      items: parsed.items,
      warnings: parsed.warnings,
      formatQuestion: parsed.formatQuestion,
      dotMeaning: parsed.dotMeaning,
      stats: {
        toplam: parsed.items.length,
        gecerli: parsed.items.filter((i) => (i.unitPrice ?? 0) > 0).length,
        belirsiz: parsed.items.filter((i) => i.ambiguous).length,
        sapan: parsed.items.filter((i) => i.sapma && (i.unitPrice ?? 0) > 0).length,
        atlanacak: parsed.items.filter((i) => !i.ambiguous && (i.unitPrice == null || i.unitPrice <= 0)).length,
        kategoriSayisi: kategoriler.size,
        currencies,
        // 3-Etiket: AD cozulemedi — "etiketsiz urun eslestirmeye giremez",
        // admin onizlemede dropdown'la duzeltebilir (adOverride)
        adBelirsiz: parsed.items.filter((i) => !i.etiketAdSlug).length,
      },
    };
  }

  /** FAZ 1a: mevcut fiyat listesine yukleme onizlemesi — YAZMAZ (Z5). */
  async previewPriceListExcel(priceListId: string, fileBuffer: Buffer, dotMeaning?: DotMeaning | null) {
    const priceList = await this.prisma.priceList.findUnique({
      where: { id: priceListId },
      include: { brand: true },
    });
    if (!priceList) throw new NotFoundException('Fiyat listesi bulunamadi');
    const parsed = this.parsePriceListExcel(fileBuffer, dotMeaning);
    return this.buildImportPreview(parsed, { brandName: priceList.brand.name, priceListName: priceList.name });
  }

  /** FAZ 1b: markaya dogrudan yukleme onizlemesi — liste de OLUSTURULMAZ (Z5:
   *  onay oncesi hicbir kalici iz yok; liste commit aninda acilir). */
  async previewBrandExcel(brandId: string, fileBuffer: Buffer, dotMeaning?: DotMeaning | null) {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadi');
    const parsed = this.parsePriceListExcel(fileBuffer, dotMeaning);
    return this.buildImportPreview(parsed, { brandName: brand.name, priceListName: null });
  }

  /** FAZ 2 cekirdegi: onaylanmis onizleme kalemlerini yazar. Belirsiz kalan
   *  satirlar dotMeaning ile cozulur; karar yoksa yazim REDDEDILIR (Z2/Z5). */
  private async commitImportCore(
    brandId: string,
    priceListId: string,
    body: { items: ImportPreviewItem[]; dotMeaning?: DotMeaning | null },
  ) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('Kaydedilecek kalem yok');
    }
    const skippedReasons: string[] = [];
    let cozulenBelirsizlik = 0;
    const resolved: (ImportPreviewItem & { unitPrice: number })[] = [];

    for (const it of body.items) {
      let price = it.unitPrice;
      if (price == null || it.ambiguous) {
        // Onizlemede cozulmemis satir — dosya karariyla burada cozulur
        const p = parseTrNumber(
          typeof it.priceRaw === 'number' ? it.priceRaw : String(it.priceRaw ?? ''),
          body.dotMeaning ?? undefined,
        );
        if (p.ambiguous) {
          throw new BadRequestException(
            'Fiyat biçimi kararı verilmeden içe aktarım yapılamaz — önizlemedeki soruyu yanıtlayın (binlik mi ondalık mı?).',
          );
        }
        if (p.value != null) {
          price = Math.round(p.value * 100) / 100;
          if (it.ambiguous) cozulenBelirsizlik++;
        }
      }
      const etiket = (it.adRaw || it.materialName || '').slice(0, 40);
      if (price == null) {
        skippedReasons.push(`"${etiket}": fiyat okunamadı ("${String(it.priceRaw ?? '')}")`);
        continue;
      }
      if (price <= 0) {
        skippedReasons.push(`"${etiket}": sıfır/negatif fiyat (${price})`);
        continue;
      }
      resolved.push({ ...it, unitPrice: price });
    }

    if (resolved.length === 0) {
      throw new BadRequestException(
        'Kaydedilecek geçerli satır yok.' +
        (skippedReasons.length ? ` İlk nedenler: ${skippedReasons.slice(0, 3).join(' · ')}` : ''),
      );
    }

    // Y7: dosya kaynak-of-truth — ayni listeye yeniden yukleme listeyi
    // BASTAN YAZAR, degisen fiyatlar raporlanir.
    const result = await this.saveBulkMaterials(brandId, priceListId, resolved, undefined, { replaceExisting: true });
    return {
      ...result,
      cozulenBelirsizlik,
      dotMeaning: body.dotMeaning ?? null,
      atlananSayisi: skippedReasons.length,
      atlananNedenler: skippedReasons.slice(0, 20),
    };
  }

  /** FAZ 2a: mevcut listeye commit. */
  async commitPriceListImport(
    priceListId: string,
    body: { items: ImportPreviewItem[]; dotMeaning?: DotMeaning | null },
  ) {
    const priceList = await this.prisma.priceList.findUnique({ where: { id: priceListId } });
    if (!priceList) throw new NotFoundException('Fiyat listesi bulunamadi');
    return this.commitImportCore(priceList.brandId, priceListId, body);
  }

  /** FAZ 2b: markaya commit — fiyat listesi ANCAK simdi olusturulur (Z5). */
  async commitBrandImport(
    brandId: string,
    body: { items: ImportPreviewItem[]; dotMeaning?: DotMeaning | null; listName?: string },
  ) {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadi');
    const name = (body.listName ?? '').trim()
      || `${brand.name} — ${new Date().toLocaleDateString('tr-TR')}`;
    const list = await this.prisma.priceList.create({ data: { name, brandId } });
    try {
      return await this.commitImportCore(brandId, list.id, body);
    } catch (e) {
      // Commit basarisizsa bos liste birakma
      await this.prisma.priceList.delete({ where: { id: list.id } }).catch(() => {});
      throw e;
    }
  }

  async saveBulkMaterials(
    brandId: string,
    priceListId: string,
    items: {
      materialName: string; unit: string; unitPrice: number;
      // Z4: fiyatin orijinal para birimi — cevrimsiz saklanir
      currency?: string | null;
      kategori?: string | null; cins?: string | null; cap?: string | null;
      adRaw?: string | null; birimRaw?: string | null; sortOrder?: number;
      // 3-Etiket: admin'in AD duzeltmesi (onizleme dropdown'u) — Material
      // .materialType/tags'e islenir
      adOverride?: string | null;
    }[],
    exchangeRate?: number,
    opts?: { replaceExisting?: boolean },
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

    console.log(`[SaveBulk] ${validItems.length}/${items.length} gecerli satir, brand=${brand.name}, list=${priceList.name}${opts?.replaceExisting ? ' (REPLACE)' : ''}`);

    // ── Y7: replaceExisting — dosya kaynak-of-truth. Eski kalemler fiyat
    // degisim raporu icin okunur, sonra listenin TAMAMI silinip yeni yapiyla
    // bastan yazilir (eski bozuk adlandirilmis kayitlar da temizlenir).
    const oldPrices = new Map<string, number>();
    let removed = 0;
    if (opts?.replaceExisting) {
      const olds = await (this.prisma as any).materialPrice.findMany({
        where: { priceListId: priceList.id },
        include: { material: { select: { name: true } } },
      });
      for (const o of olds) oldPrices.set(String(o.material?.name ?? '').toLocaleLowerCase('tr'), o.price);
      const del = await this.prisma.materialPrice.deleteMany({ where: { priceListId: priceList.id } });
      removed = del.count;
    }

    const { generateTags } = require('../modules/matching/tag-generator');
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let adDuzeltilen = 0;
    const fiyatDegisimleri: { ad: string; eski: number; yeni: number }[] = [];
    const kategoriler = new Set<string>();

    for (const item of validItems) {
      const name = item.materialName?.trim();
      const unit = item.unit?.trim() || 'Adet';
      let price = Number(item.unitPrice);
      if (!name || isNaN(price) || price <= 0) { skipped++; continue; }
      if (exchangeRate && exchangeRate > 0) {
        price = Math.round(price * exchangeRate * 100) / 100;
      }
      if (item.kategori) kategoriler.add(item.kategori);

      // E6: tag metni kategori + ad — aile kilidi/cap cevrimi kategori
      // bilgisiyle de calisir ("...Galvanizli Disli Mansonlu" basligi cinsi verir)
      const tagText = [item.kategori ?? '', name].filter(Boolean).join(' ');
      const tagged = generateTags(tagText);
      // 3-ETIKET MODELI: admin AD duzeltmesi — cozulemez satirda onizlemede
      // secilen aile, Material.materialType + tags'e islenir ("etiketsiz
      // urun eslestirmeye giremez" kurali kapanir). Yalniz bilinen slug'lar.
      if (isValidAdOverride(item.adOverride)) {
        tagged.materialType = item.adOverride;
        tagged.tags = Array.from(new Set([...tagged.tags.filter((t: string) => t !== 'diger'), item.adOverride]));
        adDuzeltilen++;
      }

      let material = await this.prisma.material.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (!material) {
        material = await this.prisma.material.create({
          data: {
            name, unit, isGlobal: true, category: item.kategori ?? undefined,
            tags: tagged.tags, normalizedName: tagged.normalizedName, materialType: tagged.materialType,
          },
        });
      } else {
        await this.prisma.material.update({
          where: { id: material.id },
          data: {
            unit: material.unit || unit,
            category: item.kategori ?? material.category,
            tags: tagged.tags, normalizedName: tagged.normalizedName, materialType: tagged.materialType,
          },
        });
      }

      const fidelity: any = {
        // Z4: orijinal para birimi kalemde saklanir (cevrim yalniz teklifte)
        currency: item.currency ?? 'TRY',
        kategori: item.kategori ?? null,
        cins: item.cins ?? null,
        cap: item.cap ?? null,
        adRaw: item.adRaw ?? null,
        birimRaw: item.birimRaw ?? null,
        sortOrder: item.sortOrder ?? 0,
      };
      await (this.prisma as any).materialPrice.upsert({
        where: { materialId_brandId_priceListId: { materialId: material.id, brandId, priceListId: priceList.id } },
        update: { price, ...fidelity },
        create: { materialId: material.id, brandId, priceListId: priceList.id, price, ...fidelity },
      });

      const oldPrice = oldPrices.get(name.toLocaleLowerCase('tr'));
      if (oldPrice !== undefined) {
        updated++;
        if (Math.abs(oldPrice - price) > 0.001 && fiyatDegisimleri.length < 50) {
          fiyatDegisimleri.push({ ad: item.adRaw || name, eski: oldPrice, yeni: price });
        }
      } else {
        imported++;
      }
    }

    console.log(`[SaveBulk] Sonuc: ${imported} yeni, ${updated} guncel, ${removed} eski kalem temizlendi, ${kategoriler.size} kategori${adDuzeltilen ? `, ${adDuzeltilen} AD duzeltmesi` : ''}`);
    return {
      imported, updated, skipped, removed,
      kategoriSayisi: kategoriler.size,
      fiyatDegisimleri,
      // 3-Etiket: admin'in elle duzelttigi AD sayisi (rapor)
      adDuzeltilen,
      total: items.length,
      brandName: brand.name,
      priceListName: priceList.name,
    };
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
        // Z4: fiyatin orijinal para birimi — havuz kendi birimiyle listeler
        currency: p.currency ?? 'TRY',
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
