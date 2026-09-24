import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';
import { izinVarMi } from '../../firma/uye-izinleri';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { ErisimServisi, Yetenek } from '../../odeme/abonelik/erisim.servisi';
import { KapaliHesapIzinli } from '../../../altyapi/auth/decorators/kapali-hesap-izinli.decorator';

@Controller('brands')
@UseGuards(JwtAuthGuard, ErisimGuard)
export class BrandsController {
  constructor(
    private brandsService: BrandsService,
    // 23.09.2026 (vitrin): havuz FIYATI yalniz erisimi yuruyen firmaya.
    private erisim: ErisimServisi,
  ) {}

  // ── IMPORTANT: Literal/specific routes MUST come BEFORE :id catch-all ──

  @Get()
  findAll(@Query('discipline') discipline?: string) { return this.brandsService.findAll(discipline); }

  // ⚠ 23.09.2026 (vitrin, guvenlik incelemesi HIGH-1): `@KapaliHesapIzinli`
  // KALDIRILDI. Bu uc HAVUZ fiyatlarini (sorgu basina 100 satir) dondurur ve
  // kapali hesapta `ErisimGuard` `KAPALI_HESAPTA_ACIK` kumesiyle yetenek
  // sorusunu ATLIYORDU — hic paket almamis biri kayit → hesabimi kapat →
  // yeniden giris ile butun havuz fiyatlarini cekebiliyordu (Emre: "fiyatlar
  // paketle acilsin"). Havuz kapali hesabin KENDI verisi degil; on yuz bu
  // ucu HIC cagirmiyor (olculdu). Kapi: `vitrin-test.ts` U2.
  @Get('search')
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
  searchMaterials(@Query('q') q: string) { return this.brandsService.searchMaterials(q); }

  // Fiyat listesi malzemeleri (literal "price-lists" MUST be before :id).
  // Kimlik servise iner: KISISEL listeyi yalniz SAHIP FIRMA okur (ADIM 1).
  @Get('price-lists/:listId/materials')
  async getPriceListMaterials(@CurrentUser() user: any, @Param('listId') listId: string) {
    // 23.09.2026: KISISEL liste firmanin Kutuphanem verisidir — izin karari
    // servise iner (havuz listesi izne BAGLI DEGIL; uc bu yuzden sinif
    // duzeyinde `@UyeIzniGerekli` tasiyamaz).
    // 23.09.2026 (vitrin): bu uc `@GerekliYetenek` TASIMAZ — paketsiz hesap
    // Malzeme Havuzu'nu gezebilsin diye BILEREK. Bu yuzden FIYAT karari da
    // burada sorulur: paketi yurumeyen firma havuz listesini fiyatsiz alir.
    return this.brandsService.getPriceListMaterials(
      listId,
      kimlikCoz(user).firmaId,
      izinVarMi(user, 'kutuphane'),
      await this.erisim.havuzFiyatiGorunurMu(kimlikCoz(user).firmaId, user?.role),
    );
  }

  // Parameterized routes AFTER literals
  @Get(':id')
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
  @KapaliHesapIzinli() // kapali hesap: marka detayi (salt okuma)
  findOne(@Param('id') id: string) { return this.brandsService.findOne(id); }

  @Get(':id/price-lists')
  getBrandPriceLists(@Param('id') id: string) { return this.brandsService.getBrandPriceLists(id); }

  // ── Admin only ──

  /** A-1 SALT-OKUMA: marka silinmeden ONCE kutuphanede ne kaybedilecegini sayar.
   *  Hicbir sey degistirmez; ekran onay metnini bundan uretir.
   *  ⚠ Sinif duzeyinde YALNIZ JwtAuthGuard var — admin korumasi METOT
   *  duzeyinde olmak zorunda, yoksa uc her kullaniciya acilir (baska
   *  kullanicilarin kutuphane sayilarini sizdirir). */
  @Get(':id/silme-etkisi')
  @UseGuards(RolesGuard)
  @Roles('admin')
  markaSilmeEtkisi(@Param('id') id: string) { return this.brandsService.markaSilmeEtkisi(id); }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateBrandDto) { return this.brandsService.create(dto); }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: CreateBrandDto) { return this.brandsService.update(id, dto); }

  // ?onaylandi=true — kutuphanedeki iskonto/ozel fiyat tasiyan satirlarin
  // silinmesini admin ACIKCA onaylar. Onaysiz cagri, ekonomi tasiyan satir
  // varsa 409 doner ve HICBIR SEY silinmez.
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string, @Query('onaylandi') onaylandi?: string) {
    return this.brandsService.remove(id, { kutuphaneSilmeOnayi: onaylandi === 'true' });
  }
}
