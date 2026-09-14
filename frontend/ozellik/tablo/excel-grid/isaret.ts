/**
 * FIYAT HUCRESI ISARETI — MALZEME + ISCILIK, TEK TANIMDAN (saf, DOM'suz).
 *
 * ── NEDEN AYRI MODUL ────────────────────────────────────────────────────────
 * "Isaret EYLEMLI olmali" (SD6) kurali yalniz MALZEME kolonunda uygulanmisti:
 * `cellStyle` (kirmizi/gri hucre), `tooltipValueGetter` (sebep + aday sayisi)
 * ve "N satir secim bekliyor" sayaci UCU DE yalniz `_matStatus` okuyordu.
 * Doldurma yolu ise iscilik dalinda `_labStatus` / `_labSebep` /
 * `_labAdaySayisi` alanlarini DUZGUNCE YAZIYOR (fill-down.ts) — ama hicbir
 * okuyucu yoktu: alanlar yalniz-yazilirdi.
 *
 * KULLANICI-GORUNUR SONUC: 10 satirlik aileye iscilik firmasi surukle-doldur
 * yapilinca, o firmada kalemi olmayan satirlar TAMAMEN SESSIZ kaliyordu —
 * kirmizi hucre yok, tooltip yok, ust sayac 0. Bu, fill-down modulunun var
 * olma sebebi olan FAZ 0 §A semptomunun ("141 satirin 131'i isaretsiz bos")
 * ISCILIK IKIZINDE aynen durmasiydi. Guvenlik agi da yoktu: kaydetme uyarisi
 * (fiyatsiz-kalem-uyarisi) malzeme+iscilik TUM para sinyallerini topladigi
 * icin "malzemesi fiyatli / iscilligi bos" satir uyariya HIC girmiyordu.
 *
 * Karar mantigi buraya cikarildi ki iki kolon AYNI tanimdan beslensin ve
 * taraflardan biri saparsa test kirmiziya donsun (isaret.test.ts). ExcelGrid
 * jsdom'suz kosulamadigi icin bu modul, o davranisin olculebilir tek yeridir.
 *
 * ⚠ Malzemeye OZGU iki isaret (otomatik varyant / oneri) iscilikte YOKTUR —
 * doldurma yolu onlari `if (!iscilikMi)` dalinda yazar. Ikizlik "her alan iki
 * tarafta da var" demek degil; VAR OLAN sinyalin iki tarafta da OKUNMASI
 * demektir.
 *
 * ── A2 (tur 3, 14.09): SAYI OKUNAMADI SINYALI ─────────────────────────────
 * Ice aktarmada fiyat/miktar hucresindeki metin sayi degilse ("35x240mm Üç
 * bölmeli döşeme kanalı") ya da belirsizse ("1.250") hucre BOS gelir ve satirda
 * `_sayiUyari: {alan: {ham, tur}}` durur. Bu sinyal `_matStatus`/`_matSebep`e
 * YAZILMAZ: eslestirme ve elle fiyat girisi o alanlari ezer/siler — kullanici
 * dosyadaki metnin neden gelmedigini goremezdi. En ONCELIKLI sinyaldir.
 */
import { kayitliSayiUyarisi, type SayiAlanTuru } from '../../fiyat/sayi-alani';

// NOT: goreli yol ZORUNLU — vitest.config.ts'te '@/' alias'i tanimli degil.
import { paraBicim } from '../../fiyat/pricing';

/** Isaretin okundugu dal. Metinler menu adini bundan turetir. */
export type IsaretDal = 'malzeme' | 'iscilik';

/** Bir satirin tek tarafina ait isaret sinyalleri (hangi alandan geldigi
 *  cagirana ait; bu modul alan ADI bilmez — dal bilir). */
