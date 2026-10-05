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
 *
 * ── C10 (P4b Parti 3, 05.10): BAYAT KUR ───────────────────────────────────
 * Dovizli kutuphane satirindan gelen TL fiyat, son basarili TCMB cekiminden
 * bu yana > 2 is gunu eski kurla hesaplanmissa motor `kaynakKur.bayat` yazar
 * (P4a sunucuda yalniz WARN yaziyordu). Isaret ZEMIN degil SERIT: bayat kurlu
 * fiyat ayni zamanda oneri / otomatik varyant olabilir — o isaretin zemini ve
 * metni KALIR, serit ve kur notu EKLENIR (hicbir sinyal digerini yutmaz).
 * Serit `background-image`: izgaranin tulleri (kopya secimi, fitting kapsami,
 * surukleme) `box-shadow: inset` kanalinda ve !important'siz — satir ici
 * golge onlari EZERDI; gradyan zeminle birlesir, tul ustune biner.
 * Hucre fiyati dovizde kaldiysa (karisik kip, taraf birimi USD/EUR) kurla
 * hesaplanmamistir: isaret yok (kayittaki iliskisel TL karsiligi yine bu
 * kurla — teklif-kalem.ts — ama o hucrede gorunmez).
 */
import { kayitliSayiUyarisi, trSayi, type SayiAlanTuru } from '../../fiyat/sayi-alani';

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
  /** C10: fiyatin TL'ye cevrildigi kur — satirin `_matKurBilgi`/`_labKurBilgi`
   *  alani (motorun `kaynakKur`u: {currency, kur, tarih, bayat?, yasIsGunu?}).
   *  Yalniz `bayat: true` isaret uretir; eski kayittaki metin bicimi ('USD/41,2') degil. */
  kurBilgi?: unknown;
  /** C10: hucre fiyatinin taraf birimi (`_matPB`/`_labPB`, karisik kip). USD/EUR
   *  ise hucre fiyati dovizde kalmistir, kurla hesaplanmamistir. Yoksa TL (tl kipi).
   *  ⚠ Cagiran `kurBilgi`yi verirken BUNU da vermeli: yoksa karisik kipteki $
   *  hucresi TL sayilir. */
  tarafBirimi?: unknown;
}

