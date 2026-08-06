/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ADIM 7 KAPISI — TEK SAYFA-TOPLAM FONKSIYONU (Kar Analizi onkosul turu)
 *
 *  KORUNAN SOZLESME:
 *   1. Sayfa toplami TEK fonksiyondan cikar (sayfaToplamlari) — satir kanonigi
 *      (hesaplaSatisBirimFiyat + hesaplaSatirToplam) ile AYNI sayiyi uretir.
 *   2. KAR ayni cagridan MALIYET ile SATISIN FARKI olarak dogar — kar icin
 *      ikinci bir aritmetik yeri ACILMAZ (KE27).
 *   3. Toplam Kar = Malzeme Kari + Iscilik Kari — kurusu kurusuna (KE26).
 *   4. Kar %0 + fiyatlar dolu → kar 0 (KE14; "%0 maliyettir").
 *   5. Malzeme %20 / iscilik %10 birbirine KARISMAZ (KE15).
 *   6. Bos fiyat ≠ sifir kar: fiyatsiz satir SAYILIR, kara girmez (KE29).
 *   7. Sayfalarin toplami = birlesik listenin toplami (KE30'un FE yarisi —
 *      Icmal, sayfalarin toplamidir).
 *   8. _ozet satirlari toplama girmez (30.07 karari — cift sayim yasagi).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest';
import {
  sayfaToplamlari, hesaplaSatisBirimFiyat, hesaplaSatirToplam,
} from '../ozellik/fiyat/pricing';

const ROLLER = {
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
  quantityField: '_miktar', unitField: '_birim',
};

/** Kanonik ciftle FIYATLANMIS satir uretir — hucrelere ekranin yazdigi neyse o yazilir. */
function satir(net: { mat?: number; lab?: number }, kar: { mat?: number; lab?: number }, miktar: number) {
  const r: any = { _isDataRow: true, _miktar: miktar, _birim: 'Ad.' };
  if (net.mat !== undefined) {
    const satis = hesaplaSatisBirimFiyat(net.mat, kar.mat ?? 0);
    r._matNetPrice = net.mat; r._malzKar = kar.mat ?? 0;
    r._matBirim = satis; r._matToplam = hesaplaSatirToplam(satis, miktar);
  }
  if (net.lab !== undefined) {
    const satis = hesaplaSatisBirimFiyat(net.lab, kar.lab ?? 0);
    r._labNetPrice = net.lab; r._iscKar = kar.lab ?? 0;
    r._labBirim = satis; r._labToplam = hesaplaSatirToplam(satis, miktar);
  }
  return r;
}

