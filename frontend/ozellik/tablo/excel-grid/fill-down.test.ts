/**
 * SD1-SD10 — SURUKLE-DOLDUR YENIDEN YAPIM KABUL TESTLERI
 * (PRD Kesin Cozum 29.07, Bolum A)
 *
 * FAZ 0 kok neden (FAZ0_KOK_NEDEN_RAPORU.md §A): esleme bulunamayinca satir
 * setDataValue('_matStatus','yok') ile isaretleniyor ama _matStatus bir GRID
 * KOLONU DEGIL → AG-Grid tanimsiz kolona yazmayi sessizce yok sayiyor →
 * ne fiyat ne isaret. Olcum: marka atanmis 141 satirin 131'i SESSIZ BOS.
 *
 * Bu paket, doldurmanin izole modulunu (fill-down.ts) sozlesmesiyle sinar.
 * SD2'nin cekirdegi: her hedef satir MUTLAKA bir sonuc alir — "marka atandi
 * ama fiyat sessizce bos" durumu imkansizdir.
 */
import { describe, it, expect, vi } from 'vitest';
import { fillDown, FillSonuc, MotorSonucu } from './fill-down';
// D1: silinen rozetin EKRANDA kırmızıyı maskelemediği aynı tanımdan ölçülür.
import { isaretStili } from './isaret';

/** Test cift'i: grid node taklidi (AG-Grid API yuzeyinin kullanilan kismi). */
function node(rowIdx: number, ad: string, miktar: number, extra: Record<string, any> = {}) {
  const data: Record<string, any> = { _rowIdx: rowIdx, _isDataRow: true, col1: ad, col3: miktar, ...extra };
  return {
    data,
    rowIndex: rowIdx,
    setDataValue: (k: string, v: any) => { data[k] = v; },
  };
}

const ROLLER = {
  nameField: 'col1', noField: 'col0', brandField: 'col2',
  quantityField: 'col3', unitField: 'col4',
  materialUnitPriceField: 'col5', materialTotalField: 'col6',
};

/** SAHINKUL GALVANİZ ÇELİK BORU grubu — kullanicinin senaryosu. */
function sahinkulHedefleri() {
  return [
    node(108, '¾"', 565), node(109, '1"', 140), node(110, '1¼"', 230),
    node(111, '1½"', 6), node(112, '2"', 60), node(113, '2½"', 6),
  ];
}

/** Cap → kutuphane fiyati (SD3/SD5: her cap KENDI fiyatini alir). */
const KUTUPHANE: Record<string, number> = {
  '¾"': 65.9, '1"': 92.3, '1¼"': 128.7, '1½"': 149.5, '2"': 291.2, '2½"': 372.8,
};

function motorFabrikasi(opts: { yokOlanlar?: string[]; adaylıOlanlar?: string[]; hataAtanlar?: string[] } = {}) {
  const cagrilar: string[] = [];
  const motor = async (rowIdx: number, brandId: string, ad: string): Promise<MotorSonucu | null> => {
    cagrilar.push(ad);
    const cap = Object.keys(KUTUPHANE).find((k) => ad.includes(k));
    if (opts.hataAtanlar?.some((c) => ad.includes(c))) throw new Error('ağ hatası');
    if (cap && opts.yokOlanlar?.includes(cap)) return { netPrice: 0, confidence: 'none' };
    if (cap && opts.adaylıOlanlar?.includes(cap)) {
      return { netPrice: 0, confidence: 'multi', candidates: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] as any };
    }
    if (!cap) return { netPrice: 0, confidence: 'none' };
    return { netPrice: KUTUPHANE[cap], confidence: 'high' };
  };
  return { motor, cagrilar };
}

