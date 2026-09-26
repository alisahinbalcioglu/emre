/**
 * Calisma alani durum makinesi — gecmis (geri al / yinele), belge islemleri,
 * kayitli calismanin yuklenmesi.
 *
 * Kilitlenen sozlesmeler (25.09 DWG tasarimi + 07.08 revizyon dersi):
 *  - layer secimi, ayirma, ayirmayi kaldirma, cap atama, cap silme, toplu cap,
 *    onay ve onayi geri alma TEK TEK geri alinir; gorunum tercihleri alinmaz;
 *  - onay / onay kaldirma / ayirmayi kaldirma layer SECIMINI degistirmez;
 *  - ayni layer'i yeniden secmek secimi KAPATMAZ (toggle yok);
 *  - onayli layer'da cap degisirse onay kalkar (tek adim);
 *  - yeniden ayirma etiketleri tasir ve onayi kaldirir;
 *  - birim degisince hesaplar DUSURULMEZ (25.09 oncesi dusuruluyordu).
 */
import { describe, expect, it } from 'vitest';
import type { EdgeSegment } from '../dwg-metraj/types';
import type { CalculatedLayer, WorkspaceState } from './types';
import {
  bosDurum,
  calismaKaydiIndirgeyici as ind,
  kayitliDurumuCoz,
  tepedeMi,
  yeniKayit,
  type CalismaKaydi,
  type KayitEylemi,
} from './calisma-kaydi';
import { birimBayatMi } from './birim-bayatlik';
import { capsizParcalar, gosterimHesabi } from './belge-islemleri';

function parca(id: number, noktalar: [number, number][], cap = '', layer = 'a-yağmur'): EdgeSegment {
  let uzunluk = 0;
  for (let i = 0; i < noktalar.length - 1; i++) {
    uzunluk += Math.hypot(noktalar[i + 1][0] - noktalar[i][0], noktalar[i + 1][1] - noktalar[i][1]);
  }
  const son = noktalar[noktalar.length - 1];
  return {
    segment_id: id,
    layer,
    diameter: cap,
    length: uzunluk / 10,
    coords: [noktalar[0][0], noktalar[0][1], son[0], son[1]],
    polyline: noktalar,
  };
}

function hesap(layer: string, segmentler: EdgeSegment[], ek: Partial<CalculatedLayer> = {}): CalculatedLayer {
  return {
    layer,
    hatIsmi: layer,
    materialType: '',
    defaultDiameter: '',
    edgeSegments: segmentler,
    junctionPoints: [],
    totalLength: segmentler.reduce((t, s) => t + s.length, 0),
    computedAt: 1,
    approved: false,
    splitMode: 't',
    scaleUsed: 0.1,
    ...ek,
  };
}

const IKI_PARCA = [parca(1, [[0, 0], [100, 0]]), parca(2, [[100, 0], [100, 60]])];

function kayit(ek: Partial<WorkspaceState> = {}): CalismaKaydi {
  return yeniKayit({ ...bosDurum('dosya', 0.1), ...ek });
}

function uygula(k: CalismaKaydi, ...eylemler: KayitEylemi[]): CalismaKaydi {
  return eylemler.reduce(ind, k);
}

const ayir = (id: number, layer = 'a-yağmur', segmentler = IKI_PARCA): KayitEylemi => ({
  tur: 'hesap', id, hesap: hesap(layer, segmentler, { computedAt: id }),
});

describe('layer secimi', () => {
  it('secim gecmise yazilir ve geri alinir', () => {
    const k = uygula(kayit(), { tur: 'sec', id: 1, layer: 'a-yağmur' });
    expect(k.state.selectedLayer).toBe('a-yağmur');
    expect(uygula(k, { tur: 'geri' }).state.selectedLayer).toBeNull();
  });

  it('AYNI layer\'i yeniden secmek secimi KAPATMAZ ve gecmise adim yazmaz', () => {
    const k = uygula(kayit(), { tur: 'sec', id: 1, layer: 'a-yağmur' });
    const k2 = ind(k, { tur: 'sec', id: 2, layer: 'a-yağmur' });
    expect(k2).toBe(k);
    expect(k2.state.selectedLayer).toBe('a-yağmur');
  });

  it('"Degistir" (null) secimi birakir; atamalar korunur', () => {
    const k = uygula(
      kayit(),
      { tur: 'sec', id: 1, layer: 'a-yağmur' },
      ayir(2),
      { tur: 'cap', id: 3, layer: 'a-yağmur', idler: [1], surum: 2, cap: 'Ø50' },
      { tur: 'sec', id: 4, layer: null },
    );
    expect(k.state.selectedLayer).toBeNull();
    expect(k.state.calculatedLayers['a-yağmur'].edgeSegments[0].diameter).toBe('Ø50');
  });
});

