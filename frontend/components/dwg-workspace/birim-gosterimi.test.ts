/**
 * BIRIM DEGISIMI — EKRANDA NE GORUNUR (25.09 canli hata).
 *
 * Emre canlida birimi dm → cm degistirdi. Motor her layer'i ~23 sn'de yeniden
 * ayirdi (sunucu gunlugu: 18:41:10 → 18:41:33); bu sure boyunca
 *   (1) Adim 1/2/3 eski birimin sayisini (3.795,6 m) KESIN sonuc gibi gosterdi
 *       → "birim degisti ama olculer ayni kaldi";
 *   (2) birim penceresinde Kaydet SESSIZCE kapaliydi (nedeni yalniz fare
 *       ipucunda) → "birim degistirilemiyor".
 *
 * Bilesenler react-dom/server ile GERCEKTEN cizilir (desen: ekip-bilesenleri).
 * Calisma alaninin bu degerleri bilesenlere BAGLADIGI: calisma-alani-baglanti.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { metre } from './adim-parcalari';
import Adim1BoruLayer, { type Adim1Props } from './Adim1BoruLayer';
import Adim2CapAta, { type Adim2Props } from './Adim2CapAta';
import Adim3Onay, { type Adim3Props } from './Adim3Onay';
import BirimPenceresi, { type BirimPenceresiProps } from './BirimPenceresi';
import type { CalculatedLayer } from './types';

const hic = () => undefined;

describe('metre — "≈" yalniz on hesapta', () => {
  it('kesin deger "5,9 m"', () => {
    expect(metre(5.9)).toBe('5,9 m');
  });

  it('on hesap "≈5,9 m"', () => {
    expect(metre(5.9, true)).toBe('≈5,9 m');
  });
});

// ── Adim 3: sabit altbilgideki buyuk toplam ─────────────────────────────────

function adim3(ek: Partial<Adim3Props>): string {
  const p: Adim3Props = {
    durum: 'onayla', layer: 'A-sihhi temiz su', toplamMetre: 379.56, yaklasik: false, capsiz: 121,
    engel: null, ayriliyor: false, onOnayla: hic, onOnayiKaldir: hic, onYenidenAyir: hic, ...ek,
  };
  return renderToStaticMarkup(createElement(Adim3Onay, p));
}

describe('Adim 3 toplami', () => {
  it('yeniden ayirma bitmeden toplam on hesap olarak "≈379,6 m" cizilir', () => {
    expect(adim3({ yaklasik: true })).toContain('≈379,6 m');
  });

  it('kesin toplamda "≈" yok', () => {
    expect(adim3({ yaklasik: false })).not.toContain('≈');
  });
});

// ── Adim 2: capsiz metre ve cap satiri ──────────────────────────────────────

function adim2(ek: Partial<Adim2Props>): string {
  const p: Adim2Props = {
    acik: true,
    ilerleme: { toplam: 3, capli: 1, capsiz: 2, toplamMetre: 5.9, capsizMetre: 4.1 },
    gruplar: [{ grup: null, satirlar: [{ cap: 'Ø50', renk: '#000', metre: 1.8, parca: 1, kalemId: 'k1', grup: 'Diğer' }] }],
    sorgu: '', onSorgu: hic, aktifCap: null, capsizOdak: false, onCapsizOdak: hic, onCapSec: hic, onEkle: hic,
    onKalemSil: hic, onGoster: hic, gosterilen: null, onTopluAta: hic, sprinklerIpucu: null, onKatmanlariAc: hic,
    onayli: false, yaklasik: false, ...ek,
  };
  return renderToStaticMarkup(createElement(Adim2CapAta, p));
}

describe('Adim 2 metreleri', () => {
  it('capsiz metre on hesapta "≈4,1 m"', () => {
    expect(adim2({ yaklasik: true })).toContain('≈4,1 m');
  });

  it('cap satirinin metresi on hesapta "≈1,8 m · 1"', () => {
    expect(adim2({ yaklasik: true })).toContain('≈1,8 m · 1');
  });

  it('kesin metrelerde "≈" yok', () => {
    expect(adim2({ yaklasik: false })).not.toContain('≈');
  });
});

// ── Adim 1: secili layer satiri, aciklama ve calisilan layer listesi ────────

function katman(ek: Partial<CalculatedLayer> = {}): CalculatedLayer {
  return {
    layer: 'A-sihhi temiz su', hatIsmi: 'A-sihhi temiz su', materialType: '', defaultDiameter: '',
    edgeSegments: [{ segment_id: 1, layer: 'A-sihhi temiz su', diameter: '', length: 379.56, coords: [0, 0, 37956, 0] }],
    junctionPoints: [], totalLength: 379.56, computedAt: 1, approved: false, splitMode: 't', scaleUsed: 0.1, ...ek,
  };
}

function adim1(ek: Partial<Adim1Props>): string {
  const p: Adim1Props = {
    durum: 'tamam', seciliLayer: 'A-sihhi temiz su', layerRengi: '#22d3ee', layerCizgi: 1, hesap: katman(),
    adaylar: [], katmanSayisi: 164, calisilanlar: [], yontem: 't', onYontem: hic, ayrilanLayer: null,
    ayrilanYontem: 't', birimBayat: false, sprinklerBayat: false, yenidenAyirma: null, onSec: hic,
    onDegistir: hic, onKatmanlariAc: hic, onAyir: hic, onAyirmayiKaldir: hic, onYenidenAyir: hic, ...ek,
  };
  return renderToStaticMarkup(createElement(Adim1BoruLayer, p));
}

describe('Adim 1 secili layer', () => {
  it('birim bayatken satirdaki uzunluk "≈379,6 m"', () => {
    expect(adim1({ birimBayat: true, yenidenAyirma: { sira: 2, toplam: 2 } })).toContain('≈379,6 m');
  });

  it('yeniden ayirma surerken "≈"nin ne oldugu yazilir', () => {
    expect(adim1({ birimBayat: true, yenidenAyirma: { sira: 2, toplam: 2 } }))
      .toContain('≈ Uzunluklar yeni birime çevrildi; parçalar ayrılınca kesinleşir.');
  });

  it('yalniz 💧 yeniden ayirmasinda (birim ayni) aciklama YOK', () => {
    expect(adim1({ birimBayat: false, yenidenAyirma: { sira: 1, toplam: 1 } })).not.toContain('≈');
  });

  it('calisilan layer listesinde birimi bayat layer "≈"', () => {
    const liste = adim1({
      durum: 'sec', seciliLayer: null, hesap: null,
      calisilanlar: [
        { ad: 'a-yağmur', renk: '#000', parca: 265, bolmeden: false, metre: 14.51, capsiz: 0, durum: 'bayat' },
        { ad: 'a-pis su', renk: '#000', parca: 3, bolmeden: false, metre: 5.9, capsiz: 0, durum: 'bekliyor' },
      ],
    });
    expect([liste.includes('≈14,5 m'), liste.includes('≈5,9 m'), liste.includes('5,9 m')]).toEqual([true, false, true]);
  });
});

// ── Birim penceresi: Kaydet sessizce kapanmaz, neden GORUNUR ─────────────────

function pencere(ek: Partial<BirimPenceresiProps>): string {
  const p: BirimPenceresiProps = {
    scale: 0.01, tespit: null, elle: true, ayirmaSuruyor: false, dogrulanmali: false,
    onKapat: hic, onKaydet: hic, ...ek,
  };
  return renderToStaticMarkup(createElement(BirimPenceresi, p));
}

/** "Kaydet" dugmesi kapali mi? Sinif listesinde `disabled:` onekli Tailwind
 *  siniflari var — olcut OZNITELIKTIR (`disabled=""`), metin aramasi degil. */
