import { Body, Controller, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { SatinAlmaServisi } from './satinalma.servisi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  IYZICO DONUS UCU — kart formundan sonra tarayicinin dustugu yer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU DOSYA NEDEN VAR (06.09'da canli turda olculdu)
 *
 *  Musteri test kartiyla odemeyi tamamladi ve ekranda su yazdi:
 *      "Bir sorun olustu — Odeme bilgisi bulunamadi."
 *
 *  Sebep: donus adresi ON YUZ SAYFASINI gosteriyordu
 *  (`/abonelik/donus`) ve o sayfa token'i SORGU DIZESINDEN okuyordu:
 *      new URLSearchParams(window.location.search).get('token')
 *  iyzico ise token'i POST GOVDESINDE gonderir. Tarayici bir Next.js
 *  sayfasina POST ile dustugunde istemci JavaScript'i govdeyi OKUYAMAZ —
 *  token HER SEFERINDE bos geliyordu. Adres cubugunda sorgu dizesi
 *  olmamasi da bunu dogruluyordu.
 *
 *  ⚠ Ilginc olan: `satinalma.servisi.ts` dosyasinin basindaki not zaten
 *  "iyzico donus adresine token POST eder" diyordu. Kural YAZILIYDI,
 *  uygulama BASKA seydi. (Bu, ayni turda SEKIZINCI "mekanizma var,
 *  baglanti yok" vakasi.)
 *
 *  ── NEDEN OTURUM YOK ───────────────────────────────────────────────────
 *  Bu POST iyzico'nun alan adindan gelir: CAPRAZ-SITE bir istektir ve
 *  `SameSite=Lax` cerezler gonderilmez. Yani JWT beklemek YANLIS olurdu —
 *  guard konsaydi her donus 401 alirdi.
 *
 *  Kimlik dogrulamasi TOKEN'IN KENDISIDIR: opak, tek kullanimlik ve hangi
 *  firmaya ait oldugu bizim `AbonelikBaslatma` tablomuzda yazili. Servis
 *  notunun kendi cumlesi: "token→firma baglantisi bizim tablomuzdan gelir;
 *  istekle gelen firmaId'ye guvenilmez."
 *
 *  ── NEDEN AYRI CONTROLLER ──────────────────────────────────────────────
 *  `AbonelikController` sinif duzeyinde `@UseGuards(JwtAuthGuard)` tasiyor
 *  ve o kapi DOGRU — kalan tum uclar oturum ister. Bu tek ucu muaf tutmak
 *  icin guard'i sinifdan kaldirmak, digerlerini de acardi. Ayri controller
 *  en dar cozumdur. (`webhook/iyzico` de ayni desende, guard'siz.)
 *
 *  ── GOVDEYE GUVENILMEZ ─────────────────────────────────────────────────
 *  Govdedeki token yalnizca "git ve sor" tetigidir. Gercek sonuc
 *  `formSonucu(token)` ile iyzico'ya SORULUR. Bu POST'un imzasi dokumante
 *  edilmemistir, dolayisiyla icerigi KANIT sayilmaz.
 */
@Controller('abonelik')
export class IyzicoDonusController {
  private readonly uygulamaUrl: string;

  constructor(
    private readonly satinAlma: SatinAlmaServisi,
    config: ConfigService,
  ) {
    this.uygulamaUrl =
      config.get<string>('UYGULAMA_URL') ?? 'https://app.metapricex.com';
  }

  /**
   * iyzico buraya POST eder; biz isi bitirip tarayiciyi SONUC sayfasina
   * yonlendiririz.
   *
   * ⚠ 303 (See Other) kullaniliyor: 302 ile bazi tarayicilar yonlendirmeyi
   * de POST olarak izler ve sonuc sayfasi yine POST ile acilir. 303
   * yonlendirmeyi GET'e cevirmeyi ZORUNLU kilar — sayfa normal yuklenir,
   * kullanici yenilerse form yeniden gonderilmez.
   */
  @Post('iyzico-donus')
  async donus(
    @Body() govde: { token?: string } | undefined,
    @Res() cevap: Response,
  ): Promise<void> {
    const sonuc = await this.satinAlma.donusIyzicodan(govde?.token ?? '');
    cevap.redirect(303, `${this.uygulamaUrl}/abonelik/donus?sonuc=${sonuc}`);
  }
}