describe('parcalara ayirma ve geri alma', () => {
  it('yeni ayirma layer\'i ONAYSIZ ekler, secimi degistirmez, bildirim yazar', () => {
    const k = uygula(kayit({ selectedLayer: 'a-yağmur' }), ayir(1));
    expect(k.state.calculatedLayers['a-yağmur'].approved).toBe(false);
    expect(k.state.selectedLayer).toBe('a-yağmur');
    expect(k.son).toEqual({ id: 1, etiket: 'Parçalara ayırma', bildirim: 'a-yağmur 2 parçaya ayrıldı' });
  });

  it('bolmeden ayirmanin metni farklidir', () => {
    const k = ind(kayit(), {
      tur: 'hesap', id: 1, hesap: hesap('a-yağmur', IKI_PARCA, { splitMode: 'none' }),
    });
    expect(k.son?.bildirim).toBe('a-yağmur: 2 hat çıkarıldı (bölmeden)');
    expect(k.son?.etiket).toBe('Hat çıkarma');
  });

  it('geri al ayirmayi kaldirir, yinele geri getirir; yeni islem yinelemeyi siler', () => {
    const k = uygula(kayit(), ayir(1));
    const geri = ind(k, { tur: 'geri' });
    expect(geri.state.calculatedLayers['a-yağmur']).toBeUndefined();
    const ileri = ind(geri, { tur: 'ileri' });
    expect(ileri.state.calculatedLayers['a-yağmur'].edgeSegments).toHaveLength(2);
    const dallanan = ind(geri, { tur: 'sec', id: 9, layer: 'x' });
    expect(dallanan.gecmis.ileri).toEqual([]);
  });

  it('"Ayirmayi kaldir" geri alinabilir ve secimi degistirmez', () => {
    const k = uygula(
      kayit({ selectedLayer: 'a-yağmur' }),
      ayir(1),
      { tur: 'cap', id: 2, layer: 'a-yağmur', idler: [1], surum: 1, cap: 'Ø50' },
      { tur: 'kaldir', id: 3, layer: 'a-yağmur' },
    );
    expect(k.state.calculatedLayers['a-yağmur']).toBeUndefined();
    expect(k.state.selectedLayer).toBe('a-yağmur');
    const geri = ind(k, { tur: 'geri' });
    // Etiket de geri gelir — kaldirma emek kaybettirmez.
    expect(geri.state.calculatedLayers['a-yağmur'].edgeSegments[0].diameter).toBe('Ø50');
  });

  it('YENIDEN ayirma etiketleri tasir ve onayi kaldirir', () => {
    const k = uygula(
      kayit(),
      ayir(1),
      { tur: 'cap', id: 2, layer: 'a-yağmur', idler: [1, 2], surum: 1, cap: 'Ø50' },
      { tur: 'onayla', id: 3, layer: 'a-yağmur', zaman: 5 },
    );
    expect(k.state.calculatedLayers['a-yağmur'].approved).toBe(true);
    // 💧 isareti: ilk boru ikiye bolundu, numaralar degisti
    const bolunmus = [
      parca(1, [[0, 0], [40, 0]]),
      parca(2, [[40, 0], [100, 0]]),
      parca(3, [[100, 0], [100, 60]]),
    ];
    const r = ind(k, ayir(4, 'a-yağmur', bolunmus));
    const cl = r.state.calculatedLayers['a-yağmur'];
    expect(cl.edgeSegments.map((s) => s.diameter)).toEqual(['Ø50', 'Ø50', 'Ø50']);
    expect(cl.approved).toBe(false);
    expect(r.son?.etiket).toBe('Yeniden ayırma');
    // Onayli layer'in onayi SESSIZCE kalkmaz — bildirim soyler.
    expect(r.son?.bildirim).toBe(
      'a-yağmur yeniden ayrıldı · 3 parça, 3 parçanın çapı korundu · onay kalktı, yeniden onaylayın',
    );
  });

  it('onaysiz layer\'i yeniden ayirmak onay notu yazmaz', () => {
    const k = uygula(kayit(), ayir(1), { tur: 'cap', id: 2, layer: 'a-yağmur', idler: [1, 2], surum: 1, cap: 'Ø50' });
    const r = ind(k, ayir(3));
    expect(r.son?.bildirim).toBe('a-yağmur yeniden ayrıldı · 2 parça, 2 parçanın çapı korundu');
  });
});

