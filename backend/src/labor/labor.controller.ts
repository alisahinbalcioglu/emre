import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { LaborService } from './labor.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard, RequireTier } from '../auth/guards/tier.guard';

@Controller('labor')
@UseGuards(JwtAuthGuard, TierGuard)
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
  update(@Param('id') id: string, @Body() body: any) {
    return this.laborService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.laborService.remove(id);
  }
}
