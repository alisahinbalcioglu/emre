/**
 * S2 (FE) — ONERI KUTUSU CEKINCEYI GOSTERIR, KESINLIK IDDIA ETMEZ
 *   cd frontend && npx vitest run ozellik/tablo/excel-grid/oneri-cekince.test.ts
 *
 * ── IKI KATMAN OLCULUR ─────────────────────────────────────────────────────
 * (1) KARAR: `oneri-cekince.ts` saf fonksiyonlari — cekinceli aday kesin
 *     sayilmaz, baslik onay tonuna doner, gerekce metne girer.
 * (2) KABLOLAMA: `ExcelGrid.tsx`'teki HER alternatif kutusu bu karari
 *     KULLANIR. Bu ikinci katman sart: karar dogru olup kutulardan yalniz
 *     birine baglanirsa davranis TUTARSIZ kalir — alternatifler iki ayri
 *     yerde ciziliyor (malzeme marka kutusu + iscilik firma kutusu).
 *
 * ── OLCUT NEDEN SATIR NUMARASI DEGIL ───────────────────────────────────────
 * Satir numarasi kanit degildir; kod bir satir kayinca olcut sessizce baska
 * bir seyi olcer. Kablolama olcutu YAPISAL: kaynakta `alternatives.map(`
 * ile acilan HER blok bulunur ve her birinin govdesi `cekinceSatiri`
 * cagirmak ZORUNDADIR.
 *
 * ── BOS KUME KAPILARI ──────────────────────────────────────────────────────
 * Kaynak tarayan olcutun en buyuk yalani "hicbir sey ayristiramadim → ihlal
 * yok → yesil"dir. Bu yuzden once bloklarin GERCEKTEN bulundugu (ve sayisinin
 * beklenen 2 oldugu) AYRI assert'lerle kanitlanir.
 *
 * jsdom KURULU DEGIL (vitest ortami node) — bilesen render edilmez.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  adayKesinMi, kutuOnayGerektirir, oneriBasligi, cekinceSatiri,
  type CekinceliOneri,
} from './oneri-cekince';

const KOK = path.resolve(__dirname, '../../..'); // frontend/
const gridKaynak = fs.readFileSync(path.join(KOK, 'ozellik/tablo/excel-grid/ExcelGrid.tsx'), 'utf-8');

/** `bas` indeksindeki acilis isaretinden baslayip esleseni bulur, ARASINI dondurur. */
function dengeliBlok(kaynak: string, bas: number, ac: string, kapa: string): string {
  let derinlik = 0;
  for (let i = bas; i < kaynak.length; i++) {
    if (kaynak[i] === ac) derinlik++;
    else if (kaynak[i] === kapa) {
      derinlik--;
      if (derinlik === 0) return kaynak.slice(bas, i + 1);
    }
  }
  return '';
}

/**
 * Kaynaktaki her CIZIM blogunun govdesi.
 * Desen `alternatives` degiskeni uzerinden okur; `result.alternatives.map(...)`
 * (backend cevabini ★ isaretiyle siralayan veri donusumu) CIZIM DEGILDIR ve
 * bilerek disarida birakilir — onun ciktisi zaten bu iki kutuya besleniyor.
 */
