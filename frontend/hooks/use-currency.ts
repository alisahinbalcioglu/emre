'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Currency, ExchangeRates } from '@/types/quotes';

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  TRY: '\u20BA',
  USD: '$',
  EUR: '\u20AC',
};

/** Verilen tutari gecerli para birimi simgesi + binlik ayracli Turkce formatla. */
export function formatPrice(value: number, currency: Currency): string {
  const formatted = value.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${CURRENCY_SYMBOLS[currency]}${formatted}`;
}

export interface UseCurrencyResult {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  exchangeRates: ExchangeRates;
  ratesLoaded: boolean;
  /** TRY bazli taban fiyati gecerli para birimine cevirmek icin carpani. */
  conversionRate: number;
  /** TRY bazli tutari gecerli para biriminde bicimli string olarak dondurur. */
  displayPrice: (valueTRY: number) => string;
}

/**
 * Para birimi yonetimi hook'u.
 * - Uygulamada tum taban fiyatlar TRY saklanir.
 * - Gosterim icin USD/EUR cevrimi open.er-api.com kuruyla yapilir.
 * - API erisilemezse TRY=1 fallback kalir.
 */
export function useCurrency(): UseCurrencyResult {
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({
    TRY: 1,
    USD: 1,
    EUR: 1,
  });
  const [ratesLoaded, setRatesLoaded] = useState(false);

  useEffect(() => {
    async function fetchRates() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        if (data?.rates) {
          setExchangeRates({
            TRY: data.rates.TRY ?? 1,
            USD: 1,
            EUR: data.rates.EUR ?? 1,
          });
          setRatesLoaded(true);
        }
      } catch {
        // Fallback: keep defaults
      }
    }
    fetchRates();
  }, []);

  // TRY → hedef para birimi carpani
  const conversionRate = useMemo(() => {
    if (currency === 'TRY') return 1;
    const tryPerUsd = exchangeRates.TRY;
    if (currency === 'USD') return 1 / tryPerUsd;
    // EUR: TRY → USD → EUR
    const eurPerUsd = exchangeRates.EUR;
    return eurPerUsd / tryPerUsd;
  }, [currency, exchangeRates]);

  const displayPrice = useCallback(
    (valueTRY: number) => formatPrice(valueTRY * conversionRate, currency),
    [conversionRate, currency],
  );

  return { currency, setCurrency, exchangeRates, ratesLoaded, conversionRate, displayPrice };
}
