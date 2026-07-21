'use client';

/**
 * DEV TEST HARNESS — /dev/grid-test (yalniz development)
 *
 * ExcelGrid'i AUTH'SUZ ve API'SIZ calistirir: eslestirme mock'lanir.
 * Amac: K15-K19 (surukle-doldur + anahtar) ve K9 (popup nesne baglama)
 * mekaniklerinin elle/e2e dogrulanabilmesi. Backend'e istek ATILMAZ.
 *
 * Mock fiyat tablosu (kaynak fiyat KOPYALANMADIGINI kanitlar — K17):
 *   6'' → 600 · 4'' → 400 · 3'' → 300 · 3/4'' → 75
 *   2'' → markada YOK (K16) · 1'' → 2 aday, secim gerekli
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ExcelGrid } from '@/components/excel-grid/ExcelGrid';
import type { ExcelGridData, MatchCandidate } from '@/components/excel-grid/types';

// Loglar REACT DISI tutulur (window.__olay): setState her sorguda parent'i
// re-render edip AG Grid hucrelerini remount ettiriyordu → popup state'i
// ucuyordu. Canli sayfada handler'lar memoize oldugu icin bu tuzak yok.
declare global { interface Window { __olay?: string[] } }
const kaydet = (m: string) => {
  if (typeof window === 'undefined') return;
  (window.__olay = window.__olay ?? []).push(m);
  console.log('[GridTest]', m);
};

const CAP_FIYAT: Record<string, number> = { "6''": 600, "4''": 400, "3''": 300, "3/4''": 75, "5''": 500, "8''": 800 };

function aday(materialName: string, label: string, netPrice: number, variantTags: string[]): MatchCandidate {
  return {
    materialName, netPrice, listPrice: netPrice, discount: 0,
    tags: [], popular: false, label, surfaceLevel: true, variantTags,
  };
}

export default function GridTestPage() {
  const [autoVariant, setAutoVariant] = useState(false); // KAPALI baslar — K15 oto-ACILMA kaniti
  const cagriSayisi = useRef(0);
  const log = kaydet;

  const data: ExcelGridData = useMemo(() => {
    const sys = {
      _malzKar: 0, _iscKar: 0, _marka: null, _firma: null, _matNetPrice: 0, _merges: {},
      _matBirim: '', _matToplam: '', _labBirim: '', _labToplam: '', _toplam: '', _labNetPrice: 0,
    };
    const satir = (i: number, no: string, ad: string, mik: string, veri = true, baslik = false) => ({
      _rowIdx: i, _isDataRow: veri, _isHeaderRow: baslik, ...sys,
      col0: no, col1: ad, col2: mik, col3: veri ? 'mt' : '',
    });
    return {
      columnDefs: [
        { field: 'col0', headerName: 'No', width: 60, editable: true },
        { field: 'col1', headerName: 'Malzeme Adı', width: 300, editable: true },
        { field: 'col2', headerName: 'Miktar', width: 80, editable: true },
        { field: 'col3', headerName: 'Birim', width: 70, editable: true },
        { field: '_malzKar', headerName: 'Malz. Kar %', width: 85, editable: true },
        { field: '_marka', headerName: 'Malz. Marka', width: 150, cellRenderer: 'brandRenderer' },
        { field: '_matBirim', headerName: 'Malz. Birim Fiyat', width: 120, editable: true },
        { field: '_matToplam', headerName: 'Malz. Toplam', width: 120, editable: false },
        { field: '_toplam', headerName: 'Toplam', width: 120, editable: false },
      ],
      rowData: [
        satir(0, 'No', 'Malzeme Adı', 'Miktar', false, true),
        satir(1, '', 'Siyah Çelik Boru TS EN 10255', '', false),
        satir(2, '1', "6'' Siyah Boru", '286'),
        satir(3, '2', "4'' Siyah Boru", '268'),
        satir(4, '3', "3'' Siyah Boru", '102'),
        satir(5, '4', "2'' Siyah Boru", '564'),
        satir(6, '5', "1'' Siyah Boru", '872'),
        satir(7, '6', "3/4'' Siyah Boru", '12'),
        // D9 (denetim): 8 satirlik surukleme kapsami icin ek caplar
        satir(8, '7', "5'' Siyah Boru", '40'),
        satir(9, '8', "8'' Siyah Boru", '22'),
        // D14 (denetim): sorgusu AG HATASI firlatan satir
        satir(10, '9', "HATALI 7'' Boru", '5'),
      ],
      columnRoles: {
        nameField: 'col1', noField: 'col0', quantityField: 'col2', unitField: 'col3',
        materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam', grandTotalField: '_toplam',
      },
      brands: [],
      headerEndRow: 0,
    };
  }, []);

  const onBrandChange = useCallback(async (rowIdx: number, brandId: string, materialName: string, opts?: { variantTags?: string[]; silent?: boolean }) => {
    cagriSayisi.current++;
    const vt = opts?.variantTags?.join(',') ?? '-';
    log(`#${cagriSayisi.current} sorgu: satir=${rowIdx} "${materialName.slice(0, 30)}" varyant=[${vt}]`);

    // D14 (denetim): ag hatasi simulasyonu — sorgu FIRLATIR (fetch reject esdegeri)
    if (materialName.includes('HATALI')) { log('AG HATASI firlatildi'); throw new Error('ağ hatası (mock)'); }

    // K16: 2'' bu markada YOK
    if (materialName.includes("2''")) return { netPrice: 0, confidence: 'none', reason: 'Bu markada 2" yok.' };

    // K-sart 4: 1'' → marka+cins sonrasi HALA 2 urun (secim gerekli)
    if (materialName.includes("1''")) {
      return {
        netPrice: 0, confidence: 'multi',
        candidates: [
          aday("Çelik boru · siyah · vidalı · 1\"", 'vidalı', 95, ['v:10255']),
          aday("Çelik boru · siyah · düz uçlu · 1\"", 'düz uçlu', 100, ['v:10255']),
        ],
        reason: '2 seçenek',
      } as any;
    }

    // EN UZUN eslesme kazanir: "3/4''" icinde "4''" gecer — kisa anahtar yanlis yakalar
    const cap = Object.keys(CAP_FIYAT).sort((a, b) => b.length - a.length).find((c) => materialName.includes(c));
    const fiyat = cap ? CAP_FIYAT[cap] : 0;

    // Varyant verildiyse (fill/grup yayilimi): kendi cap fiyatiyla TEK eslesme
    if (opts?.variantTags?.length) {
      return { netPrice: fiyat, confidence: 'suggestion', autoVariant: true, matchedName: `Çelik boru · siyah · ${cap}` } as any;
    }

    // Ilk secim (6'' kaynak satir): K9 icin 2 GRUPLU soru
    return {
      netPrice: 0, confidence: 'multi',
      candidates: [
        aday(`Çelik boru · TS EN 10255 · siyah · ${cap}`, 'Su ve Yangın Tesisat Boruları (TS EN 10255)', fiyat, ['v:10255']),
        aday(`Çelik boru · TS EN 10217-1 · siyah · ${cap}`, 'Basınçlı Borular (TS EN 10217-1)', fiyat - 45, ['v:10217']),
      ],
      reason: '2 grup',
    } as any;
  }, []);

  const onAutoVariantChange = useCallback((v: boolean) => {
    setAutoVariant(v);
    kaydet(`ANAHTAR → ${v ? 'AÇIK' : 'KAPALI'}`);
  }, []);
  const onAutoVariantApplied = useCallback(({ applied, waiting, missing, kaynak }: { applied: number; waiting: number; missing: number; kaynak: string }) => {
    kaydet(`YAYILIM: ${applied} yazıldı · ${waiting} seçim bekliyor · ${missing} yok (kaynak: ${kaynak})`);
  }, []);

  if (process.env.NODE_ENV === 'production') {
    return <div style={{ padding: 24 }}>Bu sayfa yalnız development ortamında çalışır.</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontWeight: 700, marginBottom: 4 }}>🧪 Grid Test — K15-K19 / K9 (mock, API'siz)</h1>
      <div data-testid="switch-state" style={{ fontSize: 13, marginBottom: 8 }}>
        Anahtar durumu: <b>{autoVariant ? 'AÇIK' : 'KAPALI'}</b>
      </div>
      <ExcelGrid
        data={data}
        brands={useMemo(() => [{ id: 'b-ayvaz', name: 'AYVAZ' }, { id: 'b-sardogan', name: 'SARDOĞAN' }], [])}
        onBrandChange={onBrandChange as any}
        autoVariantEnabled={autoVariant}
        onAutoVariantChange={onAutoVariantChange}
        onAutoVariantApplied={onAutoVariantApplied}
        mode="quote"
        currencySymbol="₺"
        conversionRate={1}
      />
      <div style={{ marginTop: 10, fontSize: 11, color: '#64748b' }}>
        Olay logu: konsolda <code>[GridTest]</code> ve <code>window.__olay</code> içinde.
      </div>
    </div>
  );
}