describe('cap atama, silme, toplu atama', () => {
  const hazir = () => uygula(kayit({ selectedLayer: 'a-yağmur' }), ayir(1));

  it('tek tik cap atar; ayni capi (kanonik) yeniden yazmak islem sayilmaz', () => {
    const k = ind(hazir(), { tur: 'cap', id: 2, layer: 'a-yağmur', idler: [1], surum: 1, cap: '1¼"' });
    expect(k.state.calculatedLayers['a-yağmur'].edgeSegments[0].diameter).toBe('1¼"');
    expect(k.son?.etiket).toBe('Çap atama');
    expect(ind(k, { tur: 'cap', id: 3, layer: 'a-yağmur', idler: [1], surum: 1, cap: '1 1/4"' })).toBe(k);
  });

  it('silgi (bos cap) geri alinabilir bir "Cap silme" adimidir', () => {
    const k = uygula(
      hazir(),
      { tur: 'cap', id: 2, layer: 'a-yağmur', idler: [1], surum: 1, cap: 'Ø50' },
      { tur: 'cap', id: 3, layer: 'a-yağmur', idler: [1], surum: 1, cap: '' },
    );
    expect(k.state.calculatedLayers['a-yağmur'].edgeSegments[0].diameter).toBe('');
    expect(k.son?.etiket).toBe('Çap silme');
    expect(ind(k, { tur: 'geri' }).state.calculatedLayers['a-yağmur'].edgeSegments[0].diameter).toBe('Ø50');
  });

  it('capsiz parcaya silgi islem sayilmaz', () => {
    const k = hazir();
    expect(ind(k, { tur: 'cap', id: 2, layer: 'a-yağmur', idler: [1], surum: 1, cap: '' })).toBe(k);
  });

  it('toplu atama TEK adimdir (tek geri al hepsini geri getirir)', () => {
    const k = hazir();
    const idler = capsizParcalar(k.state.calculatedLayers['a-yağmur']);
    expect(idler).toEqual([1, 2]);
    const t = ind(k, { tur: 'cap', id: 2, layer: 'a-yağmur', idler, surum: 1, cap: 'Ø110', toplu: true });
    expect(t.gecmis.geri).toHaveLength(k.gecmis.geri.length + 1);
    expect(t.son?.bildirim).toBe('2 çapsız parçaya Ø110 verildi');
    const geri = ind(t, { tur: 'geri' });
    expect(geri.state.calculatedLayers['a-yağmur'].edgeSegments.map((s) => s.diameter)).toEqual(['', '']);
  });

  it('ONAYLI layer\'da cap degisince onay kalkar — tek adim, bildirimle', () => {
    const k = uygula(hazir(), { tur: 'onayla', id: 2, layer: 'a-yağmur', zaman: 9 });
    const d = ind(k, { tur: 'cap', id: 3, layer: 'a-yağmur', idler: [2], surum: 1, cap: 'Ø32' });
    expect(d.state.calculatedLayers['a-yağmur'].approved).toBe(false);
    expect(d.state.calculatedLayers['a-yağmur'].approvedAt).toBeUndefined();
    expect(d.gecmis.geri).toHaveLength(k.gecmis.geri.length + 1);
    expect(d.son?.bildirim).toBe('a-yağmur onayı kalktı — çap değişti, yeniden onaylayın');
    // Tek geri al: hem cap hem onay eski haline doner.
    const geri = ind(d, { tur: 'geri' });
    expect(geri.state.calculatedLayers['a-yağmur'].approved).toBe(true);
    expect(geri.state.calculatedLayers['a-yağmur'].edgeSegments[1].diameter).toBe('');
  });
});

