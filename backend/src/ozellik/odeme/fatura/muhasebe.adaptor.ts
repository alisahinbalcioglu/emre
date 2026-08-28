import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

  private async musteriBulYaDaOlustur(
    taban: string,
    jeton: string,
    m: FaturaMusterisi,
  ): Promise<string> {
    const anahtar = m.vergiNo ?? m.tcKimlikNo ?? m.eposta;
    const ara = await fetch(
      `${taban}/contacts?filter[name]=${encodeURIComponent(m.unvan)}`,
      { headers: { Authorization: `Bearer ${jeton}` } },
    );
    if (ara.ok) {
      const j = (await ara.json()) as { data?: Array<{ id: string }> };
      if (j.data?.length) return j.data[0].id;
    }

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
