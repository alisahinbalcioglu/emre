import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AbonelikBaslatmaDurumu,
  AbonelikDurumu,
  OdemeYontemi,
} from '@prisma/client';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { IyzicoClient } from '../iyzico/iyzico.client';
import { AbonelikServisi } from './abonelik.servisi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SATIN ALMA — kart aboneliginin BASLATILMASI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ BU DOSYA GELEN PAKETTE YOKTU. Olculmus eksik:
 *
 *  `IyzicoClient` uzerinde `abonelikBaslat`, `formSonucu`,
 *  `kartGuncellemeSayfasi`, `abonelikIptal` ve `paketDegistir` metotlari
 *  TANIMLIYDI ama HICBIRININ CAGRI YERI YOKTU (olculdu: 5 metot × 0 cagri).
 *  Ayni sekilde `Abonelik.iyzicoAbonelikKodu` alani 8 yerde OKUNUYOR, hicbir
 *  yerde YAZILMIYORDU; `prisma.abonelik.create` yalnizca HAVALE yolunda
 *  geciyordu.
 *
 *  Sonuc: paket, abonelik VAR OLDUKTAN SONRASINI eksiksiz yonetiyordu
 *  (webhook, dunning, mutabakat, fatura) ama aboneligi ACAN yol yoktu.
 *  Kart ile kimse abone OLAMAZ, her webhook eslesmeyen abonelik kodu ile
 *  gelip yutulurdu. OKUBENI.md'nin "entegrasyonun kurulu oldugu varsayiliyor"
 *  cumlesi bu depoda TUTMUYOR — kurulu degildi.
 *
 *  ── DONUSUN GUVENILMEZLIGI ──────────────────────────────────────────────
 *  iyzico donus adresine yalnizca opak bir `token` POST eder ve bu POST'un
 *  imzasi dokumante EDILMEMISTIR. Bu yuzden:
 *    1. Donus govdesine ASLA guvenilmez — sadece "git ve sor" tetigidir.
 *    2. Gercek sonuc `formSonucu(token)` ile iyzico'dan SORULUR.
 *    3. token→firma baglantisi bizim `AbonelikBaslatma` tablomuzdan gelir;
 *       istekle gelen firmaId'ye guvenilmez.
 *
 *  ── ODEDI AMA ERISIM ACILMADI (kurtarma) ───────────────────────────────
 *  Musteri karti girip tahsilat gectikten SONRA sekmeyi kapatirsa donus hic
 *  gelmez. O hâlde abonelik satiri acilmaz, webhook eslesmeyen kodla gelip
 *  yutulur ve musteri ODEDIGI HALDE erisim ALAMAZ.
 *  `bekleyenNiyetleriTara` bu dongunun panzehiridir: donusu gelmemis
 *  niyetleri iyzico'ya sorar ve tahsilat gectiyse aboneligi SUNUCU TARAFINDA
 *  acar. Erisim, musterinin tarayicisini acik tutmasina bagli DEGILDIR.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * Webhook gecikme tamponu (gun).
 *
 * ⚠ OLCULEN KENAR DURUM: deneme 30 gunse iyzico TAM 30. gunde tahsilat
 * yapar. Erisimimiz de tam 30. gunde bitiyorsa, webhook birkac dakika
 * gecikirse `ErisimServisi` "deneme suresi doldu" der ve PARASINI ODEMIS
 * musteriyi kapida birakir. iyzico webhook'u 2xx alana kadar 15 dakikada
 * bir dener; surec yeniden baslarsa dakikalik emniyet taramasi devreye
 * girene kadar gecikme uzayabilir.
 *
 * Iki yon de tartildi: odeme GERCEKTEN basarisizsa musteri 2 gun fazladan
 * erisir — sinirli ve kabul edilebilir. Tersi (odeyene kapiyi kapatmak)
 * destek talebi ve guven kaybi uretir.
 */
export const TAMPON_GUN = 2;

