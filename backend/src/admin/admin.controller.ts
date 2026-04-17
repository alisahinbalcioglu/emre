import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards,
  UseInterceptors, UploadedFile, ValidationPipe, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminService, MaterialSheetInput } from './admin.service';
import { ExcelGridService } from '../modules/excel-grid/excel-grid.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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

  @Get('users')
  getUsers() { return this.adminService.getUsers(); }

  @Patch('users/:id/role')
  updateRole(@Param('id') id: string, @Body('role') role: 'admin' | 'user') {
    return this.adminService.updateUserRole(id, role);
  }

  @Patch('users/:id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: 'active' | 'banned') {
    return this.adminService.updateUserStatus(id, status);
  }

  @Patch('users/:id/tier')
  updateTier(@Param('id') id: string, @Body('tier') tier: 'core' | 'pro' | 'suite') {
    return this.adminService.updateUserTier(id, tier);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) { return this.adminService.deleteUser(id); }

  @Get('users/:id/subscriptions')
  getUserSubscriptions(@Param('id') id: string) {
    return this.adminService.getUserSubscriptions(id);
  }

  @Post('users/:id/subscriptions')
  addUserSubscription(
    @Param('id') id: string,
    @Body() body: { level: 'core' | 'pro'; scope: 'mechanical' | 'electrical' | 'mep'; endsAt?: string },
  ) {
    return this.adminService.addUserSubscription(id, body.level, body.scope, body.endsAt);
  }

  @Delete('users/:userId/subscriptions/:subId')
  removeUserSubscription(@Param('userId') userId: string, @Param('subId') subId: string) {
    return this.adminService.removeUserSubscription(userId, subId);
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

  @Post('brands/:brandId/price-lists')
  createPriceList(@Param('brandId') brandId: string, @Body('name') name: string) {
    return this.adminService.createPriceList(brandId, name);
  }

  @Delete('price-lists/:id')
  deletePriceList(@Param('id') id: string) {
    return this.adminService.deletePriceList(id);
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
  extractMaterialsPdf(@UploadedFile() file: Express.Multer.File) {
    return this.adminService.extractMaterialsPdf(file.buffer);
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

  @Post('materials/save-bulk')
  saveBulkMaterials(
    @Body() body: {
      brandId: string;
      priceListId: string;
      items: { materialName: string; unit: string; unitPrice: number }[];
      exchangeRate?: number;
    },
  ) {
    return this.adminService.saveBulkMaterials(body.brandId, body.priceListId, body.items, body.exchangeRate);
  }
}
