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
import { ExcelGrid } from '@/ozellik/tablo/excel-grid/ExcelGrid';
import type { ExcelGridData, MatchCandidate } from '@/ozellik/tablo/excel-grid/types';

// Loglar REACT DISI tutulur (window.__olay): setState her sorguda parent'i
// re-render edip AG Grid hucrelerini remount ettiriyordu → popup state'i
// ucuyordu. Canli sayfada handler'lar memoize oldugu icin bu tuzak yok.
declare global { interface Window { __olay?: string[]; __kurBayat?: boolean } }
const kaydet = (m: string) => {
  if (typeof window === 'undefined') return;
  (window.__olay = window.__olay ?? []).push(m);
  console.log('[GridTest]', m);
};

const CAP_FIYAT: Record<string, number> = { "6''": 600, "4''": 400, "3''": 300, "3/4''": 75, "5''": 500, "8''": 800 };
// ISCILIK fiyatlari MALZEMEDEN FARKLI (kaynak kopyasi degil KENDI sorgu kaniti):
const LAB_FIYAT: Record<string, number> = { "6''": 60, "4''": 40, "3''": 30, "3/4''": 7, "5''": 50, "8''": 80 };

function aday(materialName: string, label: string, netPrice: number, variantTags: string[]): MatchCandidate {
  return {
    materialName, netPrice, listPrice: netPrice, discount: 0,
    tags: [], popular: false, label, surfaceLevel: true, variantTags,
  };
}

