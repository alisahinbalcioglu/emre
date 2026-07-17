'use client';

import React, { useCallback, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams, CellValueChangedEvent, GetRowIdParams } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import './fill-handle.css';
import type { ExcelGridData, ExcelRowData, MatchCandidate, BrandAlternative } from './types';
import { useFillHandle, FillHandleIndicator } from './useFillHandle';
import { clampDiscount, parseDiscountInput, parseDiscountPaste } from './discount-utils';
import { CustomDropdown } from './CustomDropdown';
import { joinMaterialText } from '@/lib/parse-material-text';
import { hesaplaNetFiyat, hesaplaSatisBirimFiyat, hesaplaSatirToplam, yukariYuvarla } from '@/lib/pricing';
import { hasSizeExpression, isSelfSufficientRow } from './build-material-context';
import httpApi from '@/lib/api';
import { toast } from '@/hooks/use-toast';

// Z4: satir bazli para birimi sembolu (row._currency) — kutuphane gridi
// dovizli satirlari kendi birimiyle gosterir
const ROW_CURRENCY_SYMBOL: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };

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
  onBrandChange: (rowIdx: number, brandId: string, materialName: string, opts?: {
    // V4: grup varyant filtresi — adaylar bu tag'lerin tamamini tasimali
    variantTags?: string[];
    // Grup ici toplu uygulamada toast gurultusunu kapat
    silent?: boolean;
  }) => Promise<{
    netPrice: number;
    matchedName?: string;
    candidates?: MatchCandidate[];
    reason?: string;
    // 'high' = kesin, 'suggestion' = oneri (fiyat dolar ama sari isaretlenir)
    confidence?: 'high' | 'suggestion' | string;
    // spec: oran/hizmet satiri — fiyat beklenmiyor (gri isaret)
    notProduct?: boolean;
    // U2 seffaf cevrim rozeti: "DN 25 → 1\" (çelik)"
    donusum?: string;
    // V4: varyant filtresi tek adaya indi (grup otomatik atamasi)
    autoVariant?: boolean;
    // I6 rozeti (18.07): fiyat GECMIS SECIMDEN otomatik atandi
    hafizaOtoyaz?: boolean;
    // V4.5: varyant bu capta yok — secim bekliyor
    variantMissing?: boolean;
    // M3: bu markada urun yok — ayni urunu sunan diger markalar (fiyatli)
    alternatives?: BrandAlternative[];
  } | null>;
  /** V4.4: grup ici otomatik varyant atama anahtari (varsayilan ACIK) */
  autoVariantEnabled?: boolean;
  /** Duzeltme Talebi §4.2: surukle-doldur ACIK NIYETTIR — grid anahtari
   *  otomatik ACAR (ve Ctrl+Z'de eski durumuna dondurur). Parent state'i
   *  gunceller (quotes/new: setAutoVariantEnabled). */
  onAutoVariantChange?: (on: boolean) => void;
  /** Duzeltme Talebi §3: yayilim/fill sonrasi "n satır güncellendi" bilgisi —
   *  parent toast gosterir. */
  onAutoVariantApplied?: (info: { applied: number; waiting: number; missing: number; kaynak: string }) => void;
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
  /** Excel-vari "en altta hep bos satir": _isSpareRow satiri dolunca otomatik
   *  yenisi eklenir ('Satir Ekle' butonu YOK). DWG metraj akisinda acilir. */
  autoAppendRow?: boolean;
  /** DINAMIK GRID: sag tik context menu ile araya satir ekle/sil ve sutun
   *  ekle/sil. Teklif duzenleme ekraninda acilir (detay sayfasi salt okunur). */
  enableStructureEdit?: boolean;
  /** Sutun ekle/sil sonrasi YENI columnDefs — parent (quotes/new) multiSheet
   *  state'ini gunceller; draft + kayit (sheetsPayload) otomatik persist olur. */
  onColumnsChange?: (defs: ExcelGridData['columnDefs']) => void;
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

// S4: ayni basligi ayni oturumda bir kez oner (confirm yorgunlugu onlemi)
const offeredHeaderAliases = new Set<string>();
// Cins tag'leri (backend KIND_TAGS ikizi) — S4 alias kaydinda secilen adaydan turetilir
const FE_KIND_TAGS = ['celik', 'pirinc', 'dokum', 'paslanmaz', 'bronz', 'aluminyum', 'bakir', 'ppr', 'pvc', 'pe', 'hdpe'];
const FE_PLASTIC_KINDS = ['ppr', 'pvc', 'pe', 'hdpe'];

/** V4: grup (baslik) → secilmis varyant kimligi. Grid seviyesinde ref olarak
 *  yasar — cell renderer'lar arasinda paylasilir, re-render tetiklemez. */
export interface GroupVariantMap {
  [headerKey: string]: { tags: string[]; label: string };
}

