import {
  Controller, Get, Post, Put, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateMaterialPriceDto } from './dto/create-material-price.dto';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { Yetenek } from '../../odeme/abonelik/erisim.servisi';

@Controller('materials')
@UseGuards(JwtAuthGuard, ErisimGuard)
export class MaterialsController {
  constructor(private materialsService: MaterialsService) {}

  @Get()
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
  findAll() {
    return this.materialsService.findAll();
  }

  @Get(':id')
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
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
}
