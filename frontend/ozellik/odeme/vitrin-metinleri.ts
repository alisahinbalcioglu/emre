/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VİTRİN METİNLERİ — paketsiz yeni hesap (saf, React'siz · 23.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre: "ana sayfa her şey açılsın, kullanıcının önüne gelsin; kullanıcı
 *  paket seçsin (kart bilgisini girip), ödeme 30 günün sonunda çekilsin."
 *  Karar: "yalnızca gezsin" · Malzeme Havuzu'nda "fiyatlar paketle açılsın".
 *
 *  Bu dosya YALNIZ METİN kurar; kararı vermez. "Vitrin mi / bu yol gezilir
 *  mi" sorusu `erisim-durumu.ts`te, gerçek kapı SUNUCUDADIR.
 *
 *  ⚠ İMPORT YALNIZ GÖRELİ (`./paket-bicim`): vitest bu depoda `@/…`
 *    çözmüyor; `@/` içe aktaran saf dosya testten okunamaz.
 *
 *  ⚠ DENEME RAKAMI YAZILMAZ, OKUNUR. "30 gün" sürümden (`denemeGunu`) gelir
 *    ve hak kararı FİRMA + KİŞİ düzeyindedir (`GET /abonelik/paketler`:
 *    firma, hesap e-postası, e-posta doğrulaması). Hakkı olmayana "30 gün
 *    ücretsiz" demek, kartını girdiği anda çekilecek ücreti saklamak olurdu.
 */
import {
  DENEME_EPOSTA_DOGRULA_METNI,
  DENEME_KULLANILDI_METNI,
  denemeSatiri,
  type PaketSurumu,
} from './paket-bicim';

/** Şerit ve pencere başlığı — sunucunun `uyari.baslik`ıyla AYNI cümle. */
export const VITRIN_BASLIGI = 'Paketinizi seçin';

/** Pencerede işleme özel cümlenin ardından gelen ikinci satır. */
export const VITRIN_GEZINTI_METNI = 'Uygulamanın geri kalanını gezmeye devam edebilirsiniz.';

/** Paket penceresini açan işler. `genel` = sunucudan gelen yedek 403. */
export type VitrinIslemi = 'excel' | 'dwg' | 'kutuphane' | 'ekip' | 'genel';

const ISLEM_METNI: Record<VitrinIslemi, string> = {
  excel: 'Excel keşif dosyanızdan teklif hazırlamak için bir paket seçin.',
  // ⚠ DWG yalnız Pro paketlerde (`Paket.dwgAktif`): Basic seçen kullanıcıya
  //   "bir paket seçin" demek çalışmayacak bir söz olurdu.
  dwg: 'DWG projenizden metraj çıkarmak için bir Pro paket seçin.',
  kutuphane: 'Fiyat listelerini kütüphanenize aktarmak için bir paket seçin.',
  ekip: 'Ekibinize üye davet etmek için bir paket seçin.',
  genel: 'Bu işlem için bir paket seçin.',
};

export function vitrinIslemMetni(islem: VitrinIslemi | null | undefined): string {
  return ISLEM_METNI[islem ?? 'genel'] ?? ISLEM_METNI.genel;
}

export interface VitrinDenemeBilgisi {
  /** olumlu = deneme var · bilgi = hak kullanılmış · uyari = doğrulama gerekli */
  ton: 'olumlu' | 'bilgi' | 'uyari';
  metin: string;
}

/**
 * Şerit ve pencerede görünen DENEME satırı — `GET /abonelik/paketler` yanıtından.
 *
 *   hak var, tek gün sayısı       → "30 gün ücretsiz, ilk ödeme 30. günün sonunda"
 *   e-posta doğrulanmamış         → "30 gün ücretsiz deneme için önce e-posta adresinizi doğrulayın."
 *   hak kullanılmış (ya da miras) → "Deneme hakkınız daha önce kullanıldı — …"
 *   denemeli paket yok / yanıt yok → null (satır ÇİZİLMEZ; şerit sunucu metniyle kalır)
 *
 * ⚠ TEK PAKETTE BİLE "hak yok" denmişse deneme VAAT EDİLMEZ (fail-closed):
 *   karar firma+kişi düzeyindedir ve her pakette aynı gelir; ayrışırsa
 *   yanlış yön "var" demek olurdu.
 * ⚠ Gün sayıları paketten pakete FARKLIYSA rakam yazılmaz — hangi paketi
 *   seçeceği belli olmayan kişiye tek bir rakam söylemek yalan olabilirdi.
 */
export function vitrinDenemeSatiri(
  paketler: ReadonlyArray<{ surum?: Pick<PaketSurumu, 'denemeGunu' | 'denemeHakki' | 'denemeGerekcesi'> | null }> | null | undefined,
): VitrinDenemeBilgisi | null {
  if (!Array.isArray(paketler)) return null;
  const denemeli = paketler
    .map((p) => p?.surum)
    .filter((s): s is Pick<PaketSurumu, 'denemeGunu' | 'denemeHakki' | 'denemeGerekcesi'> =>
      !!s && typeof s.denemeGunu === 'number' && s.denemeGunu > 0);
  if (denemeli.length === 0) return null;

  const satirlar = denemeli.map((s) => denemeSatiri(s));
  const gunler = Array.from(new Set(denemeli.map((s) => s.denemeGunu)));
  const tekGun = gunler.length === 1 ? gunler[0] : null;

  if (satirlar.some((s) => s?.ton === 'bilgi')) {
    return { ton: 'bilgi', metin: DENEME_KULLANILDI_METNI };
  }
  if (satirlar.some((s) => s?.ton === 'uyari')) {
    return {
      ton: 'uyari',
      metin: tekGun
        ? `${tekGun} gün ücretsiz deneme için önce e-posta adresinizi doğrulayın.`
        : DENEME_EPOSTA_DOGRULA_METNI,
    };
  }
  return {
    ton: 'olumlu',
    metin: tekGun
      ? `${tekGun} gün ücretsiz, ilk ödeme ${tekGun}. günün sonunda`
      : 'Ücretsiz deneme ile başlayın, ilk ödeme deneme süresinin sonunda',
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VİTRİN BÖLÜM KARTI — gezilemeyen sayfanın yerine çizilen kart
 * ═══════════════════════════════════════════════════════════════════════════
 * Duvar DEĞİL: kullanıcı neyin kapalı olduğunu ve ne işe yaradığını görür,
 * şerit üstte durur. Bilinmeyen yol için genel metin (yeni sayfa eklenip
 * buraya yazılmayı unutulsa da kart boş kalmaz).
 */
export interface VitrinBolumu {
  /** "Kütüphanem paket seçince açılır" cümlesinin öznesi. */
  ad: string;
  aciklama: string;
}

const BOLUMLER: ReadonlyArray<{ yol: RegExp; bolum: VitrinBolumu }> = [
  {
    yol: /^\/library(\/|$)/,
    bolum: {
      ad: 'Kütüphanem',
      aciklama:
        'Malzeme Havuzu’ndan aktardığınız markalar, iskontolarınız ve kendi fiyat listeleriniz burada durur.',
    },
  },
  {
    yol: /^\/(labor|labor-firms)(\/|$)/,
    bolum: { ad: 'İşçilik', aciklama: 'İşçilik firmalarınızı ve işçilik fiyat listelerinizi burada yönetirsiniz.' },
  },
  {
    yol: /^\/quote-formats(\/|$)/,
    bolum: { ad: 'Teklif formatlarım', aciklama: 'Teklifinizin kapak ve icmal şablonlarını burada yönetirsiniz.' },
  },
  {
    yol: /^\/quotes\/new(\/|$)/,
    bolum: {
      ad: 'Yeni teklif',
      aciklama: 'Metraj Excel’inizi ya da DWG projenizi yükleyip fiyatlandırılmış teklif hazırlarsınız.',
    },
  },
  {
    yol: /^\/quotes\//,
    bolum: { ad: 'Teklif ekranı', aciklama: 'Hazırladığınız teklifleri burada açar, düzenler ve indirirsiniz.' },
  },
  {
    yol: /^\/dwg-workspace(\/|$)/,
    bolum: { ad: 'DWG çalışma alanı', aciklama: 'Tesisat projenizden otomatik metraj çıkarırsınız.' },
  },
  {
    yol: /^\/firma\/ekip\/kurumsal-giris(\/|$)/,
    bolum: {
      ad: 'Kurumsal giriş',
      aciklama: 'Ekibinizin Microsoft ya da Google şirket hesabıyla girişini burada ayarlarsınız.',
    },
  },
];

const GENEL_BOLUM: VitrinBolumu = {
  ad: 'Bu bölüm',
  aciklama: 'Teklif hazırlamak, dosya yüklemek ve kütüphanenizi kurmak için bir paket seçin.',
};

export function vitrinBolumu(yol: string): VitrinBolumu {
  return BOLUMLER.find((b) => b.yol.test(yol))?.bolum ?? GENEL_BOLUM;
}

/** Kart başlığı: "<Bölüm> paket seçince açılır". */
export function vitrinBolumBasligi(yol: string): string {
  return `${vitrinBolumu(yol).ad} paket seçince açılır`;
}

/** Malzeme Havuzu'nda fiyatı gizlenen hücre ve tablo üstü not. */
export const HAVUZ_FIYAT_KILIDI_METNI = 'Paketle açılır';
export const HAVUZ_FIYAT_NOTU = 'Birim fiyatlar paket seçtiğinizde görünür.';
