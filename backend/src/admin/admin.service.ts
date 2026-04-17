import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import {
  buildMaterialContextFromRows,
  ColumnRoles,
  RowData,
} from '../utils/build-material-context';

export interface MaterialSheetInput {
  name: string;
  index?: number;
  rowData: RowData[];
  columnRoles: ColumnRoles;
  isEmpty?: boolean;
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
    const [userCount, brandCount, materialCount, quoteCount, priceListCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.brand.count(),
      this.prisma.material.count(),
      this.prisma.quote.count(),
      this.prisma.priceList.count(),
    ]);
    return { userCount, brandCount, materialCount, quoteCount, priceListCount };
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
    const results: { sheetName: string; listName: string; imported: number; skipped: number }[] = [];
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

      let listName = sheet.name || `Sayfa ${sheet.index ?? 0}`;
      let suffix = 2;
      while (await this.prisma.priceList.findFirst({ where: { brandId, name: listName } })) {
        listName = `${sheet.name} (${suffix++})`;
        if (suffix > 100) break;
      }

      const priceList = await this.prisma.priceList.create({
        data: { brandId, name: listName },
      });

      let imported = 0;
      let skipped = 0;

      for (let rowIdx = 0; rowIdx < sheet.rowData.length; rowIdx++) {
        const row: any = sheet.rowData[rowIdx];
        if (!row || !row._isDataRow) continue;

        const unitPriceRaw = row[roles.materialUnitPriceField];
        const parsed = typeof unitPriceRaw === 'number'
          ? unitPriceRaw
          : parseFloat(String(unitPriceRaw ?? '').replace(',', '.'));
        const unitPrice = isNaN(parsed) || parsed < 0 ? 0 : parsed;

        const fullName = buildMaterialContextFromRows(sheet.rowData, rowIdx, roles);
        if (!fullName || fullName.length < 2) { skipped++; continue; }

        const unit = roles.unitField
          ? String(row[roles.unitField] ?? '').trim() || 'Adet'
          : 'Adet';

        let material = await this.prisma.material.findFirst({
          where: { name: { equals: fullName, mode: 'insensitive' } },
        });

        if (!material) {
          const tagged = generateTags(fullName);
          material = await this.prisma.material.create({
            data: {
              name: fullName, unit, isGlobal: true,
              tags: tagged.tags, normalizedName: tagged.normalizedName, materialType: tagged.materialType,
            },
          });
        } else if (!material.tags || material.tags.length === 0) {
          const tagged = generateTags(fullName);
          await this.prisma.material.update({
            where: { id: material.id },
            data: { tags: tagged.tags, normalizedName: tagged.normalizedName, materialType: tagged.materialType },
          });
        }

        await this.prisma.materialPrice.upsert({
          where: { materialId_brandId_priceListId: { materialId: material.id, brandId, priceListId: priceList.id } },
          update: { price: unitPrice },
          create: { materialId: material.id, brandId, priceListId: priceList.id, price: unitPrice },
        });
        imported++;
      }

      results.push({ sheetName: sheet.name, listName, imported, skipped });
      console.log(`[saveMaterialsFromSheets] "${sheet.name}" → "${listName}": ${imported} kalem`);
    }

    const totalImported = results.reduce((s, r) => s + r.imported, 0);
    return {
      totalImported,
      totalListsCreated: results.length,
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
    const items = await this.prisma.materialPrice.findMany({
      where: { priceListId },
      include: { material: true },
      orderBy: { material: { name: 'asc' } },
    });
    return {
      priceList: pl,
      brand: pl.brand,
      materials: items.map((p) => ({
        id: p.id,
        materialId: p.materialId,
        materialName: p.material.name,
        unit: p.material.unit || 'Adet',
        price: p.price,
      })),
      totalCount: items.length,
    };
  }
}
