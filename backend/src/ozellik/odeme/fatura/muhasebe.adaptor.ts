import { FactoryProvider, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { EpostaServisi } from '../eposta/eposta.servisi';
import { yonetimeYazKritik } from '../eposta/yonetim-bildirimi';
import { faturaKesimTalebiEpostasi, havaleKimligi } from './fatura-kesim-epostasi';

export const MUHASEBE_ADAPTORU = Symbol('MUHASEBE_ADAPTORU');

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Muhasebe/e-fatura sağlayıcı arayüzü
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Bilerek soyut: Paraşüt, Logo İşbaşı, BizimHesap, Uyumsoft, Nilvera…
 *  hepsi aynı işi farklı alan adlarıyla yapıyor. Sağlayıcı değiştirmek
 *  yalnızca bu dosyada yeni bir sınıf yazmak olsun istiyoruz.
 *
 *  ⚠️  AŞAĞIDAKİ PARAŞÜT UYGULAMASI DOĞRULANMAMIŞTIR.
 *  Paraşüt'ün API alan adlarını ve uç noktalarını kendi hesabınızın
 *  dokümanından teyit edip düzeltin. Değerli olan kısım FaturaServisi'ndeki
 *  kuyruk/tekrar/tekilleştirme mantığıdır; bu dosya onun takılacağı fiştir.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface FaturaMusterisi {
  unvan: string;
  vergiNo?: string;
  vergiDairesi?: string;
  tcKimlikNo?: string;
  eposta: string;
  adres?: string;
  il?: string;
  ilce?: string;
}

export interface FaturaKalemi {
  ad: string;
  aciklama?: string;
  miktar: number;
  birim: string;
  /** KDV HARİÇ birim fiyat. */
  birimFiyat: number;
  kdvOrani: number;
}

export interface FaturaKesTalebi {
  /** Sağlayıcı tarafında çift kayıt olmasını engelleyen anahtar. */
  harciAnahtar: string;
  musteri: FaturaMusterisi;
  kalemler: FaturaKalemi[];
  paraBirimi: string;
  duzenlemeTarihi: Date;
  /**
   * 24.09.2026 — `Fatura` satırının KENDİ tutarları ve ödeme anı. Elle (NES)
   * kesim bunları yöneticiye yazar; kalemlerden yeniden hesaplamak KDV dahil
   * tutardan ayrıştırılan matrah + KDV'yi 1 kuruş kaydırabilir (999,99 →
   * 833,33 + 166,66). Otomatik sağlayıcılar kalemleri kullanır.
   */
  tahsilat?: { matrah: number; kdv: number; toplam: number; tarih: Date };
}

export interface FaturaKesSonucu {
  saglayiciId: string;
  faturaNo?: string;
  faturaUrl?: string;
}

export interface MuhasebeAdaptoru {
  readonly ad: string;
  faturaKes(talep: FaturaKesTalebi): Promise<FaturaKesSonucu>;
}

/* ─────────────────────────────────────────────────────────────────────────
   Paraşüt — İSKELET, alan adları teyide muhtaç
   ───────────────────────────────────────────────────────────────────────── */
@Injectable()
export class ParasutAdaptoru implements MuhasebeAdaptoru {
  readonly ad = 'parasut';
  private readonly logger = new Logger(ParasutAdaptoru.name);
  private jeton?: { deger: string; bitis: number };

  constructor(private readonly config: ConfigService) {}

  private get firmaId() {
    return this.config.getOrThrow<string>('PARASUT_FIRMA_ID');
  }

  private async jetonAl(): Promise<string> {
    if (this.jeton && this.jeton.bitis > Date.now() + 60_000) {
      return this.jeton.deger;
    }
    const cevap = await fetch('https://api.parasut.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'password',
        client_id: this.config.getOrThrow('PARASUT_CLIENT_ID'),
        client_secret: this.config.getOrThrow('PARASUT_CLIENT_SECRET'),
        username: this.config.getOrThrow('PARASUT_KULLANICI'),
        password: this.config.getOrThrow('PARASUT_PAROLA'),
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      }),
    });
    if (!cevap.ok) {
      throw new Error(`Paraşüt jetonu alınamadı: HTTP ${cevap.status}`);
    }
    const j = (await cevap.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.jeton = {
      deger: j.access_token,
      bitis: Date.now() + j.expires_in * 1000,
    };
    return j.access_token;
  }

  async faturaKes(talep: FaturaKesTalebi): Promise<FaturaKesSonucu> {
    const jeton = await this.jetonAl();
    const taban = `https://api.parasut.com/v4/${this.firmaId}`;

    // 1) Müşteriyi bul ya da oluştur
    const musteriId = await this.musteriBulYaDaOlustur(taban, jeton, talep.musteri);

    // 2) Satış faturası oluştur
    const govde = {
      data: {
        type: 'sales_invoices',
        attributes: {
          item_type: 'invoice',
          description: talep.harciAnahtar, // izlenebilirlik için
          issue_date: talep.duzenlemeTarihi.toISOString().slice(0, 10),
          currency: talep.paraBirimi,
          // ⚠️ Paraşüt'te alan adı farklı olabilir — teyit edin
          exchange_rate: 1,
        },
        relationships: {
          contact: { data: { id: musteriId, type: 'contacts' } },
          details: {
            data: talep.kalemler.map((k) => ({
              type: 'sales_invoice_details',
              attributes: {
                quantity: k.miktar,
                unit_price: k.birimFiyat,
                vat_rate: k.kdvOrani,
                description: k.aciklama ?? k.ad,
              },
            })),
          },
        },
      },
    };

    const cevap = await fetch(`${taban}/sales_invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(govde),
    });

    if (!cevap.ok) {
      const metin = await cevap.text();
      throw new Error(`Paraşüt fatura hatası HTTP ${cevap.status}: ${metin.slice(0, 300)}`);
    }

    const sonuc = (await cevap.json()) as {
      data: { id: string; attributes?: { invoice_no?: string } };
    };

    return {
      saglayiciId: sonuc.data.id,
      faturaNo: sonuc.data.attributes?.invoice_no,
      faturaUrl: `https://uygulama.parasut.com/${this.firmaId}/satislar/${sonuc.data.id}`,
    };
  }

  /**
   * ⚠⚠ ADA GÖRE ARAMA YASAK (plan 4.9, 22.09.2026).
   *
   * Eski hâli `filter[name]=<unvan>` ile arayıp `data[0]`ı alıyordu ve
   * hesaplanan kimlik anahtarı YALNIZ hata metninde geçiyordu. Sonucu:
   * "Yılmaz İnşaat" adlı İKİ AYRI müşteri Paraşüt'te TEK kayıtta birleşir ve
   * birinin faturası ötekinin hesabına yazılırdı. Unvan Türkiye'de tekil
   * değildir; tekil olan vergi numarası ya da T.C. kimlik numarasıdır.
   *
   * ⚠ HATALI EŞLEŞME > YİNELENEN KAYIT. Kimlik numarasıyla bulunamazsa YENİ
   * kayıt açılır. Bu, daha önce adla açılmış eski bir kaydın ikizini üretebilir
   * — muhasebede birleştirilmesi kolay, düzeltilebilir bir hatadır. Yanlış
   * muhataba kesilmiş fatura ise geri alınamaz: müşteri başkasının vergi
   * bilgisini görür ve iki taraf da yanlış beyan etmiş olur.
   *
   * ⚠ Bu dosyanın başındaki "DOĞRULANMAMIŞ" damgası GEÇERLİ: `filter[tax_number]`
   * alan adı Paraşüt dokümanından teyit edilmedi. Teyit edilene kadar davranış
   * yine de güvenli tarafta: alan yanlışsa arama boş döner ve yeni kayıt açılır.
   */
  private async musteriBulYaDaOlustur(
    taban: string,
    jeton: string,
    m: FaturaMusterisi,
  ): Promise<string> {
    // Kurumsal müşteride vergi no, şahıs şirketinde T.C. kimlik no tekildir.
    // İkisi de yoksa e-posta son çaredir — o da yoksa kimlik yok demektir.
    const kimlik = m.vergiNo ?? m.tcKimlikNo ?? null;
    const anahtar = kimlik ?? m.eposta;

    const bulunan = kimlik
      ? await this.contactAra(taban, jeton, 'tax_number', kimlik)
      : await this.contactAra(taban, jeton, 'email', m.eposta);
    if (bulunan) return bulunan;

    const olustur = await fetch(`${taban}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          type: 'contacts',
          attributes: {
            name: m.unvan,
            account_type: 'customer',
            tax_number: m.vergiNo,
            tax_office: m.vergiDairesi,
            email: m.eposta,
            address: m.adres,
            city: m.il,
            district: m.ilce,
          },
        },
      }),
    });
    if (!olustur.ok) {
      throw new Error(
        `Paraşüt müşteri oluşturulamadı (${anahtar}): HTTP ${olustur.status}`,
      );
    }
    const j = (await olustur.json()) as { data: { id: string } };
    return j.data.id;
  }

  /**
   * Tek bir alana göre müşteri arar. Eşleşme SAYISI önemli:
   *
   * ⚠ BİRDEN FAZLA EŞLEŞME = KİMLİK BELİRSİZ, `null` döner. `data[0]`ı almak
   *   eski kusurun ta kendisiydi. Vergi numarası tekil olmalı; iki kayıt
   *   dönüyorsa Paraşüt tarafında zaten yinelenmiş bir kayıt var demektir ve
   *   hangisinin doğru olduğunu BİLMİYORUZ. Böyle bir durumda tahmin etmek
   *   yerine yeni kayıt açmak, yanlış hesaba fatura yazmaktan iyidir.
   *
   * ⚠ Ağ/HTTP hatası da `null` döner — "bulunamadı" ile aynı dal. Hata
   *   fırlatmak tahsilatı durdururdu; sessizce YANLIŞ kayıt seçmek ise çok
   *   daha kötü olurdu. Üçüncü yol (yeni kayıt) ikisinin de dışında kalır.
   */
  private async contactAra(
    taban: string,
    jeton: string,
    alan: 'tax_number' | 'email',
    deger: string,
  ): Promise<string | null> {
    if (!deger) return null;
    try {
      const cevap = await fetch(
        `${taban}/contacts?filter[${alan}]=${encodeURIComponent(deger)}`,
        { headers: { Authorization: `Bearer ${jeton}` } },
      );
      if (!cevap.ok) return null;
      const j = (await cevap.json()) as { data?: Array<{ id: string }> };
      const kayitlar = j.data ?? [];
      if (kayitlar.length !== 1) {
        if (kayitlar.length > 1) {
          this.logger.warn(
            `Paraşüt'te ${alan} için ${kayitlar.length} kayıt döndü — ` +
              'kimlik belirsiz, yeni kayıt açılacak.',
          );
        }
        return null;
      }
      return kayitlar[0].id;
    } catch (e) {
      this.logger.warn(`Paraşüt müşteri araması başarısız (${alan}): ${e}`);
      return null;
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Geliştirme/test için: hiçbir yere gitmez, günlüğe yazar
   ───────────────────────────────────────────────────────────────────────── */
@Injectable()
export class SahteMuhasebeAdaptoru implements MuhasebeAdaptoru {
  readonly ad = 'sahte';
  private readonly logger = new Logger(SahteMuhasebeAdaptoru.name);
  private sayac = 0;

  async faturaKes(talep: FaturaKesTalebi): Promise<FaturaKesSonucu> {
    this.sayac++;
    const toplam = talep.kalemler.reduce(
      (a, k) => a + k.miktar * k.birimFiyat * (1 + k.kdvOrani / 100),
      0,
    );
    this.logger.log(
      `[SAHTE] Fatura kesildi: ${talep.musteri.unvan} — ` +
        `${toplam.toFixed(2)} ${talep.paraBirimi} (${talep.harciAnahtar})`,
    );
    return {
      saglayiciId: `sahte-${this.sayac}`,
      faturaNo: `TEST${String(this.sayac).padStart(6, '0')}`,
    };
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   ELLE (NES) — 24.09.2026: fatura NES'te yönetici tarafından kesilir
   ─────────────────────────────────────────────────────────────────────────
   Emre: "muhasebe için NES uygulamasını kullanacağız şimdilik" ve
   "faturalar ve uyarılar vs. e posta olarak gitmeli". Kodda NES entegrasyonu
   YOK; canlı `sahte` her tahsilatın satırını `TEST000001` numarasıyla KESILDI
   işaretliyor ve KİMSEYE bir şey söylemiyordu: fatura kesilmesi gereken ödeme
   yalnız iyzico/banka ekranından fark edilebiliyordu.

   Bu adaptör faturayı KESMEZ: yöneticiye (bkz. `yonetim-bildirimi.ts`) NES'te
   kesilecek faturanın tüm bilgisini ve VUK 231/5 son gününü e-postalar
   (metin: `fatura-kesim-epostasi.ts`). Gönderim KRİTİKTİR — gitmezse FIRLATIR,
   satır HATA'ya düşer ve kuyruk geri çekilerek yeniden dener; 5 denemede
   ELLE_MUDAHALE olur. Sessizce KESILDI olmaz.

   ⚠ SATIR ANLAMI: KESILDI + `saglayici='elle'` + `faturaNo` BOŞ = "kesim
   talebi yöneticiye e-postayla İLETİLDİ". Resmî numara NES'tedir; sistemde
   tutulmaz (girilecek bir ekran yok).
   ───────────────────────────────────────────────────────────────────────── */
@Injectable()
export class ElleMuhasebeAdaptoru implements MuhasebeAdaptoru {
  readonly ad = 'elle';
  private readonly logger = new Logger(ElleMuhasebeAdaptoru.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly eposta: EpostaServisi,
  ) {}

  async faturaKes(talep: FaturaKesTalebi): Promise<FaturaKesSonucu> {
    const havaleId = havaleKimligi(talep.harciAnahtar);
    // Numara okunamazsa talep YİNE gider (uyarı satırı eksik kalır) — asıl iş
    // faturanın kesilmesidir, havale kaydı yalnız çift fatura uyarısı içindir.
    const havale = havaleId
      ? await this.prisma.havaleOdemesi
          .findUnique({ where: { id: havaleId }, select: { teklifNo: true, faturaNo: true } })
          .catch((e: unknown) => {
            this.logger.warn(`Havale kaydi okunamadi (${havaleId}): ${e instanceof Error ? e.message : e}`);
            return null;
          })
      : null;
    const posta = faturaKesimTalebiEpostasi(talep, {
      iyzicoTestOrtami: iyzicoTestOrtamiMi(this.config.get<string>('IYZICO_TABAN_URL')),
      havale,
    });
    await yonetimeYazKritik({ prisma: this.prisma, eposta: this.eposta, logger: this.logger }, posta);
    this.logger.log(`Fatura kesim talebi yoneticiye e-postalandi (NES'te elle kesilecek): ${talep.harciAnahtar}`);
    return { saglayiciId: `elle:${talep.harciAnahtar}` };
  }
}

/**
 * Gerçek para YALNIZ canlı iyzico ucunda: `https://api.iyzipay.com`. Sandbox,
 * boş (istemcinin varsayılanı sandbox) ya da tanınmayan her taban TEST sayılır —
 * gerçek bir ödemeyi "test" diye işaretlemek fatura kaçırır ama yönetici yine
 * de görür; test ödemesini gerçek saymak olmayan satışa fatura kestirir.
 */
export function iyzicoTestOrtamiMi(tabanUrl: string | null | undefined): boolean {
  const taban = (tabanUrl ?? '').trim().replace(/\/+$/, '').toLowerCase();
  return taban !== 'https://api.iyzipay.com';
}

/** Tanınan `MUHASEBE_SAGLAYICI` değerleri ("nes" = "elle"). */
export const BILINEN_MUHASEBE_SAGLAYICILARI = ['parasut', 'elle', 'nes', 'sahte'] as const;

/**
 * `MUHASEBE_SAGLAYICI` → adaptör. "parasut" → Paraşüt (DOĞRULANMADI) ·
 * boş ya da "sahte" → sahte (geliştirme/test; canlı compose varsayılanı
 * `${MUHASEBE_SAGLAYICI:-elle}` boşu da elle yapar) · "elle", "nes" ve
 * TANINMAYAN her değer → elle: yazım hatası sessizce sahteye düşüp TEST
 * numarası üretmesin, yönetici talebi yine alsın (inceleme L2).
 */
export function muhasebeAdaptoruSec<T>(
  deger: string | null | undefined,
  a: { parasut: T; sahte: T; elle: T },
): T {
  const secim = (deger ?? '').trim().toLowerCase();
  if (secim === 'parasut') return a.parasut;
  if (secim === '' || secim === 'sahte') return a.sahte;
  return a.elle;
}

/**
 * `OdemeModule`ün kullandığı sağlayıcı NESNESİNİN KENDİSİ — kapı
 * (`test:yonetim-epostalari` F2) bu nesneyi Nest'e kurdurup ölçer; modülde
 * satır-içi bir kopya olsaydı kapı kopyayı ölçerdi.
 */
export const MUHASEBE_ADAPTORU_SAGLAYICISI: FactoryProvider<MuhasebeAdaptoru> = {
  provide: MUHASEBE_ADAPTORU,
  inject: [ConfigService, ParasutAdaptoru, SahteMuhasebeAdaptoru, ElleMuhasebeAdaptoru],
  useFactory: (
    config: ConfigService,
    parasut: ParasutAdaptoru,
    sahte: SahteMuhasebeAdaptoru,
    elle: ElleMuhasebeAdaptoru,
  ): MuhasebeAdaptoru => {
    const deger = config.get<string>('MUHASEBE_SAGLAYICI');
    const secilen = muhasebeAdaptoruSec<MuhasebeAdaptoru>(deger, { parasut, sahte, elle });
    // Açılışta TEK satır: canlıda hangi yolun seçildiği günlükten okunabilsin.
    const logger = new Logger('MuhasebeAdaptoru');
    const temiz = (deger ?? '').trim().toLowerCase();
    if (temiz && !(BILINEN_MUHASEBE_SAGLAYICILARI as readonly string[]).includes(temiz)) {
      logger.warn(`MUHASEBE_SAGLAYICI="${deger}" tanınmıyor — elle (NES) kesim seçildi`);
    }
    logger.log(`Muhasebe adaptörü: ${secilen.ad} (MUHASEBE_SAGLAYICI="${deger ?? ''}")`);
    return secilen;
  },
};
