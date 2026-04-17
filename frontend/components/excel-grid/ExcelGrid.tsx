'use client';

import React, { useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams, CellValueChangedEvent, GetRowIdParams } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import './fill-handle.css';
import type { ExcelGridData, ExcelRowData, MatchCandidate } from './types';
import { useFillHandle, FillHandleIndicator } from './useFillHandle';
import { CustomDropdown } from './CustomDropdown';

// AG-Grid Community modules'leri kaydet (v32+)
ModuleRegistry.registerModules([AllCommunityModule]);

interface Brand {
  id: string;
  name: string;
}

interface LaborFirm {
  id: string;
  name: string;
  discipline: 'mechanical' | 'electrical';
}

interface Props {
  data: ExcelGridData;
  brands: Brand[];
  title?: string;
  onBrandChange: (rowIdx: number, brandId: string, materialName: string) => Promise<{
    netPrice: number;
    matchedName?: string;
    candidates?: MatchCandidate[];
    reason?: string;
  } | null>;
  // Iscilik tarafi
  laborFirms?: LaborFirm[];
  sheetDiscipline?: 'mechanical' | 'electrical' | null;
  laborEnabled?: boolean;
  onFirmaChange?: (rowIdx: number, firmaId: string, laborName: string) => Promise<{
    netPrice: number;
    matchedName?: string;
    candidates?: MatchCandidate[];
    reason?: string;
  } | null>;
  // Hucre duzenleme sonrasi disariya canli rowData'yi yayar (fiyat listesi yuklemede kullanilir)
  onRowDataChange?: (rows: ExcelRowData[]) => void;
  // Mod: 'quote' (teklif — brand/firma dropdown + kar %) veya 'library' (iskonto + net fiyat)
  mode?: 'quote' | 'library';
  // library mode'da hangi fiyat alanini kullanir? (material veya labor)
  libraryPriceField?: 'materialUnitPriceField' | 'laborUnitPriceField';
  currencySymbol: string;
  conversionRate: number;
}

// ────────────────────────────────────────────
// Brand / Firma cell renderers
// ────────────────────────────────────────────

function BrandDropdown(props: ICellRendererParams & {
  brands: Brand[];
  onBrandChange: Props['onBrandChange'];
  nameField?: string;
  noField?: string;
  brandField?: string;
  quantityField?: string;
  materialUnitPriceField?: string;
  materialTotalField?: string;
}) {
  const { data, brands, onBrandChange, nameField, noField, brandField, quantityField, materialUnitPriceField, materialTotalField, api, node } = props;
  const [candidates, setCandidates] = React.useState<MatchCandidate[] | null>(null);
  const [popupPos, setPopupPos] = React.useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  if (!data?._isDataRow) return null;

  // Fiyati hucrelere yaz (helper)
  const writePrice = (netPrice: number) => {
    const kar = parseFloat(String(data._malzKar ?? 0)) || 0;
    const finalPrice = netPrice * (1 + kar / 100);
    const qty = quantityField ? parseFloat(String(data[quantityField] ?? 0)) || 0 : 0;
    const total = finalPrice * qty;

    // AG-Grid sutun tipi string — number degeri reddediyor (warning #135)
    // toFixed(2) ile string olarak yaz, ayrica floating point precision fix
    node.setDataValue('_matNetPrice', netPrice);
    if (materialUnitPriceField) node.setDataValue(materialUnitPriceField, finalPrice.toFixed(2));
    if (materialTotalField) node.setDataValue(materialTotalField, total.toFixed(2));

    console.log(`[BrandDropdown] row=${data._rowIdx}, net=${netPrice}, kar=${kar}%, final=${finalPrice.toFixed(2)}, qty=${qty}, total=${total.toFixed(2)}`);
  };

  const handleChange = async (brandId: string) => {
    node.setDataValue('_marka', brandId || null);
    setCandidates(null);
    if (!brandId) {
      node.setDataValue('_matNetPrice', 0);
      if (materialUnitPriceField) node.setDataValue(materialUnitPriceField, '');
      if (materialTotalField) node.setDataValue(materialTotalField, '');
      return;
    }

    const currentName = nameField ? String(data[nameField] ?? '').trim() : '';
    if (!currentName) return;

    // 3 ASAMALI MATCHING: once malzeme adi, sonra baslik+malzeme, sonra secenek
    const fullName = buildMaterialContext(api, node.rowIndex ?? 0, nameField, noField, brandField);

    // Asama 1: Sadece malzeme adi ile dene
    console.log(`[BrandDropdown] row=${data._rowIdx}, Asama1 currentName="${currentName}"`);
    let result = await onBrandChange(data._rowIdx, brandId, currentName);

    // Asama 2: Eslesme yoksa veya fiyat 0, baslik+malzeme ile dene (farkliysa)
    if ((!result || result.netPrice <= 0) && fullName && fullName !== currentName) {
      console.log(`[BrandDropdown] row=${data._rowIdx}, Asama2 fullName="${fullName}"`);
      const result2 = await onBrandChange(data._rowIdx, brandId, fullName);
      if (result2 && result2.netPrice > 0) {
        result = result2;
      } else if (result2 && result2.candidates && result2.candidates.length > 0) {
        result = result2; // multi-candidate Asama 2'den
      }
    }

    // Multi case — kullaniciya secenek sun (Portal ile body'e render)
    if (result && result.candidates && result.candidates.length > 0) {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPopupPos({ top: rect.bottom + 2, left: rect.left });
      }
      setCandidates(result.candidates);
      return;
    }

    // Tek eslesme — fiyat yaz
    if (result && result.netPrice > 0) {
      writePrice(result.netPrice);
      return;
    }

    // Hic eslesme yok
    node.setDataValue('_matNetPrice', 0);
    if (materialUnitPriceField) node.setDataValue(materialUnitPriceField, '');
    if (materialTotalField) node.setDataValue(materialTotalField, '');
  };

  const handleCandidateSelect = (c: MatchCandidate) => {
    writePrice(c.netPrice);
    setCandidates(null);
    setPopupPos(null);
  };

  const handleCancel = () => {
    setCandidates(null);
    setPopupPos(null);
    node.setDataValue('_marka', null);
  };

  const brandOptions = React.useMemo(() =>
    brands.map((b) => ({ value: b.id, label: b.name })),
    [brands],
  );

  return (
    <div className="fill-handle-cell" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
      <CustomDropdown
        value={data._marka ?? ''}
        options={brandOptions}
        placeholder="Marka sec..."
        onChange={handleChange}
        variant="brand"
      />
      {candidates && candidates.length > 0 && popupPos && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed',
          top: popupPos.top,
          left: popupPos.left,
          zIndex: 99999,
          background: '#fffbeb',
          border: '2px solid #f59e0b',
          borderRadius: 6,
          padding: 8,
          minWidth: 260,
          maxWidth: 400,
          maxHeight: 320,
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 6, fontSize: 13 }}>
            ⚠ Secin ({candidates.length} aday)
          </div>
          {candidates.map((c, i) => (
            <button
              key={i}
              onClick={() => handleCandidateSelect(c)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                border: '1px solid #e5e7eb',
                background: 'white',
                cursor: 'pointer',
                fontSize: 12,
                borderRadius: 4,
                marginBottom: 4,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#dbeafe';
                e.currentTarget.style.borderColor = '#3b82f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              <div style={{ fontWeight: 600 }}>{c.popular && '★ '}{c.label}</div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>{c.netPrice.toFixed(2)} TL</div>
            </button>
          ))}
          <button
            onClick={handleCancel}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'center',
              padding: '6px',
              border: '1px solid #e5e7eb',
              background: '#f9fafb',
              cursor: 'pointer',
              fontSize: 11,
              color: '#6b7280',
              borderRadius: 4,
              marginTop: 4,
            }}
          >
            Iptal
          </button>
        </div>,
        document.body,
      )}
      <FillHandleIndicator field="_marka" value={data._marka ?? ''} rowIdx={data._rowIdx} />
    </div>
  );
}

