import {
  Controller, Get, Post, Put, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { LibraryService } from './library.service';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { UpdateLibraryItemDto } from './dto/update-library-item.dto';
import { ImportPriceListDto } from './dto/import-price-list.dto';
import { BulkDiscountDto } from './dto/bulk-discount.dto';
import { BulkUpdateItemsDto } from './dto/bulk-update-items.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('library')
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(private libraryService: LibraryService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.libraryService.findAll(user.id);
  }

  /** Sadece ekipman/sarf kategorisindeki kutuphane satirlari. DWG workspace
   *  equipment popup'unun autocomplete'i icin. */
  @Get('equipment')
  findEquipment(@CurrentUser() user: any) {
    return this.libraryService.findEquipment(user.id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateLibraryItemDto) {
    return this.libraryService.create(user.id, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateLibraryItemDto,
  ) {
    return this.libraryService.update(user.id, id, dto);
  }

  @Post('bulk-discount')
  bulkUpdateDiscount(@CurrentUser() user: any, @Body() dto: BulkDiscountDto) {
    return this.libraryService.bulkUpdateDiscount(user.id, dto);
  }

  @Post('bulk-update-items')
  bulkUpdateItems(@CurrentUser() user: any, @Body() dto: BulkUpdateItemsDto) {
    return this.libraryService.bulkUpdateItems(user.id, dto);
  }

  @Post('import-price-list')
  importPriceList(@CurrentUser() user: any, @Body() dto: ImportPriceListDto) {
    return this.libraryService.importPriceList(user.id, dto);
  }

  // ── ExcelGrid sheets (kullanicinin marka kutuphanesi gorunumu) ──

  @Get('brand/:brandId/sheets')
  getBrandSheets(@CurrentUser() user: any, @Param('brandId') brandId: string) {
    return this.libraryService.getBrandSheets(user.id, brandId);
  }

  @Post('brand/:brandId/save-sheets')
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
    return this.libraryService.saveBrandSheets(user.id, brandId, body.dirtyRows ?? []);
  }

  @Delete('brand/:brandId')
  removeBrandFromLibrary(@CurrentUser() user: any, @Param('brandId') brandId: string) {
    return this.libraryService.removeBrandFromLibrary(user.id, brandId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.libraryService.remove(user.id, id);
  }
}
