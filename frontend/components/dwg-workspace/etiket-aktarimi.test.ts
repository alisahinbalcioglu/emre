import { describe, expect, it } from 'vitest';
import type { EdgeSegment } from '../dwg-metraj/types';
import { aktarimPayi, dugumToleransi, etiketleriAktar, segmentKosegeni } from './etiket-aktarimi';

/** Motorun dondurdugu bicimde parca: uclar coords'ta, 2+ nokta polyline'da. */
function parca(id: number, noktalar: [number, number][], cap = ''): EdgeSegment {
  let uzunluk = 0;
  for (let i = 0; i < noktalar.length - 1; i++) {
    uzunluk += Math.hypot(noktalar[i + 1][0] - noktalar[i][0], noktalar[i + 1][1] - noktalar[i][1]);
  }
  const son = noktalar[noktalar.length - 1];
  return {
    segment_id: id,
    layer: 'a-yağmur',
    diameter: cap,
    length: uzunluk,
    coords: [noktalar[0][0], noktalar[0][1], son[0], son[1]],
    polyline: noktalar,
  };
}

const caplar = (r: { segmentler: EdgeSegment[] }) => r.segmentler.map((s) => s.diameter);

describe('etiketleriAktar — ayni geometri', () => {
  const eski = [
    parca(1, [[0, 0], [100, 0]], 'Ø50 PVC BORU'),
    parca(2, [[100, 0], [100, 50]], 'Ø32'),
    parca(3, [[100, 0], [200, 0]], ''),
  ];

  it('birebir ayni parcalar (numaralar farkli) etiketini alir; capsiz capsiz kalir', () => {
    const yeni = [
      parca(7, [[0, 0], [100, 0]]),
      parca(8, [[100, 0], [100, 50]]),
      parca(9, [[100, 0], [200, 0]]),
    ];
    const r = etiketleriAktar(eski, yeni, 3);
    expect(caplar(r)).toEqual(['Ø50 PVC BORU', 'Ø32', '']);
    expect(r.aktarilan).toBe(2);
    expect(r.capsiz).toBe(1);
    // Eskiden de capsiz olan parca "yeniden etiketlenecek" SAYILMAZ.
    expect(r.yenidenEtiketlenecek).toBe(0);
  });

  it('birim degisince dugum izgarasina yuvarlanan uclar (tolerans kadar kayma) yine tasinir', () => {
    const yeni = [
      parca(1, [[0.9, -0.8], [100.9, 0.7]]),
      parca(2, [[100.9, 0.7], [99.2, 50.9]]),
      parca(3, [[100.9, 0.7], [200.8, -0.9]]),
    ];
    expect(caplar(etiketleriAktar(eski, yeni, 3))).toEqual(['Ø50 PVC BORU', 'Ø32', '']);
  });

  it('T noktasindaki komsu (branşman) ana borunun kararini bozmaz', () => {
    const e = [
      parca(1, [[0, 0], [50, 0]], 'Ø110'),
      parca(2, [[50, 0], [100, 0]], 'Ø110'),
      parca(3, [[50, 0], [50, 60]], 'Ø50'),
    ];
    const y = [parca(1, [[0, 0], [50, 0]]), parca(2, [[50, 0], [100, 0]]), parca(3, [[50, 0], [50, 60]])];
    expect(caplar(etiketleriAktar(e, y, 3))).toEqual(['Ø110', 'Ø110', 'Ø50']);
  });

  it('45° Y-branşmani hizali sayilmaz — ana boru capini korur', () => {
    const e = [
      parca(1, [[0, 0], [50, 0]], 'Ø110'),
      parca(2, [[50, 0], [100, 0]], 'Ø110'),
      parca(3, [[50, 0], [90, 40]], 'Ø50'),
    ];
    const y = [parca(1, [[0, 0], [50, 0]]), parca(2, [[50, 0], [100, 0]]), parca(3, [[50, 0], [90, 40]])];
    expect(caplar(etiketleriAktar(e, y, 6))).toEqual(['Ø110', 'Ø110', 'Ø50']);
  });

  it('L bicimli polyline (kose) etiketini alir', () => {
    const e = [parca(1, [[0, 0], [50, 0], [50, 50]], 'Ø40')];
    const y = [parca(1, [[0.5, 0.4], [50.4, 0.5], [50.5, 49.6]])];
    expect(caplar(etiketleriAktar(e, y, 3))).toEqual(['Ø40']);
  });

  it('cap metni kanonik bicime iner (1 1/4" → 1¼")', () => {
    const r = etiketleriAktar([parca(1, [[0, 0], [100, 0]], '1 1/4"')], [parca(1, [[0, 0], [100, 0]])], 3);
    expect(caplar(r)).toEqual(['1¼"']);
  });
});

