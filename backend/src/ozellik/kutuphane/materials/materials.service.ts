import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateMaterialPriceDto } from './dto/create-material-price.dto';

@Injectable()
export class MaterialsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.material.findMany({
      include: {
        materialPrices: {
          include: { brand: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const mat = await this.prisma.material.findUnique({
      where: { id },
      include: { materialPrices: { include: { brand: true } } },
    });
    if (!mat) throw new NotFoundException('Material not found');
    return mat;
  }

  async create(dto: CreateMaterialDto) {
    const existing = await this.prisma.material.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Material already exists');
    return this.prisma.material.create({ data: { name: dto.name } });
  }

  async update(id: string, dto: CreateMaterialDto) {
    const mat = await this.prisma.material.findUnique({ where: { id } });
    if (!mat) throw new NotFoundException('Material not found');
    return this.prisma.material.update({ where: { id }, data: { name: dto.name } });
  }

  async remove(id: string) {
    const mat = await this.prisma.material.findUnique({ where: { id } });
    if (!mat) throw new NotFoundException('Material not found');
    return this.prisma.material.delete({ where: { id } });
  }

  async setPrice(dto: CreateMaterialPriceDto) {
    return this.prisma.materialPrice.upsert({
      where: {
        materialId_brandId_priceListId: {
          materialId: dto.materialId,
          brandId: dto.brandId,
          priceListId: null as unknown as string,
        },
      },
      update: { price: dto.price },
      create: {
        materialId: dto.materialId,
        brandId: dto.brandId,
        price: dto.price,
      },
    });
  }

  /** Fiyat sil — kapsam YAZMA ile ayni olmak ZORUNDA.
   *  setPrice (yukarida) yalniz `priceListId: null` satirini upsert eder;
   *  burada filtre verilmezse o marka+malzemenin TUM fiyat listelerindeki
   *  satirlari giderdi (MaterialPrice.priceListId opsiyonel — schema.prisma:280-281).
   *  Varsayilan `null` = tam olarak setPrice'in yazdigi satir.
   *  Kardes remove()/update() gibi olmayan kayitta NotFoundException atar;
   *  deleteMany count=0 hicbir sey silmedigi icin atma oncesi yan etki YOKTUR. */
  async deletePrice(materialId: string, brandId: string, priceListId: string | null = null) {
    const sonuc = await this.prisma.materialPrice.deleteMany({
      where: { materialId, brandId, priceListId },
    });
    if (sonuc.count === 0) throw new NotFoundException('Material price not found');
    return sonuc;
  }
}
