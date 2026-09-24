import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../../altyapi/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../altyapi/auth/guards/roles.guard';
import { KullaniciHizSiniriGuard } from '../../../../altyapi/auth/guards/kullanici-hiz-siniri.guard';
import { Roles } from '../../../../altyapi/auth/decorators/roles.decorator';
import { CurrentUser } from '../../../../altyapi/auth/decorators/current-user.decorator';
import { YoneticiAbonelikServisi } from './yonetici-abonelik.servisi';
import { YoneticiDusurmeServisi } from './yonetici-dusurme.servisi';
import { PaketOnerisiServisi } from './paket-onerisi.servisi';
import { YoneticiDusurDto } from './dto/yonetici-dusur.dto';
import { YoneticiOneriDto } from './dto/yonetici-oneri.dto';

interface Yonetici {
  id: string;
  email: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Yonetici paket islemleri (24.09.2026, yonetici paneli turu A2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  YALNIZ YONETICI: sinif duzeyinde `JwtAuthGuard + RolesGuard +
 *  @Roles('admin')` (havale.controller.ts ile ayni kalip). Yonetici oturumu
 *  iki adimli girissiz ACILAMAZ (`jwt.strategy.ts`, MFA_KURULUM_GEREKLI).
 *
 *  ⚠ AKTOR DAIMA JWT'DEN (`@CurrentUser`), govdeden DEGIL: govdedeki kimlik
 *  yazilabilir bir alandir — denetim izini uydurulabilir kilardi (havale
 *  controller'inin KUSUR 2 notu).
 *
 *  ⚠ `firmaId` YOL PARAMETRESI ve UUID olarak dogrulanir. Yonetici her firmayi
 *  gorebilir (yetki bu kadar) ama bicimsiz bir deger sorguya ulasmaz.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('yonetim/abonelik')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class YoneticiAbonelikController {
  constructor(
    private readonly panelServisi: YoneticiAbonelikServisi,
    private readonly dusurme: YoneticiDusurmeServisi,
    private readonly oneri: PaketOnerisiServisi,
  ) {}

  /** Firmanin aboneligi + her satistaki paket icin yapilabilecek islem. */
  @Get(':firmaId')
  panel(@Param('firmaId', new ParseUUIDPipe()) firmaId: string) {
    return this.panelServisi.panel(firmaId);
  }

  /**
   * Dogrudan dusurme — musteri onayi ALINMAZ (Emre karari); donem sonunda
   * uygulanir. Kural sunucuda, kuyrukta, taze satirla yeniden denetlenir.
   */
  @Post(':firmaId/dusur')
  @UseGuards(KullaniciHizSiniriGuard)
  @Throttle({ default: { ttl: 900_000, limit: 20 } })
  dusur(
    @CurrentUser() yonetici: Yonetici,
    @Param('firmaId', new ParseUUIDPipe()) firmaId: string,
    @Body() g: YoneticiDusurDto,
  ) {
    return this.dusurme.dusur({
      firmaId,
      paketSurumuId: g.paketSurumuId,
      yonetici: { id: yonetici.id, email: yonetici.email },
      gerekce: g.gerekce,
      musteriNotu: g.musteriNotu ?? null,
    });
  }

  /**
   * Musteri onayli ONERI (A2 Blok 2) — yukseltme, yatay gecis, fiyati artan
   * degisim, denemedeki firma. Paket DEGISMEZ; firma sahiplerine onay
   * baglantisi gider. Firma basina tek bekleyen oneri (ikincisi 409).
   */
  @Post(':firmaId/oneri')
  @UseGuards(KullaniciHizSiniriGuard)
  @Throttle({ default: { ttl: 900_000, limit: 20 } })
  oneriGonder(
    @CurrentUser() yonetici: Yonetici,
    @Param('firmaId', new ParseUUIDPipe()) firmaId: string,
    @Body() g: YoneticiOneriDto,
  ) {
    return this.oneri.olustur({
      firmaId,
      paketSurumuId: g.paketSurumuId,
      yonetici: { id: yonetici.id, email: yonetici.email },
      gerekce: g.gerekce,
      musteriNotu: g.musteriNotu ?? null,
    });
  }

  /** Bekleyen oneriyi geri cek — musterinin baglantisi artik bir sey yapmaz. */
  @Post(':firmaId/oneri/:oneriId/geri-cek')
  @UseGuards(KullaniciHizSiniriGuard)
  @Throttle({ default: { ttl: 900_000, limit: 20 } })
  oneriGeriCek(
    @CurrentUser() yonetici: Yonetici,
    @Param('firmaId', new ParseUUIDPipe()) firmaId: string,
    @Param('oneriId', new ParseUUIDPipe()) oneriId: string,
  ) {
    return this.oneri.geriCek({ firmaId, oneriId, yonetici: { id: yonetici.id, email: yonetici.email } });
  }
}
