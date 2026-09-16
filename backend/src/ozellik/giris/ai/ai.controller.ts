import { Body, Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { AiService } from './ai.service';
import { CeviriService } from './ceviri.service';
import { CeviriDuzeltmeDto, CeviriIstegiDto, CeviriOnizlemeSorgusuDto } from './dto/ceviri.dto';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { TierGuard, RequireTier } from '../../../altyapi/auth/guards/tier.guard';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { ErisimServisi, Yetenek } from '../../odeme/abonelik/erisim.servisi';
import { CeviriKotaServisi } from '../../odeme/abonelik/ceviri-kota.servisi';

/**
 * ── ERİŞİM SAĞLIĞI (10.09.2026) ────────────────────────────────────────
 * `/ai/analyze` her çağrıda Anthropic/OpenRouter'a gerçek para harcıyor ve
 * ödemesi durmuş bir firmaya kapalı DEĞİLDİ. `ErisimGuard` eklendi.
 *
 * ── ÇEVİRİ KAPISI + KOTA (Faz 6.8 + 6.2, 14.09.2026) ───────────────────
 * 10.09'da `translate` bilerek yeteneksiz bırakılmıştı; 13.09 ölçümü ucun
 * giriş yapmış HERKESE açık olduğunu gösterdi: abonelik, e-posta doğrulaması,
 * hız sınırı ve gövde doğrulaması yoktu, gövde tavanı 50 MB'tı. Artık:
 *   · `@GerekliYetenek(CEVIRI)` — aboneliği yürümeyen firma 403
 *   · e-posta doğrulanmamış hesap 403 (CeviriKotaServisi.rezerveEt)
 *   · IP başına dakikada 10 istek
 *   · sınıf DTO: istemci yalnız teklif kimliği gönderir
 *   · kota kontrolü AI çağrısından ÖNCE, satır sayısı SUNUCUDA
 *   · kotadan yalnız API'ye GİDEN satır düşer (Emre 16.09): ortak önbellekten
 *     ya da firma sözlüğünden karşılanan satır para harcatmaz, ücretlenmez
 *
 * ── GÖRÜNTÜLEME + HEPSİ YA DA HİÇBİRİ (Faz 6.10/6.11, 15.09.2026) ─────
 * `translate/goruntule` ödenmiş içeriği yeteneksiz gösterir (bakmak ücretsiz);
 * `translate` eksik kalan çeviride 422 `CEVIRI_TAMAMLANAMADI` döner, kotadan
 * hiçbir şey düşmez ve harita istemciye verilmez.
 * `translate/correct` global önbelleği değiştirir ve ön yüzde çağıranı yok —
 * giriş yapmış herkese açık olması önbellek zehirleme yoluydu; yalnız admin.
 */
@Controller('ai')
@UseGuards(JwtAuthGuard, TierGuard, ErisimGuard)
export class AiController {
  constructor(
    private aiService: AiService,
    private ceviriService: CeviriService,
    private kota: CeviriKotaServisi,
    private erisim: ErisimServisi,
  ) {}

  @Post('analyze')
  @RequireTier('pro') // PDF analiz → minimum Pro paketi
  @GerekliYetenek(Yetenek.AI_ANALIZ) // + aboneliği yürüyor mu?
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  analyze(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    return this.aiService.analyze(user.id, file.buffer, file.mimetype);
  }

  /**
   * Kayıtlı teklifi İngilizceye çevirir. Gövde: `{ quoteId, hedefDil? }`.
   * Çevrilecek metinler ve kotadan düşen satır sunucuda, kayıtlı içerikten.
   */
  @Post('translate')
  @GerekliYetenek(Yetenek.CEVIRI)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  translate(@CurrentUser() user: unknown, @Body() body: CeviriIstegiDto) {
    return this.ceviriService.teklifiCevir(kimlikCoz(user), body.quoteId, body.hedefDil ?? 'en');
  }

  /**
   * BAKMAK ≠ ÇEVİRMEK (Faz 6.11, 15.09): bu teklifin GÜNCEL içeriği için
   * ödenmiş çeviri varsa haritayı döndürür; yoksa yalnız nedeni ve sayıyı.
   * Yetenek İSTEMEZ — KALKAN (K-T8): ödemesi durmuş/kısıtlı firma daha önce
   * ödediği çeviriyi görebilir (`GET /quotes/:id` de yetenek taşımaz). Kota,
   * kilit, tüketim kaydı ve AI çağrısı YOK. Hız sınırı kovası uç başına:
   * `translate`'in 10/dk'sını tüketmez.
   */
  @Get('translate/goruntule')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  translateGoruntule(@CurrentUser() user: unknown, @Query() sorgu: CeviriOnizlemeSorgusuDto) {
    return this.ceviriService.teklifGorunumu(kimlikCoz(user), sorgu.quoteId);
  }

  /** Çevirmeden ÖNCE: bu teklif kaç satır yer, kalan kota ne, çeviri geçer mi. */
  @Get('translate/onizleme')
  @GerekliYetenek(Yetenek.CEVIRI)
  translateOnizleme(@CurrentUser() user: unknown, @Query() sorgu: CeviriOnizlemeSorgusuDto) {
    return this.kota.onizleme(kimlikCoz(user), sorgu.quoteId);
  }

  /**
   * Profil ekranı: bu dönemin çeviri kotası. Yetenek İSTEMEZ — salt okunur
   * bilgi; aboneliği olmayan firmaya `null` döner (ekran kutuyu çizmez).
   * `ceviriAcik`: kısıtlı/askıdaki firmada kota görünür ama çeviri 403 alır —
   * ekran "kalan 3.000 satır" yazıp çeviriyi kapalı bırakmasın diye söylenir.
   */
  @Get('translate/kota')
  async translateKota(@CurrentUser() user: unknown) {
    const k = kimlikCoz(user);
    const ozet = await this.kota.durum(k);
    if (!ozet) return null;
    return { ...ozet, ceviriAcik: await this.erisim.yetenekAcikMi(k.firmaId, Yetenek.CEVIRI) };
  }

  /**
   * Yönetici düzeltmesi — ORTAK önbelleğe 'manual' yazılır, AI ezemez. Faz 6.9:
   * güvenlik süzgeci + `YoneticiOlayi` aynı transaction'da (kimin yazdığı kalır);
   * gövde tavanı 32 KB (govde-siniri.ts). Kullanıcının yazma yolu firma
   * katmanıdır: `CeviriDuzeltmeController`.
   */
  @Post('translate/correct')
  @UseGuards(RolesGuard)
  @Roles('admin')
  translateCorrect(@CurrentUser() yonetici: { id?: string; email?: string } | undefined, @Body() body: CeviriDuzeltmeDto) {
    return this.ceviriService.duzelt(yonetici, body.kaynak, body.ceviri, body.hedefDil ?? 'en');
  }
}