describe('etiketleriAktar — bolunme ve birlesme (💧 isareti degisti)', () => {
  it('sprinkler noktasinda bolunen boru: iki parca da eski capi alir', () => {
    const e = [parca(1, [[0, 0], [100, 0]], 'Ø50')];
    const y = [parca(1, [[0, 0], [40, 0]]), parca(2, [[40, 0], [100, 0]])];
    const r = etiketleriAktar(e, y, 3);
    expect(caplar(r)).toEqual(['Ø50', 'Ø50']);
    expect(r.aktarilan).toBe(2);
  });

  it('ayni capli iki parca birlesince cap korunur', () => {
    const e = [parca(1, [[0, 0], [40, 0]], 'Ø50'), parca(2, [[40, 0], [100, 0]], 'Ø50')];
    expect(caplar(etiketleriAktar(e, [parca(1, [[0, 0], [100, 0]])], 3))).toEqual(['Ø50']);
  });

  it('FARKLI capli iki parca birlesince capsiz kalir ve yeniden etiketlenecek sayilir', () => {
    const e = [parca(1, [[0, 0], [40, 0]], 'Ø50'), parca(2, [[40, 0], [100, 0]], 'Ø63')];
    const r = etiketleriAktar(e, [parca(1, [[0, 0], [100, 0]])], 3);
    expect(caplar(r)).toEqual(['']);
    expect(r.yenidenEtiketlenecek).toBe(1);
    expect(r.aktarilan).toBe(0);
  });

  it('yeni parcanin ucuna yakin KISA kuyruk (t=.9) farkli capliysa cakisma sayilir', () => {
    // Sabit ornekler (t=.25/.5/.75) bu kuyrugu kacirir ve cogunluk capini
    // sessizce tasirdi — yogun ornekleme kuyrugu gormeli.
    const e = [parca(1, [[0, 0], [90, 0]], 'Ø50'), parca(2, [[90, 0], [100, 0]], 'Ø63')];
    const r = etiketleriAktar(e, [parca(1, [[0, 0], [100, 0]])], 3);
    expect(caplar(r)).toEqual(['']);
    expect(r.yenidenEtiketlenecek).toBe(1);
  });
});

describe('etiketleriAktar — belirsizlik ve yeni geometri', () => {
  it('ust uste iki boru (ikiz / by-pass) farkli capliysa tahmin EDILMEZ', () => {
    const e = [parca(1, [[0, 0], [100, 0]], 'Ø50'), parca(2, [[0, 0.5], [100, 0.5]], 'Ø63')];
    const r = etiketleriAktar(e, [parca(1, [[0, 0], [100, 0]])], 3);
    expect(caplar(r)).toEqual(['']);
    expect(r.yenidenEtiketlenecek).toBe(1);
  });

  it('pay disindaki paralel boru karismaz — en yakin kazanir', () => {
    const e = [parca(1, [[0, 0], [100, 0]], 'Ø50'), parca(2, [[0, 10], [100, 10]], 'Ø63')];
    expect(caplar(etiketleriAktar(e, [parca(1, [[0, 0.4], [100, 0.4]])], 3))).toEqual(['Ø50']);
  });

  it('eski geometride karsiligi olmayan parca capsiz kalir (kayip sayilmaz)', () => {
    const r = etiketleriAktar([parca(1, [[0, 0], [100, 0]], 'Ø50')], [parca(1, [[0, 500], [100, 500]])], 3);
    expect(caplar(r)).toEqual(['']);
    expect(r.yenidenEtiketlenecek).toBe(0);
  });

  it('yalniz bir kismi eski boruya oturan uzun parca capsiz kalir ve kayip sayilir', () => {
    const r = etiketleriAktar([parca(1, [[0, 0], [100, 0]], 'Ø50')], [parca(1, [[0, 0], [200, 0]])], 3);
    expect(caplar(r)).toEqual(['']);
    expect(r.yenidenEtiketlenecek).toBe(1);
  });

  it('girdi dizileri degismez; tasinan parca yeni nesnedir', () => {
    const e = [parca(1, [[0, 0], [100, 0]], 'Ø50')];
    const y = [parca(1, [[0, 0], [100, 0]]), parca(2, [[0, 900], [100, 900]])];
    const eskiKopya = JSON.stringify(e);
    const yeniKopya = JSON.stringify(y);
    const r = etiketleriAktar(e, y, 3);
    expect(JSON.stringify(e)).toBe(eskiKopya);
    expect(JSON.stringify(y)).toBe(yeniKopya);
    expect(r.segmentler[0]).not.toBe(y[0]);
    // Degismeyen (capsiz kalan, zaten capsiz) parca ayni nesne
    expect(r.segmentler[1]).toBe(y[1]);
  });

  it('yeni parcada kalmis eski bir cap degeri (motor bos doner ama savunma) silinir', () => {
    const y = [{ ...parca(1, [[0, 900], [100, 900]]), diameter: 'Ø99' }];
    expect(caplar(etiketleriAktar([], y, 3))).toEqual(['']);
  });
});