describe('ADIM 7 — sayfaToplamlari', () => {
  it('satir kanonigi ile AYNI sayi: 2 satirlik sayfa elle hesapla birebir', () => {
    // net 100, %20, 3 adet → satis 120, toplam 360 · net 200, %10, 2 adet → 220, 440
    const rows = [satir({ mat: 100 }, { mat: 20 }, 3), satir({ mat: 200 }, { mat: 10 }, 2)];
    const o = sayfaToplamlari(rows, ROLLER);
    expect(o.matToplam).toBe(360 + 440);
    // maliyet = satis@%0 = yuvarla(net)×miktar → 300 + 400
    expect(o.matMaliyet).toBe(300 + 400);
    expect(o.matKar).toBe(60 + 40);
  });

  it('KE15: malzeme %20 / iscilik %10 KARISMAZ — iki taraf bagimsiz', () => {
    const rows = [satir({ mat: 100, lab: 50 }, { mat: 20, lab: 10 }, 4)];
    const o = sayfaToplamlari(rows, ROLLER);
    expect(o.matKar).toBe((120 - 100) * 4);  // %20 yalniz malzemede
    expect(o.labKar).toBe((55 - 50) * 4);    // %10 yalniz iscilikte
  });

  it('KE26: Toplam Kar = Malzeme Kari + Iscilik Kari — kurusu kurusuna', () => {
    const rows = [
      satir({ mat: 105.86, lab: 47.3 }, { mat: 20, lab: 10 }, 78),
      satir({ mat: 291.2 }, { mat: 15 }, 120),
      satir({ lab: 137.65 }, { lab: 5 }, 12),
    ];
    const o = sayfaToplamlari(rows, ROLLER);
    expect(o.toplamKar).toBe(o.matKar + o.labKar);
    expect(o.genelToplam).toBe(o.matToplam + o.labToplam);
  });

  it('KE14: butun yuzdeler 0 ve fiyatlar dolu iken kar tam 0', () => {
    const rows = [satir({ mat: 105.9, lab: 47.3 }, {}, 7), satir({ mat: 8.4 }, {}, 116)];
    const o = sayfaToplamlari(rows, ROLLER);
    expect(o.matToplam).toBeGreaterThan(0);
    expect(o.matKar).toBe(0);
    expect(o.labKar).toBe(0);
    expect(o.toplamKar).toBe(0);
  });

  it('KE29: bos fiyat SIFIR KAR DEGIL — fiyatsiz sayilir, kara girmez', () => {
    const fiyatsiz: any = { _isDataRow: true, _miktar: 5, _birim: 'Ad.', _matBirim: '', _matToplam: '', _labBirim: '', _labToplam: '' };
    const rows = [fiyatsiz, satir({ lab: 100 }, { lab: 10 }, 2)];
    const o = sayfaToplamlari(rows, ROLLER);
    expect(o.matFiyatsiz).toBe(2);      // fiyatsiz satirin IKI tarafi da bos + ikinci satirin malzemesi yok
    expect(o.matFiyatli).toBe(0);
    expect(o.labFiyatli).toBe(1);
    expect(o.labFiyatsiz).toBe(1);
    expect(o.matKar).toBe(0);           // "0 kar" degil "hic malzeme fiyati yok" — sayacla birlikte okunur
    expect(o.labKar).toBe((110 - 100) * 2);
  });

  it('KE30 (FE yarisi): sayfalarin toplami = birlesik listenin toplami (Icmal kurali)', () => {
    // Karsilastirma KURUS duzeyinde — iddianin birimi bu ("kurusu kurusuna").
    // Ham float esitligi gruplamaya duyarlidir (IEEE754: a/100+b/100 ≠ (a+b)/100
    // son bitte); kurus-tamsayi karsilastirmasi ise SIRADAN BAGIMSIZ ve kesindir.
    // Ilk kosum tam bunu yakaladi — fonksiyon kurus-tamsayi biriktirmeye gecti.
    const kurus = (v: number) => Math.round(v * 100);
    const sayfa1 = [satir({ mat: 100 }, { mat: 20 }, 3), satir({ lab: 50 }, { lab: 10 }, 6)];
    const sayfa2 = [satir({ mat: 291.2, lab: 137.65 }, { mat: 15, lab: 5 }, 12)];
    const o1 = sayfaToplamlari(sayfa1, ROLLER);
    const o2 = sayfaToplamlari(sayfa2, ROLLER);
    const hepsi = sayfaToplamlari([...sayfa1, ...sayfa2], ROLLER);
    expect(kurus(hepsi.toplamKar)).toBe(kurus(o1.toplamKar) + kurus(o2.toplamKar));
    expect(kurus(hepsi.genelToplam)).toBe(kurus(o1.genelToplam) + kurus(o2.genelToplam));
    expect(kurus(hepsi.matKar)).toBe(kurus(o1.matKar) + kurus(o2.matKar));
  });

  it('_ozet satiri toplama GIRMEZ (30.07 — Icmal cift sayim yasagi)', () => {
    const normal = satir({ mat: 100 }, { mat: 20 }, 3);
    const ozet = { ...satir({ mat: 999999 }, { mat: 20 }, 1), _ozet: true };
    const o = sayfaToplamlari([normal, ozet], ROLLER);
    expect(o.matToplam).toBe(360);
  });

  it('dosyadan gelen toplam USTUNDUR: toplam hucresi doluysa o okunur', () => {
    // Onceden-fiyatli satir: birim bos, toplam dosyadan (270850), kar 0.
    const r: any = { _isDataRow: true, _miktar: 1, _labToplam: '270850', _iscKar: 0 };
    const o = sayfaToplamlari([r], ROLLER);
    expect(o.labToplam).toBe(270850);
    expect(o.labKar).toBe(0); // %0 → maliyet = satis, kar 0
  });
});
