// ============================================================
// PARA BIRIMI GOSTERIMI — saf kurallar (React/API yok)
//
// `use-currency.ts` kancasi bunlari kullanir; ayri dosyada durmalarinin
// sebebi vitest: kanca `@/ortak/lib/api` alias'i ile HTTP istemcisini
// import eder ve vitest.config '@/' alias'i tanimlamaz (pricing.ts:23 ile
// ayni kisit). Kural burada koşulabilir kalir.
// ============================================================
import type { Currency, ExchangeRates } from '@/ortak/types/quotes';

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
};

/** Para simgesi — gosterimde TEK kaynak (sayfalar kendi ucluleri yerine bunu kullanir). */
export function paraSimgesi(c: Currency): string {
  return CURRENCY_SYMBOLS[c] ?? CURRENCY_SYMBOLS.TRY;
}

/**
 * GOSTERIM para birimi: kur YUKLENMEDEN doviz gosterilmez.
 *
 * ⚠ KUR-01 ikizi (para dogrulugu turu, 14.09 — olculdu): kayitli teklif
 * USD/EUR ise detay sayfasi para birimini hemen `setCurrency` ile ayarliyordu.
 * Kur henuz gelmemisse (ya da kur servisi 1:1 geri dustuyse) carpan 1 kaliyor,
 * hucreler TL tutari "$4.735,00" diye gosteriyordu — kullanici TL rakami dolar
 * saniyordu. Eslestirme yolu kur yokken fiyat yazmiyor; gosterim de ayni
 * karari verir: kur yoksa TL gosterilir. Secili birim (kayit) DEGISMEZ — kur
 * gelince gosterim kendiliginden secili birime gecer.
 */
export function gosterimParaBirimi(secili: Currency, ratesLoaded: boolean): Currency {
  return ratesLoaded ? secili : 'TRY';
}

/** `GET /exchange-rates` yanitinin gosterimde okunan alanlari. */
export interface KurYaniti {
  usdTry: number;
  eurTry: number;
  /** Backend `kurGecerli` karari (C10); eski backend gondermez. */
  gecerli?: boolean;
}

/**
 * KUR KULLANILABILIR MI — kanca (`use-currency.ts`) ve ust cubuk kur kutusu
 * (`app/(protected)/layout.tsx`) AYNI kurali cagirir.
 *
 * ⚠ C10 (Paket 4a, 01.10.2026 — Emre karari): 5 is gununden eski kur
 * GECERSIZDIR; karar backend'in `kurGecerli` kuralidir ve yanitta `gecerli`
 * alaniyla gelir — esik burada TUTULMAZ. Gecersizken eslestirme doviz satirina
 * fiyat yazmaz, teklif ciktisi TL iner; ekran da TL gosterir (inceleme: bayat
 * kurla "ekran $, dosya ₺"). Alan yoksa (eski backend) yalniz KUR-01 denetimi:
 * kur > 1 (1:1 geri dusus kullanilmaz).
 */
export function kurKullanilabilir(r: Partial<KurYaniti> | null | undefined): r is KurYaniti {
  return !!r && typeof r.usdTry === 'number' && r.usdTry > 1 &&
    typeof r.eurTry === 'number' && r.eurTry > 1 && r.gecerli !== false;
}

/** TRY → hedef para birimi carpani. Kur tablosu USD-bazlidir (TRY = TL/USD, EUR = EUR/USD). */
export function donusumCarpani(hedef: Currency, rates: ExchangeRates): number {
  if (hedef === 'TRY') return 1;
  const tryPerUsd = rates.TRY;
  if (hedef === 'USD') return 1 / tryPerUsd;
  return rates.EUR / tryPerUsd; // EUR: TRY → USD → EUR
}
