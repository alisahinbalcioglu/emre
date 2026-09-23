import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { KullaniciHizSiniriGuard } from '../../../altyapi/auth/guards/kullanici-hiz-siniri.guard';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz, teklifKimligiCoz } from '../../../altyapi/auth/kimlik';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { Yetenek } from '../../odeme/abonelik/erisim.servisi';
import { CeviriDuzeltmeServisi } from './ceviri-duzeltme.servisi';
import { CeviriDuzeltmeSorgusuDto, CeviriFirmaDuzeltmeDto } from './dto/ceviri-duzeltme.dto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FİRMA ÇEVİRİ DÜZELTMESİ UÇLARI  (Faz 6.9, 16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  GET    /ai/translate/duzeltmeler?quoteId=   — firmanın kendi karşılıkları + teklifin anahtarları
 *  PUT    /ai/translate/duzeltmeler             — ekle / güncelle (firma katmanı)
 *  DELETE /ai/translate/duzeltmeler/:id         — kaldır (ortak karşılık yeniden görünür)
 *
 *  ── KAPILAR ─────────────────────────────────────────────────────────────
 *  · Sınıf: `JwtAuthGuard` + `ErisimGuard` (yazma uçlarında `@GerekliYetenek(CEVIRI)`).
 *  · GET yetenek İSTEMEZ — KALKAN (W4 deseni): firmanın KENDİ verisidir; kısıtlı
 *    firma da görür. Yanıt ortak katman değeri TAŞIMAZ.
 *  · PUT/DELETE: aboneliği yürüyen firma (403), e-posta doğrulaması (403,
 *    serviste), OTURUM SAHİBİ başına dakikada 30 (IP değil — R1-B5), gövde
 *    tavanı 32 KB (`govde-siniri.ts`, main.ts), firma başına günlük 500 yazım.
 *  · Sahip rolü kapısı BİLEREK YOK (Faz 7 V1 uyumu): ekip üyesi de düzenler;
 *    olay kaydı kimin yaptığını gösterir.
 *  · Firma her uçta `kimlikCoz(user)`'dan gelir; gövdeye eklenen `firmaId`
 *    ValidationPipe `whitelist` ile atılır (R1-D6).
 */
@Controller('ai/translate/duzeltmeler')
@UseGuards(JwtAuthGuard, ErisimGuard)
export class CeviriDuzeltmeController {
  constructor(private readonly duzeltme: CeviriDuzeltmeServisi) {}

  @Get()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  listele(@CurrentUser() user: unknown, @Query() sorgu: CeviriDuzeltmeSorgusuDto) {
    // 23.09: teklif OKUYAN uc → `teklifKimligiCoz` (Son teklifler izni kapsami).
    return this.duzeltme.listele(teklifKimligiCoz(user), sorgu.quoteId, sorgu.hedefDil ?? 'en');
  }

  @Put()
  @GerekliYetenek(Yetenek.CEVIRI)
  @UseGuards(KullaniciHizSiniriGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(200)
  kaydet(@CurrentUser() user: unknown, @Body() govde: CeviriFirmaDuzeltmeDto) {
    return this.duzeltme.kaydet(teklifKimligiCoz(user), oturumEpostasi(user), {
      quoteId: govde.quoteId,
      kaynak: govde.kaynak,
      ceviri: govde.ceviri,
      hedefDil: govde.hedefDil,
    });
  }

  @Delete(':id')
  @GerekliYetenek(Yetenek.CEVIRI)
  @UseGuards(KullaniciHizSiniriGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  kaldir(@CurrentUser() user: unknown, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.duzeltme.kaldir(kimlikCoz(user), oturumEpostasi(user), id);
  }
}

/** Olay kaydının e-posta kopyası — JWT doğrulaması her istekte kullanıcıyı DB'den okur. */
function oturumEpostasi(user: unknown): string {
  const e = (user as { email?: unknown } | undefined)?.email;
  return typeof e === 'string' ? e : '';
}