function kaydetKapali(html: string): boolean {
  const m = html.match(/<button[^>]*>Kaydet<\/button>/);
  if (!m) throw new Error('Kaydet dugmesi cizilmedi');
  return /\sdisabled=""/.test(m[0]);
}

describe('birim penceresi ayirma surerken', () => {
  it('Kaydet ayirma yuzunden KAPANMAZ (dogrulama bekleyen birimle cizilir)', () => {
    expect(kaydetKapali(pencere({ ayirmaSuruyor: true, dogrulanmali: true }))).toBe(false);
  });

  // Pencere secili birimle acilir (degismedi): not durumu ve yolu soyler,
  // "durdurulur" demez (ayni birimle Kaydet hicbir seyi durdurmaz). Birim
  // secilince degisen metin ayirmaNotu'nda (birimler.test.ts) olculur.
  it('ayirma surerken not pencerede GORUNUR yazilir (ayirmaNotu metni)', () => {
    expect(pencere({ ayirmaSuruyor: true }))
      .toContain('Şu an parçalara ayırma sürüyor. Başka bir birim seçip kaydederseniz yeni birimle yeniden başlar.');
  });

  it('ayirma yokken not cizilmez', () => {
    expect(pencere({ ayirmaSuruyor: false })).not.toContain('parçalara ayırma sürüyor');
  });

  it('bos kume kapisi: birim degismemis ve dogrulanmayacaksa Kaydet yine kapali', () => {
    expect(kaydetKapali(pencere({ ayirmaSuruyor: false, dogrulanmali: false }))).toBe(true);
  });
});
