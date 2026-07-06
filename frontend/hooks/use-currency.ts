'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '@/lib/api';
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
 * - Gosterim icin USD/EUR cevrimi CANLI TCMB kuru ile yapilir — backend
 *   /exchange-rates endpoint'i (TCMB today.xml, 1 saat cache, er-api fallback).
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
        // Backend TCMB servisi: { usdTry, eurTry, source, date }
        const { data } = await api.get<{ usdTry: number; eurTry: number }>('/exchange-rates');
        if (data?.usdTry && data.usdTry > 1) {
          // Ic temsil USD-bazli: TRY = TL/USD, EUR = EUR/USD
          setExchangeRates({
            TRY: data.usdTry,
            USD: 1,
            EUR: data.usdTry / data.eurTry,
          });
          setRatesLoaded(true);
        }
      } catch {
        // Fallback: keep defaults (TRY=1 — donusum kapali kalir)
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
