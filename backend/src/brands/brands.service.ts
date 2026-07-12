import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';

@Injectable()
export class BrandsService {
  constructor(private prisma: PrismaService) {}

  async findAll(discipline?: string) {
    const where = discipline ? { discipline } : {};
    const brands = await this.prisma.brand.findMany({
      where,
      include: { _count: { select: { priceLists: true, materialPrices: true } } },
      orderBy: { name: 'asc' },
    });
    return brands;
  }

  async findOne(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  // Bir markanin fiyat listeleri (public — tum kullanicilar gorebilir)
  async getBrandPriceLists(brandId: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadi');

    const priceLists = await this.prisma.priceList.findMany({
      where: { brandId },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return { brand, priceLists };
  }

  // Bir fiyat listesinin malzemeleri (public)
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
        materialName: p.material.name,
        unit: p.material.unit || 'Adet',
        price: p.price,
      })),
      totalCount: items.length,
    };
  }

  // Global arama — tum markalarda malzeme ara
  async searchMaterials(query: string) {
    if (!query || query.trim().length < 2) return [];

    const prices = await this.prisma.materialPrice.findMany({
      where: {
        material: { name: { contains: query.trim(), mode: 'insensitive' } },
      },
      include: {
        material: true,
        brand: true,
        priceList: true,
      },
      orderBy: { material: { name: 'asc' } },
      take: 100,
    });

    return prices.map((p) => ({
      materialName: p.material.name,
      unit: p.material.unit || 'Adet',
      price: p.price,
      brandName: p.brand.name,
      brandId: p.brand.id,
      priceListName: p.priceList?.name ?? '-',
      priceListId: p.priceListId,
    }));
  }

  // Admin CRUD
  async create(dto: CreateBrandDto) {
    const existing = await this.prisma.brand.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Brand already exists');
    return this.prisma.brand.create({ data: { name: dto.name, logoUrl: dto.logoUrl, discipline: dto.discipline ?? 'mechanical' } });
  }

  async update(id: string, dto: CreateBrandDto) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');
    const data: Record<string, unknown> = { name: dto.name };
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    return this.prisma.brand.update({ where: { id }, data });
  }

  async remove(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');
    // UserLibrary.brand ZORUNLU iliski + onDelete tanimsiz (Restrict) —
    // kullanici kutuphane kayitlari temizlenmeden marka silinemiyordu
    // (FK hatasi: "Cayirova/TEST_MARKA_X silinemiyor" sikayeti).
    // Fiyat listeleri + havuz fiyatlari + UserBrandLibrary Cascade ile gider;
    // teklif kalemlerinde marka SetNull olur (teklifler bozulmaz).
    const [libDel] = await this.prisma.$transaction([
      this.prisma.userLibrary.deleteMany({ where: { brandId: id } }),
      this.prisma.brand.delete({ where: { id } }),
    ]);
    console.log(`[Brands] "${brand.name}" silindi — ${libDel.count} kullanici kutuphane kaydi temizlendi`);
    return { ok: true, name: brand.name, deletedLibraryRows: libDel.count };
  }
}
