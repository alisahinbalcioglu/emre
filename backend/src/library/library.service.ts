import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { UpdateLibraryItemDto } from './dto/update-library-item.dto';
import { ImportPriceListDto } from './dto/import-price-list.dto';
import { BulkDiscountDto } from './dto/bulk-discount.dto';
import { BulkUpdateItemsDto } from './dto/bulk-update-items.dto';

@Injectable()
export class LibraryService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.userLibrary.findMany({
      where: { userId },
      include: {
        material: true,
        brand: true,
      },
      orderBy: { materialName: 'asc' },
    });
  }

  /** Sadece ekipman (kombi, pompa vs.) kategorisindeki kutuphane satirlari.
   *  DWG workspace equipment popup'u bu listeyi cekip autocomplete kullanir. */
  async findEquipment(userId: string) {
    return this.prisma.userLibrary.findMany({
      where: { userId, category: 'ekipman' },
      include: { material: true, brand: true },
      orderBy: { materialName: 'asc' },
    });
  }

  async create(userId: string, dto: CreateLibraryItemDto) {
    if (!dto.materialId && !dto.materialName) {
      throw new BadRequestException('Either materialId or materialName is required');
    }

    let resolvedName = dto.materialName;
    if (dto.materialId && !dto.materialName) {
      const mat = await this.prisma.material.findUnique({ where: { id: dto.materialId } });
      if (!mat) throw new NotFoundException('Material not found');
      resolvedName = mat.name;
    }

    return this.prisma.userLibrary.create({
      data: {
        userId,
        materialId: dto.materialId || null,
        materialName: resolvedName,
        brandId: dto.brandId,
        customPrice: dto.customPrice ?? null,
        discountRate: dto.discountRate ?? null,
        specs: (dto.specs as any) ?? undefined,
        category: dto.category ?? null,
      },
      include: { material: true, brand: true },
    });
  }

  async update(userId: string, id: string, dto: UpdateLibraryItemDto) {
    const item = await this.prisma.userLibrary.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Library item not found');

    const data: Record<string, unknown> = {};
    if (dto.brandId !== undefined) data.brandId = dto.brandId;
    if (dto.customPrice !== undefined) data.customPrice = dto.customPrice;
    if (dto.discountRate !== undefined) data.discountRate = dto.discountRate;
    if (dto.listPrice !== undefined) data.listPrice = dto.listPrice;
    if (dto.specs !== undefined) data.specs = dto.specs as any;
    if (dto.category !== undefined) data.category = dto.category;

    return this.prisma.userLibrary.update({
      where: { id },
      data,
      include: { material: true, brand: true },
    });
  }

  async bulkUpdateDiscount(userId: string, dto: BulkDiscountDto) {
    const result = await this.prisma.userLibrary.updateMany({
      where: { userId, brandId: dto.brandId },
      data: { discountRate: dto.discountRate },
    });
    return { updated: result.count, brandId: dto.brandId, discountRate: dto.discountRate };
  }

  async bulkUpdateItems(userId: string, dto: BulkUpdateItemsDto) {
    const result = await this.prisma.userLibrary.updateMany({
      where: {
        id: { in: dto.ids },
        userId,
      },
      data: { discountRate: dto.discountRate },
    });
    return { updated: result.count, discountRate: dto.discountRate };
  }

  async remove(userId: string, id: string) {
    const item = await this.prisma.userLibrary.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Library item not found');
    return this.prisma.userLibrary.delete({ where: { id } });
  }

  async importPriceList(userId: string, dto: ImportPriceListDto) {
    const priceList = await this.prisma.priceList.findUnique({
      where: { id: dto.priceListId },
      include: { brand: true },
    });
    if (!priceList) throw new NotFoundException('Fiyat listesi bulunamadi');
    if (priceList.brandId !== dto.brandId) {
      throw new BadRequestException('Fiyat listesi bu markaya ait degil');
    }

    const items = await this.prisma.materialPrice.findMany({
      where: { priceListId: dto.priceListId },
      include: { material: true },
    });

    if (items.length === 0) {
      throw new BadRequestException('Bu fiyat listesinde malzeme yok');
    }

    // Mevcut kutuphane kayitlarini kontrol et (ayni malzeme+marka tekrar eklenmemeli)
    const existing = await this.prisma.userLibrary.findMany({
      where: {
        userId,
        brandId: dto.brandId,
        sourcePriceListId: dto.priceListId,
      },
      select: { materialId: true, materialName: true },
    });
    const existingKeys = new Set(
      existing.map((e) => e.materialId || e.materialName),
    );

    const newItems = items.filter(
      (item) => !existingKeys.has(item.materialId),
    );

    if (newItems.length === 0) {
      return { imported: 0, skipped: items.length, brandName: priceList.brand.name };
    }

    await this.prisma.userLibrary.createMany({
      data: newItems.map((item) => ({
        userId,
        materialId: item.materialId,
        materialName: item.material.name,
        brandId: dto.brandId,
        listPrice: item.price,
        unit: item.material.unit || 'Adet',
        sourcePriceListId: dto.priceListId,
      })),
    });

    // UserBrandLibrary sheets guncelle/olustur — tum kullanicinin o markaya ait
    // UserLibrary satirlarindan sentetik sheet yeniden olustur
    await this.rebuildUserBrandLibrary(userId, dto.brandId);

    return {
      imported: newItems.length,
      skipped: items.length - newItems.length,
      brandName: priceList.brand.name,
      listName: priceList.name,
    };
  }

  // ── UserBrandLibrary sheets builder ──
  // UserLibrary satirlarindan tek sheet'lik synthetic grid olusturur.
  // Her satir: no (sira), materialName, unit, listPrice, discountRate, netPrice (computed)
  // Sistem ExcelGrid bu sheets'i okuyup library mode ile render eder.
  async rebuildUserBrandLibrary(userId: string, brandId: string) {
    const items = await this.prisma.userLibrary.findMany({
      where: { userId, brandId },
      orderBy: { materialName: 'asc' },
    });

    if (items.length === 0) {
      // Kutuphanede hic satir yoksa UserBrandLibrary'yi sil
      await this.prisma.userBrandLibrary.deleteMany({ where: { userId, brandId } });
      return null;
    }

    // Synthetic single-sheet olustur
    // Kolonlar: col0=No, col1=MalzemeAdi, col2=Birim, col3=ListeFiyat
    const columnDefs = [
      { field: 'col0', headerName: 'No', width: 60, editable: false },
      { field: 'col1', headerName: 'Malzeme Adi', width: 400, editable: true },
      { field: 'col2', headerName: 'Birim', width: 100, editable: true },
      { field: 'col3', headerName: 'Liste Fiyat', width: 130, editable: true },
    ];
    const columnRoles = {
      noField: 'col0',
      nameField: 'col1',
      unitField: 'col2',
      materialUnitPriceField: 'col3',
    };
    // Header row + data rows
    const rowData: any[] = [
      { _rowIdx: 0, _isDataRow: false, _isHeaderRow: true, col0: 'No', col1: 'Malzeme Adi', col2: 'Birim', col3: 'Liste Fiyat' },
    ];
    items.forEach((item, i) => {
      const listPrice = item.customPrice ?? item.listPrice ?? 0;
      rowData.push({
        _rowIdx: i + 1,
        _isDataRow: true,
        _isHeaderRow: false,
        _libraryItemId: item.id, // UserLibrary satir ID'si — save sirasinda geri donebilmek icin
        _libraryDiscountRate: item.discountRate ?? 0,
        col0: String(i + 1),
        col1: item.materialName ?? '',
        col2: item.unit ?? 'Adet',
        col3: listPrice,
      });
    });

    const sheets = [
      {
        name: 'Fiyat Listesi',
        index: 0,
        columnDefs,
        rowData,
        columnRoles,
        headerEndRow: 0,
        isEmpty: false,
        discipline: null,
      },
    ];

    const result = await this.prisma.userBrandLibrary.upsert({
      where: { userId_brandId: { userId, brandId } },
      create: { userId, brandId, sheets: { sheets } as any },
      update: { sheets: { sheets } as any },
    });
    return result;
  }

  // ── GET — ExcelGrid render icin sheets + guncel iskontolar ──
  async getBrandSheets(userId: string, brandId: string) {
    const lib = await this.prisma.userBrandLibrary.findUnique({
      where: { userId_brandId: { userId, brandId } },
    });

    // Eger yoksa, UserLibrary satirlarindan sentetik olustur (migration fallback)
    if (!lib) {
      const count = await this.prisma.userLibrary.count({ where: { userId, brandId } });
      if (count === 0) throw new NotFoundException('Kutuphanenizde bu markaya ait kayit yok');
      const created = await this.rebuildUserBrandLibrary(userId, brandId);
      if (!created) throw new NotFoundException('Olusturulamadi');
      return created;
    }

    return lib;
  }

  // ── SAVE — ExcelGrid'den gelen dirty satirlari kaydet ──
  // body: { dirtyRows: [{ libraryItemId, listPrice, discountRate, materialName?, unit? }] }
  async saveBrandSheets(
    userId: string,
    brandId: string,
    dirtyRows: Array<{
      libraryItemId: string;
      listPrice?: number;
      discountRate?: number;
      materialName?: string;
      unit?: string;
    }>,
  ) {
    if (!Array.isArray(dirtyRows) || dirtyRows.length === 0) {
      return { updated: 0 };
    }

    let updated = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const row of dirtyRows) {
      try {
        const item = await this.prisma.userLibrary.findFirst({
          where: { id: row.libraryItemId, userId, brandId },
        });
        if (!item) {
          errors.push({ id: row.libraryItemId, error: 'Bulunamadi' });
          continue;
        }

        const data: any = {};
        if (row.listPrice !== undefined && !isNaN(row.listPrice) && row.listPrice >= 0) {
          data.listPrice = row.listPrice;
          data.customPrice = row.listPrice;
        }
        if (row.discountRate !== undefined && !isNaN(row.discountRate)) {
          data.discountRate = Math.max(0, Math.min(100, row.discountRate));
        }
        if (row.materialName && row.materialName.trim().length >= 2) {
          data.materialName = row.materialName.trim();
        }
        if (row.unit !== undefined) data.unit = row.unit.trim() || 'Adet';

        await this.prisma.userLibrary.update({ where: { id: item.id }, data });
        updated++;
      } catch (e: any) {
        errors.push({ id: row.libraryItemId, error: e?.message ?? 'Bilinmeyen' });
      }
    }

    // Sheets'i yeniden olustur (guncel iskontolar dahil)
    await this.rebuildUserBrandLibrary(userId, brandId);

    return { updated, errors };
  }

  // Kullanici markayi kutuphanesinden tamamen cikarir
  async removeBrandFromLibrary(userId: string, brandId: string) {
    await this.prisma.userLibrary.deleteMany({ where: { userId, brandId } });
    await this.prisma.userBrandLibrary.deleteMany({ where: { userId, brandId } });
    return { ok: true };
  }
}
