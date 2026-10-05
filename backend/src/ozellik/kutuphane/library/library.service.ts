import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { Kimlik } from '../../../altyapi/auth/kimlik';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { UpdateLibraryItemDto } from './dto/update-library-item.dto';
import { ImportPriceListDto } from './dto/import-price-list.dto';
import { BulkDiscountDto } from './dto/bulk-discount.dto';
import { BulkUpdateItemsDto } from './dto/bulk-update-items.dto';
import { CreateManualBrandDto, MALZEME_ADI_AZAMI, ManualBrandRowDto } from './dto/create-manual-brand.dto';
import { AddLibraryRowsDto } from './dto/add-library-rows.dto';
import { ayniBirim, buildLibrarySheetRows, gosterilenAd, gosterilenFiyatBirimi, havuzFiyatAyrisimi } from './library-sheet-builder';
import { turetilmisIndeksAlanlari } from '../urun-indeksi-alanlari';
import {
  buildProductIndex,
  ProductColumns,
} from '../../eslestirme/matching/index/product-index';
import { TerminologyService } from '../../eslestirme/matching/terminology.service';
import { paraBirimleriniDogrula, satirAdi } from '../../fiyat/exchange-rates/exchange-rates.service';
import { GECERSIZ_SATIR_KIMLIGI, satirHatalari, satirKimligiGecerli } from '../satir-hatalari';

const GECERSIZ_SATIR_VERISI = 'Geçersiz satır verisi (fiyat ve iskonto sayı, ad ve birim metin olmalı).';
const AD_COK_UZUN = `Malzeme adı en fazla ${MALZEME_ADI_AZAMI} karakter olabilir.`;

/** Izgara kaydi satirinin alan turleri (P4a): sayi alanlari sonlu sayi, metin
 *  alanlari dize ya da HIC yok (undefined) — yoksa DB'ye gitmez. `null` de
 *  reddedilir: on yuz gondermez, kod onu "fiyati sil" (listPrice/customPrice
 *  null), "iskonto 0" ve `trim` hatasi diye isliyordu (inceleme P4a). */
function kutuphaneSatiriGecerli(row: { listPrice?: unknown; discountRate?: unknown; materialName?: unknown; unit?: unknown }): boolean {
  const sayiMi = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v));
  const metinMi = (v: unknown) => v === undefined || typeof v === 'string';
  return sayiMi(row.listPrice) && sayiMi(row.discountRate) && metinMi(row.materialName) && metinMi(row.unit);
}

/**
 * Kutuphane gorunumunun (sheet) UserLibrary join'leri — iki cagiran AYNI icerik.
 * 16.07: Baglanti/Boy/Kod/Not tek gercek ProductIndex'te. Tur 3 A4c (14.09):
 * indeks ve kaynak listenin SAHIP alanlari → `havuzFiyatAyrisimi` (K1 ayrismis
 * fiyat isareti; migration'daki "havuza bagli" tanimi).
 */