describe('onay', () => {
  it('onay ve onayi geri alma layer SECIMINI degistirmez (07.08 revizyon dersi)', () => {
    const k = uygula(kayit({ selectedLayer: 'a-yağmur' }), ayir(1), { tur: 'onayla', id: 2, layer: 'a-yağmur', zaman: 7 });
    expect(k.state.selectedLayer).toBe('a-yağmur');
    expect(k.state.calculatedLayers['a-yağmur'].approvedAt).toBe(7);
    expect(k.son?.bildirim).toBe('a-yağmur metrajı onaylandı');
    const kaldir = ind(k, { tur: 'onayiKaldir', id: 3, layer: 'a-yağmur' });
    expect(kaldir.state.selectedLayer).toBe('a-yağmur');
    expect(kaldir.state.calculatedLayers['a-yağmur'].approved).toBe(false);
  });

  it('onayli layer\'i yeniden onaylamak islem sayilmaz', () => {
    const k = uygula(kayit(), ayir(1), { tur: 'onayla', id: 2, layer: 'a-yağmur', zaman: 7 });
    expect(ind(k, { tur: 'onayla', id: 3, layer: 'a-yağmur', zaman: 8 })).toBe(k);
  });

  it('bildirimdeki "Geri al" yalniz o islem tepedeyken gecerli', () => {
    const k = uygula(kayit(), ayir(1), { tur: 'onayla', id: 2, layer: 'a-yağmur', zaman: 7 });
    expect(tepedeMi(k, 2)).toBe(true);
    const sonra = ind(k, { tur: 'sec', id: 3, layer: 'b' });
    expect(tepedeMi(sonra, 2)).toBe(false);
  });
});

describe('gorunum tercihleri gecmise YAZILMAZ', () => {
  it('gizle / soluklastir / 💧 / tumunu goster / yalniz boru', () => {
    const k0 = uygula(kayit(), ayir(1));
    const k = uygula(
      k0,
      { tur: 'gizle', layer: 'DUVAR' },
      { tur: 'soluklastir', layer: 'MOBİLYA' },
      { tur: 'sprinkler', layer: 'SPRİNK' },
    );
    expect(k.state.hiddenLayers).toEqual(['DUVAR']);
    expect(k.state.dimmedLayers).toEqual(['MOBİLYA']);
    expect(k.state.sprinklerLayers).toEqual(['SPRİNK']);
    expect(k.gecmis).toBe(k0.gecmis);
    const tum = ind(k, { tur: 'tumunuGoster' });
    expect(tum.state.hiddenLayers).toEqual([]);
    expect(tum.state.dimmedLayers).toEqual([]);
    const yalniz = ind(k, { tur: 'yalnizGoster', layer: 'a-yağmur', katmanlar: ['a-yağmur', 'DUVAR', 'YAZI'] });
    expect(yalniz.state.hiddenLayers).toEqual(['DUVAR', 'YAZI']);
    expect(ind(ind(k, { tur: 'gizle', layer: 'DUVAR' }), { tur: 'geri' }).state.hiddenLayers).toEqual([]);
  });
});

