import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { LaborService } from './labor.service';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { TierGuard, RequireTier } from '../../../altyapi/auth/guards/tier.guard';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { Yetenek } from '../../odeme/abonelik/erisim.servisi';

/**
 * ── ERİŞİM SAĞLIĞI (10.09.2026) ────────────────────────────────────────
 * `TierGuard` SEVİYE sorar ("pro mu?"), `ErisimGuard` SAĞLIK sorar
 * ("aboneliği yürüyor mu?"). İkisi ayrı eksendir ve ikisi de gerekir:
 * seviyesi pro ama ödemesi durmuş bir firma bugün buradan geçiyordu.
 *
 * ⚠ YETENEK SINIF DÜZEYİNE KONMADI, bilerek. Aşağıdaki POST/PUT/DELETE
 * uçları platform yöneticisinin KÜRESEL işçilik kataloğunu düzenlediği
 * yerdir (`LaborItem.isGlobal` varsayılan `true`). Sınıfa yetenek verilirse
 * yönetici, kendi firmasının abonelik sağlığına bağlanır ve miras
 * satırlarının `erisimSonu`u geldiğinde (2027-09-01) kendi kataloğundan
 * sessizce kilitlenir. Yetenek yalnız OKUMA uçlarında.
 */
@Controller('labor')
@UseGuards(JwtAuthGuard, TierGuard, ErisimGuard, RolesGuard)
@RequireTier('pro') // İşçilik kütüphanesi → minimum Pro
export class LaborController {
  constructor(private laborService: LaborService) {}

  @Get()
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
  findAll(@Query('discipline') discipline?: string) {
    return this.laborService.findAll(discipline);
  }

  @Get(':id')
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
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
