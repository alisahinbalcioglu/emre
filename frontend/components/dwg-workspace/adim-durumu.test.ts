import { describe, expect, it } from 'vitest';
import type { CalculatedLayer } from './types';
import {
  adimDurumu,
  fiyatlandirmaDurumu,
  fiyatlandirmaEngeli,
  ipucu,
  kisayolEylemi,
  onayEngeli,
  onayKutusuAcikMi,
  yaziAlaniMi,
} from './adim-durumu';

function hesap(ek: Partial<CalculatedLayer> = {}): CalculatedLayer {
  return {
    layer: 'a-yağmur',
    hatIsmi: 'a-yağmur',
    materialType: '',
    defaultDiameter: '',
    edgeSegments: [],
    junctionPoints: [],
    totalLength: 0,
    computedAt: 1,
    approved: false,
    splitMode: 't',
    scaleUsed: 0.1,
    sprinklerLayersUsed: [],
    ...ek,
  };
}

const temel = { scale: 0.1, sprinklerLayers: [] as string[] };

describe('adimDurumu — 3 adimli yol haritasi', () => {
  it('secim yok: adim 1 "sec", adim 2 kapali, adim 3 bekliyor', () => {
    expect(adimDurumu({ ...temel, seciliLayer: null, hesap: null })).toEqual({
      adim1: 'sec', adim2Acik: false, adim3: 'bekliyor', birimBayat: false, sprinklerBayat: false,
    });
  });

  it('secili ama ayrilmamis: "ayir" (Parcalara ayir cikisi)', () => {
    expect(adimDurumu({ ...temel, seciliLayer: 'a-yağmur', hesap: null }).adim1).toBe('ayir');
  });

  it('ayrilmis onaysiz: adim 2 acik, adim 3 "onayla"', () => {
    const d = adimDurumu({ ...temel, seciliLayer: 'a-yağmur', hesap: hesap() });
    expect(d.adim1).toBe('tamam');
    expect(d.adim2Acik).toBe(true);
    expect(d.adim3).toBe('onayla');
  });

  it('ONAYLI layer\'in da cikisi var: adim 3 "onayli" ("Geri al" onayi kaldirir)', () => {
    expect(adimDurumu({ ...temel, seciliLayer: 'a-yağmur', hesap: hesap({ approved: true }) }).adim3).toBe('onayli');
  });

  it('onayli ama birimi degismis: "onayli-bayat" (teklife girmez — "hazir" DENMEZ)', () => {
    const d = adimDurumu({ ...temel, scale: 0.01, seciliLayer: 'a-yağmur', hesap: hesap({ approved: true }) });
    expect(d.adim3).toBe('onayli-bayat');
  });

  it('Adim 3 ile fiyatlandirma ayni yuklemi okur: "onayli" ⇔ fiyatlandirmaya hazir', () => {
    const olcekler = [0.1, 0.01];
    const uyusmayan = olcekler.filter((scale) => {
      const h = hesap({ approved: true });
      const adim3Hazir = adimDurumu({ ...temel, scale, seciliLayer: 'a-yağmur', hesap: h }).adim3 === 'onayli';
      return adim3Hazir !== (fiyatlandirmaDurumu([h], scale).hazir.length === 1);
    });
    expect(uyusmayan).toEqual([]);
  });

  it('SOZLESME: secili layer icin hicbir durum cikissiz degil (dort durumun dordu)', () => {
    const durumlar: Array<{ h: CalculatedLayer | null; scale: number }> = [
      { h: null, scale: 0.1 },
      { h: hesap(), scale: 0.1 },
      { h: hesap({ approved: true }), scale: 0.1 },
      { h: hesap({ approved: true }), scale: 0.01 },
    ];
    const cikissiz = durumlar.filter(({ h, scale }) => {
      const d = adimDurumu({ ...temel, scale, seciliLayer: 'a-yağmur', hesap: h });
      return !(d.adim1 === 'ayir' || d.adim3 === 'onayla' || d.adim3 === 'onayli' || d.adim3 === 'onayli-bayat');
    });
    expect(cikissiz).toEqual([]);
  });

  it('birim degismisse birimBayat; 💧 degismisse sprinklerBayat (ayri bayraklar)', () => {
    const b = adimDurumu({ ...temel, scale: 0.01, seciliLayer: 'a-yağmur', hesap: hesap() });
    expect(b.birimBayat).toBe(true);
    expect(b.sprinklerBayat).toBe(false);
    const s = adimDurumu({ ...temel, sprinklerLayers: ['SPRİNK'], seciliLayer: 'a-yağmur', hesap: hesap() });
    expect(s.sprinklerBayat).toBe(true);
    expect(s.birimBayat).toBe(false);
  });
});

