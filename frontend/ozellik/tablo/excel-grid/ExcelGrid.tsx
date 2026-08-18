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
import { SATIR_YUKSEKLIGI } from './types';
// S2: oneri kutusunun kesinlik/onay karari — IKI kutu da buradan okur
import { oneriBasligi, cekinceSatiri } from './oneri-cekince';
import { useFillHandle, FillHandleIndicator } from './useFillHandle';
import { clampDiscount, parseDiscountInput, parseDiscountPaste } from './discount-utils';
import { CustomDropdown } from './CustomDropdown';
import { fillDown, karYayilimi } from './fill-down';
import { isaretStili, isaretTooltip, secimBekliyor, type IsaretGirdisi } from './isaret';
import { joinMaterialText } from '@/ozellik/tablo/parse-material-text';
import { hesaplaNetFiyat, hesaplaSatisBirimFiyat, hesaplaSatirToplam, yukariYuvarla, etkinMiktar, paraBicim, sayfaToplamlari, karSatiri, maliyetiGeriTuret, PARA_ONDALIK } from '@/ozellik/fiyat/pricing';
// KÂR HÜCRESİ TEK SÜZGEÇTEN: `parseFloat(String(x)) || 0` kopyaları
// kaydetme yolundaki `sayiAlani` ile AYRIŞIYORDU — "12,5" ekranda 12,
// kayıtta 12,5 oluyordu (TR klavye). Tek fonksiyon, tek sayı.
import { sayiAlani } from '@/ozellik/fiyat/sayi-alani';
import { hasSizeExpression, isSelfSufficientRow } from './build-material-context';
import { niteliklerdenBaglam, adayEtiketleri, popupGenisligiOku, popupGenisligiYaz } from './aday-ayirt-edicilik';
import httpApi from '@/ortak/lib/api';
import { toast } from '@/ortak/hooks/use-toast';
import { confirm, promptValue } from '@/ortak/hooks/use-confirm';

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
    // Otoyazan adayin varyant kimligi — "son secim" zincirini besler
    variantTags?: string[];
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
  /** PRD v3.0 Bolum A2: "kat" olarak isaretlenen sutunlar. Dolu ise MIK
   *  (columnRoles.quantityField) = bu sutunlarin satir-toplami; kat hucresi
   *  duzenlenince MIK otomatik yeniden hesaplanir. */
  floorFields?: string[];
  // Iscilik tarafi
  laborFirms?: LaborFirm[];
  sheetDiscipline?: 'mechanical' | 'electrical' | null;
  laborEnabled?: boolean;
  // PRD Iscilik (tek motor): onBrandChange ile AYNI sozlesme — variantTags
  // (surukleme kalem-cinsi tasimasi, L7) + silent; donuste alternatives (L5),
  // variantTags/autoVariant/notProduct motor ortak alanlari.
  onFirmaChange?: (rowIdx: number, firmaId: string, laborName: string, opts?: {
    variantTags?: string[];
    silent?: boolean;
  }) => Promise<{
    netPrice: number;
    matchedName?: string;
    candidates?: MatchCandidate[];
    reason?: string;
    confidence?: 'high' | 'suggestion' | string;
    notProduct?: boolean;
    donusum?: string;
    autoVariant?: boolean;
    hafizaOtoyaz?: boolean;
    variantTags?: string[];
    variantMissing?: boolean;
    // L5: bu firmada yok — kalemi sunan diger firmalar (fiyatli).
    // BrandAlternative alanlari FIRMA tasir (brandId=firmaId, brandName=firma adi).
    alternatives?: BrandAlternative[];
  } | null>;
  // Hucre duzenleme sonrasi disariya canli rowData'yi yayar (fiyat listesi yuklemede kullanilir)
  onRowDataChange?: (rows: ExcelRowData[]) => void;
  /** GS8: kullanici kolon genisligini surukleyerek degistirdiginde — teklifle
   *  birlikte kaydedilmesi icin parent'a bildirilir. */
  onColumnWidthsChange?: (widths: Record<string, number>) => void;
  /** GS8: kayittan gelen genislik tercihi (teklif yeniden acildiginda) */
  columnWidths?: Record<string, number>;
  /** Excel-vari "en altta hep bos satir": _isSpareRow satiri dolunca otomatik
   *  yenisi eklenir ('Satir Ekle' butonu YOK). DWG metraj akisinda acilir. */
  autoAppendRow?: boolean;
  /** DINAMIK GRID: sag tik context menu ile araya satir ekle/sil ve sutun
   *  ekle/sil. Teklif duzenleme ekraninda acilir (detay sayfasi salt okunur). */
  enableStructureEdit?: boolean;
  /** Sutun ekle/sil sonrasi YENI columnDefs — parent (quotes/new) multiSheet
   *  state'ini gunceller; draft + kayit (sheetsPayload) otomatik persist olur. */
  onColumnsChange?: (defs: ExcelGridData['columnDefs']) => void;
  /**
   * KALICI SATIR SILME (06.08 kullanici bildirimi: "ilave eklediklerimi
   * silemiyorum").
   *
   * VERILMEZSE davranis DEGISMEZ: `deleteRow` satiri yalnizca gridden kaldirir.
   * Teklif ekraninda DOGRUSU budur — orada satir zaten sayfanin kendi
   * kaydiyla persist olur. Kutuphanede ise satirin arkasinda kendi kaydi
   * (UserLibrary) vardir; yalniz gridden silmek sayfa yenilenince satirin
   * GERI GELMESI demekti — kullanicinin gordugu semptom buydu.
   *
   * Sozlesme: `true` donerse satir gridden kaldirilir, `false` donerse
   * KALDIRILMAZ (silme reddedildi/iptal edildi/basarisiz). Boylece "ekrandan
   * gitti ama sunucuda duruyor" hali YAPISAL OLARAK imkansiz.
   */
  onRowDelete?: (row: ExcelRowData) => Promise<boolean>;
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
  unitField?: string;
  materialUnitPriceField?: string;
  materialTotalField?: string;
  diameterField?: string;
  groupVariants: React.MutableRefObject<GroupVariantMap>;
  autoVariantEnabled: boolean;
  onAutoVariantApplied?: Props['onAutoVariantApplied'];
}) {
  const { data, brands, onBrandChange, nameField, noField, brandField, quantityField, unitField, materialUnitPriceField, materialTotalField, diameterField, groupVariants, autoVariantEnabled, onAutoVariantApplied, api, node } = props;
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
  // PU4: kullanicinin popup genislik tercihi oturum boyunca hatirlanir.
  // EKSIK HALKA (31.07): anahtar yalnizca OKUNUYOR, yazan tek satir YOKTU —
  // kullanici popup'i genisletse de bir sonraki popup yine varsayilan
  // genislikte aciliyordu. CSS `resize: both` DOM olayi uretmedigi icin yeni
  // genislik ResizeObserver ile yakalanip kaydedilir (sozlesme: PU4_* testleri).
  // ⚠ IKINCI HALKA (31.07, canli bulgu): genislik REACT KONTROLUNDE bir inline
  // stildi (`width: popupGenislik`) ama CSS `resize` tarayicinin AYNI inline
  // stile yazmasiyla calisir. Her yeniden render (tip secimine gecis, filtre,
  // "tumunu gor") React'in degerini geri yaziyor → kullanici surukluyor, popup
  // GERI SICRIYOR. Ustelik setter hic kullanilmadigi icin React kullanicinin
  // olcusunu asla ogrenmiyordu. Cozum: ResizeObserver olcuyu STATE'e de yazar,
  // boylece React'in degeri her zaman ekrandakiyle ayni olur.
  const [popupGenislik, setPopupGenislik] = React.useState<number>(() => popupGenisligiOku());
  const popupRef = React.useRef<HTMLDivElement | null>(null);
  const popupAcik = !!(candidates && candidates.length > 0 && popupPos);
  React.useEffect(() => {
    const el = popupRef.current;
    if (!popupAcik || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      popupGenisligiYaz(w);
      // Ayni degerde setState React'te yeniden render URETMEZ; dolayisiyla
      // ResizeObserver ile sonsuz dongu olusmaz.
      setPopupGenislik((onceki) => (Math.abs(onceki - w) >= 1 ? w : onceki));
      // Popup BUYUYUNCE (tip secimine gecis, "tumunu gor", kullanici
      // surukledi) kutu ekrandan tasabilir ve tutamac erisilemez olur —
      // her boyut degisiminde konum yeniden kirpilir.
      const pay = 12;
      setPopupPos((onceki) => {
        if (!onceki) return onceki;
        const left = Math.max(pay, Math.min(onceki.left, window.innerWidth - r.width - pay));
        const top = Math.max(pay, Math.min(onceki.top, window.innerHeight - r.height - pay));
        return (Math.abs(left - onceki.left) > 1 || Math.abs(top - onceki.top) > 1)
          ? { top, left } : onceki;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [popupAcik]);

  // ⚠ UCUNCU HALKA (31.07, canli bulgu): "seçim çerçevesini genişletemiyorum".
  // Olculdu — popup'in SAG-ALT KOSESI VIEWPORT DISINDA kaliyordu:
  //   elementFromPoint(sag-6, alt-6) → null · kosePopupMu=false
  // Boyutlandirma tutamaci tam orada oldugu icin fare ona hic erisemiyor.
  // Kok neden: `computePopupPos` konumu 360x420 VARSAYIMIYLA kirpiyor, oysa
  // gercek kutu 520 genis ve maxHeight 70vh'a kadar uzayabiliyor; tasan kisim
  // ekran disinda kaliyor. Cozum: popup CIZILDIKTEN sonra GERCEK olcusuyle
  // yeniden konumlandirilir — tamami (tutamac dahil) ekranda kalir.
  React.useLayoutEffect(() => {
    const el = popupRef.current;
    if (!popupAcik || !el || !popupPos) return;
    const r = el.getBoundingClientRect();
    const pay = 12;
    const left = Math.max(pay, Math.min(popupPos.left, window.innerWidth - r.width - pay));
    const top = Math.max(pay, Math.min(popupPos.top, window.innerHeight - r.height - pay));
    // Ayni degerde setState render uretmez → dongu olmaz.
    if (Math.abs(left - popupPos.left) > 1 || Math.abs(top - popupPos.top) > 1) {
      setPopupPos({ top, left });
    }
  }, [popupAcik, popupPos, popupGenislik]);
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
  // KOLONU OLMAYAN ALANA YAZIM (06.08 canli hata): AG-Grid setDataValue,
  // colKey bir kolona cozulmezse veriye DOKUNMADAN false doner. `_matNetPrice`,
  // `_labNetPrice`, `_matKurBilgi` hicbir columnDefs'te YOK → yazimlar sessizce
  // dusuyordu ve alan hep 0 kaliyordu. fill-down.ts:163-169'da ayni tuzak icin
  // zaten bir `yaz()` yardimcisi vardi; buraya uygulanmamisti.
  // ⚠ Cozum "gercek kolon yapmak" DEGIL: kolonlasan alan columnDefs/kayit/
  // gizle-goster/export yollarina sizar ve isSetValueSupported yine sessizce
  // false donebilir. Dogrusu veriye DOGRUDAN yazmak (emitRows n.data'yi
  // yayinladigi icin round-trip guvenli).
  const yazVeri = (targetNode: any, alan: string, deger: any) => {
    if (targetNode?.data) targetNode.data[alan] = deger;
    try { targetNode?.setDataValue?.(alan, deger); } catch { /* kolon yok — veri yazimi yeterli */ }
  };

  const writePriceToNode = (targetNode: any, netPrice: number, isSuggestion = false, kaynakKur?: any) => {
    const d = targetNode.data;
    const kar = sayiAlani(d._malzKar);
    // SPEC (fiyat cekirdegi): satis = net×(1+kar), YUKARI 1 hane; toplam = satis×miktar.
    const finalPrice = hesaplaSatisBirimFiyat(netPrice, kar);
    const qty = etkinMiktar(d, quantityField, unitField); // UY2
    const total = hesaplaSatirToplam(finalPrice, qty);

    // AG-Grid sutun tipi string — number degeri reddediyor (warning #135)
    yazVeri(targetNode, '_matNetPrice', netPrice);
    // KUR DONMASI (06.08): dovizli kaynaktan gelen fiyatin kuru satirla
    // birlikte KAYDEDILIR (sheets JSON'a aynen girer). TRY'de null.
    // Kolon degil veri alani — dogrudan mutasyon yeterli (emitRows tasir).
    d._matKurBilgi = kaynakKur ?? null;
    targetNode.setDataValue('_matSuggestion', isSuggestion);
    targetNode.setDataValue('_matStatus', ''); // eslesme geldi — bekleme isareti kalkar
    if (materialUnitPriceField) targetNode.setDataValue(materialUnitPriceField, finalPrice.toFixed(1));
    if (materialTotalField) targetNode.setDataValue(materialTotalField, total.toFixed(1));

    console.log(`[BrandDropdown] row=${d._rowIdx}, net=${netPrice}, kar=${kar}%, final=${finalPrice}, qty=${qty}, total=${total}, suggestion=${isSuggestion}`);
  };
  const writePrice = (netPrice: number, isSuggestion = false, kaynakKur?: any) => writePriceToNode(node, netPrice, isSuggestion, kaynakKur);

  const handleChange = async (brandId: string) => {
    node.setDataValue('_marka', brandId || null);
    setCandidates(null);
    setAlternatives(null);
    if (!brandId) {
      yazVeri(node, '_matNetPrice', 0);
      node.data._matKurBilgi = null; // kur donmasi: fiyatla birlikte temizlenir
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
    const ctxDetail = buildMaterialContextDetailed(api, node.rowIndex ?? 0, nameField, noField, brandField, quantityField, diameterField);
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
      writePrice(result.netPrice, result.confidence === 'suggestion', (result as any).kaynakKur);
      // PRD v3.0 Bolum B: kaynak satir KENDI varyant kimligini kaydeder —
      // SURUKLE/CIFT-TIK bunu tasir. Toggle kalkti (autoVariantEnabled=false):
      // yayilim yalniz acik niyetle → kaynak varyanti HER tek-eslesmede
      // gerekli. Yoksa surukleme markayi tasir ama varyant ayrimi yapamayip
      // hedef satirlar belirsize duser (canli bulgu: HAKAN/DUYAR fiyat gelmiyor).
      if (result.variantTags && result.variantTags.length > 0) {
        node.data._matVariantTags = result.variantTags;
        node.data._matVariantLabel = node.data._matVariantLabel ?? 'seçiminiz';
        const hdrSel = headerRef.current;
        if (hdrSel && !groupVariants.current[hdrSel]) {
          groupVariants.current[hdrSel] = { tags: result.variantTags, label: 'seçiminiz' };
        }
      }
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
        // CANLI BULGU (18.07): otoyaz "SON SECIM" zincirini BESLEMIYORDU —
        // ilk satir hafizadan doluyor, ayni gruptaki sonraki satirlar grup
        // sorusuna dusuyordu ("otomatik atamiyor"). Varyant kimligi artik
        // zincire yazilir ve anahtar ACIKSA grubun kalani da otomatik dolar.
        const hdr2 = headerRef.current;
        if (hdr2 && result.variantTags && result.variantTags.length > 0) {
          groupVariants.current[hdr2] = { tags: result.variantTags, label: 'Geçmiş seçiminiz' };
          node.data._matVariantTags = result.variantTags;
          node.data._matVariantLabel = 'Geçmiş seçiminiz';
          if (autoVariantEnabled) {
            await applyVariantToGroup(hdr2, groupVariants.current[hdr2]);
          }
        }
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
    yazVeri(node, '_matNetPrice', 0);
    node.data._matKurBilgi = null; // kur donmasi: fiyatla birlikte temizlenir
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
      const det = buildMaterialContextDetailed(api, n.rowIndex ?? 0, nameField, noField, brandField, quantityField, diameterField);
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
        const det = buildMaterialContextDetailed(api, n.rowIndex ?? 0, nameField, noField, brandField, quantityField, diameterField);
        const r = await onBrandChange(d._rowIdx, d._marka, det.name || nm, { variantTags: variant.tags, silent: true });
        if (r && r.autoVariant && r.netPrice > 0) {
          writePriceToNode(n, r.netPrice, true, (r as any).kaynakKur);
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
    writePrice(c.netPrice, false, (c as any).kaynakKur);
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
      if (kinds.length > 0) {
        confirm({
          title: 'Sözlüğe kaydet',
          description: `"${hdr}" terimi sözlüğe kaydedilsin mi? Sonraki dosyalarda bu başlık altındaki satırlar otomatik "${kinds.join('/')}" olarak yorumlanır.`,
          confirmText: 'Kaydet',
        }).then((ok) => {
          if (!ok) return;
          httpApi.post('/matching/aliases', {
            alias: hdr,
            canonical: c.materialName,
            kinds,
            sizeClass: kinds.some((k) => FE_PLASTIC_KINDS.includes(k)) ? 'plastic' : 'steel',
            impliedType: null,
          }).catch(() => {});
        });
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
    writePrice(a.netPrice, false, (a as any).kaynakKur);
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

  // ── PU4c: POPUP TASINABILIR (kullanici istegi 31.07) ────────────────────
  // "seçenekler çerçevesini hareket ettiremiyorum" — tasima HIC yoktu; popup
  // sabit konumda aciliyordu ve altindaki satiri kapatiyordu. Baslik cubugu
  // artik tutamaktir. Kutu her zaman ekran icinde kalir (kirpma ile ayni pay).
  const tasiRef = React.useRef<{ dx: number; dy: number } | null>(null);
  const baslikBasla = (e: React.MouseEvent) => {
    const el = popupRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    tasiRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    const pay = 12;
    const hareket = (ev: MouseEvent) => {
      const s = tasiRef.current;
      const k = popupRef.current?.getBoundingClientRect();
      if (!s || !k) return;
      setPopupPos({
        left: Math.max(pay, Math.min(ev.clientX - s.dx, window.innerWidth - k.width - pay)),
        top: Math.max(pay, Math.min(ev.clientY - s.dy, window.innerHeight - k.height - pay)),
      });
    };
    const birak = () => {
      tasiRef.current = null;
      window.removeEventListener('mousemove', hareket);
      window.removeEventListener('mouseup', birak);
    };
    window.addEventListener('mousemove', hareket);
    window.addEventListener('mouseup', birak);
    e.preventDefault(); // metin secimi tasimayi bozmasin
  };

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
        <div ref={popupRef} data-testid="aday-popup" style={{
          position: 'fixed',
          top: popupPos.top,
          left: popupPos.left,
          zIndex: 99999,
          background: '#fffbeb',
          border: '2px solid #f59e0b',
          borderRadius: 6,
          padding: 8,
          // PU4: popup YENIDEN BOYUTLANDIRILABILIR ve metin kesilmez.
          // Eski sabit 400x320 kutu uzun urun adlarini goruntulenemez
          // kiliyordu; genislik tercihi oturum boyunca hatirlanir.
          width: popupGenislik,
          minWidth: 300,
          maxWidth: '95vw',
          maxHeight: '85vh',
          resize: 'both',
          overflow: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          fontSize: 12,
        }}>
          {/* PU4c: BASLIK = TASIMA TUTAMAGI. Kullanici "hareket ettiremiyorum"
              dedi; tasima hic yoktu. Imlec `move`, metin secimi kapali. */}
          <div
            data-testid="aday-popup-baslik"
            onMouseDown={baslikBasla}
            title="Sürükleyerek taşıyın · sağ-alt köşeden boyutlandırın"
            style={{
              fontWeight: 700, color: '#b45309', marginBottom: 2, fontSize: 13,
              cursor: 'move', userSelect: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ letterSpacing: 1, opacity: 0.55, fontSize: 14, lineHeight: 1 }}>⠿</span>
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
                  {/* PU2/PU3: ayirt edici alan ONDE ve BUYUK, urun adi KESILMEZ.
                      Eski kod adi 60 karakterde kesiyordu; kutuphane adlari capi
                      SONA koydugu icin DN65/DN80/DN100 ekranda BIREBIR AYNI
                      goruniyordu (FAZ0 §B.2). */}
                  {(() => {
                    const etiketler = adayEtiketleri(stage2.map((c) => ({ materialName: c.materialName, netPrice: c.netPrice })));
                    return stage2.map((c, i) => (
                      <button key={i} onClick={() => handleCandidateSelect(c)} style={btnStyle} {...hover}>
                        {etiketler[i].ayirtEdici && (
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                            {c.preferred && '✓ '}{etiketler[i].ayirtEdici}
                          </div>
                        )}
                        <div style={{ fontWeight: 500, color: '#334155', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                          {!etiketler[i].ayirtEdici && c.preferred && '✓ '}{etiketler[i].ad}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 11 }}>{c.netPrice.toFixed(1)} TL</div>
                        {/* PU7: fark aciklanamiyorsa veri sorunu olarak isaretle */}
                        {etiketler[i].veriSorunu && (
                          <div style={{ color: '#b45309', fontSize: 10, marginTop: 2 }}>
                            ⚠ Aynı ürün adı, farklı fiyat — kütüphane verisi gözden geçirilmeli
                          </div>
                        )}
                        {/* E3: nitelik farki uyarisi ("68°C istendi — bu ürün 141°C") */}
                        {c.uyari && <div style={{ color: '#dc2626', fontSize: 10, marginTop: 2 }}>⚠ {c.uyari}</div>}
                      </button>
                    ));
                  })()}
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
                      {/* DUZELTME C (04.08.2026): rozet ONAYLATICI konusuyordu —
                          "✓ önceki tercihiniz" sanki bu satirda daha once
                          onaylanmis gibi okunuyor. Oysa kayit SATIRA degil ayni
                          olcu/tipteki ANAHTARA ait. Isaret notrlestirildi, metin
                          kanitin tasidigi anlama indirildi. Sira/fiyat/aday
                          listesi DEGISMEDI — yalniz metin. */}
                      <div style={{ fontWeight: 600 }}>{g.preferred && '• '}{single && c.popular && '★ '}{g.label}</div>
                      <div style={{ color: '#6b7280', fontSize: 11 }}>
                        {single ? `${c.netPrice.toFixed(1)} TL` : `${g.items.length} alt tip →`}
                        {g.preferred && <span style={{ color: '#059669', marginLeft: 6, fontWeight: 600 }}>aynı soruda kayıtlı</span>}
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
          {/* PU4c: boyutlandirma tutamaci GORUNUR olsun. Native CSS `resize`
              grip'i cizilir ama cok soluk — kullanici varligini fark etmiyor.
              Bu kare SADECE gorseldir (pointerEvents yok); tiklamalar altindaki
              gercek grip'e gider. */}
          <div
            aria-hidden
            style={{
              position: 'sticky', bottom: 0, marginLeft: 'auto', marginTop: 2,
              width: 14, height: 14, pointerEvents: 'none', opacity: 0.5,
              background: 'repeating-linear-gradient(135deg, transparent 0 2px, #b45309 2px 3px)',
            }}
          />
        </div>,
        document.body,
      )}
      {/* M3: bu markada urun yok — alternatif markalar (fiyatli, tiklanabilir).
          S2: kutu KESINLIK IDDIA ETMEZ; adaylardan biri bile motorun onay
          kapisindan gecememisse baslik onay tonuna doner ve her cekinceli
          adayin GEREKCESI kartinda yazar (karar: oneri-cekince.ts). */}
      {alternatives && alternatives.length > 0 && popupPos && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', top: popupPos.top, left: popupPos.left, zIndex: 99999,
          background: '#fef2f2', border: '2px solid #ef4444', borderRadius: 6, padding: 8,
          minWidth: 280, maxWidth: 420, maxHeight: 320, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 6, fontSize: 13 }}>
            {oneriBasligi(alternatives, 'marka')}
          </div>
          {alternatives.map((a, i) => (
            <button
              key={i}
              onClick={() => handleAlternativeSelect(a)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                border: `1px solid ${cekinceSatiri(a) ? '#f59e0b' : '#e5e7eb'}`, background: 'white', cursor: 'pointer',
                fontSize: 12, borderRadius: 4, marginBottom: 4,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#dbeafe'; e.currentTarget.style.borderColor = '#3b82f6'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = cekinceSatiri(a) ? '#f59e0b' : '#e5e7eb'; }}
            >
              <div style={{ fontWeight: 700 }}>{a.onerilen && '★ '}{a.brandName} — {a.netPrice.toFixed(1)} TL{a.onerilen && <span style={{ color: '#059669', marginLeft: 6, fontSize: 10, fontWeight: 600 }}>keşif önerisi</span>}</div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>{a.materialName.slice(0, 60)}</div>
              {cekinceSatiri(a) && (
                <div style={{ color: '#b45309', fontSize: 11, marginTop: 2, whiteSpace: 'normal' }}>{cekinceSatiri(a)}</div>
              )}
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
  unitField?: string;
  laborUnitPriceField?: string;
  laborTotalField?: string;
  diameterField?: string;
}) {
  const {
    data, laborFirms, sheetDiscipline, laborEnabled, onFirmaChange,
    nameField, noField, brandField, quantityField, unitField, laborUnitPriceField, laborTotalField,
    diameterField,
    api, node,
  } = props;
  const [candidates, setCandidates] = React.useState<MatchCandidate[] | null>(null);
  // L5: "bu firmada yok" → kalemi sunan diger firmalar (fiyatli, tiklanabilir)
  const [alternatives, setAlternatives] = React.useState<BrandAlternative[] | null>(null);
  // Hafiza (L4 ogrenme): remember bu adla yazilir — secim aninda okunur
  const lookupNameRef = React.useRef<string>('');
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

  // PANO 17c: satir-basi "Disiplin?" rozeti KALDIRILDI — disiplin sayfa
  // duzeyinde otomatik tespit edilir / SheetTabs'tan secilir; tespit
  // edilemese bile dropdown TUM firmalarla calisir (satir bloklanmaz).

  // Malzeme tarafindaki yazVeri ile AYNI gerekce (ikiz).
  const yazVeriLab = (targetNode: any, alan: string, deger: any) => {
    if (targetNode?.data) targetNode.data[alan] = deger;
    try { targetNode?.setDataValue?.(alan, deger); } catch { /* kolon yok */ }
  };

  const writeLaborPrice = (netPrice: number, kaynakKur?: any) => {
    const kar = sayiAlani(data._iscKar);
    // SPEC: satis = net×(1+kar) yukari 1 hane; toplam = satis×miktar.
    const finalPrice = hesaplaSatisBirimFiyat(netPrice, kar);
    const qty = etkinMiktar(data, quantityField, unitField); // UY2
    const total = hesaplaSatirToplam(finalPrice, qty);

    yazVeriLab(node, '_labNetPrice', netPrice);
    // KUR DONMASI: malzeme ikiziyle AYNI kural (ikizi unutma dersi)
    node.data._labKurBilgi = kaynakKur ?? null;
    // ISARET: fiyat geldi → bekleme kalkar (ExcelGrid.tsx:322 malzeme ikizi).
    // Fiyat yazan HER iscilik yolu buradan gectigi icin tek yer yeter:
    // handleChange tek-eslesme · handleCandidateSelect · handleAlternativeSelect.
    yazVeriLab(node, '_labStatus', '');
    yazVeriLab(node, '_labSebep', null);
    yazVeriLab(node, '_labAdaySayisi', null);
    if (laborUnitPriceField) node.setDataValue(laborUnitPriceField, finalPrice.toFixed(1));
    if (laborTotalField) node.setDataValue(laborTotalField, total.toFixed(1));
    console.log(`[FirmaDropdown] row=${data._rowIdx}, net=${netPrice}, kar=${kar}%, final=${finalPrice}, qty=${qty}`);
  };

  const handleChange = async (firmaId: string) => {
    node.setDataValue('_firma', firmaId || null);
    setCandidates(null);
    setAlternatives(null);
    if (!firmaId) {
      yazVeriLab(node, '_labNetPrice', 0);
      node.data._labKurBilgi = null; // kur donmasi: fiyatla birlikte temizlenir
      // Firma kaldirildi: satir artik "secim bekleyen" degil — isaret de kalkar,
      // yoksa firmasiz satir kirmizi kalir ve guven sayacini sisirir.
      yazVeriLab(node, '_labStatus', '');
      yazVeriLab(node, '_labSebep', null);
      yazVeriLab(node, '_labAdaySayisi', null);
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
    const fullName = buildMaterialContext(api, node.rowIndex ?? 0, nameField, noField, brandField, quantityField, diameterField);
    const queryName = fullName || currentName;
    lookupNameRef.current = queryName; // L4 ogrenme imzasi bu adla uretilir
    const result = await onFirmaChange(data._rowIdx, firmaId, queryName);

    if (result && result.candidates && result.candidates.length > 0) {
      setPopupPos(computePopupPos()); // her kosulda acilir (F1)
      // SD6 ikizi: isaret EYLEMLI — sebep + kac aday oldugu satirda tasinir,
      // popup kapatilsa bile hucre kirmizi kalir ve tooltip ne yapilacagini der.
      yazVeriLab(node, '_labStatus', 'belirsiz');
      yazVeriLab(node, '_labAdaySayisi', result.candidates.length);
      yazVeriLab(node, '_labSebep', (result as any).reason ?? null);
      setCandidates(result.candidates);
      return;
    }

    if (result && result.netPrice > 0) {
      writeLaborPrice(result.netPrice, (result as any).kaynakKur);
      // L7: tek-eslesme kaynagi da varyant kimligini SAKLAR — surukleme
      // kalem cinsini (kaynakli/yivli) tasiyabilsin (malzeme 26d8448 dersi).
      if (result.variantTags && result.variantTags.length > 0) {
        node.data._labVariantTags = result.variantTags;
      }
      return;
    }

    // L5: bu firmada yok — kalemi sunan diger firmalar (fiyatli secenek)
    if (result && result.alternatives && result.alternatives.length > 0) {
      setPopupPos(computePopupPos());
      yazVeriLab(node, '_labStatus', 'belirsiz'); // malzeme ikizi: ExcelGrid.tsx:448
      yazVeriLab(node, '_labSebep', (result as any).reason ?? null);
      setAlternatives(result.alternatives);
      return;
    }

    // ALTIN KURAL: fiyat uretilmez — hucre bos + ISARETLI (malzeme ikizi).
    // 'urun_degil' (oran/hizmet, gri) vs 'yok' (eslesme yok, kirmizi).
    yazVeriLab(node, '_labNetPrice', 0);
    node.data._labKurBilgi = null; // kur donmasi: fiyatla birlikte temizlenir
    yazVeriLab(node, '_labStatus', (result as any)?.notProduct ? 'urun_degil' : 'yok');
    yazVeriLab(node, '_labSebep', (result as any)?.reason ?? null);
    yazVeriLab(node, '_labAdaySayisi', null);
    if (laborUnitPriceField) node.setDataValue(laborUnitPriceField, '');
    if (laborTotalField) node.setDataValue(laborTotalField, '');
  };

  const handleCandidateSelect = async (c: MatchCandidate) => {
    const firmaId = data._firma as string | null;
    writeLaborPrice(c.netPrice, (c as any).kaynakKur);
    // L7: secimin kimligi satirda tasinir — fill-handle kaynak okur
    node.data._labVariantTags = c.variantTags && c.variantTags.length > 0 ? c.variantTags : null;
    setCandidates(null);
    setPopupPos(null);
    // L4 OGRENME: secim iscilik hafizasina yazilir (iscilik| kapsami — backend)
    if (firmaId && lookupNameRef.current) {
      try {
        await httpApi.post('/labor-matching/remember', {
          firmaId,
          laborName: lookupNameRef.current,
          secilenAd: c.materialName,
        });
      } catch { /* hafiza yazilamadi — akis devam */ }
    }
  };

  // L5: alternatif firma secimi — firma + fiyat BIRLIKTE atanir
  const handleAlternativeSelect = (a: BrandAlternative) => {
    node.setDataValue('_firma', a.brandId); // alan adi marka tasir, deger FIRMA
    writeLaborPrice(a.netPrice, (a as any).kaynakKur);
    setAlternatives(null);
    setPopupPos(null);
    console.log(`[FirmaDropdown] L5 alternatif firma secildi: ${a.brandName} → "${a.materialName}" = ${a.netPrice}`);
  };
  const handleAlternativeCancel = () => {
    setAlternatives(null);
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
      {/* L5: bu firmada yok — kalemi sunan DIGER firmalar (fiyatli, tiklanabilir) */}
      {alternatives && alternatives.length > 0 && popupPos && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', top: popupPos.top, left: popupPos.left, zIndex: 99999,
          background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: 6, padding: 8,
          minWidth: 280, maxWidth: 420, maxHeight: 320, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', fontSize: 12,
        }}>
          {/* S2 IKIZI: malzeme kutusuyla AYNI karar kaynagi (oneri-cekince.ts).
              Iki kutu ayri ayri elle yazilsaydi biri guncellenip digeri
              unutulurdu — davranis tutarsiz kalirdi. */}
          <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 6, fontSize: 13 }}>
            {oneriBasligi(alternatives, 'firma')}
          </div>
          {alternatives.map((a, i) => (
            <button
              key={i}
              onClick={() => handleAlternativeSelect(a)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                border: `1px solid ${cekinceSatiri(a) ? '#f59e0b' : '#dbeafe'}`, background: 'white', cursor: 'pointer',
                fontSize: 12, borderRadius: 4, marginBottom: 4,
              }}
            >
              <div style={{ fontWeight: 700 }}>{a.brandName} — {a.netPrice.toFixed(1)} TL</div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>{a.materialName}</div>
              {cekinceSatiri(a) && (
                <div style={{ color: '#b45309', fontSize: 11, marginTop: 2, whiteSpace: 'normal' }}>{cekinceSatiri(a)}</div>
              )}
            </button>
          ))}
          <button onClick={handleAlternativeCancel} style={{
            display: 'block', width: '100%', padding: '5px 8px', marginTop: 2,
            border: '1px dashed #93c5fd', background: 'transparent', cursor: 'pointer',
            fontSize: 11, borderRadius: 4, color: '#1d4ed8',
          }}>
            Vazgeç (fiyat yazılmaz)
          </button>
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
/**
 * ⚠ `diameterField` 12.08'DE EKLENDI — CAP GOLGELEMESININ KOKU BURASIYDI.
 *
 * Bu fonksiyon `diameterField`i HIC bilmiyordu; ad hucresi doluyken her daldan
 * bos olmayan `name` dondugu icin cagiranlardaki `ctxDetail.name || <capli ad>`
 * ifadelerinde CAPLI dal PRATIKTE OLUYDU. Yani DWG satirlarinda motora capsiz
 * ad gidiyordu ve `query-engine.ts:388` sert cap filtresi (`if (line.capInfo)`)
 * HIC KOSMUYORDU. Bedeli sessiz ve parasal: kutuphanede o aileden TEK kalem
 * varsa `rows.length === 1` → `kind:'single'` (query-engine.ts:715) →
 * outcome-mapper fiyati YAZIYOR; yani Ø110 satirina Ø50'nin fiyati giriyordu.
 * Capli sorguda ayni satir `{kind:'none', reason:'cap-yok', mevcutCaplar}`
 * (query-engine.ts:453) donup kullaniciya "bu cap yok, en yakin: 50/100" derdi.
 *
 * TARIH: cap 7fdf101c (11.07, M1/M4 fix) ile dusmedi — ONCELIK TERS CEVRILDI.
 * O commit'ten once capli ad BIRINCIL sorguydu, `ctxDetail.name` yedekti.
 * Commit'in amaci aileyi sorgudan dusurmemekti (Cayirova/PP vana); cap ile
 * CELISMIYOR, DIK. Dogru sorgu baslik + cins + CAP birlesimidir.
 *
 * ⚠ CAP SONA EKLENIR, BASA DEGIL. Uc bagimsiz sebep, ucu de olculdu:
 *   1. S4 sozluk kapisi ad-basina bagli: ExcelGrid.tsx:546
 *      `lookupNameRef.current.startsWith(hdr)` — cap basa gelirse SESSIZCE oler.
 *   2. Backend cap konumuna toleransli: conversion.ts:153-158 DN eslesmelerinin
 *      SONUNCUSUNU alir; tek cap varsa konum fark etmez.
 *   3. Bugun calisan tek cap-ekleme yolu (`capliAd`/PU1) da sona ekliyor.
 *
 * ⚠ CIFT CAP `extractCapFromText` ILE ENGELLENEMEZ — o fonksiyon Ø-KORDUR:
 * yalniz `dn<sayi>` (:1223) ve TIRNAKLI inc olculeri (:1242) tanir, "Ø110"da
 * ne `dn` ne `"` vardir → null doner ve PU1 ikinci bir cap eklerdi
 * ("PVC BORU Ø110 DN250"). Bu yuzden metinden geri koklamak YERINE capi
 * EKLEYENIN bilgisi tasinir (`capEklendi`).
 */
function buildMaterialContextDetailed(
  api: any,
  rowIdx: number,
  nameField?: string,
  noField?: string,
  brandField?: string,
  quantityField?: string,
  diameterField?: string,
): { name: string; header: string | null } {
  if (!nameField) return { name: '', header: null };
  const currentNode = api.getDisplayedRowAtIndex(rowIdx);
  if (!currentNode) return { name: '', header: null };
  const currentName = String(currentNode.data[nameField] ?? '').trim();
  if (!currentName) return { name: '', header: null };

  // AKILLI SUTUN: cap AYRI kolondaysa sorgunun parcasidir (bkz. fonksiyon basligi).
  const kolonCapi = diameterField ? String(currentNode.data[diameterField] ?? '').trim() : '';

  // ── PU1: ALTTAKI NITELIK SATIRLARINDAN CAP ────────────────────────────
  // Kok neden (FAZ0 §B.1): YILDIZ'da malzeme satirinin capi bir ALT satirda
  // durur ("Yükselen Milli Vana (OS&Y Valve)" / "Çap : DN 250"). Baglam yalniz
  // YUKARI baktigi icin sorguda cap yoktu → sert cap filtresi calisamiyor →
  // urunun tum caplari aday kaliyor ve popup 5 ayni satiri gosteriyordu.
  const altBaglam = (() => {
    const satirlar: { ad: string; veri: boolean }[] = [];
    for (let i = rowIdx; i < rowIdx + 40; i++) {
      const n = api.getDisplayedRowAtIndex(i);
      if (!n) break;
      satirlar.push({ ad: String(n.data?.[nameField] ?? '').trim(), veri: !!n.data?._isDataRow });
    }
    return satirlar.length ? niteliklerdenBaglam(satirlar, 0) : null;
  })();
  /**
   * Sorgu adina CAP ekler — TEK KAPI.
   * Once KOLON capi (diameterField, DWG akisi), o yoksa PU1 alt-nitelik capi.
   * ⚠ Ikisi birden EKLENMEZ: `capEklendi` bayragi tasinir, cunku metinden geri
   * koklama (`extractCapFromText`) Ø-kordur ve cift cap uretirdi.
   */
  const capliAd = (ad: string) => {
    if (kolonCapi) return `${ad} ${kolonCapi}`;
    return altBaglam?.cap && !extractCapFromText(ad) ? `${ad} ${altBaglam.cap}` : ad;
  };

  // C3: satir kendi kendine yeterliyse (tip kelimesi / anlamli metin) baslik EKLEME
  if (isSelfSufficientRow(currentName)) return { name: capliAd(currentName), header: null };

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

    // R-A/UY1 (skychem: "6\"" yetim satirina "UL listeli, FM onaylı" baslik
    // olmustu → sorgu "eşleşmedi" toast'i): NITELIK-DEVAM satiri baslik
    // OLAMAZ — bir ust kalemin devam aciklamasidir. Isaretler: numarasiz +
    // (nitelik kalibi / kucuk harfle baslayan devam cumlesi / virgulle
    // biten). Gercek kalem basligina (numarali satir) kadar cikilir.
    const NITELIK_RE = /listeli|onayl[ıi]\b|ile beraber|\bdahil\b|sertifikal[ıi]|uyumlu\b/i;
    if (prevNo === '' && (NITELIK_RE.test(prevName) || /^[a-zçğıöşü]/.test(prevName) || /,\s*$/.test(prevName))) {
      continue;
    }

    // H1/H2: noField dolu VEYA miktari bos olan isimli satir baslik adayidir
    if (prevNo.length > 0 || prevQty === '' || prevQty === '0') {
      foundParent = prevName;
      break;
    }
  }

  if (!foundParent) return { name: capliAd(currentName), header: null };

  // KATMAN 1 SAVUNMA: Cap Sanity Check
  const fullName = `${foundParent} ${currentName}`;
  const currentCap = extractCapFromText(currentName);
  const fullCap = extractCapFromText(fullName);
  const parentCap = extractCapFromText(foundParent);

  if (parentCap && currentCap && parentCap !== currentCap) {
    console.warn(`[buildMaterialContext] Cap mismatch! parent="${foundParent}" (${parentCap}), current="${currentName}" (${currentCap}). Sadece currentName kullanildi.`);
    return { name: capliAd(currentName), header: null };
  }
  if (currentCap && fullCap && currentCap !== fullCap) {
    console.warn(`[buildMaterialContext] Full cap mismatch! current=${currentCap}, full=${fullCap}. Sadece currentName kullanildi.`);
    return { name: capliAd(currentName), header: null };
  }

  return { name: capliAd(fullName), header: foundParent };
}

function buildMaterialContext(
  api: any,
  rowIdx: number,
  nameField?: string,
  noField?: string,
  brandField?: string,
  quantityField?: string,
  diameterField?: string,
): string {
  return buildMaterialContextDetailed(api, rowIdx, nameField, noField, brandField, quantityField, diameterField).name;
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
  /** Devam eden hucre duzenlemesini ZORLA commit eder (yazip blur etmeden
   *  Kaydet'e basinca deger kaybini onler — save handler'i ONCE bunu cagirir). */
  stopEditing(): void;
}

export const ExcelGrid = forwardRef<ExcelGridHandle, Props>(function ExcelGrid({
  data, brands, onBrandChange,
  laborFirms = [], sheetDiscipline = null, laborEnabled = false, onFirmaChange,
  onRowDataChange,
  onColumnWidthsChange,
  columnWidths,
  autoAppendRow = false,
  enableStructureEdit = false,
  onColumnsChange,
  onRowDelete,
  mode = 'quote',
  libraryPriceField = 'materialUnitPriceField',
  currencySymbol, conversionRate,
  autoVariantEnabled = true,
  onAutoVariantChange,
  onAutoVariantApplied,
  floorFields,
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

  /** S2c/G6: grup bandindan o kategoriye toplu iskonto.
   *  S1 (06.08.2026): deger `window.prompt` ile DEGIL, tiklanan noktada acilan
   *  uygulama ici kutucukla sorulur (`promptValue`). Sorunun CEVABI ayni
   *  sozlesmeyi korur — `null` = vazgecildi, bos metin = islem yok — ve
   *  `parseDiscountInput`/clamp mantigina DOKUNULMADI; yalniz metnin
   *  NEREDEN geldigi degisti. */
  const promptGroupDiscount = useCallback(async (key: string) => {
    if (!gridRef.current?.api) return;
    const raw = await promptValue({
      title: `"${key}" grubuna iskonto`,
      description: 'Bu gruptaki tüm satırlara uygulanacak iskonto % (0-100):',
      confirmText: 'Uygula',
      cancelText: 'Vazgeç',
      input: { yerTutucu: 'örn 30', tip: 'number' },
    });
    if (raw == null || raw.trim() === '') return;
    // Kutu acikken grid degismis olabilir — api YENIDEN okunur.
    const api = gridRef.current?.api;
    if (!api) return;
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

  /** K19: son MARKA veya FIRMA sureklemesini BUTUN olarak geri al — fiyatlar,
   *  statuler, rozetler ve ANAHTAR DURUMU tek adimda eski haline doner.
   *  Jeneriktir: snapshot'taki alanlari geri yukler (marka: _marka/_mat*;
   *  firma: _firma/_lab*), ikisi ayni LIFO yiginini paylasir. */
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
    if (!fc) return;
    if (api.getEditingCells().length > 0) return; // hucre editoru kendi paste'ini yapar

    // ── Iskonto sutununa odakliysa: eski davranis (tek sutun iskonto) ──
    if (fc.column.getColId() === '_draftDiscount') {
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
      return;
    }

    // ── GENEL BLOK YAPISTIRMA: Excel'den cok satir/cok sutun veri ──
    // Odakli editable veri kolonundan itibaren sagi+asagi doldurur. Gerekirse
    // (autoAppendRow) yeni satir ekler. No/Net Fiyat/Iskonto hedef DEGIL.
    const text = e.clipboardData.getData('text');
    if (!text || !text.trim()) return;
    const matrix = text.replace(/\r/g, '').split('\n');
    if (matrix.length && matrix[matrix.length - 1] === '') matrix.pop();
    const cells = matrix.map((line) => line.split('\t'));

    // Hedef editable veri kolonlari (No + '_'-onekli sistem kolonlari haric)
    const noField = data.columnRoles?.noField;
    const targets = data.columnDefs
      .filter((c) => c.editable && !c.field.startsWith('_') && c.field !== noField)
      .map((c) => c.field);
    if (targets.length === 0) return;
    const startCol = Math.max(0, targets.indexOf(fc.column.getColId()));

    e.preventDefault();

    const makeBlank = (): any => {
      let maxIdx = 0;
      api.forEachNode((n) => { if (n.data && n.data._rowIdx > maxIdx) maxIdx = n.data._rowIdx; });
      const row: any = {
        _rowIdx: maxIdx + 1, _isDataRow: true, _isHeaderRow: false,
        _malzKar: 0, _iscKar: 0, _marka: null, _firma: null, _matNetPrice: 0, _labNetPrice: 0,
      };
      for (const c of data.columnDefs) if (!c.field.startsWith('_')) row[c.field] = '';
      return row;
    };

    // Hedef satir dugumlerini topla (odakli satirdan asagi, grup bantlari atlanir)
    const rowNodes: any[] = [];
    let ri = fc.rowIndex;
    while (rowNodes.length < cells.length) {
      const n = api.getDisplayedRowAtIndex(ri);
      if (n) {
        ri++;
        if (!n.data?._isDataRow) continue; // grup bandi/baslik atla
        // spare satiri gercek satira cevir (autoAppend bozulmasin)
        if (n.data._isSpareRow) n.data._isSpareRow = false;
        rowNodes.push(n);
      } else {
        if (!autoAppendRow) break; // yeni satir eklenemiyorsa dur
        const blank = makeBlank();
        api.applyTransaction({ add: [blank] });
        const added = api.getDisplayedRowAtIndex(api.getDisplayedRowCount() - 1);
        if (!added) break;
        ri = added.rowIndex! + 1;
        rowNodes.push(added);
      }
    }

    // Degerleri yaz (dogrudan mutasyon → tek refresh; cellValueChanged tetiklemez)
    let yazilan = 0;
    for (let i = 0; i < rowNodes.length && i < cells.length; i++) {
      const cols = cells[i];
      for (let j = 0; j < cols.length; j++) {
        const field = targets[startCol + j];
        if (!field) break; // sagda hedef kolon kalmadi
        rowNodes[i].data[field] = cols[j];
        yazilan++;
      }
    }

    // autoAppendRow ise en altta hep-bos spare satir kalsin
    if (autoAppendRow) {
      const last = api.getDisplayedRowAtIndex(api.getDisplayedRowCount() - 1);
      const lastData = last?.data;
      const lastDolu = !!lastData && data.columnDefs.some(
        (c) => !c.field.startsWith('_') && String(lastData[c.field] ?? '').trim() !== '',
      );
      if (lastDolu) {
        const spare = makeBlank();
        spare._isSpareRow = true;
        api.applyTransaction({ add: [spare] });
      }
    }

    api.refreshCells({ force: true });
    // Disariya canli rowData yayinla (emitRows asagida tanimli — inline)
    if (onRowDataChange) {
      const all: ExcelRowData[] = [];
      api.forEachNode((n) => { if (n.data) all.push(n.data); });
      onRowDataChange(all);
    }
    if (yazilan > 0) toast({ title: `${cells.length} satır yapıştırıldı`, description: 'Kaydetmeyi unutmayın' });
  }, [mode, applyDiscountBulk, data.columnDefs, data.columnRoles, autoAppendRow, onRowDataChange]);

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
  // Durumu 'yok'/'belirsiz' olan data satirlari sayilir; her hucre
  // degisiminde tazelenir (setDataValue de cellValueChanged tetikler).
  //
  // ⚠ IKIZ (12.08): sayac eskiden YALNIZ `_matStatus` okuyordu. Iscilik
  // firmasi surukle-doldur yapilan ve o firmada kalemi olmayan satirlar
  // sayaca HIC girmiyordu — kullanici "0 satir bekliyor" gorup kaydediyor,
  // iscilik hucreleri sessizce bos gidiyordu. Olcut `isaret.ts`te tek yerde.
  // SATIR sayilir: iki taraf da bekliyorsa satir BIR kez sayilir.
  const [pendingCount, setPendingCount] = useState(0);
  const recountPending = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    let n = 0;
    api.forEachNode((node) => {
      const d: any = node.data;
      if (d?._isDataRow && (secimBekliyor(d._matStatus) || secimBekliyor(d._labStatus))) n++;
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

  // Ref: deleteRow'un kimligi sabit kalsin (context menu her render'da yeniden
  // baglanmasin) ama parent'in guncel kancasini okusun — onRowDataChangeRef
  // ile ayni desen.
  const onRowDeleteRef = React.useRef(onRowDelete);
  onRowDeleteRef.current = onRowDelete;

  const deleteRow = useCallback(async (row: ExcelRowData | null) => {
    const api = gridRef.current?.api;
    if (!api || !row) return;
    setCtxMenu(null);
    // KALICI SILME KANCASI: parent verdiyse ONCE o karar verir. Gridden
    // kaldirma yalniz onay gelirse yapilir — "ekrandan gitti ama sunucuda
    // duruyor" hali boylece imkansiz (bkz. onRowDelete sozlesmesi).
    if (onRowDeleteRef.current) {
      const ok = await onRowDeleteRef.current(row);
      if (!ok) return;
    }
    api.applyTransaction({ remove: [row] });
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

  const removeColumn = useCallback(async (field: string | null) => {
    setCtxMenu(null);
    if (!onColumnsChange || !field) return;
    // Sistem + rol kolonlari silinemez (hesap/kayit zinciri bozulur)
    const roleFields = new Set(Object.values(data.columnRoles).filter(Boolean) as string[]);
    if (field.startsWith('_') || roleFields.has(field)) {
      window.alert('Bu sütun sistem tarafından kullanılıyor, silinemez.');
      return;
    }
    if (!(await confirm({ title: `"${field}" sütunu kaldırılsın mı?`, description: 'Sütun ve içindeki veriler tablodan kaldırılacak.' }))) return;
    onColumnsChange(data.columnDefs.filter((c) => c.field !== field));
  }, [onColumnsChange, data.columnDefs, data.columnRoles]);

  // ── Fill Handle (surukle-doldur) ──
  const FILLABLE_FIELDS = useMemo(() => new Set([
    '_malzKar', '_marka', '_iscKar', '_firma', '_draftDiscount',
  ]), []);

  const handleFillComplete = useCallback(async (result: { field: string; value: any; sourceRowIndex: number; targetRowNodes: any[] }) => {
    const api = gridRef.current?.api;
    if (!api) return;

    const { nameField, quantityField, unitField, materialUnitPriceField, materialTotalField,
            laborUnitPriceField, laborTotalField, diameterField } = data.columnRoles;

    // AKILLI SUTUN: diameterField varsa eslestirme adi = Çap + Cins birlesimi
    const lookupNameOf = (rowData: any): string => {
      const n = nameField ? String(rowData[nameField] ?? '').trim() : '';
      const d = diameterField ? String(rowData[diameterField] ?? '').trim() : '';
      return joinMaterialText(d, n);
    };

    if (result.field === '_marka' && onBrandChange) {
      // ── SD1-SD10 (PRD Kesin Cozum 29.07): doldurma IZOLE MODULDE ───────
      // Eski inline mantik (149 satir; _marka ve _firma icin iki ayri,
      // birbirinden bagimsiz evrilmis dal) SILINDI. Sozlesme artik
      // fill-down.ts'te ve fill-down.test.ts ile kilitli:
      //   SD1 tek motor · SD2 atomik satir sonucu (sessiz bos IMKANSIZ)
      //   SD3 kaynak fiyat kopyalanmaz · SD7 tek adimda Ctrl+Z
      // FAZ 0 §A kok nedeni: eski kod isareti setDataValue('_matStatus')
      // ile yaziyordu; _matStatus grid KOLONU OLMADIGI icin AG-Grid cagriyi
      // sessizce yok sayiyordu (141 satirin 131'i isaretsiz bos kaldi).
      const prevSwitch = autoVariantEnabled;
      onAutoVariantChange?.(true); // K15/K18: anahtar gorsel geciyle ACILIR

      const srcNode = api.getDisplayedRowAtIndex(result.sourceRowIndex);
      const srcDet = buildMaterialContextDetailed(
        api, result.sourceRowIndex,
        nameField, data.columnRoles.noField, data.columnRoles.brandField, quantityField,
        data.columnRoles.diameterField,
      );
      const srcTags: string[] | null =
        (srcNode?.data?._matVariantTags && srcNode.data._matVariantTags.length > 0
          ? srcNode.data._matVariantTags
          : null) ??
        (srcDet.header ? groupVariantsRef.current[srcDet.header]?.tags ?? null : null);
      const srcLabel: string =
        srcNode?.data?._matVariantLabel ??
        (srcDet.header ? groupVariantsRef.current[srcDet.header]?.label : undefined) ?? '';

      const sonuc = await fillDown({
        hedefler: result.targetRowNodes,
        markaId: result.value,
        roller: data.columnRoles as any,
        motor: (rowIdx, id, ad, opts) => onBrandChange(rowIdx, id, ad, opts) as any,
        kaynakVaryantTags: srcTags,
        kaynakLabel: srcLabel,
        // SD4: sorgu = grup basligindan miras alinan ad + satirin KENDI capi
        sorguMetni: (node: any) => {
          const det = buildMaterialContextDetailed(
            api, node.rowIndex ?? 0,
            nameField, data.columnRoles.noField, data.columnRoles.brandField, quantityField,
            data.columnRoles.diameterField,
          );
          return det.name || lookupNameOf(node.data);
        },
      });

      // K19/SD7: doldurmanin TAMAMI tek Ctrl+Z ile geri alinir
      markaFillUndoStack.current.push({
        prevSwitch,
        entries: sonuc.geriAl.map((g) => ({ rowId: String(g.rowIdx), prev: g.oncekiDegerler })),
      });
      // _matStatus grid kolonu olmadigindan cellStyle'in yeniden
      // degerlendirilmesi icin ACIK refresh sart.
      api.refreshCells({ force: true });
      // §3: "n satır güncellendi" bilgisi (parent toast)
      onAutoVariantApplied?.({
        applied: sonuc.ozet.fiyatli,
        waiting: sonuc.ozet.aday,
        missing: sonuc.ozet.yok + sonuc.ozet.urunDegil + sonuc.ozet.hata + sonuc.ozet.adYok,
        kaynak: srcLabel || 'marka',
      });
      rootWrapperRef.current?.focus();
    } else if (result.field === '_firma' && onFirmaChange) {
      // PRD Iscilik L7 + SD1: AYNI modul, isçilik alanlariyla. Kaynak fiyat
      // ASLA kopyalanmaz; kaynak satirin kalem CINSI (_labVariantTags)
      // hedeflere tasinir. K19 paritesi: firma sureklemesi de tek Ctrl+Z.
      const srcLabNode = api.getDisplayedRowAtIndex(result.sourceRowIndex);
      const srcLabTags: string[] | null =
        srcLabNode?.data?._labVariantTags && srcLabNode.data._labVariantTags.length > 0
          ? srcLabNode.data._labVariantTags
          : null;

      const sonuc = await fillDown({
        hedefler: result.targetRowNodes,
        markaId: result.value,
        roller: data.columnRoles as any,
        motor: (rowIdx, id, ad, opts) => onFirmaChange(rowIdx, id, ad, opts) as any,
        kaynakVaryantTags: srcLabTags,
        kaynakLabel: '',
        hedefAlanlar: {
          dal: 'iscilik',
          birimFiyat: laborUnitPriceField,
          toplam: laborTotalField,
          status: '_labStatus',
          kaynakRozeti: '_labKaynak',
        },
        sorguMetni: (node: any) => lookupNameOf(node.data),
      });

      markaFillUndoStack.current.push({
        prevSwitch: autoVariantEnabled,
        entries: sonuc.geriAl.map((g) => ({ rowId: String(g.rowIdx), prev: g.oncekiDegerler })),
      });
      api.refreshCells({ force: true });
      rootWrapperRef.current?.focus();
    } else if (result.field === '_malzKar') {
      // Malzeme kar % fill → deger kopyala + fiyat recalc
      // ⚠ `sayiAlani` ZORUNLU: kaynak hucre kullanicinin yazdigi STRING'i
      // tasiyor ("12,5"). Ham parseFloat burada 12 verir; kaynak satirin
      // KENDISI ise 12,5 ile hesaplanir — ayni sutunda IKI FARKLI kar.
      // (Kapı: ozellik/fiyat/kar-tek-suzgec.test.ts)
      const karVal = sayiAlani(result.value);
      for (const node of result.targetRowNodes) {
        if (!node.data?._isDataRow) continue;
        node.setDataValue('_malzKar', karVal);
        // Fiyat recalc — P2-1a: MUHURLU formul (pricing.ts), ham carpim YASAK.
        const netPrice = parseFloat(String(node.data._matNetPrice ?? 0)) || 0;
        const qty = etkinMiktar(node.data, quantityField, unitField); // UY2
        const y = karYayilimi(netPrice, karVal, qty);
        if (y) {
          if (materialUnitPriceField) node.setDataValue(materialUnitPriceField, y.birim);
          if (materialTotalField) node.setDataValue(materialTotalField, y.toplam);
        }
      }
    } else if (result.field === '_iscKar') {
      // Iscilik kar % fill → deger kopyala + fiyat recalc
      // Malzeme ikiziyle AYNI suzgec (ikizi unutma).
      const iscKarVal = sayiAlani(result.value);
      for (const node of result.targetRowNodes) {
        if (!node.data?._isDataRow) continue;
        node.setDataValue('_iscKar', iscKarVal);
        // P2-1a: malzeme dali ile AYNI muhurlu formul — iki dal ayrisamaz.
        const netPrice = parseFloat(String(node.data._labNetPrice ?? 0)) || 0;
        const qty = etkinMiktar(node.data, quantityField, unitField); // UY2
        const y = karYayilimi(netPrice, iscKarVal, qty);
        if (y) {
          if (laborUnitPriceField) node.setDataValue(laborUnitPriceField, y.birim);
          if (laborTotalField) node.setDataValue(laborTotalField, y.toplam);
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
    stopEditing(): void {
      // false = commit et (iptal etme). Pending edit → cellValueChanged →
      // handleCellValueChanged → onRowDataChange, hepsi senkron akar.
      gridRef.current?.api?.stopEditing(false);
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

    // ── ADIM 7 (06.08): kendi `+= parseFloat` dongusu KALDIRILDI ──────────
    // Sayfa toplami artik TEK fonksiyondan gelir (pricing.sayfaToplamlari) —
    // kalem 65'in "bagimsiz aritmetik #1"i buydu. _ozet dislama kurali
    // (30.07 kullanici karari: Icmal cift sayardi) fonksiyonun ICINDE yasar.
    // KAR SATIRI (ADIM 10) ayni cagrinin matKar/labKar/toplamKar alanlarina
    // binecek — kar icin ikinci bir hesap yeri ACILMAZ.
    const satirlar: any[] = [];
    gridRef.current.api.forEachNode((node) => { if (node.data) satirlar.push(node.data); });
    const ozet = sayfaToplamlari(satirlar, data.columnRoles as any);
    const sumMatTotal = ozet.matToplam;
    const sumLabTotal = ozet.labToplam;
    const genelToplam = ozet.genelToplam;

    const pinnedRow: any = {
      _rowIdx: -1,
      _isDataRow: false,
      _isHeaderRow: false,
      _isPinnedTotal: true,
    };
    if (nameField) pinnedRow[nameField] = 'GENEL TOPLAM';
    // ADIM 8: hane karari TEK yerden (pricing.PARA_ONDALIK) — toplam satiri
    // GOSTERIM katmanidir, ciplak sabit yazilamaz.
    if (materialTotalField) pinnedRow[materialTotalField] = sumMatTotal.toFixed(PARA_ONDALIK);
    if (laborTotalField) pinnedRow[laborTotalField] = sumLabTotal.toFixed(PARA_ONDALIK);
    // Toplam Tutar: grandTotalField varsa ona yaz
    if (grandTotalField) {
      pinnedRow[grandTotalField] = genelToplam.toFixed(PARA_ONDALIK);
    }
    // grandTotalField yoksa ama grandUnitPriceField varsa, oraya toplam yaz (fallback)
    if (!grandTotalField && grandUnitPriceField) {
      pinnedRow[grandUnitPriceField] = genelToplam.toFixed(PARA_ONDALIK);
    }
    // grandUnitPriceField ayrıca varsa boş bırak (birim toplamı anlamsız)
    if (grandUnitPriceField && grandTotalField) {
      pinnedRow[grandUnitPriceField] = '';
    }

    // ── ADIM 10 (06.08): GENEL TOPLAM'in HEMEN ALTINA KAR SATIRI ──────────
    // Kullanicinin 05.08 istegi. Deger AYNI sayfaToplamlari cagrisindan gelir
    // (kar = maliyet−satis farki) — burada hesap YOK (KE27). Yalniz teklif
    // akisinda gorunur: kutuphane gridinde kar kavrami yok. Pinned oldugu
    // icin rowData'ya, kayda ve musteri ciktisina YAPISAL olarak giremez.
    if (mode !== 'library') {
      const karRow = karSatiri(ozet, data.columnRoles as any, nameField);
      setPinnedBottomRow([pinnedRow, karRow]);
    } else {
      setPinnedBottomRow([pinnedRow]);
    }
  }, [data.columnRoles, mode]);
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
        width: columnWidths?.[c.field] ?? c.width ?? 120,
        editable: c.editable ?? false,
        pinned: c.pinned,
        suppressMovable: c.suppressMovable,
        resizable: true,
        // GS8: uzun malzeme adlari KESILMEZ — hucre metni sarilir ve tam
        // metin tooltip'te gorunur (sunucudan gelen wrapText bayragiyla).
        wrapText: (c as any).wrapText === true,
        tooltipValueGetter: (c as any).wrapText === true
          ? (p: any) => String(p.value ?? '')
          : undefined,
        // PRD v3.0 Bolum A: gizle/goster — hide=true ise AG-Grid cizmez (veri durur)
        hide: (c as any).hide === true,
      };

      // Fill handle indicator — Kar % sutunlari icin (% prefix'li gorsel)
      if (mode === 'quote' && (c.field === '_malzKar' || c.field === '_iscKar')) {
        const karField = c.field;
        // ── SAYI PARSER (KOK FIX, 11.08) ────────────────────────────────
        // AG-Grid v35: kolonda `cellRenderer` varsa `cellDataType` cikarimi
        // KAPANIR (canInferCellDataType), dolayisiyla sayi kolonuna otomatik
        // valueParser ENJEKTE EDILMEZ ve metin editoru degeri STRING birakir.
        // Sonuc: kullanici Kar %'ye elle "50" yazinca satirda "50" (string)
        // duruyordu; teklif kaydinda backend @IsNumber() reddedip HTTP 400
        // veriyordu ve string sessizce sessionStorage draft'ina da yaziliyor,
        // sayfa yenilense bile duzelmiyordu. `_draftDiscount` kolonu ayni
        // deseni zaten kullaniyor (asagida) — kar kolonlari unutulmustu.
        base.valueParser = (p: any) => {
          const n = parseFloat(String(p.newValue ?? '').replace(',', '.'));
          if (!Number.isFinite(n) || n < 0) return 0;
          return n;
        };
        base.cellRenderer = (params: ICellRendererParams) => {
          // ── KAR SATIRINDA GERCEKLESEN YUZDE (17.08 kullanici istegi) ────
          // Kullanicinin tanimi: "maliyet 100 TL (kar yuzdesi %0 iken), kar
          // 20 TL ise kar %20'dir." Yani bu, satirlara ELLE girilen kar
          // yuzdesi DEGIL; teklifin tamaminda GERCEKLESEN orandir. Ikisi
          // ayni kolonda ust uste durur ama farkli seylerdir:
          //   veri satirlari → kullanicinin GIRDIGI hedef yuzde
          //   KAR satiri     → maliyete gore OLUSAN yuzde (kar/maliyet)
          // Oran `pricing.karYuzdesi` ile turetilir; buradaki hesap YOKTUR.
          //
          // ⚠ KE28 ihlali DEGIL: o kural TUTAR hucrelerine yuzde basmayi
          // yasaklar; burasi zaten "Kar %" kolonu.
          if (params.node?.rowPinned === 'bottom' && (params.data as any)?._isKarRow) {
            const bilgi = (params.data as any)._karBilgi ?? {};
            const yuzde = karField === '_malzKar' ? bilgi.matYuzde : bilgi.labYuzde;
            // `null` = o tarafta fiyatli satir yok ya da maliyet sifir →
            // '—' basilir. %0 BASILMAZ: sifir kar ile "hesaplanamadi" ayni
            // sey degildir (KE29'un yuzde tarafi).
            if (yuzde === null || yuzde === undefined) {
              return <span style={{ color: '#94a3b8', fontWeight: 600 }}>—</span>;
            }
            return (
              <span style={{
                color: '#047857', fontWeight: 700, fontSize: 12,
                fontVariantNumeric: 'tabular-nums',
              }}>
                %{yuzde.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
              </span>
            );
          }
          if (!params.data?._isDataRow) return null;
          const val = params.value ?? 0;
          const hasVal = parseFloat(String(val)) > 0;
          return (
            <div className="fill-handle-cell" style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              {/* FRAMELESS (14.08): kutu durgun halde CERCEVESIZ ve zemini
                  seffaf — duz metin gibi durur; hover ve odakta belirir.
                  Gorunum `kar-kutu` sinifiyla CSS'e tasindi (inline stil
                  :hover/:focus uretemez). ⚠ GIRIS YOLUNA DOKUNULMADI: bu bir
                  `<span>`, canli `<input>` DEGIL — deger AG-Grid'in kendi
                  duzenleyicisinden `valueParser` (yukarida) uzerinden gecer.
                  Buraya `<input type="number">` konursa `setDataValue`
                  `valueParser`i CAGIRMAZ ve hucreye STRING yazilir; 5c95cf0'te
                  kapatilan canli HTTP 400 aynen geri doner. */}
              <div style={{ position: 'relative', width: 68, display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8', fontWeight: 500, pointerEvents: 'none', zIndex: 1 }}>%</span>
                <span className="kar-kutu" style={{
                  display: 'block', width: '100%', height: 28, padding: '0 8px 0 20px',
                  borderRadius: 8,
                  fontSize: 12, textAlign: 'right', lineHeight: '28px',
                  fontVariantNumeric: 'tabular-nums',
                  color: hasVal ? '#059669' : '#1e293b',
                  fontWeight: hasVal ? 500 : 400,
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
          // Ozet satiri fiyatlandirilmaz — marka secimi gosterilmez
          params.data?._ozet ? <span style={{ color: '#94a3b8', fontSize: 11 }}>özet</span> : (
          <BrandDropdown
            {...params}
            brands={brands}
            onBrandChange={onBrandChange}
            nameField={data.columnRoles.nameField}
            noField={data.columnRoles.noField}
            brandField={data.columnRoles.brandField}
            quantityField={data.columnRoles.quantityField}
            unitField={data.columnRoles.unitField}
            materialUnitPriceField={data.columnRoles.materialUnitPriceField}
            materialTotalField={data.columnRoles.materialTotalField}
            diameterField={data.columnRoles.diameterField}
            groupVariants={groupVariantsRef}
            autoVariantEnabled={autoVariantEnabled}
            onAutoVariantApplied={onAutoVariantApplied}
          />
          )
        );
        base.editable = false;
      } else if (c.cellRenderer === 'firmaRenderer') {
        base.cellRenderer = (params: ICellRendererParams) => (
          // Ozet satiri isciliklendirilmez
          params.data?._ozet ? <span style={{ color: '#94a3b8', fontSize: 11 }}>özet</span> : (
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
            unitField={data.columnRoles.unitField}
            laborUnitPriceField={data.columnRoles.laborUnitPriceField}
            laborTotalField={data.columnRoles.laborTotalField}
            diameterField={data.columnRoles.diameterField}
          />
          )
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

      // ── OZET SERIDI ROZETI (16.08 kullanici tasarimi) ───────────────────
      // Pinned bottom satirlarindaki "GENEL TOPLAM" / "KÂR" metni rozet
      // kutucuguna sarilir (gorunum CSS'te: `.ozet-rozet*`).
      //
      // ⚠ NEDEN RENDERER: AG-Grid bu hucreyi TEK eleman olarak ciziyor
      // (`<div class="ag-cell ... ag-cell-value">GENEL TOPLAM</div>` — ic
      // sarmalayici YOK, tarayicida olculdu). Sinifi hucreye vermek rozeti
      // hucre genisligi kadar yayardi; dar kutucuk icin bir `<span>` sart.
      //
      // ⚠ YALNIZ AD KOLONU ve YALNIZ PINNED SATIR: etiket metni
      // `updatePinnedBottom` tarafindan `pinnedRow[nameField]`e yaziliyor.
      // Normal satirlar dokunulmadan varsayilan yoldan gecer — bu kolon
      // MERGE (colSpan/rowSpan) tasiyor ve bicimlendirmesi degismemeli.
      if (field === data.columnRoles.nameField) {
        base.cellRenderer = (params: ICellRendererParams) => {
          if (params.node?.rowPinned !== 'bottom') {
            return params.valueFormatted ?? params.value ?? '';
          }
          const kar = (params.data as any)?._isKarRow === true;
          return (
            <span className={`ozet-rozet ${kar ? 'ozet-rozet-kar' : 'ozet-rozet-toplam'}`}>
              {params.valueFormatted ?? params.value}
            </span>
          );
        };
      }

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
          // ── ADIM 10 / KE29: KAR satiri — bos fiyat SIFIR KAR DEGILDIR ──
          // Deger null = "o tarafta hic fiyatli satir yok" → '—' basilir,
          // ₺0,00 BASILMAZ. Kismi fiyatliysa tutarin yanina fiyatsiz sayisi
          // yazilir. YUZDE hicbir kosulda basilmaz (KE28).
          if ((params.data as any)?._isKarRow) {
            // UC HUCRE, BIR TANE FAZLA DEGIL: kar yalniz Malz. Toplam,
            // Isc. Toplam ve Genel Toplam kolonlarinin altinda gorunur.
            // Diger para kolonlari (birim fiyatlar) BOS kalir — ilk tarayici
            // kosumunda '—' oralara da tasmisti, duzeltildi.
            const alan = params.colDef?.field;
            const genelAlan = data.columnRoles.grandTotalField ?? data.columnRoles.grandUnitPriceField;
            const karKolonu = alan === data.columnRoles.materialTotalField
              || alan === data.columnRoles.laborTotalField || alan === genelAlan;
            if (!karKolonu) return '';
            if (params.value === null || params.value === undefined || params.value === '') return '—';
            const kv = parseFloat(String(params.value));
            if (isNaN(kv)) return '—';
            // ⚠ 17.08: "N fiyatsız" METNI HUCREDEN KALDIRILDI (kullanici
            // istegi: "sadece rakam olacak"). Kolon dar oldugu icin metin
            // zaten kirpiliyordu ("₺0,00 · 86 fi…") — yani hem cirkin hem
            // OKUNAMAZDI.
            //
            // ⚠ BILGI SILINMEDI, TASINDI: fiyatsiz satir sayisi kullanicinin
            // "bu tutar EKSIK" uyarisidir; sessizce dusurulseydi kismi
            // fiyatlanmis bir teklif tam gorunurdu. Hucrenin `title`
            // ozniteligine yazilir (uzerine gelince cikar) ve kayit yolundaki
            // "N/M kalem fiyatsız" onayi zaten yerinde duruyor.
            return `${currencySymbol}${paraBicim(kv, conversionRate)}`;
          }
          const v = parseFloat(String(params.value ?? ''));
          if (isNaN(v)) return '';
          // Pinned bottom satirinda 0 bile gosterilsin (GENEL TOPLAM satiri)
          if (v === 0 && !params.node?.rowPinned) return '';
          // Gosterim hanesi: PARA_ONDALIK (P2-1b'de 1→2) — TEK KAYNAK: lib/pricing.ts
          const formatted = paraBicim(v, conversionRate);
          // Z4: satirin kendi para birimi varsa (_currency — kutuphane gridi)
          // onun sembolu basilir; yoksa global sembol (teklif akisi)
          const rowCurr = (params.data as any)?._currency;
          const sym = rowCurr ? (ROW_CURRENCY_SYMBOL[rowCurr] ?? currencySymbol) : currencySymbol;
          return `${sym}${formatted}`;
        };

        // FIYATSIZ SAYACI — hucreden kaldirildi, ipucuna tasindi (17.08).
        // Kullanici "sadece rakam" istedi; ama sayi tek basina "bu tutar
        // EKSIK" uyarisini tasimiyor. Ustune gelince gorunur, boylece kismi
        // fiyatlanmis bir teklif tam sanilmaz.
        base.tooltipValueGetter = (params: any) => {
          if (!params.data?._isKarRow) return undefined;
          const alan = params.colDef?.field;
          const bilgi = params.data._karBilgi ?? {};
          const fiyatsiz = alan === data.columnRoles.materialTotalField ? bilgi.matFiyatsiz
            : alan === data.columnRoles.laborTotalField ? bilgi.labFiyatsiz : 0;
          return fiyatsiz > 0 ? `${fiyatsiz} satır fiyatsız — bu tutar eksik` : undefined;
        };
        // Birim fiyat kolonlari — ALTIN KURAL isaretleri:
        //   mavi  = 'otomatik varyant' (V4.1 — grup seciminden atandi)
        //   sari  = 'oneri' (cap-only/baslik-ipucu eslesmesi, kontrol edin)
        //   kirmizi = 'yok'/'belirsiz' (eslesme yok — aktarim/secim bekliyor)
        //   gri   = 'urun_degil' (oran/hizmet satiri — fiyat beklenmiyor)
        //
        // ⚠ IKIZ (12.08): bu blok eskiden YALNIZ malzeme kolonuna baglaniydi.
        // Doldurma yolu iscilik dalinda `_labStatus`/`_labSebep`/
        // `_labAdaySayisi` yaziyordu ama HICBIR okuyucu yoktu → iscilik
        // firmasi surukleyip doldurunca eslesmeyen satirlar tamamen sessiz
        // kaliyordu. Karar mantigi `isaret.ts`e tasindi (jsdom'suz olculebilen
        // tek yer) ve iki kolon da AYNI tanimdan besleniyor — isaret.test.ts
        // malzeme ciktisinin BIREBIR ayni kaldigini da olcer.
        const iscilikFiyatKolonu = !!data.columnRoles.laborUnitPriceField
          && field === data.columnRoles.laborUnitPriceField;
        const malzemeFiyatKolonu = field === data.columnRoles.materialUnitPriceField;
        if (malzemeFiyatKolonu || iscilikFiyatKolonu) {
          const girdiden = (d: any): IsaretGirdisi => (malzemeFiyatKolonu
            ? {
              dal: 'malzeme', durum: d?._matStatus, sebep: d?._matSebep,
              adaySayisi: d?._matAdaySayisi, otoVaryant: d?._matAutoVariant, oneri: d?._matSuggestion,
            }
            : {
              dal: 'iscilik', durum: d?._labStatus, sebep: d?._labSebep,
              adaySayisi: d?._labAdaySayisi,
            });
          base.cellStyle = ((params: any) => {
            if (params.node?.rowPinned || !params.data) return { textAlign: 'right' };
            const stil = isaretStili(girdiden(params.data));
            return stil ? { textAlign: 'right', ...stil } : { textAlign: 'right' };
          }) as any;
          base.tooltipValueGetter = ((params: any) => {
            if (!params.data || params.node?.rowPinned) return '';
            return isaretTooltip(girdiden(params.data));
          }) as any;
        } else {
          base.cellStyle = { textAlign: 'right' };
        }

        // BASLIK HIZASI (18.08): hucreler zaten saga hizali (yukaridaki iki
        // dal da textAlign:'right' veriyor) ama BASLIKLAR sola yasliydi —
        // rakam sutunu sagda, adi solda duruyordu. Kolonlar Excel'den
        // geldigi icin sabit col-id YOK; bu yuzden hiza CSS'ten degil,
        // hucre hizasinin verildigi AYNI yerden headerClass ile veriliyor.
        base.headerClass = 'mpx-sag-baslik';
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
          const formatted = paraBicim(v, conversionRate);
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
  // Kolonu olmayan alana yazim — writePriceToNode'daki yazVeri ile AYNI
  // gerekce; bu geri cagirim ayri kapsamda oldugu icin kendi kopyasi.
  const yazVeriHucre = (node: any, alan: string, deger: any) => {
    if (node?.data) node.data[alan] = deger;
    try { node?.setDataValue?.(alan, deger); } catch { /* kolon yok */ }
  };

  const handleCellValueChanged = useCallback((e: CellValueChangedEvent<ExcelRowData>) => {
    const row = e.data;
    if (!row || !row._isDataRow) return;

    const {
      materialUnitPriceField, materialTotalField,
      laborUnitPriceField, laborTotalField,
      grandUnitPriceField, grandTotalField,
      quantityField, unitField,
    } = data.columnRoles;

    // Infinite loop engelleme: grand kolonlarinda degisim olursa recalc tetikleme
    if (e.colDef.field === grandUnitPriceField || e.colDef.field === grandTotalField) {
      return;
    }

    // ── PRD v3.0 Bolum A2: KAT sutunu edit'i → MIK = katlarin toplami ──
    // Isaretli kat sutunu duzenlenince MIK (quantityField) yeniden hesaplanir;
    // setDataValue(quantityField) alttaki miktar→toplam→fiyat zincirini tetikler.
    if (
      floorFields && floorFields.length > 0 && quantityField &&
      e.colDef.field && floorFields.includes(e.colDef.field) && e.source === 'edit'
    ) {
      let sum = 0;
      for (const f of floorFields) sum += parseFloat(String(row[f] ?? '').replace(',', '.')) || 0;
      const yeni = sum === 0 ? '' : String(Math.round(sum * 1000) / 1000);
      if (String(row[quantityField] ?? '') !== yeni) {
        e.node.setDataValue(quantityField, yeni);
      }
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
      const kar = sayiAlani(row._malzKar);
      // ── MALIYET GERIYE TURETILIR (06.08 canli hata) ──────────────────────
      // Eski kod, `_matNetPrice` bossa hucreyi NET sanip okuyordu. Hucre SATIS
      // tasir: net 1558,5 · kar %20 → hucre 1870,2. Kar 0 yapilinca
      // hesaplaSatisBirimFiyat(1870,2, 0) = 1870,2 → fiyat "oldugu yerde
      // kaliyordu"; %20→%30'da ise bilesik carpip ₺405,20 fazla yaziyordu.
      // Dogrusu: hucredeki satisi ONCEKI kar ile bolup maliyeti bulmak.
      // e.oldValue = bu duzenlemeden ONCEKI kar yuzdesi.
      // ⚠ Bu ayni zamanda ESKI KAYITLARI da onarir: bugune kadar kaydedilmis
      //    tekliflerde `_matNetPrice` 0'dir (yazim sessizce dusuyordu).
      const oncekiKar = sayiAlani(e.oldValue);
      const net = typeof row._matNetPrice === 'number' && row._matNetPrice > 0
        ? row._matNetPrice
        : maliyetiGeriTuret(parseFloat(String(row[materialUnitPriceField] ?? '')) || 0, oncekiKar);

      if (!row._matNetPrice || row._matNetPrice === 0) {
        yazVeriHucre(e.node, '_matNetPrice', net);
      }

      if (net > 0) {
        const finalPrice = hesaplaSatisBirimFiyat(net, kar);
        const qty = etkinMiktar(row, quantityField, unitField); // UY2
        const total = hesaplaSatirToplam(finalPrice, qty);
        e.node.setDataValue(materialUnitPriceField, finalPrice.toFixed(1));
        e.node.setDataValue(materialTotalField, total.toFixed(1));
        console.log(`[ExcelGrid] Malz. kar recalc: row=${row._rowIdx}, net=${net}, kar=${kar}%, final=${finalPrice}, qty=${qty}, total=${total}`);
      }
      setTimeout(() => { recalcGrand(); updatePinnedBottom(); }, 0);
    }

    // ── Iscilik kar % degisti ──
    if (e.colDef.field === '_iscKar' && laborUnitPriceField && laborTotalField && quantityField) {
      const kar = sayiAlani(row._iscKar);
      // Malzeme ikiziyle AYNI duzeltme (bkz. yukaridaki gerekce).
      const oncekiKarLab = sayiAlani(e.oldValue);
      const net = typeof row._labNetPrice === 'number' && row._labNetPrice > 0
        ? row._labNetPrice
        : maliyetiGeriTuret(parseFloat(String(row[laborUnitPriceField] ?? '')) || 0, oncekiKarLab);

      if (!row._labNetPrice || row._labNetPrice === 0) {
        yazVeriHucre(e.node, '_labNetPrice', net);
      }

      if (net > 0) {
        const finalPrice = hesaplaSatisBirimFiyat(net, kar);
        const qty = etkinMiktar(row, quantityField, unitField); // UY2
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
        const matKar = sayiAlani(row._malzKar);
        const matNet = typeof row._matNetPrice === 'number' && row._matNetPrice > 0
          ? row._matNetPrice
          : maliyetiGeriTuret(parseFloat(String(row[materialUnitPriceField] ?? '')) || 0, matKar);
        if (matNet > 0) {
          const finalPrice = hesaplaSatisBirimFiyat(matNet, matKar);
          e.node.setDataValue(materialTotalField, hesaplaSatirToplam(finalPrice, qty).toFixed(1));
        }
      }

      if (laborUnitPriceField && laborTotalField) {
        const labKar = sayiAlani(row._iscKar);
        const labNet = typeof row._labNetPrice === 'number' && row._labNetPrice > 0
          ? row._labNetPrice
          : maliyetiGeriTuret(parseFloat(String(row[laborUnitPriceField] ?? '')) || 0, labKar);
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
      const kar = sayiAlani(row._malzKar);
      // Girilen deger ekran hucresinden — kar uygulanmis final kabul et
      // Net'i geriye hesapla
      const net = kar > 0 ? enteredPrice / (1 + kar / 100) : enteredPrice;
      yazVeriHucre(e.node, '_matNetPrice', net);
      row._matKurBilgi = null; // elle girilen TL fiyatin kaynak kuru yoktur
      e.node.setDataValue('_matStatus', ''); // manuel fiyat girildi — bekleme isareti kalkar
      const qty = etkinMiktar(row, quantityField, unitField); // UY2
      e.node.setDataValue(materialTotalField, hesaplaSatirToplam(enteredPrice, qty).toFixed(1));
      setTimeout(() => { recalcGrand(); updatePinnedBottom(); }, 0);
      console.log(`[ExcelGrid] Manuel malz. birim: row=${row._rowIdx}, entered=${enteredPrice}, kar=${kar}%, net=${net.toFixed(2)}, qty=${qty}`);
    }

    // ── Iscilik birim fiyat manuel degisti ──
    if (e.colDef.field === laborUnitPriceField && e.source === 'edit' && laborTotalField && quantityField) {
      const enteredPrice = parseFloat(String(e.newValue ?? '').replace(',', '.')) || 0;
      const kar = sayiAlani(row._iscKar);
      const net = kar > 0 ? enteredPrice / (1 + kar / 100) : enteredPrice;
      yazVeriHucre(e.node, '_labNetPrice', net);
      row._labKurBilgi = null; // elle girilen TL fiyatin kaynak kuru yoktur
      const qty = etkinMiktar(row, quantityField, unitField); // UY2
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

    // ── Library mode: HERHANGI gercek kolon edit'i _dirty isaretler ──
    // Onceden YALNIZ _draftDiscount isaretliyordu → mevcut satirda Liste Fiyat/
    // Malzeme Adi/Birim degisikligi sessizce kayboluyordu (Kaydet butonu cikmaz,
    // save-sheets o satiri okumaz). Artik ad/fiyat/birim/yapisal her edit sayilir.
    if (mode === 'library' && e.source === 'edit' && !!e.colDef.field && !e.colDef.field.startsWith('_')) {
      row._dirty = true;
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
  }, [data.columnRoles, data.columnDefs, onRowDataChange, autoAppendRow, recountPending, floorFields]);

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
    {/* PRD 14.08: izgara yumusak kavisli, ince sinirli bir kart icinde durur.
        `overflow-hidden` sart — AG-Grid'in kendi kosesiz zemini kartin
        kavisini tasar ve alt kosede keskin dikdortgen gorunur. */}
    <div
      className="ag-theme-alpine w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
      style={{ height: '80vh' }}
    >
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
            // SOFT OZET SERIDI (16.08 kullanici tasarimi): eski koyu bloklar
            // (lacivert/yesil + beyaz metin) yerine acik zemin. Satirlari
            // birbirinden ayiran sey artik ZEMIN degil, etiket ROZETI ve
            // rakamin rengi — sayfanin geri kalaniyla ayni gorsel dil.
            //
            // ⚠ ADIM 10 KORUNDU: KAR satiri hala GORSEL OLARAK ayrisir (yesil
            // rakam + yesil rozet). Ayrisma sebebi kozmetik degil: kar IC
            // BILGIDIR, musteriye giden ciktida yeri yoktur ve kullanici onu
            // toplamla karistirmamalidir.
            if ((p.data as any)?._isKarRow) {
              return { backgroundColor: '#f8fafc', color: '#047857', fontWeight: 700 };
            }
            return { backgroundColor: '#f8fafc', color: '#0f172a', fontWeight: 700 };
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
        onColumnResized={(e: any) => {
          // GS8: yalniz kullanici surukleyip BIRAKTIGINDA kaydet (her piksel
          // degil) — finished bayragi AG-Grid'in son olayini isaret eder.
          if (!e?.finished || e?.source === 'sizeColumnsToFit' || !onColumnWidthsChange) return;
          const w: Record<string, number> = {};
          e.api?.getColumns?.()?.forEach((col: any) => {
            const f = col.getColId?.();
            const genislik = col.getActualWidth?.();
            if (f && genislik) w[f] = Math.round(genislik);
          });
          if (Object.keys(w).length) onColumnWidthsChange(w);
        }}
        onCellValueChanged={handleCellValueChanged}
        stopEditingWhenCellsLoseFocus
        // ⚠ Surukle-doldur ayni sabiti okur (useFillHandle) — types.ts'te TEK
        // kaynak; ayrilirsa surukleme yanlis satirlara doldurur.
        rowHeight={SATIR_YUKSEKLIGI}
        headerHeight={34}
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
          /* PRD 14.08 — yalniz COK HAFIF yatay ayraclar.
             ⚠ AG-Grid'in KENDI degiskeni kullanilir; ag-row uzerine elle
             border-bottom kurali YAZILMAZ: AG-Grid satir yuksekligi hesabina
             ag-row-border-width degiskenini katar ve elle eklenen bir kenarlik
             28px satirda 1px tasma uretir — 15.000 satirda birikip sanal
             kaydirma ile gercek satir konumunu kaydirir. */
          --ag-row-border-color: #f1f5f9;
          /* Dikey ayraclar: seffaf. Genislik yine 1px rezerve edilir, bu yuzden
             kullanicinin kaydettigi kolon genislikleri KAYMAZ. */
          --ag-cell-horizontal-border: solid transparent;
          /* Odak halkasi — sert mavi cerceve yerine soft indigo */
          --ag-range-selection-border-color: #6366f1;
          --ag-selected-row-background-color: rgba(99, 102, 241, 0.06);
        }
        /* Alpine'in baslik ayirac cubugu kisa dikey cizgi cizer — PRD'nin
           "dikey cizgi yok" kurali basligi da kapsar. Yeniden boyutlandirma
           HALA calisir (kulp gorunmez ama hit alani duruyor). */
        .ag-theme-alpine .ag-header-cell-resize::after {
          background-color: transparent;
        }
        .hidden-merged-cell {
          display: none !important;
        }
      `}</style>
    </div>
    </div>
  );
});
