import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';
import { ErisimServisi } from './erisim.servisi';
import { SatinAlmaServisi } from './satinalma.servisi';

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
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('abonelik')
@UseGuards(JwtAuthGuard)
export class AbonelikController {
  constructor(
    private readonly erisim: ErisimServisi,
    private readonly satinAlma: SatinAlmaServisi,
  ) {}

  /** Fiyat sayfasinin kaynagi — satistaki paketler. */
  @Get('paketler')
  paketler() {
    return this.satinAlma.satistakiPaketler();
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
  @Post('basla')
  async basla(
    @CurrentUser() kullanici: unknown,
    @Body()
    g: {
      paketSurumuId: string;
      musteri: {
        ad: string;
        soyad: string;
        eposta: string;
        telefon: string;
        kimlikNo: string;
        sehir: string;
        adres: string;
        postaKodu?: string;
      };
    },
  ) {
    const { firmaId, userId } = kimlikCoz(kullanici);
    return this.satinAlma.baslat({
      firmaId,
      kullaniciId: userId,
      paketSurumuId: g.paketSurumuId,
      musteri: g.musteri,
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
  @Post('kart-guncelle')
  async kartGuncelle(@CurrentUser() kullanici: unknown) {
    const { firmaId } = kimlikCoz(kullanici);
    return this.satinAlma.kartGuncellemeFormu(firmaId);
  }

  /** Iptal — erisim DONEM SONUNA kadar surer. */
  @Post('iptal')
  async iptal(
    @CurrentUser() kullanici: unknown,
    @Body() g: { neden?: string },
  ) {
    const { firmaId, userId } = kimlikCoz(kullanici);
    return this.satinAlma.iptalEt(firmaId, userId, g.neden);
  }
}