describe('onayEngeli', () => {
  it('ayrilmamis, ayrilirken ve birim bayatken onay kapali; aksi halde acik', () => {
    expect(onayEngeli({ hesap: null, scale: 0.1, ayriliyor: false })).toBe("Önce layer'ı parçalara ayırın");
    expect(onayEngeli({ hesap: hesap(), scale: 0.1, ayriliyor: true })).toBe('Parçalara ayırma sürüyor');
    expect(onayEngeli({ hesap: hesap(), scale: 0.01, ayriliyor: false })).toBe('Çizim birimi değişti — önce yeniden ayırın');
    expect(onayEngeli({ hesap: hesap(), scale: 0.1, ayriliyor: false })).toBeNull();
  });

  it('💧 bayatligi onayi ENGELLEMEZ (metraj dogru, yalniz parca sinirlari eski)', () => {
    expect(onayEngeli({ hesap: hesap({ sprinklerLayersUsed: ['ESKI'] }), scale: 0.1, ayriliyor: false })).toBeNull();
  });
});

describe('fiyatlandirmaDurumu — baslik dugmesi ve onay akisi ayni yuklemi okur', () => {
  it('onayli+guncel hazir, onayli+birimi degismis GITMEZ, onaysiz ayri', () => {
    const a = hesap({ layer: 'A', approved: true });
    const b = hesap({ layer: 'B', approved: true, scaleUsed: 0.01 });
    const c = hesap({ layer: 'C' });
    const d = fiyatlandirmaDurumu([a, b, c], 0.1);
    expect(d.hazir.map((l) => l.layer)).toEqual(['A']);
    expect(d.bayatOnayli.map((l) => l.layer)).toEqual(['B']);
    expect(d.onaysiz.map((l) => l.layer)).toEqual(['C']);
  });
});

describe('ipucu — cizimdeki ipucu hapi', () => {
  const g = {
    adim: adimDurumu({ ...temel, seciliLayer: null, hesap: null }),
    seciliLayer: null as string | null,
    layerRengi: null as string | null,
    yontem: 't' as 't' | 'none',
    kalem: null as { cap: string; renk: string } | null,
    silgi: false,
    ayriliyor: null as string | null,
  };

  it('adim 1: "Boru layer\'ını seçin — çizimde bir boruya tıklayın"', () => {
    expect(ipucu(g)).toEqual({ vurgu: "Boru layer'ını seçin", metin: 'çizimde bir boruya tıklayın', renk: '#94a3b8', esc: false });
  });

  it('adim 1b: secilen layer adi + yonteme gore dugme adi', () => {
    const adim = adimDurumu({ ...temel, seciliLayer: 'a-yağmur', hesap: null });
    expect(ipucu({ ...g, adim, seciliLayer: 'a-yağmur', layerRengi: '#22d3ee' })).toEqual({
      vurgu: 'a-yağmur seçildi', metin: 'sağdan “Parçalara ayır” ile devam edin', renk: '#22d3ee', esc: false,
    });
    expect(ipucu({ ...g, adim, seciliLayer: 'a-yağmur', yontem: 'none' }).metin).toBe('sağdan “Hatları çıkar” ile devam edin');
  });

  it('adim 2: kalem secili → "Ø110 PVC BORU seçili — parçalara tıklayarak atayın" + Esc', () => {
    const adim = adimDurumu({ ...temel, seciliLayer: 'a-yağmur', hesap: hesap() });
    expect(ipucu({ ...g, adim, seciliLayer: 'a-yağmur', kalem: { cap: 'Ø110 PVC BORU', renk: '#8b5cf6' } })).toEqual({
      vurgu: 'Ø110 PVC BORU seçili', metin: 'parçalara tıklayarak atayın', renk: '#8b5cf6', esc: true,
    });
  });

  it('silgi kalemden once gelir; birim bayatligi hepsinden once', () => {
    const adim = adimDurumu({ ...temel, seciliLayer: 'a-yağmur', hesap: hesap() });
    const kalem = { cap: 'Ø50', renk: '#000' };
    expect(ipucu({ ...g, adim, seciliLayer: 'a-yağmur', kalem, silgi: true }).vurgu).toBe('Çap silgisi açık');
    const bayat = adimDurumu({ ...temel, scale: 0.01, seciliLayer: 'a-yağmur', hesap: hesap() });
    expect(ipucu({ ...g, adim: bayat, seciliLayer: 'a-yağmur', kalem, silgi: true }).vurgu).toBe('a-yağmur yeniden ayrılmalı');
  });

  it('silgi acikken hap "Esc" rozeti gosterir (silgi Esc ile kapanir)', () => {
    const adim = adimDurumu({ ...temel, seciliLayer: 'a-yağmur', hesap: hesap() });
    expect(ipucu({ ...g, adim, seciliLayer: 'a-yağmur', silgi: true }).esc).toBe(true);
  });

  it('ayrilirken tum adimlarin onune gecer', () => {
    expect(ipucu({ ...g, ayriliyor: 'a-yağmur' }).vurgu).toBe('a-yağmur parçalara ayrılıyor…');
  });

  it('"Bölmeden" ayrilirken hatlar cikarilir (dugmenin diliyle ayni)', () => {
    expect(ipucu({ ...g, ayriliyor: 'a-pis su', ayrilanYontem: 'none' }).vurgu).toBe('a-pis su hatları çıkarılıyor…');
  });

  it('onayli layer: yesil "onaylandı"', () => {
    const adim = adimDurumu({ ...temel, seciliLayer: 'a-yağmur', hesap: hesap({ approved: true }) });
    expect(ipucu({ ...g, adim, seciliLayer: 'a-yağmur' }).renk).toBe('#16a34a');
  });
});

