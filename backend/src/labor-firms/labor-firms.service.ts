import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildMaterialContextFromRows, ColumnRoles, RowData } from '../utils/build-material-context';

export interface SheetInput {
  name: string;
  index?: number;
  rowData: RowData[];
  columnRoles: ColumnRoles;
  isEmpty?: boolean;
}

export interface CreateLaborFirmDto {
  name: string;
  discipline: 'mechanical' | 'electrical';
  logo?: string;
}

@Injectable()
export class LaborFirmsService {
  constructor(private prisma: PrismaService) {}

  // ── Sahiplik kontrolu helper ──
  private async assertOwnership(firmaId: string, userId: string) {
    const firma = await this.prisma.laborFirm.findUnique({ where: { id: firmaId } });
    if (!firma) throw new NotFoundException('Firma bulunamadi');
    if (firma.userId !== userId) throw new ForbiddenException('Bu firmaya erisim yetkiniz yok');
    return firma;
  }

  private async assertPriceListOwnership(priceListId: string, userId: string) {
    const pl = await this.prisma.laborPriceList.findUnique({
      where: { id: priceListId },
      include: { firma: true },
    });
    if (!pl) throw new NotFoundException('Liste bulunamadi');
    if (pl.firma.userId !== userId) throw new ForbiddenException('Bu listeye erisim yetkiniz yok');
    return pl;
  }

  // ── Kullanicinin kendi firmalari ──

