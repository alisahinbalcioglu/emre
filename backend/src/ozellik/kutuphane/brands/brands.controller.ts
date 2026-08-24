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

@Controller('brands')
@UseGuards(JwtAuthGuard)
export class BrandsController {
  constructor(private brandsService: BrandsService) {}

  // ── IMPORTANT: Literal/specific routes MUST come BEFORE :id catch-all ──

  @Get()
  findAll(@Query('discipline') discipline?: string) { return this.brandsService.findAll(discipline); }

  @Get('search')
  searchMaterials(@Query('q') q: string) { return this.brandsService.searchMaterials(q); }

  // Fiyat listesi malzemeleri (literal "price-lists" MUST be before :id).
  // Kimlik servise iner: KISISEL (ownerUserId dolu) listeyi yalniz sahibi okur.
  @Get('price-lists/:listId/materials')
  getPriceListMaterials(@CurrentUser() user: any, @Param('listId') listId: string) {
    return this.brandsService.getPriceListMaterials(listId, user?.id);
  }

  // Parameterized routes AFTER literals
  @Get(':id')
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
