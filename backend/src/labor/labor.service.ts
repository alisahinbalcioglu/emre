import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LaborService {
  constructor(private prisma: PrismaService) {}

  async findAll(discipline?: string) {
    const where = discipline ? { discipline: discipline as any } : {};
    return this.prisma.laborItem.findMany({
      where,
      orderBy: [{ discipline: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.laborItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('İşçilik kalemi bulunamadı');
    return item;
  }

  async create(data: {
    name: string;
    unit?: string;
    unitPrice: number;
    discipline: 'mechanical' | 'electrical';
    category?: string;
    description?: string;
  }) {
    return this.prisma.laborItem.create({
      data: {
        name: data.name,
        unit: data.unit ?? 'Adet',
        unitPrice: data.unitPrice,
        discipline: data.discipline,
        category: data.category,
        description: data.description,
      },
    });
  }

  async update(id: string, data: Partial<{
    name: string;
    unit: string;
    unitPrice: number;
    discipline: 'mechanical' | 'electrical';
    category: string;
    description: string;
  }>) {
    await this.findOne(id);
    return this.prisma.laborItem.update({ where: { id }, data: data as any });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.laborItem.delete({ where: { id } });
  }

  /** Malzeme adına göre en uygun işçilik kalemini bul */
  async matchLabor(materialName: string, discipline: string): Promise<{ id: string; name: string; unitPrice: number } | null> {
    const nameLower = materialName.toLowerCase();

    // Tam eşleşme
    let item = await this.prisma.laborItem.findFirst({
      where: {
        discipline: discipline as any,
        name: { equals: materialName, mode: 'insensitive' },
      },
    });

    // Kısmi eşleşme
    if (!item && nameLower.length >= 5) {
      item = await this.prisma.laborItem.findFirst({
        where: {
          discipline: discipline as any,
          name: { contains: nameLower.slice(0, 20), mode: 'insensitive' },
        },
      });
    }

    if (!item) return null;
    return { id: item.id, name: item.name, unitPrice: item.unitPrice };
  }
}
