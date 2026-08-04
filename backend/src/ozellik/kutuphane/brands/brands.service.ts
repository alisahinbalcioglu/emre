import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { SilmeEtkisi, EKONOMI_TASIYAN } from '../silme-etkisi';

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

    // ── KAYNAK SADAKATI (kullanici istegi 16.07): liste indekslenmisse havuz
    // gorunumu ProductIndex'ten beslenir — kullanicinin Excel'indeki 11 kolon
    // (Kategori/Ad/Cins/Baglanti/Cap/Boy/Birim/Fiyat/ParaBirimi/Kod/Not)
    // BIREBIR ve KAYNAK SIRASIYLA doner. Legacy birlesik-ad gorunumu yalniz
    // indekssiz eski listeler icin kalir. ("bazi kolonlar ortadan kalkiyor"
    // sikayetinin koku: bu uc legacy Material.name — birlesik ad — donuyordu.)
    const idx = await (this.prisma as any).productIndex.findMany({
      where: { priceListId },
      orderBy: [{ sortOrder: 'asc' }],
    });
    if (idx.length > 0) {
      return {
        priceList: pl,
        brand: pl.brand,
        materials: idx.map((p: any) => ({
          id: p.id,
          materialName: p.ad, // GERCEK Ad kolonu — birlesik ad degil
          unit: p.birim || 'Adet',
          price: p.price,
          currency: p.currency ?? 'TRY',
          kategori: p.kategori ?? null,
          cins: p.cins ?? null,
          baglanti: p.baglanti ?? null,
          cap: p.capRaw ?? null,
          boy: p.boyMm ?? null,
          urunKodu: p.urunKodu ?? null,
          not: p.not ?? null,
          sortOrder: p.sortOrder ?? 0,
        })),
        totalCount: idx.length,
      };
    }

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
        // Z4: havuz fiyati KENDI para birimiyle listeler ($15,00 · ₺637,00)
        currency: (p as any).currency ?? 'TRY',
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
      currency: (p as any).currency ?? 'TRY',
      brandName: p.brand.name,
      brandId: p.brand.id,
      priceListName: p.priceList?.name ?? '-',
      priceListId: p.priceListId,
    }));
  }

  // Admin CRUD
  async create(dto: CreateBrandDto) {
    const existing = await this.prisma.brand.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Bu marka zaten kayıtlı');
    return this.prisma.brand.create({ data: { name: dto.name, logoUrl: dto.logoUrl, discipline: dto.discipline ?? 'mechanical' } });
  }

  async update(id: string, dto: CreateBrandDto) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');
    const data: Record<string, unknown> = { name: dto.name };
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    return this.prisma.brand.update({ where: { id }, data });
  }

  /**
   * A-1 — Bir marka silinirse KUTUPHANEDE ne olur? (SALT-OKUMA)
   *
   * Fiyat listesi ucunun (admin.service `fiyatListesiSilmeEtkisi`) ESI ama
   * BASKA bir gercegi anlatir: burada satirlar GERCEKTEN silinir, cunku
   * asagidaki `remove` elle `deleteMany` kosar. Bu yuzden `etki` alani
   * 'satir-silinir' doner ve ekran metni "geri getirilemez" der.
   * Ayrinti: `../silme-etkisi.ts`.
   *
   * Filtre `remove`'un deleteMany filtresiyle AYNI (yalniz brandId — userId
   * YOK). Kasitli: sayim, gercekten silinecek kumeyi anlatmali. Capraz-tenant
   * gercegi `etkilenenKullanici` ile GORUNUR kilinir, gizlenmez.
   */
  async markaSilmeEtkisi(id: string): Promise<SilmeEtkisi> {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Marka bulunamadi');
    return this.etkiOlc(brand.name, { brandId: id } as any);
  }

  /** Verilen filtreye giren satirlarin kirilimli sayimi (TEK yerde —
   *  uc, 409 mesaji ve loglar ayni sayilari kullansin diye). */
  private async etkiOlc(ad: string, kosul: any): Promise<SilmeEtkisi> {
    const [ulSatiri, iskontoluSatir, ozelFiyatliSatir, kullanicilar] = await Promise.all([
      this.prisma.userLibrary.count({ where: kosul }),
      this.prisma.userLibrary.count({ where: { AND: [kosul, { discountRate: { gt: 0 } }] } as any }),
      this.prisma.userLibrary.count({ where: { AND: [kosul, { customPrice: { not: null } }] } as any }),
      this.prisma.userLibrary.findMany({ where: kosul, select: { userId: true }, distinct: ['userId'] }),
    ]);
    return {
      ad, etki: 'satir-silinir',
      ulSatiri, iskontoluSatir, ozelFiyatliSatir,
      etkilenenKullanici: kullanicilar.length,
    };
  }

  async remove(id: string, opts?: { kutuphaneSilmeOnayi?: boolean }) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');

    // ── EKONOMI KORUMASI ────────────────────────────────────────────────
    // Iskonto (discountRate) ve ozel fiyat (customPrice) kullanicinin
    // PAZARLIKLA elde ettigi veridir; silinirse hicbir yerden geri uretilemez.
    // Bu yuzden ekonomi tasiyan satir varsa ACIK ONAY olmadan silme BASLAMAZ.
    // Ekonomi tasimayan markalar (test markasi temizligi) onaysiz silinmeye
    // devam eder — asagidaki sayim 0 dondugunde bu blok atlanir.
    //
    // A-1: sayim artik `markaSilmeEtkisi` ile AYNI fonksiyondan gelir. Ayri
    // yazilsaydi ucun gosterdigi sayi ile 409 metnindeki sayi zamanla ayrisir
    // ve kullanici ekranda baska, hatada baska rakam gorurdu.
    const etki = await this.etkiOlc(brand.name, { brandId: id } as any);
    const ekonomiliSatir = await this.prisma.userLibrary.count({
      where: { brandId: id, OR: EKONOMI_TASIYAN } as any,
    });
    const etkilenenKullanici = etki.etkilenenKullanici;

    if (ekonomiliSatir > 0 && opts?.kutuphaneSilmeOnayi !== true) {
      throw new ConflictException(
        `"${brand.name}" markasi silinirse ${etki.ulSatiri} kutuphane satiri ` +
        `(${etkilenenKullanici} kullaniciya ait) kaldirilacak; bunlarin ${ekonomiliSatir} tanesi ` +
        `girilmis fiyat bilgisi tasiyor (${etki.iskontoluSatir} iskonto). Bu bilgi geri getirilemez. ` +
        `Devam etmek icin silme istegini onay ile tekrarlayin (?onaylandi=true).`,
      );
    }

    // UserLibrary.brand ZORUNLU iliski + onDelete tanimsiz (Restrict) —
    // kullanici kutuphane kayitlari temizlenmeden marka silinemiyordu
    // (FK hatasi: "Cayirova/TEST_MARKA_X silinemiyor" sikayeti).
    // Fiyat listeleri + havuz fiyatlari + UserBrandLibrary Cascade ile gider;
    // teklif kalemlerinde marka SetNull olur (teklifler bozulmaz).
    const [libDel] = await this.prisma.$transaction([
      this.prisma.userLibrary.deleteMany({ where: { brandId: id } }),
      this.prisma.brand.delete({ where: { id } }),
    ]);
    console.log(
      `[Brands] "${brand.name}" silindi — ${libDel.count} kullanici kutuphane kaydi temizlendi ` +
      `(${etkilenenKullanici} kullanici, ${ekonomiliSatir} fiyat bilgili satir)`,
    );
    return {
      ok: true,
      name: brand.name,
      deletedLibraryRows: libDel.count,
      deletedEconomyRows: ekonomiliSatir,
      affectedUsers: etkilenenKullanici,
      // Silme ONCESI olculen kirilim — toast'in "ne oldu" ozetini uydurmadan
      // yazabilmesi icin. (Silme SONRASI ayni sayim 0 dondururdu.)
      silmeEtkisi: etki,
    };
  }
}
