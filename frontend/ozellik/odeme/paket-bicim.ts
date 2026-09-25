/**
 * Paket gorunum bicimleri — saf, React'siz (DOM'suz test edilebilir).
 */
// Yalniz TIP: calisma aninda dongu yok (paket-degisimi.ts buradan `tutarYaz` alir).
import type { DegisimOzeti } from './paket-degisimi';

export interface PaketSurumu {
  paketSurumuId: string;
  /**
   * SOZLESME TUTARI — karttan cekilen, faturaya yazilan tutar (TL, KDV dahil).
   * ⚠ STRING olarak gelir, number DEGIL — sebebi asagida.
   */
  tutar: string;
  paraBirimi: string;
  /**
   * VITRIN (capa) — musteriye buyuk puntoyla gosterilen dolar tutari.
   *
   * ⚠ BU BIR FIYAT DEGIL, BIR ETIKETTIR. Hicbir tahsilat, fatura ya da
   * erisim karari bunu okumaz; sozlesme tutari daima `tutar`dir (TL).
   * Ayrim kasitli: doviz cinsinden BEDEL BELIRLEMEK ile doviz cinsinden
   * FIYAT GOSTERMEK ayri seylerdir.
   *
   * null olabilir (eski surumler, havale paketleri) — o durumda ekran
   * yalnizca TL gosterir.
   */
  referansTutar: string | null;
  referansParaBirimi: string | null;
  periyot: string;
  periyotAdedi: number;
  denemeGunu: number;
  /**
   * Faz 6.12a — BU firmanın deneme hakkı. YALNIZ JWT'li `/abonelik/paketler`
   * döndürür; girişsiz `/fiyatlar` DÖNDÜRMEZ (firma bilinmez, yanıt önbellekli).
   * Alan yoksa (eski sunucu) kart eski satırı gösterir.
   */
  denemeHakki?: boolean;
  denemeGerekcesi?: DenemeGerekcesi | null;
}

/** Sunucudaki `DenemeGerekcesi` ile aynı değerler (backend deneme-hakki.ts). */
export type DenemeGerekcesi = 'var' | 'kullanildi' | 'eposta-dogrulanmadi';

/** Faz 6 (13.09): paketin çeviri kotası — sunucudaki TEK tablodan gelir
 *  (backend ceviri-kotasi.ts, seviye × kapsam). Ön yüz rakamı YAZMAZ, okur. */
export interface CeviriKotasi {
  satir: number;
  dosya: number;
}

export interface Paket {
  paketId: string;
  kod: string;
  ad: string;
  aciklama: string | null;
  kapsam: 'mechanical' | 'electrical' | 'mep' | string;
  seviye: 'core' | 'pro' | string;
  kullaniciHakki: number;
  aylikTeklifHakki: number | null;
  dwgAktif: boolean;
  /** Eski sunucu sürümü alanı döndürmeyebilir — ekran o durumda satırı çizmez. */
  ceviriKotasi?: CeviriKotasi;
  surum: PaketSurumu;
  /**
   * 23.09 — BU firmanın bu pakete NASIL geçeceği (satın al / geç / geçilemez).
   * YALNIZ JWT'li `/abonelik/paketler` döndürür (deneme hakkıyla aynı sebep);
   * yoksa kart eski davranışla "Bu paketi seç" der.
   */
  degisim?: DegisimOzeti;
  /**
   * 24.09 (A2 Blok 2) — bu pakete geçmeyi öneren BEKLEYEN yönetici önerisi.
   * Yalnız HEDEF paketin satırında gelir; `not` yalnız firma SAHİBİNE dolu
   * (üyeye `null`). Önerilen paketi seçmek öneriyi kabul etmektir.
   */
  oneri?: { id: string; sonGecerlilik: string; not: string | null };
}

/** Rakam dizgesine TR binlik ayracı: "12345" → "12.345". Tek yer — `tutarYaz`
 *  ve `sayiYaz` bunu kullanır. */