export default function GridTestPage() {
  const [autoVariant, setAutoVariant] = useState(false); // KAPALI baslar — K15 oto-ACILMA kaniti
  // KP: pano kopyalama (Ctrl+C) IKI modda da yasar — kutuphane KAYNAK
  // (Net Fiyat), teklif HEDEF (Birim Fiyat). Library modu ayrica
  // `_draftDiscount`/`_draftNetPrice` sistem kolonlarini ekler; secim gorseli
  // orada AYRI cellClassRules ile bagli oldugu icin elle/e2e ancak boyle
  // olculebiliyor.
  const [mod, setMod] = useState<'quote' | 'library'>('quote');
  // D9 + Y1 (30.09): SALT OKUNUR SECICI bayragi. `quotes/[id]` goruntuleme
  // sayfasinin gectigi `seciciSaltOkunur` burada `?salt=1` ile surulur —
  // tiklanamayan hucrenin gercekten secim URETMEDIGI ancak gercek tarayicida
  // olculebilir (ExcelGrid jsdom'suz kosmuyor). Bayragin KENDI sayfada
  // gecirildigini olcen ayri bir kaynak kapisi var:
  // ozellik/teklif/salt-okunur-secici.test.ts ("mekanizma var, baglanti yok").
  // Varsayilan KAPALI — mevcut tum e2e paketleri etkilenmez.
  //
  // ⚠ RENDER SIRASINDA `window` OKUNMAZ: ilk hali boyle yazilmisti ve SSR'de
  // false / istemcide true vererek HYDRATION UYUSMAZLIGI uretiyordu; React
  // grid altagacini yeniden kuruyor ve KP17'nin ok-tusu ritmi tam e2e
  // kosumunda duzenli olarak DUSUYORDU (olculdu). Bayrak mount'tan SONRA
  // yazilir — sunucu ve istemci ilk cizimde ayni seyi gorur.
  // D11 (30.09): ISCILIK YETKISI bayragi. `?iscilik=kapali` → yetki mount'tan
  // SONRA kapanir; `?iscilik=gec` → yetki KAPALI baslar, 300 ms sonra ACILIR.
  // Ikincisi gercek dunyayi taklit eder: yetenekler `/auth/me` ile ASENKRON
  // gelir (CapabilitiesContext once EMPTY ile acilir). Duzeltmede `laborEnabled`
  // bir useCallback/useMemo bagimliligina YAZILMAZSA kapi ilk degerde (false)
  // TAKILI kalir ve Pro kullanicinin iscilik kari SESSIZCE calismaz — bu kip o
  // gerilemeyi olcer. Varsayilan: acik (mevcut tum e2e'ler etkilenmez).
  const [iscilikAcik, setIscilikAcik] = useState(true);
  const [paraKipi, setParaKipi] = useState<'tl' | 'karisik'>('tl');
  const [digerDoviz, setDigerDoviz] = useState(false);
  const [gorunumUSD, setGorunumUSD] = useState(false);
  const [toplamsiz, setToplamsiz] = useState(false);
  // F6c: `?tumu=TRY|USD|EUR` → "Tumu X" gorunumu; canli kur 1 $ = ₺41, 1 € = ₺45 —
  // DOLAR MARKA'nin DONUK kuru (40) bilerek farkli: "once donuk kur" olculsun.
  const [tumu, setTumu] = useState<'TRY' | 'USD' | 'EUR' | null>(null);
  const tumuGorunum = useMemo(() => (tumu ? { hedef: tumu, tlKuru: { USD: 41, EUR: 45 } } : null), [tumu]);
  // ⚠ GRID BAYRAKLAR OKUNDUKTAN SONRA MOUNT EDILIR. Ilk halinde grid ilk
  // render'da `iscilikAcik=true` goruyordu; `?iscilik=gec` boylece gercek
  // dunyanin TERSINI (once acik, sonra kapali, sonra acik) suruyordu ve
  // "ilk degerde FALSE'a takili kapi" mutanti o testte HAYATTA kalirdi —
  // test olcmedigi bir seyi iddia ediyordu. Bayrak render'da okunamaz
  // (SSR/istemci hydration uyusmazligi); cozum grid'i bir tik geciktirmek.
  const [gridHazir, setGridHazir] = useState(false);
  const [kutuphaneDoviz, setKutuphaneDoviz] = useState(false);
  // C10 (P4b Parti 3 madde 2): `?kur=bayat` → DOLAR MARKA / DOLAR USTA kurunu
  // BAYAT (3 is gunu) dondurur — fiyat hucresinde amber serit + kur notu
  // olculur. REF: sorgu mock'lari bos bagimlilikla memoize (handler kimligi
  // degisirse hucreler yeniden kurulur — bkz. sayfa basindaki not).
  // `window.__kurBayat = true` sayfa ACIKKEN kuru bayatlatir, DEGERI ayni
  // kalir: ayni firma/marka yeniden secilince fiyat metni degismez — serit
  // yine de gorunmeli (inceleme MEDIUM-1, iscilik hucresi zorla tazelenir).
  const kurBayatRef = useRef(false);
  const dolarKuru = () => ({
    currency: 'USD', kur: 40, tarih: '2026-10-05',
    ...(kurBayatRef.current || window.__kurBayat ? { bayat: true, yasIsGunu: 3 } : {}),
  });
  React.useEffect(() => {
    const arama = new URLSearchParams(window.location.search);
    const kip = arama.get('iscilik');
    if (kip === 'kapali' || kip === 'gec') setIscilikAcik(false);
    // Y5 (02.10): `?oto=acik` → oto-varyant anahtari grid KURULMADAN once acik.
    // ExcelGrid sozlesmesi (`autoVariantEnabled` varsayilani TRUE) grup varyanti
    // sorgusunu canli tutar; ama marka hucresi anahtari columnDefs memo'sundan
    // okur ve memo onu BAGIMLILIK olarak tasimaz — sonradan acilan anahtari
    // hucre GORMEZ. Uretim sayfasi sabit `false` gecirir (PRD v3.0 B), yani bu
    // yalniz harness'ta gorunur; sozlesmeyi olcmenin yolu baslangicta acmak.
    if (arama.get('oto') === 'acik') setAutoVariant(true);
    // COKLU PARA BIRIMI F2 (05.10): `?para=karisik` → izgara karisik kipte
    // (taraf para birimi). Uretim sayfasi F6'ya dek GECIRMEZ.
    if (arama.get('para') === 'karisik') setParaKipi('karisik');
    // F6a: `?digerDoviz=1` → baska sayfada doviz var (uretim sayfasi `digerSayfalardaDovizVar`la gecirir).
    if (arama.get('digerDoviz') === '1') setDigerDoviz(true);
    // F6a: `?gorunumUSD=1` → ekran USD (kur 40) — sayfanin TL/USD/EUR anahtari gibi
    if (arama.get('gorunumUSD') === '1') setGorunumUSD(true);
    // F6a (inceleme H1): `?toplamsiz=1` → sayfada TOPLAM sutunu rolu yok (yalniz birim fiyat)
    if (arama.get('toplamsiz') === '1') setToplamsiz(true);
    const tumuSorgu = arama.get('tumu');
    if (tumuSorgu === 'TRY' || tumuSorgu === 'USD' || tumuSorgu === 'EUR') setTumu(tumuSorgu);
    // KUTUPHANE DOVIZ NETI (05.10): `?kutuphaneDoviz=1` → kutuphane modunda satir 2
    // USD ve liste 10,55 (₺ kurali $10,60 gosterirdi). Varsayilan KAPALI.
    if (arama.get('kutuphaneDoviz') === '1') setKutuphaneDoviz(true);
    kurBayatRef.current = arama.get('kur') === 'bayat';
    setGridHazir(true); // ayni tikte toplanir → grid ilk render'da DOGRU degeri gorur
    if (kip === 'gec') {
      const t = setTimeout(() => setIscilikAcik(true), 300);
      return () => clearTimeout(t);
    }
  }, []);
  const [saltOkunurSecici, setSaltOkunurSecici] = useState(false);
  React.useEffect(() => {
    setSaltOkunurSecici(new URLSearchParams(window.location.search).get('salt') === '1');
  }, []);
  const cagriSayisi = useRef(0);
  const log = kaydet;

  // ⚠ HOOK'LAR GOVDEDE: bunlar eskiden JSX prop'unun ICINDE `useMemo` idi —
  // grid KOSULLU (`gridHazir &&`) render edilince hook sirasi degisti ve sayfa
  // "Rendered more hooks than during the previous render" ile COKTU (olculdu,
  // D11 harness duzeltmesi). Hook her render'da AYNI sirada cagrilmali.
  // D14 (02.10): ÇAYIROVA = "bu markada yok, baska markada var" (alternatif dal)
  const markalar = useMemo(() => [{ id: 'b-ayvaz', name: 'AYVAZ' }, { id: 'b-sardogan', name: 'SARDOĞAN' }, { id: 'b-cayirova', name: 'ÇAYIROVA' }, { id: 'b-dolar', name: 'DOLAR MARKA' }], []);
  const firmalar = useMemo(() => [
    { id: 'f-yasin', name: 'YASİN USTA', discipline: 'mechanical' as const },
    { id: 'f-hakan', name: 'HAKAN USTA', discipline: 'mechanical' as const },
    // D14b (04.10): OZKAN = motor bu kalem icin KAYIT DONDURMEDI → sarmalayici
    // `null` doner (quotes/new isçilik dali `if (!match) return null`). Sebepsiz
    // sonuc ancak boyle uretilir; surukle-doldur bayat sebep olcumu icin.
    { id: 'f-ozkan', name: 'ÖZKAN USTA', discipline: 'mechanical' as const },
    // F2 (05.10): DOLAR USTA — isçilik fiyat listesi USD (kaynakFiyat doner).
    { id: 'f-dolar', name: 'DOLAR USTA', discipline: 'mechanical' as const },
  ], []);
  const data: ExcelGridData = useMemo(() => {
    const sys = {
      _malzKar: 0, _iscKar: 0, _marka: null, _firma: null, _matNetPrice: 0, _merges: {},
      _matBirim: '', _matToplam: '', _labBirim: '', _labToplam: '', _toplam: '', _labNetPrice: 0,
    };
    // KP: kutuphane modunda LISTE FIYATI dolu gelir (gercek kutuphanede de
    // oyle) — Net Fiyat = liste × (1-iskonto) ancak boyle hesaplanir ve
    // "₺600,00" gibi BICIMLI metnin panoya dogru gittigi olculebilir.
    // Quote modu (E2E'nin kostugu mod) BILEREK bos kalir: grid.spec.ts fiyat
    // hucrelerinin bos oldugunu assert eder.
    const listeFiyati = (ad: string) => {
      const c = Object.keys(CAP_FIYAT).sort((x, y) => y.length - x.length).find((k) => ad.includes(k));
      return c ? String(CAP_FIYAT[c]) : '';
    };
    const satir = (i: number, no: string, ad: string, mik: string, veri = true, baslik = false,
      ek: Record<string, unknown> = {}) => ({
      _rowIdx: i, _isDataRow: veri, _isHeaderRow: baslik, ...sys,
      _matBirim: veri && mod === 'library' ? listeFiyati(ad) : '',
      col0: no, col1: ad, col2: mik, col3: veri ? 'mt' : '',
      ...ek,
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
        // ISCILIK sutunlari (firma fill + K19 firma undo paritesi testi)
        { field: '_iscKar', headerName: 'İşç. Kar %', width: 80, editable: true },
        { field: '_firma', headerName: 'İşç. Firma', width: 150, cellRenderer: 'firmaRenderer' },
        { field: '_labBirim', headerName: 'İşç. Birim Fiyat', width: 120, editable: true },
        { field: '_labToplam', headerName: 'İşç. Toplam', width: 120, editable: false },
        { field: '_toplam', headerName: 'Toplam', width: 120, editable: false },
      ],
      rowData: [
        satir(0, 'No', 'Malzeme Adı', 'Miktar', false, true),
        satir(1, '', 'Siyah Çelik Boru TS EN 10255', '', false),
        satir(2, '1', "6'' Siyah Boru", '286', true, false,
          kutuphaneDoviz && mod === 'library' ? { _currency: 'USD', _matBirim: '10.55' } : {}),
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
        // KUR-01 (29.09): doviz kuru ALINAMAYAN satir — motor `kurAlinamadi`
        // dondurur, satir 'hata' isareti alir ve TURUNCU boyanir. Urun VAR,
        // eksik olan yalniz kur; 'yok' YAZILMAZ (taslak geri yuklemesi 'yok'u
        // cevaplanmis sayar, kur donunce satiri yeniden fiyatlamazdi).
        // ⚠ SONA eklendi: mevcut satir indeksleri KAYMASIN (tum e2e onlara bagli).
        satir(11, '10', "KURSUZ 10'' Boru", '7'),
        // ── D3 (30.09): YETIM SATIR AILESI — baslik mirasi olculebilsin ──
        // Yukaridaki 12 satirin ADI "Boru" iceriyor; `isSelfSufficientRow`
        // (build-material-context.ts TYPE_WORD_RE) onlari KENDI KENDINE YETERLI
        // sayiyor ve baslik mirasini HIC eklemiyor. Yani harness, "sorgu
        // basligi tasiyor mu?" sorusunu bugune kadar AYIRT EDEMIYORDU.
        // "DN 100" / "DN 150" tip sozcugu tasimaz → baslik GERCEKTEN eklenir
        // (build-material-context.test.ts:24 ile ayni sinif).
        // ⚠ SONA eklendi: satir 10 ve 11 baska testlerde SABIT yazili
        // (grid.spec, isaret-yazimi, secim-duzenleme) — araya girmek onlari
        // kaydirirdi. KP29'un kimlik assert'i bu yuzden guncellendi; sessiz
        // kaymayi o kapi yakaladi (tasarlandigi gibi).
        satir(12, '11', 'Yükselen Milli Vana (OS&Y Valve)', '', false, true),
        satir(13, '12', 'DN 100', '5'),
        satir(14, '13', 'DN 150', '3'),
        // ── D11 (30.09): ISCILIK YETKISI KAPALIYKEN Isc. Kar TUTAMAGI ─────────
        // Kaynak %25 kar tasir, hedefler %0 kar + 100'luk iscilik birim fiyati.
        // Kapali yetkide surukleme hedeflere 25 YAZARSA handleCellValueChanged
        // iscilik birim/toplamini YENIDEN yazar (100 → 125) ve GENEL TOPLAM
        // sessizce degisir — olculecek para etkisi bu. Degerler FARKLI olmali:
        // ayni deger yazilsa AG Grid olay ATESMEZ (vakum olcum olurdu).
        // ⚠ SONA eklendi (satir indeksleri baska testlerde sabit); KP29 kimligi
        // bu yuzden guncellendi.
        satir(15, '14', 'KAR KAYNAK Boru', '2', true, false,
          { _iscKar: 25, _labBirim: '125.0', _labToplam: '250.0', _labNetPrice: 100 }),
        satir(16, '15', 'KAR HEDEF A Boru', '2', true, false,
          { _iscKar: 0, _labBirim: '100.0', _labToplam: '200.0' }),
        satir(17, '16', 'KAR HEDEF B Boru', '2', true, false,
          { _iscKar: 0, _labBirim: '100.0', _labToplam: '200.0' }),
      ],
      columnRoles: {
        nameField: 'col1', noField: 'col0', quantityField: 'col2', unitField: 'col3',
        materialUnitPriceField: '_matBirim',
        laborUnitPriceField: '_labBirim',
        ...(toplamsiz ? {} : { materialTotalField: '_matToplam', grandTotalField: '_toplam', laborTotalField: '_labToplam' }),
      },
      brands: [],
      headerEndRow: 0,
    };
  }, [mod, kutuphaneDoviz, toplamsiz]);

  const onBrandChange = useCallback(async (rowIdx: number, brandId: string, materialName: string, opts?: { variantTags?: string[]; silent?: boolean }) => {
    cagriSayisi.current++;
    const vt = opts?.variantTags?.join(',') ?? '-';
    log(`#${cagriSayisi.current} sorgu: satir=${rowIdx} "${materialName.slice(0, 30)}" varyant=[${vt}]`);

    // D14 (denetim): ag hatasi simulasyonu — sorgu FIRLATIR (fetch reject esdegeri)
    // D14b (04.10): CAYIROVA HARIC — satira once bir SEBEP yazilabilsin (alternatif
    // dali), sonra surukleme hatasi o sebebi bayat birakiyor mu olculsun.
    if (materialName.includes('HATALI') && brandId !== 'b-cayirova') { log('AG HATASI firlatildi'); throw new Error('ağ hatası (mock)'); }

    // KUR-01 (29.09): urun VAR ama doviz kuru alinamadi → 'hata' (turuncu)
    if (materialName.includes('KURSUZ')) {
      log('KUR ALINAMADI dondu');
      return { netPrice: 0, confidence: 'none', kurAlinamadi: true, reason: 'Döviz kuru alınamadı.' } as any;
    }

    // D14 (02.10): ALTERNATIF-MARKA DALI — urun bu markada yok, AYVAZ'da var.
    // Mock bugune kadar bu cevabi HIC uretmiyordu; dalin isaret yazimi
    // olculemiyordu. Satir EKLENMEDI (indeksler kaymaz) — yalniz markaya bagli.
    if (brandId === 'b-cayirova') {
      log('CAYIROVA: bu markada yok, AYVAZ\'da var');
      return {
        netPrice: 0, confidence: 'none', reason: 'Bu markada bu ürün ailesi yok.',
        alternatives: [{ brandId: 'b-ayvaz', brandName: 'AYVAZ', materialName: 'Çelik boru · siyah', netPrice: 100, listPrice: 100, discount: 0 }],
      } as any;
    }

    // F2 (05.10): DOLAR MARKA — fiyat listesi USD. Motor (F1) TL alanlarina EK
    // olarak `kaynakFiyat` doner; kur 40. 6'' tek eslesme $10,50 · 1'' iki
    // aday ($9,25 / $11,125) · digerleri cap basina $ fiyat. Tl kipinde
    // izgara TL alanlarini yazar (bugunku davranis).
    if (brandId === 'b-dolar') {
      const usd = (n: number) => ({ currency: 'USD', net: n, list: n, discount: 0 });
      const kur = dolarKuru();
      if (materialName.includes("1''")) {
        return {
          netPrice: 0, confidence: 'multi', reason: '2 seçenek',
          candidates: [
            { ...aday('Dolar boru · vidalı · 1"', 'vidalı $', 370, ['v:usd-vid']), kaynakKur: kur, kaynakFiyat: usd(9.25) },
            { ...aday('Dolar boru · düz uçlu · 1"', 'düz uçlu $', 445, ['v:usd-duz']), kaynakKur: kur, kaynakFiyat: usd(11.13) },
          ],
        } as any;
      }
      const capU = Object.keys(CAP_FIYAT).sort((a, b) => b.length - a.length).find((c) => materialName.includes(c));
      const net = capU === "6''" ? 10.5 : capU ? CAP_FIYAT[capU] / 40 : 0;
      if (!net) return { netPrice: 0, confidence: 'none', reason: 'Bu markada yok.' } as any;
      return { netPrice: Math.round(net * 40 * 100) / 100, confidence: opts?.variantTags?.length ? 'suggestion' : 'high', autoVariant: !!opts?.variantTags?.length, matchedName: `Dolar boru · ${capU}`, variantTags: ['v:usd'], kaynakKur: kur, kaynakFiyat: usd(net) } as any;
    }

    // Y5 (02.10): BASLIKLI AILE (satir 12-14) FIYATLANIR. Grup varyanti
    // (`groupVariants[baslik]`) yalniz BASLIK baglami olan satirda kaydedilir;
    // yukaridaki boru satirlari kendi kendine yeterli (baslik yok), bu yuzden
    // "grup varyantiyla sorgu" yolu harness'ta HIC surulmuyordu. Ilk secim iki
    // aday sorar; varyant verilince kendi DN'inin fiyati otomatik doner.
    if (materialName.includes('Milli Vana')) {
      const dn = materialName.includes('DN 150') ? 150 : 100;
      const fiyatDn = dn * 10;
      if (opts?.variantTags?.length) {
        return { netPrice: fiyatDn, confidence: 'suggestion', autoVariant: true, matchedName: `OS&Y vana · flanşlı · DN ${dn}` } as any;
      }
      return {
        netPrice: 0, confidence: 'multi',
        candidates: [
          aday(`OS&Y vana · flanşlı · DN ${dn}`, 'flanşlı', fiyatDn, ['v:flansli']),
          aday(`OS&Y vana · yivli · DN ${dn}`, 'yivli', fiyatDn - 100, ['v:yivli']),
        ],
        reason: '2 seçenek',
      } as any;
    }

    // D1 (30.09): MARKAYA GORE AYRISAN cevap. "Satir A ile fiyatlandi, sonra
    // B secildi ve B'de urun YOK" senaryosu ancak boyle uretilebilir — mock
    // bugune kadar yalnizca ADA bakiyordu, marka degistirmek cevabi
    // degistirmiyordu. SARDOGAN'da 6'' yoktur; diger caplarda normal davranir
    // (1'' hala aday sorar), boylece 'yok' ve 'belirsiz' dallari ayri olculur.
    if (brandId === 'b-sardogan' && materialName.includes("6''")) {
      // D2 (30.09): SARDOGAN bu sorguda YAVAS. Yaris ancak cevaplar FARKLI
      // HIZDA donerse kurulur — kullanici yavas markayi secip beklemeden
      // baskasina gecer, hizli olan once biter, sonra yavasin gec cevabi
      // gelip UZERINE yazar. Sifir gecikmeli taklit iki async adimi tek tike
      // toplar ve bu sinifi hic uretmez.
      await new Promise((r) => setTimeout(r, 500));
      log('SARDOGAN (gec): bu markada 6\'\' YOK');
      return { netPrice: 0, confidence: 'none', reason: 'Bu markada 6" yok.' } as any;
    }

    // K16: 2'' bu markada YOK
    if (materialName.includes("2''")) return { netPrice: 0, confidence: 'none', reason: 'Bu üründe 2" yok.' };

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

  // ISCILIK firma sorgusu mock'u (onBrandChange ikizi, LAB_FIYAT ile) —
  // firma fill + K19 firma undo paritesi testi icin.
  const onFirmaChange = useCallback(async (rowIdx: number, firmaId: string, laborName: string, opts?: { variantTags?: string[]; silent?: boolean }) => {
    cagriSayisi.current++;
    const vt = opts?.variantTags?.join(',') ?? '-';
    log(`#${cagriSayisi.current} ISC sorgu: satir=${rowIdx} "${laborName.slice(0, 30)}" varyant=[${vt}]`);
    if (laborName.includes('HATALI')) { log('ISC AG HATASI firlatildi'); throw new Error('ağ hatası (mock)'); }
    if (firmaId === 'f-ozkan') { log('OZKAN: motor kaydi yok (null)'); return null as any; }
    if (firmaId === 'f-dolar') {
      const capI = Object.keys(LAB_FIYAT).sort((a, b) => b.length - a.length).find((c) => laborName.includes(c));
      const net = capI ? LAB_FIYAT[capI] / 40 : 0;
      if (!net) return { netPrice: 0, confidence: 'none', reason: 'Bu firmada yok.' } as any;
      return { netPrice: Math.round(net * 40 * 100) / 100, confidence: 'high', matchedName: `Dolar işçilik · ${capI}`, variantTags: ['v:usd'],
        kaynakKur: dolarKuru(), kaynakFiyat: { currency: 'USD', net, list: net, discount: 0 } } as any;
    }

    // D2 IKIZI (30.09): HAKAN USTA bu sorguda YAVAS ve FARKLI fiyat doner.
    // Malzeme tarafindaki SARDOGAN gecikmesinin iscilik karsiligi — yaris
    // ancak cevaplar hem FARKLI HIZDA hem FARKLI DEGERDE donerse olculebilir
    // (iki firma ayni fiyati verseydi gec cevabin ezip ezmedigi gorulmezdi).
    // ⚠ YAVAS FIRMA HAKAN SECILDI, YASİN DEGIL: grid.spec.ts DL testi kaynak
    // satirda (satir 2 = 6'') YASİN USTA secip 60 bekliyor — yavasligi oraya
    // koymak o testi kirmizi yapti (olculdu, tam e2e kosumunda yakalandi).
    if (firmaId === 'f-hakan' && laborName.includes("6''")) {
      await new Promise((r) => setTimeout(r, 500));
      log('HAKAN (gec): 6\'\' icin 999');
      return { netPrice: 999, confidence: 'high', matchedName: 'Kaynak işçiliği · 6"' } as any;
    }

    // BANT (30.09): YAVAS "bu firmada yok". Hizli cevap bant kusurunu MASKELIYOR
    // — React, kolon olayinin sayimini durum yazimiyla ayni tike topluyor ve
    // bant TESADUFEN dogru gorunuyor (olculdu: hizli dalda yesil, 500 ms'lik
    // dalda bant HIC gorunmedi). Iscilik sayac kapisi ancak bu dalla olculur
    // (mutant BANT-M2 hizli dalda YASIYORDU).
    if (firmaId === 'f-hakan' && laborName.includes("2''")) {
      await new Promise((r) => setTimeout(r, 500));
      log('HAKAN (gec): bu firmada 2\'\' YOK');
      return { netPrice: 0, confidence: 'none', reason: 'Bu firmada 2" yok.' } as any;
    }
    if (laborName.includes("2''")) return { netPrice: 0, confidence: 'none', reason: 'Bu firmada 2" yok.' } as any;
    if (laborName.includes("1''")) {
      return {
        netPrice: 0, confidence: 'multi',
        candidates: [aday('Kaynaklı işçilik · 1"', 'kaynaklı', 9, ['v:kaynak']), aday('Dişli işçilik · 1"', 'dişli', 10, ['v:disli'])],
        reason: '2 seçenek',
      } as any;
    }
    const cap = Object.keys(LAB_FIYAT).sort((a, b) => b.length - a.length).find((c) => laborName.includes(c));
    const fiyat = cap ? LAB_FIYAT[cap] : 0;
    // Tek eslesme (kaynak secim + fill hedefleri): kendi cap iscilik fiyati
    return { netPrice: fiyat, confidence: 'high', matchedName: `Kaynak işçiliği · ${cap}`, variantTags: ['v:kaynak'] } as any;
  }, []);

  const onAutoVariantChange = useCallback((v: boolean) => {
    setAutoVariant(v);
    kaydet(`ANAHTAR → ${v ? 'AÇIK' : 'KAPALI'}`);
  }, []);
  // Y4 (02.10): `hatali` ve `dal` da loglanir — isçilik doldurma ozeti
  // d3402cd yeniden yaziminda kaybolmustu ve hata sayisi kullaniciya hic
  // ulasmiyordu; olcut bu sayilarin GERCEKTEN geldigidir.
  const onAutoVariantApplied = useCallback(({ applied, waiting, missing, kaynak, hatali, dal }: { applied: number; waiting: number; missing: number; kaynak: string; hatali?: number; dal?: string }) => {
    kaydet(`YAYILIM: ${applied} yazıldı · ${waiting} seçim bekliyor · ${missing} yok · ${hatali ?? 0} hata (kaynak: ${kaynak}, dal: ${dal ?? '-'})`);
  }, []);

  if (process.env.NODE_ENV === 'production') {
    return <div style={{ padding: 24 }}>Bu sayfa yalnız development ortamında çalışır.</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontWeight: 700, marginBottom: 4 }}>🧪 Grid Test — K15-K19 / K9 (mock, API'siz)</h1>
      <div data-testid="switch-state" style={{ fontSize: 13, marginBottom: 8 }}>
        Anahtar durumu: <b>{autoVariant ? 'AÇIK' : 'KAPALI'}</b>
        {' · '}Mod: <b data-testid="mod-state">{mod}</b>{' '}
        <button
          type="button"
          data-testid="mod-toggle"
          onClick={() => setMod((m) => (m === 'quote' ? 'library' : 'quote'))}
          style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '1px 6px', fontSize: 12 }}
        >
          moda geç
        </button>{' '}
        {/* F6a: sayfa gecisi taklidi — baska sayfanin dovizi izgara kurulduktan SONRA degisir */}
        <button
          type="button"
          data-testid="diger-doviz"
          onClick={() => setDigerDoviz((v) => !v)}
          style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '1px 6px', fontSize: 12 }}
        >
          diğer sayfa döviz: {digerDoviz ? 'var' : 'yok'}
        </button>{' '}
        {/* F6c: gorunum anahtari taklidi — Karisik → Tumu ₺ → Tumu USD → Karisik */}
        <button
          type="button"
          data-testid="tumu-dongu"
          onClick={() => setTumu((t) => (t === null ? 'TRY' : t === 'TRY' ? 'USD' : null))}
          style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '1px 6px', fontSize: 12 }}
        >
          görünüm: {tumu ?? 'karışık'}
        </button>
      </div>
      {gridHazir && <ExcelGrid
        key={mod}
        data={data}
        brands={markalar}
        onBrandChange={onBrandChange as any}
        seciciSaltOkunur={saltOkunurSecici}
        paraBirimiKipi={paraKipi}
        digerSayfalardaDoviz={digerDoviz}
        tumuGorunum={tumuGorunum}
        autoVariantEnabled={autoVariant}
        onAutoVariantChange={onAutoVariantChange}
        onAutoVariantApplied={onAutoVariantApplied}
        // ISCILIK firma fill testi: laborEnabled + firma listesi + onFirmaChange
        laborEnabled={iscilikAcik}
        laborFirms={firmalar}
        sheetDiscipline="mechanical"
        onFirmaChange={onFirmaChange as any}
        mode={mod}
        libraryPriceField="materialUnitPriceField"
        currencySymbol={tumu ? { TRY: '₺', USD: '$', EUR: '€' }[tumu] : gorunumUSD ? '$' : '₺'}
        conversionRate={tumu === 'USD' ? 1 / 41 : tumu === 'EUR' ? 1 / 45 : gorunumUSD ? 1 / 40 : 1}
        // ⚠ GERCEK TEKLIF GRIDIYLE HIZA (29.09): `quotes/new` bu prop'u veriyor
        // ve FITTING kapsam kipi buna baglidir (`fittingDuzenlenebilir =
        // enableStructureEdit`). Harness onu vermedigi icin fitting kipi
        // burada HIC acilmiyordu — yani "fitting ile cakisma" sinifi
        // olculemiyordu. Sag tik menusunu de acar; hicbir E2E sag tik
        // kullanmiyor (olculdu), mevcut senaryolar etkilenmez.
        enableStructureEdit
      />}
      <div style={{ marginTop: 10, fontSize: 11, color: '#64748b' }}>
        Olay logu: konsolda <code>[GridTest]</code> ve <code>window.__olay</code> içinde.
      </div>
    </div>
  );
}