describe('birim ve yukleme', () => {
  it('birim degisimi gecmise yazilmaz; hesaplar KORUNUR ve bayat gorunur', () => {
    const k = uygula(kayit(), ayir(1));
    const b = ind(k, { tur: 'birim', scale: 0.01 });
    expect(b.state.scale).toBe(0.01);
    expect(b.gecmis).toBe(k.gecmis);
    const cl = b.state.calculatedLayers['a-yağmur'];
    expect(cl).toBeDefined();
    expect(birimBayatMi(cl, b.state.scale)).toBe(true);
  });

  it('bolmeden layer yerelde olceklenir: uzunluk geometriden yeniden hesaplanir', () => {
    const k = ind(kayit(), {
      tur: 'hesap', id: 1, hesap: hesap('a-yağmur', IKI_PARCA, { splitMode: 'none', scaleUsed: 0.1 }),
    });
    const o = ind(k, { tur: 'olcekle', id: 2, layer: 'a-yağmur', scale: 0.01 });
    const cl = o.state.calculatedLayers['a-yağmur'];
    expect(cl.edgeSegments.map((s) => s.length)).toEqual([1, 0.6]);
    expect(cl.totalLength).toBeCloseTo(1.6, 9);
    expect(cl.scaleUsed).toBe(0.01);
    expect(o.son?.bildirim).toBe('a-yağmur yeni birime göre güncellendi');
    // Ayni birimle yeniden olceklemek islem sayilmaz
    expect(ind(o, { tur: 'olcekle', id: 3, layer: 'a-yağmur', scale: 0.01 })).toBe(o);
  });

  it('onayli bolmeden layer olceklenince onay kalkar ve bildirim soyler', () => {
    const k = uygula(
      ind(kayit(), {
        tur: 'hesap', id: 1, hesap: hesap('a-yağmur', IKI_PARCA, { splitMode: 'none', scaleUsed: 0.1 }),
      }),
      { tur: 'onayla', id: 2, layer: 'a-yağmur', zaman: 4 },
    );
    const o = ind(k, { tur: 'olcekle', id: 3, layer: 'a-yağmur', scale: 0.01 });
    expect(o.state.calculatedLayers['a-yağmur'].approved).toBe(false);
    expect(o.son?.bildirim).toBe('a-yağmur yeni birime göre güncellendi · onay kalktı, yeniden onaylayın');
  });

  it('yukle gecmisi sifirlar', () => {
    const k = uygula(kayit(), ayir(1));
    const y = ind(k, { tur: 'yukle', state: bosDurum('baska', 0.001) });
    expect(y.gecmis.geri).toEqual([]);
    expect(y.son).toBeNull();
  });

  it('indirgeyici saftir: ayni girdiyle ayni cikti, girdi degismez (StrictMode)', () => {
    const k = uygula(kayit(), ayir(1));
    const kopya = JSON.stringify(k);
    const e: KayitEylemi = { tur: 'cap', id: 2, layer: 'a-yağmur', idler: [1], surum: 1, cap: 'Ø50' };
    expect(JSON.stringify(ind(k, e))).toBe(JSON.stringify(ind(k, e)));
    expect(JSON.stringify(k)).toBe(kopya);
  });
});

// 25.09 canli: birim dm → cm degisti; motor layer basina ~23 sn yeniden ayirirken
// ekran eski birimin sayisini (3.795,6 m) kesin sonuc gibi gosterdi.
describe('gosterimHesabi — bayat layer yeni birimle GOSTERILIR, belgeye yazilmaz', () => {
  // IKI_PARCA: 100 + 60 cizim birimi; scaleUsed 0.1 → 10 m + 6 m.
  it('birimi guncel layer AYNI nesne (gorunum onbellekleri bozulmaz)', () => {
    const cl = hesap('a-yağmur', IKI_PARCA, { scaleUsed: 0.1 });
    expect(gosterimHesabi(cl, 0.1)).toBe(cl);
  });

  it('scaleUsed yoksa (eski kayit — yuklemede yazilir) AYNI nesne', () => {
    const cl = hesap('a-yağmur', IKI_PARCA, { scaleUsed: undefined });
    expect(gosterimHesabi(cl, 0.01)).toBe(cl);
  });

  it('bayat layer: parca uzunluklari yeni birimle', () => {
    const g = gosterimHesabi(hesap('a-yağmur', IKI_PARCA, { scaleUsed: 0.1 }), 0.01);
    expect(g.edgeSegments.map((s) => s.length)).toEqual([1, 0.6]);
  });

  it('bayat layer: toplam yeni birimle', () => {
    const g = gosterimHesabi(hesap('a-yağmur', IKI_PARCA, { scaleUsed: 0.1 }), 0.01);
    expect(g.totalLength).toBeCloseTo(1.6, 9);
  });

  it('oranla degil GEOMETRIDEN: yuvarlanmis eski metre buyutulmez (cm → m)', () => {
    // 1234,5678 cizim birimi: cm'de 12,346 m (motor yuvarlar). Oranla m'ye
    // 1234,6 cikardi; motorun formulu 1234,568 verir.
    const p = { ...parca(1, [[0, 0], [1234.5678, 0]]), length: 12.346 };
    const g = gosterimHesabi(hesap('a-yağmur', [p], { scaleUsed: 0.01 }), 1);
    expect(g.edgeSegments[0].length).toBe(1234.568);
  });

  it('belgeye YAZILMAZ: scaleUsed eski kalir — onay ve fiyatlandirma kapali kalir', () => {
    const g = gosterimHesabi(hesap('a-yağmur', IKI_PARCA, { scaleUsed: 0.1 }), 0.01);
    expect(birimBayatMi(g, 0.01)).toBe(true);
  });

  it('parca numaralari, caplar ve parcalama surumu korunur (eylemler ayni parcaya yazar)', () => {
    const cl = hesap('a-yağmur', [parca(7, [[0, 0], [100, 0]], 'Ø50'), parca(9, [[100, 0], [100, 60]])], {
      scaleUsed: 0.1, computedAt: 42,
    });
    const g = gosterimHesabi(cl, 0.01);
    expect([g.computedAt, g.edgeSegments.map((s) => [s.segment_id, s.diameter])]).toEqual([42, [[7, 'Ø50'], [9, '']]]);
  });

  it('girdi degismez (saf)', () => {
    const cl = hesap('a-yağmur', IKI_PARCA, { scaleUsed: 0.1 });
    const kopya = JSON.stringify(cl);
    gosterimHesabi(cl, 0.01);
    expect(JSON.stringify(cl)).toBe(kopya);
  });

  // Bayat donemde her cap tiki butun bayat layer'lari yeniden cevirmesin
  // (700K parcalik layer'da tik basina O(N); 25.09 inceleme).
  it('ayni hesap + ayni birim → AYNI gosterim nesnesi (onbellek)', () => {
    const cl = hesap('a-yağmur', IKI_PARCA, { scaleUsed: 0.1 });
    expect(gosterimHesabi(cl, 0.01)).toBe(gosterimHesabi(cl, 0.01));
  });

  it('birim yeniden degisince onbellek eski birimin gosterimini VERMEZ', () => {
    const cl = hesap('a-yağmur', IKI_PARCA, { scaleUsed: 0.1 });
    gosterimHesabi(cl, 0.01);
    expect(gosterimHesabi(cl, 0.001).edgeSegments.map((s) => s.length)).toEqual([0.1, 0.06]);
  });
});

