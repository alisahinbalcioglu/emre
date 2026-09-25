import { describe, expect, it } from 'vitest';
import type { EdgeSegment } from '../dwg-metraj/types';
import {
  capAra,
  capGruplari,
  capIlerlemesi,
  capSatirlari,
  gezinmeKonumu,
  malzemeGrubu,
  nominalCap,
  sonrakiParca,
} from './cap-gruplari';

describe('malzemeGrubu — teklifle ayni ayristirici (cap + cins)', () => {
  it('tasarimdaki ornekler dogru gruba duser', () => {
    expect(malzemeGrubu('Ø110 PVC BORU')).toBe('PVC');
    expect(malzemeGrubu('Ø125 HDPE BORU')).toBe('HDPE');
    expect(malzemeGrubu('DN100 HDPE BORU')).toBe('HDPE');
    expect(malzemeGrubu('PPR-C DN25')).toBe('PPR-C');
    expect(malzemeGrubu('1" SİYAH BORU')).toBe('Çelik / siyah boru');
    expect(malzemeGrubu('2" ÇELİK BORU')).toBe('Çelik / siyah boru');
    expect(malzemeGrubu('DN25 SİYAH BORU')).toBe('Çelik / siyah boru');
  });

  it('cinsi olmayan ya da taninmayan cap "Diğer"', () => {
    expect(malzemeGrubu('Ø50')).toBe('Diğer');
    expect(malzemeGrubu('Ø40 PİK BORU')).toBe('Diğer');
  });

  it('nominal cap cinsten ayrilarak okunur (siralama olcusu)', () => {
    expect(nominalCap('Ø110 PVC BORU')).toBe(110);
    expect(nominalCap('1" SİYAH BORU')).toBe(25);
    expect(nominalCap('PPR-C DN25')).toBe(25);
    expect(nominalCap('KANAL')).toBeNull();
  });
});

function parca(id: number, cap: string, length: number): EdgeSegment {
  return { segment_id: id, layer: 'a-yağmur', diameter: cap, length, coords: [0, 0, 1, 0] };
}

describe('capSatirlari — kalemler ∪ layer\'daki caplar', () => {
  const kalemler = [
    { id: 'k1', diameter: 'Ø160 PVC BORU' },
    { id: 'k2', diameter: 'Ø50 PVC BORU' },
    { id: 'k3', diameter: '1" SİYAH BORU' },
    { id: 'k4', diameter: 'Ø63 PVC BORU' },
  ];
  const segmentler = [
    parca(1, 'Ø50 PVC BORU', 13),
    parca(2, 'Ø50 PVC BORU', 13),
    parca(3, 'Ø110 PVC BORU', 16.8), // kalemi silinmis cap
    parca(4, '', 40),
  ];

  it('metraj ve parca sayisi secili layer\'dan; kalemsiz cap da satir olur', () => {
    const s = capSatirlari(kalemler, segmentler);
    const bul = (cap: string) => s.find((x) => x.cap === cap);
    expect(bul('Ø50 PVC BORU')).toMatchObject({ metre: 26, parca: 2, kalemId: 'k2', grup: 'PVC' });
    expect(bul('Ø63 PVC BORU')).toMatchObject({ metre: 0, parca: 0, kalemId: 'k4' });
    expect(bul('Ø110 PVC BORU')).toMatchObject({ metre: 16.8, parca: 1, kalemId: null });
  });

  it('grup sirasi PVC → HDPE → PPR-C → Çelik → Diğer; grup icinde nominal capa gore', () => {
    expect(capSatirlari(kalemler, segmentler).map((x) => x.cap)).toEqual([
      'Ø50 PVC BORU', 'Ø63 PVC BORU', 'Ø110 PVC BORU', 'Ø160 PVC BORU', '1" SİYAH BORU',
    ]);
  });

  it('capsiz parca satir uretmez; ayni kanonik cap tek satir', () => {
    const s = capSatirlari([{ id: 'a', diameter: '1 1/4"' }, { id: 'b', diameter: '1¼"' }], [parca(1, '1¼"', 3)]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ cap: '1¼"', parca: 1, kalemId: 'a' });
  });

  it('PARCADAKI kanonik olmayan cap metni (1 1/4") kalemin satirina sayilir — ayri satir acmaz', () => {
    const s = capSatirlari([{ id: 'a', diameter: '1¼"' }], [parca(1, '1 1/4"', 3)]);
    expect(s.map((x) => [x.cap, x.parca, x.kalemId])).toEqual([['1¼"', 1, 'a']]);
  });

  it('grup icinde nominal capi okunamayan satir SONA duser (giris sirasi ne olursa olsun)', () => {
    // Iki sira: siralama karsilastiricisi okunamayan satiri hem `a` hem `b`
    // tarafinda gormeli (tek sirada dal hic calismiyordu — mutasyon olcumu).
    const kalem = (id: string, diameter: string) => ({ id, diameter });
    const siralar = [
      [kalem('a', 'PVC BORU'), kalem('b', 'Ø110 PVC BORU'), kalem('c', 'Ø50 PVC BORU')],
      [kalem('b', 'Ø110 PVC BORU'), kalem('c', 'Ø50 PVC BORU'), kalem('a', 'PVC BORU')],
    ];
    expect(siralar.map((k) => capSatirlari(k, []).map((x) => x.cap))).toEqual([
      ['Ø50 PVC BORU', 'Ø110 PVC BORU', 'PVC BORU'],
      ['Ø50 PVC BORU', 'Ø110 PVC BORU', 'PVC BORU'],
    ]);
  });
});

