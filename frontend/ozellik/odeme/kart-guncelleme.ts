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
  bekleyenOdeme:
    'Bekleyen ödemeniz kart güncellemesiyle hemen çekilmez. Ödemeniz alındığında ' +
    'hesabınız açılır ve size e-postayla haber veririz; birkaç gün içinde e-posta ' +
    'gelmezse bizimle iletişime geçin.',
  askidaOdeme:
    'Askıya alınmış aboneliklerde ödeme kendiliğinden yeniden denenmez. Ödemenizin ' +
    'alınması ve hesabınızın açılması için bizimle iletişime geçin.',
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
 * "Kartınız güncellendi" açıklaması — abonelik durumuna göre (erişim kararı).
 *
 * ⚠ DÜRÜSTLÜK (inceleme H1, 25.09): kart güncellemesi bekleyen ödemeyi
 * ÇEKMEZ. iyzico başarısız tahsilatı kendiliğinden tekrarlamaz; tekrarı
 * dunning merdiveni yapar, yalnız belli günlerde (varsayılan 3., 7., 20.).
 * 30. günde ASKIDA'ya geçen abonelik bir daha denenmez. Bu ekran "hemen
 * açılır" DEMEZ. Durum henüz gelmediyse (yükleniyor) yalnız ilk cümle.
 */
export function guncellendiMetni(durum: string | null | undefined): string {
  switch (durum) {
    case 'ODEME_BEKLIYOR':
    case 'KISITLI':
      return `${KART_METINLERI.guncellendiMetin} ${KART_METINLERI.bekleyenOdeme}`;
    case 'ASKIDA':
      return `${KART_METINLERI.guncellendiMetin} ${KART_METINLERI.askidaOdeme}`;
    default:
      return KART_METINLERI.guncellendiMetin;
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