function FirmaDropdown(props: ICellRendererParams & {
  laborFirms: LaborFirm[];
  sheetDiscipline?: 'mechanical' | 'electrical' | null;
  laborEnabled?: boolean;
  onFirmaChange?: Props['onFirmaChange'];
  nameField?: string;
  noField?: string;
  brandField?: string;
  quantityField?: string;
  laborUnitPriceField?: string;
  laborTotalField?: string;
}) {
  const {
    data, laborFirms, sheetDiscipline, laborEnabled, onFirmaChange,
    nameField, noField, brandField, quantityField, laborUnitPriceField, laborTotalField,
    api, node,
  } = props;
  const [candidates, setCandidates] = React.useState<MatchCandidate[] | null>(null);
  const [popupPos, setPopupPos] = React.useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  if (!data?._isDataRow) return null;

  // Disipline gore filtrelenmis firma listesi
  const filteredFirms = sheetDiscipline
    ? laborFirms.filter((f) => f.discipline === sheetDiscipline)
    : laborFirms;

  // Capability yok / disabled
  if (!laborEnabled) {
    return (
      <span
        title="Iscilik icin Pro paket gerekli"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 8px', borderRadius: 4,
          fontSize: 10, fontWeight: 500, fontStyle: 'italic',
          background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0',
        }}
      >
        Pro Gerekli
      </span>
    );
  }

  if (!sheetDiscipline) {
    return (
      <span
        title="Once sheet disiplinini sec"
        style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '0 6px', fontSize: 11, color: '#9ca3af' }}
      >
        Disiplin?
      </span>
    );
  }

  const writeLaborPrice = (netPrice: number) => {
    const kar = parseFloat(String(data._iscKar ?? 0)) || 0;
    const finalPrice = netPrice * (1 + kar / 100);
    const qty = quantityField ? parseFloat(String(data[quantityField] ?? 0)) || 0 : 0;
    const total = finalPrice * qty;

    node.setDataValue('_labNetPrice', netPrice);
    if (laborUnitPriceField) node.setDataValue(laborUnitPriceField, finalPrice.toFixed(2));
    if (laborTotalField) node.setDataValue(laborTotalField, total.toFixed(2));
    console.log(`[FirmaDropdown] row=${data._rowIdx}, net=${netPrice}, kar=${kar}%, final=${finalPrice.toFixed(2)}, qty=${qty}`);
  };

  const handleChange = async (firmaId: string) => {
    node.setDataValue('_firma', firmaId || null);
    setCandidates(null);
    if (!firmaId) {
      node.setDataValue('_labNetPrice', 0);
      if (laborUnitPriceField) node.setDataValue(laborUnitPriceField, '');
      if (laborTotalField) node.setDataValue(laborTotalField, '');
      return;
    }

    const currentName = nameField ? String(data[nameField] ?? '').trim() : '';
    if (!currentName || !onFirmaChange) return;

    // 3 ASAMALI MATCHING: once malzeme adi, sonra baslik+malzeme
    const fullName = buildMaterialContext(api, node.rowIndex ?? 0, nameField, noField, brandField);

    // Asama 1
    let result = await onFirmaChange(data._rowIdx, firmaId, currentName);

    // Asama 2
    if ((!result || result.netPrice <= 0) && fullName && fullName !== currentName) {
      const result2 = await onFirmaChange(data._rowIdx, firmaId, fullName);
      if (result2 && (result2.netPrice > 0 || (result2.candidates && result2.candidates.length > 0))) {
        result = result2;
      }
    }

    if (result && result.candidates && result.candidates.length > 0) {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPopupPos({ top: rect.bottom + 2, left: rect.left });
      }
      setCandidates(result.candidates);
      return;
    }

    if (result && result.netPrice > 0) {
      writeLaborPrice(result.netPrice);
      return;
    }

    node.setDataValue('_labNetPrice', 0);
    if (laborUnitPriceField) node.setDataValue(laborUnitPriceField, '');
    if (laborTotalField) node.setDataValue(laborTotalField, '');
  };

  const handleCandidateSelect = (c: MatchCandidate) => {
    writeLaborPrice(c.netPrice);
    setCandidates(null);
    setPopupPos(null);
  };

  const firmaOptions = filteredFirms.map((f) => ({ value: f.id, label: f.name }));

  return (
    <div className="fill-handle-cell" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
      <CustomDropdown
        value={data._firma ?? ''}
        options={firmaOptions}
        placeholder="Firma sec..."
        onChange={handleChange}
        variant="firma"
      />
      {candidates && candidates.length > 0 && popupPos && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', top: popupPos.top, left: popupPos.left, zIndex: 99999,
          background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 6, padding: 8,
          minWidth: 260, maxWidth: 400, maxHeight: 320, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 6, fontSize: 13 }}>
            ⚠ Iscilik Sec ({candidates.length} aday)
          </div>
          {candidates.map((c, i) => (
            <button
              key={i}
              onClick={() => handleCandidateSelect(c)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer',
                fontSize: 12, borderRadius: 4, marginBottom: 4,
              }}
            >
              <div style={{ fontWeight: 600 }}>{c.popular && '★ '}{c.label}</div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>{c.netPrice.toFixed(2)} TL</div>
            </button>
          ))}
        </div>,
        document.body,
      )}
      <FillHandleIndicator field="_firma" value={data._firma ?? ''} rowIdx={data._rowIdx} />
    </div>
  );
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

