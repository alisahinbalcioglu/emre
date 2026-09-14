import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/**
 * TCMB canli doviz kuru servisi.
 *
 * Birincil kaynak: TCMB gunluk kur XML'i (today.xml — resmi, ucretsiz, key'siz).
 * Fallback: open.er-api.com (TCMB erisilemezse; hafta sonu/gece TCMB son is
 * gunu kurunu zaten doner, ama ag hatasina karsi ikinci kaynak sart).
 * Cache: 1 saat in-memory — TCMB gunde 1 kez (15:30) gunceller, daha sik
 * sorgulamak anlamsiz; binlerce eszamanli kullanicida TCMB'ye tek istek.
 */

export interface ExchangeRatesResult {
  /** 1 USD = usdTry TL (TCMB ForexSelling) */
  usdTry: number;
  /** 1 EUR = eurTry TL (TCMB ForexSelling) */
  eurTry: number;
  /** Alis kurlari (bilgi amacli) */
  usdTryBuying: number;
  eurTryBuying: number;
  source: 'tcmb' | 'er-api' | 'cache' | 'fallback';
  /** Kurun ait oldugu tarih (TCMB Tarih attribute'u veya fetch ani) */
  date: string;
  fetchedAt: string;
}

/** Eslestirmenin tanidigi para birimleri — kutuphane fiyatlari yalniz bunlarla TL'ye cevrilir. */
export type ParaBirimiKodu = 'TRY' | 'USD' | 'EUR';

const PARA_BIRIMI_YAZIMLARI: Record<string, ParaBirimiKodu> = {
  '': 'TRY', TRY: 'TRY', TL: 'TRY', '₺': 'TRY', YTL: 'TRY',
  USD: 'USD', $: 'USD', US$: 'USD', DOLAR: 'USD', DOLLAR: 'USD',
  EUR: 'EUR', '€': 'EUR', EURO: 'EUR', AVRO: 'EUR',
};

/**
 * Kutuphane satirinin para birimi metni → kanonik kod. Taninmayan (GBP, "£")
 * `null` — CAGIRAN O SATIRA FIYAT YAZMAZ.
 *
 * ⚠ NEDEN (para dogrulugu turu, 14.09 — KUR-02, olculdu): cevirici yalniz
 * birebir 'USD'/'EUR' taniyordu; 'EURO', '€', 'DOLAR' TCMB calisirken bile
 * 1:1 TL sayiliyordu. Isciligin "Para Birimi" kolonu serbest metin oldugu
 * icin bu kodlar arayuzden DB'ye yazilabiliyor. Bos/tanimsiz = TRY (eski
 * satirlar para birimi tasimaz).
 */
export function paraBirimiKodu(ham: unknown): ParaBirimiKodu | null {
  if (ham === null || ham === undefined) return 'TRY';
  const s = String(ham).trim().toUpperCase().replace(/\s+/g, '');
  return PARA_BIRIMI_YAZIMLARI[s] ?? null;
}

/** Yazma yollarinin DB'ye yazdigi kodlar — okuma tarafinin taniyip cevirdigi kume. */
export const YAZILABILIR_PARA_BIRIMLERI: readonly ParaBirimiKodu[] = ['TRY', 'USD', 'EUR'];

/**
 * YAZMA yolu (kutuphane / iscilik / admin kaydi) icin para birimi → kanonik
 * kod ya da RED nedeni. Okuma kurali `paraBirimiKodu` DEGISMEZ (eski satirlar).
 *
 *  - Alan HIC YOK (undefined) → `kod: undefined`: cagiran eski davranisini
 *    korur (olusturmada TRY, guncellemede mevcut deger). Arayuzler bos Para
 *    Birimi hucresinde alani gondermez (olculdu, 14.09).
 *  - null, '' ya da yalniz bosluk → RED: acikca gonderilmis bos deger.
 *  - Buyuk/kucuk harf ve bas/son bosluk kanonik: 'usd', ' USD ' → USD.
 *  - Baska her yazim RED — okuma tarafinin tanidigi EURO, $, TL dahil: DB'ye
 *    yalniz kanonik kod yazilir, ipucu verilir ("EUR" mi?).
 *
 * ⚠ NEDEN (tur 3 A3, 14.09, gercek HTTP yigininda olculdu): alti yazma ucunun
 * hicbiri 400 donmuyordu. 'EURO', '$', 'GBP', 'xyz' 201 ile ham yaziliyor,
 * admin commit '' yaziyor, iscilikte sayi 500 verip HAYALET liste birakiyordu.
 */
export function paraBirimiYazimi(ham: unknown): { kod: ParaBirimiKodu | undefined } | { neden: string } {
  if (ham === undefined) return { kod: undefined };
  const metin = ham === null ? '' : String(ham).trim();
  if (metin === '') return { neden: 'para birimi boş gönderildi' };
  const kod = YAZILABILIR_PARA_BIRIMLERI.find((k) => k === metin.toUpperCase());
  if (kod) return { kod };
  const tahmin = paraBirimiKodu(metin);
  return { neden: `para birimi "${metin}" tanınmadı${tahmin ? ` ("${tahmin}" mi?)` : ''}` };
}

