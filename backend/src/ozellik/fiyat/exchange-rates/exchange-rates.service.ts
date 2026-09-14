import { Injectable, Logger } from '@nestjs/common';

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

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private cache: ExchangeRatesResult | null = null;
  private cacheAt = 0;
  /** Es zamanli istekler tek fetch'i paylassin (thundering herd onlemi) */
  private inflight: Promise<ExchangeRatesResult> | null = null;

  async getRates(): Promise<ExchangeRatesResult> {
    const now = Date.now();
    if (this.cache && now - this.cacheAt < CACHE_TTL_MS) {
      return { ...this.cache, source: 'cache' };
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchFresh()
      .then((r) => {
        this.cache = r;
        this.cacheAt = Date.now();
        return r;
      })
      .catch((e) => {
        this.logger.warn(`Kur cekilemedi: ${e?.message ?? e}`);
        // Eski cache varsa onu dondur (bayat kur > kur yok)
        if (this.cache) return { ...this.cache, source: 'cache' as const };
        // Hic veri yok — 1:1 fallback (frontend TRY gosterir)
        return {
          usdTry: 1, eurTry: 1, usdTryBuying: 1, eurTryBuying: 1,
          source: 'fallback' as const,
          date: new Date().toISOString().slice(0, 10),
          fetchedAt: new Date().toISOString(),
        };
      })
      .finally(() => { this.inflight = null; });

    return this.inflight;
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
