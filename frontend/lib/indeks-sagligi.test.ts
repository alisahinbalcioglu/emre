/**
 * IS1 — BAGSIZLIK ROZETI (04.08.2026)
 *
 * OLCULEN KUSUR: backend `indexHealth()` iki sayi uretiyor ({ bayat, indekssiz }),
 * frontend ikisini de CEKIYOR (quotes/new/page.tsx:408) ama ekrana YALNIZ `bayat`
 * ciziliyordu (:1610 kosulu `indexHealth.bayat > 0`). Kullanicinin markasinin
 * TAMAMI indekssiz olsa bile ekranda hicbir uyari yoktu — teshis turunu kor
 * birakan sey tam olarak buydu.
 *
 * Kriterler AYRI it bloklarinda (bir assert tek kritere — KE17/KF7 dersi):
 *   T1 — {bayat:0, indekssiz:5} → indekssiz uyarisi GORUNMELI   (fix oncesi KIRMIZI)
 *   T2 — {bayat:3, indekssiz:0} → bayat uyarisi GORUNMELI       (regresyon kalkani)
 *   T3 — {bayat:0, indekssiz:0} → hicbir uyari GORUNMEMELI      (yalanci pozitif kalkani)
 *   T4 — IKI AILE: {bayat:3, indekssiz:5} → IKI uyari birden     (genellik kaniti)
 *
 * Not (bos kume yalanci yesil yasagi): sayim/filtre uzerinden assert edilen her
 * yerde once uzunluk sabitlenir, sonra alan okunur. `.every()`/`toEqual([])`
 * tek basina hicbir sey olcmez.
 */
import { describe, it, expect } from 'vitest';
import { indeksUyarilari } from './indeks-sagligi';

describe('IS1 — indeks sagligi rozetleri', () => {
  it('T1: indekssiz satir varken (bayat=0) BAGSIZLIK uyarisi cizilir', () => {
    const uyarilar = indeksUyarilari({ bayat: 0, indekssiz: 5 });

    // Bos kume kalkani: once uzunluk, sonra icerik.
    expect(uyarilar).toHaveLength(1);
    const u = uyarilar[0];
    expect(u.tur).toBe('indekssiz');
    expect(u.sayi).toBe(5);
    // Yanlis sayidan bahseden rozet zarardir: sayi metne birebir girmeli.
    expect(u.etiket).toContain('5');
    expect(u.baslik).toContain('5');
  });

  it('T2: bayat satir varken (indekssiz=0) MEVCUT bayat uyarisi bozulmadan cizilir', () => {
    const uyarilar = indeksUyarilari({ bayat: 3, indekssiz: 0 });

    expect(uyarilar).toHaveLength(1);
    const u = uyarilar[0];
    expect(u.tur).toBe('bayat');
    expect(u.sayi).toBe(3);
    // 18.07'den beri ekranda duran metin — degismedigi burada mühürlenir.
    expect(u.etiket).toBe('⚠ 3 satır eski indeks');
    expect(u.baslik).toContain('eski indeks sürümünde');
  });

  it('T3: her ikisi de 0 iken HICBIR uyari cizilmez', () => {
    const girdi = { bayat: 0, indekssiz: 0 };
    // Girdi dejenere degil: iki alan da tanimli ve sayi (0 "veri yok" degil).
    expect(typeof girdi.bayat).toBe('number');
    expect(typeof girdi.indekssiz).toBe('number');

    expect(indeksUyarilari(girdi)).toHaveLength(0);
  });

  it('T4: IKI AILE — bayat ve indekssiz ayni anda varken IKISI DE cizilir', () => {
    const uyarilar = indeksUyarilari({ bayat: 3, indekssiz: 5 });

    expect(uyarilar).toHaveLength(2);
    const turler = uyarilar.map((u) => u.tur);
    expect(turler).toContain('bayat');
    expect(turler).toContain('indekssiz');
    // Sayilar karismamali (rozet yanlis sayi soylerse zarardir).
    expect(uyarilar.find((u) => u.tur === 'bayat')!.sayi).toBe(3);
    expect(uyarilar.find((u) => u.tur === 'indekssiz')!.sayi).toBe(5);
  });

  it('T5: saglik verisi henuz gelmediyse (null) uyari uretilmez', () => {
    expect(indeksUyarilari(null)).toHaveLength(0);
    expect(indeksUyarilari(undefined)).toHaveLength(0);
  });
});