  async findAll(userId: string, discipline?: string) {
    const where: any = { userId };
    if (discipline === 'mechanical' || discipline === 'electrical') {
      where.discipline = discipline;
    }
    return this.prisma.laborFirm.findMany({
      where,
      include: { _count: { select: { priceLists: true, laborPrices: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    return this.assertOwnership(id, userId);
  }

  async getFirmaPriceLists(userId: string, firmaId: string) {
    const firma = await this.assertOwnership(firmaId, userId);
    const priceLists = await this.prisma.laborPriceList.findMany({
      where: { firmaId },
      include: { _count: { select: { prices: true } } },
      orderBy: { uploadedAt: 'desc' },
    });
    return { firma, priceLists };
  }

  async getPriceListItems(userId: string, priceListId: string) {
    const pl = await this.assertPriceListOwnership(priceListId, userId);

    const items = await this.prisma.laborPrice.findMany({
      where: { priceListId },
      include: { laborItem: true },
      orderBy: { laborItem: { name: 'asc' } },
    });

    return {
      priceList: pl,
      firma: pl.firma,
      items: items.map((p) => {
        const discount = p.discountRate || 0;
        const netUnitPrice = p.unitPrice * (1 - discount / 100);
        return {
          id: p.id,
          laborItemId: p.laborItemId,
          laborItemName: p.laborItem.name,
          unit: p.unit || p.laborItem.unit || 'Adet',
          unitPrice: p.unitPrice,        // liste fiyat
          discountRate: discount,         // iskonto %
          netUnitPrice,                   // hesaplanmis net
          category: p.laborItem.category,
          discipline: p.laborItem.discipline,
        };
      }),
      totalCount: items.length,
    };
  }

  // ── Tekil LaborPrice kalem guncelleme ──

  private async assertPriceItemOwnership(priceItemId: string, userId: string) {
    const price = await this.prisma.laborPrice.findUnique({
      where: { id: priceItemId },
      include: { firma: true, laborItem: true },
    });
    if (!price) throw new NotFoundException('Kalem bulunamadi');
    if (price.firma.userId !== userId) {
      throw new ForbiddenException('Bu kaleme erisim yetkiniz yok');
    }
    return price;
  }

  async updatePriceItem(
    userId: string,
    priceItemId: string,
    data: { unitPrice?: number; discountRate?: number; unit?: string; laborItemName?: string },
  ) {
    const existing = await this.assertPriceItemOwnership(priceItemId, userId);

    // LaborPrice update
    const updateData: any = {};
    if (data.unitPrice !== undefined && !isNaN(data.unitPrice) && data.unitPrice >= 0) {
      updateData.unitPrice = data.unitPrice;
    }
    if (data.discountRate !== undefined && !isNaN(data.discountRate)) {
      updateData.discountRate = Math.max(0, Math.min(100, data.discountRate));
    }
    if (data.unit !== undefined) updateData.unit = data.unit.trim() || 'Adet';

    const updated = await this.prisma.laborPrice.update({
      where: { id: priceItemId },
      data: updateData,
    });

    // LaborItem name update (kullanici ismi degistirmek istediyse)
    if (data.laborItemName && data.laborItemName.trim().length >= 2) {
      const newName = data.laborItemName.trim();
      if (newName !== existing.laborItem.name) {
        const { generateTags } = require('../modules/matching/tag-generator');
        const tagged = generateTags(newName);
        await this.prisma.laborItem.update({
          where: { id: existing.laborItemId },
          data: {
            name: newName,
            tags: tagged.tags,
            normalizedName: tagged.normalizedName,
          },
        });
      }
    }

    const discount = updated.discountRate || 0;
    return {
      id: updated.id,
      unitPrice: updated.unitPrice,
      discountRate: discount,
      netUnitPrice: updated.unitPrice * (1 - discount / 100),
      unit: updated.unit,
    };
  }

  async bulkUpdatePriceItems(
    userId: string,
    items: Array<{ id: string; unitPrice?: number; discountRate?: number; unit?: string; laborItemName?: string }>,
  ) {
    let updated = 0;
    const errors: Array<{ id: string; error: string }> = [];
    for (const it of items) {
      try {
        await this.updatePriceItem(userId, it.id, it);
        updated++;
      } catch (e: any) {
        errors.push({ id: it.id, error: e?.message ?? 'Bilinmeyen' });
      }
    }
    return { updated, errors };
  }

  async deletePriceItem(userId: string, priceItemId: string) {
    await this.assertPriceItemOwnership(priceItemId, userId);
    return this.prisma.laborPrice.delete({ where: { id: priceItemId } });
  }

  // ── Sheets GET — ExcelGrid render icin ──
  // LaborPriceList.sheets (raw) + LaborPrice iskontolar merge
  async getPriceListSheets(userId: string, priceListId: string) {
    const pl = await this.assertPriceListOwnership(priceListId, userId);

    if (!pl.sheets) {
      // Eski kayit — sentetik tek sheet olustur
      return this.buildSyntheticLaborSheet(pl.id);
    }

    // LaborPrice iskontolar haritasini al (laborItemName → {discountRate, priceItemId})
    const prices = await this.prisma.laborPrice.findMany({
      where: { priceListId },
      include: { laborItem: true },
    });
    const priceMap = new Map<string, { id: string; discountRate: number; laborItemName: string }>();
    for (const p of prices) {
      priceMap.set(p.laborItem.name.toLowerCase().trim(), {
        id: p.id,
        discountRate: p.discountRate || 0,
        laborItemName: p.laborItem.name,
      });
    }

    // sheets raw yapiyi tekrar oku
    const raw = pl.sheets as any;
    const sheet = raw;
    const roles = sheet.columnRoles || {};

    // buildMaterialContextFromRows ile her data row'un full name'ini cikar
    // Eslesen LaborPrice'in discountRate ve id'sini data row'a inject et
    const { buildMaterialContextFromRows } = require('../utils/build-material-context');

    const enhanced = [...sheet.rowData];
    let matched = 0;
    let unmatched = 0;
    // Sirali fallback: priceMap'te bulunamayan satirlar icin unused LaborPrice'lardan sirayla atan
    const unusedPrices = [...prices];
    const matchedIds = new Set<string>();

    // ILK GECIS: full name ile match
    for (let i = 0; i < enhanced.length; i++) {
      const row = enhanced[i];
      if (!row?._isDataRow) continue;
      // Eger save sirasinda inject edildiyse direkt kullan
      if (row._laborPriceId) {
        const p = prices.find((x) => x.id === row._laborPriceId);
        if (p) {
          enhanced[i] = { ...row, _laborDiscountRate: p.discountRate || 0 };
          matchedIds.add(p.id);
          matched++;
          continue;
        }
      }
      const fullName = buildMaterialContextFromRows(enhanced, i, roles);
      const match = priceMap.get(fullName.toLowerCase().trim());
      if (match) {
        enhanced[i] = {
          ...row,
          _laborPriceId: match.id,
          _laborDiscountRate: match.discountRate,
        };
        matchedIds.add(match.id);
        matched++;
      } else {
        unmatched++;
      }
    }

    // IKINCI GECIS: hala _laborPriceId'si olmayan data row'lara, kullanilmamis LaborPrice'lardan sirayla ata
    // (fallback — eski sheets icinde inject yapilmamis yuklemeler icin)
    if (unmatched > 0) {
      const remainingPrices = unusedPrices.filter((p) => !matchedIds.has(p.id));
      let fallbackIdx = 0;
      for (let i = 0; i < enhanced.length; i++) {
        const row = enhanced[i];
        if (!row?._isDataRow) continue;
        if (row._laborPriceId) continue;
        const p = remainingPrices[fallbackIdx];
        if (!p) break;
        enhanced[i] = {
          ...row,
          _laborPriceId: p.id,
          _laborDiscountRate: p.discountRate || 0,
        };
        fallbackIdx++;
      }
      console.log(`[getPriceListSheets] ${matched} matched by name, ${unmatched} fallback assigned by order`);
    } else {
      console.log(`[getPriceListSheets] ${matched} matched by name, 0 unmatched`);
    }

    return {
      priceList: { id: pl.id, name: pl.name, firmaId: pl.firmaId },
      firma: pl.firma,
      sheet: {
        ...sheet,
        rowData: enhanced,
      },
    };
  }

  private async buildSyntheticLaborSheet(priceListId: string) {
    const pl = await this.prisma.laborPriceList.findUnique({
      where: { id: priceListId },
      include: { firma: true },
    });
    if (!pl) throw new NotFoundException('Liste bulunamadi');

    const prices = await this.prisma.laborPrice.findMany({
      where: { priceListId },
      include: { laborItem: true },
      orderBy: { laborItem: { name: 'asc' } },
    });

    const columnDefs = [
      { field: 'col0', headerName: 'No', width: 60, editable: false },
      { field: 'col1', headerName: 'Iscilik Kalemi', width: 400, editable: true },
      { field: 'col2', headerName: 'Birim', width: 100, editable: true },
      { field: 'col3', headerName: 'Liste Fiyat', width: 130, editable: true },
    ];
    const columnRoles = {
      noField: 'col0',
      nameField: 'col1',
      unitField: 'col2',
      laborUnitPriceField: 'col3',
    };
    const rowData: any[] = [
      { _rowIdx: 0, _isDataRow: false, _isHeaderRow: true, col0: 'No', col1: 'Iscilik Kalemi', col2: 'Birim', col3: 'Liste Fiyat' },
    ];
    prices.forEach((p, i) => {
      rowData.push({
        _rowIdx: i + 1,
        _isDataRow: true,
        _isHeaderRow: false,
        _laborPriceId: p.id,
        _laborDiscountRate: p.discountRate || 0,
        col0: String(i + 1),
        col1: p.laborItem.name,
        col2: p.unit || 'Adet',
        col3: p.unitPrice,
      });
    });

    const sheet = {
      name: pl.name,
      index: 0,
      columnDefs,
      rowData,
      columnRoles,
      headerEndRow: 0,
      isEmpty: false,
      discipline: pl.firma.discipline,
    };

    return {
      priceList: { id: pl.id, name: pl.name, firmaId: pl.firmaId },
      firma: pl.firma,
      sheet,
    };
  }

  // ── Sheets SAVE — ExcelGrid dirty rows → LaborPrice update ──
  async savePriceListSheets(
    userId: string,
    priceListId: string,
    dirtyRows: Array<{
      laborPriceId: string;
      listPrice?: number;
      discountRate?: number;
      laborItemName?: string;
      unit?: string;
    }>,
  ) {
    await this.assertPriceListOwnership(priceListId, userId);

    if (!Array.isArray(dirtyRows) || dirtyRows.length === 0) {
      return { updated: 0, errors: [] };
    }

    let updated = 0;
    const errors: Array<{ id: string; error: string }> = [];
    for (const row of dirtyRows) {
      try {
        await this.updatePriceItem(userId, row.laborPriceId, {
          unitPrice: row.listPrice,
          discountRate: row.discountRate,
          unit: row.unit,
          laborItemName: row.laborItemName,
        });
        updated++;
      } catch (e: any) {
        errors.push({ id: row.laborPriceId, error: e?.message ?? 'Bilinmeyen' });
      }
    }

    return { updated, errors };
  }

  // ── CRUD (kullanici kendi firmalarini yonetir) ──

  async create(userId: string, dto: CreateLaborFirmDto) {
    const existing = await this.prisma.laborFirm.findFirst({
      where: { userId, name: dto.name },
    });
    if (existing) throw new ConflictException('Bu isimde firmaniz zaten var');
    return this.prisma.laborFirm.create({
      data: {
        name: dto.name,
        discipline: dto.discipline,
        logo: dto.logo,
        userId,
      },
    });
  }

  async update(userId: string, id: string, dto: Partial<CreateLaborFirmDto>) {
    const firma = await this.assertOwnership(id, userId);
    return this.prisma.laborFirm.update({
      where: { id },
      data: {
        name: dto.name ?? firma.name,
        discipline: dto.discipline ?? firma.discipline,
        logo: dto.logo !== undefined ? dto.logo : firma.logo,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOwnership(id, userId);
    return this.prisma.laborFirm.delete({ where: { id } });
  }

  // ── Price List CRUD ──

  async createPriceList(userId: string, firmaId: string, name: string) {
    await this.assertOwnership(firmaId, userId);
    return this.prisma.laborPriceList.create({ data: { firmaId, name } });
  }

  async deletePriceList(userId: string, priceListId: string) {
    await this.assertPriceListOwnership(priceListId, userId);
    return this.prisma.laborPriceList.delete({ where: { id: priceListId } });
  }

  // ── Bulk save (admin/labor/save-bulk yerine bunu kullan) ──

  /**
   * Multi-sheet Excel'den gelen sheets array'ini parse edip
   * her sheet'i ayri bir LaborPriceList olarak kaydeder.
   *
   * Her sheet icin:
   * - Sheet adiyla yeni LaborPriceList olustur (varsa "(2)" ekle)
   * - _isDataRow=true satirlarini gez
   * - buildMaterialContextFromRows ile grup basligi + satir adi birlestir
   * - laborUnitPriceField'den fiyat cek
   * - unitField'den birim cek
   * - LaborItem upsert + LaborPrice upsert
   */
  async saveFromSheets(userId: string, firmaId: string, sheets: SheetInput[]) {
    const firma = await this.assertOwnership(firmaId, userId);

    if (!Array.isArray(sheets) || sheets.length === 0) {
      throw new BadRequestException('Sheets bos');
    }

    const { generateTags } = require('../modules/matching/tag-generator');

    const results: Array<{ sheetName: string; listName: string; imported: number; skipped: number }> = [];
    const warnings: string[] = [];

    for (const sheet of sheets) {
      if (sheet.isEmpty || !Array.isArray(sheet.rowData) || sheet.rowData.length === 0) {
        continue;
      }

      const roles = sheet.columnRoles || {};
      if (!roles.laborUnitPriceField) {
        warnings.push(`"${sheet.name}" sheet'inde iscilik birim fiyat kolonu bulunamadi`);
        continue;
      }
      if (!roles.nameField) {
        warnings.push(`"${sheet.name}" sheet'inde malzeme adi kolonu bulunamadi`);
        continue;
      }

      // En az 1 data row var mi? (kalem adi olsun, fiyat 0 olabilir)
      const hasAnyDataRow = sheet.rowData.some((row: any) => {
        if (!row?._isDataRow) return false;
        const name = String(row[roles.nameField!] ?? '').trim();
        return name.length >= 2;
      });

      if (!hasAnyDataRow) {
        warnings.push(`"${sheet.name}" sheet'inde malzeme satiri bulunamadi (atlandi)`);
        continue;
      }

      // Benzersiz liste adi (varsa sayac ekle)
      let listName = sheet.name || `Sayfa ${sheet.index ?? 0}`;
      let suffix = 2;
      while (await this.prisma.laborPriceList.findFirst({ where: { firmaId, name: listName } })) {
        listName = `${sheet.name} (${suffix++})`;
        if (suffix > 100) break;
      }

      // Sheet'i raw olarak kaydet — ExcelGrid ile yeniden render icin
      const priceList = await this.prisma.laborPriceList.create({
        data: {
          firmaId,
          name: listName,
          sheets: {
            name: sheet.name,
            index: sheet.index ?? 0,
            rowData: sheet.rowData,
            columnRoles: sheet.columnRoles,
            columnDefs: (sheet as any).columnDefs ?? [],
            headerEndRow: (sheet as any).headerEndRow ?? 0,
            isEmpty: false,
            discipline: firma.discipline,
          } as any,
        },
      });

      let imported = 0;
      let skipped = 0;

      for (let rowIdx = 0; rowIdx < sheet.rowData.length; rowIdx++) {
        const row = sheet.rowData[rowIdx];
        if (!row || !row._isDataRow) continue;

        const unitPriceRaw = row[roles.laborUnitPriceField];
        const parsed = typeof unitPriceRaw === 'number'
          ? unitPriceRaw
          : parseFloat(String(unitPriceRaw ?? '').replace(',', '.'));
        // Fiyat 0 olabilir — kullanici sonra elle duzenler
        const unitPrice = isNaN(parsed) || parsed < 0 ? 0 : parsed;

        const fullName = buildMaterialContextFromRows(sheet.rowData, rowIdx, roles);
        if (!fullName || fullName.length < 2) { skipped++; continue; }

        const unit = roles.unitField
          ? String(row[roles.unitField] ?? '').trim() || 'Adet'
          : 'Adet';

        // LaborItem upsert
        let laborItem = await this.prisma.laborItem.findFirst({
          where: {
            name: { equals: fullName, mode: 'insensitive' },
            discipline: firma.discipline,
          },
        });
        if (!laborItem) {
          const tagged = generateTags(fullName);
          laborItem = await this.prisma.laborItem.create({
            data: {
              name: fullName,
              unit,
              unitPrice,
              discipline: firma.discipline,
              tags: tagged.tags,
              normalizedName: tagged.normalizedName,
              isGlobal: true,
            },
          });
        } else if (!laborItem.tags || laborItem.tags.length === 0) {
          const tagged = generateTags(fullName);
          await this.prisma.laborItem.update({
            where: { id: laborItem.id },
            data: { tags: tagged.tags, normalizedName: tagged.normalizedName },
          });
        }

        // LaborPrice upsert
        const labPrice = await this.prisma.laborPrice.upsert({
          where: {
            laborItemId_firmaId_priceListId: {
              laborItemId: laborItem.id,
              firmaId,
              priceListId: priceList.id,
            },
          },
          update: { unitPrice, unit },
          create: { laborItemId: laborItem.id, firmaId, priceListId: priceList.id, unitPrice, unit },
        });

        // Forward fix: row'a LaborPrice ID'sini inject et (sheets JSON'da kayitli kalsin)
        // Boylece getPriceListSheets okurken match aramaya gerek kalmaz
        (sheet.rowData[rowIdx] as any)._laborPriceId = labPrice.id;

        imported++;
      }

      // Sheets JSON'unu LaborPriceList'e kaydet (rowData mutasyonu dahil — artik _laborPriceId'ler var)
      await this.prisma.laborPriceList.update({
        where: { id: priceList.id },
        data: {
          sheets: {
            name: sheet.name,
            index: sheet.index ?? 0,
            rowData: sheet.rowData,
            columnRoles: sheet.columnRoles,
            columnDefs: (sheet as any).columnDefs ?? [],
            headerEndRow: (sheet as any).headerEndRow ?? 0,
            isEmpty: false,
            discipline: firma.discipline,
          } as any,
        },
      });

      results.push({ sheetName: sheet.name, listName, imported, skipped });
      console.log(`[saveFromSheets] "${sheet.name}" → "${listName}": ${imported} kalem (${skipped} atlandi)`);
    }

    const totalImported = results.reduce((s, r) => s + r.imported, 0);
    const totalListsCreated = results.length;
    return {
      totalImported,
      totalListsCreated,
      sheets: results,
      warnings,
    };
  }

  async saveBulkPrices(
    userId: string,
    firmaId: string,
    priceListId: string,
    items: { laborName: string; unit: string; unitPrice: number; category?: string }[],
    exchangeRate?: number,
  ) {
    const firma = await this.assertOwnership(firmaId, userId);

    let priceList;
    if (priceListId === 'auto') {
      priceList = await this.prisma.laborPriceList.findFirst({
        where: { firmaId },
        orderBy: { uploadedAt: 'desc' },
      });
      if (!priceList) {
        priceList = await this.prisma.laborPriceList.create({
          data: { name: `${firma.name} - ${new Date().toLocaleDateString('tr-TR')}`, firmaId },
        });
      }
    } else {
      priceList = await this.prisma.laborPriceList.findUnique({ where: { id: priceListId } });
      if (!priceList || priceList.firmaId !== firmaId) {
        throw new NotFoundException('Fiyat listesi bulunamadi');
      }
    }

    const validItems = items.filter((item) => {
      const name = item.laborName?.trim();
      const price = Number(item.unitPrice);
      if (!name || name.length < 2) return false;
      if (isNaN(price) || price <= 0) return false;
      return true;
    });

    if (validItems.length === 0) {
      return { imported: 0, skipped: items.length, total: items.length, firmaName: firma.name, priceListName: priceList.name };
    }

    let imported = 0;
    let skipped = 0;

    for (const item of validItems) {
      const name = item.laborName!.trim();
      const unit = item.unit?.trim() || 'Adet';
      let price = Number(item.unitPrice);

      if (exchangeRate && exchangeRate > 0) {
        price = Math.round(price * exchangeRate * 100) / 100;
      }

      // LaborItem global katalog (discipline bazli)
      let laborItem = await this.prisma.laborItem.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          discipline: firma.discipline,
        },
      });
      if (!laborItem) {
        const { generateTags } = require('../modules/matching/tag-generator');
        const tagged = generateTags(name);
        laborItem = await this.prisma.laborItem.create({
          data: {
            name,
            unit,
            unitPrice: price,
            discipline: firma.discipline,
            category: item.category,
            tags: tagged.tags,
            normalizedName: tagged.normalizedName,
            isGlobal: true,
          },
        });
      } else if (laborItem.tags?.length === 0) {
        const { generateTags } = require('../modules/matching/tag-generator');
        const tagged = generateTags(name);
        await this.prisma.laborItem.update({
          where: { id: laborItem.id },
          data: { tags: tagged.tags, normalizedName: tagged.normalizedName },
        });
      }

      await this.prisma.laborPrice.upsert({
        where: { laborItemId_firmaId_priceListId: { laborItemId: laborItem.id, firmaId, priceListId: priceList.id } },
        update: { unitPrice: price, unit },
        create: { laborItemId: laborItem.id, firmaId, priceListId: priceList.id, unitPrice: price, unit },
      });

      imported++;
    }

    return {
      imported,
      skipped,
      total: items.length,
      firmaName: firma.name,
      priceListName: priceList.name,
    };
  }
}
