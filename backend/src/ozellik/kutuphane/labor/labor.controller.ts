import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { LaborService } from './labor.service';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { TierGuard, RequireTier } from '../../../altyapi/auth/guards/tier.guard';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';

@Controller('labor')
@UseGuards(JwtAuthGuard, TierGuard, RolesGuard)
@RequireTier('pro') // İşçilik kütüphanesi → minimum Pro
export class LaborController {
  constructor(private laborService: LaborService) {}

  @Get()
  findAll(@Query('discipline') discipline?: string) {
    return this.laborService.findAll(discipline);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.laborService.findOne(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() body: {
    name: string;
    unit?: string;
    unitPrice: number;
    discipline: 'mechanical' | 'electrical';
    category?: string;
    description?: string;
  }) {
    return this.laborService.create(body);
  }

  @Put(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() body: any) {
    return this.laborService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.laborService.remove(id);
  }
}
