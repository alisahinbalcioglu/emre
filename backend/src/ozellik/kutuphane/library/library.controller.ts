import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { LibraryService } from './library.service';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { UpdateLibraryItemDto } from './dto/update-library-item.dto';
import { ImportPriceListDto } from './dto/import-price-list.dto';
import { BulkDiscountDto } from './dto/bulk-discount.dto';
import { BulkUpdateItemsDto } from './dto/bulk-update-items.dto';
import { CreateManualBrandDto } from './dto/create-manual-brand.dto';
import { AddLibraryRowsDto } from './dto/add-library-rows.dto';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { Yetenek } from '../../odeme/abonelik/erisim.servisi';
import { KapaliHesapIzinli } from '../../../altyapi/auth/decorators/kapali-hesap-izinli.decorator';

@Controller('library')
@UseGuards(JwtAuthGuard, ErisimGuard)
export class LibraryController {
  constructor(private libraryService: LibraryService) {}

  @Get()
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
  @KapaliHesapIzinli() // kapali hesap: kutuphane listesi (salt okuma)
  findAll(@CurrentUser() user: any) {
    return this.libraryService.findAll(kimlikCoz(user));
  }

  /** KUTUPHANEM IZOLASYONU: teklif grid'indeki Marka dropdown'i bu listeden
   *  beslenir — kullanicinin kutuphanesine AKTARDIGI markalar. Global havuz
   *  (GET /brands) teklif akisinda kullanilmaz. */
  @Get('brands')
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
  @KapaliHesapIzinli() // kapali hesap: marka listesi (salt okuma)
  findLibraryBrands(@CurrentUser() user: any) {
    return this.libraryService.findLibraryBrands(kimlikCoz(user));
  }

  @Post()
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  create(@CurrentUser() user: any, @Body() dto: CreateLibraryItemDto) {
    return this.libraryService.create(kimlikCoz(user), dto);
  }

  /** "Marka Ekle" — kullanici bos tabloyu doldurup yeni marka olusturur.
   *  Satirlar indekslenip dogrudan kullanicinin kutuphanesine yazilir. */
  @Post('manual-brand')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  createManualBrand(@CurrentUser() user: any, @Body() dto: CreateManualBrandDto) {
    return this.libraryService.createManualBrand(kimlikCoz(user), dto);
  }

  @Put(':id')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateLibraryItemDto,
  ) {
    return this.libraryService.update(kimlikCoz(user), id, dto);
  }

  @Post('bulk-discount')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  bulkUpdateDiscount(@CurrentUser() user: any, @Body() dto: BulkDiscountDto) {
    return this.libraryService.bulkUpdateDiscount(kimlikCoz(user), dto);
  }

  @Post('bulk-update-items')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  bulkUpdateItems(@CurrentUser() user: any, @Body() dto: BulkUpdateItemsDto) {
    return this.libraryService.bulkUpdateItems(kimlikCoz(user), dto);
  }

  @Post('import-price-list')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  importPriceList(@CurrentUser() user: any, @Body() dto: ImportPriceListDto) {
    return this.libraryService.importPriceList(kimlikCoz(user), dto);
  }

  // ── ExcelGrid sheets (kullanicinin marka kutuphanesi gorunumu) ──

  /** listId verilirse yalniz o sekmenin satirlari (bos liste = satirsiz sheet,
   *  TAM kolon seti); verilmezse markanin tum satirlari (geriye uyum). */
  @Get('brand/:brandId/sheets')
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
  @KapaliHesapIzinli() // kapali hesap: marka sayfalari (salt okuma)
  getBrandSheets(
    @CurrentUser() user: any,
    @Param('brandId') brandId: string,
    @Query('listId') listId?: string,
  ) {
    return this.libraryService.getBrandSheets(kimlikCoz(user), brandId, listId || undefined);
  }

  // ── Kutuphane fiyat listeleri (sekmeler — iscilik "ilave sayfa" ikizi) ──

  @Get('brand/:brandId/lists')
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
  @KapaliHesapIzinli() // kapali hesap: marka listeleri (salt okuma)
  getBrandLists(@CurrentUser() user: any, @Param('brandId') brandId: string) {
    return this.libraryService.getBrandLists(kimlikCoz(user), brandId);
  }

  /** Mevcut markaya satir ekle — listId 'new' ise yeni sekme olusturur.
   *  ISCILIK DERSI: gecerli satir yoksa liste OLUSMAZ (400). */
  @Post('brand/:brandId/rows')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  addRowsToBrandList(
    @CurrentUser() user: any,
    @Param('brandId') brandId: string,
    @Body() dto: AddLibraryRowsDto,
  ) {
    return this.libraryService.addRowsToBrandList(kimlikCoz(user), brandId, dto);
  }

  @Delete('brand/:brandId/lists/:listId')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  deleteBrandList(
    @CurrentUser() user: any,
    @Param('brandId') brandId: string,
    @Param('listId') listId: string,
  ) {
    return this.libraryService.deleteBrandList(kimlikCoz(user), brandId, listId);
  }

  @Post('brand/:brandId/save-sheets')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  saveBrandSheets(
    @CurrentUser() user: any,
    @Param('brandId') brandId: string,
    @Body() body: {
      dirtyRows: Array<{
        libraryItemId: string;
        listPrice?: number;
        discountRate?: number;
        materialName?: string;
        unit?: string;
      }>;
    },
  ) {
    return this.libraryService.saveBrandSheets(kimlikCoz(user), brandId, body.dirtyRows ?? []);
  }

  @Delete('brand/:brandId')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  removeBrandFromLibrary(@CurrentUser() user: any, @Param('brandId') brandId: string) {
    return this.libraryService.removeBrandFromLibrary(kimlikCoz(user), brandId);
  }

  @Delete(':id')
  @GerekliYetenek(Yetenek.KUTUPHANE_DUZENLE)
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.libraryService.remove(kimlikCoz(user), id);
  }
}
