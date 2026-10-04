import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { MatchingService } from '../../eslestirme/matching/matching.service';
import { generateTags } from '../../eslestirme/matching/tag-generator';
import { katalogda } from './iscilik-kalemi-kapsami';

const SIRA = [{ discipline: 'asc' as const }, { category: 'asc' as const }, { name: 'asc' as const }];

function disiplinKosulu(discipline?: string) {
  return discipline ? { discipline: discipline as any } : {};
}

/**
 * YONETICI ISCILIK KATALOGU. 30.09.2026 (Paket 1 / C2): tablo artik iki tur
 * satir tasir — KATALOG (`ownerFirmaId` null) ve KIRACI kalemi (kural yeri
 * `iscilik-kalemi-kapsami.ts`). Bu servisin HER yolu yalniz katalogda
 * calisir: kiraci kalemi yonetici ekranina dusmez, oradan duzenlenip
 * silinemez (silinse kiracinin fiyat satirlari CASCADE giderdi). Kiraci
 * kalemlerine yalniz kiracinin kendi iscilik firmasi yollari dokunur
 * (`labor-firms.service.ts`). Okuma uclari da YALNIZ yoneticiye acik
 * (Emre 30.09 — `labor.controller.ts`).
 */
@Injectable()
export class LaborService {
  constructor(
    private prisma: PrismaService,
    private matching: MatchingService,
  ) {}

  /** YONETICI KATALOGU: yalniz sahipsiz kalemler. */
  findAll(discipline?: string) {
    return this.prisma.laborItem.findMany({
      where: katalogda(disiplinKosulu(discipline)),
      orderBy: SIRA,
    });
  }

  /** Tekil katalog kalemi — kiraci kalemi "yok" ile AYNI yanit (404). */
  async findOne(id: string) {
    const item = await this.prisma.laborItem.findFirst({ where: katalogda({ id }) });
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
    const unit = data.unit ?? 'Adet';
    return this.prisma.laborItem.create({
      data: {
        name: data.name,
        unit,
        unitPrice: data.unitPrice,
        discipline: data.discipline,
        category: data.category,
        description: data.description,
        ...this.indeksAlanlari(data.name, unit),
      },
    });
  }

  /**
   * Katalog kalemi YAZILIRKEN indekslenir (01.10.2026, inceleme W2). Katalog
   * kalemine indeks yazan tek yol kiracinin yeniden indekslemesiydi; C2 ile
   * o yol yalniz kiracinin KENDI kalemine yaziyor. Yonetici adi degistirince
   * guncel surumde ESKI adin indeksi kalir, eslestirme eski adi kullanirdi.
   * Kiraci yuklemesiyle AYNI indeksleyici (`laborItemIndexData`).
   */
  private indeksAlanlari(name: string, unit: string) {
    const tagged = generateTags(name);
    return {
      tags: tagged.tags,
      normalizedName: tagged.normalizedName,
      ...this.matching.laborItemIndexData(name, unit),
    };
  }

  /** YONETICI: katalog kalemlerini guncel surumle yeniden indeksler (W2). */
  yenidenIndeksle() {
    return this.matching.reindexLaborKatalog();
  }

  /**
   * Yalniz katalog kalemi, yalniz ekranin gonderdigi alanlar. Govde `any`
   * geliyor: alanlar tek tek alinmasa `ownerFirmaId`/`isGlobal` govdeyle
   * yazilip katalog kalemi bir kiraciya (ya da tersi) tasinabilirdi.
   */
  async update(id: string, data: Partial<{
    name: string;
    unit: string;
    unitPrice: number;
    discipline: 'mechanical' | 'electrical';
    category: string;
    description: string;
  }>) {
    const mevcut = await this.findOne(id);
    const { name, unit, unitPrice, discipline, category, description } = data ?? {};
    const yeniAd = name ?? mevcut.name;
    const yeniBirim = unit ?? mevcut.unit;
    const indeks = yeniAd !== mevcut.name || yeniBirim !== mevcut.unit ? this.indeksAlanlari(yeniAd, yeniBirim) : {};
    return this.prisma.laborItem.update({
      where: { id },
      data: { name, unit, unitPrice, discipline, category, description, ...indeks },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.laborItem.delete({ where: { id } });
  }
}
