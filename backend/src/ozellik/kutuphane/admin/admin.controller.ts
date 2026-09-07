import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
  UseInterceptors, UploadedFile, ValidationPipe, BadRequestException, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminService, MaterialSheetInput, ImportPreviewItem } from './admin.service';
import { ExcelGridService } from '../../giris/excel-grid/excel-grid.service';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { KullanicilarSorgusuDto } from './dto/kullanicilar-sorgusu.dto';

/** Denetim kaydina yazilan aktor. jwt.strategy.validate()'in dondurdugu sekil. */
interface Yonetici { id: string; email: string }

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private adminService: AdminService,
    private excelGridService: ExcelGridService,
  ) {}

  @Get('stats')
  getStats() { return this.adminService.getStats(); }

  @Get('ai-stats')
  getAiStats() { return this.adminService.getAiStats(); }

  @Get('ai-tasks')
  getAiTasks() { return this.adminService.getAiTasks(); }

  @Patch('ai-tasks')
  updateAiTask(@Body() body: { task: string; provider: string }) {
    return this.adminService.updateAiTask(body.task, body.provider);
  }

  @Post('ai-health-check')
  checkAiHealth(@Body('provider') provider: string) {
    return this.adminService.checkAiHealth(provider);
  }

  /// ⚠ DONUS SEKLI DEGISMEDI: hala DUZ DIZI. `{veri, toplam}` sekline
  /// gecmek on yuzu RENDER SIRASINDA cokertirdi (`users.filter is not a
  /// function`, useMemo icinde — fetch'in try/catch'i bunu YAKALAMAZ ve
  /// kullanici kirmizi hata kutusu degil BOS SAYFA gorurdu).
  /// Toplam sayi ayri bir baslikta doner: `X-Toplam-Kayit`.
  @Get('users')
  async getUsers(
    @Query() sorgu: KullanicilarSorgusuDto,
    @Res({ passthrough: true }) yanit: Response,
  ) {
    const { kayitlar, toplam } = await this.adminService.getUsers(sorgu);
    yanit.setHeader('X-Toplam-Kayit', String(toplam));
    return kayitlar;
  }

  // ⚠ Asagidaki alti ucun tamami @CurrentUser aliyor. 07.09.2026'dan once
  // BU DOSYADA @CurrentUser HIC GECMIYORDU: islemi yapan yoneticinin kimligi
  // servise ULASMIYORDU, yani denetim kaydi yazilacak olsa yazacak veri yoktu.
  // Imza degisikligi BILEREK bu uclarin on yuzde hic cagirani yokken yapildi.

  @Patch('users/:id/role')
  updateRole(
    @CurrentUser() yonetici: Yonetici,
    @Param('id') id: string,
    @Body('role') role: 'admin' | 'user',
  ) {
    return this.adminService.updateUserRole(yonetici, id, role);
  }

  @Patch('users/:id/status')
  updateStatus(
    @CurrentUser() yonetici: Yonetici,
    @Param('id') id: string,
    @Body('status') status: 'active' | 'banned',
  ) {
    return this.adminService.updateUserStatus(yonetici, id, status);
  }

  @Patch('users/:id/tier')
  updateTier(
    @CurrentUser() yonetici: Yonetici,
    @Param('id') id: string,
    @Body('tier') tier: 'core' | 'pro' | 'suite',
  ) {
    return this.adminService.updateUserTier(yonetici, id, tier);
  }

  @Delete('users/:id')
  deleteUser(@CurrentUser() yonetici: Yonetici, @Param('id') id: string) {
    return this.adminService.deleteUser(yonetici, id);
  }

  /// Denetim kaydi okuma ucu. Bir kullanicinin gecmisi (?hedef=<id>) ya da
  /// son islemlerin tamami.
  @Get('denetim')
  denetimKaydi(@Query('hedef') hedef?: string, @Query('limit') limit?: string) {
    return this.adminService.denetimKaydiGetir(hedef, limit ? Number(limit) : undefined);
  }

  @Get('users/:id/subscriptions')
  getUserSubscriptions(@Param('id') id: string) {
    return this.adminService.getUserSubscriptions(id);
  }

  @Post('users/:id/subscriptions')
  addUserSubscription(
    @CurrentUser() yonetici: Yonetici,
    @Param('id') id: string,
    @Body() body: { level: 'core' | 'pro'; scope: 'mechanical' | 'electrical' | 'mep'; endsAt?: string },
  ) {
    return this.adminService.addUserSubscription(yonetici, id, body.level, body.scope, body.endsAt);
  }

  @Delete('users/:userId/subscriptions/:subId')
  removeUserSubscription(
    @CurrentUser() yonetici: Yonetici,
    @Param('userId') userId: string,
    @Param('subId') subId: string,
  ) {
    return this.adminService.removeUserSubscription(yonetici, userId, subId);
  }

  @Get('settings')
  getSettings() { return this.adminService.getSettings(); }

  @Patch('settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: false, transform: true }))
    data: Record<string, string>,
  ) {
    return this.adminService.updateSettings(data);
  }

  /** S2: ProductIndex on-hesap alanlarini guncel INDEX_VERSION ile yeniden
   *  uret (tokenizer surum gecisi). id/rowKey/iskonto korunur; idempotent.
   *  Deploy sonrasi indeks bayatsa (v2 motor v1'e dusuyorsa) BURASI kosulur —
   *  dosya yeniden yuklemek gerekmez. */
  @Post('reindex-products')
  reindexProducts() {
    return this.adminService.reindexProducts();
  }

  @Post('brands/:brandId/price-lists')
  createPriceList(@Param('brandId') brandId: string, @Body('name') name: string) {
    return this.adminService.createPriceList(brandId, name);
  }

  /** A-1 SALT-OKUMA: liste silinmeden ONCE kutuphanede ne olacagini sayar.
   *  Hicbir sey degistirmez; ekran onay metnini bundan uretir. */
  @Get('price-lists/:id/silme-etkisi')
  priceListSilmeEtkisi(@Param('id') id: string) {
    return this.adminService.fiyatListesiSilmeEtkisi(id);
  }

  // ?onaylandi=true — ekonomi (iskonto/ozel fiyat) tasiyan kutuphane satirlarinin
  // urun bagini koparmayi admin ACIKCA onaylar. Onaysiz cagri, boyle satir varsa
  // 409 doner ve HICBIR SEY silinmez. (Marka yolundaki desenin esi.)
  @Delete('price-lists/:id')
  deletePriceList(@Param('id') id: string, @Query('onaylandi') onaylandi?: string) {
    return this.adminService.deletePriceList(id, { kutuphaneSilmeOnayi: onaylandi === 'true' });
  }

  @Get('brands/:brandId/materials')
  getBrandMaterials(@Param('brandId') brandId: string) {
    return this.adminService.getBrandMaterials(brandId);
  }

  @Get('price-lists/:id/materials')
  getPriceListMaterials(@Param('id') id: string) {
    return this.adminService.getPriceListMaterials(id);
  }

  @Post('materials/extract-pdf')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  extractMaterialsPdf(
    @CurrentUser() yonetici: Yonetici,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.adminService.extractMaterialsPdf(file.buffer, yonetici);
  }

  @Post('materials/parse-full-excel')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  async parseFullMaterialsExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('Dosya bulunamadi');
    return this.excelGridService.prepare(file.buffer);
  }

  @Post('brands/:brandId/save-from-sheets')
  saveMaterialsFromSheets(
    @Param('brandId') brandId: string,
    @Body() body: { sheets: MaterialSheetInput[] },
  ) {
    if (!body?.sheets || !Array.isArray(body.sheets)) {
      throw new BadRequestException('sheets array gerekli');
    }
    return this.adminService.saveMaterialsFromSheets(brandId, body.sheets);
  }

  // ── Excel toplu yukleme IKI FAZLI (Z5: onizleme onaylanmadan yazim yok) ──
  // FAZ 1: preview — dosya parse edilir, hicbir sey yazilmaz. dotMeaning
  // (Z2 tek-soru cevabi: 'thousands' | 'decimal') multipart alani olarak
  // opsiyonel gelir; ikinci cagrida belirsizler onunla cozulu doner.

  @Post('brands/:brandId/import-excel/preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  previewBrandExcel(
    @Param('brandId') brandId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('dotMeaning') dotMeaning?: 'thousands' | 'decimal',
  ) {
    if (!file?.buffer) throw new BadRequestException('Dosya bulunamadi');
    return this.adminService.previewBrandExcel(brandId, file.buffer, dotMeaning || null);
  }

  @Post('price-lists/:id/import-excel/preview')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  previewPriceListExcel(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('dotMeaning') dotMeaning?: 'thousands' | 'decimal',
  ) {
    if (!file?.buffer) throw new BadRequestException('Dosya bulunamadi');
    return this.adminService.previewPriceListExcel(id, file.buffer, dotMeaning || null);
  }

  // FAZ 2: commit — onaylanan onizleme kalemleri yazilir (replace + rapor).
  // Markaya commit'te fiyat listesi ANCAK simdi olusturulur (Z5).

  @Post('brands/:brandId/import-excel/commit')
  commitBrandImport(
    @Param('brandId') brandId: string,
    @Body() body: { items: ImportPreviewItem[]; dotMeaning?: 'thousands' | 'decimal'; listName?: string },
  ) {
    return this.adminService.commitBrandImport(brandId, body);
  }

  @Post('price-lists/:id/import-excel/commit')
  commitPriceListImport(
    @Param('id') id: string,
    @Body() body: { items: ImportPreviewItem[]; dotMeaning?: 'thousands' | 'decimal' },
  ) {
    return this.adminService.commitPriceListImport(id, body);
  }

  @Post('materials/save-bulk')
  saveBulkMaterials(
    @Body() body: {
      brandId: string;
      priceListId: string;
      items: { materialName: string; unit: string; unitPrice: number }[];
      // P2-3: `exchangeRate` alani KALDIRILDI — servis onu fiyata carpip
      // DB'ye cevrilmis yaziyordu (cift cevrim tuzagi). Hicbir istemci
      // gondermiyordu; body inline tip oldugu icin fazladan alan gonderen
      // istemci 400 almaz, alan sessizce yok sayilir → kirici degisiklik degil.
    },
  ) {
    return this.adminService.saveBulkMaterials(body.brandId, body.priceListId, body.items);
  }
}