describe('kisayolEylemi', () => {
  const tus = (key: string, ek: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
    key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...ek,
  });

  it('Ctrl+Z geri; Ctrl+Y ve Ctrl+Shift+Z yinele; Cmd de gecer', () => {
    expect(kisayolEylemi(tus('z', { ctrlKey: true }))).toBe('geri');
    expect(kisayolEylemi(tus('Z', { ctrlKey: true, shiftKey: true }))).toBe('ileri');
    expect(kisayolEylemi(tus('y', { ctrlKey: true }))).toBe('ileri');
    expect(kisayolEylemi(tus('z', { metaKey: true }))).toBe('geri');
  });

  it('degistiricisiz tus, AltGr (Ctrl+Alt) ve baska harf kisayol DEGIL', () => {
    expect(kisayolEylemi(tus('z'))).toBeNull();
    expect(kisayolEylemi(tus('z', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(kisayolEylemi(tus('x', { ctrlKey: true }))).toBeNull();
  });

  it('yazi alani odaktaysa kisayol oraya aittir', () => {
    expect(yaziAlaniMi({ tagName: 'INPUT' })).toBe(true);
    expect(yaziAlaniMi({ tagName: 'TEXTAREA' })).toBe(true);
    expect(yaziAlaniMi({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(yaziAlaniMi({ tagName: 'CANVAS' })).toBe(false);
    expect(yaziAlaniMi(null)).toBe(false);
  });
});

describe('fiyatlandirmaEngeli — baslik dugmesinin ipucu', () => {
  const d = (h: CalculatedLayer[], scale = 0.1) => fiyatlandirmaDurumu(h, scale);

  it('hazir layer varsa acik', () => {
    expect(fiyatlandirmaEngeli(d([hesap({ approved: true })]), false)).toBeNull();
  });

  it('ayirma surerken kapali', () => {
    expect(fiyatlandirmaEngeli(d([hesap({ approved: true })]), true)).toBe('Parçalara ayırma sürüyor');
  });

  it('onayli ama birimi degismis: "onaylayin" DEMEZ, yeniden ayirmaya yonlendirir', () => {
    expect(fiyatlandirmaEngeli(d([hesap({ approved: true })], 0.01), false))
      .toBe("Onaylı layer'ların çizim birimi değişti — önce yeniden ayırın");
  });

  it('onayli layer yoksa onaya yonlendirir', () => {
    expect(fiyatlandirmaEngeli(d([hesap()]), false)).toBe("Önce en az bir layer'ın metrajını onaylayın");
  });
});

describe('onayKutusuAcikMi — acik onay kutusu klavyeyi alir', () => {
  const kok = (bulunan: unknown) => ({ querySelector: (s: string) => (s === '[role="alertdialog"]' ? bulunan : null) });

  it('alertdialog varsa acik', () => {
    expect(onayKutusuAcikMi(kok({}))).toBe(true);
  });

  it('yoksa kapali', () => {
    expect(onayKutusuAcikMi(kok(null))).toBe(false);
  });

  it('belge yoksa (SSR) kapali', () => {
    expect(onayKutusuAcikMi(undefined)).toBe(false);
  });
});