export interface IsaretGirdisi {
  dal: IsaretDal;
  durum?: unknown;
  sebep?: unknown;
  adaySayisi?: unknown;
  /** Yalniz malzeme dalinda anlamli (V4.1 grup varyanti). */
  otoVaryant?: unknown;
  /** Yalniz malzeme dalinda anlamli (cap-only/baslik-ipucu eslesmesi). */
  oneri?: unknown;
  /** A2: bu hucrenin ice aktarma sayi uyarisi (`_sayiUyari[alan]` — {ham, tur}). */
  sayiUyari?: unknown;
  /** A2: uyari metninin alan turu (fiyat kolonlari 'fiyat', miktar 'miktar'). */
  sayiAlani?: SayiAlanTuru;
}

/** Hucre arka plani (textAlign cagirana ait — bu modul yalniz RENGI karara baglar). */
export interface IsaretStili {
  backgroundColor: string;
  color?: string;
}

const KIRMIZI: IsaretStili = { backgroundColor: '#fee2e2' };
// VS (25.08): 'hata'/'ad-yok' HIC zemin almiyordu — surukleme sirasindaki
// sunucu hatasi ekranda tamamen sessiz kaliyordu (tooltip vardi, gorsel
// cagri yoktu). Turuncu: kirmizidan (yok/belirsiz) gozle ayrisir.
const TURUNCU: IsaretStili = { backgroundColor: '#ffedd5', color: '#9a3412' };
const GRI: IsaretStili = { backgroundColor: '#f1f5f9' };
const MAVI: IsaretStili = { backgroundColor: '#e0f2fe', color: '#0c4a6e' };
const SARI: IsaretStili = { backgroundColor: '#fef9c3', color: '#854d0e' };
// A2: sayi okunamadi — MOR; kirmizi (eslesme yok) ve turuncudan (hata) gozle ayrisir.
const MOR: IsaretStili = { backgroundColor: '#ede9fe', color: '#5b21b6' };

/** A2: satirin bu hucresinde ice aktarma sayi uyarisi var mi? */
function sayiUyarisiVar(g: IsaretGirdisi): boolean {
  return !!g.sayiUyari && typeof g.sayiUyari === 'object';
}

/** Malzemeye ozgu isaretler yalniz malzeme dalinda okunur. */
function malzemeDali(g: IsaretGirdisi): boolean {
  return g.dal === 'malzeme';
}

const durumu = (g: IsaretGirdisi): string => String(g.durum ?? '');

/**
 * "Bu satir kullanici karari bekliyor mu?" — guven kapisi sayacinin olcutu.
 * Sayac SATIR sayar: bir satir iki tarafta da bekliyorsa BIR kez sayilir
 * (cagiran taraf iki cagriyi OR'lar).
 */
export function secimBekliyor(durum: unknown): boolean {
  const d = String(durum ?? '');
  return d === 'yok' || d === 'belirsiz';
}

/**
 * Hucre arka plani. Isaret yoksa `null` (cagiran duz stili uygular).
 * SIRA ONEMLI: sayi okunamadi (A2) > otomatik varyant > oneri > yok/belirsiz > urun_degil.
 */
export function isaretStili(g: IsaretGirdisi): IsaretStili | null {
  if (sayiUyarisiVar(g)) return MOR;
  if (malzemeDali(g)) {
    if (g.otoVaryant) return MAVI;
    if (g.oneri) return SARI;
  }
  const d = durumu(g);
  if (d === 'yok' || d === 'belirsiz') return KIRMIZI;
  if (d === 'hata' || d === 'ad-yok') return TURUNCU;
  if (d === 'urun_degil') return GRI;
  return null;
}

/** Dala gore secim menusunun adi — tooltip kullaniciyi DOGRU menuye yollar. */
function menuAdi(g: IsaretGirdisi): string {
  return g.dal === 'iscilik' ? 'firma' : 'marka';
}

/** Dala gore "ad" sozcugu — iscilik satirinda "malzeme adi" yaniltirdi. */
function adTuru(g: IsaretGirdisi): string {
  return g.dal === 'iscilik' ? 'işçilik' : 'malzeme';
}

