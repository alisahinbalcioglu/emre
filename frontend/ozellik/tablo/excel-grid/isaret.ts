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
 */

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
}

/** Hucre arka plani (textAlign cagirana ait — bu modul yalniz RENGI karara baglar). */
export interface IsaretStili {
  backgroundColor: string;
  color?: string;
}

const KIRMIZI: IsaretStili = { backgroundColor: '#fee2e2' };
const GRI: IsaretStili = { backgroundColor: '#f1f5f9' };
const MAVI: IsaretStili = { backgroundColor: '#e0f2fe', color: '#0c4a6e' };
const SARI: IsaretStili = { backgroundColor: '#fef9c3', color: '#854d0e' };

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
 * SIRA ONEMLI: otomatik varyant > oneri > yok/belirsiz > urun_degil.
 */
export function isaretStili(g: IsaretGirdisi): IsaretStili | null {
  if (malzemeDali(g)) {
    if (g.otoVaryant) return MAVI;
    if (g.oneri) return SARI;
  }
  const d = durumu(g);
  if (d === 'yok' || d === 'belirsiz') return KIRMIZI;
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