describe('dugumToleransi / aktarimPayi / segmentKosegeni', () => {
  it('motorun formulu: max(1, min(0,05/S, kosegen·0,001)) — kucuk layer\'da kosegen siniri', () => {
    expect(dugumToleransi(0.001, 500)).toBe(1);
  });

  it('buyuk layer\'da birim siniri (mm: 50 birim = 5 cm)', () => {
    expect(dugumToleransi(0.001, 100_000)).toBeCloseTo(50, 9);
  });

  it('birim siniri birimle degisir (dm: 0,5 → alt sinir 1)', () => {
    expect(dugumToleransi(0.1, 100_000)).toBe(1);
  });

  it('birimi bilinmeyen eski kayitta yalniz kosegen siniri', () => {
    expect(dugumToleransi(undefined, 100_000)).toBeCloseTo(100, 9);
  });

  it('gecersiz kosegen alt sinira duser', () => {
    expect([dugumToleransi(0.001, 0), dugumToleransi(0.001, Number.NaN)]).toEqual([1, 1]);
  });

  it('pay iki parcalamanin (eski/yeni birim) toleranslarinin buyugunun 2 kati', () => {
    expect(aktarimPayi(0.1, 0.01, 100_000)).toBeCloseTo(10, 9);
  });

  it('eski parcalamanin toleransi buyukse o kullanilir (yalniz yeni birim yetmez)', () => {
    expect(aktarimPayi(0.01, 0.1, 100_000)).toBeCloseTo(10, 9);
  });

  it('kosegen polyline noktalarini da sayar', () => {
    expect(segmentKosegeni([parca(1, [[0, 0], [30, 0], [30, 40]])])).toBeCloseTo(50, 9);
  });

  it('kosegen eski ∪ yeni kumelerin ORTAK kutusudur', () => {
    expect(segmentKosegeni([parca(1, [[0, 0], [30, 0]])], [parca(2, [[30, 0], [30, 40]])])).toBeCloseTo(50, 9);
  });

  it('bos kume kosegeni 0', () => {
    expect(segmentKosegeni([])).toBe(0);
  });
});

describe('aktarim payi LAYER geometrisinden — 25.09 inceleme olcumu', () => {
  // mm cizim; 150 mm arayla iki paralel boru, 💧 sonrasi ikiye bolundu, uclar
  // dugum toleransindan kucuk kaydi.
  const eski = [parca(1, [[0, 0], [10000, 0]], 'Ø25'), parca(2, [[0, 150], [10000, 150]], 'Ø20')];
  const yeni = [
    parca(1, [[0.3, -0.2], [5000, 0.4]]),
    parca(2, [[5000, 0.4], [10000, -0.3]]),
    parca(3, [[0, 150.2], [4000, 149.7]]),
    parca(4, [[4000, 149.7], [10000, 150.3]]),
  ];

  it('dort parcanin dordu de kendi borusunun capini alir', () => {
    const pay = aktarimPayi(0.001, 0.001, segmentKosegeni(eski, yeni));
    expect(caplar(etiketleriAktar(eski, yeni, pay))).toEqual(['Ø25', 'Ø25', 'Ø20', 'Ø20']);
  });

  it('ESKI davranis (tum cizimin kosegeni, 2 km model uzayi) hepsini kaybederdi — kriteri ihlal eder', () => {
    const eskiPay = 1.5 * Math.max(1, 2_000_000 * 0.001);
    expect(etiketleriAktar(eski, yeni, eskiPay).aktarilan).toBe(0);
  });
});

