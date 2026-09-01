import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { odemeAyari } from '../yapilandirma';
import { createHmac, randomBytes } from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  iyzico abonelik istemcisi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Neden resmî SDK'yı doğrudan kullanmıyoruz:
 *
 *  1. `iyzipay` paketi callback tabanlı, Promise döndürmüyor.
 *  2. TypeScript tipleri paketle gelmiyor. `@types/iyzipay` var ama
 *     2024'te kalmış ve hatalı: örneğin Locale'i "TR"|"EN" diye tanımlıyor,
 *     SDK'nın gerçek değerleri ise küçük harf ('tr'|'en').
 *  3. İstek modelleri katı beyaz liste: SDK'nın tanımadığı alanı SESSİZCE
 *     düşürüyor. `upgrade` çağrısındaki `resetRecurrenceCount` alanı
 *     SDK'da yok — SDK üzerinden gönderirseniz hiç gitmez, hata da almazsınız.
 *
 *  Bu yüzden REST'e doğrudan gidiyoruz. Yetkilendirme HMACSHA256 (v2).
 *  SDK'yı yine de kurabilirsiniz; burada gerek yok.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type IyzicoAbonelikDurumu =
  | 'ACTIVE'
  | 'PENDING'
  | 'UNPAID'
  | 'CANCELED' // tek L — iyzico'nun enum değeri böyle
  | 'EXPIRED'
  | 'UPGRADED';

export interface IyzicoOdemeDenemesi {
  paymentAttemptStatus: 'SUCCESS' | 'FAILED';
  paymentId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdDate?: string;
}

export interface IyzicoSiparis {
  referenceCode: string;
  orderStatus: 'WAITING' | 'SUCCESS' | 'FAILED';
  startPeriod?: string;
  endPeriod?: string;
  price?: number;
  paidPrice?: number;
  paymentAttempts?: IyzicoOdemeDenemesi[];
}

export interface IyzicoAbonelikDetayi {
  referenceCode: string;
  parentReferenceCode?: string;
  pricingPlanReferenceCode: string;
  customerReferenceCode: string;
  subscriptionStatus: IyzicoAbonelikDurumu;
  trialDays?: number;
  trialStartDate?: string;
  trialEndDate?: string;
  createdDate?: string;
  startDate?: string;
  endDate?: string;
  orders?: IyzicoSiparis[];
}

interface IyzicoYanit<T> {
  status: 'success' | 'failure';
  errorCode?: string;
  errorMessage?: string;
  systemTime?: number;
  conversationId?: string;
  data?: T;
}

export class IyzicoHatasi extends Error {
  constructor(
    readonly kod: string | undefined,
    mesaj: string,
    readonly httpDurum?: number,
  ) {
    super(mesaj);
    this.name = 'IyzicoHatasi';
  }
}

@Injectable()
export class IyzicoClient {
  private readonly logger = new Logger(IyzicoClient.name);
  private readonly tabanUrl: string;

  // ⚠ apiKey/secretKey KURUCUDA OKUNMAZ — getOrThrow burada cagrilirsa
  // degisken eksikken TUM API onyuklemede duser (bkz. yapilandirma.ts).
  // Deger ilk istekte istenir; eksikse yalnizca odeme uclari 503 doner.
  private get apiKey(): string {
    return odemeAyari(this.config, 'IYZICO_API_KEY');
  }
  private get secretKey(): string {
    return odemeAyari(this.config, 'IYZICO_SECRET_KEY');
  }

  constructor(private readonly config: ConfigService) {
    this.tabanUrl =
      this.config.get<string>('IYZICO_TABAN_URL') ??
      'https://sandbox-api.iyzipay.com';
  }

