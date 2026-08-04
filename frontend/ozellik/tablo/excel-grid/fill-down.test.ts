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
});
