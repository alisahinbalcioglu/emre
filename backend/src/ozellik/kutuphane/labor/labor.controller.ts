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
 *
 * ⚠ PAKET KAPISI SINIFTAN METODA İNDİ (2.12, 17.09.2026). `@RequireTier('pro')`
 * sınıf düzeyindeydi; 2.12 ile seviye artık YALNIZ abonelikten geldiği için
 * aboneliği olmayan (ya da Basic) bir platform yöneticisi KENDİ küresel
 * kataloğunu düzenlerken 403 alırdı. Yazma uçları (POST/PUT/DELETE) ve
 * yönetici katalog listesi yönetici işidir, müşteri paketi değil: paket
 * kapısı YOK, yalnız `@Roles('admin')`. Sınıfın guard listesi AYNEN kalır —
 * metadata taşımayan uçta `TierGuard` zaten `true` döner.
 */
@Controller('labor')
@UseGuards(JwtAuthGuard, TierGuard, ErisimGuard, RolesGuard)
export class LaborController {
  constructor(private laborService: LaborService) {}

  /**
   * YÖNETİCİ KATALOG LİSTESİ (R1-O4). Katalog sayfası listeyi çekip aynı
   * ekranda düzenliyor; liste `@RequireTier('pro')` + `KUTUPHANE_GORUNTULE`
   * altında kalsaydı aboneliği pro olmayan yöneticinin ekranı BOŞ görünür,
   * "ekle" çalışır ama eklediğini göremezdi.
   *
   * ⚠ `@Get(':id')`'den ÖNCE tanımlıdır ve ÖYLE KALMALIDIR: Express rotaları
   * tanım sırasına göre eşler; sonra yazılırsa `:id = 'yonetici-katalog'`
   * eşleşir ve bu uç hiç çağrılmaz.
   */
  @Get('yonetici-katalog')
  @Roles('admin')
  yoneticiKatalogu(@Query('discipline') discipline?: string) {
    return this.laborService.findAll(discipline);
  }

  @Get()
  @RequireTier('pro') // İşçilik kütüphanesi → minimum Pro
  @GerekliYetenek(Yetenek.KUTUPHANE_GORUNTULE)
  findAll(@Query('discipline') discipline?: string) {
    return this.laborService.findAll(discipline);
  }

  @Get(':id')
  @RequireTier('pro')
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