  // ── Yetkilendirme başlığı (HMACSHA256 / v2) ─────────────────────────────
  /**
   * ⚠ `rastgele` DISARIDAN GELIR — bu kasitli ve KRITIK.
   *
   * OLCULEN KUSUR (01.09, canli sandbox): bu metot kendi rastgele degerini
   * uretiyordu ve cagiran taraf `x-iyzi-rnd` basligina AYRI bir rastgele
   * koyuyordu. iyzico imzayi `randomKey` ile dogrular; imza A ile atilip
   * baslikta B gonderilince HER ISTEK
   *     "Authentication token is not verified"
   * ile reddediliyordu. Anahtarlar dogruydu, imza formulu dogruydu —
   * yalnizca iki rastgele deger AYRISIYORDU.
   *
   * Bu yuzden deger TEK YERDE uretilip HEM imzaya HEM baslIga verilir.
   * Imza ile baslik AYRISAMAZ: ikisi ayni degiskeni okur.
   */
  private yetkiBasligi(yol: string, govde: unknown, rastgele: string): string {
    const govdeMetni = govde ? JSON.stringify(govde) : '';
    const imzalanacak = rastgele + yol + govdeMetni;
    const imza = createHmac('sha256', this.secretKey)
      .update(imzalanacak)
      .digest('hex');
    const yetki = `apiKey:${this.apiKey}&randomKey:${rastgele}&signature:${imza}`;
    return `IYZWSv2 ${Buffer.from(yetki).toString('base64')}`;
  }

  private async istek<T>(
    metot: 'GET' | 'POST',
    yol: string,
    govde?: unknown,
  ): Promise<T> {
    const url = this.tabanUrl + yol;

    // ⚠ TEK rastgele deger: hem imzaya hem baslIga AYNI deger gider.
    // Ikisi ayrisirsa iyzico her istegi "Authentication token is not
    // verified" ile reddeder (01.09'da canli sandbox'ta olculdu).
    //
    // Bicim iyzico'nun kendi ornegindeki gibi: zaman damgasi + rakamlar.
    // Deger imzada ve baslIkta ayni oldugu surece icerigi teknik olarak
    // serbest; yine de saglayicinin kalibindan sapmiyoruz.
    const rastgele = `${Date.now()}${randomBytes(4).readUInt32BE(0)}`;

    // ⚠⚠ IMZAYA GIREN YOL SORGU DIZESI ICERMEZ.
    // iyzico dokumani: "The URI path does not include query strings — only
    // the endpoint path." Yani `/v2/subscription/products?page=1&count=100`
    // istegi icin imza `/v2/subscription/products` uzerinden hesaplanir.
    //
    // OLCULDU (01.09, canli sandbox): sorgu dizesi imzaya dahil edilince
    // HER GET istegi "Authentication token is not verified" aliyordu.
    // Sinsi tarafi: govdesiz POST'lar (sorgusuz) ETKILENMEZDI — yani kusur
    // yalnizca sorgu tasiyan uclarda gorunurdu. Ilk cagrimiz
    // `urunleriListele` oldugu icin dogrudan carptik.
    const imzaYolu = yol.split('?')[0];

    const cevap = await fetch(url, {
      method: metot,
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.yetkiBasligi(imzaYolu, govde, rastgele),
        'x-iyzi-rnd': rastgele,
      },
      body: govde ? JSON.stringify(govde) : undefined,
    });

    let json: IyzicoYanit<T>;
    try {
      json = (await cevap.json()) as IyzicoYanit<T>;
    } catch {
      throw new IyzicoHatasi(
        undefined,
        `iyzico yanıtı çözümlenemedi (HTTP ${cevap.status})`,
        cevap.status,
      );
    }