function BrandDropdown(props: ICellRendererParams & {
  brands: Brand[];
  onBrandChange: Props['onBrandChange'];
  nameField?: string;
  noField?: string;
  brandField?: string;
  quantityField?: string;
  materialUnitPriceField?: string;
  materialTotalField?: string;
  diameterField?: string;
  groupVariants: React.MutableRefObject<GroupVariantMap>;
  autoVariantEnabled: boolean;
  onAutoVariantApplied?: Props['onAutoVariantApplied'];
}) {
  const { data, brands, onBrandChange, nameField, noField, brandField, quantityField, materialUnitPriceField, materialTotalField, diameterField, groupVariants, autoVariantEnabled, onAutoVariantApplied, api, node } = props;
  const [candidates, setCandidates] = React.useState<MatchCandidate[] | null>(null);
  const [popupPos, setPopupPos] = React.useState<{ top: number; left: number } | null>(null);
  // HATA RAPORU FIX: popup konumu WRAPPER div'den alinir — onceki triggerRef
  // hicbir elemana bagli DEGILDI (null kaliyordu) → popupPos hic set edilmiyor,
  // secim listesi HIC ACILMIYORDU (eylemsiz toast + dead-end). Wrapper ref
  // hucrenin kendisi; o da yoksa viewport fallback — popup HER KOSULDA acilir.
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const computePopupPos = (): { top: number; left: number } => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const raw = rect
      ? { top: rect.bottom + 2, left: rect.left }
      : { top: window.innerHeight * 0.3, left: window.innerWidth * 0.35 };
    return {
      top: Math.max(8, Math.min(raw.top, window.innerHeight - 360)),
      left: Math.max(8, Math.min(raw.left, window.innerWidth - 420)),
    };
  };

  // OGRENME (PRD Adim 8): secici hangi arama adiyla acildi — secim yapilinca
  // (imza, secilenAd) hafizaya yazilir, ikinci gelisinde secici atlanir.
  const lookupNameRef = React.useRef<string>('');
  // S4: eslesme baslik-zenginlestirmeyle bulunduysa baslik metni (sozluk onerisi)
  const headerRef = React.useRef<string | null>(null);
  // V7: 8+ aday oldugunda "tumunu gor" acildi mi
  const [showAllCandidates, setShowAllCandidates] = React.useState(false);
  // K6 zincirleme secim: 1. soru = varyant (label grubu), 2. soru = alt tip
  // (ayni label'da birden fazla urun — "Tip A / Tip B"). Fiyat ancak tek
  // urune inilince yazilir.
  const [stage2, setStage2] = React.useState<MatchCandidate[] | null>(null);
  // K4/K7: "Secimi bu gruptaki tum satirlara uygula" — ilk secimde ACIK,
  // oto-satir kacisinda (V4.2) KAPALI acilir; kullanici degistirebilir.
  const [applyToGroup, setApplyToGroup] = React.useState(false);
  // F3: 8+ aday oldugunda arama kutusu (label + urun adi uzerinde filtre)
  const [filterText, setFilterText] = React.useState('');
  // M3: bu markada urun yok — alternatif markalar listesi (marka+fiyat birlikte)
  const [alternatives, setAlternatives] = React.useState<BrandAlternative[] | null>(null);
  // Popup basliginda gosterilecek cevrim rozeti ("DN 50 → 2\" (çelik)")
  const donusumRef = React.useRef<string | null>(null);

  if (!data?._isDataRow) return null;

  // Fiyati HERHANGI bir node'un hucrelerine yaz (V4 benzer-satir uygulamasi
  // baska node'lara da yazar). isSuggestion=true → sari 'oneri' isareti.
  const writePriceToNode = (targetNode: any, netPrice: number, isSuggestion = false) => {
    const d = targetNode.data;
    const kar = parseFloat(String(d._malzKar ?? 0)) || 0;
    // SPEC (fiyat cekirdegi): satis = net×(1+kar), YUKARI 1 hane; toplam = satis×miktar.
    const finalPrice = hesaplaSatisBirimFiyat(netPrice, kar);
    const qty = quantityField ? parseFloat(String(d[quantityField] ?? 0)) || 0 : 0;
    const total = hesaplaSatirToplam(finalPrice, qty);

    // AG-Grid sutun tipi string — number degeri reddediyor (warning #135)
    targetNode.setDataValue('_matNetPrice', netPrice);
    targetNode.setDataValue('_matSuggestion', isSuggestion);
    targetNode.setDataValue('_matStatus', ''); // eslesme geldi — bekleme isareti kalkar
    if (materialUnitPriceField) targetNode.setDataValue(materialUnitPriceField, finalPrice.toFixed(1));
    if (materialTotalField) targetNode.setDataValue(materialTotalField, total.toFixed(1));

    console.log(`[BrandDropdown] row=${d._rowIdx}, net=${netPrice}, kar=${kar}%, final=${finalPrice}, qty=${qty}, total=${total}, suggestion=${isSuggestion}`);
  };
  const writePrice = (netPrice: number, isSuggestion = false) => writePriceToNode(node, netPrice, isSuggestion);

  const handleChange = async (brandId: string) => {
    node.setDataValue('_marka', brandId || null);
    setCandidates(null);
    setAlternatives(null);
    if (!brandId) {
      node.setDataValue('_matNetPrice', 0);
      if (materialUnitPriceField) node.setDataValue(materialUnitPriceField, '');
      if (materialTotalField) node.setDataValue(materialTotalField, '');
      return;
    }

    // AKILLI SUTUN: Çapı ayri sutundaysa (diameterField) eslestirme adi
    // "Çap + Cins" birlesimidir (orn "Ø110 PVC BORU") — cins tek basina
    // fiyat listesinde bulunamaz.
    const baseName = nameField ? String(data[nameField] ?? '').trim() : '';
    const diaVal = diameterField ? String(data[diameterField] ?? '').trim() : '';
    const currentName = joinMaterialText(diaVal, baseName);
    if (!currentName) return;

    // ── M1/M4 (Duzeltme: markada olmayan urun): SORGU HER ZAMAN TEKTIR —
    // baslik+satir birlesimi (yetim satirda aile bilgisi basliktan gelir).
    // Eski "once satir, olmazsa baslikli" 2 asamali akis KALDIRILDI: yetim
    // "DN 20" sorgusu aile bilgisiz calisip BORU adaylari donduruyor, baslikli
    // sorgunun dogru "yok" cevabini eziyordu → Cayirova'ya PP vana fiyati
    // yazilmisti. Aile sorgudan ASLA dusmez; markada urun yoksa sonuc YOK'tur
    // (cross-family fallback yasak), M3 alternatif markalar popup'i devreye girer.
    const ctxDetail = buildMaterialContextDetailed(api, node.rowIndex ?? 0, nameField, noField, brandField, quantityField);
    const queryName = ctxDetail.name || currentName;
    headerRef.current = ctxDetail.header; // S4/V4: grup anahtari + sozluk onerisi

    // ── V4/V4.6: GRUP VARYANTI — grupta secim yapildiysa ayni varyantla ara.
    // V4.2 KACIS: satir zaten otomatik doluysa kullanicinin markaya tekrar
    // tiklamasi "tam listeyi goster" demektir → filtresiz ara, popup acilir,
    // secim satiri MANUEL yapar. Manuel satira da filtre uygulanmaz.
    const gv = autoVariantEnabled && ctxDetail.header ? groupVariants.current[ctxDetail.header] : undefined;
    const escapeAuto = !!data._matAutoVariant;
    const useVariant = !!gv && !escapeAuto && data._matVariantMode !== 'manual';
    const opts = useVariant ? { variantTags: gv!.tags } : undefined;

    console.log(`[BrandDropdown] row=${data._rowIdx}, sorgu="${queryName}"${useVariant ? ` varyant=[${gv!.tags.join(',')}]` : ''}${escapeAuto ? ' (oto-kacis: tam liste)' : ''}`);
    const result = await onBrandChange(data._rowIdx, brandId, queryName, opts);
    lookupNameRef.current = queryName; // ogrenme imzasi bu adla uretilir

    // Multi case — kullaniciya secenek sun (Portal ile body'e render).
    // F1/B3: popupPos HER KOSULDA set edilir — eylemsiz uyari YASAK.
    if (result && result.candidates && result.candidates.length > 0) {
      setPopupPos(computePopupPos());
      node.setDataValue('_matStatus', 'belirsiz'); // secim bekleniyor (V4.5 dahil)
      setShowAllCandidates(false); // V7: yeni popup 8 adayla baslar
      setStage2(null); // K6: zincir bastan
      setFilterText(''); // F3: arama sifirlanir
      // K4: gruba-uygula varsayilani — ilk secimde ACIK, oto-kacista KAPALI
      setApplyToGroup(autoVariantEnabled && !!ctxDetail.header && !escapeAuto);
      donusumRef.current = result.donusum ?? null;
      setCandidates(result.candidates);
      return;
    }

    // Tek eslesme — fiyat yaz ('suggestion' ise sari isaretle)
    if (result && result.netPrice > 0) {
      writePrice(result.netPrice, result.confidence === 'suggestion');
      // V4.1/V4.6: grup varyantiyla otomatik dolduysa rozeti isle
      if (result.autoVariant && useVariant) {
        node.setDataValue('_matAutoVariant', gv!.label);
        node.setDataValue('_matVariantMode', 'auto');
        node.data._matVariantTags = gv!.tags;
        node.data._matVariantLabel = gv!.label;
      }
      // I6 KANIT ROZETI (kullanici sarti 18.07): hafizadan otoyazilan satir
      // ISARETLENIR — mavi hucre + tooltip "Geçmiş seçiminizden atandı";
      // marka menusu yeniden acilinca oto-kacis TAM LISTE sunar (tek tikla
      // cozulur, secim manuel olur) — sessiz/izsiz otomatik yazim YOK.
      if (result.hafizaOtoyaz) {
        node.setDataValue('_matAutoVariant', 'Geçmiş seçiminizden atandı');
        node.setDataValue('_matVariantMode', 'auto');
      }
      return;
    }

    // ── M3: bu markada urun yok — alternatif markalar (fiyatli, tiklanabilir).
    // Fiyat ASLA otomatik yazilmaz (M1); kullanici marka+fiyati birlikte secer.
    // N5-lite: kesif dosyasindaki "HAKAN VEYA MUADILI" marka metnine uyan
    // alternatif one alinir ve ★ ile isaretlenir.
    if (result && result.alternatives && result.alternatives.length > 0) {
      const brandText = brandField ? String(data[brandField] ?? '').toLocaleLowerCase('tr') : '';
      const marked = result.alternatives.map((a) => ({
        ...a,
        onerilen: !!brandText && brandText.includes(a.brandName.toLocaleLowerCase('tr').split(' ')[0]),
      }));
      marked.sort((a, b) => (a.onerilen ? 0 : 1) - (b.onerilen ? 0 : 1));
      setPopupPos(computePopupPos());
      node.setDataValue('_matStatus', 'belirsiz');
      setAlternatives(marked);
      return;
    }

    // ALTIN KURAL: fiyat uretilmez — hucre bos + ISARETLI.
    // 'urun_degil' (oran/hizmet, gri) vs 'yok' (kutuphanede eslesme yok, kirmizi).
    node.setDataValue('_matNetPrice', 0);
    node.setDataValue('_matSuggestion', false);
    node.setDataValue('_matStatus', result?.notProduct ? 'urun_degil' : 'yok');
    if (materialUnitPriceField) node.setDataValue(materialUnitPriceField, '');
    if (materialTotalField) node.setDataValue(materialTotalField, '');
  };

  // ── V4 (PRD v1.3): GRUP ICI OTOMATIK VARYANT ATAMA — SORULMAZ ──────
  // Ayni baslik altindaki, manuel olmayan satirlara secilen varyantin KENDI
  // CAPLARININ fiyati atanir. Varyant o capta yoksa satir fiyatli listeyle
  // "secim bekliyor" kalir (V4.5). Markasiz satirlara dokunulmaz — marka
  // secildigi anda hatirlanan varyantla dolarlar (V4.6, handleChange'de).
  const applyVariantToGroup = async (groupKey: string, variant: { tags: string[]; label: string }) => {
    const targets: any[] = [];
    api.forEachNode((n: any) => {
      const d = n.data;
      if (n === node || !d?._isDataRow || !d._marka) return;
      if (d._matVariantMode === 'manual') return; // V4.2: manuel satira dokunma
      // A4: yayilim yalniz FIYATSIZ satirlara — dolu otomatik hucreler
      // geriye donuk degistirilmez (kullanici onayi olmadan)
      if ((parseFloat(String(d._matNetPrice ?? 0)) || 0) > 0) return;
      const det = buildMaterialContextDetailed(api, n.rowIndex ?? 0, nameField, noField, brandField, quantityField);
      if (det.header === groupKey) targets.push(n);
    });
    if (targets.length === 0) return;
    let applied = 0;
    let waiting = 0;
    for (const n of targets.slice(0, 100)) {
      const d = n.data;
      const baseName = nameField ? String(d[nameField] ?? '').trim() : '';
      const diaVal = diameterField ? String(d[diameterField] ?? '').trim() : '';
      const nm = joinMaterialText(diaVal, baseName);
      if (!nm) continue;
      try {
        // M1/M4: TEK SORGU — baslik+satir (aile bilgisiz fallback yasak)
        const det = buildMaterialContextDetailed(api, n.rowIndex ?? 0, nameField, noField, brandField, quantityField);
        const r = await onBrandChange(d._rowIdx, d._marka, det.name || nm, { variantTags: variant.tags, silent: true });
        if (r && r.autoVariant && r.netPrice > 0) {
          writePriceToNode(n, r.netPrice, true);
          n.setDataValue('_matAutoVariant', variant.label); // V4.1 rozeti
          n.setDataValue('_matVariantMode', 'auto');
          // Fill-handle kaynagi olabilsin diye varyant kimligi satirda tasinir
          n.data._matVariantTags = variant.tags;
          n.data._matVariantLabel = variant.label;
          applied++;
        } else if (r && r.variantMissing) {
          // V4.5: varyant bu capta yok — secim bekliyor, neden tooltip'te
          n.setDataValue('_matStatus', 'belirsiz');
          waiting++;
        }
      } catch { /* satir atlanir */ }
    }
    console.log(`[BrandDropdown] V4 grup atamasi "${groupKey}" (${variant.label}): ${applied} otomatik, ${waiting} secim bekliyor, ${targets.length} hedef`);
    // Duzeltme Talebi §3: "n satır güncellendi" bilgisi (parent toast'u)
    if (applied + waiting > 0) onAutoVariantApplied?.({ applied, waiting, missing: 0, kaynak: variant.label });
  };

  const handleCandidateSelect = async (c: MatchCandidate) => {
    const brandId = data._marka as string | null;
    // Kullanici popup'tan bilincli sectiginde 'oneri' degil kesin sayilir.
    // V4.2: popup'tan secim = MANUEL — grup degisse bile uzerine yazilmaz.
    writePrice(c.netPrice, false);
    node.setDataValue('_matVariantMode', 'manual');
    node.setDataValue('_matAutoVariant', null);
    // Duzeltme Talebi §4.2: SECIMIN KIMLIGI SATIRDA TASINIR — fill-handle
    // kaynak satirin marka+cins'ini buradan okur (anahtar KAPALI secilmis
    // olsa bile). Grid kolonu yok → dogrudan data'ya yazilir (render disi).
    node.data._matVariantTags = c.variantTags && c.variantTags.length > 0 ? c.variantTags : null;
    node.data._matVariantLabel = c.label ?? null;
    setCandidates(null);
    setPopupPos(null);
    setStage2(null);

    // OGRENME (PRD Adim 8 + V5): secimi hafizaya yaz (V5 artik ON-SECILI
    // getirir, otomatik doldurmaz — dosyalar arasi atama yok).
    if (brandId && lookupNameRef.current) {
      try {
        await httpApi.post('/matching/remember', {
          brandId,
          materialName: lookupNameRef.current,
          secilenAd: c.materialName,
        });
      } catch { /* hafiza yazilamadi — akis devam */ }
    }

    // S4: eslesme BASLIK zenginlestirmesiyle bulunduysa sozluge kaydetmeyi
    // oner (oturum basina baslik basina 1 kez). Alias → sonraki dosyalarda
    // ayni baslik otomatik cozulur.
    const hdr = headerRef.current;
    if (hdr && lookupNameRef.current.startsWith(hdr) && !offeredHeaderAliases.has(hdr)) {
      offeredHeaderAliases.add(hdr);
      const kinds = (c.tags ?? []).filter((t) => FE_KIND_TAGS.includes(t));
      if (kinds.length > 0 && window.confirm(`"${hdr}" terimi sözlüğe kaydedilsin mi?\nSonraki dosyalarda bu başlık altındaki satırlar otomatik "${kinds.join('/')}" olarak yorumlanır.`)) {
        httpApi.post('/matching/aliases', {
          alias: hdr,
          canonical: c.materialName,
          kinds,
          sizeClass: kinds.some((k) => FE_PLASTIC_KINDS.includes(k)) ? 'plastic' : 'steel',
          impliedType: null,
        }).catch(() => {});
      }
    }

    // A4 (Duzeltme — anahtar semantigi): "SON SECIM" her secimde guncellenir —
    // sonraki otomatik atamalar (V4.6 markasiz satirlar dahil) buna gore yapilir.
    // CHECKBOX yalniz ANLIK yayilimi belirler; yayilim SADECE henuz FIYATSIZ
    // satirlara gider — dolu otomatik hucreler geriye donuk DEGISTIRILMEZ,
    // manuel hucrelere hic dokunulmaz.
    // Duzeltme Talebi §2: "SON SECIM" anahtar durumundan BAGIMSIZ saklanir —
    // anahtar sonradan ACILDIGINDA veya fill-handle kullanildiginda bu secim
    // uygulanabilir olmali. YAYILIM ise yalniz anahtar ACIKKEN calisir (I10).
    if (hdr && c.variantTags && c.variantTags.length > 0) {
      groupVariants.current[hdr] = { tags: c.variantTags, label: c.label }; // son secim
      if (autoVariantEnabled && applyToGroup) {
        await applyVariantToGroup(hdr, groupVariants.current[hdr]);
      }
    }
  };

  const handleCancel = () => {
    setCandidates(null);
    setPopupPos(null);
    setStage2(null);
    node.setDataValue('_marka', null);
  };

  // M3: alternatif marka secimi — marka + fiyat BIRLIKTE atanir, satir manuel
  const handleAlternativeSelect = (a: BrandAlternative) => {
    node.setDataValue('_marka', a.brandId);
    writePrice(a.netPrice, false);
    node.setDataValue('_matVariantMode', 'manual');
    node.setDataValue('_matAutoVariant', null);
    setAlternatives(null);
    setPopupPos(null);
    console.log(`[BrandDropdown] M3 alternatif secildi: ${a.brandName} → "${a.materialName}" = ${a.netPrice}`);
  };

  const handleAlternativeCancel = () => {
    // Kullanici uyumsuz markada kalmayi secti — fiyat yok, hucre 'yok' isaretli
    setAlternatives(null);
    setPopupPos(null);
    node.setDataValue('_matStatus', 'yok');
  };

  const brandOptions = React.useMemo(() =>
    brands.map((b) => ({ value: b.id, label: b.name })),
    [brands],
  );

  return (
    <div ref={wrapperRef} className="fill-handle-cell" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
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
          <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 2, fontSize: 13 }}>
            🟡 Seçim gerekli{stage2 ? ' — tip seçin' : ` (${candidates.length} aday)`}
          </div>
          {(headerRef.current || donusumRef.current) && (
            <div style={{ color: '#92400e', fontSize: 10, marginBottom: 6 }}>
              {headerRef.current ?? ''}{headerRef.current && donusumRef.current ? ' · ' : ''}{donusumRef.current ?? ''}
            </div>
          )}
          {(() => {
            // K6 ZINCIRLEME SECIM: 1. soru = varyant (label) gruplari.
            // Ayni label'da birden fazla somut urun varsa (alt tipler) fiyat
            // HENUZ yazilmaz — 2. soru o urunleri adlariyla listeler.
            const btnStyle: React.CSSProperties = {
              display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
              border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer',
              fontSize: 12, borderRadius: 4, marginBottom: 4,
            };
            const hover = {
              onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.background = '#dbeafe';
                e.currentTarget.style.borderColor = '#3b82f6';
              },
              onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.borderColor = '#e5e7eb';
              },
            };

            if (stage2) {
              // 2. soru: secilen varyantin alt tipleri (somut urunler, adlariyla)
              return (
                <>
                  <button onClick={() => setStage2(null)} style={{ ...btnStyle, textAlign: 'center', background: '#f9fafb', color: '#6b7280', fontSize: 11 }}>
                    ← Geri (varyantlar)
                  </button>
                  {stage2.map((c, i) => (
                    <button key={i} onClick={() => handleCandidateSelect(c)} style={btnStyle} {...hover}>
                      <div style={{ fontWeight: 600 }}>{c.preferred && '✓ '}{c.materialName.slice(0, 60)}</div>
                      <div style={{ color: '#6b7280', fontSize: 11 }}>{c.netPrice.toFixed(1)} TL</div>
                      {/* E3: nitelik farki uyarisi ("68°C istendi — bu ürün 141°C") */}
                      {c.uyari && <div style={{ color: '#dc2626', fontSize: 10, marginTop: 2 }}>⚠ {c.uyari}</div>}
                    </button>
                  ))}
                </>
              );
            }

            // 1. soru: label bazli gruplar
            const groups: { label: string; items: MatchCandidate[]; preferred: boolean }[] = [];
            for (const c of candidates) {
              const g = groups.find((x) => x.label === c.label);
              if (g) { g.items.push(c); g.preferred = g.preferred || !!c.preferred; }
              else groups.push({ label: c.label, items: [c], preferred: !!c.preferred });
            }
            // F3: arama filtresi (label + urun adi)
            const flt = filterText.trim().toLowerCase();
            const filtered = flt
              ? groups.filter((g) =>
                  g.label.toLowerCase().includes(flt) ||
                  g.items.some((c) => c.materialName.toLowerCase().includes(flt)))
              : groups;
            const visible = showAllCandidates ? filtered : filtered.slice(0, 8);
            return (
              <>
                {candidates.length > 8 && (
                  <input
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Ara… (varyant / ürün adı)"
                    style={{
                      display: 'block', width: '100%', padding: '5px 8px', marginBottom: 6,
                      border: '1px solid #fcd34d', borderRadius: 4, fontSize: 12, outline: 'none',
                    }}
                  />
                )}
                {visible.map((g, i) => {
                  const single = g.items.length === 1;
                  const c = g.items[0];
                  return (
                    <button
                      key={i}
                      onClick={() => (single ? handleCandidateSelect(c) : setStage2(g.items))}
                      style={btnStyle}
                      {...hover}
                    >
                      <div style={{ fontWeight: 600 }}>{g.preferred && '✓ '}{single && c.popular && '★ '}{g.label}</div>
                      <div style={{ color: '#6b7280', fontSize: 11 }}>
                        {single ? `${c.netPrice.toFixed(1)} TL` : `${g.items.length} alt tip →`}
                        {g.preferred && <span style={{ color: '#059669', marginLeft: 6, fontWeight: 600 }}>önceki tercihiniz</span>}
                      </div>
                      {/* E3: nitelik farki uyarisi ("68°C istendi — bu ürün 141°C") */}
                      {single && c.uyari && <div style={{ color: '#dc2626', fontSize: 10, marginTop: 2 }}>⚠ {c.uyari}</div>}
                    </button>
                  );
                })}
                {!showAllCandidates && filtered.length > 8 && (
                  <button
                    onClick={() => setShowAllCandidates(true)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'center', padding: '6px',
                      border: '1px dashed #f59e0b', background: '#fffbeb', cursor: 'pointer',
                      fontSize: 11, color: '#b45309', borderRadius: 4, marginBottom: 4, fontWeight: 600,
                    }}
                  >
                    Tümünü gör ({filtered.length - 8} seçenek daha)
                  </button>
                )}
              </>
            );
          })()}
          {/* K4/K7: gruba uygula — ilk secimde acik, oto-kacista kapali gelir */}
          {autoVariantEnabled && headerRef.current && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 4px 2px',
              fontSize: 11, color: '#78350f', cursor: 'pointer', borderTop: '1px dashed #fcd34d', marginTop: 2,
            }}>
              <input
                type="checkbox"
                checked={applyToGroup}
                onChange={(e) => setApplyToGroup(e.target.checked)}
                style={{ accentColor: '#0284c7' }}
              />
              Seçimi bu gruptaki tüm satırlara uygula
            </label>
          )}
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
      {/* M3: bu markada urun yok — alternatif markalar (fiyatli, tiklanabilir) */}
      {alternatives && alternatives.length > 0 && popupPos && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', top: popupPos.top, left: popupPos.left, zIndex: 99999,
          background: '#fef2f2', border: '2px solid #ef4444', borderRadius: 6, padding: 8,
          minWidth: 280, maxWidth: 420, maxHeight: 320, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 6, fontSize: 13 }}>
            Bu markada ürün yok — şu markalarda var:
          </div>
          {alternatives.map((a, i) => (
            <button
              key={i}
              onClick={() => handleAlternativeSelect(a)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer',
                fontSize: 12, borderRadius: 4, marginBottom: 4,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#dbeafe'; e.currentTarget.style.borderColor = '#3b82f6'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
            >
              <div style={{ fontWeight: 700 }}>{a.onerilen && '★ '}{a.brandName} — {a.netPrice.toFixed(1)} TL{a.onerilen && <span style={{ color: '#059669', marginLeft: 6, fontSize: 10, fontWeight: 600 }}>keşif önerisi</span>}</div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>{a.materialName.slice(0, 60)}</div>
            </button>
          ))}
          <button
            onClick={handleAlternativeCancel}
            style={{
              display: 'block', width: '100%', textAlign: 'center', padding: '6px',
              border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer',
              fontSize: 11, color: '#6b7280', borderRadius: 4, marginTop: 4,
            }}
          >
            Kapat (fiyatsız bırak)
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
  diameterField?: string;
}) {
  const {
    data, laborFirms, sheetDiscipline, laborEnabled, onFirmaChange,
    nameField, noField, brandField, quantityField, laborUnitPriceField, laborTotalField,
    diameterField,
    api, node,
  } = props;
  const [candidates, setCandidates] = React.useState<MatchCandidate[] | null>(null);
  const [popupPos, setPopupPos] = React.useState<{ top: number; left: number } | null>(null);
  // AYNI FIX (BrandDropdown ile): eski triggerRef hicbir elemana bagli degildi
  // → labor secim popup'i da HIC acilamiyordu. Wrapper + viewport fallback.
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const computePopupPos = (): { top: number; left: number } => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const raw = rect
      ? { top: rect.bottom + 2, left: rect.left }
      : { top: window.innerHeight * 0.3, left: window.innerWidth * 0.35 };
    return {
      top: Math.max(8, Math.min(raw.top, window.innerHeight - 360)),
      left: Math.max(8, Math.min(raw.left, window.innerWidth - 420)),
    };
  };

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
    // SPEC: satis = net×(1+kar) yukari 1 hane; toplam = satis×miktar.
    const finalPrice = hesaplaSatisBirimFiyat(netPrice, kar);
    const qty = quantityField ? parseFloat(String(data[quantityField] ?? 0)) || 0 : 0;
    const total = hesaplaSatirToplam(finalPrice, qty);

    node.setDataValue('_labNetPrice', netPrice);
    if (laborUnitPriceField) node.setDataValue(laborUnitPriceField, finalPrice.toFixed(1));
    if (laborTotalField) node.setDataValue(laborTotalField, total.toFixed(1));
    console.log(`[FirmaDropdown] row=${data._rowIdx}, net=${netPrice}, kar=${kar}%, final=${finalPrice}, qty=${qty}`);
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

    // AKILLI SUTUN: diameterField varsa isim = Çap + Cins (BrandDropdown ile ayni)
    const baseName = nameField ? String(data[nameField] ?? '').trim() : '';
    const diaVal = diameterField ? String(data[diameterField] ?? '').trim() : '';
    const currentName = joinMaterialText(diaVal, baseName);
    if (!currentName || !onFirmaChange) return;

    // M1/M4: TEK SORGU — baslik+satir birlesimi (aile bilgisiz fallback yasak)
    const fullName = buildMaterialContext(api, node.rowIndex ?? 0, nameField, noField, brandField, quantityField);
    const result = await onFirmaChange(data._rowIdx, firmaId, fullName || currentName);

    if (result && result.candidates && result.candidates.length > 0) {
      setPopupPos(computePopupPos()); // her kosulda acilir (F1)
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
    <div ref={wrapperRef} className="fill-handle-cell" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
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

// PRD v1.1 §4 — build-material-context.ts ile SENKRON tutulur (ikiz mantik):
// H4 olculu satir baslik olamaz, H1/H2 miktar-bos sinyali, C3 kendi kendine
// yeterli satira baslik eklenmez. AG-Grid api versiyonu (displayed rows).
function buildMaterialContextDetailed(
  api: any,
  rowIdx: number,
  nameField?: string,
  noField?: string,
  brandField?: string,
  quantityField?: string,
): { name: string; header: string | null } {
  if (!nameField) return { name: '', header: null };
  const currentNode = api.getDisplayedRowAtIndex(rowIdx);
  if (!currentNode) return { name: '', header: null };
  const currentName = String(currentNode.data[nameField] ?? '').trim();
  if (!currentName) return { name: '', header: null };

  // C3: satir kendi kendine yeterliyse (tip kelimesi / anlamli metin) baslik EKLEME
  if (isSelfSufficientRow(currentName)) return { name: currentName, header: null };

  // Ust satirlara bak — data row'lari, olculu satirlari ve brand dolu
  // malzeme satirlarini ATLA; EN YAKIN gercek baslikta dur (C2)
  let foundParent: string | null = null;
  for (let i = rowIdx - 1; i >= 0; i--) {
    const prev = api.getDisplayedRowAtIndex(i);
    if (!prev) continue;
    if (prev.data._isDataRow) continue;

    const prevName = String(prev.data[nameField] ?? '').trim();
    if (prevName.length <= 2) continue;
    const prevBrand = brandField ? String(prev.data[brandField] ?? '').trim() : '';
    if (prevBrand.length > 0) continue; // marka dolu = malzeme satiri, baslik degil
    if (hasSizeExpression(prevName)) continue; // H4: olculu satir baslik olamaz

    const prevNo = noField ? String(prev.data[noField] ?? '').trim() : '';
    const prevQty = quantityField ? String(prev.data[quantityField] ?? '').trim() : '';
    // H1/H2: noField dolu VEYA miktari bos olan isimli satir baslik adayidir
    if (prevNo.length > 0 || prevQty === '' || prevQty === '0') {
      foundParent = prevName;
      break;
    }
  }

  if (!foundParent) return { name: currentName, header: null };

  // KATMAN 1 SAVUNMA: Cap Sanity Check
  const fullName = `${foundParent} ${currentName}`;
  const currentCap = extractCapFromText(currentName);
  const fullCap = extractCapFromText(fullName);
  const parentCap = extractCapFromText(foundParent);

  if (parentCap && currentCap && parentCap !== currentCap) {
    console.warn(`[buildMaterialContext] Cap mismatch! parent="${foundParent}" (${parentCap}), current="${currentName}" (${currentCap}). Sadece currentName kullanildi.`);
    return { name: currentName, header: null };
  }
  if (currentCap && fullCap && currentCap !== fullCap) {
    console.warn(`[buildMaterialContext] Full cap mismatch! current=${currentCap}, full=${fullCap}. Sadece currentName kullanildi.`);
    return { name: currentName, header: null };
  }

  return { name: fullName, header: foundParent };
}

function buildMaterialContext(
  api: any,
  rowIdx: number,
  nameField?: string,
  noField?: string,
  brandField?: string,
  quantityField?: string,
): string {
  return buildMaterialContextDetailed(api, rowIdx, nameField, noField, brandField, quantityField).name;
}

// ────────────────────────────────────────────
// Grup bandi (Excel-vari "Hat / Sistem" basligi)
// ────────────────────────────────────────────
// AG Grid Community'de Row Grouping yok (Enterprise) — full-width satir ile
// ayni gorsel etki: grup basligi tum genislikte tek bant olarak cizilir.
// _isDataRow=false oldugu icin toplam/kayit/eslestirme akislarina girmez.

function GroupRowBand(params: ICellRendererParams<ExcelRowData>) {
  const label = params.data?._groupLabel ?? '';
  const count = params.data?._groupCount;
  // L3/S2c: library modunda grup bandi ETKILESIMLI — tikla=daralt/genislet,
  // "% uygula" butonu=gruba toplu iskonto. Quote modunda context bos, band
  // eski salt-gorsel davranisinda kalir.
  const ctx: any = params.context ?? {};
  const canToggle = typeof ctx.onToggleGroup === 'function';
  const collapsed = canToggle && ctx.collapsedGroups?.has?.(label);
  return (
    <div
      onClick={canToggle ? () => ctx.onToggleGroup(label) : undefined}
      title={canToggle ? (collapsed ? 'Grubu genişlet' : 'Grubu daralt') : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        height: '100%', padding: '0 10px',
        background: 'linear-gradient(to right, #eef2ff, #f8fafc)',
        borderLeft: '3px solid #4f46e5',
        fontWeight: 700, fontSize: 12, color: '#3730a3',
        cursor: canToggle ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 10 }}>{collapsed ? '▸' : canToggle ? '▾' : '▸'}</span>
      <span>{label}</span>
      {typeof count === 'number' && (
        <span style={{ fontWeight: 500, color: '#6366f1', fontSize: 11 }}>({count} kalem)</span>
      )}
      {typeof ctx.onGroupDiscount === 'function' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); ctx.onGroupDiscount(label); }}
          title="Bu gruptaki tüm satırlara iskonto uygula"
          style={{
            marginLeft: 'auto', padding: '1px 8px', borderRadius: 4,
            border: '1px solid #c7d2fe', background: 'white', color: '#4338ca',
            fontSize: 10, fontWeight: 600, cursor: 'pointer',
          }}
        >
          % iskonto uygula
        </button>
      )}
    </div>
  );
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
  autoAppendRow = false,
  enableStructureEdit = false,
  onColumnsChange,
  mode = 'quote',
  libraryPriceField = 'materialUnitPriceField',
  currencySymbol, conversionRate,
  autoVariantEnabled = true,
  onAutoVariantChange,
  onAutoVariantApplied,
}, ref) {
  const gridRef = useRef<AgGridReact<ExcelRowData>>(null);

  // V4: grup (baslik) → secilen varyant. Cell renderer'lar paylasir.
  const groupVariantsRef = useRef<GroupVariantMap>({});

  // ── Duzeltme Talebi §4.5/K19: MARKA FILL geri-alma yigini ──────────
  // Her surukleme TEK adim: kapsanan satirlarin onceki alanlari + anahtarin
  // onceki durumu birlikte kaydedilir; Ctrl+Z hepsini butun olarak dondurur.
  const markaFillUndoStack = useRef<{
    prevSwitch: boolean;
    entries: { rowId: string; prev: Record<string, any> }[];
  }[]>([]);
  // updatePinnedBottom asagida tanimlanir (useCallback) — erken tanimli
  // callback'ler (undoLastMarkaFill) ref koprusuyle erisir.
  const updatePinnedBottomRef = useRef<(() => void) | null>(null);
  // K19: fill sonrasi odak buraya verilir ki Ctrl+Z yakalanabilsin
  const rootWrapperRef = useRef<HTMLDivElement>(null);

  // ═══════════ ISKONTO TOPLU ISLEMLERI (Iskonto Surukle-Doldur PRD) ═══════════
  // S5: geri alma yigini — her toplu islem (fill / yapistir / gruba veya tum
  // listeye uygula) TEK adim olarak kaydedilir, Ctrl+Z butun olarak geri alir.
  const discountUndoStack = useRef<{ entries: { rowId: string; prev: number; prevDirty: boolean }[] }[]>([]);
  // L3: daraltilmis gruplar (external filter ile satirlari gizler)
  const collapsedGroupsRef = useRef<Set<string>>(new Set());
  // Toolbar "tum listeye uygula" input'u
  const [bulkDiscountInput, setBulkDiscountInput] = useState('');

  /** Grid'i tazele + disariya yayinla (S4 sayaci + S6 tek refresh). */
  const refreshAndEmit = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.refreshCells({ force: true });
    if (onRowDataChange) {
      const all: ExcelRowData[] = [];
      api.forEachNode((n) => { if (n.data) all.push(n.data); });
      onRowDataChange(all);
    }
  }, [onRowDataChange]);

  /** S1/S2/S3 cekirdegi: iskonto degerlerini TOPLU uygular — undo kaydi +
   *  _dirty isareti + tek refresh (satir basina event yok, S6 performans). */
  const applyDiscountBulk = useCallback((pairs: { node: any; value: number }[]): number => {
    const entries: { rowId: string; prev: number; prevDirty: boolean }[] = [];
    for (const { node, value } of pairs) {
      const d = node?.data;
      if (!d?._isDataRow) continue;
      const v = clampDiscount(value);
      if (Number(d._draftDiscount ?? 0) === v && d._dirty) continue;
      entries.push({ rowId: String(d._rowIdx), prev: Number(d._draftDiscount ?? 0), prevDirty: !!d._dirty });
      d._draftDiscount = v;
      d._dirty = true;
    }
    if (entries.length === 0) return 0;
    discountUndoStack.current.push({ entries });
    if (discountUndoStack.current.length > 25) discountUndoStack.current.shift();
    refreshAndEmit();
    return entries.length;
  }, [refreshAndEmit]);

  /** S5: son toplu islemi BUTUN olarak geri al. */
  const undoLastDiscountOp = useCallback((): boolean => {
    const api = gridRef.current?.api;
    const op = discountUndoStack.current.pop();
    if (!api || !op) return false;
    const byId = new Map(op.entries.map((e) => [e.rowId, e]));
    api.forEachNode((n) => {
      const d: any = n.data;
      if (!d) return;
      const e = byId.get(String(d._rowIdx));
      if (e) { d._draftDiscount = e.prev; d._dirty = e.prevDirty; }
    });
    refreshAndEmit();
    return true;
  }, [refreshAndEmit]);

  /** L3: grup daralt/genislet — external filter uyeleri gizler. */
  const toggleGroup = useCallback((key: string) => {
    const s = collapsedGroupsRef.current;
    if (s.has(key)) s.delete(key); else s.add(key);
    const api = gridRef.current?.api;
    api?.onFilterChanged();
    api?.redrawRows(); // band ok isareti (▸/▾) guncellensin
  }, []);

  /** S2c/G6: grup bandindan o kategoriye toplu iskonto. */
  const promptGroupDiscount = useCallback((key: string) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const raw = window.prompt(`"${key}" grubundaki tüm satırlara uygulanacak iskonto % (0-100):`);
    if (raw == null || raw.trim() === '') return;
    const v = parseDiscountInput(raw);
    const pairs: { node: any; value: number }[] = [];
    // forEachNode DARALTILMIS satirlari da kapsar — grup uyeligi _groupKey
    api.forEachNode((n) => {
      if (n.data?._isDataRow && n.data._groupKey === key) pairs.push({ node: n, value: v });
    });
    const applied = applyDiscountBulk(pairs);
    if (applied > 0) toast({ title: `"${key}" grubuna %${v} iskonto uygulandı`, description: `${applied} satır güncellendi — kaydetmeyi unutmayın` });
  }, [applyDiscountBulk]);

  /** S2b: tum listeye uygula (toolbar). */
  const applyDiscountToAll = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api || bulkDiscountInput.trim() === '') return;
    const v = parseDiscountInput(bulkDiscountInput);
    const pairs: { node: any; value: number }[] = [];
    api.forEachNode((n) => { if (n.data?._isDataRow) pairs.push({ node: n, value: v }); });
    const applied = applyDiscountBulk(pairs);
    if (applied > 0) toast({ title: `Tüm listeye %${v} iskonto uygulandı`, description: `${applied} satır güncellendi — kaydetmeyi unutmayın` });
  }, [bulkDiscountInput, applyDiscountBulk]);

  /** K19: son MARKA sureklemesini BUTUN olarak geri al — fiyatlar, statuler,
   *  rozetler ve ANAHTAR DURUMU tek adimda eski haline doner. */
  const undoLastMarkaFill = useCallback((): boolean => {
    const api = gridRef.current?.api;
    const op = markaFillUndoStack.current.pop();
    if (!api || !op) return false;
    const byId = new Map(op.entries.map((en) => [en.rowId, en]));
    api.forEachNode((n: any) => {
      const en = n.data ? byId.get(String(n.data._rowIdx)) : undefined;
      if (!en) return;
      for (const [k, v] of Object.entries(en.prev)) n.data[k] = v;
    });
    api.refreshCells({ force: true });
    onAutoVariantChange?.(op.prevSwitch);
    updatePinnedBottomRef.current?.();
    if (onRowDataChange) {
      const all: ExcelRowData[] = [];
      api.forEachNode((n: any) => { if (n.data) all.push(n.data); });
      onRowDataChange(all);
    }
    console.log(`[FillHandle] Ctrl+Z: ${op.entries.length} satir geri alindi (anahtar → ${op.prevSwitch ? 'Açık' : 'Kapalı'})`);
    return true;
  }, [onAutoVariantChange, onRowDataChange]);

  /** S2a: Ctrl+D — ustteki en yakin veri satirinin iskontosunu kopyala;
   *  S5: Ctrl+Z — son toplu islemi geri al (hucre editi acikken karisilmaz).
   *  K19: quote modunda Ctrl+Z son marka sureklemesini geri alir. */
  const handleLibraryKeyDown = useCallback((e: React.KeyboardEvent) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const isMod = e.ctrlKey || e.metaKey;
    if (!isMod) return;
    // K19: teklif modunda Ctrl+Z = marka surekleme geri-alma
    if (mode === 'quote') {
      if ((e.key === 'z' || e.key === 'Z') && api.getEditingCells().length === 0) {
        if (undoLastMarkaFill()) e.preventDefault();
      }
      return;
    }
    if (mode !== 'library') return;
    if ((e.key === 'z' || e.key === 'Z') && api.getEditingCells().length === 0) {
      if (undoLastDiscountOp()) e.preventDefault();
      return;
    }
    if (e.key === 'd' || e.key === 'D') {
      const fc = api.getFocusedCell();
      if (!fc || fc.column.getColId() !== '_draftDiscount') return;
      e.preventDefault();
      let src: number | null = null;
      for (let i = fc.rowIndex - 1; i >= 0; i--) {
        const n = api.getDisplayedRowAtIndex(i);
        if (n?.data?._isDataRow) { src = Number(n.data._draftDiscount ?? 0); break; }
      }
      const target = api.getDisplayedRowAtIndex(fc.rowIndex);
      if (src != null && target?.data?._isDataRow) applyDiscountBulk([{ node: target, value: src }]);
    }
  }, [mode, undoLastDiscountOp, applyDiscountBulk, undoLastMarkaFill]);

  /** S3: Excel'den cok satirli iskonto yapistirma — odakli hucreden asagi,
   *  grup bantlari atlanir; sigmayan degerlerde uyari (satir uyusmazligi). */
  const handleLibraryPaste = useCallback((e: React.ClipboardEvent) => {
    if (mode !== 'library') return;
    const api = gridRef.current?.api;
    if (!api) return;
    const fc = api.getFocusedCell();
    if (!fc || fc.column.getColId() !== '_draftDiscount') return;
    if (api.getEditingCells().length > 0) return; // hucre editoru kendi paste'ini yapar
    const values = parseDiscountPaste(e.clipboardData.getData('text'));
    if (values.length === 0) return;
    e.preventDefault();
    const pairs: { node: any; value: number }[] = [];
    let vi = 0;
    for (let i = fc.rowIndex; vi < values.length; i++) {
      const n = api.getDisplayedRowAtIndex(i);
      if (!n) break;
      if (!n.data?._isDataRow) continue; // grup bandi/baslik atla
      pairs.push({ node: n, value: values[vi++] });
    }
    const applied = applyDiscountBulk(pairs);
    if (vi < values.length) {
      toast({
        title: 'Satır sayısı uyuşmazlığı',
        description: `${values.length} değerden ${applied} satıra uygulandı — ${values.length - vi} değer tabloya sığmadı`,
        variant: 'destructive',
      });
    } else if (applied > 0) {
      toast({ title: `${applied} iskonto değeri yapıştırıldı`, description: 'Kaydetmeyi unutmayın' });
    }
  }, [mode, applyDiscountBulk]);

  // Grup bandi renderer'ina library etkilesimleri context ile gider
  // (quote modunda bos — band eski salt-gorsel davranisinda kalir)
  const gridContext = useMemo(() => (
    mode === 'library'
      ? { collapsedGroups: collapsedGroupsRef.current, onToggleGroup: toggleGroup, onGroupDiscount: promptGroupDiscount }
      : {}
  ), [mode, toggleGroup, promptGroupDiscount]);

  // ── DINAMIK GRID: sag tik context menu state ──
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number;
    rowData: ExcelRowData | null;
    rowIndex: number | null;
    colField: string | null;
  } | null>(null);

  /** Grid'den guncel tum satirlari topla + onRowDataChange yayinla. */
  const emitRows = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api || !onRowDataChange) return;
    const all: ExcelRowData[] = [];
    api.forEachNode((n) => { if (n.data) all.push(n.data); });
    onRowDataChange(all);
  }, [onRowDataChange]);

  // ── GUVEN KAPISI SAYACI (PRD Bolum 9): "N satir secim bekliyor" ──
  // _matStatus 'yok'/'belirsiz' olan data satirlari sayilir; her hucre
  // degisiminde tazelenir (setDataValue de cellValueChanged tetikler).
  const [pendingCount, setPendingCount] = useState(0);
  const recountPending = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    let n = 0;
    api.forEachNode((node) => {
      const d: any = node.data;
      if (d?._isDataRow && (d._matStatus === 'yok' || d._matStatus === 'belirsiz')) n++;
    });
    setPendingCount(n);
  }, []);
  React.useEffect(() => {
    // rowData degisince (sheet gecisi / yeni yukleme) sayaci tazele
    const t = setTimeout(recountPending, 100);
    return () => clearTimeout(t);
  }, [data.rowData, recountPending]);

  /** Bos veri satiri uret (mevcut kolonlardan). */
  const makeBlankRow = useCallback((): ExcelRowData => {
    const api = gridRef.current?.api;
    let maxIdx = 0;
    api?.forEachNode((n) => { if (n.data && n.data._rowIdx > maxIdx) maxIdx = n.data._rowIdx; });
    const row: any = {
      _rowIdx: maxIdx + 1, _isDataRow: true, _isHeaderRow: false,
      _malzKar: 0, _iscKar: 0, _marka: null, _firma: null,
      _matNetPrice: 0, _labNetPrice: 0,
    };
    for (const c of data.columnDefs) {
      if (!c.field.startsWith('_')) row[c.field] = '';
    }
    return row;
  }, [data.columnDefs]);

  const insertRow = useCallback((atIndex: number) => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.applyTransaction({ add: [makeBlankRow()], addIndex: Math.max(0, atIndex) });
    setCtxMenu(null);
    setTimeout(emitRows, 0);
  }, [makeBlankRow, emitRows]);

  const deleteRow = useCallback((row: ExcelRowData | null) => {
    const api = gridRef.current?.api;
    if (!api || !row) return;
    api.applyTransaction({ remove: [row] });
    setCtxMenu(null);
    setTimeout(emitRows, 0);
  }, [emitRows]);

  const addColumn = useCallback(() => {
    setCtxMenu(null);
    if (!onColumnsChange) return;
    const name = window.prompt('Yeni sütun adı (örn: "Özel İskonto", "Nakliye"):')?.trim();
    if (!name) return;
    if (data.columnDefs.some((c) => c.field === name)) {
      window.alert(`"${name}" adında bir sütun zaten var.`);
      return;
    }
    onColumnsChange([...data.columnDefs, { field: name, headerName: name, width: 120, editable: true }]);
  }, [onColumnsChange, data.columnDefs]);

  const removeColumn = useCallback((field: string | null) => {
    setCtxMenu(null);
    if (!onColumnsChange || !field) return;
    // Sistem + rol kolonlari silinemez (hesap/kayit zinciri bozulur)
    const roleFields = new Set(Object.values(data.columnRoles).filter(Boolean) as string[]);
    if (field.startsWith('_') || roleFields.has(field)) {
      window.alert('Bu sütun sistem tarafından kullanılıyor, silinemez.');
      return;
    }
    if (!window.confirm(`"${field}" sütunu ve içindeki veriler tablodan kaldırılacak. Emin misiniz?`)) return;
    onColumnsChange(data.columnDefs.filter((c) => c.field !== field));
  }, [onColumnsChange, data.columnDefs, data.columnRoles]);

  // ── Fill Handle (surukle-doldur) ──
  const FILLABLE_FIELDS = useMemo(() => new Set([
    '_malzKar', '_marka', '_iscKar', '_firma', '_draftDiscount',
  ]), []);

  const handleFillComplete = useCallback(async (result: { field: string; value: any; sourceRowIndex: number; targetRowNodes: any[] }) => {
    const api = gridRef.current?.api;
    if (!api) return;

    const { nameField, quantityField, materialUnitPriceField, materialTotalField,
            laborUnitPriceField, laborTotalField, diameterField } = data.columnRoles;

    // AKILLI SUTUN: diameterField varsa eslestirme adi = Çap + Cins birlesimi
    const lookupNameOf = (rowData: any): string => {
      const n = nameField ? String(rowData[nameField] ?? '').trim() : '';
      const d = diameterField ? String(rowData[diameterField] ?? '').trim() : '';
      return joinMaterialText(d, n);
    };

    if (result.field === '_marka' && onBrandChange) {
      // ── Duzeltme Talebi §4: SUREKLE-DOLDUR = ACIK NIYET ──────────────
      // 1) Anahtar otomatik ACILIR (Ctrl+Z eski durumuna dondurur).
      // 2) Kaynak satirin marka + CINS'i (varyant kimligi) "kullanici secti"
      //    kabul edilir — kaynak KENDI satirinda saklanir (_matVariantTags),
      //    yoksa grubun son secimi kullanilir.
      // 3) Her satira KENDI capinin fiyati motor uzerinden yazilir — kaynak
      //    fiyat ASLA kopyalanmaz (K17 yapisal: deger degil SORGU tasinir).
      // 4) Manuel satir ATLANMAZ — acik niyet uzerine yazar (rozetten cozulur).
      const prevSwitch = autoVariantEnabled;
      onAutoVariantChange?.(true); // K15/K18: anahtar gorsel geciyle ACILIR
      const srcNode = api.getDisplayedRowAtIndex(result.sourceRowIndex);
      const srcDet = buildMaterialContextDetailed(
        api, result.sourceRowIndex,
        nameField, data.columnRoles.noField, data.columnRoles.brandField, quantityField,
      );
      const srcTags: string[] | undefined =
        (srcNode?.data?._matVariantTags && srcNode.data._matVariantTags.length > 0
          ? srcNode.data._matVariantTags
          : undefined) ??
        (srcDet.header ? groupVariantsRef.current[srcDet.header]?.tags : undefined);
      const srcLabel: string =
        srcNode?.data?._matVariantLabel ??
        (srcDet.header ? groupVariantsRef.current[srcDet.header]?.label : undefined) ??
        '';

      // K19: geri-alma anligi — kapsanan satirlarin ONCEKI degerleri
      const SNAP_FIELDS = ['_marka', '_matNetPrice', '_matSuggestion', '_matStatus',
        '_matVariantMode', '_matAutoVariant', '_matVariantTags', '_matVariantLabel'];
      const undoEntries: { rowId: string; prev: Record<string, any> }[] = [];
      for (const node of result.targetRowNodes) {
        if (!node.data?._isDataRow) continue;
        const prev: Record<string, any> = {};
        for (const f of SNAP_FIELDS) prev[f] = node.data[f];
        if (materialUnitPriceField) prev[materialUnitPriceField] = node.data[materialUnitPriceField];
        if (materialTotalField) prev[materialTotalField] = node.data[materialTotalField];
        undoEntries.push({ rowId: String(node.data._rowIdx), prev });
      }
      markaFillUndoStack.current.push({ prevSwitch, entries: undoEntries });

      let applied = 0; let waiting = 0; let missing = 0;
      for (const node of result.targetRowNodes) {
        if (!node.data?._isDataRow) continue;
        node.setDataValue('_marka', result.value);
        const currentName = lookupNameOf(node.data);
        if (!currentName) continue;
        try {
          const det = buildMaterialContextDetailed(
            api, node.rowIndex ?? 0,
            nameField, data.columnRoles.noField, data.columnRoles.brandField, quantityField,
          );
          const opts = srcTags ? { variantTags: srcTags, silent: true } : { silent: true };
          // M1/M4: TEK SORGU — baslik+satir; aile bilgisiz fallback YASAK
          // (yanlis aileden fiyat yazilmasin — "Cayirova'ya PP vana" vakasi)
          const matchResult = await onBrandChange(node.data._rowIdx, result.value, det.name || currentName, opts);
          if (matchResult && matchResult.netPrice > 0) {
            node.setDataValue('_matNetPrice', matchResult.netPrice);
            node.setDataValue('_matSuggestion', matchResult.confidence === 'suggestion');
            node.setDataValue('_matStatus', '');
            // Surukleme kapsami = kullanici secimi kabul (manuel dahi ezilir,
            // rozetle cozulebilir otomatik statusune gecer)
            node.setDataValue('_matAutoVariant', srcLabel || null);
            node.setDataValue('_matVariantMode', 'auto');
            node.data._matVariantTags = srcTags ?? null;
            node.data._matVariantLabel = srcLabel || null;
            const kar = parseFloat(String(node.data._malzKar ?? 0)) || 0;
            const finalPrice = hesaplaSatisBirimFiyat(matchResult.netPrice, kar);
            const qty = quantityField ? parseFloat(String(node.data[quantityField] ?? 0)) || 0 : 0;
            if (materialUnitPriceField) node.setDataValue(materialUnitPriceField, finalPrice.toFixed(1));
            if (materialTotalField) node.setDataValue(materialTotalField, hesaplaSatirToplam(finalPrice, qty).toFixed(1));
            applied++;
          } else if (matchResult?.candidates?.length) {
            // K-sart 4: marka+cins sonrasi >1 urun — "secim gerekli" rozeti
            node.setDataValue('_matStatus', 'belirsiz');
            waiting++;
          } else {
            // K16: cap bu markada yok — fiyat yazilmaz, eylemli isaret
            // (hucreye tiklaninca M3 alternatif markalar akisi zaten calisir)
            node.setDataValue('_matStatus', matchResult?.notProduct ? 'urun_degil' : 'yok');
            missing++;
          }
        } catch {}
      }
      // §3: "n satır güncellendi" bilgisi (parent toast)
      onAutoVariantApplied?.({ applied, waiting, missing, kaynak: srcLabel || 'marka' });
      // K19: Ctrl+Z'nin yakalanmasi icin odak grid sarmalayicisina
      rootWrapperRef.current?.focus();
    } else if (result.field === '_firma' && onFirmaChange) {
      // Firma fill → her satir icin labor matching tetikle
      for (const node of result.targetRowNodes) {
        if (!node.data?._isDataRow) continue;
        node.setDataValue('_firma', result.value);
        const currentName = lookupNameOf(node.data);
        if (!currentName) continue;
        try {
          const matchResult = await onFirmaChange(node.data._rowIdx, result.value, currentName);
          if (matchResult && matchResult.netPrice > 0) {
            node.setDataValue('_labNetPrice', matchResult.netPrice);
            const kar = parseFloat(String(node.data._iscKar ?? 0)) || 0;
            const finalPrice = hesaplaSatisBirimFiyat(matchResult.netPrice, kar);
            const qty = quantityField ? parseFloat(String(node.data[quantityField] ?? 0)) || 0 : 0;
            if (laborUnitPriceField) node.setDataValue(laborUnitPriceField, finalPrice.toFixed(1));
            if (laborTotalField) node.setDataValue(laborTotalField, hesaplaSatirToplam(finalPrice, qty).toFixed(1));
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
    } else if (result.field === '_draftDiscount') {
      // S1: iskonto fill — undo kaydi + _dirty + net fiyat tek refresh'te
      // (applyDiscountBulk refreshAndEmit yapar; asagidaki genel emit de zararsiz)
      const v = clampDiscount(parseFloat(String(result.value ?? '').replace(',', '.')));
      applyDiscountBulk(result.targetRowNodes.map((n) => ({ node: n, value: v })));
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
  }, [data.columnRoles, onBrandChange, onFirmaChange, onRowDataChange, applyDiscountBulk,
      autoVariantEnabled, onAutoVariantChange, onAutoVariantApplied]);

  useFillHandle({
    gridRef,
    fillableFields: FILLABLE_FIELDS,
    onFillComplete: handleFillComplete,
    // S1: kutuphane modunda da aktif (_draftDiscount surukle-doldur)
    enabled: mode === 'quote' || mode === 'library',
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
  updatePinnedBottomRef.current = updatePinnedBottom;

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
            diameterField={data.columnRoles.diameterField}
            groupVariants={groupVariantsRef}
            autoVariantEnabled={autoVariantEnabled}
            onAutoVariantApplied={onAutoVariantApplied}
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
            diameterField={data.columnRoles.diameterField}
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
          // SPEC: 1 ondalik hane goster (3.019,2)
          const formatted = (v * conversionRate).toLocaleString('tr-TR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          });
          // Z4: satirin kendi para birimi varsa (_currency — kutuphane gridi)
          // onun sembolu basilir; yoksa global sembol (teklif akisi)
          const rowCurr = (params.data as any)?._currency;
          const sym = rowCurr ? (ROW_CURRENCY_SYMBOL[rowCurr] ?? currencySymbol) : currencySymbol;
          return `${sym}${formatted}`;
        };
        // Malzeme birim fiyat — ALTIN KURAL isaretleri:
        //   mavi  = 'otomatik varyant' (V4.1 — grup seciminden atandi)
        //   sari  = 'oneri' (cap-only/baslik-ipucu eslesmesi, kontrol edin)
        //   kirmizi = 'yok' (kutuphanede eslesme yok — aktarim/secim bekliyor)
        //   gri   = 'urun_degil' (oran/hizmet satiri — fiyat beklenmiyor)
        if (field === data.columnRoles.materialUnitPriceField) {
          base.cellStyle = ((params: any) => {
            if (!params.node?.rowPinned) {
              if (params.data?._matAutoVariant) {
                return { textAlign: 'right', backgroundColor: '#e0f2fe', color: '#0c4a6e' };
              }
              if (params.data?._matSuggestion) {
                return { textAlign: 'right', backgroundColor: '#fef9c3', color: '#854d0e' };
              }
              if (params.data?._matStatus === 'yok' || params.data?._matStatus === 'belirsiz') {
                return { textAlign: 'right', backgroundColor: '#fee2e2' };
              }
              if (params.data?._matStatus === 'urun_degil') {
                return { textAlign: 'right', backgroundColor: '#f1f5f9' };
              }
            }
            return { textAlign: 'right' };
          }) as any;
          // V4.1 rozet + neden tooltip'i: otomatik varyant / secim bekliyor
          base.tooltipValueGetter = ((params: any) => {
            const d = params.data;
            if (!d || params.node?.rowPinned) return '';
            if (d._matAutoVariant) return `⚡ otomatik: ${d._matAutoVariant} — farklı varyant için marka menüsünü yeniden açın`;
            if (d._matStatus === 'belirsiz') return 'Seçim bekliyor — marka menüsünü açıp varyant seçin';
            if (d._matStatus === 'yok') return 'Kütüphanede eşleşme yok';
            if (d._matStatus === 'urun_degil') return 'Oran/hizmet satırı — fiyat beklenmiyor';
            if (d._matSuggestion) return 'Öneri — kontrol edin';
            return '';
          }) as any;
        } else {
          base.cellStyle = { textAlign: 'right' };
        }
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
        // S1: fill-handle-cell sarmalayici — hucrenin alt kenarindan
        // surukle-doldur baslar (kar % kolonlariyla ayni mekanizma)
        cellRenderer: (p: any) => {
          if (!p.data?._isDataRow) return null;
          const v = p.value;
          const txt = (v === undefined || v === null || v === '') ? '%0' : `%${Number(v).toFixed(0)}`;
          return (
            <div className="fill-handle-cell" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{txt}</span>
            </div>
          );
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
          // SPEC ASAMA A: net = liste×(1-iskonto), YUKARI 1 hane
          return hesaplaNetFiyat(listPrice, discount);
        },
        valueFormatter: (p: any) => {
          const v = parseFloat(String(p.value ?? ''));
          if (isNaN(v) || v === 0) return '';
          const formatted = (v * conversionRate).toLocaleString('tr-TR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          });
          // Z4: net fiyat da satirin kendi para birimiyle gosterilir
          const rowCurr = p.data?._currency;
          const sym = rowCurr ? (ROW_CURRENCY_SYMBOL[rowCurr] ?? currencySymbol) : currencySymbol;
          return `${sym}${formatted}`;
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
        e.node.setDataValue(grandUnitPriceField, grandUnit > 0 ? yukariYuvarla(grandUnit).toFixed(1) : '');
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
        e.node.setDataValue(grandTotalField, yukariYuvarla(grandTotal).toFixed(1));
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
        const finalPrice = hesaplaSatisBirimFiyat(net, kar);
        const qty = parseFloat(String(row[quantityField] ?? 0)) || 0;
        const total = hesaplaSatirToplam(finalPrice, qty);
        e.node.setDataValue(materialUnitPriceField, finalPrice.toFixed(1));
        e.node.setDataValue(materialTotalField, total.toFixed(1));
        console.log(`[ExcelGrid] Malz. kar recalc: row=${row._rowIdx}, net=${net}, kar=${kar}%, final=${finalPrice}, qty=${qty}, total=${total}`);
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
        const finalPrice = hesaplaSatisBirimFiyat(net, kar);
        const qty = parseFloat(String(row[quantityField] ?? 0)) || 0;
        const total = hesaplaSatirToplam(finalPrice, qty);
        e.node.setDataValue(laborUnitPriceField, finalPrice.toFixed(1));
        e.node.setDataValue(laborTotalField, total.toFixed(1));
        console.log(`[ExcelGrid] Isc. kar recalc: row=${row._rowIdx}, net=${net}, kar=${kar}%, final=${finalPrice}, qty=${qty}, total=${total}`);
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
          const finalPrice = hesaplaSatisBirimFiyat(matNet, matKar);
          e.node.setDataValue(materialTotalField, hesaplaSatirToplam(finalPrice, qty).toFixed(1));
        }
      }

      if (laborUnitPriceField && laborTotalField) {
        const labKar = parseFloat(String(row._iscKar ?? 0)) || 0;
        const labNet = typeof row._labNetPrice === 'number' && row._labNetPrice > 0
          ? row._labNetPrice
          : parseFloat(String(row[laborUnitPriceField] ?? '')) || 0;
        if (labNet > 0) {
          const finalPrice = hesaplaSatisBirimFiyat(labNet, labKar);
          e.node.setDataValue(laborTotalField, hesaplaSatirToplam(finalPrice, qty).toFixed(1));
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
      e.node.setDataValue('_matStatus', ''); // manuel fiyat girildi — bekleme isareti kalkar
      const qty = parseFloat(String(row[quantityField] ?? 0)) || 0;
      e.node.setDataValue(materialTotalField, hesaplaSatirToplam(enteredPrice, qty).toFixed(1));
      setTimeout(() => { recalcGrand(); updatePinnedBottom(); }, 0);
      console.log(`[ExcelGrid] Manuel malz. birim: row=${row._rowIdx}, entered=${enteredPrice}, kar=${kar}%, net=${net.toFixed(2)}, qty=${qty}`);
    }

    // ── Iscilik birim fiyat manuel degisti ──
    if (e.colDef.field === laborUnitPriceField && e.source === 'edit' && laborTotalField && quantityField) {
      const enteredPrice = parseFloat(String(e.newValue ?? '').replace(',', '.')) || 0;
      const kar = parseFloat(String(row._iscKar ?? 0)) || 0;
      const net = kar > 0 ? enteredPrice / (1 + kar / 100) : enteredPrice;
      e.node.setDataValue('_labNetPrice', net);
      const qty = parseFloat(String(row[quantityField] ?? 0)) || 0;
      e.node.setDataValue(laborTotalField, hesaplaSatirToplam(enteredPrice, qty).toFixed(1));
      setTimeout(() => { recalcGrand(); updatePinnedBottom(); }, 0);
      console.log(`[ExcelGrid] Manuel isc. birim: row=${row._rowIdx}, entered=${enteredPrice}, kar=${kar}%, net=${net.toFixed(2)}, qty=${qty}`);
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

    // ── AUTO-APPEND: en alttaki bos satir dolduysa yeni bos satir ekle ──
    // Excel davranisi — "Satir Ekle" butonu YOK. Kullanici spare satira
    // yazmaya baslar baslamaz o satir gercek satira donusur, altina yeni
    // spare eklenir.
    if (autoAppendRow && row._isSpareRow && gridRef.current?.api) {
      const hasContent = data.columnDefs.some(
        (c) => !c.field.startsWith('_') && String(row[c.field] ?? '').trim() !== '',
      );
      if (hasContent) {
        row._isSpareRow = false;
        let maxIdx = 0;
        gridRef.current.api.forEachNode((n) => {
          if (n.data && n.data._rowIdx > maxIdx) maxIdx = n.data._rowIdx;
        });
        const spare: any = {
          _rowIdx: maxIdx + 1,
          _isDataRow: true,
          _isHeaderRow: false,
          _isSpareRow: true,
          _malzKar: 0, _iscKar: 0, _marka: null, _firma: null,
          _matNetPrice: 0, _labNetPrice: 0,
        };
        for (const c of data.columnDefs) {
          if (!c.field.startsWith('_')) spare[c.field] = '';
        }
        gridRef.current.api.applyTransaction({ add: [spare] });
      }
    }

    // Disariya canli rowData yayinla (fiyat listesi yuklemede gerekli)
    if (onRowDataChange && gridRef.current?.api) {
      const allRows: ExcelRowData[] = [];
      gridRef.current.api.forEachNode((node) => {
        if (node.data) allRows.push(node.data);
      });
      onRowDataChange(allRows);
    }

    // Guven kapisi sayaci tazele (PRD Bolum 9)
    recountPending();
  }, [data.columnRoles, data.columnDefs, onRowDataChange, autoAppendRow, recountPending]);

  // getRowId — stabil row kimligi (re-render'da row'un durumunu korur)
  const getRowId = useCallback((params: GetRowIdParams<ExcelRowData>) => {
    return String(params.data._rowIdx);
  }, []);

  return (
    // tabIndex=-1: surukle-doldur sonrasi programatik odak — Ctrl+Z (K19)
    // wrapper'a ulassin (odak grid disinda kalirsa keydown yakalanamazdi)
    <div className="w-full outline-none" tabIndex={-1} ref={rootWrapperRef} onKeyDown={handleLibraryKeyDown} onPaste={handleLibraryPaste}>
      {/* GUVEN KAPISI SAYACI (PRD Bolum 9): eslesmeyen/belirsiz satirlar
          gorunur kilinir — "eslestirme emin degilse fiyat uydurmaz". */}
      {mode === 'quote' && pendingCount > 0 && (
        <div className="mb-1 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-800">
          <span className="font-semibold">⚠ {pendingCount} satır seçim bekliyor</span>
          <span className="text-red-600">— kırmızı hücreler: eşleşme yok/belirsiz · sarı: öneri (kontrol edin) · gri: ürün değil</span>
        </div>
      )}
      {/* ISKONTO ARAC CUBUGU (S2b): tum listeye tek hamlede iskonto +
          kisayol ipuclari. Yalniz kutuphane modunda. */}
      {mode === 'library' && (
        <div className="mb-1 flex flex-wrap items-center gap-2 rounded border border-indigo-200 bg-indigo-50/60 px-3 py-1.5 text-xs text-indigo-900">
          <span className="font-semibold">İskonto %</span>
          <input
            value={bulkDiscountInput}
            onChange={(e) => setBulkDiscountInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyDiscountToAll(); e.stopPropagation(); }}
            placeholder="örn 30"
            className="h-6 w-16 rounded border border-indigo-300 bg-white px-1.5 text-right text-xs outline-none"
          />
          <button
            type="button"
            onClick={applyDiscountToAll}
            disabled={bulkDiscountInput.trim() === ''}
            className="rounded border border-indigo-300 bg-white px-2 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"
          >
            Tüm listeye uygula
          </button>
          <span className="text-[10px] text-indigo-400">
            Sürükle-doldur: iskonto hücresinin alt kenarından · Ctrl+D: üstteki değeri kopyala · Ctrl+V: Excel&apos;den sütun yapıştır · Ctrl+Z: son toplu işlemi geri al · Grup bandı: daralt/genişlet + gruba iskonto
          </span>
        </div>
      )}
    <div className="ag-theme-alpine w-full" style={{ height: '80vh' }}>
      <AgGridReact<ExcelRowData>
        ref={gridRef}
        theme="legacy"
        rowData={data.rowData}
        context={gridContext}
        // L3: daraltilmis gruplarin uyeleri gizlenir (grup bandi gorunur kalir)
        isExternalFilterPresent={() => collapsedGroupsRef.current.size > 0}
        doesExternalFilterPass={(node) => {
          const k = (node.data as any)?._groupKey;
          return !k || !collapsedGroupsRef.current.has(k);
        }}
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
        // Excel-vari GRUP BANDI: _isGroupRow satirlari tum genislikte cizilir
        // (AG Grid Community'de rowGrouping yok — full-width satir ayni etki)
        isFullWidthRow={(p) => p.rowNode.data?._isGroupRow === true}
        fullWidthCellRenderer={GroupRowBand}
        // Excel-vari klavye: Enter → alt hucre (edit sonrasi da), ok/Tab native
        enterNavigatesVertically
        enterNavigatesVerticallyAfterEdit
        // DINAMIK GRID: sag tik → custom context menu (AG Grid Community'de
        // yerlesik menu yok — Enterprise ozelligi; kendi menumuzu ciziyoruz)
        preventDefaultOnContextMenu={enableStructureEdit}
        onCellContextMenu={(e) => {
          if (!enableStructureEdit) return;
          const me = e.event as MouseEvent | null;
          if (!me) return;
          setCtxMenu({
            x: me.clientX, y: me.clientY,
            rowData: (e.data as ExcelRowData) ?? null,
            rowIndex: e.rowIndex,
            colField: (e.colDef?.field as string) ?? null,
          });
        }}
      />

      {/* ── SAG TIK CONTEXT MENU (satir/sutun CRUD) ── */}
      {ctxMenu && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div
            className="fixed z-[9999] min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl"
            style={{ top: Math.min(ctxMenu.y, window.innerHeight - 230), left: Math.min(ctxMenu.x, window.innerWidth - 210) }}
          >
            <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
              onClick={() => insertRow(ctxMenu.rowIndex ?? 0)}>
              ↥ Üste satır ekle
            </button>
            <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
              onClick={() => insertRow((ctxMenu.rowIndex ?? 0) + 1)}>
              ↧ Alta satır ekle
            </button>
            <button type="button"
              className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={!ctxMenu.rowData || ctxMenu.rowData._isPinnedTotal}
              onClick={() => deleteRow(ctxMenu.rowData)}>
              ✕ Satırı sil
            </button>
            {onColumnsChange && (
              <>
                <div className="my-1 border-t border-slate-100" />
                <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
                  onClick={addColumn}>
                  ⊞ Sütun ekle…
                </button>
                <button type="button"
                  className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  disabled={!ctxMenu.colField}
                  onClick={() => removeColumn(ctxMenu.colField)}>
                  ⊟ &quot;{ctxMenu.colField && !ctxMenu.colField.startsWith('_') ? ctxMenu.colField : 'Sütun'}&quot; sütununu sil
                </button>
              </>
            )}
          </div>
        </>,
        document.body,
      )}
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
    </div>
  );
});