describe('kayitliDurumuCoz — kayitli calismanin yuklenmesi', () => {
  const kayitli = {
    fileId: 'eski-id',
    scale: 0.1,
    selectedLayer: 'a-yağmur',
    calculatedLayers: { 'a-yağmur': { ...hesap('a-yağmur', IKI_PARCA), scaleUsed: undefined } },
    sprinklerLayers: [],
    hiddenLayers: ['DUVAR'],
    dimmedLayers: [],
    layerConfigs: {},
  };

  it('eski kayitta scaleUsed KAYDIN birimiyle doldurulur', () => {
    const s = kayitliDurumuCoz(kayitli, 'yeni-id', 0.1, true);
    expect(s.calculatedLayers['a-yağmur'].scaleUsed).toBe(0.1);
    expect(s.fileId).toBe('yeni-id');
    expect(s.hiddenLayers).toEqual(['DUVAR']);
  });

  it('birim FARKLIYSA hesaplar dusurulmez, bayat isaretlenir (etiketler korunur)', () => {
    const s = kayitliDurumuCoz(kayitli, 'yeni-id', 0.01, true);
    const cl = s.calculatedLayers['a-yağmur'];
    expect(cl).toBeDefined();
    expect(cl.scaleUsed).toBe(0.1);
    expect(birimBayatMi(cl, s.scale)).toBe(true);
  });

  it('dosya kimligi anahtarli (legacy) kayit baska dosyaya ait ise bos baslar', () => {
    expect(kayitliDurumuCoz(kayitli, 'baska-id', 0.1, false).calculatedLayers).toEqual({});
  });

  it('bozuk kayit bos baslar', () => {
    expect(kayitliDurumuCoz(null, 'x', 0.1, true)).toEqual(bosDurum('x', 0.1));
    expect(kayitliDurumuCoz('metin', 'x', 0.1, true)).toEqual(bosDurum('x', 0.1));
  });
});