    if (json.status !== 'success') {
      throw new IyzicoHatasi(
        json.errorCode,
        json.errorMessage ?? 'iyzico bilinmeyen hata',
        cevap.status,
      );
    }
    return (json.data ?? (json as unknown)) as T;
  }

  // ── Ürün ve ödeme planı (kurulum) ───────────────────────────────────────
  /**
   * ⚠ BU IKI METOT TAHSILAT AKISINDA CAGRILMAZ — yalnizca KURULUM icindir
   * (`npm run seed:paketler`). Uretimde bir kez kosar, sonra dokunulmaz.
   *
   * iyzico'da yapi iki katmanlidir: URUN (yalnizca bir ad) ve ona bagli bir
   * ya da daha fazla ODEME PLANI (fiyat + periyot). Musteri PLANA abone olur.
   *
   * ⚠ URUN ADLARI TEKILDIR: ayni adla ikinci urun yaratilamaz. Bu yuzden
   * kurulum betigi once mevcut urunleri LISTELER.
   *
   * ⚠⚠ PLAN FIYATI OLUSTURULDUKTAN SONRA DEGISTIRILEMEZ. iyzico dokumani
   * yalnizca `name` ve `trialPeriodDays` guncellemesine izin veriyor.
   * Semadaki `PaketSurumu` tam olarak bu yuzden var: her fiyat degisikligi
   * YENI bir plan + yeni bir surum satiri demektir, eski aboneler eski
   * surumde kalir.
   */
  async urunleriListele(): Promise<
    Array<{ referenceCode: string; name: string }>
  > {
    const yanit = await this.istek<
      { items?: Array<{ referenceCode: string; name: string }> } | Array<{ referenceCode: string; name: string }>
    >('GET', '/v2/subscription/products?page=1&count=100');
    // Yanit sekli surumler arasinda degisebiliyor: dizi ya da {items:[…]}.
    if (Array.isArray(yanit)) return yanit;
    return yanit?.items ?? [];
  }

  async urunOlustur(p: {
    ad: string;
    aciklama?: string;
  }): Promise<{ referenceCode: string; name: string }> {
    return this.istek('POST', '/v2/subscription/products', {
      locale: 'tr',
      name: p.ad,
      description: p.aciklama,
    });
  }

  async planOlustur(
    urunKodu: string,
    p: {
      ad: string;
      /** ⚠ SONRADAN DEGISTIRILEMEZ. */
      tutar: number;
      paraBirimi: 'TRY' | 'USD' | 'EUR';
      periyot: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
      periyotAdedi?: number;
      denemeGunu?: number;
    },
  ): Promise<{
    referenceCode: string;
    productReferenceCode: string;
    name: string;
    price: number;
  }> {
    return this.istek(
      'POST',
      `/v2/subscription/products/${urunKodu}/pricing-plans`,
      {
        locale: 'tr',
        name: p.ad,
        price: p.tutar,
        currencyCode: p.paraBirimi,
        paymentInterval: p.periyot,
        paymentIntervalCount: p.periyotAdedi ?? 1,
        // RECURRING = suresiz tekrarlayan. Sinirli tekrar isteseydik
        // `recurrenceCount` gerekirdi; abonelikte istemiyoruz.
        planPaymentType: 'RECURRING',
        trialPeriodDays: p.denemeGunu ?? 0,
      },
    );
  }

  // ── Abonelik detayı ─────────────────────────────────────────────────────
  /**
   * MUTABAKATIN KALBİ.
   *
   * Webhook yalnızca "bir tahsilat başarılı/başarısız" der — abonelik iptal
   * edildiğinde, süresi dolduğunda ya da UNPAID'e düştüğünde HİÇBİR webhook
   * gelmez. Bu yüzden düzenli olarak buraya sormak zorundayız.
   */
  async abonelikGetir(abonelikKodu: string): Promise<IyzicoAbonelikDetayi> {
    return this.istek<IyzicoAbonelikDetayi>(
      'GET',
      `/v2/subscription/subscriptions/${abonelikKodu}`,
    );
  }

  // ── Başarısız tahsilatı yeniden dene ────────────────────────────────────
  /**
   * `siparisKodu` = başarısızlık webhook'undaki `orderReferenceCode`.
   *
   * DİKKAT: iyzico başarısız tahsilatı KENDİLİĞİNDEN tekrar denemiyor —
   * dokümante edilmiş otomatik bir dunning takvimi yok. Yeniden deneme
   * tamamen sizin sorumluluğunuzda. Pencere: başarısızlıktan sonra 160 gün.
   */
  async tahsilatiTekrarla(siparisKodu: string): Promise<unknown> {
    return this.istek('POST', '/v2/subscription/operation/retry', {
      referenceCode: siparisKodu,
      locale: 'tr',
    });
  }

  // ── İptal ───────────────────────────────────────────────────────────────
  async abonelikIptal(abonelikKodu: string): Promise<unknown> {
    return this.istek(
      'POST',
      `/v2/subscription/subscriptions/${abonelikKodu}/cancel`,
      { locale: 'tr' },
    );
  }

  async abonelikAktiflestir(abonelikKodu: string): Promise<unknown> {
    return this.istek(
      'POST',
      `/v2/subscription/subscriptions/${abonelikKodu}/activate`,
      { locale: 'tr' },
    );
  }

  // ── Paket değişimi ──────────────────────────────────────────────────────
  /**
   * iyzico buna "upgrade" diyor ama düşüş (downgrade) için de aynı uç kullanılır.
   *
   * `resetRecurrenceCount` alanı resmî SDK'nın beyaz listesinde YOK; SDK ile
   * gönderirseniz sessizce düşer. REST'e doğrudan gittiğimiz için burada çalışır.
   */
  async paketDegistir(
    abonelikKodu: string,
    p: {
      yeniPlanKodu: string;
      nezaman?: 'NOW' | 'NEXT_PERIOD';
      denemeUygula?: boolean;
      tekrarSayisiniSifirla?: boolean;
    },
  ): Promise<unknown> {
    return this.istek(
      'POST',
      `/v2/subscription/subscriptions/${abonelikKodu}/upgrade`,
      {
        locale: 'tr',
        newPricingPlanReferenceCode: p.yeniPlanKodu,
        upgradePeriod: p.nezaman ?? 'NEXT_PERIOD',
        useTrial: p.denemeUygula ?? false,
        resetRecurrenceCount: p.tekrarSayisiniSifirla ?? false,
      },
    );
  }

  // ── Kart güncelleme sayfası ─────────────────────────────────────────────
  /**
   * Dunning'in en değerli parçası. Başarısız tahsilatta müşteriye
   * gönderilecek bağlantı buradan çıkar.
   *
   * Dönen `checkoutFormContent` bir HTML parçası; kendi sayfanıza gömersiniz.
   * Yeni kart, 1 TL çekilip anında iade edilerek doğrulanır.
   */
  async kartGuncellemeSayfasi(
    abonelikKodu: string,
    donusUrl: string,
  ): Promise<{
    token: string;
    checkoutFormContent: string;
    tokenExpireTime: number;
  }> {
    return this.istek(
      'POST',
      '/v2/subscription/card-update/checkoutform/initialize/with-subscription',
      {
        locale: 'tr',
        subscriptionReferenceCode: abonelikKodu,
        callbackUrl: donusUrl,
      },
    );
  }

  // ── Abonelik başlatma (barındırılan form) ───────────────────────────────
  /**
   * DİKKAT — abonelikte 3D Secure YOKTUR.
   * iyzico dokümanı (yalnızca Türkçe sayfada): "Abonelik işlemlerinde ilk
   * işlem dahil, tüm işlemler NON3D olarak gerçekleştirilmektedir."
   * Yani buradaki "checkout form" sadece kart toplama arayüzüdür, 3DS
   * doğrulaması çalıştırmaz. mdStatus, 3DS callback'i beklemeyin.
   */
  async abonelikBaslat(p: {
    planKodu: string;
    donusUrl: string;
    baslangicDurumu?: 'ACTIVE' | 'PENDING';
    musteri: {
      name: string;
      surname: string;
      email: string;
      gsmNumber: string;
      identityNumber: string;
      billingAddress: {
        contactName: string;
        city: string;
        country: string;
        address: string;
        zipCode?: string;
      };
    };
    konusmaId?: string;
  }): Promise<{
    token: string;
    checkoutFormContent: string;
    tokenExpireTime: number;
  }> {
    return this.istek(
      'POST',
      '/v2/subscription/checkoutform/initialize',
      {
        locale: 'tr',
        conversationId: p.konusmaId,
        pricingPlanReferenceCode: p.planKodu,
        subscriptionInitialStatus: p.baslangicDurumu ?? 'ACTIVE',
        callbackUrl: p.donusUrl,
        customer: p.musteri,
      },
    );
  }

  /**
   * Barındırılan form dönüşünde çağrılır.
   *
   * iyzico dönüş adresine POST ile yalnızca `token` gönderiyor ve bu POST'un
   * imzası dokümante edilmemiş. Bu yüzden dönüş gövdesine ASLA güvenmeyin —
   * sadece "git ve sor" tetikleyicisi olarak kullanın. Gerçek sonuç budur.
   */
  async formSonucu(token: string): Promise<{
    referenceCode: string;
    parentReferenceCode?: string;
    subscriptionStatus: IyzicoAbonelikDurumu;
    customerReferenceCode: string;
    pricingPlanReferenceCode: string;
  }> {
    return this.istek(
      'GET',
      `/v2/subscription/checkoutform/${token}`,
    );
  }
}
