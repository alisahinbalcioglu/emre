'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '@/ortak/lib/api';
import type { Currency, ExchangeRates } from '@/ortak/types/quotes';

import { CURRENCY_SYMBOLS, gosterimParaBirimi, donusumCarpani } from './para-gosterim';

// Saf gosterim kurallari para-gosterim.ts'te (vitest'te kosulabilsin diye);
// sayfalar mevcut import yolunu kullanmaya devam edebilsin.
export { paraSimgesi, gosterimParaBirimi, donusumCarpani } from './para-gosterim';

/** Verilen tutari gecerli para birimi simgesi + binlik ayracli Turkce formatla. */
export function formatPrice(value: number, currency: Currency): string {
  const formatted = value.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${CURRENCY_SYMBOLS[currency]}${formatted}`;
}

export interface UseCurrencyResult {
  /** Kullanicinin SECTIGI (ve teklifte kayitli) birim — gosterim icin KULLANMA. */
  currency: Currency;
  /** Ekranda GORUNEN birim: kur yuklenmediyse TRY (bkz. gosterimParaBirimi). */
  gosterimCurrency: Currency;
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

  // Carpan ve simge GOSTERIM biriminden turer — kur yoksa TL (KUR-01 ikizi).
  const gosterimCurrency = gosterimParaBirimi(currency, ratesLoaded);
  const conversionRate = useMemo(
    () => donusumCarpani(gosterimCurrency, exchangeRates),
    [gosterimCurrency, exchangeRates],
  );

  const displayPrice = useCallback(
    (valueTRY: number) => formatPrice(valueTRY * conversionRate, gosterimCurrency),
    [conversionRate, gosterimCurrency],
  );

  return { currency, gosterimCurrency, setCurrency, exchangeRates, ratesLoaded, conversionRate, displayPrice };
}
