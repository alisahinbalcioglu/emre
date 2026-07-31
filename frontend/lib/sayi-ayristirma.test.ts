/**
 * PK6 — `num()` TARAMASI (31.07.2026)
 *
 * Pano kalem 38: `num()`in TR binlik sezgisi MAKINE degerlerini bozuyordu
 * ("323308.125" → 323 milyon). `985c0e1` payload icin `numHam()` ayirdi ama
 * TARAMA YAPILMADI — "ayni bug sinifi baska hatlarda duruyor olabilir".
 *
 * Bu dosya taramanin kilididir. Iki AYRI kriter, iki AYRI assert:
 *   PK6a — DAVRANIS: makine degeri numHam ile bozulmaz, num ile bozulur.
 *   PK6b — KAYNAK  : verify.mjs'te hicbir payload alani `num()` ile okunamaz.
 *
 * (Bir assert birden fazla kritere sayilamaz — 31.07 KE17/KF7 dersi.)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { num, numHam, PAYLOAD_ALANLARI } from '../e2e-golden/sayi-ayristirma.mjs';

describe('PK6a — makine degeri vs insan yazimi (DAVRANIS)', () => {
  it('numHam makine degerini BOZMAZ', () => {
    // 31.07'de 3 FAIL ureten birebir degerler
    expect(numHam('323308.125')).toBe(323308.125);
    expect(numHam('134534.40000000002')).toBeCloseTo(134534.4, 6);
    expect(numHam('35.240')).toBeCloseTo(35.24, 6);
    expect(numHam('50.000')).toBeCloseTo(50.0, 6);
    expect(numHam(323308.125)).toBe(323308.125);
  });

  it('numHam kullanici bicimini (virgullu) dogru cozer', () => {
    expect(numHam('1.234,56')).toBeCloseTo(1234.56, 6);
    expect(numHam('52,4')).toBeCloseTo(52.4, 6);
  });

  it('numHam SAYI OLMAYAN metni sayiya cevirmez (hayalet kayip yasagi)', () => {
    // 03-bursa Elektrik: `_matBirim` urun tarifi tasiyor
    expect(numHam('35x240mm Üç bölmeli döşeme kanalı')).toBeNull();
    expect(numHam('')).toBeNull();
  });

  it('num INSAN yazimini dogru cozer — ama makine degerini BOZAR (belgelenmis fark)', () => {
    expect(num('1.234')).toBe(1234); // insan: bin iki yuz otuz dort ✓
    // Ayni girdi makine degeri olsaydi 323308.125 olmaliydi:
    expect(num('323308.125')).toBe(323308125); // ← iste bu yuzden ayrildi
  });
});

describe('PK6b — payload alanlari num() ile okunamaz (KAYNAK TARAMASI)', () => {
  const kaynak = fs.readFileSync(
    path.resolve(__dirname, '../e2e-golden/verify.mjs'), 'utf-8',
  );

  it('verify.mjs hicbir payload alanini num() ile okumaz', () => {
    const ihlaller: string[] = [];
    kaynak.split('\n').forEach((satir, i) => {
      const kod = satir.split('//')[0]; // yorum satirlari sayilmaz
      // `numHam(` eslesmesin — yalniz ciplak `num(`
      if (!/(^|[^a-zA-Z])num\s*\(/.test(kod)) return;

      // (a) ACIK alan adi: num(r._matToplam)
      for (const alan of PAYLOAD_ALANLARI as string[]) {
        if (kod.includes(alan)) ihlaller.push(`verify.mjs:${i + 1} → num(...${alan}...)`);
      }
      // (b) DINAMIK alan erisimi: num(row?.[f]) — alan adi DONGU degiskeninde,
      //     bu satirda gorunmez, (a) bunu KACIRIR (ilk kosumda :514 tam olarak
      //     boyle kacti). Olcut: indeksli erisim + YAKIN baglamda (onceki 3
      //     satir) payload alan adi. Regex eslesmeleri (`m[1]`) insan metnidir
      //     ve yakininda payload alani bulunmaz → yanlis alarm vermez.
      const indeksliErisim = /(^|[^a-zA-Z])num\s*\(\s*[A-Za-z_$][\w$]*\s*\??\.?\[/.test(kod);
      if (indeksliErisim) {
        const yakinBaglam = kaynak.split('\n').slice(Math.max(0, i - 3), i + 1).join('\n');
        const gorulen = (PAYLOAD_ALANLARI as string[]).filter((a) => yakinBaglam.includes(a));
        if (gorulen.length) {
          ihlaller.push(`verify.mjs:${i + 1} → num(<dinamik payload alani: ${gorulen.slice(0, 3).join(', ')}>)`);
        }
      }
    });
    expect(ihlaller, `payload alani num() ile okunuyor:\n${ihlaller.join('\n')}`).toEqual([]);
  });
});
