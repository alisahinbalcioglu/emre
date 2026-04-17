import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { LaborFirmsService, CreateLaborFirmDto, SheetInput } from './labor-firms.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ExcelGridService } from '../modules/excel-grid/excel-grid.service';

@Controller('labor-firms')
@UseGuards(JwtAuthGuard)
export class LaborFirmsController {
  constructor(
    private service: LaborFirmsService,
    private excelGridService: ExcelGridService,
  ) {}

  // ── Kullanicinin firmalari ──

  @Get()
  findAll(@CurrentUser() user: any, @Query('discipline') discipline?: string) {
    return this.service.findAll(user.id, discipline);
  }

  // Literal route MUST be before :id catch-all
  @Get('price-lists/:listId/items')
  getPriceListItems(@CurrentUser() user: any, @Param('listId') listId: string) {
    return this.service.getPriceListItems(user.id, listId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOne(user.id, id);
  }

  @Get(':id/price-lists')
  getFirmaPriceLists(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getFirmaPriceLists(user.id, id);
  }

  // ── CRUD ──

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateLaborFirmDto) {
    return this.service.create(user.id, dto);
  }

  @Put(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: Partial<CreateLaborFirmDto>) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }

  // ── Price list & bulk save ──

  @Post(':id/price-lists')
  createPriceList(@CurrentUser() user: any, @Param('id') id: string, @Body('name') name: string) {
    return this.service.createPriceList(user.id, id, name);
  }

  @Delete('price-lists/:listId')
  deletePriceList(@CurrentUser() user: any, @Param('listId') listId: string) {
    return this.service.deletePriceList(user.id, listId);
  }

  // ── Tekil kalem (LaborPrice) update + delete ──

  @Put('price-items/:id')
  updatePriceItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { unitPrice?: number; discountRate?: number; unit?: string; laborItemName?: string },
  ) {
    return this.service.updatePriceItem(user.id, id, body);
  }

  @Post('price-items/bulk-update')
  bulkUpdatePriceItems(
    @CurrentUser() user: any,
    @Body() body: { items: Array<{ id: string; unitPrice?: number; discountRate?: number; unit?: string; laborItemName?: string }> },
  ) {
    if (!Array.isArray(body?.items)) throw new BadRequestException('items array gerekli');
    return this.service.bulkUpdatePriceItems(user.id, body.items);
  }

  @Delete('price-items/:id')
  deletePriceItem(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deletePriceItem(user.id, id);
  }

  // ── ExcelGrid sheets endpoints ──

  @Get('price-lists/:listId/sheets')
  getPriceListSheets(@CurrentUser() user: any, @Param('listId') listId: string) {
    return this.service.getPriceListSheets(user.id, listId);
  }

  @Post('price-lists/:listId/save-sheets')
  savePriceListSheets(
    @CurrentUser() user: any,
    @Param('listId') listId: string,
    @Body() body: {
      dirtyRows: Array<{
        laborPriceId: string;
        listPrice?: number;
        discountRate?: number;
        laborItemName?: string;
        unit?: string;
      }>;
    },
  ) {
    return this.service.savePriceListSheets(user.id, listId, body.dirtyRows ?? []);
  }

  @Post(':id/save-bulk')
  saveBulkPrices(
    @CurrentUser() user: any,
    @Param('id') firmaId: string,
    @Body() body: {
      priceListId: string;
      items: { laborName: string; unit: string; unitPrice: number; category?: string }[];
      exchangeRate?: number;
    },
  ) {
    return this.service.saveBulkPrices(user.id, firmaId, body.priceListId, body.items, body.exchangeRate);
  }

  // Multi-sheet Excel parse — mevcut ExcelGrid parser'ini kullanir
  // Sonuc: teklif sayfasindaki gibi {sheets, brands}
  // DB'ye YAZMAZ, sadece parse edip frontend'e gonderir
  @Post(':id/parse-full-excel')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  async parseFullExcel(
    @CurrentUser() user: any,
    @Param('id') firmaId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.buffer) throw new BadRequestException('Dosya bulunamadi');
    await this.service.findOne(user.id, firmaId); // sahiplik kontrol
    const result = await this.excelGridService.prepare(file.buffer);
    return result; // {sheets: SheetData[], brands}
  }

  // Multi-sheet sheets array'ini kaydet — her sheet ayri LaborPriceList olur
  @Post(':id/save-from-sheets')
  saveFromSheets(
    @CurrentUser() user: any,
    @Param('id') firmaId: string,
    @Body() body: { sheets: SheetInput[] },
  ) {
    if (!body?.sheets || !Array.isArray(body.sheets)) {
      throw new BadRequestException('sheets array gerekli');
    }
    return this.service.saveFromSheets(user.id, firmaId, body.sheets);
  }
}