/**
 * Erisim bitisini ve GERCEK deneme bitisini hesaplar. SAF fonksiyon —
 * DB'siz test edilebilsin diye disari alindi (metin denetimi degil
 * DAVRANIS olculebilsin).
 *
 * ⚠ IKI TARIH AYRIDIR ve ayni degere baglanmamalidir:
 *   erisimSonu  → teknik emniyet payi TASIR (tampon dahil)
 *   denemeSonu  → kullaniciya GOSTERILEN ve iyzico'nun tahsilat yapacagi
 *                 tarih; tamponsuz. Ikisi birlesirse ekran "2 gun daha
 *                 deneme var" yalanini soyler.
 */
export function donemTarihleriHesapla(
  simdi: Date,
  denemeGunu: number,
): { erisimSonu: Date; denemeSonu: Date | null } {
  const temelGun = denemeGunu > 0 ? denemeGunu : 31;
  const erisimSonu = new Date(
    simdi.getTime() + (temelGun + TAMPON_GUN) * 86_400_000,
  );
  const denemeSonu =
    denemeGunu > 0
      ? new Date(simdi.getTime() + denemeGunu * 86_400_000)
      : null;
  return { erisimSonu, denemeSonu };
}

@Injectable()
export class SatinAlmaServisi {
  private readonly logger = new Logger(SatinAlmaServisi.name);
  private readonly uygulamaUrl: string;

