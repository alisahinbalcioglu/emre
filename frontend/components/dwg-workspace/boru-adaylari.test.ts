import { describe, expect, it } from 'vitest';
import { boruAdayiMi, boruAdaylari, katmanlariSuz, turkceKatla, type KatmanOzeti } from './boru-adaylari';

describe('turkceKatla', () => {
  it('tr-TR kucultur ve aksani katlar', () => {
    expect(turkceKatla('A PİSSU KOLON')).toBe('a pissu kolon');
    expect(turkceKatla('YAĞMUR')).toBe('yagmur');
    expect(turkceKatla('ISITMA')).toBe('isitma'); // "I" → "ı" → "i"
    expect(turkceKatla('Çelik Şebeke Ölçü Ün')).toBe('celik sebeke olcu un');
  });

  it('UTF-8 → Latin-1 bozulmasini onarir (LibreDWG: "SPRÄ°NK")', () => {
    expect(turkceKatla('SPRÄ°NK')).toBe('sprink');
    expect(turkceKatla('YAÄžMUR')).toBe('yagmur');
    expect(turkceKatla('TESÄ°SAT')).toBe('tesisat');
  });

  it('cp1254 → cp1252 bozulmasini onarir ("PÝS", "YAÐMUR", "ÞEBEKE")', () => {
    expect(turkceKatla('PÝS SU')).toBe('pis su');
    expect(turkceKatla('YAÐMUR')).toBe('yagmur');
    expect(turkceKatla('ÞEBEKE')).toBe('sebeke');
  });
});

describe('boruAdayiMi — tasarimin anahtarlari', () => {
  it('pis, temiz, yağmur, boru, hdpe, pvc, ppr, tesisat', () => {
    for (const ad of ['a-pis su', 'A-TEMİZ SU', 'a-yağmur', 'BORULAR', 'HDPE-100', 'pvc atık', 'PPR-C', 'TESİSAT']) {
      expect(boruAdayiMi(ad), ad).toBe(true);
    }
  });

  it('bozuk kodlamali adlar da taninir', () => {
    expect(boruAdayiMi('YAÄžMUR')).toBe(true);
    expect(boruAdayiMi('PÝS SU')).toBe(true);
  });

  it('mimari katmanlar aday degil', () => {
    for (const ad of ['DUVAR', 'MOBİLYA', 'AKS', 'YAZI', 'PARSEL', 'a_yangın sprinkler']) {
      expect(boruAdayiMi(ad), ad).toBe(false);
    }
  });
});

const k = (ad: string, cizgi: number): KatmanOzeti => ({ ad, renk: '#000', cizgi });

describe('boruAdaylari — cip listesi', () => {
  it('cizgisi olmayan (yazi/sembol) aday elenir; cok cizgiliden aza, sinirli', () => {
    const liste = [k('a-pis su', 842), k('a-yağmur', 1284), k('TEMİZ SU YAZI', 0), k('DUVAR', 12480), k('a-temiz su', 615)];
    expect(boruAdaylari(liste).map((x) => x.ad)).toEqual(['a-yağmur', 'a-pis su', 'a-temiz su']);
    expect(boruAdaylari(liste, 2)).toHaveLength(2);
  });
});

describe('katmanlariSuz — Katmanlar paneli', () => {
  const liste = [k('YAZI', 3210), k('a-yağmur', 1284), k('DUVAR', 12480), k('MOBİLYA', 5702)];
  const gizli = new Set(['MOBİLYA', 'YAZI']);

  it('Tümü: ada gore Turkce sirali', () => {
    expect(katmanlariSuz(liste, '', 'tumu', gizli).map((x) => x.ad)).toEqual(['a-yağmur', 'DUVAR', 'MOBİLYA', 'YAZI']);
  });

  it('Görünen / Gizli süzgeci', () => {
    expect(katmanlariSuz(liste, '', 'gorunen', gizli).map((x) => x.ad)).toEqual(['a-yağmur', 'DUVAR']);
    expect(katmanlariSuz(liste, '', 'gizli', gizli).map((x) => x.ad)).toEqual(['MOBİLYA', 'YAZI']);
  });

  it('arama Turkce katlamali ("yagmur" → "a-yağmur", "mobilya" → "MOBİLYA")', () => {
    expect(katmanlariSuz(liste, 'yagmur', 'tumu', gizli).map((x) => x.ad)).toEqual(['a-yağmur']);
    expect(katmanlariSuz(liste, 'mobilya', 'tumu', gizli).map((x) => x.ad)).toEqual(['MOBİLYA']);
  });
});
