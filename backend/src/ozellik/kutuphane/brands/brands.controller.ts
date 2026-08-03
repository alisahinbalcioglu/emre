import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';

@Controller('brands')
@UseGuards(JwtAuthGuard)
export class BrandsController {
  constructor(private brandsService: BrandsService) {}

  // ── IMPORTANT: Literal/specific routes MUST come BEFORE :id catch-all ──

  @Get()
  findAll(@Query('discipline') discipline?: string) { return this.brandsService.findAll(discipline); }

  @Get('search')
  searchMaterials(@Query('q') q: string) { return this.brandsService.searchMaterials(q); }

  // Fiyat listesi malzemeleri (literal "price-lists" MUST be before :id)
  @Get('price-lists/:listId/materials')
  getPriceListMaterials(@Param('listId') listId: string) {
    return this.brandsService.getPriceListMaterials(listId);
  }

  // Parameterized routes AFTER literals
  @Get(':id')
  findOne(@Param('id') id: string) { return this.brandsService.findOne(id); }

  @Get(':id/price-lists')
  getBrandPriceLists(@Param('id') id: string) { return this.brandsService.getBrandPriceLists(id); }

  // ── Admin only ──

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateBrandDto) { return this.brandsService.create(dto); }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: CreateBrandDto) { return this.brandsService.update(id, dto); }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) { return this.brandsService.remove(id); }
}