const KUTUPHANE_GORUNUM_ICERIGI = {
  product: { select: { baglanti: true, boyMm: true, urunKodu: true, not: true, ownerUserId: true, ownerFirmaId: true } },
  sourcePriceList: { select: { ownerUserId: true, ownerFirmaId: true } },
};

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    private prisma: PrismaService,
    private terminology: TerminologyService,
  ) {}

  async findAll(k: Kimlik) {
    return this.prisma.userLibrary.findMany({
      where: { firmaId: k.firmaId },
      include: {
        material: true,
        brand: true,
        // 16.07: Excel'in kalan kolonlari (Baglanti/Boy/Kod/Not) kutuphane
        // gorunumune de gelsin — tek gercek ProductIndex'te, kopyalanmaz.
        product: {
          select: { baglanti: true, boyMm: true, urunKodu: true, not: true },
        },
      } as any,
      orderBy: { materialName: 'asc' },
    });
  }

  /** Kullanicinin kutuphanesindeki DISTINCT markalar — teklif grid'inin
   *  Marka dropdown kaynagi (Kutuphanem izolasyonu). Global havuz DEGIL. */
  async findLibraryBrands(k: Kimlik) {
    const rows = await this.prisma.userLibrary.findMany({
      where: { firmaId: k.firmaId },
      distinct: ['brandId'],
      select: {
        brand: { select: { id: true, name: true, discipline: true, logoUrl: true } },
      },
      orderBy: { brandId: 'asc' },
    });
    return rows.map((r) => r.brand);
  }


  async create(k: Kimlik, dto: CreateLibraryItemDto) {
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
        userId: k.userId,
        firmaId: k.firmaId,
        materialId: dto.materialId || null,
        materialName: resolvedName,
        brandId: dto.brandId,
        customPrice: dto.customPrice ?? null,
        // C3 (P4b): ozel fiyat satirin birimiyle (varsayilan TRY) dondurulur
        customPriceCurrency: dto.customPrice != null ? 'TRY' : null,
        discountRate: dto.discountRate ?? null,
      },
      include: { material: true, brand: true },
    });
  }

  /**
   * "Marka Ekle" — kullanici bos tabloyu (foto 3 formati) elle doldurup yeni
   * bir marka olusturur. Havuz Excel/PDF yolu YOK; satirlar dogrudan kullanicinin
   * kutuphanesine yazilir.
   *
   * Admin ice-aktarim ile AYNI indeksleme sozlesmesi (admin.service save-bulk):
   *  - Her satir buildProductIndex ile 11 kolondan indekslenir → ProductIndex
   *    (ownerUserId=k.userId → kullanicinin kendi manuel satiri, havuz DEGIL).
   *  - Baglanti/Boy/Kod/Not TEK gercek ProductIndex'te yasar → kutuphane gorunumu
   *    (rebuildUserBrandLibrary → product join) bu alanlari cizer.
   *  - UserLibrary.productIndexId indekse baglanir → v2 motor bu markayi "indeksli"
   *    sayar; iskonto (discountRate) kullaniciya ait kalir.
   *  - KÜTÜPHANE=HAFIZA: sozluksuz ama anlamli-adli urunler self-family olur ve
   *    learnFamilyAliases ile (PER-USER) ogrenilir.
   */
  async createManualBrand(k: Kimlik, dto: CreateManualBrandDto) {
    const brandName = dto.brandName?.trim();
    if (!brandName) throw new BadRequestException('Marka adi zorunlu');

    const discipline = dto.discipline === 'electrical' ? 'electrical' : 'mechanical';

    // Bos ad'li satirlar elenir (spare/yarim satirlar); para birimi marka
    // acilmadan dogrulanir (KUR-02).
    const rows = this.doluSatirlar(dto.rows ?? []);
    if (rows.length === 0) {
      throw new BadRequestException('En az bir malzeme satiri (Malzeme Adi dolu) gerekli');
    }

    // ── Marka: ad @unique → find-or-create. Ayni isim havuzda varsa ona baglanir
    //    (kullanicinin satirlari ownerUserId ile izole kalir). YENI acilan marka
    //    isGlobal:false — kullanicinin kisisel kapsayicisidir, havuz/admin
    //    listelerinde GORUNMEZ (24.08 kullanici bildirimi: kutuphane klasorleri
    //    admin panelde listeleniyordu). Mevcut markaya baglanirken update:{}
    //    bilerek bos: havuz markasi kisisellesmez, kisisel marka havuzlasmaz. ──
    const brand = await this.prisma.brand.upsert({
      where: { name: brandName },
      update: {},
      create: { name: brandName, discipline, isGlobal: false },
    });

    // Her "Marka Ekle" islemi kendi fiyat listesini olusturur (kaynak izlenebilir).
    // ownerUserId: liste KISISELDIR — havuz/admin gorunumleri null suzer
    // (ProductIndex.ownerUserId sozlesmesinin liste-duzeyi ikizi).
    const priceList = await this.prisma.priceList.create({
      data: {
        name: `${brandName} — Manuel Liste`,
        brandId: brand.id,
        // ownerUserId = ACAN kisi (iz), ownerFirmaId = SAHIP (suzgec).
        ownerUserId: k.userId,
        ownerFirmaId: k.firmaId,
      },
    });

    const sonuc = await this.insertLibraryRows(k, brand.id, priceList.id, null, rows, 0);

    await this.rebuildUserBrandLibrary(k, brand.id);

    console.log(`[ManualBrand] "${brandName}" (${discipline}): ${sonuc.created} satir, ${sonuc.belirsiz} belirsiz, ${sonuc.ogrenilenAile} self-family (userId=${k.userId})`);

    return {
      brandId: brand.id,
      brandName: brand.name,
      created: sonuc.created,
      belirsiz: sonuc.belirsiz,
      ogrenilenAile: sonuc.ogrenilenAile,
    };
  }

  /**
   * Adi dolu satirlar, para birimi YAZIMDAN ONCE dogrulanmis (KUR-02, tur 3 A3).
   * Gecersiz kod ('EURO', '$', 'GBP', bos) → 400; marka/liste/satir ACILMAZ.
   * Eski hali ham yaziyordu ('usd' → 'usd', '   ' → '   '). Satir numarasi
   * kullanicinin tablosundaki sira (bos satirlar elenmeden once).
   */
  private doluSatirlar(tum: ManualBrandRowDto[]): ManualBrandRowDto[] {
    const dolu = tum.map((r, sira) => ({ r, sira })).filter(({ r }) => (r.ad ?? '').trim().length > 0);
    const kodlar = paraBirimleriniDogrula(dolu, ({ r }) => r.currency, ({ r, sira }) => satirAdi(`Satır ${sira + 1}`, r.ad));
    return dolu.map(({ r }, i) => ({ ...r, currency: kodlar[i] }));
  }

  /**
   * ORTAK SATIR EKLEME CEKIRDEGI — createManualBrand ve addRowsToBrandList
   * ayni indeksleme + ogrenme sozlesmesinden gecer (tek yol, iki kapi):
   * her satir buildProductIndex ile indekslenir (ProductIndex.ownerUserId),
   * UserLibrary satiri indekse baglanir, self-family adlar PER-USER ogrenilir.
   */
  private async insertLibraryRows(
    k: Kimlik,
    brandId: string,
    priceListId: string,
    libraryListId: string | null,
    rows: ManualBrandRowDto[],
    sortBase: number,
  ): Promise<{ created: number; belirsiz: number; ogrenilenAile: number }> {
    const p = this.prisma as any;
    let created = 0;
    let belirsizSayisi = 0;
    const gorulenRowKeys = new Set<string>();
    const rowKeyTekrar = new Map<string, number>();
    // KÜTÜPHANE=HAFIZA: self-family adBucket → canonical ad
    const ogrenilecekAileler = new Map<string, string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const price = typeof r.price === 'number' && !isNaN(r.price) ? r.price : 0;
      const boyMm = r.boy != null && String(r.boy).trim() !== ''
        ? parseFloat(String(r.boy).replace(',', '.')) || null
        : null;

      const pcols: ProductColumns = {
        kategori: r.kategori?.trim() || null,
        ad: r.ad.trim(),
        cins: r.cins?.trim() || null,
        baglanti: r.baglanti?.trim() || null,
        cap: r.cap?.trim() || null,
        boy: boyMm,
        birim: r.birim?.trim() || null,
        price,
        paraBirimi: r.currency || 'TRY',
        urunKodu: r.urunKodu?.trim() || null,
        not: r.not?.trim() || null,
        sheetName: 'Manuel',
        sourceRow: i,
        sortOrder: sortBase + i,
      };
      const idx = buildProductIndex(pcols);

      if (idx.belirsiz) belirsizSayisi++;
      // ADIM: sozluk GERCEKTEN cozemedi mi? Onceden `adSlug === adBucket`
      // proxy'siydi; sozlugun cozdugu tek kelimelik adlarda (Sprinkler, Fan,
      // Damper...) YANLIS atesliyor ve o adin kelimesini yutan bir alias
      // ogreniyordu (bkz. test/alias-kelime-yutma-test.ts).
      else if (idx.selfFamily && !ogrenilecekAileler.has(idx.adBucket)) {
        ogrenilecekAileler.set(idx.adBucket, pcols.ad);
      }

      // rowKey cakismasi (ayni demet iki kez) → #2/#3 soneki, idempotent sira
      let rowKey = idx.rowKey;
      if (gorulenRowKeys.has(rowKey)) {
        const kacinci = (rowKeyTekrar.get(idx.rowKey) ?? 1) + 1;
        rowKeyTekrar.set(idx.rowKey, kacinci);
        rowKey = `${idx.rowKey}#${kacinci}`;
      }
      gorulenRowKeys.add(rowKey);

      const pi = await p.productIndex.create({
        data: {
          brandId,
          priceListId,
          ownerUserId: k.userId,   // ← ACAN kisi (iz)
          ownerFirmaId: k.firmaId, // ← SAHIP firma (suzgec; havuz = null)
          kategori: pcols.kategori, ad: pcols.ad, cins: pcols.cins,
          baglanti: pcols.baglanti, capRaw: pcols.cap, boyMm,
          birim: pcols.birim, price, currency: pcols.paraBirimi ?? 'TRY',
          urunKodu: pcols.urunKodu, not: pcols.not,
          sheetName: pcols.sheetName, sourceRow: pcols.sourceRow, sortOrder: pcols.sortOrder,
          // Turetilmis alanlar ORTAK listeden (P4b 05.10): elle yazilan liste
          // S4/S5'in `malzemeler`/`aileZayif` alanlarini atliyordu — manuel
          // urun surum atlamasina dek varsayilanla ([] / false) kaliyordu
          // (yeniden indeksleme guncel surumu atlar).
          ...turetilmisIndeksAlanlari(idx),
          rowKey,
        },
      });

      await this.prisma.userLibrary.create({
        data: {
          userId: k.userId,
          firmaId: k.firmaId,
          brandId,
          sourcePriceListId: priceListId,
          libraryListId,
          productIndexId: pi.id,
          materialId: null,
          materialName: idx.displayName,
          adRaw: pcols.ad,
          listPrice: price,
          customPrice: price,
          currency: pcols.paraBirimi ?? 'TRY',
          customPriceCurrency: pcols.paraBirimi ?? 'TRY', // C3 (P4b): ozel fiyat liste birimiyle dogar
          unit: pcols.birim || 'Adet',
          kategori: pcols.kategori,
          cins: pcols.cins,
          cap: pcols.cap,
          discountRate: r.discountRate ?? null,
          sortOrder: sortBase + i,
        } as any,
      });
      created++;
    }

    // KÜTÜPHANE=HAFIZA (PER-USER): sozluksuz self-family adlari kullaniciya ozel
    // aile olarak ogren → kullanicinin satirlari ayni aileye kilitlenir.
    if (ogrenilecekAileler.size > 0) {
      await this.terminology.learnFamilyAliases(
        Array.from(ogrenilecekAileler, ([adBucket, canonical]) => ({ adBucket, canonical })),
        k.userId,
      ).catch((e) => console.warn('[ManualBrand] aile ogrenme atlandi:', (e as Error).message));
    }

    return { created, belirsiz: belirsizSayisi, ogrenilenAile: ogrenilecekAileler.size };
  }

  async update(k: Kimlik, id: string, dto: UpdateLibraryItemDto) {
    const item = await this.prisma.userLibrary.findFirst({ where: { id, firmaId: k.firmaId } });
    if (!item) throw new NotFoundException('Library item not found');

    const data: Record<string, unknown> = {};
    if (dto.brandId !== undefined) data.brandId = dto.brandId;
    if (dto.customPrice !== undefined) {
      data.customPrice = dto.customPrice;
      // C3 (P4b): ozel fiyat ekranda GOSTERILEN birimde girilir ve o birimde kalir
      data.customPriceCurrency = dto.customPrice === null ? null : gosterilenFiyatBirimi(item);
    }
    if (dto.discountRate !== undefined) data.discountRate = dto.discountRate;
    if (dto.listPrice !== undefined) data.listPrice = dto.listPrice;

    return this.prisma.userLibrary.update({
      where: { id },
      data,
      include: { material: true, brand: true },
    });
  }

  async bulkUpdateDiscount(k: Kimlik, dto: BulkDiscountDto) {
    const result = await this.prisma.userLibrary.updateMany({
      where: { firmaId: k.firmaId, brandId: dto.brandId },
      data: { discountRate: dto.discountRate },
    });
    return { updated: result.count, brandId: dto.brandId, discountRate: dto.discountRate };
  }

  async bulkUpdateItems(k: Kimlik, dto: BulkUpdateItemsDto) {
    const result = await this.prisma.userLibrary.updateMany({
      where: {
        id: { in: dto.ids },
        firmaId: k.firmaId,
      },
      data: { discountRate: dto.discountRate },
    });
    return { updated: result.count, discountRate: dto.discountRate };
  }

  async remove(k: Kimlik, id: string) {
    const item = await this.prisma.userLibrary.findFirst({ where: { id, firmaId: k.firmaId } });
    if (!item) throw new NotFoundException('Library item not found');
    // P4b Parti 3 (06.10): markanin SON satiri silinince marka kutuphaneden
    // cikmis olur — sekmeleri ve kaydi da (ayni islemde; `markaBosaldiysaKaldir`).
    return this.prisma.$transaction(async (tx) => {
      const silinen = await tx.userLibrary.delete({ where: { id } });
      await this.markaBosaldiysaKaldir(tx, k, item.brandId);
      return silinen;
    });
  }

  /**
   * Firma bu markada SATIRSIZ kaldiysa marka kutuphaneden cikmistir: liste
   * sekmeleri ve marka kaydi da gider — `removeBrandFromLibrary` ile ayni
   * sonuc. Satir silen yollar (tek satir, sekme) ISLEMIN ICINDE cagirir.
   * Eskiden tek tek silmede sekmeler ve eski gorunum JSON'lu marka kaydi
   * kaliyordu; yeniden aktarimda satirlar en eski artik sekmeye baglanir,
   * digerleri "(0)" gelirdi (inceleme LOW-1, 05.10; canlida artik 0).
   * Doner: marka bosaldi mi (kayit silindiyse yeniden kurulacak gorunum yok).
   */
  private async markaBosaldiysaKaldir(tx: Prisma.TransactionClient, k: Kimlik, brandId: string): Promise<boolean> {
    const kalan = await tx.userLibrary.count({ where: { firmaId: k.firmaId, brandId } });
    if (kalan > 0) return false;
    await tx.libraryList.deleteMany({ where: { firmaId: k.firmaId, brandId } });
    await tx.userBrandLibrary.deleteMany({ where: { firmaId: k.firmaId, brandId } });
    return true;
  }

  async importPriceList(k: Kimlik, dto: ImportPriceListDto) {
    const priceList = await this.prisma.priceList.findUnique({
      where: { id: dto.priceListId },
      include: { brand: true },
    });
    if (!priceList) throw new NotFoundException('Fiyat listesi bulunamadi');
    if (priceList.brandId !== dto.brandId) {
      throw new BadRequestException('Fiyat listesi bu markaya ait degil');
    }
    // KISISEL LISTE KORUMASI (24.08): baska kullanicinin kisisel listesi id
    // bilinse dahi aktarilamaz — fiyatlari onun ticari verisidir. NotFound
    // (Forbidden degil): ucun varligi bile sizdirilmaz. Kendi kisisel listesi
    // serbest kalir (zaten kutuphanesindedir, idempotent aktarim zararsiz).
    // ADIM 1: kisisel liste artik FIRMANIN — ayni firmanin baska uyesi de
    // okuyabilmeli. Karsilastirma ownerUserId'den ownerFirmaId'ye gecti.
    // ⚠ KAPI YONU: "kisisel mi" olcusu ownerUserId'de KALIR (backfill'siz bir
    // satir ownerFirmaId'si BOS olabilir); erisim ise FIRMAYA bakar. Boylece
    // eksik backfill REDDE duser, ACMAYA degil — sessiz sizinti yerine 404.
    if (priceList.ownerUserId && (priceList as any).ownerFirmaId !== k.firmaId) {
      throw new NotFoundException('Fiyat listesi bulunamadi');
    }

    // ── FAZ 3: INDEKS VARSA KAYNAK ODUR ─────────────────────────────
    // MaterialPrice, ayni ad/cins/capta farkli BAGLANTI'li satirlari
    // Material.name @unique yuzunden tek kayda eziyor. Canli olcum (Ayvaz):
    // ProductIndex 4571 satir · MaterialPrice 4068 → 503 URUN kutuphaneye
    // HIC ULASAMIYORDU. Indeksten kopyalayinca hepsi gelir ve satirlar
    // productIndexId ile indekse baglanir (v2 motorun on kosulu).
    // Indekslenmemis (eski) listeler legacy yoldan devam eder.
    const indexRows = await (this.prisma as any).productIndex.findMany({
      where: { priceListId: dto.priceListId },
      orderBy: [{ sortOrder: 'asc' }],
    });
    if (indexRows.length > 0) {
      // ⚠ P2-2 KORUMASI — MUKERRER SATIR YASAGI.
      // `importFromIndex` idempotentligi `productIndexId` uzerinden kurar.
      // Bu kullanici bu listeyi DAHA ONCE legacy yoldan aktardiysa o
      // satirlarda alan NULL'dur; indeks yoluna gecilirse hicbiri eslesmez,
      // hepsi YENI sanilir ve `createMany` MUKERRER satir yaratir —
      // ustelik kullanicinin iskonto/ozel fiyati eski satirlarda oksuz kalir.
      //
      // Cozum olarak legacy satirlari indekse otomatik BAGLAMIYORUZ: guvenli
      // bir eslestirme anahtari yok (ad/cins/cap sezgiseli yanlis eslerse
      // kullanicinin iskontosunu YANLIS urune yazar — mukerrerden beteri).
      // Bunun yerine liste, aktarildigi yolda KALIR. Yeni aktarimlar indeks
      // yolundan gider. Geriye donuk baglama ayri bir karar/tur.
      const legacySatir = await this.prisma.userLibrary.count({
        where: {
          firmaId: k.firmaId, brandId: dto.brandId, sourcePriceListId: dto.priceListId,
          productIndexId: null,
        } as any,
      });
      if (legacySatir === 0) {
        return this.importFromIndex(k, dto, indexRows, priceList);
      }
      console.warn(`[library] liste ${dto.priceListId}: ${legacySatir} legacy satir var — indeks yoluna GECILMEDI (mukerrer yasagi)`);
    }

    // L1: KAYNAK SIRASI korunur (sortOrder) — kutuphane havuzla ayni dizilir
    const items = await this.prisma.materialPrice.findMany({
      where: { priceListId: dto.priceListId },
      include: { material: true },
      orderBy: [{ sortOrder: 'asc' }, { material: { name: 'asc' } }],
    });

    if (items.length === 0) {
      throw new BadRequestException('Bu fiyat listesinde malzeme yok');
    }

    // L4: IDEMPOTENT aktarim — anahtar (marka + kaynak liste + materialId).
    // Mevcut kayit ATLANMAZ; fiyat + yapi alanlari GUNCELLENIR, kullanicinin
    // girdigi iskonto (discountRate) ve ozel fiyat (customPrice) KORUNUR.
    const existing = await this.prisma.userLibrary.findMany({
      where: {
        firmaId: k.firmaId,
        brandId: dto.brandId,
        sourcePriceListId: dto.priceListId,
      },
      select: { id: true, materialId: true },
    });
    const existingByMat = new Map(existing.filter((e) => e.materialId).map((e) => [e.materialId as string, e.id]));

    const newItems = items.filter((item) => !existingByMat.has(item.materialId));
    const updateItems = items.filter((item) => existingByMat.has(item.materialId));

    // L1/L3: yapi alanlari (kategori/cins/cap/adRaw/sortOrder) VERI olarak tasinir
    const fidelityOf = (item: (typeof items)[number]) => ({
      listPrice: item.price,
      // Z4: fiyat orijinal para birimiyle tasinir — cevrim teklif asamasinda
      currency: item.currency ?? 'TRY',
      unit: item.birimRaw || item.material.unit || 'Adet',
      kategori: item.kategori ?? null,
      cins: item.cins ?? null,
      cap: item.cap ?? null,
      adRaw: item.adRaw ?? null,
      sortOrder: item.sortOrder ?? 0,
    });

    if (newItems.length > 0) {
      await this.prisma.userLibrary.createMany({
        data: newItems.map((item) => ({
          userId: k.userId,
          firmaId: k.firmaId,
          materialId: item.materialId,
          materialName: item.material.name,
          brandId: dto.brandId,
          sourcePriceListId: dto.priceListId,
          ...fidelityOf(item),
        })),
      });
    }

    // Mevcutlar guncellenir (chunk'li transaction — 1500+ satirda tek tek RTT yok)
    let updated = 0;
    const CHUNK = 200;
    for (let i = 0; i < updateItems.length; i += CHUNK) {
      const chunk = updateItems.slice(i, i + CHUNK);
      await this.prisma.$transaction(
        chunk.map((item) =>
          this.prisma.userLibrary.update({
            where: { id: existingByMat.get(item.materialId)! },
            data: {
              materialName: item.material.name,
              ...fidelityOf(item),
            },
          }),
        ),
      );
      updated += chunk.length;
    }

    // UserBrandLibrary sheets guncelle/olustur — tum kullanicinin o markaya ait
    // UserLibrary satirlarindan sentetik sheet yeniden olustur
    await this.rebuildUserBrandLibrary(k, dto.brandId);

    // L5: AKTARIM DOGRULAMA RAPORU — havuz ↔ kutuphane birebir karsilastirma
    const kutuphaneUrun = await this.prisma.userLibrary.count({
      where: { firmaId: k.firmaId, brandId: dto.brandId, sourcePriceListId: dto.priceListId },
    });
    const havuzKategori = new Set(items.map((i) => i.kategori).filter(Boolean)).size;
    const farklar: string[] = [];
    if (kutuphaneUrun !== items.length) {
      farklar.push(`Havuzda ${items.length} ürün, kütüphaneye ${kutuphaneUrun} kayıt yazıldı`);
    }

    return {
      imported: newItems.length,
      updated,
      skipped: 0,
      brandName: priceList.brand.name,
      listName: priceList.name,
      // L5 raporu
      havuzUrun: items.length,
      kutuphaneUrun,
      kategoriSayisi: havuzKategori,
      farklar,
    };
  }

  /**
   * FAZ 3: URUN INDEKSINDEN kutuphaneye aktarim.
   *
   * Legacy importPriceList ile AYNI sozlesme (imported/updated/L5 raporu),
   * iki farkla:
   *  1. Kaynak MaterialPrice degil ProductIndex → legacy'nin yuttugu satirlar
   *     (Ayvaz'da 503 urun) kutuphaneye ULASIR.
   *  2. Satir productIndexId ile indekse BAGLANIR → v2 motor bu markayi
   *     "indeksli" sayar ve Ad-kilitli sorguyu calistirabilir.
   *
   * L4 IDEMPOTENT KORUNUR: anahtar (k.userId + kaynak liste + productIndexId).
   * Mevcut satir ATLANMAZ — fiyat/yapi guncellenir, kullanicinin girdigi
   * discountRate ve customPrice'a HIC DOKUNULMAZ.
   *
   * 'belirsiz' satirlar da aktarilir (kullanicinin urunudur, gorunur olmali);
   * eslestirmeye girmeleri query-engine tarafinda engellenir (PRD 2A).
   */
  private async importFromIndex(
    k: Kimlik,
    dto: ImportPriceListDto,
    rows: any[],
    priceList: { name: string; brand: { name: string } },
  ) {
    const existing = await this.prisma.userLibrary.findMany({
      where: { firmaId: k.firmaId, brandId: dto.brandId, sourcePriceListId: dto.priceListId },
      select: { id: true, productIndexId: true } as any,
    });
    const byIdx = new Map(
      (existing as any[]).filter((e) => e.productIndexId).map((e) => [e.productIndexId as string, e.id as string]),
    );

    // L1/L3: yapi alanlari VERI olarak tasinir — kutuphane gorunumu
    // (library-sheet-builder) bu alanlardan beslenir, sema degismeden calisir.
    const fidelityOf = (r: any) => ({
      productIndexId: r.id,
      // Legacy gorunum + hafiza karsilastirmasi icin okunabilir ad
      materialName: r.displayName,
      listPrice: r.price,
      // Z4: orijinal para birimi — cevrim YALNIZ teklif aninda
      currency: r.currency ?? 'TRY',
      unit: r.birim || 'Adet',
      kategori: r.kategori ?? null,
      cins: r.cins ?? null,
      cap: r.capRaw ?? null,
      adRaw: r.ad ?? null,
      sortOrder: r.sortOrder ?? 0,
    });

    const newRows = rows.filter((r) => !byIdx.has(r.id));
    const updRows = rows.filter((r) => byIdx.has(r.id));

    if (newRows.length > 0) {
      await this.prisma.userLibrary.createMany({
        data: newRows.map((r) => ({
          userId: k.userId,
          firmaId: k.firmaId,
          brandId: dto.brandId,
          sourcePriceListId: dto.priceListId,
          // Indeks yolunda Material bagi YOK — urun yapisi indekste yasar
          materialId: null,
          ...fidelityOf(r),
        })) as any,
      });
    }

    let updated = 0;
    const CHUNK = 200;
    for (let i = 0; i < updRows.length; i += CHUNK) {
      const chunk = updRows.slice(i, i + CHUNK);
      await this.prisma.$transaction(
        chunk.map((r) =>
          this.prisma.userLibrary.update({
            where: { id: byIdx.get(r.id)! },
            // discountRate / customPrice BU LISTEDE YOK → dokunulmaz
            data: fidelityOf(r) as any,
          }),
        ),
      );
      updated += chunk.length;
    }

    await this.rebuildUserBrandLibrary(k, dto.brandId);

    // L5: havuz ↔ kutuphane birebir dogrulama
    const kutuphaneUrun = await this.prisma.userLibrary.count({
      where: { firmaId: k.firmaId, brandId: dto.brandId, sourcePriceListId: dto.priceListId },
    });
    const farklar: string[] = [];
    if (kutuphaneUrun !== rows.length) {
      farklar.push(`Havuzda ${rows.length} ürün, kütüphaneye ${kutuphaneUrun} kayıt yazıldı`);
    }
    const belirsiz = rows.filter((r) => r.belirsiz).length;
    if (belirsiz > 0) {
      farklar.push(`${belirsiz} ürünün ailesi çözülemedi — kütüphanede görünür, eşleştirmeye giremez`);
    }

    return {
      imported: newRows.length,
      updated,
      skipped: 0,
      brandName: priceList.brand.name,
      listName: priceList.name,
      havuzUrun: rows.length,
      kutuphaneUrun,
      kategoriSayisi: new Set(rows.map((r) => r.kategori).filter(Boolean)).size,
      farklar,
      // Faz 3: bu marka artik v2 motora hazir
      indeksli: true,
    };
  }

  // ── UserBrandLibrary sheets builder ──
  // UserLibrary satirlarindan tek sheet'lik synthetic grid olusturur
  // (buildLibrarySheetRows — saf, test edilir). L1: kaynak sirasi (sortOrder)
  // + kategori grup bantlari BIREBIR; L2: sentetik header satiri YOK.
  async rebuildUserBrandLibrary(k: Kimlik, brandId: string) {
    // sortOrder birincil (kaynak sirasi); legacy kayitlarda hepsi 0 → ad sirasi
    const items = await this.prisma.userLibrary.findMany({
      where: { firmaId: k.firmaId, brandId },
      // 16.07: Baglanti/Boy/Kod/Not tek gercek ProductIndex'te — join'le gelir
      include: KUTUPHANE_GORUNUM_ICERIGI as any,
      orderBy: [{ sortOrder: 'asc' }, { materialName: 'asc' }],
    });

    if (items.length === 0) {
      // Kutuphanede hic satir yoksa UserBrandLibrary'yi sil
      await this.prisma.userBrandLibrary.deleteMany({ where: { firmaId: k.firmaId, brandId } });
      return null;
    }

    const built = buildLibrarySheetRows(items.map((item: any) => this.sheetItemOf(item)));

    const sheets = [
      {
        name: 'Fiyat Listesi',
        index: 0,
        columnDefs: built.columnDefs,
        rowData: built.rowData,
        columnRoles: built.columnRoles,
        headerEndRow: 0,
        isEmpty: false,
        discipline: null,
      },
    ];

    const result = await this.prisma.userBrandLibrary.upsert({
      // ADIM 1: tekillik artik FIRMA bazli (sema @@unique([firmaId, brandId])).
        // Kisi bazli kalsaydi ayni firmanin iki uyesi ayni marka icin iki
        // sheet kaydi acar, firma gorunumu markayi CIFT gosterirdi.
        where: { firmaId_brandId: { firmaId: k.firmaId, brandId } },
      create: { userId: k.userId, firmaId: k.firmaId, brandId, sheets: { sheets } as any },
      update: { sheets: { sheets } as any },
    });
    return result;
  }

  /** UserLibrary satiri → sheet-builder girdisi (rebuild + liste filtresi ORTAK). */
  private sheetItemOf(item: any) {
    return {
      id: item.id,
      materialName: item.materialName,
      adRaw: item.adRaw,
      kullaniciAdi: item.kullaniciAdi ?? null,
      unit: item.unit,
      listPrice: item.customPrice ?? item.listPrice ?? 0,
      discountRate: item.discountRate,
      // C3 (P4b): gosterilen fiyatin BIRIMI — ozel fiyat varsa kendi birimi
      currency: gosterilenFiyatBirimi(item),
      kategori: item.kategori,
      cins: item.cins,
      cap: item.cap,
      baglanti: item.product?.baglanti ?? null,
      boy: item.product?.boyMm ?? null,
      urunKodu: item.product?.urunKodu ?? null,
      not: item.product?.not ?? null,
      // K1 (tur 3 A4c): gosterilen fiyat DEGISMEZ (col3 = C ?? L, saveBrandSheets
      // karsilastirmasi ona dayanir); ayrisim yalniz ISARET olarak tasinir.
      fiyatAyrisik: havuzFiyatAyrisimi(item),
    };
  }

  // ── GET — ExcelGrid render icin sheets + guncel iskontolar ──
  // HER ZAMAN taze rebuild: kayitli sheets eski formatta olabilir (header
  // satirli / grupsuz) — UserLibrary kaynak-of-truth'tur, gorunum ondan uretilir.
  // listId verilirse YALNIZ o listenin satirlari doner (sekme gorunumu).
  // BOS liste sheet DONDURUR (satirsiz, TAM kolon seti) — iscilik dersi:
  // "bos liste = kolonlar kayboldu" bir daha yasanmasin.
  async getBrandSheets(k: Kimlik, brandId: string, listId?: string) {
    if (listId) {
      const p = this.prisma as any;
      const list = await p.libraryList.findFirst({ where: { id: listId, firmaId: k.firmaId, brandId } });
      if (!list) throw new NotFoundException('Liste bulunamadi');
      const items = await this.prisma.userLibrary.findMany({
        where: { firmaId: k.firmaId, brandId, libraryListId: listId } as any,
        include: KUTUPHANE_GORUNUM_ICERIGI as any,
        orderBy: [{ sortOrder: 'asc' }, { materialName: 'asc' }],
      });
      const built = buildLibrarySheetRows(items.map((item: any) => this.sheetItemOf(item)));
      return {
        id: `liste-${listId}`,
        userId: k.userId,
        firmaId: k.firmaId,
        brandId,
        sheets: {
          sheets: [{
            name: list.name,
            index: 0,
            columnDefs: built.columnDefs,
            rowData: built.rowData,
            columnRoles: built.columnRoles,
            headerEndRow: 0,
            isEmpty: false,
            discipline: null,
          }],
        },
      };
    }

    const count = await this.prisma.userLibrary.count({ where: { firmaId: k.firmaId, brandId } });
    if (count === 0) throw new NotFoundException('Kutuphanenizde bu markaya ait kayit yok');
    const built = await this.rebuildUserBrandLibrary(k, brandId);
    if (!built) throw new NotFoundException('Olusturulamadi');
    return built;
  }

  // ── KUTUPHANE FIYAT LISTELERI (07.08 — iscilik "ilave sayfa"nin ikizi) ──

  /**
   * Markanin liste sekmeleri. LAZY GOC: libraryListId NULL satirlar (ozellik
   * oncesi kayitlar + havuzdan yeni aktarimlar) ilk acilista markanin
   * VARSAYILAN (en eski) listesine baglanir — boylece tum sorgular tekduze
   * kalir, NULL ozel durumu asagi katmanlara sizmaz. Idempotent supurge.
   */
  async getBrandLists(k: Kimlik, brandId: string) {
    const p = this.prisma as any;
    const sahipsiz = await this.prisma.userLibrary.count({
      where: { firmaId: k.firmaId, brandId, libraryListId: null } as any,
    });
    if (sahipsiz > 0) {
      let varsayilan = await p.libraryList.findFirst({
        where: { firmaId: k.firmaId, brandId },
        orderBy: { uploadedAt: 'asc' },
      });
      if (!varsayilan) {
        varsayilan = await p.libraryList.create({
          data: { userId: k.userId, firmaId: k.firmaId, brandId, name: 'Fiyat Listesi' },
        });
      }
      await this.prisma.userLibrary.updateMany({
        where: { firmaId: k.firmaId, brandId, libraryListId: null } as any,
        data: { libraryListId: varsayilan.id } as any,
      });
    }
    const lists = await p.libraryList.findMany({
      where: { firmaId: k.firmaId, brandId },
      orderBy: { uploadedAt: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    return { lists };
  }

  /**
   * Mevcut markaya satir ekleme — hedef liste secilir ('new' = yeni sekme).
   *
   * ── ISCILIK DERSI (06.08): ONCE DOGRULA, SONRA LISTE OLUSTUR ──────────
   * saveBulkPrices'ta liste dogrulamadan ONCE olusuyordu; tum satirlar
   * gecersizse geriye bos HAYALET liste kaliyordu. Burada ayni sinif hata
   * bastan kapali: gecerli satir yoksa 'new' liste HIC olusturulmaz.
   */
  async addRowsToBrandList(k: Kimlik, brandId: string, dto: AddLibraryRowsDto) {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new NotFoundException('Marka bulunamadi');
    // Sahiplik esdegeri: marka global olabilir — kullanicinin kutuphanesinde
    // bu markadan kayit olmali (sekmeli sayfa zaten yalniz oradan acilir).
    const sahiplik = await this.prisma.userLibrary.count({ where: { firmaId: k.firmaId, brandId } });
    if (sahiplik === 0) throw new NotFoundException('Kutuphanenizde bu marka yok');

    const rows = this.doluSatirlar(dto.rows ?? []);
    if (rows.length === 0) {
      throw new BadRequestException('En az bir satirda Malzeme Adi dolu olmali — liste olusturulmadi.');
    }

    const p = this.prisma as any;
    let liste;
    if (dto.listId === 'new') {
      // Iscilikle ayni adlandirma: "<marka> - <tarih>", ayni gun icinde (2)...
      const taban = `${brand.name} - ${new Date().toLocaleDateString('tr-TR')}`;
      let name = taban;
      let suffix = 2;
      while (await p.libraryList.findFirst({ where: { firmaId: k.firmaId, brandId, name } })) {
        name = `${taban} (${suffix++})`;
        if (suffix > 100) break;
      }
      liste = await p.libraryList.create({ data: { userId: k.userId, firmaId: k.firmaId, brandId, name } });
    } else {
      liste = await p.libraryList.findFirst({ where: { id: dto.listId, firmaId: k.firmaId, brandId } });
      if (!liste) throw new NotFoundException('Liste bulunamadi');
    }

    // Kaynak izlenebilirlik + ProductIndex.priceListId zorunlulugu: her ekleme
    // turu kendi PriceList'ini alir (createManualBrand ile ayni desen).
    // ownerUserId: bu liste kullanicinin KISISEL kaydidir, havuza AIT DEGILDIR —
    // havuz/admin gorunumleri null suzer (24.08: "kirke — Manuel Liste" kopyalari
    // admin panelde birikiyordu; her satir ekleme yeni PriceList actigi icin).
    const priceList = await this.prisma.priceList.create({
      data: {
        name: `${brand.name} — ${liste.name}`,
        brandId,
        ownerUserId: k.userId,
        ownerFirmaId: k.firmaId,
      },
    });

    // Yeni satirlar listenin SONUNA dizilir (kaynak sirasi korunur).
    const maxSort = await this.prisma.userLibrary.aggregate({
      _max: { sortOrder: true },
      where: { firmaId: k.firmaId, brandId, libraryListId: liste.id } as any,
    });
    const sortBase = (maxSort._max.sortOrder ?? -1) + 1;

    const sonuc = await this.insertLibraryRows(k, brandId, priceList.id, liste.id, rows, sortBase);
    await this.rebuildUserBrandLibrary(k, brandId);

    console.log(`[LibraryList] "${brand.name}" / "${liste.name}": ${sonuc.created} satir eklendi (userId=${k.userId})`);
    return {
      brandId,
      listId: liste.id,
      listName: liste.name,
      created: sonuc.created,
      belirsiz: sonuc.belirsiz,
      ogrenilenAile: sonuc.ogrenilenAile,
    };
  }

  /** Liste sekmesini sil — satirlar + liste. Kullanicinin KENDI kopyasi
   *  silinir; havuz (PriceList/ProductIndex) DOKUNULMAZ. */
  async deleteBrandList(k: Kimlik, brandId: string, listId: string) {
    const p = this.prisma as any;
    const liste = await p.libraryList.findFirst({ where: { id: listId, firmaId: k.firmaId, brandId } });
    if (!liste) throw new NotFoundException('Liste bulunamadi');
    // P4b Parti 3 (06.10): satirlar + sekme + (marka bosaldiysa) kalan bos
    // sekmeler ve kayit TEK islemde — eskiden ardisikti, bos sekmeler kaliyordu.
    const { silinen, bosaldi } = await this.prisma.$transaction(async (tx) => {
      const s = await tx.userLibrary.deleteMany({ where: { firmaId: k.firmaId, brandId, libraryListId: listId } });
      await tx.libraryList.delete({ where: { id: listId } });
      return { silinen: s, bosaldi: await this.markaBosaldiysaKaldir(tx, k, brandId) };
    });
    // Silme KESINLESTI. Satir kaldiysa marka gorunumu (sheets JSON) yeniden
    // kurulur; kurulamazsa istek yine basarili doner — 500 "Silinemedi"
    // dedirtir, kullanici artik olmayan sekmeyi yeniden silmeye calisir (404).
    // Kayit her okumada yeniden kuruluyor; bayat kalmasi gosterimi bozmaz.
    if (!bosaldi) {
      await this.rebuildUserBrandLibrary(k, brandId).catch((e) =>
        this.logger.warn(`Sekme silindi, marka gorunumu yeniden kurulamadi (${brandId}): ${(e as Error).message}`),
      );
    }
    return { ok: true, deletedRows: silinen.count };
  }

  // ── SAVE — ExcelGrid'den gelen dirty satirlari kaydet ──
  // body: { dirtyRows: [{ libraryItemId, listPrice, discountRate, materialName?, unit? }] }
  async saveBrandSheets(
    k: Kimlik,
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
    const errors: Array<{ id: unknown; error: string }> = [];
    // P4a ikiz (01.10.2026): satir hatalari iscilik ikiziyle AYNI kuralda
    // (`../satir-hatalari.ts`) — beklenmeyen hata genel metin + istek basina
    // TEK gunluk satiri; kimlik ve alan turleri DB'den once denetlenir. Eskiden
    // ham `e.message` yanita gidiyordu (Prisma sorgu ayrintisi, "trim is not a
    // function"); bicimsiz kimlik DB'ye ulasiyordu.
    const hatalar = satirHatalari(this.logger, 'library save-sheets', 'kütüphane satırı');

    for (const row of dirtyRows) {
      if (!satirKimligiGecerli(row?.libraryItemId)) {
        errors.push({ id: row?.libraryItemId, error: GECERSIZ_SATIR_KIMLIGI });
        continue;
      }
      if (!kutuphaneSatiriGecerli(row)) {
        errors.push({ id: row.libraryItemId, error: GECERSIZ_SATIR_VERISI });
        continue;
      }
      try {
        // Urun (ProductIndex) burada OKUNMAZ: yalniz ad gercekten degisince
        // gerekir (asagida) — toplu iskonto kaydinda binlerce satira ek sorgu
        // olurdu (P4b incelemesi 05.10).
        const item = await this.prisma.userLibrary.findFirst({
          where: { id: row.libraryItemId, firmaId: k.firmaId, brandId },
        });
        if (!item) {
          errors.push({ id: row.libraryItemId, error: 'Bulunamadi' });
          continue;
        }

        const data: any = {};
        if (row.listPrice !== undefined && !isNaN(row.listPrice) && row.listPrice >= 0) {
          // ── YALNIZ FIYAT DEGISTIYSE YAZ (K1, para dogrulugu turu 14.09) ──────
          // On yuz kayit yuku HER kirli satirda ekrandaki fiyati gonderir —
          // yalniz iskonto ya da ad degisse bile. Kosulsuz yazmak customPrice'i
          // o anki liste fiyatina DONDURUYORDU: havuz fiyati sonra guncellenip
          // "Kutuphaneme Aktar" yeniden yapilinca listPrice yenilenir, ama ekran
          // ve eslestirme (customPrice ?? listPrice) ESKI fiyatta kalirdi.
          // Olculen: iskonto 10 kaydi + havuz x1,2 → eslestirme 90 (dogrusu 108).
          // Ikiz yol bu kurali zaten uyguluyordu: library/page.tsx saveInlinePrice
          // `if (newVal === oldVal) return;`.
          const gosterilen = item.customPrice ?? item.listPrice;
          if (gosterilen == null || row.listPrice !== gosterilen) {
            // C3 (P4b 05.10, Emre karari 01.10): fiyat ekranda GOSTERILEN birimde
            // girildi — ozel fiyat O birimde dondurulur ("Kutuphaneme Aktar"
            // liste birimini degistirse de kalir). Liste fiyati yalniz AYNI
            // birimdeyse yazilir: aksi halde yabanci birimli sayi `listPrice`a
            // duserdi (aktarimdan sonra ozel birim ≠ liste birimi olabilir).
            const birim = gosterilenFiyatBirimi(item);
            data.customPrice = row.listPrice;
            data.customPriceCurrency = birim;
            if (ayniBirim(birim, item.currency)) data.listPrice = row.listPrice;
          }
        }
        if (row.discountRate !== undefined && !isNaN(row.discountRate)) {
          data.discountRate = Math.max(0, Math.min(100, row.discountRate));
        }
        // C7 (P4b 05.10): on yuz adi HER kirli satirda yollar — ad yalniz
        // GOSTERILEN addan farkliysa duzeltmedir (kosulsuz yazmak ortak urunde
        // havuz adini kullanici duzeltmesi diye dondururdu).
        const yeniAdHam = row.materialName?.trim();
        let sahipliAdlandirma: { pi: any; yeniAd: string } | null = null;
        if (yeniAdHam && yeniAdHam.length >= 2 && yeniAdHam !== gosterilenAd(item).trim()) {
          // Sinir yalniz DEGISEN adda: on yuz degismeyen adi da yollar, sinirdan
          // uzun eski bir adin fiyat duzenlemesi reddedilmemeli.
          if (yeniAdHam.length > MALZEME_ADI_AZAMI) {
            errors.push({ id: row.libraryItemId, error: AD_COK_UZUN });
            continue;
          }
          const yeniAd = yeniAdHam;
          // Duzeltmenin yeri urunun SAHIBINE gore (Emre karari 01.10):
          //  · sahipli (bu firmanin yukledigi indeks) → ProductIndex'in kendisi;
          //    motor adi oradan okur, rowKey/kimlik degismez. Indekse BASKA
          //    firmanin satiri da bagliysa (eski karisik liste) indeks ortak
          //    sayilir — yeniden adlandirma o firmanin motorunu da degistirirdi.
          //  · digerleri (havuz, baska firmanin indeksi, indekssiz satir) →
          //    `kullaniciAdi`: yalniz bu firmada gecerli, aktarim ezmez. Havuz
          //    adina geri donmek alani temizler.
          const pi = item.productIndexId
            ? await this.prisma.productIndex.findUnique({ where: { id: item.productIndexId } })
            : null;
          if (pi && pi.ownerFirmaId === k.firmaId && !(await this.baskaFirmaninSatiriVar(k, pi.id))) {
            sahipliAdlandirma = { pi, yeniAd };
            if (item.kullaniciAdi != null) data.kullaniciAdi = null;
          } else {
            data.kullaniciAdi = pi && yeniAd === pi.ad.trim() ? null : yeniAd;
          }
          data.materialName = yeniAd;
          // ── IKI ALAN BIRDEN (06.08 kullanici bildirimi) ────────────────────
          // Sheet uretici adi `col1 = kullaniciAdi ?? adRaw ?? materialName`
          // sirasiyla okur (`gosterilenAd`). Yani `adRaw` DOLUYKEN yalniz
          // materialName yazmak, degisikligi kullanicinin GORMEDIGI bir alana
          // yazmaktir: ekran "Kaydedildi" der, ad eski kalir. Bug tam olarak
          // buydu (ayni sebeple sahipli dal eski `kullaniciAdi`ni temizler).
          //
          // ⚠ KAYNAK SADAKATI BOZULMAZ: bu alanlar `UserLibrary`ye, yani
          // kullanicinin KENDI kopyasina aittir. Paylasilan `Material` katalogu
          // bu yoldan HIC guncellenmez (test C1 bunu olcer). "Adi ezmeyelim"
          // endisesi dogruydu ama BASKA bir alan icindi.
          data.adRaw = yeniAd;
        }
        if (row.unit !== undefined) data.unit = row.unit.trim() || 'Adet';

        if (sahipliAdlandirma) await this.sahipliUrunuYenidenAdlandir(k, sahipliAdlandirma.pi, sahipliAdlandirma.yeniAd, item.id, data);
        else await this.prisma.userLibrary.update({ where: { id: item.id, firmaId: k.firmaId }, data });
        updated++;
      } catch (e: unknown) {
        errors.push(hatalar.ekle(row.libraryItemId, e));
      }
    }
    hatalar.gunlukle();

    // Sheets'i yeniden olustur (guncel iskontolar dahil)
    await this.rebuildUserBrandLibrary(k, brandId);

    return { updated, errors };
  }

  /**
   * C7 (P4b 05.10, Emre karari 01.10): SAHIPLI urunun (bu firmanin yukledigi
   * ProductIndex) adi duzeltilince indeksin KENDISI guncellenir — motor adayin
   * adini ProductIndex'ten okur (UserLibrary.materialName yalniz indekssiz
   * satirda). Ham `ad` + turetilmis alanlar (`turetilmisIndeksAlanlari`,
   * yonetici yeniden indekslemesiyle AYNI liste); rowKey/kimlik DEGISMEZ.
   * `buildProductIndex` DOGRUDAN: `rebuildIndexFields`in "yeni hesap belirsizse
   * eski slug'i koru" kurtarmasi yeniden adlandirmada eski adin ailesini yeni
   * ada yapistirirdi. Kiraci kosulu SORGUDA (ownerFirmaId). Indeks ve
   * kutuphane satiri TEK islemde: biri duserse ikisi de geri alinir (ekranin
   * adi ile motorun adi ayrismaz). Sozluksuz (self-family) yeni ad, urun
   * olusturulurken oldugu gibi SAHIBININ (ownerUserId) sozlugune ogrenilir;
   * sahibi kisi olmayan urun ogrenilmez (C5 kapsami — yeniden indekslemeyle
   * ayni kural; null ortak sozluk olurdu).
   */
  private async sahipliUrunuYenidenAdlandir(
    k: Kimlik, pi: any, yeniAd: string, satirId: string, satirVerisi: Record<string, unknown>,
  ): Promise<void> {
    const cols: ProductColumns = {
      kategori: pi.kategori, ad: yeniAd, cins: pi.cins, baglanti: pi.baglanti,
      cap: pi.capRaw, boy: pi.boyMm, birim: pi.birim, price: pi.price,
      paraBirimi: pi.currency, urunKodu: pi.urunKodu, not: pi.not,
      sheetName: pi.sheetName, sourceRow: pi.sourceRow, sortOrder: pi.sortOrder,
    };
    const { rowKey: _kimlikDegismez, ...f } = buildProductIndex(cols);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.productIndex.updateMany({
        where: { id: pi.id, ownerFirmaId: k.firmaId },
        data: { ad: yeniAd, ...turetilmisIndeksAlanlari(f) },
      });
      if (r.count !== 1) throw new Error('Sahipli urun guncellenemedi');
      await tx.userLibrary.update({ where: { id: satirId, firmaId: k.firmaId }, data: satirVerisi });
    });
    if (f.selfFamily && pi.ownerUserId) {
      await this.terminology.learnFamilyAliases([{ adBucket: f.adBucket, canonical: yeniAd }], pi.ownerUserId)
        .catch((e) => this.logger.warn(`aile ogrenme atlandi: ${(e as Error).message}`));
    }
  }

  /** C7 savunmasi (P4b incelemesi 05.10): sahipli indekse BASKA firmanin
   *  kutuphane satiri da bagli mi? Eski kisisel liste deseninde (liste
   *  sahipsiz, indeks sahipli) baska firma listeyi aktarabilmisti. */
  private async baskaFirmaninSatiriVar(k: Kimlik, piId: string): Promise<boolean> {
    // firmaId NULL (atanmamis) satir da "baska" sayilir: SQL '<>' NULL'u disarida birakirdi.
    const n = await this.prisma.userLibrary.count({
      where: { productIndexId: piId, OR: [{ firmaId: { not: k.firmaId } }, { firmaId: null }] },
    });
    return n > 0;
  }

  /**
   * Kullanici markayi kutuphanesinden tamamen cikarir — satirlar, liste
   * SEKMELERI ve marka kaydi TEK islemde.
   *
   * P4b Parti 3 yan bulgusu (05.10, gercek servisle olculdu): sekmeler
   * (`LibraryList`) silinmiyordu. Marka kaldirilinca "Fiyat Listesi" 0 kalemle
   * kaliyor; yeniden aktarimda `getBrandLists`in tembel gocu satirlari EN ESKI
   * artik sekmeye bagliyor, diger artiklar "(0)" sekme olarak geri geliyordu.
   * Canli (05.10, salt okuma): 13 sekmenin 13'u satirli, artik 0 — goc gerekmez.
   * Siralama: once satirlar (sekmeye SetNull bagli), sonra sekmeler.
   */
  async removeBrandFromLibrary(k: Kimlik, brandId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.userLibrary.deleteMany({ where: { firmaId: k.firmaId, brandId } });
      await tx.libraryList.deleteMany({ where: { firmaId: k.firmaId, brandId } });
      await tx.userBrandLibrary.deleteMany({ where: { firmaId: k.firmaId, brandId } });
    });
    return { ok: true };
  }
}