function alternatifBloklari(kaynak: string): string[] {
  const bloklar: string[] = [];
  const desen = /[^.\w]alternatives\.map\(/g;
  let m: RegExpExecArray | null;
  while ((m = desen.exec(kaynak)) !== null) {
    const parenBas = m.index + m[0].length - 1;
    const govde = dengeliBlok(kaynak, parenBas, '(', ')');
    if (govde) bloklar.push(govde);
  }
  return bloklar;
}

const KESIN: CekinceliOneri = {};
const CEKINCELI: CekinceliOneri = { uyariNot: '"paslanmaz" doğrulanamadı', bilinmeyen: ['paslanmaz'] };
const YALNIZ_KELIME: CekinceliOneri = { bilinmeyen: ['paslanmaz'] };

describe('S2-A karar: cekinceli aday kesin sayilmaz', () => {
  it('A1 cekincesiz aday KESIN', () => {
    expect(adayKesinMi(KESIN)).toBe(true);
  });
  it('A2 uyariNot tasiyan aday KESIN DEGIL', () => {
    expect(adayKesinMi(CEKINCELI)).toBe(false);
  });
  it('A3 yalniz bilinmeyen kelime tasiyan aday da KESIN DEGIL (sessiz kalmak kesinlik demektir)', () => {
    expect(adayKesinMi(YALNIZ_KELIME)).toBe(false);
  });
  it('A4 bos bilinmeyen dizisi cekince SAYILMAZ (bos kume yalanci kirmizi)', () => {
    expect(adayKesinMi({ bilinmeyen: [] })).toBe(true);
  });
});

describe('S2-B karar: kutu tonu', () => {
  it('B1 tum adaylar kesinse kutu onay ISTEMEZ', () => {
    expect(kutuOnayGerektirir([KESIN, KESIN])).toBe(false);
  });
  it('B2 TEK cekinceli aday bile kutuyu onaya dusurur', () => {
    expect(kutuOnayGerektirir([KESIN, CEKINCELI])).toBe(true);
  });
  it('B3 kesin kutunun basligi "var" der (marka)', () => {
    expect(oneriBasligi([KESIN], 'marka')).toContain('şu markalarda var');
  });
  it('B4 cekinceli kutunun basligi "var" DEMEZ (marka)', () => {
    expect(oneriBasligi([CEKINCELI], 'marka')).not.toContain('markalarda var');
  });
  it('B5 cekinceli kutunun basligi ONAY ister (marka)', () => {
    expect(oneriBasligi([CEKINCELI], 'marka')).toContain('onaylayın');
  });
  it('B6 kesin kutunun basligi "var" der (firma)', () => {
    expect(oneriBasligi([KESIN], 'firma')).toContain('şu firmalarda var');
  });
  it('B7 cekinceli kutunun basligi ONAY ister (firma)', () => {
    expect(oneriBasligi([CEKINCELI], 'firma')).toContain('onaylayın');
  });
});

describe('S2-C karar: gerekce metne girer', () => {
  it('C1 kesin adayin cekince satiri YOK', () => {
    expect(cekinceSatiri(KESIN)).toBeNull();
  });
  it('C2 cekince satiri motorun NEDENINI tasir', () => {
    expect(cekinceSatiri(CEKINCELI)).toContain('paslanmaz');
  });
  it('C3 cekince satiri ONAY istedigini soyler', () => {
    expect(cekinceSatiri(CEKINCELI)).toContain('onay gerekiyor');
  });
  it('C4 uyariNot yokken kelimelerden cumle kurulur', () => {
    expect(cekinceSatiri(YALNIZ_KELIME)).toContain('doğrulanamadı');
  });
});

describe('S2-D kablolama: HER alternatif kutusu karari kullanir', () => {
  const bloklar = alternatifBloklari(gridKaynak);

  it('D0 BOS KUME KAPISI: kaynakta alternatif cizim blogu BULUNDU', () => {
    expect(bloklar.length).toBeGreaterThan(0);
  });
  it('D0b BOS KUME KAPISI: iki ayri kutu var (malzeme + iscilik)', () => {
    expect(bloklar.length).toBe(2);
  });
  // ⚠ OLCUTU ONCE DOGRULA: ilk surumde bu assert yalniz "blokta cekinceSatiri
  // GECIYOR mu" diye bakiyordu. Gecici kapatma turunda ISCILIK kutusundan
  // cekince SATIRI silindi ve assert YESIL kaldi — cunku ayni fonksiyon
  // kenarlik rengi icin de cagriliyor. Yani olcut "gerekce kullaniciya
  // GORUNUYOR mu" sorusunu hic sormuyordu. Olcut JSX COCUGU arayacak sekilde
  // sertlestirildi: metin ekrana BASILMALI.
  it('D1 her alternatif blogu cekince metnini EKRANA BASAR', () => {
    const eksik = bloklar.filter((b) => !b.includes('>{cekinceSatiri(a)}<'));
    expect(eksik.length).toBe(0);
  });
  it('D2 baslik metni elle yazilmaz — oneriBasligi kutu sayisi kadar cagrilir', () => {
    const sayi = (gridKaynak.match(/oneriBasligi\(/g) ?? []).length;
    expect(sayi).toBe(bloklar.length);
  });
  it('D3 eski KESINLIK basligi kaynakta KALMADI (marka)', () => {
    expect(gridKaynak).not.toContain('şu markalarda var:');
  });
  it('D4 eski KESINLIK basligi kaynakta KALMADI (firma)', () => {
    expect(gridKaynak).not.toContain('şu firmalarda var:');
  });
});