/**
 * Satirlarin para birimini YAZIMDAN ONCE dogrular: biri bile gecersizse hicbir
 * satir yazilmadan 400 (liste/marka da acilmaz — cagiran bunu her yazimdan
 * once cagirir). Donus: satir sirasiyla kanonik kod (`undefined` = alan yok).
 */
export function paraBirimleriniDogrula<T>(
  satirlar: readonly T[],
  paraBirimi: (satir: T) => unknown,
  etiket: (satir: T, sira: number) => string,
): (ParaBirimiKodu | undefined)[] {
  const kodlar: (ParaBirimiKodu | undefined)[] = [];
  const hatalar: string[] = [];
  satirlar.forEach((satir, i) => {
    const y = paraBirimiYazimi(paraBirimi(satir));
    if ('kod' in y) kodlar.push(y.kod);
    else hatalar.push(`${etiket(satir, i)}: ${y.neden}`);
  });
  if (hatalar.length === 0) return kodlar;
  const liste = hatalar.length === 1
    ? hatalar[0]
    : `${hatalar.length} satırda para birimi geçersiz — ${hatalar.slice(0, 5).join(' · ')}${hatalar.length > 5 ? ` · … (+${hatalar.length - 5})` : ''}`;
  throw new BadRequestException(`${liste}. TRY, USD ya da EUR yazın; hiçbir satır kaydedilmedi.`);
}

/** Hata mesajindaki satir adi: 40 karakter, bossa yalniz sira. */
export function satirAdi(sira: string, ad: unknown): string {
  const a = String(ad ?? '').trim().slice(0, 40);
  return a ? `${sira} ("${a}")` : sira;
}

/**
 * Bu kur sonucuyla bu doviz TL'ye CEVRILEBILIR mi?
 *
 * ⚠ KUR-01 (kodla dogrulandi, 14.09): TCMB ve yedek kaynak dusup onbellek
 * bosken `getRates` hata firlatmaz, `usdTry = eurTry = 1` ve
 * `source: 'fallback'` doner. Bu deger GOSTERIM icin zararsizdi (on yuz
 * `usdTry > 1` sartiyla doviz dugmelerini kapatir), ama eslestirme cevirici
 * kaynaga bakmadigi icin 100 dolarlik kalemi 100 TL yaziyordu.
 * Kural: kaynak 'fallback' ise ya da kur 1'i gecmiyorsa kur YOKTUR. Esik
 * cikti (quotes.service `exportBirimi`) ve on yuz (use-currency) ile AYNI.
 */
export function kurGecerli(
  r: { usdTry?: number; eurTry?: number; source?: string } | null | undefined,
  kod: 'USD' | 'EUR',
): boolean {
  if (!r || r.source === 'fallback') return false;
  const kur = Number(kod === 'USD' ? r.usdTry : r.eurTry);
  return Number.isFinite(kur) && kur > 1;
}

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
const ERAPI_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

/**
 * NEGATIF ONBELLEK (tur 3 A4d, 14.09 — gercek servis ve gercek zamanla olculdu):
 * iki kaynak da ASILI kalinca (her biri 8 sn zaman asimi) HER getRates 16 sn
 * bekliyordu. Carpanlar: surukle-doldur 10 satir = 20 fetch ≈ 160 sn; tek
 * eslestirme isteginde her "bu markada yok" adi ayri getRates (2 ad = 32 sn).
 * Kural: yalniz UZUN suren (>= ASILI_ESIK_MS) basarisiz denemeden sonra
 * NEGATIF_TTL_MS boyunca aga cikilmaz — bayat basarili kur varsa o ('cache'),
 * yoksa 'fallback' (kurGecerli false: KUR-01 aynen gecerli). HIZLI hata (ag
 * yok, DNS) pencere ACMAZ, hemen yeniden denenir: kur donunce ayni servis
 * ornegi fiyatlar (kur-donmasi G1/G2). Her hatada pencere acan varyant G1+G2'yi
 * kiriyordu (olculdu).
 * Esik 4 sn: hizli hata 0,00 sn, tek kaynak asili 8,01 sn olculdu — ikisinin
 * arasi. TTL 60 sn: aktif kullanicida en kotu bekleme orani 16/(60+16) ≈ %21;
 * kaynak donunce en gec 60 sn sonra normale doner.
 */
