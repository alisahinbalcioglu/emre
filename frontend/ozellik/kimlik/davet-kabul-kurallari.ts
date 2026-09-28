/**
 * DAVET KABUL EKRANININ SAF KURALLARI (27.09.2026).
 *
 * `app/davet-kabul/page.tsx` bir Next sayfasıdır; varsayılan dışa aktarımdan
 * başka bir şey dışa aktaramaz. Ekranın KARAR veren parçaları bu yüzden
 * burada: DOM'suz ölçülürler (`davet-kabul-kurallari.test.ts`).
 *
 * ⚠ GÖRELİ İÇE AKTARIM: vitest `@/…` takma adını çözmüyor
 * (`verileri-indir.ts` notu); tepeden `@/` içe aktarımı dosyayı test
 * edilemez yapardı.
 */
import { kimlikHataMetni } from '../../ortak/lib/kimlik-hata-metinleri';

type HttpHatasi = { response?: { status?: number; data?: { kod?: string; mesaj?: string } } };

export const ULASILAMADI_METNI =
  'Sunucuya şu an ulaşılamıyor. İnternet bağlantınızı kontrol edip tekrar deneyin.';
export const COK_SIK_DENEME_METNI = 'Çok sık denendi. Birkaç dakika bekleyip tekrar deneyin.';
export const SUNUCU_HATASI_METNI = 'Sunucuda geçici bir sorun oluştu. Birazdan tekrar deneyin.';

export function hataKodu(e: unknown): string | undefined {
  return (e as HttpHatasi)?.response?.data?.kod;
}

/**
 * Davet bilgisi alınamayınca ekran hangi duruma geçer?
 *
 * Yalnız sunucunun VERDİĞİ ret (4xx, 429 hariç) "davet açılamadı" demektir.
 * Yanıtsız hata (ağ), 5xx (deploy anında Caddy 502) ve 429 (hız sınırı)
 * davetin kendisi hakkında bir şey söylemez → "Tekrar dene". Token adres
 * çubuğundan silindiği için sayfayı yenilemek onu kaybettirirdi.
 */
export function davetBilgiHataDurumu(e: unknown): 'gecersiz' | 'ulasilamadi' {
  const durum = (e as HttpHatasi)?.response?.status;
  if (typeof durum !== 'number') return 'ulasilamadi';
  if (durum === 429 || durum >= 500) return 'ulasilamadi';
  return 'gecersiz';
}

/**
 * Ekranda gösterilecek hata metni. 429'da çerçevenin İngilizce ham metni
 * ("ThrottlerException: Too Many Requests") gösterilmez; mesajsız 5xx de
 * ham "Internal server error" yerine Türkçe metne döner. Gerisi tek
 * sözlükten (`kimlikHataMetni`: sunucunun `mesaj`ı öncelikli).
 */
export function davetHataMetni(e: unknown): string {
  const r = (e as HttpHatasi)?.response;
  if (!r) return ULASILAMADI_METNI;
  if (r.status === 429) return COK_SIK_DENEME_METNI;
  if (typeof r.status === 'number' && r.status >= 500 && !r.data?.mesaj) return SUNUCU_HATASI_METNI;
  return kimlikHataMetni(e);
}

/**
 * Hata kutusunda "giriş yapın" bağlantısı hangi retlerde çizilir?
 *
 * YALNIZ `ZATEN_EKIPTE`: kişi bu ekibin üyesidir ve girişi açıktır.
 * `BASKA_FIRMADA_KAYITLI` metni başka bir yol söyler (üyeye "yöneticiniz
 * sizi çıkarsın", sahibe "başka adres"); `KAPALI_HESAP_VAR`da giriş kapatma
 * nedenine göre KAPALI olabilir (`kapali-hesap.ts`) — bağlantı çıkmaza
 * götürürdü (kod incelemesi, 28.09).
 */
export function girisBaglantisiGosterilirMi(kod: string | undefined): boolean {
  return kod === 'ZATEN_EKIPTE';
}

/** `sonGecerlilik` → "3 Ekim 2026". Geçersiz/boş değer → null (satır çizilmez). */
export function gecerlilikMetni(iso?: string): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  });
}
