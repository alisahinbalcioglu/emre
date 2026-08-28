import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { HavaleServisi } from './havale.servisi';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Havale / EFT yonetim uclari — YALNIZCA YONETICI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ IKI GUVENLIK KUSURU BURADA KAPATILDI (28.08). Gelen pakette bu dosya:
 *
 *  KUSUR 1 — KORUMASIZ: `@UseGuards(YoneticiGuard)` satiri YORUMDAYDI ve
 *  pakette boyle bir guard yoktu. Yani `POST /api/yonetim/havale/:id/onayla`
 *  oturum acmis HERKESE aciktı — istedigi havale kaydini onaylayip
 *  `odemeyiOnayla` uzerinden KENDI aboneligini N ay uzatabilirdi. Odeme
 *  alinmadan erisim acan, dogrudan para kaybettiren bir delik.
 *  Cozum: projenin mevcut kalibi — JwtAuthGuard + RolesGuard + @Roles('admin')
 *  (admin.controller.ts:13-15 ile birebir ayni).
 *
 *  KUSUR 2 — SAHTE DENETIM IZI: `aktorId`, `onaylayanId` ve `olusturanId`
 *  ISTEK GOVDESINDEN okunuyordu. Guard eklemek bunu TEK BASINA cozmez:
 *  govdeden gelen kimlik yazilabilir bir alandir — bir yonetici baska bir
 *  yoneticinin ID'sini yazip islemi ona yikabilirdi. AbonelikOlayi tablosunun
 *  TEK VARLIK SEBEBI "kim yapti" sorusuna cevap vermek ("ben odedim ama
 *  hesabim kapandi" vakasi); govdeden okunan aktor o cevabi UYDURULABILIR
 *  kilar. Cozum: aktor DAIMA JWT'den (@CurrentUser) alinir; govdedeki
 *  karsiliklari sozlesmeden TAMAMEN kaldirildi (yok sayilmadi — kaldirildi ki
 *  cagiran taraf gonderdigi degerin kullanildigini SANMASIN).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('yonetim/havale')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class HavaleController {
  constructor(private readonly havale: HavaleServisi) {}

  /** Bekleyen tum havale kayitlari. */
  @Get()
  bekleyenler() {
    return this.havale.bekleyenler();
  }

  /** 1. Teklif olustur. */
  @Post('teklif')
  teklif(
    @CurrentUser() kullanici: { id: string },
    @Body()
    g: {
      firmaId: string;
      paketSurumuId: string;
      ayAdedi: number;
      tutar: number;
      paraBirimi?: string;
      aciklama?: string;
    },
  ) {
    return this.havale.teklifOlustur({ ...g, olusturanId: kullanici.id });
  }

  /** 2. Fatura kesildi. */
  @Post(':id/fatura')
  fatura(
    @Param('id') id: string,
    @CurrentUser() kullanici: { id: string },
    @Body() g: { faturaNo: string },
  ) {
    return this.havale.faturaKesildi(id, g.faturaNo, kullanici.id);
  }

  /** 3. Dekont geldi, odemeyi onayla — ABONELIK BURADA UZAR. */
  @Post(':id/onayla')
  onayla(
    @Param('id') id: string,
    @CurrentUser() kullanici: { id: string },
    @Body() g: { dekontUrl?: string; faturaKesme?: boolean },
  ) {
    return this.havale.odemeyiOnayla({
      havaleId: id,
      ...g,
      onaylayanId: kullanici.id,
    });
  }

  @Post(':id/iptal')
  iptal(
    @Param('id') id: string,
    @CurrentUser() kullanici: { id: string },
    @Body() g: { neden?: string },
  ) {
    return this.havale.iptalEt(id, kullanici.id, g.neden);
  }
}