const NEGATIF_TTL_MS = 60_000;
const ASILI_ESIK_MS = 4_000;

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private cache: ExchangeRatesResult | null = null;
  private cacheAt = 0;
  /** Es zamanli istekler tek fetch'i paylassin (thundering herd onlemi) */
  private inflight: Promise<ExchangeRatesResult> | null = null;
  /** Son ASILI basarisiz denemenin bitis ani (0 = pencere hic acilmadi). */
  private negatifAt = 0;
  /** Servis saati — test sahte saat baglar (gercek bekleme olmadan pencere olculur). */
  private simdi: () => number = () => Date.now();

  async getRates(): Promise<ExchangeRatesResult> {
    const now = this.simdi();
    if (this.cache && now - this.cacheAt < CACHE_TTL_MS) {
      return { ...this.cache, source: 'cache' };
    }
    // Negatif pencere: asili kaynaga yeniden gidilmez (bkz. NEGATIF_TTL_MS).
    if (this.negatifAt && now - this.negatifAt < NEGATIF_TTL_MS) {
      return this.cache ? { ...this.cache, source: 'cache' } : this.geriDusus();
    }
    if (this.inflight) return this.inflight;

    const basla = this.simdi();
    this.inflight = this.fetchFresh()
      .then((r) => {
        this.cache = r;
        this.cacheAt = this.simdi();
        return r;
      })
      .catch((e) => {
        this.logger.warn(`Kur cekilemedi: ${e?.message ?? e}`);
        if (this.simdi() - basla >= ASILI_ESIK_MS) this.negatifAt = this.simdi();
        // Eski cache varsa onu dondur (bayat kur > kur yok)
        if (this.cache) return { ...this.cache, source: 'cache' as const };
        return this.geriDusus();
      })
      .finally(() => { this.inflight = null; });

    return this.inflight;
  }

  /** Hic veri yok — 1:1 fallback (frontend TRY gosterir; `kurGecerli` false). */
  private geriDusus(): ExchangeRatesResult {
    return {
      usdTry: 1, eurTry: 1, usdTryBuying: 1, eurTryBuying: 1,
      source: 'fallback',
      date: new Date().toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
    };
  }

  private async fetchFresh(): Promise<ExchangeRatesResult> {
    // 1) TCMB
    try {
      const res = await fetch(TCMB_URL, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`TCMB HTTP ${res.status}`);
      const xml = await res.text();
      const parsed = this.parseTcmbXml(xml);
      if (parsed) {
        this.logger.log(`TCMB kur: USD=${parsed.usdTry} EUR=${parsed.eurTry} (${parsed.date})`);
        return parsed;
      }
      throw new Error('TCMB XML parse edilemedi');
    } catch (e: any) {
      this.logger.warn(`TCMB basarisiz (${e?.message}), er-api fallback deneniyor`);
    }

    // 2) Fallback: open.er-api.com
    const res = await fetch(ERAPI_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`er-api HTTP ${res.status}`);
    const data: any = await res.json();
    const tryRate = Number(data?.rates?.TRY);
    const eurRate = Number(data?.rates?.EUR);
    if (!tryRate || !eurRate) throw new Error('er-api eksik veri');
    return {
      usdTry: tryRate,
      eurTry: tryRate / eurRate,
      usdTryBuying: tryRate,
      eurTryBuying: tryRate / eurRate,
      source: 'er-api',
      date: new Date().toISOString().slice(0, 10),
      fetchedAt: new Date().toISOString(),
    };
  }

  /** TCMB today.xml'den USD/EUR ForexBuying/ForexSelling ayikla.
   *  Bagimliliksiz regex parse — XML sema sabit (Kod="USD"/"EUR"). */
  private parseTcmbXml(xml: string): ExchangeRatesResult | null {
    const pick = (code: string, field: 'ForexBuying' | 'ForexSelling'): number | null => {
      // <Currency ... Kod="USD" ...> ... <ForexSelling>34.1234</ForexSelling> ... </Currency>
      const block = xml.match(
        new RegExp(`<Currency[^>]*Kod="${code}"[\\s\\S]*?</Currency>`, 'i'),
      )?.[0];
      if (!block) return null;
      const raw = block.match(new RegExp(`<${field}>([\\d.,]+)</${field}>`, 'i'))?.[1];
      if (!raw) return null;
      const v = parseFloat(raw.replace(',', '.'));
      return Number.isFinite(v) && v > 0 ? v : null;
    };

    const usdSell = pick('USD', 'ForexSelling');
    const eurSell = pick('EUR', 'ForexSelling');
    if (!usdSell || !eurSell) return null;
    const usdBuy = pick('USD', 'ForexBuying') ?? usdSell;
    const eurBuy = pick('EUR', 'ForexBuying') ?? eurSell;
    const date = xml.match(/Tarih="([^"]+)"/)?.[1] ?? new Date().toISOString().slice(0, 10);

    return {
      usdTry: usdSell,
      eurTry: eurSell,
      usdTryBuying: usdBuy,
      eurTryBuying: eurBuy,
      source: 'tcmb',
      date,
      fetchedAt: new Date().toISOString(),
    };
  }
}
