import { Controller, Get, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SatinAlmaServisi } from './satinalma.servisi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FİYAT UCU — girişsiz ziyaretçiye AÇIK (Faz 6.1, 13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  `GET /api/fiyatlar` → satıştaki paketler, en güncel sürümün fiyatı ve
 *  çeviri kotasıyla. Kaynak `SatinAlmaServisi.satistakiPaketler()` — abonelik
 *  sayfasının okuduğu metodun AYNISI. İki sayfa iki ayrı sorgu yazmaz.
 *
 *  ── NEDEN AYRI CONTROLLER ──
 *  `GET /abonelik/paketler` zaten "fiyat sayfasının kaynağı" diye yazılmıştı,
 *  ama `AbonelikController` SINIF düzeyinde `JwtAuthGuard` taşıyor: girişsiz
 *  ziyaretçi 401 alır. Fiyat sayfası tanım gereği giriş öncesidir. O sınıfın
 *  guard'ını gevşetmek satın alma uçlarını da açardı; bu yüzden yalnız OKUYAN
 *  tek bir uç ayrı sınıfta.
 *
 *  ── NE DÖNER, NE DÖNMEZ ──
 *  Döner: paket adı/kodu/kapsamı/seviyesi, sözleşme tutarı (TL, KDV dahil),
 *  vitrin tutarı, deneme günü, DWG anahtarı, kullanıcı hakkı, çeviri kotası.
 *  Dönmez: iyzico plan/ürün kodları, abone sayıları, satışa kapalı sürümler.
 *  `suite` bu listede OLAMAZ: `PackageLevel` enum'unda yok, dolayısıyla
 *  satılabilir bir suite `Paket` satırı yazılamaz (plan mx1.6, 13.09 ölçüldü).
 *
 *  ── HIZ SINIRI + ÖNBELLEK ──
 *  Kimlik yok → sınır IP başına. `ThrottlerGuard` genel tavanı kullanır
 *  (app.module.ts: dakikada 60; ThrottlerModule @Global). Yanıt 60 saniye
 *  bellekte tutulur: girişsiz bir sayfanın her ziyareti veritabanına sorgu
 *  atmasın. Fiyat değişikliği en geç bir dakikada görünür — fiyat bir
 *  PaketSurumu kaydıyla değişir, saniye hassasiyeti gerektiren bir şey değil.
 */
export const FIYAT_ONBELLEK_MS = 60_000;

@Controller('fiyatlar')
@UseGuards(ThrottlerGuard)
export class FiyatController {
  private onbellek: { deger: unknown; gecerliSon: number } | null = null;

  constructor(private readonly satinAlma: SatinAlmaServisi) {}

  @Get()
  async fiyatlar() {
    const simdi = Date.now();
    if (this.onbellek && simdi < this.onbellek.gecerliSon) return this.onbellek.deger;
    const deger = await this.satinAlma.satistakiPaketler();
    this.onbellek = { deger, gecerliSon: simdi + FIYAT_ONBELLEK_MS };
    return deger;
  }
}
