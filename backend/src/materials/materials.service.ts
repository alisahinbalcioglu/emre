import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

  async deletePrice(materialId: string, brandId: string) {
    return this.prisma.materialPrice.deleteMany({
      where: { materialId, brandId },
    });
  }
}