describe('parcalama surumu — eski parcalamaya gelen cap REDDEDILIR (25.09 inceleme)', () => {
  // Yeniden ayirma: yatay boru ikiye bolundu, numaralar kaydi (eski 2 = dikey kol → yeni 3).
  const BOLUNMUS = [
    parca(1, [[0, 0], [50, 0]]),
    parca(2, [[50, 0], [100, 0]]),
    parca(3, [[100, 0], [100, 60]]),
  ];
  const yeniden = () => uygula(kayit(), ayir(1), ayir(5, 'a-yağmur', BOLUNMUS));
  const caplar = (k: CalismaKaydi) => k.state.calculatedLayers['a-yağmur'].edgeSegments.map((s) => s.diameter);

  it('eski surumle gelen cap islem sayilmaz (ayni kayit doner, gecmise adim yazilmaz)', () => {
    const k = yeniden();
    expect(ind(k, { tur: 'cap', id: 6, layer: 'a-yağmur', idler: [2], surum: 1, cap: 'Ø50' })).toBe(k);
  });

  it('React kuyrugu [hesap, cap] sirasiyla yeniden oynatinca yeni parcalamada hicbir parca degismez', () => {
    const k = uygula(
      kayit(),
      ayir(1),
      ayir(5, 'a-yağmur', BOLUNMUS),
      { tur: 'cap', id: 6, layer: 'a-yağmur', idler: [2], surum: 1, cap: 'Ø50' },
    );
    expect(caplar(k)).toEqual(['', '', '']);
  });

  it('ESKI davranis (surumsuz) tiklanmayan parcaya yazardi — kriteri ihlal eder', () => {
    // Surum denetimi olmasaydi eski 2 (dikey kol) numarasi yeni parcalamada
    // yatay borunun ikinci yarisina yazilirdi.
    const k = ind(yeniden(), { tur: 'cap', id: 6, layer: 'a-yağmur', idler: [2], surum: 5, cap: 'Ø50' });
    expect(caplar(k)).toEqual(['', 'Ø50', '']);
  });

  it('guncel surumle gelen cap yazilir', () => {
    const k = ind(yeniden(), { tur: 'cap', id: 6, layer: 'a-yağmur', idler: [3], surum: 5, cap: 'Ø50' });
    expect(caplar(k)).toEqual(['', '', 'Ø50']);
  });

  it('geri alinan eski parcalama kendi surumuyle yine etiketlenir', () => {
    const geri = ind(yeniden(), { tur: 'geri' });
    const k = ind(geri, { tur: 'cap', id: 7, layer: 'a-yağmur', idler: [2], surum: 1, cap: 'Ø32' });
    expect(caplar(k)).toEqual(['', 'Ø32']);
  });
});

describe('yeniden ayirmada aktarim payi LAYER\'in kendi verisinden (25.09 inceleme)', () => {
  // mm cizim, ~1 m'lik layer: dugum toleransi 1 birim → pay 2. Cizimin tamami
  // (2 km) kullanilsaydi pay 100 olur, 30 mm otedeki YENI boru eski borunun
  // capini alirdi.
  const eski = [parca(1, [[0, 0], [1000, 0]], 'Ø50')];
  const yeni = [parca(1, [[0, 0], [1000, 0]]), parca(2, [[0, 30], [1000, 30]])];
  const mm = (id: number, segmentler: EdgeSegment[]) => hesap('a-yağmur', segmentler, { computedAt: id, scaleUsed: 0.001 });

  it('ayni boru capini alir; 30 mm otedeki yeni boru capsiz kalir', () => {
    const k = uygula(
      kayit(),
      { tur: 'hesap', id: 1, hesap: mm(1, eski) },
      { tur: 'hesap', id: 2, hesap: mm(2, yeni) },
    );
    expect(k.state.calculatedLayers['a-yağmur'].edgeSegments.map((s) => s.diameter)).toEqual(['Ø50', '']);
  });
});

