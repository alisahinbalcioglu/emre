import { Body, Controller, Get, Param, ParseUUIDPipe, Post, SetMetadata, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../altyapi/auth/guards/jwt-auth.guard';
import {
  KAPALI_HESAP_IZINLI,
  KapaliHesapIzinli,
} from '../../../altyapi/auth/decorators/kapali-hesap-izinli.decorator';
import { Throttle } from '@nestjs/throttler';
import { FirmaRolGuard } from '../../../altyapi/auth/guards/firma-rol.guard';
import { KullaniciHizSiniriGuard } from '../../../altyapi/auth/guards/kullanici-hiz-siniri.guard';
import { FirmaRolu } from '../../../altyapi/auth/decorators/firma-rolu.decorator';
import { CurrentUser } from '../../../altyapi/auth/decorators/current-user.decorator';
import { kimlikCoz } from '../../../altyapi/auth/kimlik';
import { ErisimServisi } from './erisim.servisi';
import { SatinAlmaServisi } from './satinalma.servisi';
import { DenemeHakkiServisi } from './deneme-hakki.servisi';
import { PaketDegisimiServisi } from './paket-degisimi.servisi';
import { PaketOnerisiServisi } from './yonetici/paket-onerisi.servisi';
import { AbonelikBaslaDto } from './dto/abonelik-basla.dto';
import { AbonelikDegistirDto } from './dto/abonelik-degistir.dto';

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
    private readonly paketDegisimi: PaketDegisimiServisi,
    private readonly paketOnerisi: PaketOnerisiServisi,
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
    const [paketler, karar, oneri] = await Promise.all([
      this.satinAlma.satistakiPaketler(),
      this.denemeHakki.karar({ firmaId, kullaniciId: userId }),
      this.paketOnerisi.bekleyen(firmaId),
    ]);
    // A2 Blok 2: yonetici notu yalniz SAHIBE (kabul/ret onun isi). Rol her
    // istekte veritabanindan okunur (jwt.strategy) — token'daki eski deger degil.
    const sahip = (kullanici as { firmaRol?: string }).firmaRol === 'sahip';
    // ⚠ 23.09 — KARTIN DUGMESI SUNUCUDAN: "satin al / bu pakete gec / gecilemez
    // (neden)". `degistir` ucuyla AYNI saf karar (`paketDegisimYolu`) — ekran
    // "gec" deyip sunucu reddedemez. Firma bazli oldugu icin BURADA eklenir,
    // `satistakiPaketler()` icinde DEGIL (deneme hakkiyla ayni gerekce: girissiz
    // `/fiyatlar` o metodu 60 sn onbellekler).
    const yollar = await this.paketDegisimi.yollar(
      firmaId,
      paketler.map((p) => p.surum.paketSurumuId),
    );
    return paketler.map((p) => ({
      ...p,
      surum: {
        ...p.surum,
        // Denemesiz surumde soru anlamsiz: hak da gerekce de "yok".
        denemeHakki: p.surum.denemeGunu > 0 && karar.hak,
        denemeGerekcesi: p.surum.denemeGunu > 0 ? karar.gerekce : null,
      },
      degisim: yollar.get(p.surum.paketSurumuId) ?? { yol: 'satin-al' as const },
      // A2 Blok 2: bekleyen yonetici onerisi HEDEF paketin satirinda (dizi
      // bicimi korunur; `degisim` A1'in saf karari olarak kalir).
      ...(oneri && oneri.hedefPaketSurumuId === p.surum.paketSurumuId
        ? {
            oneri: {
              id: oneri.id,
              sonGecerlilik: oneri.sonGecerlilik,
              not: sahip ? oneri.musteriNotu : null,
            },
          }
        : {}),
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
   * PAKET DEGISIMI (23.09.2026) — kart aboneligi olan firmanin baska pakete
   * gecisi. Yukseltme ozellikleri HEMEN acar, ucret donem sonunda; dusurme ve
   * yatay gecis donem sonunda (bkz. `paket-degisimi.ts`).
   *
   * ⚠ SAHIP KAPISI `basla` ile ayni gerekce: sozlesme bedelini degistiren is.
   * ⚠ ErisimGuard YOK (sinif basligi): yalniz AKTIF/DENEME firma degistirir,
   * o kural `paketDegisimYolu`ndadir — kapiya baglamak odemesi geciken
   * firmanin mesajini "erisiminiz yok" yapardi, "once odeyin" degil.
   * ⚠ KAPALI HESAP BU UCTA YOK (sinif duzeyindeki izin METOTTA ezilir —
   * `JwtAuthGuard` `getAllAndOverride` ile once metodu okur). Emre: kapali
   * hesap "islem yapamayacak"; geri donusun yolu SATIN ALMADIR, paket
   * degistirmek degil. Olagan yolda abonelik zaten IPTAL'dir (hesap kapatma
   * iptal eder) ve karar reddederdi; bu satir iptalin iyzico'da DUSTUGU
   * ("ELLE IPTAL GEREKEBILIR") nadir hali de kapatir.
   */
  @UseGuards(FirmaRolGuard)
  @FirmaRolu('sahip')
  @SetMetadata(KAPALI_HESAP_IZINLI, false)
  // ⚠ HIZ SINIRI (kullanici basina 15 dk'da 5): her cagri iyzico'ya gider ve
  // basarisiz deneme olay kaydi yazar. Donem basina TEK degisim kurali zaten
  // ikinci BASARILI cagriyi durdurur; sinir basarisiz denemelerin sagini keser.
  // Oturum sahibi kovasi (IP degil): ayni ofis NAT'i ekibi birbirine takmaz.
  @UseGuards(KullaniciHizSiniriGuard)
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('degistir')
  async degistir(@CurrentUser() kullanici: unknown, @Body() g: AbonelikDegistirDto) {
    const { firmaId, userId } = kimlikCoz(kullanici);
    return this.paketDegisimi.degistir(
      {
        firmaId,
        kullaniciId: userId,
        paketSurumuId: g.paketSurumuId,
        sozlesmeOnayi: g.sozlesmeOnayi,
      },
      // A2 Blok 2: yonetici onerisinin KABULU ayni uc, ayni cekirdek.
      g.oneriId ? this.paketOnerisi.kabulKancalari({ firmaId, oneriId: g.oneriId, kullaniciId: userId }) : undefined,
    );
  }

  /**
   * YONETICI ONERISINI REDDET (A2 Blok 2). Paketi degistirmez, yalniz oneriyi
   * kapatir; kabul `degistir` + `oneriId`dir.
   * ⚠ Kapilar `degistir` ile ayni gerekceyle: SAHIP + kapali hesapta YOK
   * (servis rolu kuyrukta veritabanindan yeniden okur).
   * ⚠ `degistir`den SONRA durur: A1 kapisi (B0b) `degistir`in dekorator
   * blogunu ONCEKI metodun kapanisindan keser; araya metot girerse bozulur.
   */
  @UseGuards(FirmaRolGuard)
  @FirmaRolu('sahip')
  @SetMetadata(KAPALI_HESAP_IZINLI, false)
  @UseGuards(KullaniciHizSiniriGuard)
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @Post('oneri/:oneriId/reddet')
  async oneriReddet(
    @CurrentUser() kullanici: unknown,
    @Param('oneriId', new ParseUUIDPipe()) oneriId: string,
  ) {
    const { firmaId, userId } = kimlikCoz(kullanici);
    return this.paketOnerisi.reddet({ firmaId, oneriId, kullaniciId: userId });
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
    // Müşterinin KENDİ iptali: onay e-postası yalnız bu yoldan (25.09).
    return this.satinAlma.iptalEt(firmaId, userId, g.neden, { musteriyeBildir: true });
  }
}
