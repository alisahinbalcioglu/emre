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
import * as fs from 'fs';
import * as path from 'path';
import {
  sayfaToplamlari, hesaplaSatisBirimFiyat, hesaplaSatirToplam, kalemToplami, satirGenelToplamiGosterim, kurusTamsayi,
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

// ═════════════════════════════════════════════════════════════════════════════
// TUR 3 (14.09.2026) — A4a (G4/K11) ve A4b (Orta-2): EKRAN = CIKTI, KURUSU KURUSUNA
//  A4a: kalem toplami (malzeme + iscilik) KURUS katmaninda; ikinci kez yukari
//       1 haneye yuvarlanmaz. Bursa: 41 kalem +2,42 TL (satir hucreleri ve kayit
//       295.272.924,70; ekran, cikti ve ICMAL 295.272.922,28).
//  A4b: dovizde ekran toplami SATIR SATIR cevrilir (cikti motoru standart-cikti
//       kurus() ile ayni sira). Eski ekran TL toplamini tek seferde ceviriyordu:
//       13 dosyanin 147 sayfa toplaminda USD 25, EUR 31 fark (en cok 16 sent).
//  Kaynak taramasi: ExcelGrid'in AG-Grid'e bagli yollari jsdom'suz kosamaz
//  (kar-tek-suzgec.test.ts deseni); kural saf fonksiyonlarda, bagli olduklari
//  kaynaktan olculur.
// ═════════════════════════════════════════════════════════════════════════════
describe('A4b / Orta-2 — dovizde sayfa toplami satir satir cevrilir', () => {
  const USD = 1 / 47.35; // use-currency: TRY taban, 1 USD = ₺47,35
  const uc = (ek: Record<string, unknown> = {}) =>
    [1, 2, 3].map(() => ({ _isDataRow: true, _miktar: 1, _birim: 'Ad.', _matBirim: '100', _matToplam: '100', ...ek }));

  it('3 × ₺100 → $6,33 (her satir K(100/47,35) = 2,11); eski tek seferde cevirme $6,34 derdi', () => {
    const o = sayfaToplamlari(uc(), ROLLER, USD);
    expect(o.matToplam).toBe(6.33);
    expect(o.genelToplam).toBe(6.33);
    // olcutun kendisi: bu fixture iki kurali GERCEKTEN ayirir
    expect(kurusTamsayi(sayfaToplamlari(uc(), ROLLER).matToplam * USD) / 100).toBe(6.34);
  });

  it('oran 1 (TRY) kimliktir: oransiz cagriyla birebir ayni ozet', () => {
    const satirlar = [...uc({ _malzKar: 10, _matNetPrice: 90.9 }), { _isDataRow: true, _miktar: 2, _labBirim: '10.075', _labToplam: '20.15' }];
    expect(sayfaToplamlari(satirlar, ROLLER, 1)).toEqual(sayfaToplamlari(satirlar, ROLLER));
  });

  it('KAR da satir bazli: satis ₺100 / maliyet ₺70 × 3 → $1,89 (TL kari × oran $1,90 derdi)', () => {
    const o = sayfaToplamlari(uc({ _malzKar: 42.9, _matNetPrice: 70 }), ROLLER, USD);
    expect(o.matKar).toBe(1.89);
    expect(o.toplamKar).toBe(1.89);
    expect(kurusTamsayi(sayfaToplamlari(uc({ _malzKar: 42.9, _matNetPrice: 70 }), ROLLER).matKar * USD) / 100).toBe(1.9);
  });
});

describe('A4a/A4b — satir Genel Toplami parcalardan (kalemToplami · satirGenelToplamiGosterim)', () => {
  it('A4a kalem toplami kurus katmaninda: 100,25 + 0 = 100,25 (eski yukari-1-hane 100,3); 1,1 + 0,01 = 1,11', () => {
    expect(kalemToplami(100.25, 0)).toBe(100.25);
    expect(kalemToplami(1.1, 0.01)).toBe(1.11);
    expect(kalemToplami(0.1, 0.2)).toBe(0.3); // float gurultusu toplama sizmaz
  });

  it('TL gosterim = kalemToplami (bayat "100.3" hucresi ekranda ciktiyla ayni 100,25)', () => {
    expect(satirGenelToplamiGosterim(100.25, null, 1)).toBe(100.25);
    expect(satirGenelToplamiGosterim(1.1, 0.01, 1)).toBe(kalemToplami(1.1, 0.01));
  });

  it('dovizde parcalar AYRI cevrilir: ₺192.244,5 + ₺5.890,5 → $4.184,47 (cikti satir I); tek seferde $4.184,48', () => {
    const oran = 1 / 47.35;
    expect(satirGenelToplamiGosterim(192244.5, 5890.5, oran)).toBe(4184.47);
    expect(kurusTamsayi((192244.5 + 5890.5) * oran) / 100).toBe(4184.48); // olcutun kendisi
  });

  it('parca yoksa null (dosyadan gelen tek toplam aynen gosterilir); parcalar 0 ise 0', () => {
    expect(satirGenelToplamiGosterim(null, null, 1)).toBeNull();
    expect(satirGenelToplamiGosterim(0, null, 1 / 47.35)).toBe(0);
  });
});

describe('A4a/A4b KAYNAK KAPISI — ExcelGrid ve iki doldurma yolu kurala BAGLI', () => {
  const kok = path.resolve(__dirname, '..');
  const kodu = (yol: string) => fs.readFileSync(path.join(kok, yol), 'utf8')
    .split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const grid = kodu('ozellik/tablo/excel-grid/ExcelGrid.tsx');
  const KURAL = {
    pinnedOranli: /sayfaToplamlari\(\s*satirlar\s*,\s*data\.columnRoles as any\s*,\s*conversionRate\s*\)/,
    ikinciCarpmaYok: /paraBicim\(\s*g[pk]\[\s*alan[PK]\s*\]\s*,\s*1\s*\)/,
    ikinciCarpmaVar: /paraBicim\(\s*g[pk]\[\s*alan[PK]\s*\]\s*,\s*conversionRate\s*\)/,
    bagimlilik: /\[data\.columnRoles, mode, fittingSatirlariniYenile, conversionRate\]/,
    kurEfekti: /useEffect\(\s*\(\)\s*=>\s*\{\s*updatePinnedBottomRef\.current\?\.\(\);\s*\}\s*,\s*\[conversionRate\]\s*\)/,
    recalcKurus: /setDataValue\(grandTotalField,\s*kalemToplami\(/,
    recalcEski: /setDataValue\(grandTotalField,\s*yukariYuvarla\(/,
    satirIkizi: /satirGenelToplamiGosterim\([\s\S]{0,200}?conversionRate,?\s*\)/,
  };

  it('olcutun kendisi: desenler bilinen KOTU satirlari yakalar, iyileri gecirir', () => {
    const kotu = 'const formatted = gp && gp.oran === conversionRate ? paraBicim(gp[alanP], conversionRate) : x;';
    expect(KURAL.ikinciCarpmaVar.test(kotu) && !KURAL.ikinciCarpmaYok.test(kotu)).toBe(true);
    expect(KURAL.recalcEski.test('e.node.setDataValue(grandTotalField, yukariYuvarla(grandTotal).toFixed(1));')).toBe(true);
  });

  it('A4b: pinned toplam oranla kurulur, ikinci kez carpilmaz; carpan degisince yeniden kurulur', () => {
    expect(KURAL.pinnedOranli.test(grid)).toBe(true);
    expect(KURAL.ikinciCarpmaYok.test(grid)).toBe(true);
    expect(KURAL.ikinciCarpmaVar.test(grid)).toBe(false);
    expect(KURAL.bagimlilik.test(grid) && KURAL.kurEfekti.test(grid)).toBe(true);
  });

  it('A4a/A4b: recalcGrand kalemToplami yazar; bicimlendirici satir Genel Toplamini parcalardan gosterir', () => {
    expect(KURAL.recalcKurus.test(grid)).toBe(true);
    expect(KURAL.recalcEski.test(grid)).toBe(false);
    expect(KURAL.satirIkizi.test(grid)).toBe(true);
  });

  it('A4a: surukle-doldur, taslak geri yukleme, fitting ve ice aktarma tamamlamasi AYNI kural', () => {
    expect(kodu('ozellik/tablo/excel-grid/fill-down.ts')).toMatch(/kalemToplami\(mat, lab\)\.toFixed\(PARA_ONDALIK\)/);
    expect(kodu('ozellik/teklif/restore-rematch.ts')).toMatch(/kalemToplami\(mat, lab\)\.toFixed\(PARA_ONDALIK\)/);
    expect(kodu('ozellik/tablo/excel-grid/fitting.ts')).toMatch(/kalemToplami\(f\.mat\?\.toplam \?\? 0, f\.lab\?\.toplam \?\? 0\)\.toFixed\(PARA_ONDALIK\)/);
    expect(kodu('ozellik/fiyat/pricing.ts')).toMatch(/r\[genel\] = kalemToplami\(/);
  });
});