describe('SD1-SD10 sürükle-doldur modülü', () => {
  it('SD1 tek motor: her hedef satır için eşleştirme motoru çağrılır (drag özel yol YOK)', async () => {
    const { motor, cagrilar } = motorFabrikasi();
    const hedefler = sahinkulHedefleri();
    await fillDown({ hedefler: hedefler as any, markaId: 'brand-1', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(cagrilar.length).toBe(6);
    // sorgular hedefin KENDI capini tasir (kaynagin capini DEGIL)
    expect(cagrilar.some((c) => c.includes('¾"'))).toBe(true);
    expect(cagrilar.some((c) => c.includes('2½"'))).toBe(true);
  });

  it('TOHUM-1 kaynakta etiket yoksa ilk COZULEN hedefin kimligi sonrakilere tasinir (VS 25.08)', async () => {
    // Canli PILSA vakasinin FE ayagi: kaynak fiyati elle girilmis/eski kayit →
    // _matVariantTags bos → etiketsiz surukleme her hedefi filtresiz sorgular
    // ve coklu adayli ailelerde hepsi 'belirsiz' kalirdi. Kural: ilk basarili
    // hedefin dondurdugu variantTags sonraki cagrilar icin TOHUM olur.
    const gordugumTags: Array<string[] | undefined> = [];
    const motor = async (_r: number, _b: string, ad: string, opts?: { variantTags?: string[] }): Promise<MotorSonucu | null> => {
      gordugumTags.push(opts?.variantTags);
      const cap = Object.keys(KUTUPHANE).find((k) => ad.includes(k));
      if (!cap) return { netPrice: 0, confidence: 'none' };
      return { netPrice: KUTUPHANE[cap], confidence: 'high', variantTags: ['ad:pp kuresel vana', 'cins:yapistirma'] };
    };
    const hedefler = sahinkulHedefleri();
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b1', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(sonuc.ozet.fiyatli).toBe(6);
    // ilk cagri TOHUMSUZ (kaynakta etiket yok), sonraki 5 cagri tohumu tasir
    expect(gordugumTags[0]).toBeUndefined();
    for (const t of gordugumTags.slice(1)) expect(t).toEqual(['ad:pp kuresel vana', 'cins:yapistirma']);
    // satirlara da tohum yazilir (bayat degil, cozulen kimlik)
    for (const h of hedefler) expect(h.data._matVariantTags).toEqual(['ad:pp kuresel vana', 'cins:yapistirma']);
  });

  it('TOHUM-2 kaynakta etiket VARSA tohum devreye girmez — kaynak kimligi kazanir', async () => {
    const gordugumTags: Array<string[] | undefined> = [];
    const motor = async (_r: number, _b: string, ad: string, opts?: { variantTags?: string[] }): Promise<MotorSonucu | null> => {
      gordugumTags.push(opts?.variantTags);
      const cap = Object.keys(KUTUPHANE).find((k) => ad.includes(k));
      return cap ? { netPrice: KUTUPHANE[cap], confidence: 'high', variantTags: ['cins:BASKA'] } : { netPrice: 0, confidence: 'none' };
    };
    const hedefler = sahinkulHedefleri();
    await fillDown({ hedefler: hedefler as any, markaId: 'b1', roller: ROLLER, motor, kaynakVaryantTags: ['cins:galvaniz'], kaynakLabel: 'Galvaniz' });
    for (const t of gordugumTags) expect(t).toEqual(['cins:galvaniz']);
    for (const h of hedefler) expect(h.data._matVariantTags).toEqual(['cins:galvaniz']);
  });

  it('SD2 atomik sonuç: HER hedef satır fiyat VEYA eylemli işaret alır — sessiz boş imkânsız', async () => {
    // 2 satır fiyatlı, 2 satır kütüphanede yok, 2 satır çok adaylı
    const { motor } = motorFabrikasi({ yokOlanlar: ['1¼"', '1½"'], adaylıOlanlar: ['2"', '2½"'] });
    const hedefler = sahinkulHedefleri();
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'brand-1', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });

    expect(sonuc.satirlar.length).toBe(6);
    for (const s of sonuc.satirlar) {
      const fiyatli = s.durum === 'fiyat';
      const isaretli = s.durum === 'aday' || s.durum === 'yok' || s.durum === 'urun_degil' || s.durum === 'hata';
      expect(fiyatli || isaretli).toBe(true); // üçüncü hâl YOK
    }
    // grid'e yazılan: fiyatlı satırda değer, işaretli satırda _matStatus
    for (const h of hedefler) {
      const fiyat = String(h.data[ROLLER.materialUnitPriceField] ?? '').trim();
      const status = String(h.data._matStatus ?? '').trim();
      expect(fiyat !== '' || status !== '').toBe(true); // SESSİZ BOŞ YASAK
    }
    expect(sonuc.ozet.fiyatli).toBe(2);
    expect(sonuc.ozet.aday).toBe(2);
    expect(sonuc.ozet.yok).toBe(2);
  });

  it('SD2b motor exception atsa bile satır işaretlenir (catch{} sessizliği yasak)', async () => {
    const { motor } = motorFabrikasi({ hataAtanlar: ['1¼"'] });
    const hedefler = sahinkulHedefleri();
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    const hatali = sonuc.satirlar.find((s) => s.rowIdx === 110);
    expect(hatali?.durum).toBe('hata');
    const gridNode = hedefler.find((h) => h.data._rowIdx === 110)!;
    expect(String(gridNode.data._matStatus ?? '')).not.toBe(''); // işaret ZORUNLU
  });

  it('SD3 kaynak fiyat ASLA kopyalanmaz: her satır kendi çapının fiyatını alır', async () => {
    const { motor } = motorFabrikasi();
    const hedefler = sahinkulHedefleri();
    await fillDown({
      hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor,
      kaynakVaryantTags: ['ad:galvaniz celik boru'], kaynakLabel: 'Galvaniz',
      kaynakFiyat: 52.4, // ½" kaynağının fiyatı — hiçbir hedefe yazılmamalı
    });
    const fiyatlar = hedefler.map((h) => parseFloat(String(h.data[ROLLER.materialUnitPriceField])));
    expect(fiyatlar).toEqual([65.9, 92.3, 128.7, 149.5, 291.2, 372.8]);
    expect(fiyatlar.includes(52.4)).toBe(false);
  });

  it('SD5 ŞAHİNKUL kabulü: tutar = miktar × birim fiyat (565 mt, 140 mt…)', async () => {
    const { motor } = motorFabrikasi();
    const hedefler = sahinkulHedefleri();
    await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    const h0 = hedefler[0]; // ¾" · 565 mt · 65,9
    expect(parseFloat(String(h0.data[ROLLER.materialTotalField]))).toBeCloseTo(565 * 65.9, 1);
    const h1 = hedefler[1]; // 1" · 140 mt · 92,3
    expect(parseFloat(String(h1.data[ROLLER.materialTotalField]))).toBeCloseTo(140 * 92.3, 1);
  });

  it('SD6 kütüphanede yok → eylemli işaret; çok aday → aday sayısı taşınır', async () => {
    const { motor } = motorFabrikasi({ yokOlanlar: ['¾"'], adaylıOlanlar: ['1"'] });
    const hedefler = sahinkulHedefleri();
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    const yok = sonuc.satirlar.find((s) => s.rowIdx === 108)!;
    expect(yok.durum).toBe('yok');
    expect(hedefler[0].data._matStatus).toBe('yok');
    const aday = sonuc.satirlar.find((s) => s.rowIdx === 109)!;
    expect(aday.durum).toBe('aday');
    expect(aday.adaySayisi).toBe(3);
    expect(hedefler[1].data._matStatus).toBe('belirsiz');
  });

  // ── E5 (26.08): AYNI CEVAP, IKI YOL, IKI FARKLI ISARET ──────────────
  // Motor bu markada bulamayip BASKA MARKALARDA bulunca `alternatives` döner.
  // Dropdown'dan aynı seçim ELLE yapılınca ExcelGrid '_matStatus = belirsiz'
  // yazıp alternatif popup'ını açıyor; sürükleme yolu ise aynı cevaba 'yok'
  // yazıyordu → tooltip "Bu markada bu ürün ailesi yok." (ÇIKMAZ SOKAK),
  // oysa motor ürünü BULMUŞTU. Alan motor cevabında vardı, fill-down'ın
  // tipinde YOKTU ve hiç okunmuyordu — 'ölü bayrak'ın ayna görüntüsü.
  it('E5 alternatives dönen cevap sürüklemede de "belirsiz" işaretlenir (etkileşimli yolla aynı)', async () => {
    const motor = async (_r: number, _b: string, ad: string): Promise<MotorSonucu | null> =>
      ad.includes('1"')
        ? { netPrice: 0, confidence: 'none', reason: 'Bu markada bu ürün ailesi yok.',
            alternatives: [{ brand: 'B', price: 91 }, { brand: 'C', price: 95 }] as any }
        : { netPrice: KUTUPHANE['¾"'], confidence: 'high' };
    const hedefler = [node(108, '¾"', 565), node(109, '1"', 140)];
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    const alt = sonuc.satirlar.find((s) => s.rowIdx === 109)!;
    expect(alt.durum).toBe('aday');           // 'yok' DEGIL
    expect(alt.adaySayisi).toBe(2);
    expect(hedefler[1].data._matStatus).toBe('belirsiz');
    expect(sonuc.ozet.yok).toBe(0);           // ozet/toast sayaci da dogru
    expect(sonuc.ozet.aday).toBe(1);
  });

  it('E5 KARSI: alternatives de candidates de yoksa satir AYNEN "yok" kalir', async () => {
    const motor = async (_r: number, _b: string, ad: string): Promise<MotorSonucu | null> =>
      ad.includes('1"') ? { netPrice: 0, confidence: 'none', reason: 'Bu üründe 1" yok.' }
        : { netPrice: KUTUPHANE['¾"'], confidence: 'high' };
    const hedefler = [node(108, '¾"', 565), node(109, '1"', 140)];
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(sonuc.satirlar.find((s) => s.rowIdx === 109)!.durum).toBe('yok');
    expect(hedefler[1].data._matStatus).toBe('yok');
    expect(sonuc.ozet.aday).toBe(0);
  });

  it('SD7 geri-alma anlığı: doldurmadan ÖNCEKİ değerler tek pakette döner', async () => {
    const { motor } = motorFabrikasi();
    const hedefler = sahinkulHedefleri();
    hedefler[0].data[ROLLER.materialUnitPriceField] = '11.1'; // önceden dolu
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(sonuc.geriAl.length).toBe(6);
    const ilk = sonuc.geriAl.find((g) => g.rowIdx === 108)!;
    expect(ilk.oncekiDegerler[ROLLER.materialUnitPriceField]).toBe('11.1');
  });

  it('SD10 duyarlılık: hedefin çapı değişirse dönen fiyat DEĞİŞMEK zorunda', async () => {
    const { motor } = motorFabrikasi();
    const a = [node(200, '¾"', 10)];
    const b = [node(200, '2"', 10)];
    await fillDown({ hedefler: a as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    await fillDown({ hedefler: b as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    const fa = parseFloat(String(a[0].data[ROLLER.materialUnitPriceField]));
    const fb = parseFloat(String(b[0].data[ROLLER.materialUnitPriceField]));
    expect(fa).not.toBe(fb);
  });

  it('SD8 veri satırı olmayan hedefler atlanır ama sayımda görünür', async () => {
    const { motor } = motorFabrikasi();
    const bandi = node(120, 'GRUP BANDI', 0);
    bandi.data._isDataRow = false;
    const hedefler = [...sahinkulHedefleri(), bandi];
    const sonuc = await fillDown({ hedefler: hedefler as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(sonuc.satirlar.length).toBe(6); // bandı işlenmedi
    expect(sonuc.ozet.atlanan).toBe(1);
  });

  it('SD6b CANLI VAKA: kaynağın varyantı hedef çapta yoksa SEBEP + aday sayısı satıra yazılır', async () => {
    // 30.07 canlı bulgu: DN150'ye "kırmızı (astar) boyalı" seçildi; DN65/DN25
    // çaplarında o cins yok. Motor doğru davranıp sessiz ikame yapmadı ama
    // ekranda yalnız pembe hücre vardı → "otomatik varyant çalışmıyor".
    const motor = async (): Promise<MotorSonucu> => ({
      netPrice: 0,
      confidence: 'multi',
      candidates: [{ label: 'siyah' }, { label: 'galvanizli' }] as any,
      reason: 'Seçilen varyant bu çapta kütüphanede yok — elle seçin.',
    });
    const hedefler = [node(109, 'Dikişli Siyah Çelik Boru, DN65', 34000)];
    const sonuc = await fillDown({
      hedefler: hedefler as any, markaId: 'cayirova', roller: ROLLER, motor,
      kaynakVaryantTags: ['ad:celik boru', 'cins:kirmizi (astar) boyali'], kaynakLabel: 'kırmızı boyalı',
    });
    expect(sonuc.satirlar[0].durum).toBe('aday');
    expect(sonuc.satirlar[0].sebep).toContain('bu çapta kütüphanede yok');
    // satırda GÖRÜNÜR: sebep + aday sayısı (tooltip bunları okur)
    expect(hedefler[0].data._matSebep).toContain('elle seçin');
    expect(hedefler[0].data._matAdaySayisi).toBe(2);
    expect(hedefler[0].data._matStatus).toBe('belirsiz');
  });

  it('SD2c adı boş satır SESSİZ atlanmaz — işaretlenir', async () => {
    const { motor } = motorFabrikasi();
    const bos = node(130, '', 5);
    const sonuc = await fillDown({ hedefler: [bos] as any, markaId: 'b', roller: ROLLER, motor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(sonuc.satirlar.length).toBe(1);
    expect(sonuc.satirlar[0].durum).toBe('ad-yok');
    expect(String(bos.data._matStatus ?? '')).not.toBe('');
  });

  // ── KÂR HÜCRESİNİN OKUNMASI (12.08) ────────────────────────────────────
  // Beklenen değerler ELDE hesaplandı; ürünün formülünden TÜRETİLMEDİ
  // (dairesel ölçüt yasak). satış = net × (1+kar), 1 haneye yukarı.

  const ISCILIK_ALANLARI = {
    birimFiyat: '_labBirim', toplam: '_labToplam',
    status: '_labStatus', kaynakRozeti: '_labKaynak', dal: 'iscilik' as const,
  };
  const netVeren = (net: number) => async (): Promise<MotorSonucu> =>
    ({ netPrice: net, confidence: 'high' });

  it('KÂR-1 İKİZ: işçilik dalı _iscKar okur — MALZEME kârı işçilik fiyatına BULAŞMAZ', async () => {
    // Satırda malzeme %50, işçilik %0. Doldurma öncesi hata: dal ne olursa
    // olsun `_malzKar` okunuyordu → işçilik net 200 iken 300 yazılıyordu ve
    // `sayfaToplamlari` maliyeti _iscKar=0 ile hesapladığı için o %50 kâr
    // olarak HİÇ görünmüyordu (KE15 sözleşmesinin ihlali).
    const h = node(200, 'Montaj bedeli', 2, { _malzKar: 50, _iscKar: 0 });
    await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER, motor: netVeren(200),
      kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });
    expect(h.data._labBirim).toBe('200.0');   // kusurlu hâl: '300.0'
    expect(h.data._labToplam).toBe('400.0');  // kusurlu hâl: '600.0'
  });

  it('KÂR-2 İKİZ: malzeme dalı _iscKar\'dan ETKİLENMEZ', async () => {
    const h = node(201, 'Çelik boru', 2, { _malzKar: 0, _iscKar: 50 });
    await fillDown({
      hedefler: [h] as any, markaId: 'marka-1', roller: ROLLER, motor: netVeren(200),
      kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data[ROLLER.materialUnitPriceField]).toBe('200.0');
  });

  it('KÂR-3 TR KLAVYE: "12,5" ekranda da 12,5 — 12 DEĞİL (kayıtla aynı süzgeç)', async () => {
    // Kusurlu hâl: `parseFloat("12,5")` = 12 → birim 112.0 / toplam 224.0.
    // Kayıt yolu (`sayiAlani`) aynı hücreden 12,5 okuyordu: ekranda gördüğün
    // fiyat ile veritabanına yazılan kâr AYRIŞIYORDU.
    const h = node(202, 'Çelik boru', 2, { _malzKar: '12,5' });
    await fillDown({
      hedefler: [h] as any, markaId: 'marka-1', roller: ROLLER, motor: netVeren(100),
      kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data[ROLLER.materialUnitPriceField]).toBe('112.5'); // 100 × 1,125
    expect(h.data[ROLLER.materialTotalField]).toBe('225.0');     // 112,5 × 2
  });

  // ── GENEL TOPLAM: DOLDURMA YOLU (12.08 çekişmeli inceleme bulgusu) ─────
  // ⚠ AYRI ROLLER: yukarıdaki ROLLER'da `grandTotalField` YOK — bu yüzden
  // `genelToplamiTazele` ilk satırındaki `if (!genelAlan) return;` ile hemen
  // çıkıyor ve SD1-SD10'un hiçbiri o fonksiyonu ÇALIŞTIRMIYORDU. Kusur tam
  // olarak orada saklandı. ROLLER'ı genişletmek yerine yenisi: mevcut
  // testlerin beklentileri değişmesin.
  const ROLLER_GENEL = {
    ...ROLLER,
    laborTotalField: '_labToplam',
    grandTotalField: '_toplam',
  };

  it('GT-1 İŞÇİLİK doldurmasında Toplam = malzeme + işçilik (işçilik İKİ KEZ sayılmaz)', async () => {
    // Kusurlu hâl: mat = oku(totAlan ?? materialTotalField) — işçilik dalında
    // totAlan = '_labToplam' olduğu için mat de lab de AYNI hücreyi okuyordu.
    // Sonuç: Toplam = 2 × işçilik ve MALZEME TOPLAMI satırdan düşüyordu.
    const h = node(300, 'Montaj bedeli', 2, { [ROLLER.materialTotalField]: '1000.0', _toplam: '1000.0' });
    await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER_GENEL, motor: netVeren(150),
      kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });
    expect(h.data._labToplam).toBe('300.0');            // 150 × 2
    expect(h.data._toplam).toBe('1300.00');             // kusurlu hâl: '600.0' · 2 hane: tur 3 A4a (kuruş katmanı)
  });

  it('GT-2 MALZEME doldurmasında da Toplam = malzeme + işçilik (ikiz simetrisi)', async () => {
    const h = node(301, 'Çelik boru', 2, { _labToplam: '1000.0', _toplam: '1000.0' });
    await fillDown({
      hedefler: [h] as any, markaId: 'marka-1', roller: ROLLER_GENEL, motor: netVeren(150),
      kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data[ROLLER.materialTotalField]).toBe('300.0');   // taraf toplamı: YUKARI 1 hane (değişmedi)
    expect(h.data._toplam).toBe('1300.00');
  });

  it('GT-3 malzeme toplamı BOŞken işçilik doldurması Toplam\'ı şişirmez', async () => {
    const h = node(302, 'Montaj bedeli', 2, {});
    await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER_GENEL, motor: netVeren(150),
      kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });
    expect(h.data._toplam).toBe('300.00');              // kusurlu hâl: '600.0'
  });

  it('GT-4 SD7 SÖZLEŞMESİ: YAZILAN her alan geri-alma anlığında da var', async () => {
    // Kural, alan listesi ezberlemeden: doldurmanın DEĞİŞTİRDİĞİ her alan
    // snapshot'ta olmalı. Yoksa Ctrl+Z satırı kendi içinde çelişkili bırakır
    // (Malz. Toplam eskiye döner, Toplam yeni değerde kalır) ve o hâliyle
    // kaydedilir. KD11 genel toplamı YAZMAYI ekledi, anlığa eklemeyi unuttu.
    const oncesi = { [ROLLER.materialTotalField]: '1000.0', _toplam: '1000.0', _labToplam: '' };
    const h = node(303, 'Çelik boru', 2, { ...oncesi });
    const sonuc = await fillDown({
      hedefler: [h] as any, markaId: 'marka-1', roller: ROLLER_GENEL, motor: netVeren(150),
      kaynakVaryantTags: null, kaynakLabel: '',
    });

    const anlik = sonuc.geriAl[0].oncekiDegerler;
    const degisenler = Object.keys(h.data).filter((k) => h.data[k] !== (oncesi as any)[k] && k in oncesi);
    expect(degisenler.length, 'doldurma hiçbir şeyi değiştirmediyse test bir şey ölçmüyor').toBeGreaterThan(0);
    for (const alan of degisenler) {
      expect(Object.prototype.hasOwnProperty.call(anlik, alan), `${alan} YAZILDI ama geri-alma anlığında YOK`).toBe(true);
    }
    // Geri alma satiri gercekten eski hale dondurur mu (SD7'nin sozu)
    for (const [k, v] of Object.entries(anlik)) h.data[k] = v;
    expect(h.data._toplam).toBe('1000.0');
    expect(h.data[ROLLER.materialTotalField]).toBe('1000.0');
  });

  // ── GT-5..GT-7: SD7 ANLIĞININ İŞÇİLİK İKİZİ (12.08) ───────────────────────
  //
  // GT-4 iki yerden birden zayıftı ve ikizi göremiyordu: (a) `hedefAlanlar`
  // vermediği için MALZEME dalını koşuyor, (b) `k in oncesi` süzgeci ölçümü
  // tohumlanmış 3 anahtara indiriyor. Snapshot listesi (`SNAP`) yalnız `_mat*`
  // adlarını sayıyordu; işçilik dalının yazdığı `_labStatus` ve
  // `_labVariantTags` anlığa HİÇ girmiyordu → Ctrl+Z sonrası satırın firması ve
  // fiyatı geri dönerken satır 'yok' olarak BOYALI kalıyor, bayat varyant
  // etiketi de bir sonraki sürükleme sorgusuna FİLTRE olarak gidiyordu.

  /** ExcelGrid.tsx:1553 geri-alma döngüsünün birebir taklidi. */
  function geriAl(h: any, anlik: Record<string, any>) {
    for (const [k, v] of Object.entries(anlik)) h.data[k] = v;
  }

  it('GT-5 İŞÇİLİK: eşleşme yok işareti geri-alma anlığında var — Ctrl+Z sonrası satır boyalı kalmaz', async () => {
    const h = node(304, 'Montaj bedeli', 2, { _labStatus: '', _labSebep: null });
    const sonuc = await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER_GENEL,
      motor: async () => ({ netPrice: 0, confidence: 'none', reason: 'Firmada bu kalem yok' } as any),
      kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });
    // MEKANİZMA: doldurma işareti GERÇEKTEN yazdı (yoksa test bir şey ölçmüyor)
    expect(h.data._labStatus).toBe('yok');

    geriAl(h, sonuc.geriAl[0].oncekiDegerler);
    expect(h.data._labStatus).toBe(''); // kusurlu hâlde 'yok' KALIYORDU
  });

  it('GT-6 İŞÇİLİK: varyant etiketi geri-alma anlığında var — bayat etiket sonraki sorguya filtre olmaz', async () => {
    const h = node(305, 'Montaj bedeli', 2, { _labVariantTags: null });
    const sonuc = await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER_GENEL, motor: netVeren(150),
      kaynakVaryantTags: ['kaynakli'], kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });
    expect(h.data._labVariantTags).toEqual(['kaynakli']); // yazıldığı ölçüldü

    geriAl(h, sonuc.geriAl[0].oncekiDegerler);
    expect(h.data._labVariantTags).toBeNull(); // kusurlu hâlde ['kaynakli'] KALIYORDU
  });

  it('GT-7 SD7 SÖZLEŞMESİ İŞÇİLİK DALINDA: doldurmanın DEĞİŞTİRDİĞİ her alan anlıkta', async () => {
    // ⚠ GT-4'ün aksine süzgeç YOK: tohumlanmamış alanlar da ölçülür.
    const h = node(306, 'Montaj bedeli', 2, {});
    const oncesi = { ...h.data };
    const sonuc = await fillDown({
      hedefler: [h] as any, markaId: 'firma-1', roller: ROLLER_GENEL,
      motor: async () => ({ netPrice: 0, confidence: 'multi', candidates: [{ label: 'A' }, { label: 'B' }], reason: 'Birim uyuşmuyor' } as any),
      kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK_ALANLARI,
    });

    const anlik = sonuc.geriAl[0].oncekiDegerler;
    const degisenler = Object.keys(h.data).filter((k) => h.data[k] !== (oncesi as any)[k]);
    expect(degisenler.length, 'doldurma hiçbir şeyi değiştirmediyse test bir şey ölçmüyor').toBeGreaterThan(0);
    for (const alan of degisenler) {
      expect(Object.prototype.hasOwnProperty.call(anlik, alan), `${alan} YAZILDI ama geri-alma anlığında YOK`).toBe(true);
    }
    // Aday sayısı ve sebep de gerçekten yazıldı mı (payda kilidi)
    expect(h.data._labAdaySayisi).toBe(2);
    expect(h.data._labSebep).toBe('Birim uyuşmuyor');

    geriAl(h, anlik);
    expect(h.data._labAdaySayisi).toBeUndefined();
    expect(h.data._labSebep).toBeUndefined();
  });

  it('KÂR-4 ELLE YAZILAN STRING "50" sayı gibi çalışır', async () => {
    const h = node(203, 'Çelik boru', 2, { _malzKar: '50' });
    await fillDown({
      hedefler: [h] as any, markaId: 'marka-1', roller: ROLLER, motor: netVeren(100),
      kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data[ROLLER.materialUnitPriceField]).toBe('150.0');
  });
});

// ── KUR-01: KUR ALINAMADI (para doğruluğu turu, 14.09) ─────────────────────
//
// Backend kur servisi TCMB + yedek kaynak düşünce 1:1 döner; eşleştirme artık
// dövizli satıra fiyat YAZMAZ ve `kurAlinamadi: true` ile nedenini söyler.
// Doldurma bu kararı "yok" diye boyarsa taslak geri yüklemesi satırı
// "cevaplanmış" sayar ve kur dönünce yeniden FİYATLAMAZ — bu yüzden "hata".
describe('KUR-01 kur alınamadı — sürükle-doldur', () => {
  const KUR_YOK_SEBEP = "Kur alınamadı (USD) — dövizli fiyat TL'ye çevrilemedi, yazılmadı. Kur gelince yeniden eşleştirin.";
  const kurYokMotor = async (): Promise<MotorSonucu> =>
    ({ netPrice: 0, confidence: 'none', kurAlinamadi: true, reason: KUR_YOK_SEBEP });
  const ISCILIK = {
    birimFiyat: '_labBirim', toplam: '_labToplam',
    status: '_labStatus', kaynakRozeti: '_labKaynak', dal: 'iscilik' as const,
  };

  it('KUR-1 malzeme: satır "hata" işaretlenir — "yok" DEĞİL (kur dönünce yeniden fiyatlanabilsin)', async () => {
    const h = node(500, 'Kompansatör DN25', 3);
    await fillDown({ hedefler: [h] as any, markaId: 'b1', roller: ROLLER, motor: kurYokMotor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(h.data._matStatus).toBe('hata');
  });

  it('KUR-2 malzeme: fiyat yazılmaz, nedeni satırda (işaret eylemli)', async () => {
    const h = node(501, 'Kompansatör DN25', 3);
    await fillDown({ hedefler: [h] as any, markaId: 'b1', roller: ROLLER, motor: kurYokMotor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(h.data[ROLLER.materialUnitPriceField] ?? '').toBe('');
    expect(h.data._matSebep).toBe(KUR_YOK_SEBEP);
  });

  it('KUR-3 işçilik dalı AYNI kararı verir (_labStatus "hata")', async () => {
    const h = node(502, 'Boru montajı DN50', 3);
    await fillDown({ hedefler: [h] as any, markaId: 'f1', roller: ROLLER, motor: kurYokMotor, kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK });
    expect(h.data._labStatus).toBe('hata');
    expect(h.data._labSebep).toBe(KUR_YOK_SEBEP);
  });

  it('KUR-4 özet: hata sayacına girer, "yok" sayacına girmez', async () => {
    const sonuc = await fillDown({ hedefler: [node(503, 'Kompansatör DN25', 1)] as any, markaId: 'b1', roller: ROLLER, motor: kurYokMotor, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(sonuc.ozet.hata).toBe(1);
    expect(sonuc.ozet.yok).toBe(0);
  });

  it('KUR-5 başarılı doldurma fiyatın kurunu da yazar (kur donması — etkileşimli yolla aynı)', async () => {
    const kur = { currency: 'USD', kur: 47.35, tarih: '12.09.2026' };
    const h = node(504, 'Kompansatör DN25', 2);
    await fillDown({ hedefler: [h] as any, markaId: 'b1', roller: ROLLER, motor: async () => ({ netPrice: 4735, confidence: 'high', kaynakKur: kur }), kaynakVaryantTags: null, kaynakLabel: '' });
    expect(h.data._matKurBilgi).toEqual(kur);
  });

  it('KUR-6 TL fiyatlı doldurma önceki kaynaktan kalan BAYAT kuru temizler (14.09 ölçüldü: EUR 30 kalıyordu)', async () => {
    const h = node(505, 'Küresel vana DN25', 2, { _matKurBilgi: { currency: 'EUR', kur: 30, tarih: '2026-01-01' } });
    await fillDown({ hedefler: [h] as any, markaId: 'b1', roller: ROLLER, motor: async () => ({ netPrice: 850, confidence: 'high' }), kaynakVaryantTags: null, kaynakLabel: '' });
    expect(h.data._matKurBilgi).toBeNull();
  });

  it('KUR-7 işçilik: kur _labKurBilgi alanına yazılır (malzeme alanına DEĞİL)', async () => {
    const kur = { currency: 'EUR', kur: 54.1, tarih: '12.09.2026' };
    const h = node(506, 'Boru montajı DN50', 2);
    await fillDown({ hedefler: [h] as any, markaId: 'f1', roller: ROLLER, motor: async () => ({ netPrice: 541, confidence: 'high', kaynakKur: kur }), kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISCILIK });
    expect(h.data._labKurBilgi).toEqual(kur);
    expect(h.data._matKurBilgi).toBeUndefined();
  });

  it('G3 kalem toplamı KURUŞ katmanında: malz 0,1 + işç 0,2 → 0.30 (float 0.4 değil); 1,1 + 4,2 → 5.30; 1,1 + 0,01 → 1.11', async () => {
    const roller = { ...ROLLER, laborTotalField: '_labToplam', grandTotalField: '_toplam' };
    const h1 = node(508, 'Vida', 1, { _labToplam: '0.2' });
    await fillDown({ hedefler: [h1] as any, markaId: 'b1', roller, motor: async () => ({ netPrice: 0.1, confidence: 'high' }), kaynakVaryantTags: null, kaynakLabel: '' });
    expect(h1.data._toplam).toBe('0.30');
    const h2 = node(509, 'Dübel', 1, { _labToplam: '4.2' });
    await fillDown({ hedefler: [h2] as any, markaId: 'b1', roller, motor: async () => ({ netPrice: 1.1, confidence: 'high' }), kaynakVaryantTags: null, kaynakLabel: '' });
    expect(h2.data._toplam).toBe('5.30');
    // Kural (tur 3 A4a / G4-K11, 14.09): malzeme + işçilik KURUŞ katmanında
    // toplanır (`kalemToplami`), ikinci kez yuvarlanmaz — çıktının satır I
    // hücresi ve sayfa toplamıyla aynı. Dosyadan 2 haneli gelen işçilik toplamı
    // kuralları ayırır: 1,1 + 0,01 = 1,11. Eski YUKARI-1-hane kuralı 1.2 derdi
    // (Bursa'da 41 kalem, +₺2,42), en yakına 1 hane 1.1 derdi. (Önceki turda bu
    // satır eski kuralı mühürlüyordu: '1.2'.)
    const h3 = node(510, 'Pul', 1, { _labToplam: '0.01' });
    await fillDown({ hedefler: [h3] as any, markaId: 'b1', roller, motor: async () => ({ netPrice: 1.1, confidence: 'high' }), kaynakVaryantTags: null, kaynakLabel: '' });
    expect(h3.data._toplam).toBe('1.11');
  });

  it('KUR-8 geri-alma anlığı kur alanını da taşır (SD7: YAZILAN her alan anlıkta)', async () => {
    const eski = { currency: 'EUR', kur: 30, tarih: '2026-01-01' };
    const h = node(507, 'Kompansatör DN25', 2, { _matKurBilgi: eski });
    const sonuc = await fillDown({ hedefler: [h] as any, markaId: 'b1', roller: ROLLER, motor: async () => ({ netPrice: 850, confidence: 'high' }), kaynakVaryantTags: null, kaynakLabel: '' });
    expect(sonuc.geriAl[0].oncekiDegerler._matKurBilgi).toEqual(eski);
  });
});

/**
 * D1 (30.09, P0) — FİYAT YAZMAYAN DAL ESKİ FİYATI SİLER
 *
 * Canlı senaryo: kullanıcı bir grubu marka A ile doldurup fiyatlar, sonra
 * aynı grubu marka B ile YENİDEN sürükler. B'de o ürün yoktur. Bugünkü hâl:
 * satırın markası B olur, işaret 'yok' yazılır — ama HÜCREDE A'NIN FİYATI
 * DURUR ve `_matAutoVariant` hâlâ A'nın varyant etiketini taşıdığı için
 * `isaretStili` MAVİ ("⚡ otomatik") döner ve kırmızıyı MASKELER.
 *
 * Kullanıcıya giden sonuç: satır `brandId=B` + `100 ₺` olarak KAYDEDİLİR ve
 * fiyatsız-kalem uyarısı bu satırı YAKALAMAZ (fiyat dolu görünüyor). Yani
 * müşteriye, B markasında var OLMAYAN bir ürün A'nın fiyatıyla teklif edilir.
 *
 * KURAL: fiyat YAZMAYAN her dal, fiyat yazan dalın yazdığı HER ŞEYİ geri alır —
 * birim fiyat, satır toplamı, genel toplam, net, kur ve ROZETLER. Elle 'yok'
 * dalı (ExcelGrid) para hücrelerini zaten boşaltıyordu; sürükleme yolu hiç
 * boşaltmıyordu, elle yol da rozetleri bırakıyordu.
 */
describe('D1 — fiyat yazmayan dal ESKİ fiyatı siler', () => {
  const ROLLER_TAM = { ...ROLLER, laborTotalField: '_labToplam', grandTotalField: '_toplam' };

  /** Marka A ile fiyatlanmış satır: hücrede A'nın parası, rozetinde A'nın varyantı. */
  const aIleFiyatli = (rowIdx = 1, ad = 'KÜRESEL VANA DN25') => node(rowIdx, ad, 10, {
    _marka: 'A', _malzKar: 0,
    _matNetPrice: 100, _matStatus: '',
    _matKurBilgi: { currency: 'EUR', kur: 30, tarih: '2026-01-01' },
    _matAutoVariant: 'Galvaniz dişli', _matVariantMode: 'auto', _matVariantLabel: 'Galvaniz dişli',
    _matSuggestion: true,
    col5: '100.0', col6: '1000.0', _toplam: '1000.00',
  });

  /** Fiyatsız kalan satırda para hücrelerinin TAMAMI boşalmış olmalı. */
  const parasiz = (d: Record<string, any>) => {
    expect(String(d.col5 ?? ''), 'birim fiyat').toBe('');
    expect(String(d.col6 ?? ''), 'malz. toplam').toBe('');
    // recalcGrand ile AYNI kural: "boş değil sıfır" (ExcelGrid.tsx recalcGrand notu)
    expect(d._toplam, 'genel toplam').toBe('0.00');
    expect(d._matNetPrice, 'net').toBe(0);
    expect(d._matKurBilgi, 'kur bilgisi').toBeNull();
  };

  const DALLAR: Array<[string, any]> = [
    ['yok', { netPrice: 0, confidence: 'none', reason: 'Bu markada yok' }],
    ['aday', { netPrice: 0, confidence: 'multi', candidates: [{ label: 'X' }, { label: 'Y' }] }],
    ['alternatif', { netPrice: 0, confidence: 'none', alternatives: [{ brandName: 'C' }] }],
    ['kur-hatası', { netPrice: 0, confidence: 'none', kurAlinamadi: true, reason: 'Kur alınamadı' }],
    ['ürün-değil', { netPrice: 0, confidence: 'none', notProduct: true }],
  ];

  for (const [ad, cevap] of DALLAR) {
    it(`★ ${ad}: B'de fiyat yok — A'nın parası hücrede KALMAZ`, async () => {
      const h = aIleFiyatli();
      await fillDown({
        hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM,
        motor: async () => cevap, kaynakVaryantTags: null, kaynakLabel: 'B seçimi',
      });
      expect(h.data._marka).toBe('B'); // marka her koşulda atanır (açık niyet)
      parasiz(h.data);
    });
  }

  it('★ motor HATA atarsa da eski fiyat kalmaz (yarım kalan satır fiyatlı görünmez)', async () => {
    const h = aIleFiyatli();
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM,
      motor: async () => { throw new Error('ağ hatası'); }, kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data._matStatus).toBe('hata');
    parasiz(h.data);
  });

  it("★ ad-yok: sorgulanamayan satırda da A'nın fiyatı kalmaz", async () => {
    const h = aIleFiyatli(2, '');
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM,
      motor: async () => { throw new Error('motor ÇAĞRILMAMALIYDI'); },
      kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data._matStatus).toBe('ad-yok');
    parasiz(h.data);
  });

  it('★ D1b MAVİ MASKE: önceki otomatik-varyant rozeti kırmızıyı gizlemez', async () => {
    const h = aIleFiyatli();
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM,
      motor: async () => ({ netPrice: 0, confidence: 'none', reason: 'Bu markada yok' }),
      kaynakVaryantTags: null, kaynakLabel: 'B seçimi',
    });
    expect(h.data._matAutoVariant, 'oto-varyant rozeti').toBeNull();
    expect(h.data._matVariantLabel, 'varyant etiketi').toBeNull();
    expect(h.data._matSuggestion, 'öneri rozeti').toBe(false);
    // Ekranda gerçekten KIRMIZI görünür (isaretStili sırası: otoVaryant > yok)
    expect(isaretStili({
      dal: 'malzeme', durum: h.data._matStatus,
      otoVaryant: h.data._matAutoVariant, oneri: h.data._matSuggestion,
    })).toEqual({ backgroundColor: '#fee2e2' });
  });

  it('★ İKİZ işçilik: firmada kalem yoksa eski işçilik fiyatı da silinir', async () => {
    const h = node(3, 'Montaj bedeli', 10, {
      _firma: 'A', _iscKar: 0, _labNetPrice: 100, _labStatus: '',
      _labKurBilgi: { currency: 'USD', kur: 40 },
      _labBirim: '100.0', _labToplam: '1000.0', _toplam: '1000.00',
    });
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM,
      motor: async () => ({ netPrice: 0, confidence: 'none', reason: 'Bu firmada yok' }),
      kaynakVaryantTags: null, kaynakLabel: '',
      hedefAlanlar: {
        birimFiyat: '_labBirim', toplam: '_labToplam', status: '_labStatus',
        kaynakRozeti: '_labKaynak', dal: 'iscilik',
      },
    });
    expect(h.data._labStatus).toBe('yok');
    expect(String(h.data._labBirim ?? ''), 'işç. birim').toBe('');
    expect(String(h.data._labToplam ?? ''), 'işç. toplam').toBe('');
    expect(h.data._toplam, 'genel toplam').toBe('0.00');
    expect(h.data._labNetPrice, 'işç. net').toBe(0);
    expect(h.data._labKurBilgi, 'işç. kur').toBeNull();
  });

  it('★ TEK TARAF: malzeme silinir, DOLU işçilik toplamı genel toplamda KALIR', async () => {
    // Silme "satırı sıfırla" DEĞİLDİR — yalnız doldurulan dalı geri alır.
    const h = aIleFiyatli(4);
    h.data._labToplam = '250.0';
    h.data._toplam = '1250.00';
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM,
      motor: async () => ({ netPrice: 0, confidence: 'none' }), kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(String(h.data.col6 ?? '')).toBe('');
    expect(h.data._labToplam, 'işçiliğe DOKUNULMAZ').toBe('250.0');
    expect(h.data._toplam, 'genel toplam yalnız işçilik').toBe('250.00');
  });

  it('★ ÇAPRAZ BULAŞMA: işçilik silmesi MALZEMENİN rozetine dokunmaz', async () => {
    // Satırın malzemesi marka A ile fiyatlı (mavi "⚡ otomatik" rozeti var).
    // Kullanıcı üstüne bir FİRMA sürükler, o firmada kalem yok. Silme dal
    // ayrımı yapmazsa malzemenin rozeti ve öneri işareti sessizce KAYBOLUR —
    // ekranda mavi hücre düz beyaza döner, kullanıcı "rozet niye gitti" der.
    const h = aIleFiyatli(7);
    await fillDown({
      hedefler: [h] as any, markaId: 'FIRMA-B', roller: ROLLER_TAM,
      motor: async () => ({ netPrice: 0, confidence: 'none' }), kaynakVaryantTags: null, kaynakLabel: '',
      hedefAlanlar: {
        birimFiyat: '_labBirim', toplam: '_labToplam', status: '_labStatus',
        kaynakRozeti: '_labKaynak', dal: 'iscilik',
      },
    });
    expect(h.data._labStatus).toBe('yok');
    expect(h.data._matAutoVariant, 'malzeme rozeti DURUR').toBe('Galvaniz dişli');
    expect(h.data._matVariantLabel, 'malzeme varyant etiketi DURUR').toBe('Galvaniz dişli');
    expect(h.data._matSuggestion, 'malzeme öneri işareti DURUR').toBe(true);
    expect(h.data.col5, 'malzeme birim fiyatı DURUR').toBe('100.0');
  });

  it('★ SD7: silinen alanlar geri-alma anlığında — Ctrl+Z eski fiyatı geri getirir', async () => {
    const h = aIleFiyatli(5);
    const sonuc = await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM,
      motor: async () => ({ netPrice: 0, confidence: 'none' }), kaynakVaryantTags: null, kaynakLabel: 'B seçimi',
    });
    const onceki = sonuc.geriAl[0].oncekiDegerler;
    expect(onceki.col5).toBe('100.0');
    expect(onceki.col6).toBe('1000.0');
    expect(onceki._toplam).toBe('1000.00');
    expect(onceki._matNetPrice).toBe(100);
    expect(onceki._matAutoVariant).toBe('Galvaniz dişli');
  });

  it('FİYATLI dal bozulmadı: fiyat gelen satır normal yazılır (silme yolu ona karışmaz)', async () => {
    const h = aIleFiyatli(6);
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM,
      motor: async () => ({ netPrice: 250, confidence: 'high' }), kaynakVaryantTags: null, kaynakLabel: 'B seçimi',
    });
    expect(h.data.col5).toBe('250.0');
    expect(h.data.col6).toBe('2500.0');
    expect(h.data._toplam).toBe('2500.00');
    expect(h.data._matNetPrice).toBe(250);
    expect(h.data._matAutoVariant).toBe('B seçimi');
  });
});

