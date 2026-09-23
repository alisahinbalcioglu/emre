/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HESABIM — EKRANIN SAF KARARLARI (import'suz) · 23.09.2026
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Hesabım tek uzun sayfaydı: on bir kart alt alta, abonelik iptali açılır bir
 *  bölümün içinde, çıkış en altta. Emre'nin tasarımıyla kısa bir kimlik satırı
 *  ve sekmelere bölündü. Bu dosya ekranın ÜÇ kararını taşır:
 *    1. kim hangi sekmeyi görür, adresteki `?sekme=` nasıl çözülür;
 *    2. kimlik satırında hangi ad ve baş harfler yazılır;
 *    3. fatura bilgisinde hangi kimlik numarası gösterilir ve kaydedilir.
 *  Sayfa bunları YENİDEN HESAPLAMAZ, yalnız çizer.
 *
 *  ⚠ IMPORT YOK: vitest bu depoda `@/…` çözmüyor (`kapali-durum.ts` ile aynı
 *  gerekçe); dosya testte doğrudan okunabilsin.
 */

// ── 1 · SEKMELER ────────────────────────────────────────────────────────────

export type HesapSekmesi = 'profil' | 'firma' | 'abonelik' | 'guvenlik' | 'veriler' | 'erisim';

/** Sekmenin ekran adı. Adreste bu ad değil, `HesapSekmesi` kodu durur. */
export const SEKME_ADI: Record<HesapSekmesi, string> = {
  profil: 'Profil',
  firma: 'Firma',
  abonelik: 'Abonelik',
  guvenlik: 'Güvenlik',
  veriler: 'Veriler',
  erisim: 'Ekip erişimim',
};

/**
 * Firma sahibi firmayı, aboneliği ve faturayı yönetir. Sözleşme de böyle der:
 * abonelik, ödeme ve fatura bilgilerini YALNIZ firma sahibi görür ve yönetir
 * (`hukuki/metinler.ts`). Sunucu üyeyi zaten reddediyor (`@FirmaRolu('sahip')`);
 * sekmeyi hiç çizmemek üyenin basamayacağı düğmelere bakmasını önler.
 */
const SAHIP_SEKMELERI: readonly HesapSekmesi[] = ['profil', 'firma', 'abonelik', 'guvenlik', 'veriler'];

/**
 * ⚠ "VERİLER" ÜYEDE DE VAR — tasarımdan BİLEREK sapma (23.09.2026).
 * Tasarım alt kullanıcıya yalnız Profil · Ekip erişimim · Güvenlik veriyordu.
 * Oysa "Verilerimi indir" (KVKK m.11) ve "Hesabımı kapat" KİŞİNİN hakkıdır,
 * firmanın değil:
 *   · dışa aktarım üyeye kendi tekliflerini ve kişisel verisini verir
 *     (`hesap.servisi.ts` `verileriDisaAktar`, üye dalı);
 *   · gizlilik politikası kapatmayı "Hesabım sayfanızdaki 'Hesabımı kapat'
 *     bölümü" diye tarif ediyor, üye için de;
 *   · Ekip sayfası üyeye "Ekipten ayrılmak için Hesabım → Hesabımı kapat"
 *     diyor (`/profile#hesabi-kapat`).
 * Sekme kalksaydı üç yol birden kopardı; hak yalnız e-postayla kullanılırdı.
 */
const UYE_SEKMELERI: readonly HesapSekmesi[] = ['profil', 'erisim', 'guvenlik', 'veriler'];

export const VARSAYILAN_SEKME: HesapSekmesi = 'profil';

/**
 * Kişinin gördüğü sekmeler, tasarımdaki sırayla.
 *
 * ⚠ `sahipMi` çağıranda FAIL-CLOSED hesaplanır (`firmaRol === 'sahip'`):
 * rol yanıttan düşerse kişi ÜYE sekmelerini görür, firma formunu değil.
 */
export function hesapSekmeleri(sahipMi: boolean): readonly HesapSekmesi[] {
  return sahipMi ? SAHIP_SEKMELERI : UYE_SEKMELERI;
}

/**
 * Adresteki `?sekme=` değerini çözer. Tanınmayan ya da kişinin GÖRMEDİĞİ sekme
 * varsayılana düşer: üyeye gönderilen `?sekme=abonelik` bağlantısı sahibin
 * ekranını açmaz, boş bir panel de göstermez.
 */
export function sekmeCoz(
  ham: string | null | undefined,
  sekmeler: readonly HesapSekmesi[],
): HesapSekmesi {
  return sekmeler.find((s) => s === ham) ?? VARSAYILAN_SEKME;
}

/**
 * Sekmelerden ÖNCE yazılmış çapa bağlantıları. Ekip sayfası üyeye
 * `/profile#hesabi-kapat` veriyor; sekmeler gelince o bağlantı Profil'de açılır
 * ve "Hesabımı kapat" hiç görünmezdi.
 * `Map`: düz nesnede `capadanSekme('constructor')` bir fonksiyon döndürürdü.
 */
const CAPA_SEKMESI: ReadonlyMap<string, HesapSekmesi> = new Map([['hesabi-kapat', 'veriler']]);

export function capadanSekme(capa: string | null | undefined): HesapSekmesi | null {
  return CAPA_SEKMESI.get((capa ?? '').replace(/^#/, '')) ?? null;
}

/** Sekmenin adresi. Varsayılan sekme sorgusuz yazılır (`/profile`). */
export function sekmeAdresi(sekme: HesapSekmesi): string {
  return sekme === VARSAYILAN_SEKME ? '/profile' : `/profile?sekme=${sekme}`;
}

// ── 2 · KİMLİK SATIRI ───────────────────────────────────────────────────────

export interface KimlikBilgisi {
  email: string;
  ad?: string | null;
  soyad?: string | null;
}

function kirp(s: string | null | undefined): string {
  return (s ?? '').trim();
}

/**
 * Kimlik satırındaki ad: ad ve soyad girilmişse onlar, yoksa e-postanın @
 * öncesi. Eski sayfa kişi adını girse bile HER ZAMAN e-postayı basıyordu.
 */
export function gorunenAd(k: KimlikBilgisi): string {
  const tam = [kirp(k.ad), kirp(k.soyad)].filter(Boolean).join(' ');
  return tam || k.email.split('@')[0];
}

/**
 * Avatar harfleri: ad ve soyadın ilk harfleri, ad yoksa e-postanın ilk harfi.
 * ⚠ Türkçe büyütme LOCALE'Lİ: `'i'.toUpperCase()` "I" verir, doğrusu "İ".
 */
export function basHarfler(k: KimlikBilgisi): string {
  const ad = kirp(k.ad);
  const harfler = ad ? `${ad.charAt(0)}${kirp(k.soyad).charAt(0)}` : k.email.charAt(0);
  return harfler.toLocaleUpperCase('tr-TR');
}

// ── 3 · FATURA KİMLİĞİ: ŞİRKET / ŞAHIS ŞİRKETİ ─────────────────────────────

export type FirmaTuru = 'sirket' | 'sahis';

export interface KimlikNumaralari {
  vergiNo?: string | null;
  tcKimlikNo?: string | null;
}

/**
 * Formun açılış seçimi: yalnız T.C. kimlik no doluysa şahıs şirketi, aksi her
 * durumda şirket. İkisi de doluysa ŞİRKET, çünkü faturayı kesen adaptör de
 * vergi numarasını önce okur (`muhasebe.adaptor.ts`: `vergiNo ?? tcKimlikNo`).
 * Ekran, faturaya gidecek numarayı göstermeli.
 */
export function firmaTuruCoz(f: KimlikNumaralari): FirmaTuru {
  return !kirp(f.vergiNo) && kirp(f.tcKimlikNo) ? 'sahis' : 'sirket';
}

/**
 * Kaydedilecek kimlik alanları. Seçilmeyen alan BOŞ gönderilir; sunucu boş
 * dizeyi `null` yapar (`firma.servisi.ts` PATCH sözleşmesi).
 *
 * ⚠ NEDEN SİLİNİYOR: adaptör `vergiNo ?? tcKimlikNo` okur. Şirketten şahıs
 * şirketine geçen kişinin eski vergi numarası kalsaydı ekranda T.C. kimlik no
 * görünürken fatura ESKİ vergi numarasıyla kesilirdi. Veritabanındaki iki
 * alan olduğu gibi durur (tasarım); fatura, ekranda seçili olanla kesilir.
 */
export function kimlikGovdesi(
  tur: FirmaTuru,
  deger: { vergiNo: string; tcKimlikNo: string },
): { vergiNo: string; tcKimlikNo: string } {
  return tur === 'sirket'
    ? { vergiNo: deger.vergiNo, tcKimlikNo: '' }
    : { vergiNo: '', tcKimlikNo: deger.tcKimlikNo };
}

/**
 * Kaydetmeden ÖNCE söylenecek cümle: seçilmeyen alanda KAYITLI bir numara
 * varsa kaydetmek onu siler. Yoksa `null` ve ekran uyarı çizmez.
 */
export function silinecekKimlikUyarisi(tur: FirmaTuru, kayitli: KimlikNumaralari): string | null {
  if (tur === 'sirket' && kirp(kayitli.tcKimlikNo)) {
    return 'Kaydettiğinizde kayıtlı T.C. kimlik no silinir; faturada vergi no kullanılır.';
  }
  if (tur === 'sahis' && kirp(kayitli.vergiNo)) {
    return 'Kaydettiğinizde kayıtlı vergi no silinir; faturada T.C. kimlik no kullanılır.';
  }
  return null;
}