describe('etiketleriAktar — olcek', () => {
  it('3000 parcalik izgara 2 sn icinde aktarilir', () => {
    const e: EdgeSegment[] = [];
    const y: EdgeSegment[] = [];
    let id = 0;
    for (let i = 0; i < 50; i++) {
      for (let j = 0; j < 30; j++) {
        const x = i * 100;
        const yy = j * 100;
        e.push(parca(++id, [[x, yy], [x + 100, yy]], j % 2 ? 'Ø50' : 'Ø63'));
        y.push(parca(id, [[x + 0.3, yy - 0.3], [x + 100.3, yy + 0.2]]));
        e.push(parca(++id, [[x, yy], [x, yy + 100]], 'Ø32'));
        y.push(parca(id, [[x - 0.2, yy + 0.3], [x + 0.2, yy + 100.3]]));
      }
    }
    const t0 = Date.now();
    const r = etiketleriAktar(e, y, aktarimPayi(0.001, 0.001, segmentKosegeni(e, y)));
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.aktarilan).toBe(y.length);
  });
});

describe('etiketleriAktar — kural dallari (25.09 mutasyon olcumu: fikstur dali surmuyordu)', () => {
  it('hiza: yeni parcanin ICINE degen dik kol secilmez — kaymis ana boru capini verir', () => {
    // Eski ana boru dugum izgarasina 2 birim kaymis; dik kolun ucu yeni
    // parcanin ortasina degiyor ve ana borudan YAKIN. Hiza kurali kolu eler.
    const e = [parca(1, [[0, 2], [100, 2]], 'Ø110'), parca(2, [[50, 0], [50, 60]], 'Ø50')];
    expect(caplar(etiketleriAktar(e, [parca(1, [[0, 0], [100, 0]])], 3))).toEqual(['Ø110']);
  });

  it('kisa parcada (≤ pay) yon gurultulu — hiza ARANMAZ, parca capini alir', () => {
    const e = [parca(1, [[0, 0], [100, 0]], 'Ø50')];
    expect(caplar(etiketleriAktar(e, [parca(1, [[40, 0], [40.8, 1.5]])], 3))).toEqual(['Ø50']);
  });

  it('ORTADAKI kisa farkli capli ara parca yogun ornekle yakalanir (seyrek ornek kacirirdi)', () => {
    const e = [
      parca(1, [[0, 0], [30, 0]], 'Ø50'),
      parca(2, [[30, 0], [35, 0]], 'Ø63'),
      parca(3, [[35, 0], [100, 0]], 'Ø50'),
    ];
    expect(caplar(etiketleriAktar(e, [parca(1, [[0, 0], [100, 0]])], 3))).toEqual(['']);
  });

  it('kisa parca (≤ 2·pay) uc noktadan orneklenir — iki etiketi goren capsiz kalir', () => {
    const e = [parca(1, [[0, 0], [1.1, 0]], 'Ø50'), parca(2, [[1.1, 0], [3, 0]], 'Ø63')];
    expect(caplar(etiketleriAktar(e, [parca(1, [[0, 0], [3, 0]])], 1.5))).toEqual(['']);
  });

  it('L polyline: yeni parca KOSE yolunu izler, kirisini degil', () => {
    const e = [parca(1, [[0, 0], [50, 0]], 'Ø40'), parca(2, [[50, 0], [50, 50]], 'Ø40')];
    expect(caplar(etiketleriAktar(e, [parca(1, [[0, 0.4], [50.4, 0.4], [50.4, 50]])], 3))).toEqual(['Ø40']);
  });

  it('arama kutusunun KOSESI (pay\'dan uzak) aday sayilmaz — belirsizlik uretmez', () => {
    // Kisa yeni parca (4 ≤ 2·pay) → ornekler TAM x = 1, 2, 3. Farkli capli
    // kucuk parca x = 2,5, y = −2,99: iki ornegin kutusunda ama uzakligi
    // √(0,5² + 2,99²) ≈ 3,03 > pay 3. Aday sayilsaydi 2,9'daki Ø50'ye gore
    // "belirsiz" olurdu (3,03 ≤ 2,9 + 0,2·3) ve parca capsiz kalirdi.
    const e = [parca(1, [[0, 2.9], [4, 2.9]], 'Ø50'), parca(2, [[2.5, -2.99], [2.5, -2.995]], 'Ø63')];
    expect(caplar(etiketleriAktar(e, [parca(1, [[0, 0], [4, 0]])], 3))).toEqual(['Ø50']);
  });

  it('gecersiz pay (NaN, 0) 1 birime duser — aktarim yine calisir', () => {
    const e = [parca(1, [[0, 0], [100, 0]], 'Ø50')];
    const y = [parca(1, [[0, 0.3], [100, 0.3]])];
    expect([Number.NaN, 0].map((pay) => caplar(etiketleriAktar(e, y, pay)))).toEqual([['Ø50'], ['Ø50']]);
  });
});