/** Hucre arka plani (textAlign cagirana ait — bu modul yalniz RENGI karara baglar). */
export interface IsaretStili {
  backgroundColor: string;
  color?: string;
  /** C10 bayat kur seridi (sol kenarda gradyan) — diger isaretin zemini uzerine eklenir. */
  backgroundImage?: string;
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
// C10: bayat kur — sol AMBER serit (gradyan; tul kanali box-shadow'a dokunmaz);
// baska isaret yoksa amber-50 zemin. Sariyla (oneri) zemini yakin: ayirt eden SERIT.
const KUR_BAYAT_SERIDI = 'linear-gradient(to right, #d97706 0 3px, transparent 3px)';
const KUR_BAYAT: IsaretStili = { backgroundColor: '#fffbeb', color: '#92400e', backgroundImage: KUR_BAYAT_SERIDI };

/** A2: satirin bu hucresinde ice aktarma sayi uyarisi var mi? */
function sayiUyarisiVar(g: IsaretGirdisi): boolean {
  return !!g.sayiUyari && typeof g.sayiUyari === 'object';
}

/** Malzemeye ozgu isaretler yalniz malzeme dalinda okunur. */
function malzemeDali(g: IsaretGirdisi): boolean {
  return g.dal === 'malzeme';
}

const durumu = (g: IsaretGirdisi): string => String(g.durum ?? '');

/** Hucrede fiyat OLMADIGINI soyleyen durumlar (doldurma yolu kuru fiyatla birlikte siler). */
const FIYATSIZ_DURUMLAR = new Set(['yok', 'belirsiz', 'hata', 'ad-yok', 'urun_degil']);

interface BayatKur { yas: number | null; birim: string; kur: number | null; tarih: string }

/**
 * C10: hucredeki TL fiyat bayat kurla mi hesaplandi? Degilse null. Kur notu
 * yalniz FIYATA eslik eder: sayi okunamadi ya da fiyatsiz durumda (kur zaten
 * fiyatla birlikte silinir) isaret yok.
 */
function bayatKur(g: IsaretGirdisi): BayatKur | null {
  const k = g.kurBilgi as { bayat?: unknown; yasIsGunu?: unknown; currency?: unknown; kur?: unknown; tarih?: unknown } | null | undefined;
  if (!k || typeof k !== 'object' || k.bayat !== true) return null;
  const taraf = String(g.tarafBirimi ?? '');
  if (taraf === 'USD' || taraf === 'EUR') return null; // fiyat dovizde kaldi — kur kullanilmadi
  if (sayiUyarisiVar(g) || FIYATSIZ_DURUMLAR.has(durumu(g))) return null;
  const sayi = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const yas = sayi(k.yasIsGunu);
  return {
    yas: yas != null && yas > 0 ? Math.floor(yas) : null,
    birim: typeof k.currency === 'string' ? k.currency.trim() : '',
    kur: sayi(k.kur),
    tarih: typeof k.tarih === 'string' ? k.tarih.trim() : '',
  };
}

/**
 * "Fiyatlandırıldığında kur 3 iş günü eskiydi (1 USD = ₺41,2345, 01.10.2026) — …"
 * GECMIS ZAMAN: kur bilgisi teklifle KAYDEDILIR (kur donmasi) — aylar sonra
 * acilan teklifte "3 is gunu eski" bugunu anlatmaz, fiyatlandirma anini anlatir.
 * SD6: notun nasil kalkacagini da soyler (yeniden sec → yeni kur; elle yazilan
 * fiyatin kuru yoktur).
 */
function bayatKurNotu(b: BayatKur, g: IsaretGirdisi): string {
  const ayrinti = [b.kur != null && b.birim ? `1 ${b.birim} = ₺${trSayi(b.kur, 2, 4)}` : '', b.tarih].filter(Boolean).join(', ');
  const bas = b.yas != null ? `Fiyatlandırıldığında kur ${b.yas} iş günü eskiydi` : 'Fiyatlandırıldığında kur eskiydi';
  return `${bas}${ayrinti ? ` (${ayrinti})` : ''} — güncel kur için ${menuAdi(g)} menüsünden yeniden seçin ya da fiyatı elle yazın`;
}

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
 * C10 bayat kur zemin YARISINA girmez: secilen zeminin USTUNE serit ekler
 * (zemin yoksa kendi amber zemini).
 */
export function isaretStili(g: IsaretGirdisi): IsaretStili | null {
  const ana = anaStil(g);
  if (!bayatKur(g)) return ana;
  return ana ? { ...ana, backgroundImage: KUR_BAYAT_SERIDI } : KUR_BAYAT;
}

function anaStil(g: IsaretGirdisi): IsaretStili | null {
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
 *
 * C10: bayat kur notu metnin SONUNA eklenir (oneri / otomatik varyant metni kalir).
 */
export function isaretTooltip(g: IsaretGirdisi): string {
  const ana = anaTooltip(g);
  const kur = bayatKur(g);
  if (!kur) return ana;
  return ana ? `${ana} · ${bayatKurNotu(kur, g)}` : bayatKurNotu(kur, g);
}

function anaTooltip(g: IsaretGirdisi): string {
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

// Eski kayitta ham yazim olabilir — arka ucun OKUMA tablosunun aynisi
// (exchange-rates.service `PARA_BIRIMI_YAZIMLARI`); yazma yollari yalniz kod yazar.
const BIRIM_YAZIMI: Record<string, string> = {
  '': 'TRY', TL: 'TRY', '₺': 'TRY', YTL: 'TRY',
  $: 'USD', US$: 'USD', DOLAR: 'USD', DOLLAR: 'USD',
  '€': 'EUR', EURO: 'EUR', AVRO: 'EUR',
};

/** Birim yazimi → kod ('TL' / '₺' = 'TRY', bos → TRY); taninmayan yazim aynen. */
function birimKodu(birim: string): string {
  const kod = birim.trim().toUpperCase().replace(/\s+/g, '');
  return BIRIM_YAZIMI[kod] ?? kod;
}

/** Tutar + birim simgesi; taninmayan birim KODUYLA yazilir (₺ uydurulmaz). */
function paraMetni(v: number, birim: string): string {
  const kod = birimKodu(birim);
  return `${PARA_SEMBOLU[kod] ?? `${kod} `}${paraBicim(v, 1)}`;
}

/** Ayrisan satirin ust seritteki eylemi — sayfadaki dugmeyle AYNI ad. */
export const HAVUZA_DON_EYLEMI = 'Havuz fiyatına dön';

/**
 * K1 AYRISMIS KUTUPHANE FIYATI (tur 3 A4c, 14.09) — kutuphane "Liste Fiyat"
 * hucresi. HAVUZA BAGLI satirda ozel fiyat havuz liste fiyatindan ayrismis:
 * havuz guncellenip yeniden aktarilmis ve ozel fiyat eski havuz fiyatinda
 * donmus OLABILIR — ya da kullanici bilerek yazmistir. Hangisinin gecerli
 * oldugu TAHMIN EDILMEZ: hucre SARI, ipucu iki fiyati gosterir, kullanici
 * gecerli fiyati hucreye yazar ya da ozel fiyati birakip havuza doner
 * (marka sayfasi «Havuz fiyatına dön»). Sinyal backend'den gelir
 * (`_fiyatAyrisik`, library-sheet-builder `havuzFiyatAyrisimi` — migration'daki
 * "ayrismis" tanimi). Sinyal yoksa null: cagiran normal stili uygular.
 *
 * C3 (P4b Parti 3): ozel fiyat liste fiyatindan FARKLI birimde olabilir;
 * backend o zaman iki birimi de tasir (`ozelBirim`/`havuzBirim`). Her fiyat
 * KENDI simgesiyle yazilir — tek simge "$12 · $480" diye yanlis soylerdi.
 * Hucreye yazilan sayi ozel fiyatin biriminde kalir, ayrisma kapanmaz: tek
 * cikis havuza donmektir.
 */
export function kutuphaneFiyatAyrisimi(d: unknown): { stil: IsaretStili; ipucu: string } | null {
  const a = fiyatAyrisimiOku(d);
  if (!a) return null;
  const fiyatlar = `Özel fiyat ${a.ozelMetni} · havuz liste fiyatı ${a.havuzMetni}`;
  const eylem = `üstteki «${HAVUZA_DON_EYLEMI}» düğmesine basın`;
  return {
    stil: SARI,
    ipucu: a.birimFarkli
      ? `${fiyatlar} — para birimleri farklı; havuz fiyatına geçmek için ${eylem}`
      : `${fiyatlar} — havuz fiyatı değişmiş; geçerli fiyatı bu hücreye yazın ya da ${eylem}`,
  };
}

/** `_fiyatAyrisik` sinyalinin okunmus hali (simgeli tutarlar). */
export interface OkunanFiyatAyrisimi {
  ozel: number;
  havuz: number;
  ozelMetni: string;
  havuzMetni: string;
  birimFarkli: boolean;
}

/**
 * K1/C3 sinyalinin TEK okuyucusu: hucre ipucu (`kutuphaneFiyatAyrisimi`) ve
 * marka sayfasinin «Havuz fiyatına dön» listesi (havuza-donus.ts) ayni
 * kuraldan beslenir. Sinyal yok ya da bozuksa null.
 */
export function fiyatAyrisimiOku(d: unknown): OkunanFiyatAyrisimi | null {
  const satir = d as {
    _fiyatAyrisik?: { ozel?: unknown; havuz?: unknown; ozelBirim?: unknown; havuzBirim?: unknown };
    _currency?: unknown;
  } | null | undefined;
  const a = satir?._fiyatAyrisik;
  if (!a || typeof a !== 'object') return null;
  const ozel = Number(a.ozel);
  const havuz = Number(a.havuz);
  if (a.ozel == null || a.havuz == null || !Number.isFinite(ozel) || !Number.isFinite(havuz)) return null;
  const satirBirimi = String(satir?._currency ?? 'TRY');
  const ozelBirim = typeof a.ozelBirim === 'string' ? a.ozelBirim : satirBirimi;
  const havuzBirim = typeof a.havuzBirim === 'string' ? a.havuzBirim : satirBirimi;
  return {
    ozel, havuz,
    ozelMetni: paraMetni(ozel, ozelBirim),
    havuzMetni: paraMetni(havuz, havuzBirim),
    birimFarkli: birimKodu(ozelBirim) !== birimKodu(havuzBirim),
  };
}