describe('capGruplari', () => {
  it('karisik gruplar basliklarla ayrilir', () => {
    const s = capSatirlari([{ id: '1', diameter: 'Ø50 PVC BORU' }, { id: '2', diameter: 'PPR-C DN25' }], []);
    expect(capGruplari(s).map((g) => g.grup)).toEqual(['PVC', 'PPR-C']);
  });

  it('hepsi "Diğer"se baslik YOK (tek, basliksiz grup)', () => {
    const s = capSatirlari([{ id: '1', diameter: 'Ø50' }, { id: '2', diameter: 'Ø32' }], []);
    expect(capGruplari(s)).toEqual([{ grup: null, satirlar: s }]);
  });

  it('bos liste bos grup', () => {
    expect(capGruplari([])).toEqual([]);
  });
});

describe('capAra', () => {
  it('Turkce katlamali arama', () => {
    const s = capSatirlari([{ id: '1', diameter: '1" SİYAH BORU' }, { id: '2', diameter: 'Ø50 PVC BORU' }], []);
    expect(capAra(s, 'siyah').map((x) => x.cap)).toEqual(['1" SİYAH BORU']);
    expect(capAra(s, '  ')).toHaveLength(2);
  });
});

describe('capIlerlemesi — "Çap verilen parçalar 7 / 16"', () => {
  it('capli / capsiz sayisi ve metresi', () => {
    const r = capIlerlemesi([parca(1, 'Ø50', 10), parca(2, '', 5.5), parca(3, 'Belirtilmemis', 2)]);
    expect(r).toEqual({ toplam: 3, capli: 1, capsiz: 2, toplamMetre: 17.5, capsizMetre: 7.5 });
  });
});

describe('gezinme — odak parca NUMARASIYLA (25.09 inceleme)', () => {
  it('ilk basista en kucuk numarali parca', () => {
    expect(sonrakiParca([12, 40, 55], null)).toBe(12);
  });

  it('odak listedeyse bir sonraki; sonda basa doner', () => {
    expect([sonrakiParca([12, 40, 55], 40), sonrakiParca([12, 40, 55], 55)]).toEqual([55, 12]);
  });

  it('odak etiketlenip listeden ciktiysa tur ondan buyuk ilk parcadan surer', () => {
    expect(sonrakiParca([12, 55], 40)).toBe(55);
  });

  it('odaktan buyuk parca kalmadiysa basa doner', () => {
    expect(sonrakiParca([12, 40], 55)).toBe(12);
  });

  it('bos liste null', () => {
    expect(sonrakiParca([], 7)).toBeNull();
  });

  it('konum: odak listedeyse sira ve toplam', () => {
    expect(gezinmeKonumu([12, 40, 55], 40)).toEqual({ sira: 1, toplam: 3 });
  });

  it('konum: odak listeden ciktiysa gosterilmez', () => {
    expect(gezinmeKonumu([12, 55], 40)).toBeNull();
  });

  it('ESKI davranis (indeks) baska parcaya ziplardi — kriteri ihlal eder', () => {
    // Odak 40 (indeks 1); kullanici 12'yi etiketledi → liste [40, 55].
    const liste = [40, 55];
    const eskiOdak = liste[Math.min(1, liste.length - 1)];
    expect(eskiOdak).toBe(55);
  });
});
