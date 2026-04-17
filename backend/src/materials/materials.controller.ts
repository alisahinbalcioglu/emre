import {
  Controller, Get, Post, Put, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateMaterialPriceDto } from './dto/create-material-price.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('materials')
@UseGuards(JwtAuthGuard)
export class MaterialsController {
  constructor(private materialsService: MaterialsService) {}

  @Get()
  findAll() {
    return this.materialsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.materialsService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateMaterialDto) {
    return this.materialsService.create(dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: CreateMaterialDto) {
    return this.materialsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.materialsService.remove(id);
  }

  @Post('price')
  @UseGuards(RolesGuard)
  @Roles('admin')
  setPrice(@Body() dto: CreateMaterialPriceDto) {
    return this.materialsService.setPrice(dto);
  }

  @Delete(':materialId/price/:brandId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  deletePrice(
    @Param('materialId') materialId: string,
    @Param('brandId') brandId: string,
  ) {
    return this.materialsService.deletePrice(materialId, brandId);
  }
}