describe('sirali yeniden ayirma oturumu — TEK bildirim (25.09 inceleme)', () => {
  const A = [parca(1, [[0, 0], [100, 0]], '', 'a'), parca(2, [[100, 0], [100, 60]], '', 'a')];
  const B = [parca(1, [[0, 500], [100, 500]], '', 'b'), parca(2, [[100, 500], [100, 560]], '', 'b')];
  // B'nin iki farkli capli parcasi tek parcaya birlesti → capsiz kalir, kayip sayilir.
  const B_BIRLESIK = [parca(1, [[0, 500], [100, 500], [100, 560]], '', 'b')];
  const baslangic = () => uygula(
    kayit(),
    ayir(1, 'a', A),
    { tur: 'cap', id: 2, layer: 'a', idler: [1, 2], surum: 1, cap: 'Ø50' },
    ayir(3, 'b', B),
    { tur: 'cap', id: 4, layer: 'b', idler: [1], surum: 3, cap: 'Ø32' },
    { tur: 'cap', id: 5, layer: 'b', idler: [2], surum: 3, cap: 'Ø40' },
  );
  const yenidenA = (id: number, oturum?: number): KayitEylemi => ({
    tur: 'hesap', id, hesap: hesap('a', A, { computedAt: id }), oturum,
  });
  const yenidenB = (id: number, oturum?: number, segmentler = B_BIRLESIK): KayitEylemi => ({
    tur: 'hesap', id, hesap: hesap('b', segmentler, { computedAt: id }), oturum,
  });

  it('oturumun ilk layer\'i kendi bildirimini yazar', () => {
    expect(ind(baslangic(), yenidenA(10, 9)).son?.bildirim).toBe('a yeniden ayrıldı · 2 parça, 2 parçanın çapı korundu');
  });

  it('ikinci layer gelince bildirim oturumu toplar; kayip layer adiyla', () => {
    const k = uygula(baslangic(), yenidenA(10, 9), yenidenB(11, 9));
    expect(k.son?.bildirim).toBe('2 layer yeni birime göre güncellendi · 1 parçaya yeniden çap verin (b: 1)');
  });

  it('arada yapilan etiketleme oturumu koparmaz', () => {
    const k = uygula(
      baslangic(),
      yenidenA(10, 9),
      { tur: 'cap', id: 20, layer: 'a', idler: [1], surum: 10, cap: 'Ø63' },
      yenidenB(11, 9),
    );
    expect(k.son?.bildirim).toBe('2 layer yeni birime göre güncellendi · 1 parçaya yeniden çap verin (b: 1)');
  });

  it('farkli oturum yeni ozet baslatir', () => {
    const k = uygula(baslangic(), yenidenA(10, 9), yenidenB(11, 12));
    expect(k.son?.bildirim).toBe('b yeniden ayrıldı · 1 parça · 1 parçaya yeniden çap verin');
  });

  it('oturumsuz yeniden ayirma (tek layer "Yeniden ayır") toplanmaz', () => {
    const k = uygula(baslangic(), yenidenA(10, 9), yenidenB(11));
    expect(k.son?.bildirim).toBe('b yeniden ayrıldı · 1 parça · 1 parçaya yeniden çap verin');
  });

  it('oturumsuz IKI yeniden ayirma kendi aralarinda da birlesmez', () => {
    const k = uygula(baslangic(), yenidenA(10), yenidenB(11));
    expect(k.son?.bildirim).toBe('b yeniden ayrıldı · 1 parça · 1 parçaya yeniden çap verin');
  });

  it('kayipsiz oturum etiketlerin korundugunu soyler', () => {
    const k = uygula(baslangic(), yenidenA(10, 9), yenidenB(11, 9, B));
    expect(k.son?.bildirim).toBe('2 layer yeni birime göre güncellendi · çap etiketleri korundu');
  });

  it('oturumda onayi kalkan layer varsa not dusulur', () => {
    const k = uygula(baslangic(), { tur: 'onayla', id: 8, layer: 'a', zaman: 8 }, yenidenA(10, 9), yenidenB(11, 9, B));
    expect(k.son?.bildirim).toBe('2 layer yeni birime göre güncellendi · çap etiketleri korundu · onay kalktı, yeniden onaylayın');
  });

  it('bolmeden layer\'in yerel olceklenmesi de oturuma girer', () => {
    const k = uygula(
      baslangic(),
      { tur: 'hesap', id: 6, hesap: hesap('c', IKI_PARCA, { splitMode: 'none', computedAt: 6 }) },
      yenidenA(10, 9),
      { tur: 'olcekle', id: 11, layer: 'c', scale: 0.01, oturum: 9 },
    );
    expect(k.son?.bildirim).toBe('2 layer yeni birime göre güncellendi · çap etiketleri korundu');
  });
});
