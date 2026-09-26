// Göreli yol: vitest `@/` takma adını çözmez (saf modüller hep göreli).
import { hataMetni } from '../kutuphane/hata-metni';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KART GÜNCELLEME SAYFASI — saf kurallar (25.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  `/abonelik/kart` 25.09'a dek YOKTU: dunning e-postalarının "Kartımı
 *  güncelle" düğmesi ve uygulama içi şeridin "Kartı güncelle" / "Ödemeyi
 *  tamamla" eylemi 404 veriyordu (canlıda ölçüldü). Sayfa iki kipte çalışır:
 *
 *   · FORM  — `POST /abonelik/kart-guncelle` iyzico'nun barındırılan formunu
 *             döndürür; `IyzicoFormu` onu ÇALIŞIR hâlde basar. E-postadaki
 *             `?a=<abonelik id>` gövdeye `abonelikId` olarak gider: sunucu
 *             oturumdaki firmanın aboneliğiyle karşılaştırır, başka firmanın
 *             bağlantısıyla YANLIŞ firmanın kartı değişmez.
 *   · SONUÇ — iyzico dönüşünü SUNUCU karşılar (`/api/abonelik/iyzico-kart-
 *             donus`) ve buraya `?sonuc=` ile yönlendirir. Satın almanın
 *             06.09 dersi: iyzico token'ı POST gövdesinde yollar, bir Next.js
 *             sayfasına POST ile düşen tarayıcıda gövde OKUNAMAZ.
 *
 *  Projede jsdom yok (vitest ortamı `node`): ölçülebilir her karar burada,
 *  sayfa yalnız bunları çağırır.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type KartSonucu = 'guncellendi' | 'hata';

export interface KartSayfasiGirdisi {
  /** E-postadaki `?a=` — kartı güncellenecek abonelik. Yoksa null (uygulama içi şerit). */
  abonelikId: string | null;
  /** Sunucu dönüşünün sonucu. null → FORM kipi. */
  sonuc: KartSonucu | null;
}

/**
 * Sorgu dizesini okur. Tanınmayan bir `sonuc` değeri "hata" sayılır: dönüş
 * sayfası bozuk bir değerle SESSİZCE yeni form açmaz.
 */
export function kartSayfasiGirdisi(sorgu: string): KartSayfasiGirdisi {
  const q = new URLSearchParams(sorgu);
  const abonelikId = q.get('a')?.trim() || null;
  const ham = q.get('sonuc');
  const sonuc: KartSonucu | null = ham === null ? null : ham === 'guncellendi' ? 'guncellendi' : 'hata';
  return { abonelikId, sonuc };
}

/** `POST /abonelik/kart-guncelle` gövdesi — `a` yoksa alan HİÇ gönderilmez. */
export function kartIstekGovdesi(g: KartSayfasiGirdisi): { abonelikId?: string } {
  return g.abonelikId ? { abonelikId: g.abonelikId } : {};
}

export const KART_METINLERI = {
  formBaslik: 'Kartınızı güncelleyin',
  formNotu:
    "Kart bilgileriniz doğrudan iyzico'ya iletilir, sunucularımıza kaydedilmez. " +
    'Yeni kartınız 1 TL çekilip hemen iade edilerek doğrulanır.',
  hazirlaniyor: 'Kart güncelleme formu hazırlanıyor…',
  guncellendiBaslik: 'Kartınız güncellendi',
  guncellendiMetin: "Yeni kartınız iyzico'da kayıtlı; sonraki ödemeleriniz bu karttan alınır.",
  odemeDeneniyor: 'Bekleyen ödemeniz yeni kartınızdan deneniyor…',
  odemeAlindi:
    'Bekleyen ödemeniz yeni kartınızdan alındı. Hesabınız bir dakika içinde tam erişime döner; ' +
    'onay e-postası gönderiyoruz.',
  odemeIletildi:
    "Bekleyen ödemeniz için tahsilat isteği iyzico'ya iletildi. Sonuç birkaç dakika içinde " +
    'belli olur; ödeme alındığında hesabınız açılır ve size e-postayla haber veririz.',
  odemeBelirsiz:
    "Bekleyen ödemeniz denendi ama iyzico'dan yanıt gelmedi. Ödeme alındıysa hesabınız açılır " +
    've size e-postayla haber veririz. Çift çekim olmaması için ödeme bugün yeniden denenmeyecek.',
  odemeBaglantiKoptu:
    'Ödeme sonucunu şu an alamadık. Ödeme alındıysa hesabınız açılır ve size e-postayla haber ' +
    'veririz; birkaç dakika içinde değişiklik olmazsa bu sayfayı yenileyin.',
  odemeReddedildiBaslik: 'Ödeme alınamadı',
  odemeReddedildi: 'Kartınız güncellendi ama bekleyen ödeme yeni kartınızdan da alınamadı',
  odemeReddedildiSonu: 'Başka bir kartla yeniden deneyebilirsiniz.',
  odemeKisaSureOnce:
    'Ödemeniz kısa süre önce denendi. Birkaç dakika sonra bu sayfayı yenileyerek yeniden deneyebilirsiniz.',
  odemeSonucBekleniyor:
    'Ödemeniz kısa süre önce denendi; sonucu size e-postayla bildireceğiz. Çift çekim olmaması için ' +
    'şimdilik yeniden denenmeyecek.',
  odemeYapilamadiBaslik: 'Ödeme yeniden denenemedi',
  odemeYapilamadi:
    'Kartınız güncellendi ama bekleyen ödemenizi şu an yeniden deneyemedik. Lütfen bizimle iletişime geçin.',
  donusHatasiBaslik: 'Kart güncellenemedi',
  donusHatasiMetin: 'Kart güncelleme tamamlanamadı. Formu yeniden açıp tekrar deneyin.',
  formHatasiBaslik: 'Kart güncelleme formu açılamadı',
  sahipGerekli:
    'Kayıtlı kartı yalnız firma sahibi güncelleyebilir. Firma sahibinden bu sayfayı açmasını isteyin.',
  eslesmiyor:
    'Bu bağlantı başka bir firmanın aboneliğine ait. Kartı güncellemek için ' +
    'e-postanın gönderildiği firmanın hesabıyla giriş yapın.',
  baglantiGecersiz: 'Bu bağlantı geçersiz. Formu bağlantısız açmak için "Formu yeniden aç"a basın.',
  kartAboneligiYok:
    'Kartla yenilenen etkin bir aboneliğiniz yok; güncellenecek kayıtlı bir kart bulunmuyor.',
  cokSik: 'Kart formu kısa sürede çok kez açıldı. Birkaç dakika sonra yeniden deneyin.',
  genel: 'Kart güncelleme formu açılamadı. Birkaç dakika sonra yeniden deneyin.',
} as const;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BEKLEYEN ÖDEMENİN ANLIK DENEMESİ (26.09.2026, Emre kararı)
 * ═══════════════════════════════════════════════════════════════════════════
 *  25.09'da kart güncellemesi bekleyen ödemeyi ÇEKMİYORDU (yeniden deneme
 *  yalnız dunning merdiveninde, ASKIDA'da hiç) ve ekran bunu söylüyordu.
 *  Artık kart dönüşü (`?sonuc=guncellendi`) oturumlu `POST /abonelik/odeme-
 *  tekrar-dene`yi BİR KEZ çağırır; bekleyen ödeme yoksa sunucu `gerekmiyor`
 *  der. TAM BİR KEZ sunucudadır (kira, `backend/.../dunning/tahsilat-
 *  kirasi.ts`): yenileme ve çift tık ikinci çekimi yapamaz.
 *  Ekran yalnız SUNUCUNUN söylediğini söyler — "alındı" ancak iyzico siparişi
 *  ödenmiş gösterdiyse gelir.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Sunucunun sonucu (`AnindaDenemeSonucu`) + istemcinin kendi iki hâli. */
export type OdemeDenemesi =
  | { sonuc: 'alindi' | 'iletildi' | 'belirsiz' | 'gerekmiyor' | 'yapilamadi' }
  | { sonuc: 'reddedildi'; mesaj: string }
  | { sonuc: 'zaten-deneniyor'; kiraBitis: string }
  /** İstemci: hız sınırı (429) — sunucu denemedi. */
  | { sonuc: 'sinir' }
  /** İstemci: yanıt gelmedi (zaman aşımı, ağ) — sunucu denemiş olabilir. */
  | { sonuc: 'baglantiKoptu' };

/**
 * Sunucu hedefi iyzico'ya sorar, çekimi dener ve sonucu yeniden sorar — her
 * çağrı ≤ 20 sn (`IYZICO_ZAMAN_ASIMI_MS`). Genel 30 sn sınırı (`api.ts`)
 * yetmez: yanıtı beklemeden bırakan sayfa "sonuç alınamadı" derdi.
 */
export const ODEME_DENEMESI_ZAMAN_ASIMI_MS = 75_000;

/** Yanıtı doğrular; tanınmayan biçim "yapılamadı" sayılır — sonuç uydurulmaz. */
export function odemeDenemesiOku(veri: unknown): OdemeDenemesi {
  const v = veri && typeof veri === 'object' ? (veri as Record<string, unknown>) : {};
  switch (v.sonuc) {
    case 'alindi':
    case 'iletildi':
    case 'belirsiz':
    case 'gerekmiyor':
    case 'yapilamadi':
      return { sonuc: v.sonuc };
    case 'reddedildi':
      return { sonuc: 'reddedildi', mesaj: typeof v.mesaj === 'string' ? v.mesaj.trim() : '' };
    case 'zaten-deneniyor':
      return typeof v.kiraBitis === 'string' && !Number.isNaN(Date.parse(v.kiraBitis))
        ? { sonuc: 'zaten-deneniyor', kiraBitis: v.kiraBitis }
        : { sonuc: 'yapilamadi' };
    default:
      return { sonuc: 'yapilamadi' };
  }
}

/**
 * İstek hatası → sonuç. Yanıt YOKSA (zaman aşımı, ağ) sunucu çekimi denemiş
 * olabilir: `baglantiKoptu` (yenilemek güvenli — kira ikinci çekimi keser).
 * Yanıt VARSA çekim yapılmadı: 429 → `sinir`; 403 (sahip değil) → `gerekmiyor`
 * (bu kişi kart güncellemedi, ödeme onun işi değil); diğeri → `yapilamadi`.
 */
export function odemeDenemesiHatasi(hata: unknown): OdemeDenemesi {
  const yanit = (hata as { response?: { status?: unknown } } | null)?.response;
  if (!yanit) return { sonuc: 'baglantiKoptu' };
  if (yanit.status === 429) return { sonuc: 'sinir' };
  if (yanit.status === 403) return { sonuc: 'gerekmiyor' };
  return { sonuc: 'yapilamadi' };
}

export interface OdemeGorunumu {
  ton: 'basari' | 'bilgi' | 'hata';
  baslik: string;
  metin: string;
  /** "Formu yeniden aç": kart reddettiyse başka bir kartla denemek için. */
  yenidenAc: boolean;
  /** Başarı yolu işlenince erişim değişir: yetenekler kısa süre tazelenir. */
  erisimiTazele: boolean;
}

/** Kira bu kadar ya da daha az kaldıysa "birkaç dakika sonra yeniden deneyin" denir (ret kirası 10 dk). */
const KISA_KIRA_MS = 15 * 60_000;

/** Sonuç sayfasının görünümü; `null` = deneme sürüyor. SAF. */
export function odemeDenemesiGorunumu(o: OdemeDenemesi | null, simdiMs: number): OdemeGorunumu {
  const gorunum = (ton: OdemeGorunumu['ton'], metin: string, ek: Partial<OdemeGorunumu> = {}): OdemeGorunumu => ({
    ton, baslik: KART_METINLERI.guncellendiBaslik, metin, yenidenAc: false, erisimiTazele: false, ...ek,
  });
  if (!o) return gorunum('bilgi', KART_METINLERI.odemeDeneniyor);
  switch (o.sonuc) {
    case 'gerekmiyor':
      return gorunum('basari', KART_METINLERI.guncellendiMetin);
    case 'alindi':
      return gorunum('basari', KART_METINLERI.odemeAlindi, { erisimiTazele: true });
    case 'iletildi':
      return gorunum('basari', KART_METINLERI.odemeIletildi, { erisimiTazele: true });
    case 'belirsiz':
      return gorunum('bilgi', KART_METINLERI.odemeBelirsiz, { erisimiTazele: true });
    case 'baglantiKoptu':
      return gorunum('bilgi', KART_METINLERI.odemeBaglantiKoptu, { erisimiTazele: true });
    case 'sinir':
      return gorunum('bilgi', KART_METINLERI.odemeKisaSureOnce);
    case 'zaten-deneniyor':
      return gorunum(
        'bilgi',
        Date.parse(o.kiraBitis) - simdiMs <= KISA_KIRA_MS
          ? KART_METINLERI.odemeKisaSureOnce
          : KART_METINLERI.odemeSonucBekleniyor,
      );
    case 'reddedildi':
      return gorunum(
        'hata',
        `${KART_METINLERI.odemeReddedildi}${o.mesaj ? `: ${o.mesaj.replace(/[.\s]+$/, '')}` : ''}. ` +
          KART_METINLERI.odemeReddedildiSonu,
        { baslik: KART_METINLERI.odemeReddedildiBaslik, yenidenAc: true },
      );
    case 'yapilamadi':
    default:
      return gorunum('hata', KART_METINLERI.odemeYapilamadi, { baslik: KART_METINLERI.odemeYapilamadiBaslik });
  }
}

/**
 * "Formu yeniden aç" düğmesi:
 *  · `ayniBaglanti` — geçici arıza; e-postadaki `?a=` KORUNUR, sahiplik
 *    denetimi yeniden yapılır (inceleme L2)
 *  · `baglantisiz`  — bozulmuş bağlantı ya da iyzico dönüşü (`?a=` taşımaz;
 *    form açılırken sahiplik zaten denetlenmişti)
 *  · `null`         — kalıcı ret: düğme ÇİZİLMEZ. Başka firmanın hesabıyla
 *    giren kullanıcıya kendi firmasının formunu açtırmak, e-postadaki firmanın
 *    kartını güncellediğini sandırırdı (önizlemede görüldü, 25.09); aynı
 *    isteği tekrarlamak aynı reddi getirir (döngü).
 */
export type YenidenAcma = 'ayniBaglanti' | 'baglantisiz' | null;

export interface KartHatasi {
  metin: string;
  yenidenAcma: YenidenAcma;
}

/**
 * Sunucunun reddini kullanıcı cümlesine ve yeniden açma kararına çevirir.
 *
 *  · Bilinen kodlar (sahip değil, başka firmanın bağlantısı, kartsız) kalıcı.
 *  · Kodsuz 400 + DİZİ ileti = Nest gövde doğrulaması (bozulmuş `?a=`):
 *    sınıf doğrulayıcının İngilizce iletisi gösterilmez. ⚠ Kodlu 400
 *    doğrulama DEĞİLDİR: iyzico'nun reddi de 400'dür (`iyzico-hata.filter`,
 *    `kaynak: 'iyzico'`) ve "bağlantı geçersiz" deseydik kullanıcı aynı reddi
 *    döngüde yerdi (inceleme M1).
 *  · 429 hız sınırı: kendi cümlemiz (sunucu iletisi İngilizce).
 *  · Diğer 4xx kalıcı, sunucunun iletisiyle; 5xx / ağ / zaman aşımı geçici.
 */
export function kartHatasi(hata: unknown): KartHatasi {
  const yanit = (hata as { response?: { status?: unknown; data?: { kod?: unknown; message?: unknown } } } | null)
    ?.response;
  switch (yanit?.data?.kod) {
    case 'FIRMA_SAHIBI_GEREKLI':
      return { metin: KART_METINLERI.sahipGerekli, yenidenAcma: null };
    case 'ABONELIK_ESLESMIYOR':
      return { metin: KART_METINLERI.eslesmiyor, yenidenAcma: null };
    case 'KART_ABONELIGI_YOK':
      return { metin: KART_METINLERI.kartAboneligiYok, yenidenAcma: null };
  }
  const durum = typeof yanit?.status === 'number' ? yanit.status : null;
  if (durum === 400 && yanit?.data?.kod === undefined && Array.isArray(yanit?.data?.message)) {
    return { metin: KART_METINLERI.baglantiGecersiz, yenidenAcma: 'baglantisiz' };
  }
  if (durum === 429) return { metin: KART_METINLERI.cokSik, yenidenAcma: 'ayniBaglanti' };
  if (durum !== null && durum >= 400 && durum < 500 && durum !== 408) {
    return { metin: hataMetni(hata, KART_METINLERI.genel), yenidenAcma: null };
  }
  return { metin: hataMetni(hata, KART_METINLERI.genel), yenidenAcma: 'ayniBaglanti' };
}

/** "Formu yeniden aç" hedefi; `null` → düğme çizilmez. */
export function yenidenAcmaAdresi(girdi: KartSayfasiGirdisi, yenidenAcma: YenidenAcma): string | null {
  if (yenidenAcma === null) return null;
  if (yenidenAcma === 'ayniBaglanti' && girdi.abonelikId) {
    return `/abonelik/kart?a=${encodeURIComponent(girdi.abonelikId)}`;
  }
  return '/abonelik/kart';
}