// Bir metinden cap (DN) kodu cikarir — frontend sanity check icin
function extractCapFromText(text: string): string | null {
  if (!text) return null;
  // Unicode kesirleri ASCII'ye cevir
  let normalized = text
    .replace(/2½/g, '2 1/2').replace(/1½/g, '1 1/2').replace(/1¼/g, '1 1/4')
    .replace(/½/g, '1/2').replace(/¼/g, '1/4').replace(/¾/g, '3/4')
    .toLowerCase();

  const inchToDn: Record<string, string> = {
    '1/2': 'dn15', '3/4': 'dn20', '1': 'dn25',
    '1 1/4': 'dn32', '1 1/2': 'dn40', '2': 'dn50',
    '2 1/2': 'dn65', '3': 'dn80', '4': 'dn100',
    '5': 'dn125', '6': 'dn150', '8': 'dn200',
  };

  // DN kodu varsa direkt kullan
  const dnMatch = normalized.match(/dn\s*(\d+)/);
  if (dnMatch) return `dn${dnMatch[1]}`;

  // Tum inc olculeri bul, EN SON kullaniyani al (gercek malzeme cap'i sonda olur)
  const matches: { value: string; index: number }[] = [];
  // 2 1/2", 1 1/4" gibi bilesik kesirler
  const compoundRegex = /(\d+)\s+(\d+)\/(\d+)/g;
  let m;
  while ((m = compoundRegex.exec(normalized)) !== null) {
    matches.push({ value: `${m[1]} ${m[2]}/${m[3]}`, index: m.index });
  }
  // 1/2", 3/4" gibi tek kesirler (ama compound'un parcasi olmamali)
  const fractionRegex = /(?<!\d\s)(\d+)\/(\d+)/g;
  while ((m = fractionRegex.exec(normalized)) !== null) {
    // Compound'un icindeyse atla
    const overlap = matches.some(x => x.index <= m!.index && x.index + x.value.length >= m!.index + m![0].length);
    if (!overlap) matches.push({ value: `${m[1]}/${m[2]}`, index: m.index });
  }
  // 1", 2", 3" gibi tam sayilar
  const intRegex = /(\d+)"/g;
  while ((m = intRegex.exec(normalized)) !== null) {
    const overlap = matches.some(x => x.index <= m!.index && x.index + x.value.length >= m!.index + m![0].length);
    if (!overlap) matches.push({ value: m[1], index: m.index });
  }

  if (matches.length === 0) return null;
  // En son bulunan cap (en yuksek index) — gercek malzeme adi sonda olur
  matches.sort((a, b) => b.index - a.index);
  const lastCap = matches[0].value;
  return inchToDn[lastCap] ?? null;
}

function buildMaterialContext(
  api: any,
  rowIdx: number,
  nameField?: string,
  noField?: string,
  brandField?: string,
): string {
  if (!nameField) return '';
  const currentNode = api.getDisplayedRowAtIndex(rowIdx);
  if (!currentNode) return '';
  const currentName = String(currentNode.data[nameField] ?? '').trim();
  if (!currentName) return '';

  if (!noField) return currentName;

  // Ust satirlara bak — data row'lari, aciklama satirlarini ve brand dolu malzeme satirlarini ATLA
  // Sadece GERCEK grup basligini bul: brand BOS + noField dolu + isim dolu
  let foundParent: string | null = null;
  for (let i = rowIdx - 1; i >= 0; i--) {
    const prev = api.getDisplayedRowAtIndex(i);
    if (!prev) continue;

    // Data row'lari atla
    if (prev.data._isDataRow) continue;

    const prevNo = String(prev.data[noField] ?? '').trim();
    const prevName = String(prev.data[nameField] ?? '').trim();
    const prevBrand = brandField ? String(prev.data[brandField] ?? '').trim() : '';

    // Brand dolu ise bu bir malzeme satiri (muhtemelen miktarsiz) — grup basligi DEGIL, atla
    if (prevBrand.length > 0) continue;

    // noField dolu + isim dolu + brand bos = gercek grup basligi
    if (prevNo.length > 0 && prevName.length > 2) {
      foundParent = prevName;
      break;
    }
  }

  if (!foundParent) return currentName;

  // KATMAN 1 SAVUNMA: Cap Sanity Check
  // Parent + currentName birlestirildiğinde, cap currentName'in cap'i ile AYNI olmali
  // Eger parent farkli bir cap iceriyorsa (felaket onleme), parent kullanma
  const fullName = `${foundParent} ${currentName}`;
  const currentCap = extractCapFromText(currentName);
  const fullCap = extractCapFromText(fullName);
  const parentCap = extractCapFromText(foundParent);

  // Eger parent'in icinde cap varsa VE bu currentName'in cap'iyle FARKLIYSA, parent'i ATLA
  if (parentCap && currentCap && parentCap !== currentCap) {
    console.warn(`[buildMaterialContext] Cap mismatch! parent="${foundParent}" (${parentCap}), current="${currentName}" (${currentCap}). Sadece currentName kullanildi.`);
    return currentName;
  }

  // Eger fullName'in cap'i currentName'in cap'inden FARKLIYSA (regex hatasi), guvenli yola dus
  if (currentCap && fullCap && currentCap !== fullCap) {
    console.warn(`[buildMaterialContext] Full cap mismatch! current=${currentCap}, full=${fullCap}. Sadece currentName kullanildi.`);
    return currentName;
  }

  return fullName;
}