/**
 * Hucre tooltip'i. Isaret yoksa bos string.
 *
 * SD6: isaret EYLEMLI olmali — SEBEP ve KAC ADAY oldugu gorunur, kullanici
 * ne yapacagini bilir. Canli bulgu (30.07): kaynakta "kirmizi (astar) boyali"
 * secilmisti, hedef caplarda o cins yoktu; ekranda yalniz pembe hucre vardi ve
 * kullanici "otomatik varyant calismiyor" olarak yasadi.
 */
export function isaretTooltip(g: IsaretGirdisi): string {
  if (sayiUyarisiVar(g)) {
    // Tek cumle kaynagi: elle yazma toast'i ve form kutusu AYNI metni gosterir.
    return `Dosyadan gelmedi — ${kayitliSayiUyarisi(g.sayiUyari, g.sayiAlani ?? 'fiyat') ?? 'sayı okunamadı'}`;
  }
  if (malzemeDali(g) && g.otoVaryant) {
    return `⚡ otomatik: ${g.otoVaryant} — farklı varyant için marka menüsünü yeniden açın`;
  }
  const d = durumu(g);
  const sebep = g.sebep ? String(g.sebep) : '';

  if (d === 'belirsiz') {
    const n = g.adaySayisi;
    return [
      sebep || 'Seçim bekliyor',
      n ? `${n} aday var — ${menuAdi(g)} menüsünü açıp seçin` : `${menuAdi(g)} menüsünü açıp varyant seçin`,
    ].join(' · ');
  }
  if (d === 'yok') return sebep || 'Kütüphanede eşleşme yok';
  if (d === 'hata') return `Eşleştirme hatası: ${sebep || 'bilinmeyen'} — tekrar deneyin`;
  if (d === 'ad-yok') return `Bu satırda ${adTuru(g)} adı yok — fiyat sorgulanamadı`;
  if (d === 'urun_degil') return 'Oran/hizmet satırı — fiyat beklenmiyor';
  if (malzemeDali(g) && g.oneri) return 'Öneri — kontrol edin';
  return '';
}

const PARA_SEMBOLU: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };

/**
 * K1 AYRISMIS KUTUPHANE FIYATI (tur 3 A4c, 14.09) — kutuphane "Liste Fiyat"
 * hucresi. HAVUZA BAGLI satirda ozel fiyat havuz liste fiyatindan ayrismis:
 * havuz guncellenip yeniden aktarilmis ve ozel fiyat eski havuz fiyatinda
 * donmus OLABILIR — ya da kullanici bilerek yazmistir. Hangisinin gecerli
 * oldugu TAHMIN EDILMEZ: hucre SARI, ipucu iki fiyati gosterir, kullanici
 * gecerli fiyati hucreye yazar. Sinyal backend'den gelir (`_fiyatAyrisik`,
 * library-sheet-builder `havuzFiyatAyrisimi` — migration'daki "ayrismis"
 * tanimi). Sinyal yoksa null: cagiran normal stili uygular.
 */
export function kutuphaneFiyatAyrisimi(d: unknown): { stil: IsaretStili; ipucu: string } | null {
  const satir = d as { _fiyatAyrisik?: { ozel?: unknown; havuz?: unknown }; _currency?: unknown } | null | undefined;
  const a = satir?._fiyatAyrisik;
  if (!a || typeof a !== 'object') return null;
  const ozel = Number(a.ozel);
  const havuz = Number(a.havuz);
  if (a.ozel == null || a.havuz == null || !Number.isFinite(ozel) || !Number.isFinite(havuz)) return null;
  const sembol = PARA_SEMBOLU[String(satir?._currency ?? 'TRY')] ?? '₺';
  return {
    stil: SARI,
    ipucu: `Özel fiyat ${sembol}${paraBicim(ozel, 1)} · havuz liste fiyatı ${sembol}${paraBicim(havuz, 1)} — havuz fiyatı değişmiş; geçerli fiyatı bu hücreye yazın`,
  };
}