  /** Bir niyeti kac kez sorarsak vazgecerz. */
  private readonly AZAMI_DENEME = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly iyzico: IyzicoClient,
    private readonly abonelik: AbonelikServisi,
    config: ConfigService,
  ) {
    this.uygulamaUrl =
      config.get<string>('UYGULAMA_URL') ?? 'https://app.metapricex.com';
  }

  // ── Satisa acik paketler ────────────────────────────────────────────────
  /**
   * Fiyat sayfasinin kaynagi. Her paketin YALNIZCA satistaki en guncel
   * surumu doner — eski surumler mevcut abonelerde yasar ama satilmaz.
   */
  async satistakiPaketler() {
    const paketler = await this.prisma.paket.findMany({
      where: { aktif: true },
      orderBy: { sira: 'asc' },
      include: {
        surumler: {
          where: { satistaMi: true },
          orderBy: { surumNo: 'desc' },
          take: 1,
        },
      },
    });

    return paketler
      .filter((p) => p.surumler.length > 0)
      .map((p) => {
        const s = p.surumler[0];
        return {
          paketId: p.id,
          kod: p.kod,
          ad: p.ad,
          aciklama: p.aciklama,
          kapsam: p.kapsam,
          seviye: p.seviye,
          kullaniciHakki: p.kullaniciHakki,
          aylikTeklifHakki: p.aylikTeklifHakki,
          dwgAktif: p.dwgAktif,
          surum: {
            paketSurumuId: s.id,
            // Decimal → string: para JS float'ina DUSURULMEZ (P2 turu dersi).
            tutar: s.tutar.toFixed(2),
            paraBirimi: s.paraBirimi,
            periyot: s.periyot,
            periyotAdedi: s.periyotAdedi,
            denemeGunu: s.denemeGunu,
          },
        };
      });
  }

  // ── 1. Kart aboneligini baslat ──────────────────────────────────────────
  /**
   * iyzico'nun barindirilan formunu acar ve niyeti kaydeder.
   *
   * DIKKAT: abonelikte 3D Secure YOKTUR (iyzico TR dokumani: "Abonelik
   * islemlerinde ilk islem dahil, tum islemler NON3D olarak
   * gerceklestirilmektedir."). Donen `checkoutFormContent` yalnizca kart
   * toplama arayuzudur; mdStatus / 3DS callback beklemeyin.
   */
  async baslat(p: {
    firmaId: string;
    kullaniciId: string;
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
  }) {
    const surum = await this.prisma.paketSurumu.findUnique({
      where: { id: p.paketSurumuId },
      include: { paket: true },
    });
    if (!surum) throw new NotFoundException('Paket surumu bulunamadi');
    if (!surum.satistaMi)
      throw new BadRequestException('Bu paket surumu satista degil');

    // Zaten SAGLIKLI bir aboneligi olan firma yeniden satin alamaz —
    // paket degisimi ayri bir yoldur (paketDegistir). Bu kapi olmazsa ayni
    // firmaya iyzico'da IKI abonelik acilir ve iki kez tahsilat yapilir.
    const mevcut = await this.prisma.abonelik.findUnique({
      where: { firmaId: p.firmaId },
    });
    if (
      mevcut &&
      mevcut.durum !== AbonelikDurumu.SONA_ERDI &&
      mevcut.durum !== AbonelikDurumu.ASKIDA
    ) {
      throw new BadRequestException(
        'Firmanizin zaten etkin bir aboneligi var. Paket degistirmek icin ' +
          'abonelik sayfasindaki yukseltme yolunu kullanin.',
      );
    }

    const sonuc = await this.iyzico.abonelikBaslat({
      planKodu: surum.iyzicoPlanKodu,
      donusUrl: `${this.uygulamaUrl}/abonelik/donus`,
      musteri: {
        name: p.musteri.ad,
        surname: p.musteri.soyad,
        email: p.musteri.eposta,
        gsmNumber: p.musteri.telefon,
        identityNumber: p.musteri.kimlikNo,
        billingAddress: {
          contactName: `${p.musteri.ad} ${p.musteri.soyad}`,
          city: p.musteri.sehir,
          country: 'Turkiye',
          address: p.musteri.adres,
          zipCode: p.musteri.postaKodu,
        },
      },
    });

    await this.prisma.abonelikBaslatma.create({
      data: {
        token: sonuc.token,
        firmaId: p.firmaId,
        paketSurumuId: surum.id,
        olusturanId: p.kullaniciId,
      },
    });

    return {
      token: sonuc.token,
      formIcerigi: sonuc.checkoutFormContent,
      gecerlilikSonu: sonuc.tokenExpireTime,
    };
  }

  // ── 2. Form donusu ──────────────────────────────────────────────────────
  /**
   * Donus sayfasindan cagrilir. `token` disinda HICBIR sey istekten alinmaz;
   * firma ve paket bilgisi niyet kaydindan okunur.
   *
   * @param firmaId Cagiran oturumun firmasi — niyetle ESLESMELI. Eslesmezse
   *   baskasinin token'iyla kendine abonelik acma yolu kapanir.
   */
  async donus(token: string, firmaId: string) {
    const niyet = await this.prisma.abonelikBaslatma.findUnique({
      where: { token },
    });
    if (!niyet) throw new NotFoundException('Satin alma kaydi bulunamadi');
    if (niyet.firmaId !== firmaId) {
      // Baska bir firmanin token'i. Sessizce 404 — varligini dogrulamayiz.
      throw new NotFoundException('Satin alma kaydi bulunamadi');
    }
    if (niyet.durum === AbonelikBaslatmaDurumu.TAMAMLANDI) {
      return { durum: niyet.durum, abonelikKodu: niyet.iyzicoAbonelikKodu };
    }

    return this.niyetiSonuclandir(niyet.id);
  }

  /**
   * Niyeti iyzico'ya sorup sonuclandirir. Hem donus yolundan hem kurtarma
   * taramasindan cagrilir — TEK yol, iki tetikleyici.
   */
  private async niyetiSonuclandir(niyetId: string) {
    const niyet = await this.prisma.abonelikBaslatma.findUniqueOrThrow({
      where: { id: niyetId },
      include: { paketSurumu: { include: { paket: true } } },
    });

    let sonuc: Awaited<ReturnType<IyzicoClient['formSonucu']>>;
    try {
      sonuc = await this.iyzico.formSonucu(niyet.token);
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      await this.prisma.abonelikBaslatma.update({
        where: { id: niyetId },
        data: {
          denemeSayisi: { increment: 1 },
          sonKontrol: new Date(),
          hata: mesaj,
        },
      });
      throw e;
    }

    // iyzico abonelik acmadiysa odeme gecmemistir.
    if (!sonuc?.referenceCode) {
      await this.prisma.abonelikBaslatma.update({
        where: { id: niyetId },
        data: {
          denemeSayisi: { increment: 1 },
          sonKontrol: new Date(),
          hata: 'iyzico abonelik kodu dondurmedi',
        },
      });
      return { durum: AbonelikBaslatmaDurumu.BEKLIYOR, abonelikKodu: null };
    }

    const abonelik = await this.aboneligiAcVeyaGuncelle({
      firmaId: niyet.firmaId,
      paketSurumuId: niyet.paketSurumuId,
      iyzicoAbonelikKodu: sonuc.referenceCode,
      iyzicoMusteriKodu: sonuc.customerReferenceCode,
      iyzicoDurum: sonuc.subscriptionStatus,
      denemeGunu: niyet.paketSurumu.denemeGunu,
    });

    await this.prisma.abonelikBaslatma.update({
      where: { id: niyetId },
      data: {
        durum: AbonelikBaslatmaDurumu.TAMAMLANDI,
        iyzicoAbonelikKodu: sonuc.referenceCode,
        sonuclandi: new Date(),
        sonKontrol: new Date(),
        hata: null,
      },
    });

    this.logger.log(
      `Abonelik acildi: firma=${niyet.firmaId} paket=${niyet.paketSurumu.paket.kod} ` +
        `iyzico=${sonuc.referenceCode}`,
    );

    return {
      durum: AbonelikBaslatmaDurumu.TAMAMLANDI,
      abonelikKodu: sonuc.referenceCode,
      abonelikId: abonelik.id,
    };
  }

  /**
   * Aboneligi acar; firma daha once abone olup birakmissa AYNI satiri
   * gunceller (firmaId @unique oldugu icin ikinci satir zaten acilamaz).
   */
  private async aboneligiAcVeyaGuncelle(p: {
    firmaId: string;
    paketSurumuId: string;
    iyzicoAbonelikKodu: string;
    iyzicoMusteriKodu?: string;
    iyzicoDurum?: string;
    denemeGunu: number;
  }) {
    const simdi = new Date();
    // Donem tarihleri SAF fonksiyondan gelir (donemTarihleriHesapla) —
    // boylece tampon ve deneme bitisi DB'siz, davranis duzeyinde
    // olculebilir. Kesin donem sonu ilk basarili tahsilat webhook'unda
    // iyzico'dan gelip `erisimSonu`nu EZER; burasi kopru degerdir.
    const { erisimSonu, denemeSonu } = donemTarihleriHesapla(
      simdi,
      p.denemeGunu,
    );

    const mevcut = await this.prisma.abonelik.findUnique({
      where: { firmaId: p.firmaId },
    });

    const durum =
      p.denemeGunu > 0 ? AbonelikDurumu.DENEME : AbonelikDurumu.AKTIF;

    if (!mevcut) {
      return this.prisma.abonelik.create({
        data: {
          firmaId: p.firmaId,
          paketSurumuId: p.paketSurumuId,
          durum,
          erisimSonu,
          denemeSonu,
          odemeYontemi: OdemeYontemi.KART,
          iyzicoAbonelikKodu: p.iyzicoAbonelikKodu,
          // ILK abonelikte kod KENDISI kokUdur. Plan degisiminde
          // `iyzicoAbonelikKodu` degisir ama bu SABIT kalir — webhook
          // eslemesi zincir kokuyle yapilir (abonelik.servisi:aboneligiKodlaBul).
          iyzicoKokKodu: p.iyzicoAbonelikKodu,
          iyzicoMusteriKodu: p.iyzicoMusteriKodu,
          iyzicoDurum: p.iyzicoDurum,
          iyzicoSonKontrol: simdi,
        },
      });
    }

    // Geri donen musteri: satir yeniden canlandirilir, dunning sayaclari
    // sifirlanir (eski basarisizlik yeni abonelige tasinmaz).
    const guncel = await this.prisma.abonelik.update({
      where: { id: mevcut.id },
      data: {
        paketSurumuId: p.paketSurumuId,
        durum,
        erisimSonu,
        denemeSonu,
        odemeYontemi: OdemeYontemi.KART,
        iyzicoAbonelikKodu: p.iyzicoAbonelikKodu,
          // ILK abonelikte kod KENDISI kokUdur. Plan degisiminde
          // `iyzicoAbonelikKodu` degisir ama bu SABIT kalir — webhook
          // eslemesi zincir kokuyle yapilir (abonelik.servisi:aboneligiKodlaBul).
          iyzicoKokKodu: p.iyzicoAbonelikKodu,
        iyzicoMusteriKodu: p.iyzicoMusteriKodu,
        iyzicoDurum: p.iyzicoDurum,
        iyzicoSonKontrol: simdi,
        ilkBasarisizlik: null,
        denemeSayisi: 0,
        sonDeneme: null,
        kisitlandi: null,
        iptalTalebi: null,
        iptalNedeni: null,
      },
    });

    await this.prisma.abonelikOlayi.create({
      data: {
        abonelikId: guncel.id,
        tip: 'abonelik.yeniden.acildi',
        oncekiDurum: mevcut.durum,
        yeniDurum: durum,
        aciklama: 'Kart ile yeniden abone olundu',
        aktor: 'sistem',
      },
    });

    return guncel;
  }

  // ── 3. Kart guncelleme sayfasi ──────────────────────────────────────────
  async kartGuncellemeFormu(firmaId: string) {
    const ab = await this.prisma.abonelik.findUnique({ where: { firmaId } });
    if (!ab?.iyzicoAbonelikKodu) {
      throw new BadRequestException(
        'Kart guncelleme yalnizca kart ile odenen aboneliklerde gecerlidir.',
      );
    }
    const sonuc = await this.iyzico.kartGuncellemeSayfasi(
      ab.iyzicoAbonelikKodu,
      `${this.uygulamaUrl}/abonelik/kart-donus`,
    );
    return {
      token: sonuc.token,
      formIcerigi: sonuc.checkoutFormContent,
      gecerlilikSonu: sonuc.tokenExpireTime,
    };
  }

  // ── 4. Iptal ────────────────────────────────────────────────────────────
  /**
   * Musteri iptali. Erisim DONEM SONUNA KADAR SURER (erisimSonu'na
   * dokunulmaz) — odenmis donemi geri almak sozlesmeye aykiri olurdu.
   */
  async iptalEt(firmaId: string, kullaniciId: string, neden?: string) {
    const ab = await this.prisma.abonelik.findUnique({ where: { firmaId } });
    if (!ab) throw new NotFoundException('Abonelik bulunamadi');

    if (ab.iyzicoAbonelikKodu) {
      await this.iyzico.abonelikIptal(ab.iyzicoAbonelikKodu);
    }

    await this.abonelik.durumDegistir(ab.id, AbonelikDurumu.IPTAL, {
      aciklama: neden ?? 'Musteri talebi',
      aktor: kullaniciId,
    });

    await this.prisma.abonelik.update({
      where: { id: ab.id },
      data: { iptalTalebi: new Date(), iptalNedeni: neden ?? null },
    });

    return { durum: AbonelikDurumu.IPTAL, erisimSonu: ab.erisimSonu };
  }

  // ── 5. Kurtarma taramasi ────────────────────────────────────────────────
  /**
   * "Odedi ama erisim acilmadi" dongusunun panzehiri. Bkz. sinif basligi.
   *
   * 10 dakikada bir: donusu gelmemis, 5 dakikadan eski niyetleri iyzico'ya
   * sorar. Tahsilat gectiyse aboneligi acar.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async bekleyenNiyetleriTara(): Promise<void> {
    const bes = new Date(Date.now() - 5 * 60_000);
    const bekleyenler = await this.prisma.abonelikBaslatma.findMany({
      where: {
        durum: AbonelikBaslatmaDurumu.BEKLIYOR,
        olusturuldu: { lt: bes },
        denemeSayisi: { lt: this.AZAMI_DENEME },
      },
      orderBy: { olusturuldu: 'asc' },
      take: 50,
    });

    for (const n of bekleyenler) {
      try {
        await this.niyetiSonuclandir(n.id);
      } catch (e) {
        this.logger.warn(
          `Niyet ${n.id} sonuclandirilamadi: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    // Denemesi tukenmis niyetleri kapat — sonsuz kuyruk birikmesin.
    const tukenmis = await this.prisma.abonelikBaslatma.updateMany({
      where: {
        durum: AbonelikBaslatmaDurumu.BEKLIYOR,
        denemeSayisi: { gte: this.AZAMI_DENEME },
      },
      data: { durum: AbonelikBaslatmaDurumu.VAZGECILDI },
    });
    if (tukenmis.count > 0) {
      this.logger.warn(
        `${tukenmis.count} satin alma niyeti denemesi tukendigi icin kapatildi.`,
      );
    }
  }
}