// ────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────

export interface ExcelGridHandle {
  /** Aktif grid'den guncel tum row'lari dondurur */
  getRowData(): ExcelRowData[];
}

export const ExcelGrid = forwardRef<ExcelGridHandle, Props>(function ExcelGrid({
  data, brands, onBrandChange,
  laborFirms = [], sheetDiscipline = null, laborEnabled = false, onFirmaChange,
  onRowDataChange,
  mode = 'quote',
  libraryPriceField = 'materialUnitPriceField',
  currencySymbol, conversionRate,
}, ref) {
  const gridRef = useRef<AgGridReact<ExcelRowData>>(null);

  // ── Fill Handle (surukle-doldur) ──
  const FILLABLE_FIELDS = useMemo(() => new Set([
    '_malzKar', '_marka', '_iscKar', '_firma', '_draftDiscount',
  ]), []);

  const handleFillComplete = useCallback(async (result: { field: string; value: any; sourceRowIndex: number; targetRowNodes: any[] }) => {
    const api = gridRef.current?.api;
    if (!api) return;

    const { nameField, quantityField, materialUnitPriceField, materialTotalField,
            laborUnitPriceField, laborTotalField } = data.columnRoles;

    if (result.field === '_marka' && onBrandChange) {
      // Marka fill → her satir icin matching tetikle
      for (const node of result.targetRowNodes) {
        if (!node.data?._isDataRow) continue;
        node.setDataValue('_marka', result.value);
        const currentName = nameField ? String(node.data[nameField] ?? '').trim() : '';
        if (!currentName) continue;
        try {
          const matchResult = await onBrandChange(node.data._rowIdx, result.value, currentName);
          if (matchResult && matchResult.netPrice > 0) {
            node.setDataValue('_matNetPrice', matchResult.netPrice);
            const kar = parseFloat(String(node.data._malzKar ?? 0)) || 0;
            const finalPrice = matchResult.netPrice * (1 + kar / 100);
            const qty = quantityField ? parseFloat(String(node.data[quantityField] ?? 0)) || 0 : 0;
            if (materialUnitPriceField) node.setDataValue(materialUnitPriceField, finalPrice.toFixed(2));
            if (materialTotalField) node.setDataValue(materialTotalField, (finalPrice * qty).toFixed(2));
          }
        } catch {}
      }
    } else if (result.field === '_firma' && onFirmaChange) {
      // Firma fill → her satir icin labor matching tetikle
      for (const node of result.targetRowNodes) {
        if (!node.data?._isDataRow) continue;
        node.setDataValue('_firma', result.value);
        const currentName = nameField ? String(node.data[nameField] ?? '').trim() : '';
        if (!currentName) continue;
        try {
          const matchResult = await onFirmaChange(node.data._rowIdx, result.value, currentName);
          if (matchResult && matchResult.netPrice > 0) {
            node.setDataValue('_labNetPrice', matchResult.netPrice);
            const kar = parseFloat(String(node.data._iscKar ?? 0)) || 0;
            const finalPrice = matchResult.netPrice * (1 + kar / 100);
            const qty = quantityField ? parseFloat(String(node.data[quantityField] ?? 0)) || 0 : 0;
            if (laborUnitPriceField) node.setDataValue(laborUnitPriceField, finalPrice.toFixed(2));
            if (laborTotalField) node.setDataValue(laborTotalField, (finalPrice * qty).toFixed(2));
          }
        } catch {}
      }
    } else if (result.field === '_malzKar') {
      // Malzeme kar % fill → deger kopyala + fiyat recalc
      const karVal = parseFloat(String(result.value ?? 0)) || 0;
      for (const node of result.targetRowNodes) {
        if (!node.data?._isDataRow) continue;
        node.setDataValue('_malzKar', karVal);
        // Fiyat recalc
        const netPrice = parseFloat(String(node.data._matNetPrice ?? 0)) || 0;
        if (netPrice > 0) {
          const finalPrice = netPrice * (1 + karVal / 100);
          const qty = quantityField ? parseFloat(String(node.data[quantityField] ?? 0)) || 0 : 0;
          if (materialUnitPriceField) node.setDataValue(materialUnitPriceField, finalPrice.toFixed(2));
          if (materialTotalField) node.setDataValue(materialTotalField, (finalPrice * qty).toFixed(2));
        }
      }
    } else if (result.field === '_iscKar') {
      // Iscilik kar % fill → deger kopyala + fiyat recalc
      const iscKarVal = parseFloat(String(result.value ?? 0)) || 0;
      for (const node of result.targetRowNodes) {
        if (!node.data?._isDataRow) continue;
        node.setDataValue('_iscKar', iscKarVal);
        const netPrice = parseFloat(String(node.data._labNetPrice ?? 0)) || 0;
        if (netPrice > 0) {
          const kar = iscKarVal;
          const finalPrice = netPrice * (1 + kar / 100);
          const qty = quantityField ? parseFloat(String(node.data[quantityField] ?? 0)) || 0 : 0;
          if (laborUnitPriceField) node.setDataValue(laborUnitPriceField, finalPrice.toFixed(2));
          if (laborTotalField) node.setDataValue(laborTotalField, (finalPrice * qty).toFixed(2));
        }
      }
    } else {
      // Diger basit deger kopyalama
      for (const node of result.targetRowNodes) {
        if (!node.data?._isDataRow) continue;
        node.setDataValue(result.field, result.value);
      }
    }

    // Pinned bottom yenile
    setTimeout(() => {
      updatePinnedBottom?.();
      // onRowDataChange tetikle
      if (onRowDataChange && api) {
        const allRows: ExcelRowData[] = [];
        api.forEachNode((n: any) => { if (n.data) allRows.push(n.data); });
        onRowDataChange(allRows);
      }
    }, 100);

    console.log(`[FillHandle] Complete: ${result.targetRowNodes.length} rows filled, field=${result.field}`);
  }, [data.columnRoles, onBrandChange, onFirmaChange, onRowDataChange]);

  useFillHandle({
    gridRef,
    fillableFields: FILLABLE_FIELDS,
    onFillComplete: handleFillComplete,
    enabled: mode === 'quote', // sadece teklif modunda
  });

  // Dışarıya imperative method aç (handleSave öncesi güncel data almak için)
  useImperativeHandle(ref, () => ({
    getRowData(): ExcelRowData[] {
      if (!gridRef.current?.api) return [];
      const rows: ExcelRowData[] = [];
      gridRef.current.api.forEachNode((node) => {
        if (node.data) rows.push(node.data);
      });
      return rows;
    },
  }));
  const [pinnedBottomRow, setPinnedBottomRow] = React.useState<ExcelRowData[]>([]);

  // Pinned bottom "GENEL TOPLAM" satirini gunceller — tum data row'larin grand toplamini alir
  const updatePinnedBottom = useCallback(() => {
    if (!gridRef.current?.api) return;
    const { grandUnitPriceField, grandTotalField, materialTotalField, laborTotalField, nameField } = data.columnRoles;
    // Dosyada grandTotalField yoksa bile, materialTotal + laborTotal toplamini goster
    if (!grandTotalField && !materialTotalField && !laborTotalField) {
      setPinnedBottomRow([]);
      return;
    }

    let sumGrandTotal = 0;
    let sumMatTotal = 0;
    let sumLabTotal = 0;
    gridRef.current.api.forEachNode((node) => {
      if (!node.data?._isDataRow) return;
      if (grandTotalField) {
        const v = parseFloat(String(node.data[grandTotalField] ?? '')) || 0;
        sumGrandTotal += v;
      }
      if (materialTotalField) {
        const v = parseFloat(String(node.data[materialTotalField] ?? '')) || 0;
        sumMatTotal += v;
      }
      if (laborTotalField) {
        const v = parseFloat(String(node.data[laborTotalField] ?? '')) || 0;
        sumLabTotal += v;
      }
    });
    // Genel toplam = mat + lab (her zaman — grand kolonu bos olsa bile)
    const genelToplam = sumMatTotal + sumLabTotal;

    const pinnedRow: any = {
      _rowIdx: -1,
      _isDataRow: false,
      _isHeaderRow: false,
      _isPinnedTotal: true,
    };
    if (nameField) pinnedRow[nameField] = 'GENEL TOPLAM';
    if (materialTotalField) pinnedRow[materialTotalField] = sumMatTotal.toFixed(2);
    if (laborTotalField) pinnedRow[laborTotalField] = sumLabTotal.toFixed(2);
    // Toplam Tutar: grandTotalField varsa ona yaz
    if (grandTotalField) {
      pinnedRow[grandTotalField] = genelToplam.toFixed(2);
    }
    // grandTotalField yoksa ama grandUnitPriceField varsa, oraya toplam yaz (fallback)
    if (!grandTotalField && grandUnitPriceField) {
      pinnedRow[grandUnitPriceField] = genelToplam.toFixed(2);
    }
    // grandUnitPriceField ayrıca varsa boş bırak (birim toplamı anlamsız)
    if (grandUnitPriceField && grandTotalField) {
      pinnedRow[grandUnitPriceField] = '';
    }

    setPinnedBottomRow([pinnedRow]);
  }, [data.columnRoles]);

  // Data yuklenince pinned bottom hesapla
  React.useEffect(() => {
    const t = setTimeout(() => updatePinnedBottom(), 50);
    return () => clearTimeout(t);
  }, [data.rowData, updatePinnedBottom]);

  // pinnedBottomRow AG-Grid'e prop olarak gecirilir (asagida)

  // KRITIK: Sheet switch veya unmount oncesi son durumu state'e yaz
  // Boylece kullanici sheet degistirip tekrar donunce veya save edince
  // AG-Grid'deki guncel fiyatlar kaybolmaz
  const onRowDataChangeRef = React.useRef(onRowDataChange);
  onRowDataChangeRef.current = onRowDataChange;
  React.useEffect(() => {
    return () => {
      // Unmount cleanup — son rowData'yi disariya yayinla
      if (onRowDataChangeRef.current && gridRef.current?.api) {
        const allRows: ExcelRowData[] = [];
        gridRef.current.api.forEachNode((node) => {
          if (node.data) allRows.push(node.data);
        });
        if (allRows.length > 0) {
          onRowDataChangeRef.current(allRows);
        }
      }
    };
  }, []); // Sadece unmount'ta calisir

  // Library mode: rowData'ya _draftDiscount field'ini initialize et
  // Backend _libraryDiscountRate veya _laborDiscountRate set ediyor, biz draft'a kopyalayalim
  React.useEffect(() => {
    if (mode !== 'library') return;
    if (!data.rowData) return;
    let mutated = 0;
    for (const row of data.rowData as any[]) {
      if (!row?._isDataRow) continue;
      if (row._draftDiscount === undefined) {
        row._draftDiscount = row._libraryDiscountRate ?? row._laborDiscountRate ?? 0;
        mutated++;
      }
    }
    if (mutated > 0) {
      console.log(`[ExcelGrid library] _draftDiscount initialized for ${mutated} rows`);
    }
  }, [data.rowData, mode]);

  // Column definitions: backend'den gelenleri AG-Grid ColDef'e cevir
  const columnDefs = useMemo<ColDef<ExcelRowData>[]>(() => {
    if (!data || !Array.isArray(data.columnDefs)) {
      console.warn('[ExcelGrid] data.columnDefs missing', data);
      return [];
    }
    // Library mode'da quote-spesifik sistem sutunlarini cikar
    // (Malz. Kar, Marka, Isc. Kar, Firma kolonlari kutuphanede anlamsiz)
    const QUOTE_SYSTEM_FIELDS = new Set(['_malzKar', '_marka', '_iscKar', '_firma']);
    const filteredColumnDefs = mode === 'library'
      ? data.columnDefs.filter((c) => !QUOTE_SYSTEM_FIELDS.has(c.field))
      : data.columnDefs;

    const cols: ColDef<ExcelRowData>[] = filteredColumnDefs.map((c): ColDef<ExcelRowData> => {
      const base: ColDef<ExcelRowData> = {
        field: c.field,
        headerName: c.headerName,
        width: c.width ?? 120,
        editable: c.editable ?? false,
        pinned: c.pinned,
        suppressMovable: c.suppressMovable,
        resizable: true,
      };

      // Fill handle indicator — Kar % sutunlari icin (% prefix'li gorsel)
      if (mode === 'quote' && (c.field === '_malzKar' || c.field === '_iscKar')) {
        const karField = c.field;
        base.cellRenderer = (params: ICellRendererParams) => {
          if (!params.data?._isDataRow) return null;
          const val = params.value ?? 0;
          const hasVal = parseFloat(String(val)) > 0;
          return (
            <div className="fill-handle-cell" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <div style={{ position: 'relative', width: 68, display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8', fontWeight: 500, pointerEvents: 'none' }}>%</span>
                <span style={{
                  display: 'block', width: '100%', height: 28, padding: '0 8px 0 20px',
                  border: '1px solid #e2e8f0', borderRadius: 6,
                  fontSize: 12, textAlign: 'right', lineHeight: '28px',
                  fontVariantNumeric: 'tabular-nums',
                  color: hasVal ? '#059669' : '#1e293b',
                  fontWeight: hasVal ? 500 : 400,
                  background: 'white',
                }}>
                  {val}
                </span>
              </div>
              <FillHandleIndicator field={karField} value={val} rowIdx={params.data._rowIdx} />
            </div>
          );
        };
        base.editable = true;
      }

      if (c.cellRenderer === 'brandRenderer') {
        base.cellRenderer = (params: ICellRendererParams) => (
          <BrandDropdown
            {...params}
            brands={brands}
            onBrandChange={onBrandChange}
            nameField={data.columnRoles.nameField}
            noField={data.columnRoles.noField}
            brandField={data.columnRoles.brandField}
            quantityField={data.columnRoles.quantityField}
            materialUnitPriceField={data.columnRoles.materialUnitPriceField}
            materialTotalField={data.columnRoles.materialTotalField}
          />
        );
        base.editable = false;
      } else if (c.cellRenderer === 'firmaRenderer') {
        base.cellRenderer = (params: ICellRendererParams) => (
          <FirmaDropdown
            {...params}
            laborFirms={laborFirms}
            sheetDiscipline={sheetDiscipline}
            laborEnabled={laborEnabled}
            onFirmaChange={onFirmaChange}
            nameField={data.columnRoles.nameField}
            noField={data.columnRoles.noField}
            brandField={data.columnRoles.brandField}
            quantityField={data.columnRoles.quantityField}
            laborUnitPriceField={data.columnRoles.laborUnitPriceField}
            laborTotalField={data.columnRoles.laborTotalField}
          />
        );
        base.editable = false;
      }

      // Merge cells icin colSpan
      const field = c.field;
      base.colSpan = (params) => {
        const info = params.data?._merges?.[field];
        return info?.colSpan ?? 1;
      };
      base.rowSpan = (params) => {
        const info = params.data?._merges?.[field];
        return info?.rowSpan ?? 1;
      };
      base.cellClassRules = {
        'hidden-merged-cell': (params) => params.data?._merges?.[field]?.hidden === true,
      };

      // Para birimi sutunlari icin formatter (TR locale: 10.200,35)
      if (
        field === data.columnRoles.materialUnitPriceField ||
        field === data.columnRoles.materialTotalField ||
        field === data.columnRoles.laborUnitPriceField ||
        field === data.columnRoles.laborTotalField ||
        field === data.columnRoles.grandUnitPriceField ||
        field === data.columnRoles.grandTotalField
      ) {
        base.valueFormatter = (params) => {
          const v = parseFloat(String(params.value ?? ''));
          if (isNaN(v)) return '';
          // Pinned bottom satirinda 0 bile gosterilsin (GENEL TOPLAM satiri)
          if (v === 0 && !params.node?.rowPinned) return '';
          const formatted = (v * conversionRate).toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          return `${currencySymbol}${formatted}`;
        };
        base.cellStyle = { textAlign: 'right' };
      }

      // Grand kolonlari read-only (sistem otomatik hesaplar)
      if (
        field === data.columnRoles.grandUnitPriceField ||
        field === data.columnRoles.grandTotalField
      ) {
        base.editable = false;
        // Pinned bottom row'da backgroundColor VERMEMEK LAZIM
        // cunku row style mavi arka plan + beyaz text veriyor,
        // cell backgroundColor override ederse beyaz text acik gri zemin uzerinde KAYBOLUR
        base.cellStyle = ((params: any) => {
          if (params.node?.rowPinned === 'bottom') {
            return { textAlign: 'right', fontWeight: '700' };
          }
          return { textAlign: 'right', backgroundColor: '#f9fafb', fontWeight: '600' };
        }) as any;
      }

      return base;
    });

    // library mode: sistem sutunlari ekle (Iskonto %, Net Fiyat)
    // ONEMLI: valueGetter/valueSetter PATTERN'I BUGGY — direkt field editable kullaniyoruz
    // Cunku valueSetter mutation tabanli, AG-Grid cellValueChanged event'i her zaman tetiklenmeyebiliyor
    // Direkt field ile normal AG-Grid edit flow → cellValueChanged garantili tetiklenir
    if (mode === 'library') {
      const priceField = data.columnRoles[libraryPriceField];

      cols.push({
        field: '_draftDiscount',
        headerName: 'Iskonto %',
        width: 100,
        editable: (p: any) => p.data?._isDataRow === true,
        pinned: 'right' as const,
        suppressMovable: true,
        valueParser: (p: any) => {
          let val = parseFloat(String(p.newValue ?? '').replace(',', '.'));
          if (isNaN(val) || val < 0) val = 0;
          if (val > 100) val = 100;
          return val;
        },
        valueFormatter: (p: any) => {
          if (!p.data?._isDataRow) return '';
          const v = p.value;
          if (v === undefined || v === null || v === '') return '%0';
          return `%${Number(v).toFixed(0)}`;
        },
        cellStyle: { textAlign: 'right' as const },
      } as any);

      cols.push({
        colId: '_draftNetPrice',
        headerName: 'Net Fiyat',
        width: 130,
        editable: false,
        pinned: 'right' as const,
        suppressMovable: true,
        valueGetter: (p: any) => {
          if (!p.data?._isDataRow) return '';
          const row = p.data;
          const listPrice = parseFloat(String(row[priceField ?? ''] ?? '')) || 0;
          const discount = Number(row._draftDiscount ?? 0);
          return listPrice * (1 - discount / 100);
        },
        valueFormatter: (p: any) => {
          const v = parseFloat(String(p.value ?? ''));
          if (isNaN(v) || v === 0) return '';
          const formatted = (v * conversionRate).toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          return `${currencySymbol}${formatted}`;
        },
        cellStyle: { textAlign: 'right' as const, fontWeight: 'bold' as const },
      } as any);
    }

    return cols;
  }, [data, brands, onBrandChange, laborFirms, sheetDiscipline, laborEnabled, onFirmaChange, mode, libraryPriceField, currencySymbol, conversionRate]);

  // Kar % degistiginde fiyati yeniden hesapla
  const handleCellValueChanged = useCallback((e: CellValueChangedEvent<ExcelRowData>) => {
    const row = e.data;
    if (!row || !row._isDataRow) return;

    const {
      materialUnitPriceField, materialTotalField,
      laborUnitPriceField, laborTotalField,
      grandUnitPriceField, grandTotalField,
      quantityField,
    } = data.columnRoles;

    // Infinite loop engelleme: grand kolonlarinda degisim olursa recalc tetikleme
    if (e.colDef.field === grandUnitPriceField || e.colDef.field === grandTotalField) {
      return;
    }

    // ── Grand recalc helper (her degisim sonunda cagrilir) ──
    const recalcGrand = () => {
      if (!grandUnitPriceField && !grandTotalField) return;

      // Malzeme ve iscilik final birim fiyatlari (kar + iskonto dahil — cunku hucrelerde yazili)
      const matUnit = materialUnitPriceField
        ? parseFloat(String(row[materialUnitPriceField] ?? '')) || 0
        : 0;
      const labUnit = laborUnitPriceField
        ? parseFloat(String(row[laborUnitPriceField] ?? '')) || 0
        : 0;
      const grandUnit = matUnit + labUnit;

      if (grandUnitPriceField) {
        // Miktar 0 veya bos olsa bile birim fiyat gosterilir
        e.node.setDataValue(grandUnitPriceField, grandUnit > 0 ? grandUnit.toFixed(2) : '');
      }

      // Grand total = matTotal + labTotal
      const matTotal = materialTotalField
        ? parseFloat(String(row[materialTotalField] ?? '')) || 0
        : 0;
      const labTotal = laborTotalField
        ? parseFloat(String(row[laborTotalField] ?? '')) || 0
        : 0;
      const grandTotal = matTotal + labTotal;

      if (grandTotalField) {
        // Miktar 0 ise grand total 0 gosterilir (bos degil, kullanici "bos degil sifir" dedi)
        e.node.setDataValue(grandTotalField, grandTotal.toFixed(2));
      }
    };

    // ── Malzeme kar % degisti ──
    if (e.colDef.field === '_malzKar' && materialUnitPriceField && materialTotalField && quantityField) {
      const kar = parseFloat(String(row._malzKar ?? 0)) || 0;
      let net = typeof row._matNetPrice === 'number' && row._matNetPrice > 0
        ? row._matNetPrice
        : parseFloat(String(row[materialUnitPriceField] ?? '')) || 0;

      if (!row._matNetPrice || row._matNetPrice === 0) {
        e.node.setDataValue('_matNetPrice', net);
      }

      if (net > 0) {
        const finalPrice = net * (1 + kar / 100);
        const qty = parseFloat(String(row[quantityField] ?? 0)) || 0;
        const total = finalPrice * qty;
        e.node.setDataValue(materialUnitPriceField, finalPrice.toFixed(2));
        e.node.setDataValue(materialTotalField, total.toFixed(2));
        console.log(`[ExcelGrid] Malz. kar recalc: row=${row._rowIdx}, net=${net}, kar=${kar}%, final=${finalPrice.toFixed(2)}, qty=${qty}, total=${total.toFixed(2)}`);
      }
      setTimeout(() => { recalcGrand(); updatePinnedBottom(); }, 0);
    }

    // ── Iscilik kar % degisti ──
    if (e.colDef.field === '_iscKar' && laborUnitPriceField && laborTotalField && quantityField) {
      const kar = parseFloat(String(row._iscKar ?? 0)) || 0;
      let net = typeof row._labNetPrice === 'number' && row._labNetPrice > 0
        ? row._labNetPrice
        : parseFloat(String(row[laborUnitPriceField] ?? '')) || 0;

      if (!row._labNetPrice || row._labNetPrice === 0) {
        e.node.setDataValue('_labNetPrice', net);
      }

      if (net > 0) {
        const finalPrice = net * (1 + kar / 100);
        const qty = parseFloat(String(row[quantityField] ?? 0)) || 0;
        const total = finalPrice * qty;
        e.node.setDataValue(laborUnitPriceField, finalPrice.toFixed(2));
        e.node.setDataValue(laborTotalField, total.toFixed(2));
        console.log(`[ExcelGrid] Isc. kar recalc: row=${row._rowIdx}, net=${net}, kar=${kar}%, final=${finalPrice.toFixed(2)}, qty=${qty}, total=${total.toFixed(2)}`);
      }
      setTimeout(() => { recalcGrand(); updatePinnedBottom(); }, 0);
    }

    // ── Miktar degisti → malzeme + iscilik tutar yenile + grand recalc ──
    if (e.colDef.field === quantityField) {
      const qty = parseFloat(String(e.newValue ?? 0)) || 0;

      if (materialUnitPriceField && materialTotalField) {
        const matKar = parseFloat(String(row._malzKar ?? 0)) || 0;
        const matNet = typeof row._matNetPrice === 'number' && row._matNetPrice > 0
          ? row._matNetPrice
          : parseFloat(String(row[materialUnitPriceField] ?? '')) || 0;
        if (matNet > 0) {
          const finalPrice = matNet * (1 + matKar / 100);
          e.node.setDataValue(materialTotalField, (finalPrice * qty).toFixed(2));
        }
      }

      if (laborUnitPriceField && laborTotalField) {
        const labKar = parseFloat(String(row._iscKar ?? 0)) || 0;
        const labNet = typeof row._labNetPrice === 'number' && row._labNetPrice > 0
          ? row._labNetPrice
          : parseFloat(String(row[laborUnitPriceField] ?? '')) || 0;
        if (labNet > 0) {
          const finalPrice = labNet * (1 + labKar / 100);
          e.node.setDataValue(laborTotalField, (finalPrice * qty).toFixed(2));
        }
      }
      setTimeout(() => { recalcGrand(); updatePinnedBottom(); }, 0);
    }

    // ── Malzeme birim fiyat manuel degisti (kullanici elle yazdi) ──
    if (e.colDef.field === materialUnitPriceField && e.source === 'edit' && materialTotalField && quantityField) {
      const enteredPrice = parseFloat(String(e.newValue ?? '').replace(',', '.')) || 0;
      const kar = parseFloat(String(row._malzKar ?? 0)) || 0;
      // Girilen deger ekran hucresinden — kar uygulanmis final kabul et
      // Net'i geriye hesapla
      const net = kar > 0 ? enteredPrice / (1 + kar / 100) : enteredPrice;
      e.node.setDataValue('_matNetPrice', net);
      const qty = parseFloat(String(row[quantityField] ?? 0)) || 0;
      e.node.setDataValue(materialTotalField, (enteredPrice * qty).toFixed(2));
      setTimeout(() => { recalcGrand(); updatePinnedBottom(); }, 0);
      console.log(`[ExcelGrid] Manuel malz. birim: row=${row._rowIdx}, entered=${enteredPrice}, kar=${kar}%, net=${net.toFixed(2)}, qty=${qty}, total=${(enteredPrice * qty).toFixed(2)}`);
    }

    // ── Iscilik birim fiyat manuel degisti ──
    if (e.colDef.field === laborUnitPriceField && e.source === 'edit' && laborTotalField && quantityField) {
      const enteredPrice = parseFloat(String(e.newValue ?? '').replace(',', '.')) || 0;
      const kar = parseFloat(String(row._iscKar ?? 0)) || 0;
      const net = kar > 0 ? enteredPrice / (1 + kar / 100) : enteredPrice;
      e.node.setDataValue('_labNetPrice', net);
      const qty = parseFloat(String(row[quantityField] ?? 0)) || 0;
      e.node.setDataValue(laborTotalField, (enteredPrice * qty).toFixed(2));
      setTimeout(() => { recalcGrand(); updatePinnedBottom(); }, 0);
      console.log(`[ExcelGrid] Manuel isc. birim: row=${row._rowIdx}, entered=${enteredPrice}, kar=${kar}%, net=${net.toFixed(2)}, qty=${qty}, total=${(enteredPrice * qty).toFixed(2)}`);
    }

    // ── Malzeme veya iscilik birim/tutar kolonlari api tarafindan degisti (brand/firma matching sonrasi) ──
    if (
      e.colDef.field === materialUnitPriceField ||
      e.colDef.field === materialTotalField ||
      e.colDef.field === laborUnitPriceField ||
      e.colDef.field === laborTotalField
    ) {
      setTimeout(() => { recalcGrand(); updatePinnedBottom(); }, 0);
    }

    // ── Library mode: iskonto cell edit ──
    if (e.colDef.field === '_draftDiscount' && e.source === 'edit') {
      // _dirty flag set et — handleRowsChange dirty count'u alir
      row._dirty = true;
      // Net Fiyat kolonu valueGetter ile hesaplaniyor, sadece grid refresh gerek
      if (gridRef.current?.api) {
        gridRef.current.api.refreshCells({ rowNodes: [e.node], force: true });
      }
      console.log(`[ExcelGrid library] _draftDiscount edit: row=${row._rowIdx}, value=${e.newValue}, _dirty=true`);
    }

    // Disariya canli rowData yayinla (fiyat listesi yuklemede gerekli)
    if (onRowDataChange && gridRef.current?.api) {
      const allRows: ExcelRowData[] = [];
      gridRef.current.api.forEachNode((node) => {
        if (node.data) allRows.push(node.data);
      });
      onRowDataChange(allRows);
    }
  }, [data.columnRoles, onRowDataChange]);

  // getRowId — stabil row kimligi (re-render'da row'un durumunu korur)
  const getRowId = useCallback((params: GetRowIdParams<ExcelRowData>) => {
    return String(params.data._rowIdx);
  }, []);

  return (
    <div className="ag-theme-alpine w-full" style={{ height: '80vh' }}>
      <AgGridReact<ExcelRowData>
        ref={gridRef}
        theme="legacy"
        rowData={data.rowData}
        pinnedBottomRowData={pinnedBottomRow}
        getRowStyle={(p) => {
          if (p.node.rowPinned === 'bottom') {
            return { backgroundColor: '#1e40af', color: '#ffffff', fontWeight: 700 };
          }
          return undefined;
        }}
        columnDefs={columnDefs}
        defaultColDef={{
          resizable: true,
          sortable: false,
          filter: false,
          suppressMovable: true,
        }}
        getRowId={getRowId}
        onCellValueChanged={handleCellValueChanged}
        stopEditingWhenCellsLoseFocus
        rowHeight={28}
        headerHeight={32}
        animateRows={false}
        suppressRowTransform
      />
      <style jsx global>{`
        .ag-theme-alpine {
          --ag-grid-size: 5px;
          --ag-list-item-height: 24px;
          --ag-font-size: 12px;
        }
        .hidden-merged-cell {
          display: none !important;
        }
      `}</style>
    </div>
  );
});