function binlikAyir(rakamlar: string): string {
  return rakamlar.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Tam sayı, TR binlik ayracıyla: 9000 → "9.000". `toLocaleString` KULLANILMAZ:
 *  sunucu ile tarayıcının ICU verisi farklıysa aynı sayfa iki biçim üretir. */
export function sayiYaz(n: number): string {
  return binlikAyir(String(Math.trunc(n)));
}

/**
 * Fiyatın yanındaki dönem eki. Kota metniyle AYNI dönemi söylemek zorunda:
 * kart "/ ay" deyip kotada "Abonelik dönemi başına" derse iki farklı dönem
 * ilan etmiş olur.
 */
export function donemEki(surum: Pick<PaketSurumu, 'periyot' | 'periyotAdedi'>): string {
  if (surum.periyotAdedi === 1 && surum.periyot === 'MONTHLY') return '/ ay';
  if (surum.periyotAdedi === 1 && surum.periyot === 'YEARLY') return '/ yıl';
  return '/ dönem';
}

export interface KotaMetni {
  /** Büyük punto — SATIR tavanı. Ölçüm (13.09) bağlayıcı olanın bu olduğunu gösterdi. */
  baslik: string;
  /** Küçük punto, parantez içinde — DOSYA tavanı. */
  ikincil: string;
}

/**
 * Kota başlığı. Satır sayısı BAŞLIK, dosya adedi PARANTEZ (karar 13.09).
 *
 * ⚠ NEDEN SATIR BAŞLIK: ölçülen dosya boyu 4 ile 1.766 satır arasında — 441
 * kat. "Ayda 30 çeviri" yazan bir sayfa, 500 satırlık dosyalarla çalışan
 * müşteriye 6 çeviri verip onu yanıltır.
 *
 * ⚠ "AYDA" YALNIZ AYLIK PAKETTE: kota abonelik DÖNEMİNE bağlıdır, takvim
 * ayına değil. Aylık olmayan bir sürümde "Ayda" yazmak yanlış olurdu; o
 * durumda dönem adıyla söylenir.
 */
export function kotaMetni(
  kota: CeviriKotasi,
  surum: Pick<PaketSurumu, 'periyot' | 'periyotAdedi'>,
): KotaMetni {
  const donem = surum.periyot === 'MONTHLY' && surum.periyotAdedi === 1 ? 'Ayda' : 'Abonelik dönemi başına';
  return {
    baslik: `${donem} ${sayiYaz(kota.satir)} satır çeviri`,
    ikincil: `en fazla ${sayiYaz(kota.dosya)} dosya`,
  };
}

/** Tek satırlık hâli: "Ayda 3.000 satır çeviri (en fazla 30 dosya)". */
export function kotaCumlesi(kota: CeviriKotasi, surum: Pick<PaketSurumu, 'periyot' | 'periyotAdedi'>): string {
  const m = kotaMetni(kota, surum);
  return `${m.baslik} (${m.ikincil})`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DENEME SATIRI — abonelik kartı (Faz 6.12a, 16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Ücretsiz deneme her firma ve kişi için BİR KEZ. Hakkı olmayan satın alma
 * engellenmez, ilk ay kart girilince alınır — kart bunu ÖNCEDEN söylemeli.
 *
 * ⚠ Girişsiz fiyat kartı (FiyatKartlari) bunu KULLANMAZ: orada firma yok, hak
 * bilinemez (karar K-P7). Gün sayısı her yerde SÜRÜMDEN okunur, yazılmaz.
 */
export const DENEME_KULLANILDI_METNI =
  'Deneme hakkınız daha önce kullanıldı — ilk aylık ücret kart bilgisini girdiğinizde alınır.';
export const DENEME_EPOSTA_DOGRULA_METNI =
  'Ücretsiz deneme için önce e-posta adresinizi doğrulayın.';

export interface DenemeSatiriBilgisi {
  /** olumlu = deneme var · bilgi = hak kullanılmış · uyari = doğrulama gerekli */
  ton: 'olumlu' | 'bilgi' | 'uyari';
  metin: string;
}

export function denemeSatiri(
  s: Pick<PaketSurumu, 'denemeGunu' | 'denemeHakki' | 'denemeGerekcesi'>,
): DenemeSatiriBilgisi | null {
  if (!(s.denemeGunu > 0)) return null;
  if (s.denemeGerekcesi === 'eposta-dogrulanmadi') return { ton: 'uyari', metin: DENEME_EPOSTA_DOGRULA_METNI };
  // Tanınmayan gerekçeyle bile hak YOK dendiyse deneme vaat EDİLMEZ.
  if (s.denemeGerekcesi === 'kullanildi' || s.denemeHakki === false) {
    return { ton: 'bilgi', metin: DENEME_KULLANILDI_METNI };
  }
  return { ton: 'olumlu', metin: `${s.denemeGunu} gün ücretsiz deneme` };
}

/**
 * Ödeme ekranı notu — `POST /abonelik/basla` yanıtından. Kart "deneme var"
 * dediği hâlde formdaki telefon ya da e-posta eskisiyle eşleştiyse karar
 * burada değişir; müşteri kart bilgisini girmeden ÖNCE öğrenir.
 */
export function odemeDenemeNotu(
  surum: Pick<PaketSurumu, 'denemeGunu'> | undefined,
  yanit: { denemeHakki?: boolean },
): string | null {
  if (!surum || !(surum.denemeGunu > 0)) return null;
  return yanit.denemeHakki === false ? DENEME_KULLANILDI_METNI : null;
}

export const KAPSAM_ETIKET: Record<string, string> = {
  mechanical: 'Mekanik',
  electrical: 'Elektrik',
  mep: 'Mekanik + Elektrik',
};

/**
 * Seviye KODUNUN müşteriye görünen adı — TEK KAYNAK (kart rozeti, kenar
 * çubuğu rozeti).
 *
 * ⚠ 15.09 (Emre kararı): en ucuz paketin müşteriye görünen adı "Basic".
 * `core` yalnız iç seviye kodudur (Tier / PackageLevel); ekrana kod basılmaz.
 * Kenar çubuğu `{tier}` basıyordu → müşteri "CORE" görüyordu, hesap
 * sayfasında "Basic Plan" yazarken.
 */
export const SEVIYE_AD: Record<string, string> = {
  core: 'Basic',
  pro: 'Pro',
  suite: 'Suite',
};

/** Kodun ekran adı. Tanınmayan kod AYNEN gösterilir — sessizce "Basic" demez. */
export function seviyeAdi(seviye: string): string {
  return SEVIYE_AD[seviye] ?? seviye;
}

/**
 * ETKİN paket YOKKEN ekrana basılan metin — TEK yer (2.15, 22.09.2026).
 *
 * ⚠ "Abonelik yok" DEĞİL: `abonelik-ozeti.ts` o cümleyi abonelik KAYDI
 * bulunmayan hâl için kullanıyor. Burada kayıt VAR olabilir (süresi dolmuş
 * Pro) — yanlış olan, o kaydın şu an bir paket AÇMIYOR oluşu. "Paket yok"
 * iki dalda da doğrudur.
 */
export const PAKET_YOK_METNI = 'Paket yok';

/**
 * ROZET METNİ — seviye yoksa paket adı UYDURMAZ (2.15).
 *
 * ── ÖLÇÜLEN KUSUR (2.13 kapatılırken) ─────────────────────────────────
 * `etkinSeviye` 2.13'ten sonra abonelik yürümüyorsa `null` dönüyor; sunucu
 * ve ekranlar bunu `?? 'core'` ile yedekliyordu. Sonuç: süresi dolmuş bir
 * PRO müşteri kenar çubuğunda **"Basic"** rozeti görüyordu — sahip olmadığı
 * bir paket. Yanlış yönde bir yalan değil (yetki vermiyor) ama yine de yalan.
 *
 * ⚠ İKİNCİ SÖZLÜK DEĞİL: ad hâlâ {@link seviyeAdi} → {@link SEVIYE_AD}'den
 * gelir. Bu fonksiyon yalnız BOŞ hâlin kapısıdır. Ekranlar `?? 'core'`
 * yerine bunu çağırır; karar tek yerde kalır.
 */
export function paketRozeti(seviye: string | null | undefined): string {
  return seviye ? seviyeAdi(seviye) : PAKET_YOK_METNI;
}

/**
 * Seviye rozeti — kart başlığıyla AYNI adı söyler.
 *
 * ⚠ 15.09 (Faz 6.1 kapanış): rozet "Core — malzeme" diyordu, hemen üstündeki
 * kart başlığı (veritabanındaki paket adı) "Basic — Mekanik". Canlı
 * `GET /api/fiyatlar` (15.09) okundu: `core` seviyesindeki iki paketin adı da
 * "Basic — …". Veritabanına dokunulmadı; ekran adı ona uyduruldu.
 * `seviye` KODU (`core`) değişmez — yalnız ekrana giden ad.
 */
export const SEVIYE_ETIKET: Record<string, string> = {
  core: `${SEVIYE_AD.core} — malzeme`,
  pro: `${SEVIYE_AD.pro} — malzeme + işçilik + DWG`,
};

/**
 * Para bicimleme.
 *
 * ⚠ TUTAR SUNUCUDAN STRING GELIR (`Decimal.toFixed(2)`), number DEGIL.
 * Bu bilincli: Prisma `Decimal` degerini JSON'a cevirirken float'a dusurmek
 * kurus kaybina yol acar ve bu depoda para hatalarinin bilinen bir kaynagi
 * (P2 turu, "para 2 ondalik" dersi). Burada da `Number()` ile geri
 * dondurulmez; ondalik ayraci degistirilerek METIN olarak bicimlenir.
 */
export function tutarYaz(tutar: string, paraBirimi: string): string {
  const sembol = paraBirimi === 'TRY' ? '₺' : paraBirimi === 'USD' ? '$' : paraBirimi === 'EUR' ? '€' : '';
  const [tam, kesir = '00'] = String(tutar).split('.');
  // Binlik ayraci — TR bicimi: 12.345,67
  const binlikli = binlikAyir(tam);
  return `${sembol}${binlikli},${kesir.padEnd(2, '0').slice(0, 2)}`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VITRIN — musteriye ne gosterilecek
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Kullanici karari (29.08): fiyat DOLAR olarak sunulur, tahsilat TL yapilir.
 *  Ticari gerekce: "$24" kucuk bir tutar gibi durur, "1.250 TL" buyuk bir
 *  para gibi. Ayvaz'in euro fiyat listesi + TL fatura kesmesiyle ayni kalip.
 *
 *  ⚠ SOZLESME TUTARI DAIMA TL'DIR. Dolar yalnizca capadir; bu fonksiyon
 *  ikisini AYRI dondurur ki ekran hangisinin baglayici oldugunu saklamasin.
 *  "≈" isareti ve "olarak tahsil edilir" ifadesi bilincli: musteri neyin
 *  cekilecegini net gormeli, sonradan surpriz olmamali.
 *
 *  Capa YOKSA (null) yalnizca TL doner — uydurma dolar URETILMEZ.
 */
export interface VitrinFiyati {
  /** Buyuk puntoyla gosterilecek — capa varsa dolar, yoksa TL. */
  ana: string;
  /** Altinda kucuk punto — capa varsa TL aciklamasi, yoksa null. */
  alt: string | null;
}

export function vitrinFiyati(s: PaketSurumu): VitrinFiyati {
  const sozlesme = tutarYaz(s.tutar, s.paraBirimi);

  if (!s.referansTutar || !s.referansParaBirimi) {
    // Capa yok → yalniz sozlesme tutari. Dolar UYDURULMAZ.
    return { ana: sozlesme, alt: null };
  }

  return {
    ana: tutarYaz(s.referansTutar, s.referansParaBirimi),
    alt: `≈ ${sozlesme} olarak tahsil edilir (KDV dahil)`,
  };
}