/**
 * D2 (30.09, P1) — GEÇ GELEN CEVAP SATIRIN YENİ SEÇİMİNİ EZMEZ
 *
 * Eşleştirme `await motor(...)` ile ağa çıkar; dönüşte satıra KOŞULSUZ yazar.
 * Kullanıcı yavaş bir markayı seçip beklemeden başka markaya geçerse (ya da
 * aynı gruba iki kez sürüklerse) ikinci sorgu ÖNCE biter, sonra birincinin
 * geç cevabı gelip üstüne yazar. Satırda görünen marka B, hücredeki fiyat
 * A'nınkidir — kullanıcının HİÇ seçmediği bir fiyat teklife girer.
 *
 * Ölçüldü (bu paket, sabit gecikmelerle): yavaş A (300 ms) + hızlı B (50 ms)
 * → `_marka=B` ama `_matNetPrice=100` (A'nın fiyatı). Kullanıcı ekranda B
 * yazdığını gördüğü için farkı yakalayamaz.
 *
 * KURAL: `await`ten dönen cevap, satır HÂLÂ o marka/firmadaysa yazılır.
 * Seçim değiştiyse cevap DÜŞÜRÜLÜR ('devredildi') — satırı o anki sahibi
 * (sonraki çağrı) sürer. SD2 bozulmaz: satır yine bir sonuç alır.
 *
 * ⚠ Gecikmeler GERÇEK: sıfır gecikmeli taklit iki async adımı tek tike
 * toplar ve yarışı hiç kurmaz (mutant yaşatır).
 */
