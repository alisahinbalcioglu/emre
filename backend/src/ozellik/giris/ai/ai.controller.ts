import { Body, Controller, Get, GoneException, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CeviriService } from './ceviri.service';
import { CeviriDuzeltmeDto, CeviriIstegiDto, CeviriOnizlemeSorgusuDto } from './dto/ceviri.dto';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { TierGuard, RequireTier } from '../../../altyapi/auth/guards/tier.guard';
import { RolesGuard } from '../../../altyapi/auth/guards/roles.guard';
import { Roles } from '../../../altyapi/auth/decorators/roles.decorator';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz, teklifKimligiCoz } from '../../../altyapi/auth/kimlik';
import { ErisimGuard, GerekliYetenek } from '../../odeme/abonelik/erisim.guard';
import { ErisimServisi, Yetenek } from '../../odeme/abonelik/erisim.servisi';
import { CeviriKotaServisi } from '../../odeme/abonelik/ceviri-kota.servisi';
import { UyeIzniGerekli } from '../../../altyapi/auth/decorators/uye-izni.decorator';

/** `POST /ai/analyze` kapalıdır (06.10.2026) — kullanıcıya giden metin. */
export const AI_ANALIZ_KAPALI_MESAJI =
  'PDF analizi kullanımdan kaldırıldı. Teklif için malzeme listesini Excel olarak yükleyin.';

/**
 * ── ERİŞİM SAĞLIĞI (10.09.2026) ────────────────────────────────────────
 * `/ai/analyze` her çağrıda Anthropic/OpenRouter'a gerçek para harcıyordu ve
 * ödemesi durmuş bir firmaya kapalı DEĞİLDİ; `ErisimGuard` eklenmişti. 06.10'dan
 * beri uç kapalı (410, aşağıda).
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
  private readonly logger = new Logger(AiController.name);

  constructor(
    private ceviriService: CeviriService,
    private kota: CeviriKotaServisi,
    private erisim: ErisimServisi,
  ) {}

  /**
   * ── KAPALI UÇ (06.10.2026) ────────────────────────────────────────────
   * PDF analizi ön yüzden 27.08'de (K6) kaldırılmıştı; uç ölü kaldı. Ölçüldü:
   * ön yüzde ve paket metinlerinde çağıranı yok; AiUsageLog'a hiç yazmıyordu
   * (ücretli AI çağrısının maliyeti kayda geçmiyor, kullanım sayılamıyordu);
   * fiyatı para birimsiz okuyordu (EUR özel fiyat TL sayılıyordu). KARAR
   * (koordinatör, Emre'nin ön onayıyla — Emre dönünce bilgilendirilecek ürün
   * kararı): 410, servis kodu silindi. Biri hâlâ çağırıyorsa görünsün diye
   * kimliksiz tek WARN. Yetki meta verisi KORUNDU (üye izni 06.10'dan beri
   * `fiyat`, ekip/yetki B): kimliksiz/yetkisiz istek
   * eskisi gibi 401/403 alır, WARN'ı yalnız yetkili üye tetikler, başka
   * kapıların fikstürü bozulmaz. Dosya gövdesi ayrıştırılmaz.
   * Geri gelirse yeni tasarım ister. Kapı: `test:ai-analiz-kapali`.
   * ⚠ Bu metodun DEKORATÖRLERİ başka kapıların ölçüt fikstürüdür — uç
   * tamamen silinirse onlar da güncellenmeli: `test:faz7-yetki` Y1-Y5 + Y8
   * dosya listesi · `test:guvenlik` O2-O4 · `test:erisim` W1 ·
   * `test:geri-donus` E3b · `test:ekip-izinleri` K3/B2 · `test:uc-kapisi`
   * (`/ai` öneki yetenek ister).
   */
  @Post('analyze')
  @RequireTier('pro')
  @GerekliYetenek(Yetenek.AI_ANALIZ)
  @UyeIzniGerekli('fiyat')
  analyze(): never {
    this.logger.warn('Kapali uc cagrildi: POST /ai/analyze (410)');
    throw new GoneException(AI_ANALIZ_KAPALI_MESAJI);
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
    // 23.09: teklif OKUYAN uc → `teklifKimligiCoz` (`fiyat` yetkisi kapsami).
    return this.ceviriService.teklifiCevir(teklifKimligiCoz(user), body.quoteId, body.hedefDil ?? 'en');
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
    return this.ceviriService.teklifGorunumu(teklifKimligiCoz(user), sorgu.quoteId);
  }

  /** Çevirmeden ÖNCE: bu teklif kaç satır yer, kalan kota ne, çeviri geçer mi. */
  @Get('translate/onizleme')
  @GerekliYetenek(Yetenek.CEVIRI)
  translateOnizleme(@CurrentUser() user: unknown, @Query() sorgu: CeviriOnizlemeSorgusuDto) {
    return this.kota.onizleme(teklifKimligiCoz(user), sorgu.quoteId);
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
