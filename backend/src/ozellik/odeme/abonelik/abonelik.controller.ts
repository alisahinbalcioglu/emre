import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { KapaliHesapIzinli } from '../../../altyapi/auth/decorators/kapali-hesap-izinli.decorator';
import { FirmaRolGuard } from '../../../altyapi/auth/guards/firma-rol.guard';
import { FirmaRolu } from '../../../altyapi/auth/decorators/firma-rolu.decorator';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';
import { ErisimServisi } from './erisim.servisi';
import { SatinAlmaServisi } from './satinalma.servisi';
import { DenemeHakkiServisi } from './deneme-hakki.servisi';
import { AbonelikBaslaDto } from './dto/abonelik-basla.dto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Abonelik uclari — MUSTERIYE ACIK yuzey
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU DOSYA DA GELEN PAKETTE YOKTU. Pakette yalnizca iki controller vardi:
 *  webhook (iyzico→biz) ve havale (yonetici). Musterinin paket gorup satin
 *  alabilecegi TEK bir uc yoktu — bkz. satinalma.servisi.ts baslik notu.
 *
 *  ── ERISIM KURALI ───────────────────────────────────────────────────────
 *  Bu controller'in TAMAMI, erisimi kapali firmalara da ACIK olmak
 *  ZORUNDADIR. Sebep: ErisimServisi'nde `Yetenek.ABONELIK_YONET` her durumda
 *  true doner (erisim.servisi.ts yetenekKararla ilk satiri) — askidaki bir
 *  firmanin odeme yapabilecegi tek kapi burasidir. Buraya erisim kapisi
 *  koyulursa musteri ODEYEMEZ ve askidan CIKAMAZ: kilitlenme.
 *
 *  Bu yuzden asagida ErisimGuard YOKTUR ve bu bir GOZDEN KACMA DEGILDIR.
 *
 *  ── PLAN 5.8 §4 (K1): KAPATILMIS HESAP DA ODEYEBILMELI ──────────────────
 *  Ayni kilitlenme, 30 gunluk geri donus penceresindeki hesap icin de
 *  gecerli: geri acmanin TEK yolu paket satin almaktir. `@KapaliHesapIzinli`
 *  SINIF duzeyinde durur — `JwtAuthGuard` metot + SINIF okur; yeni bir uc
 *  eklendiginde dekoratoru koymayi unutmak, musteriyi odeyemez birakirdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('abonelik')
@UseGuards(JwtAuthGuard)
@KapaliHesapIzinli()
export class AbonelikController {
  constructor(
    private readonly erisim: ErisimServisi,
    private readonly satinAlma: SatinAlmaServisi,
    private readonly denemeHakki: DenemeHakkiServisi,
  ) {}

  /**
   * Abonelik sayfasinin kaynagi — satistaki paketler + BU firmanin deneme hakki.
   *
   * ⚠ FAZ 6.12a: `denemeHakki` BURADA eklenir, `satistakiPaketler()` icinde
   * DEGIL. Girissiz `/fiyatlar` ucu ayni metodu cagirip 60 sn bellekte
   * onbellekler; firma bazli alan oraya girerse bir firmanin karari herkese
   * sizardi (karar K-P7). Form verisi olmadigi icin karar firma + hesap
   * e-postasiyla verilir; formdaki telefon/e-posta eslesirse `basla` yaniti
   * kesin karari dondurur.
   */
  @Get('paketler')
  async paketler(@CurrentUser() kullanici: unknown) {
    const { firmaId, userId } = kimlikCoz(kullanici);
    const [paketler, karar] = await Promise.all([
      this.satinAlma.satistakiPaketler(),
      this.denemeHakki.karar({ firmaId, kullaniciId: userId }),
    ]);
    return paketler.map((p) => ({
      ...p,
      surum: {
        ...p.surum,
        // Denemesiz surumde soru anlamsiz: hak da gerekce de "yok".
        denemeHakki: p.surum.denemeGunu > 0 && karar.hak,
        denemeGerekcesi: p.surum.denemeGunu > 0 ? karar.gerekce : null,
      },
    }));
  }

  /**
   * Firmanin guncel erisim durumu. On yuz seridi (`uyari` nesnesi) bunu okur.
   */
  @Get('durum')
  async durum(@CurrentUser() kullanici: unknown) {
    const { firmaId } = kimlikCoz(kullanici);
    return this.erisim.karar(firmaId);
  }

  /**
   * Kart aboneligi baslatir; iyzico'nun barindirilan form HTML'ini doner.
   * On yuz bu HTML'i kendi sayfasina gomer.
   */
  // ── FAZ 7 F1b (§3.5): SATIN ALMA SAHIBIN ISI ─────────────────────────
  // ⚠ `paketler` ve `durum` BILEREK KAPISIZ (salt okuma — uye de paketini
  // gorur); `donus` da kapisiz cunku niyeti yalniz sahip acabilir (`basla`
  // kapili), token tek basina kimliktir ve ayni is zaten guardsiz
  // `iyzico-donus.controller.ts:71` yolundan da yapiliyor. Kapi eklemek
  // yalniz "sahiplik devri basla↔donus arasinda olursa odeme askida"
  // kusurunu uretirdi.
  @UseGuards(FirmaRolGuard)
  @FirmaRolu('sahip')
  @Post('basla')
  async basla(@CurrentUser() kullanici: unknown, @Body() g: AbonelikBaslaDto) {
    const { firmaId, userId } = kimlikCoz(kullanici);
    return this.satinAlma.baslat({
      firmaId,
      kullaniciId: userId,
      paketSurumuId: g.paketSurumuId,
      musteri: g.musteri,
      // 6.4: onay ISTEKTE gelir, zamani SUNUCUDA damgalanir — istemcinin
      // gonderdigi saate guvenmek ispat degeri birakmazdi.
      sozlesmeOnayi: g.sozlesmeOnayi,
    });
  }

  /**
   * Form donusu. iyzico donus adresine yalnizca `token` gonderir ve o POST
   * IMZASIZDIR — bu yuzden donus dogrudan iyzico'dan DEGIL, kullanicinin
   * kendi oturumundan (on yuz sayfasindan) gelir. Boylece token'in hangi
   * firmaya ait oldugu JWT ile capraz dogrulanir.
   */
  @Post('donus')
  async donus(
    @CurrentUser() kullanici: unknown,
    @Body() g: { token: string },
  ) {
    const { firmaId } = kimlikCoz(kullanici);
    return this.satinAlma.donus(g.token, firmaId);
  }

  /** Kayitli karti degistirme formu (1 TL cekilip iade edilerek dogrulanir). */
  @UseGuards(FirmaRolGuard)
  @FirmaRolu('sahip')
  @Post('kart-guncelle')
  async kartGuncelle(@CurrentUser() kullanici: unknown) {
    const { firmaId } = kimlikCoz(kullanici);
    return this.satinAlma.kartGuncellemeFormu(firmaId);
  }

  /** Iptal — erisim DONEM SONUNA kadar surer. */
  @UseGuards(FirmaRolGuard)
  @FirmaRolu('sahip')
  @Post('iptal')
  async iptal(
    @CurrentUser() kullanici: unknown,
    @Body() g: { neden?: string },
  ) {
    const { firmaId, userId } = kimlikCoz(kullanici);
    return this.satinAlma.iptalEt(firmaId, userId, g.neden);
  }
}
