/**
 * SAYI OKUMA — TEK PARSE, IKI KATMAN (28.08.2026)
 *
 * Kaynak vaka (E2E'de olculdu): kullanici teklif gridinde Malz. Birim Fiyat
 * hucresine TR klavyeyle "1875,5" yazdi.
 *   · satir toplami DOGRU hesaplandi  → 286 × 1875,5 = ₺536.393
 *   · birim fiyat hucresi ise         → ₺1.875,00 gosterdi
 * Yani ekranda CARPIMI TUTMAYAN iki sayi duruyordu. Sebep: biçimlendirici
 * kendi `parseFloat(String(v))` kopyasini tasiyordu ve parseFloat VIRGULDE
 * KESER. Bu, `sayi-alani.ts`in dogdugu "ekran ≠ kayit" kusurunun GOSTERIM
 * ikiziydi — o zaman kayit yolu duzeltilmis, gosterim yolu atlanmisti.
 *
 * Bu dosya iki katmani da kilitler:
 *   sayiOku   → ayristirma (virgul cozulur, ISARET KORUNUR, cop → null)
 *   sayiAlani → kelepce   (negatif/gecersiz → 0)
 * Kelepcenin biçimlendiriciye UYMADIGI da burada yazilidir: negatifi 0
 * gostermek KAR satirindaki zarari gizlerdi.
 */
import { describe, it, expect } from 'vitest';
import { sayiOku, sayiAlani } from './sayi-alani';

describe('sayiOku — ayristirma katmani', () => {
  it('★ TR klavye virgullu ondalik cozulur (canli vakanin ta kendisi)', () => {
    expect(sayiOku('1875,5')).toBe(1875.5);   // parseFloat 1875 verirdi
    expect(sayiOku('12,5')).toBe(12.5);
    expect(sayiOku('0,1')).toBeCloseTo(0.1, 10);
  });

  it('nokta ondalik ve duz sayi da calisir (yapistirma yolu nokta yazar)', () => {
    expect(sayiOku('53.3')).toBe(53.3);
    expect(sayiOku('600')).toBe(600);
    expect(sayiOku(1875.5)).toBe(1875.5);
  });

  it('★ ISARET KORUNUR — kelepce BURADA YOK (KAR satiri zarar yazabilir)', () => {
    expect(sayiOku('-250,75')).toBe(-250.75);
    expect(sayiOku(-3)).toBe(-3);
  });

  it('sayi olmayan girdi null — "0" ile KARISTIRILAMAZ', () => {
    expect(sayiOku('')).toBeNull();
    expect(sayiOku('   ')).toBeNull();
    expect(sayiOku(null)).toBeNull();
    expect(sayiOku(undefined)).toBeNull();
    expect(sayiOku('mt')).toBeNull();
    expect(sayiOku(NaN)).toBeNull();
    expect(sayiOku(Infinity)).toBeNull();
    // ⚠ 0 GECERLI bir sayidir; null degildir (bos hucre ile sifir ayni sey degil)
    expect(sayiOku('0')).toBe(0);
    expect(sayiOku(0)).toBe(0);
  });
});

describe('sayiAlani — kelepce katmani (sozlesme DEGISMEDI)', () => {
  it('negatif ve gecersiz 0 olur, gecerli deger aynen gecer', () => {
    expect(sayiAlani('-5')).toBe(0);
    expect(sayiAlani('mt')).toBe(0);
    expect(sayiAlani('')).toBe(0);
    expect(sayiAlani(NaN)).toBe(0);
    expect(sayiAlani('12,5')).toBe(12.5);
    expect(sayiAlani('50')).toBe(50);   // "x || 0" olsaydi "50" STRING donerdi
  });

  it('★ IKI KATMAN AYRISAMAZ: sayiAlani, sayiOku uzerine kelepcedir', () => {
    for (const g of ['1875,5', '53.3', '0', '600', 'mt', '', '-250,75', NaN, null]) {
      const ham = sayiOku(g);
      const beklenen = ham === null || ham < 0 ? 0 : ham;
      expect(sayiAlani(g), `girdi: ${JSON.stringify(g)}`).toBe(beklenen);
    }
  });
});