describe('D2 — geç gelen cevap yeni seçimi ezmez', () => {
  const ROLLER_TAM = { ...ROLLER, laborTotalField: '_labToplam', grandTotalField: '_toplam' };
  const gecikme = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const yavas = (ms: number, net: number) => async () => { await gecikme(ms); return { netPrice: net, confidence: 'high' } as MotorSonucu; };

  it('★ yavaş A + hızlı B: satırda B kalır, A\'nın fiyatı YAZILMAZ', async () => {
    const h = node(7, 'KÜRESEL VANA DN25', 10, { _malzKar: 0 });
    const ortak = { hedefler: [h] as any, roller: ROLLER_TAM, kaynakVaryantTags: null, kaynakLabel: '' };
    const pA = fillDown({ ...ortak, markaId: 'A', motor: yavas(300, 100) });
    await gecikme(20); // kullanıcı beklemeden B'ye geçer
    const pB = fillDown({ ...ortak, markaId: 'B', motor: yavas(50, 250) });
    const [sA] = await Promise.all([pA, pB]);

    expect(h.data._marka, 'satırın markası').toBe('B');
    expect(h.data._matNetPrice, 'net fiyat B\'nin').toBe(250);
    expect(h.data.col5, 'birim fiyat B\'nin').toBe('250.0');
    expect(h.data.col6, 'satır toplamı B\'nin').toBe('2500.0');
    // SD2 bozulmaz: A'nın turu da satır başına BİR sonuç üretir.
    expect(sA.satirlar.map((s) => s.durum)).toEqual(['devredildi']);
    expect(sA.ozet.devredilen).toBe(1);
  });

  it('★ TERS SIRA: hızlı A + yavaş B → B kazanır (yarış tek sırayla ölçülmez)', async () => {
    const h = node(8, 'KÜRESEL VANA DN25', 10, { _malzKar: 0 });
    const ortak = { hedefler: [h] as any, roller: ROLLER_TAM, kaynakVaryantTags: null, kaynakLabel: '' };
    const pA = fillDown({ ...ortak, markaId: 'A', motor: yavas(40, 100) });
    await gecikme(20);
    const pB = fillDown({ ...ortak, markaId: 'B', motor: yavas(200, 250) });
    await Promise.all([pA, pB]);
    expect(h.data._marka).toBe('B');
    expect(h.data._matNetPrice).toBe(250);
  });

  it('★ FİYATSIZ dal da ezmez: geç gelen "yok", B\'nin fiyatını SİLMEZ', async () => {
    // D1 silme yolu ile D2 kapısı birlikte çalışmalı — yoksa geç gelen 'yok'
    // B'nin az önce yazdığı fiyatı temizler (D1'in kendisi silah olur).
    const h = node(9, 'KÜRESEL VANA DN25', 10, { _malzKar: 0 });
    const ortak = { hedefler: [h] as any, roller: ROLLER_TAM, kaynakVaryantTags: null, kaynakLabel: '' };
    const pA = fillDown({
      ...ortak, markaId: 'A',
      motor: async () => { await gecikme(300); return { netPrice: 0, confidence: 'none', reason: 'yok' } as MotorSonucu; },
    });
    await gecikme(20);
    const pB = fillDown({ ...ortak, markaId: 'B', motor: yavas(50, 250) });
    await Promise.all([pA, pB]);
    expect(h.data._marka).toBe('B');
    expect(h.data.col5, 'B\'nin fiyatı DURUR').toBe('250.0');
    expect(String(h.data._matStatus ?? ''), 'B fiyatlı: işaret yok').toBe('');
  });

  it('★ motor HATASI da geç gelirse yeni seçimi işaretlemez', async () => {
    const h = node(10, 'KÜRESEL VANA DN25', 10, { _malzKar: 0 });
    const ortak = { hedefler: [h] as any, roller: ROLLER_TAM, kaynakVaryantTags: null, kaynakLabel: '' };
    const pA = fillDown({
      ...ortak, markaId: 'A',
      motor: async () => { await gecikme(300); throw new Error('ağ hatası'); },
    });
    await gecikme(20);
    const pB = fillDown({ ...ortak, markaId: 'B', motor: yavas(50, 250) });
    await Promise.all([pA, pB]);
    expect(String(h.data._matStatus ?? ''), 'B fiyatlı: hata işareti YOK').toBe('');
    expect(h.data.col5).toBe('250.0');
  });

  it('★ SEÇİM KALDIRILDI: fill sürerken marka boşaltılırsa cevap düşer', async () => {
    const h = node(11, 'KÜRESEL VANA DN25', 10, { _malzKar: 0 });
    const p = fillDown({
      hedefler: [h] as any, markaId: 'A', roller: ROLLER_TAM,
      motor: yavas(120, 100), kaynakVaryantTags: null, kaynakLabel: '',
    });
    await gecikme(30);
    h.data._marka = null; // kullanıcı "Seçimi kaldır" dedi
    await p;
    expect(String(h.data.col5 ?? ''), 'markasız satıra fiyat yazılmaz').toBe('');
    expect(h.data._marka).toBeNull();
  });

  it('★ İKİZ işçilik: geç gelen firma cevabı da ezmez', async () => {
    const h = node(12, 'Montaj bedeli', 10, { _iscKar: 0 });
    const ISC = {
      birimFiyat: '_labBirim', toplam: '_labToplam', status: '_labStatus',
      kaynakRozeti: '_labKaynak', dal: 'iscilik' as const,
    };
    const ortak = { hedefler: [h] as any, roller: ROLLER_TAM, kaynakVaryantTags: null, kaynakLabel: '', hedefAlanlar: ISC };
    const pA = fillDown({ ...ortak, markaId: 'FA', motor: yavas(300, 100) });
    await gecikme(20);
    const pB = fillDown({ ...ortak, markaId: 'FB', motor: yavas(50, 250) });
    await Promise.all([pA, pB]);
    expect(h.data._firma).toBe('FB');
    expect(h.data._labBirim).toBe('250.0');
  });

  it('TEK ÇAĞRI bozulmadı: yarış yokken cevap normal yazılır', async () => {
    const h = node(13, 'KÜRESEL VANA DN25', 10, { _malzKar: 0 });
    const s = await fillDown({
      hedefler: [h] as any, markaId: 'A', roller: ROLLER_TAM,
      motor: yavas(30, 100), kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data.col5).toBe('100.0');
    expect(s.ozet.fiyatli).toBe(1);
    expect(s.ozet.devredilen).toBe(0);
  });
});

/**
 * D10 (30.09, P2) — BOŞ KAYNAKTAN SÜRÜKLEME HİÇBİR ŞEY YAPMAZ
 *
 * Kullanıcı marka/firma hücresi BOŞ bir satırın tutamağından aşağı sürükler
 * (tutamaç dolu hücredekiyle aynı görünüyor, imleçte "N satır" rozeti çıkıyor).
 * Eski hâl: `fillDown({ markaId: null })` her hedef için ÖNCE hedefin
 * markasını/firmasını null'a çekiyor, sonra motora boş kimlikle SORUYORDU (satır
 * başına bir istek); cevap ne olursa olsun fiyat yazılmadığı için D1 temizliği
 * koşuyor (fiyat, toplam SİLİNİYOR) ve satır "bu markada yok" diye KIRMIZIYA
 * boyanıyordu — satırda marka YOKKEN. Kullanıcı kütüphanesinde eksik malzeme
 * aramaya yönlendiriliyordu.
 *
 * KARAR (Emre, 02.10): boş kaynak sürüklemesi REDDEDİLİR — istek gitmez,
 * hedeflere DOKUNULMAZ. Tek satır temizleme için "Seçimi kaldır" zaten var.
 * Etkileşimli yolun ikizi: BrandDropdown/FirmaDropdown `handleChange` boş
 * seçimde motoru hiç çağırmaz.
 */
describe('D10 — boş kaynaktan sürükleme hiçbir şey yapmaz', () => {
  const ROLLER_TAM = { ...ROLLER, laborTotalField: '_labToplam', grandTotalField: '_toplam' };
  const fiyatli = (rowIdx: number) => node(rowIdx, 'KÜRESEL VANA DN25', 10, {
    _marka: 'A', _malzKar: 0, _matNetPrice: 100, _matStatus: '',
    col5: '100.0', col6: '1000.0', _toplam: '1000.00',
  });
  const motorCasusu = () => {
    const cagrilar: string[] = [];
    const motor = async (_r: number, id: string, ad: string) => {
      cagrilar.push(`${id}|${ad}`);
      return { netPrice: 0, confidence: 'none' } as MotorSonucu;
    };
    return { motor, cagrilar };
  };

  for (const [etiket, bos] of [['null', null], ['boş metin', ''], ['undefined', undefined]] as const) {
    it(`★ ${etiket}: motora HİÇ sorulmaz (satır başına boş istek gitmez)`, async () => {
      const { motor, cagrilar } = motorCasusu();
      const hedefler = [fiyatli(1), fiyatli(2), fiyatli(3)];
      await fillDown({
        hedefler: hedefler as any, markaId: bos as any, roller: ROLLER_TAM,
        motor, kaynakVaryantTags: null, kaynakLabel: '',
      });
      expect(cagrilar).toEqual([]);
    });
  }

  it('★★ hedeflerin markası, fiyatı ve toplamı DOKUNULMADAN kalır', async () => {
    const { motor } = motorCasusu();
    const h = fiyatli(4);
    await fillDown({
      hedefler: [h] as any, markaId: null as any, roller: ROLLER_TAM,
      motor, kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data._marka, 'marka').toBe('A');
    expect(h.data.col5, 'birim fiyat').toBe('100.0');
    expect(h.data.col6, 'satır toplamı').toBe('1000.0');
    expect(h.data._toplam, 'genel toplam').toBe('1000.00');
    expect(h.data._matNetPrice, 'net').toBe(100);
  });

  it('★★ YANLIŞ SUÇLAMA YOK: satır "markada yok" diye işaretlenmez', async () => {
    const { motor } = motorCasusu();
    const h = fiyatli(5);
    await fillDown({
      hedefler: [h] as any, markaId: '' as any, roller: ROLLER_TAM,
      motor, kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(String(h.data._matStatus ?? ''), 'işaret').toBe('');
    expect(h.data._matSebep, 'sebep').toBeUndefined();
  });

  it('★ sonuç "boş seçim" olduğunu SÖYLER — çağıran geri-alma yığınına boş kayıt itmesin', async () => {
    // Boş kayıt itilseydi Ctrl+Z bir adımı "yutardı" (kullanıcı geri almak
    // istediği önceki işlemi geri alamazdı).
    const { motor } = motorCasusu();
    const s = await fillDown({
      hedefler: [fiyatli(6), fiyatli(7)] as any, markaId: null as any, roller: ROLLER_TAM,
      motor, kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(s.bosSecim).toBe(true);
    expect(s.geriAl).toEqual([]);
    expect(s.satirlar).toEqual([]);
    expect(s.ozet.atlanan).toBe(2);
  });

  it('★ İKİZ işçilik: boş firmadan sürükleme de motora sormaz, işçilik fiyatına dokunmaz', async () => {
    const { motor, cagrilar } = motorCasusu();
    const h = node(8, 'Montaj bedeli', 10, {
      _firma: 'F1', _iscKar: 0, _labNetPrice: 80, _labStatus: '',
      _labBirim: '80.0', _labToplam: '800.0', _toplam: '800.00',
    });
    await fillDown({
      hedefler: [h] as any, markaId: null as any, roller: ROLLER_TAM, motor,
      kaynakVaryantTags: null, kaynakLabel: '',
      hedefAlanlar: {
        birimFiyat: '_labBirim', toplam: '_labToplam', status: '_labStatus',
        kaynakRozeti: '_labKaynak', dal: 'iscilik',
      },
    });
    expect(cagrilar).toEqual([]);
    expect(h.data._firma).toBe('F1');
    expect(h.data._labBirim).toBe('80.0');
    expect(String(h.data._labStatus ?? '')).toBe('');
  });

  it('KONTROL GRUBU: dolu kaynakla sürükleme bozulmadı (motora sorulur)', async () => {
    const { motor, cagrilar } = motorCasusu();
    await fillDown({
      hedefler: [fiyatli(9)] as any, markaId: 'B', roller: ROLLER_TAM,
      motor, kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(cagrilar).toHaveLength(1);
  });
});

/**
 * Y2 (30.09, P2) — SURUKLE-DOLDUR "Toplam Birim Fiyat" HUCRESINI DE TAZELER.
 * KD11 doldurma yoluna "genel TOPLAMI da yaz" kuralini getirmisti ama rolun
 * IKIZI olan genel BIRIM fiyati unutmustu. Dosyasinda "TOPLAM BIRIM FIYAT"
 * kolonu olan tekliflerde satir kendi icinde celisiyordu: Malz. Birim 100,
 * Genel Toplam 1.000 iken Toplam Birim Fiyat ONCEKI markanin degerinde kaliyordu.
 * Etkilesimli yol (`recalcGrand`) iki hucreyi birden yaziyordu — ayni niyet iki
 * yolda iki farkli satir (E5 sozlesmesi ihlali).
 */
describe('Y2 — surukle-doldur Toplam Birim Fiyat hucresini tazeler', () => {
  const ROLLER_GB = {
    ...ROLLER, laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
    grandTotalField: '_toplam', grandUnitPriceField: '_gBirim',
  };
  const bos = (rowIdx: number, ek: Record<string, any> = {}) =>
    node(rowIdx, 'KÜRESEL VANA DN25', 10, { _malzKar: 0, _iscKar: 0, ...ek });

  it('★ malzeme fiyatlaninca Toplam Birim Fiyat = malzeme birim', async () => {
    const h = bos(1, { _gBirim: '999.0' }); // onceki markanin bayat degeri
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_GB,
      motor: async () => ({ netPrice: 100, confidence: 'high' }), kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data.col5).toBe('100.0');
    expect(h.data._gBirim).toBe('100.0');
  });

  it('★ iscilik birimi varsa toplanir (malzeme 100 + iscilik 50 = 150)', async () => {
    const h = bos(2, { _labBirim: '50.0', _labToplam: '500.0' });
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_GB,
      motor: async () => ({ netPrice: 100, confidence: 'high' }), kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data._gBirim).toBe('150.0');
  });

  it('★ IKIZ iscilik dolumu da tazeler (malzeme 100 + iscilik 80 = 180)', async () => {
    const h = bos(3, { col5: '100.0', col6: '1000.0' });
    await fillDown({
      hedefler: [h] as any, markaId: 'F', roller: ROLLER_GB,
      motor: async () => ({ netPrice: 80, confidence: 'high' }), kaynakVaryantTags: null, kaynakLabel: '',
      hedefAlanlar: { birimFiyat: '_labBirim', toplam: '_labToplam', status: '_labStatus', kaynakRozeti: '_labKaynak', dal: 'iscilik' },
    });
    expect(h.data._gBirim).toBe('180.0');
  });

  it('★ D1 silme yolu da tazeler: fiyat gidince yalniz iscilik kalir', async () => {
    const h = bos(4, { col5: '100.0', col6: '1000.0', _labBirim: '50.0', _labToplam: '500.0', _gBirim: '150.0', _marka: 'A', _matNetPrice: 100 });
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_GB,
      motor: async () => ({ netPrice: 0, confidence: 'none' }), kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data._gBirim).toBe('50.0');
  });

  it('★ hic fiyat kalmazsa BOS (0 yazilmaz — recalcGrand ile ayni)', async () => {
    const h = bos(5, { col5: '100.0', col6: '1000.0', _gBirim: '100.0', _marka: 'A', _matNetPrice: 100 });
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_GB,
      motor: async () => ({ netPrice: 0, confidence: 'none' }), kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect(h.data._gBirim).toBe('');
  });

  it('KONTROL: rolde Toplam Birim Fiyat YOKSA hicbir alan yazilmaz', async () => {
    const h = bos(6);
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: { ...ROLLER, grandTotalField: '_toplam' },
      motor: async () => ({ netPrice: 100, confidence: 'high' }), kaynakVaryantTags: null, kaynakLabel: '',
    });
    expect('_gBirim' in h.data).toBe(false);
  });
});

/**
 * Y3 (30.09, P2) — FIYAT YAZMAYAN DAL VARYANT KIMLIGINI DE SILER
 *
 * D1 fiyati ve rozetleri siliyordu ama `_matVariantTags`/`_labVariantTags`
 * BIRAKIYORDU (D1'de bilerek: "kimlik tohumu" sanildi). Yanlisti: kimlik YALNIZ
 * onu ureten markayla anlamlidir. Marka A ile fiyatlanmis satira marka B
 * secilip B fiyat vermeyince A'nin etiketi satirda kaliyor; o satirdan asagi
 * surukleyince `handleFillComplete` bu bayat etiketi KAYNAK varyanti sayiyor ve
 * TUM hedefler B altinda A'nin varyantiyla SERT FILTRELI sorgulaniyor:
 *  (1) B'de o varyant yoksa aile sahte "yok"/"belirsiz" alir — urun B'de VARDIR;
 *  (2) B'de ayni etiketli varyant varsa kullanicinin B icin HIC SECMEDIGI
 *      varyantin fiyati tum aileye SESSIZCE yazilir.
 * Etiket geri-alma anligindadir (SNAP) — silme Ctrl+Z ile geri gelir.
 */
describe('Y3 — fiyat yazmayan dal varyant kimligini siler', () => {
  const ROLLER_TAM = { ...ROLLER, laborTotalField: '_labToplam', grandTotalField: '_toplam' };
  const yok = async () => ({ netPrice: 0, confidence: 'none' } as MotorSonucu);

  it('★ MALZEME: B fiyat vermeyince A\'nin varyant etiketi kalmaz', async () => {
    const h = node(1, 'KÜRESEL VANA DN25', 10, {
      _marka: 'A', _matNetPrice: 100, col5: '100.0', col6: '1000.0', _matVariantTags: ['v:A-kaynakli'],
    });
    await fillDown({ hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM, motor: yok, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(h.data._matVariantTags).toBeNull();
  });

  it('★ IKIZ ISCILIK: firma degisip fiyat gelmeyince eski isçilik kimligi kalmaz', async () => {
    const h = node(2, 'Montaj bedeli', 10, {
      _firma: 'F1', _labNetPrice: 80, _labBirim: '80.0', _labToplam: '800.0', _labVariantTags: ['v:F1-disli'],
    });
    await fillDown({
      hedefler: [h] as any, markaId: 'F2', roller: ROLLER_TAM, motor: yok, kaynakVaryantTags: null, kaynakLabel: '',
      hedefAlanlar: { birimFiyat: '_labBirim', toplam: '_labToplam', status: '_labStatus', kaynakRozeti: '_labKaynak', dal: 'iscilik' },
    });
    expect(h.data._labVariantTags).toBeNull();
  });

  it('★ aday dali da siler (secim bekleyen satir eski kimligi tasimaz)', async () => {
    const h = node(3, 'KÜRESEL VANA DN25', 10, { _marka: 'A', _matVariantTags: ['v:A'] });
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM, kaynakVaryantTags: null, kaynakLabel: '',
      motor: async () => ({ netPrice: 0, confidence: 'multi', candidates: [{}, {}] as any }),
    });
    expect(h.data._matVariantTags).toBeNull();
  });

  it('★ SD7: silinen kimlik geri-alma anliginda (Ctrl+Z geri getirir)', async () => {
    const h = node(4, 'KÜRESEL VANA DN25', 10, { _marka: 'A', _matVariantTags: ['v:A'] });
    const s = await fillDown({ hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM, motor: yok, kaynakVaryantTags: null, kaynakLabel: '' });
    expect(s.geriAl[0].oncekiDegerler._matVariantTags).toEqual(['v:A']);
  });

  it('KONTROL: fiyat GELEN dal kimligi yeniden yazar (silme ona karismaz)', async () => {
    const h = node(5, 'KÜRESEL VANA DN25', 10, { _marka: 'A', _matVariantTags: ['v:A'] });
    await fillDown({
      hedefler: [h] as any, markaId: 'B', roller: ROLLER_TAM, kaynakVaryantTags: null, kaynakLabel: '',
      motor: async () => ({ netPrice: 50, confidence: 'high', variantTags: ['v:B'] }),
    });
    expect(h.data._matVariantTags).toEqual(['v:B']);
  });
});
