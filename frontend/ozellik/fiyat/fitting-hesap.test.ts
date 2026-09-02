/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  FITTING SATIRI KAPISI (02.09.2026, kullanici istegi)
 *
 *  Kullanicinin Excel'i: `=TOPLA(H11:H16)*D22` — boru satirlarinin TOPLAM
 *  hucreleri toplanir, oranla carpilir. Uygulamada:
 *    fitting tutari = Σ(kapsam satirlarinin toplam hucresi) × oran / 100
 *
 *  KORUNAN SOZLESME:
 *   F1. Kullanicinin ekranindaki rakamlar BIREBIR: 1/2"…2" (6 satir) toplami
 *       1.046.600 · %35 → 366.310. Ikinci fitting (2 1/2"…6", %65) → 1.166.750.
 *   F2. Malzeme ve iscilik AYRI AYRI, her taraf KENDI sutunundan, ayni oranla.
 *       Kapsamda o tarafta fiyatli satir yoksa taraf `null` (hucre BOS, ₺0 degil).
 *   F3. Oran hem SATISA hem MALIYETE uygulanir: fitting kari = kapsam kari × oran.
 *       Kullanici "kâr yüzdesi yok, kapsamin kârini tasir" dedi.
 *   F4. Birim fiyat = kapsam toplaminin %1'i (gosterim; "birim × miktar = toplam").
 *   F5. Kapsamda olmayan/gecersiz satir (silinmis, ozet, baska fitting) toplama
 *       GIRMEZ ve `eksik` sayacina yazilir — sessiz sifir YOK.
 *   F6. Oran ≤ 0 veya kapsam bos → taraf `null` (hucreler bosalir).
 *   F7. Yuvarlama TEK yerde, YUKARI, 1 hane; kurus-tamsayi biriktirme → siradan
 *       bagimsiz.
 *   F8. sayfaToplamlari: fitting satirinin MALIYETI kapsamdan turer (hucreden
 *       degil) — KAR satiri kurusu kurusuna dogru kalir (KE27 cizgisi).
 *
 *  FIXTURE KANITI: her blok, kullandigi fixture'in gercekten istenen dali
 *  surdugunu ayrica assert eder (27.08 dersi: yanlis sebeple yesil test).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest';
import {
  fittingHesapla, sayfaToplamlari, satirTarafi,
  hesaplaSatisBirimFiyat, hesaplaSatirToplam, yukariYuvarla,
} from './pricing';

const ROLLER = {
  nameField: '_ad',
  quantityField: '_miktar', unitField: '_birim',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
};

/** Kullanicinin ekran goruntusu (02.09): OFISLER FAN-COIL, siyah boru. */
function boru(rowIdx: number, ad: string, miktar: number, birim: number) {
  return {
    _rowIdx: rowIdx, _isDataRow: true, _ad: ad, _miktar: miktar, _birim: 'mt',
    _malzKar: 0, _matBirim: birim, _matToplam: birim * miktar,
  };
}
const BORULAR = [
  boru(11, '1/2" Siyah Boru', 300, 350),
  boru(12, '3/4" Siyah Boru', 463, 400),
  boru(13, '1" Siyah Boru', 312, 500),
  boru(14, '1 1/4" Siyah Boru', 282, 600),
  boru(15, '1 1/2" Siyah Boru', 280, 700),
  boru(16, '2" Siyah Boru', 294, 800),
  boru(17, '2 1/2" Siyah Boru', 336, 900),
  boru(18, '3" Siyah Boru', 262, 1000),
  boru(19, '4" Siyah Boru', 288, 1200),
  boru(20, '5" Siyah Boru', 410, 1500),
  boru(21, '6" Siyah Boru', 150, 1800),
];
const DISLI = {
  _rowIdx: 22, _isDataRow: true, _ad: 'dişli fitting oranı', _miktar: 35, _birim: '%',
  _fitting: { kapsam: [11, 12, 13, 14, 15, 16] },
};
const YIVLI = {
  _rowIdx: 23, _isDataRow: true, _ad: 'yivli fitting oranı', _miktar: 65, _birim: '%',
  _fitting: { kapsam: [17, 18, 19, 20, 21] },
};

/** Kanonik ciftle fiyatlanmis satir (sayfa-toplamlari.test.ts ile ayni uretici). */
function satir(rowIdx: number, net: { mat?: number; lab?: number }, kar: { mat?: number; lab?: number }, miktar: number) {
  const r: any = { _rowIdx: rowIdx, _isDataRow: true, _miktar: miktar, _birim: 'Ad.' };
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

/** Grid'in yenileme gecisinin yaptigi: fitting sonucunu hucrelere yazar. */
function hucrelereYaz(fit: any, satirlar: any[]) {
  const f = fittingHesapla(fit, satirlar, ROLLER)!;
  fit._matBirim = f.mat ? f.mat.birim.toFixed(1) : '';
  fit._matToplam = f.mat ? f.mat.toplam.toFixed(1) : '';
  fit._labBirim = f.lab ? f.lab.birim.toFixed(1) : '';
  fit._labToplam = f.lab ? f.lab.toplam.toFixed(1) : '';
  return f;
}

describe('F1 — kullanicinin ekrani birebir', () => {
  it('disli: 1/2"…2" toplami 1.046.600 · %35 → 366.310, birim %1 = 10.466', () => {
    // FIXTURE KANITI: kapsam 6 satir ve hepsi veri satiri
    const kapsam = BORULAR.filter((b) => DISLI._fitting.kapsam.includes(b._rowIdx));
    expect(kapsam).toHaveLength(6);
    expect(kapsam.every((b) => b._isDataRow)).toBe(true);
    const f = fittingHesapla(DISLI, [...BORULAR, DISLI, YIVLI], ROLLER)!;
    expect(f.oran).toBe(35);
    expect(f.kapsamSayisi).toBe(6);
    expect(f.eksik).toBe(0);
    expect(f.mat!.taban).toBe(1046600);
    expect(f.mat!.toplam).toBe(366310);
    expect(f.mat!.birim).toBe(10466);
    // F2: bu sayfada iscilik fiyati hic yok → taraf null (₺0 DEGIL)
    expect(f.lab).toBeNull();
  });

  it('yivli: 2 1/2"…6" toplami 1.795.000 · %65 → 1.166.750 — iki fitting ayni sayfada, birbirine girmez', () => {
    const f = fittingHesapla(YIVLI, [...BORULAR, DISLI, YIVLI], ROLLER)!;
    expect(f.mat!.taban).toBe(1795000);
    expect(f.mat!.toplam).toBe(1166750);
    expect(f.mat!.birim).toBe(17950);
    expect(f.eksik).toBe(0);
  });

  it('oran degisince tutar degisir: %35 → %40 = 418.640', () => {
    const f = fittingHesapla({ ...DISLI, _miktar: 40 }, [...BORULAR, DISLI], ROLLER)!;
    expect(f.mat!.toplam).toBe(418640);
  });

  it('kapsamdaki satir degisince tutar degisir: 1" toplami 156.000 → 180.000 ⇒ 374.710', () => {
    const rows = BORULAR.map((b) => (b._rowIdx === 13 ? { ...b, _matToplam: 180000 } : b));
    const f = fittingHesapla(DISLI, [...rows, DISLI], ROLLER)!;
    expect(f.mat!.taban).toBe(1070600);
    expect(f.mat!.toplam).toBe(374710);
  });
});

describe('F2 — iscilik ikizi', () => {
  it('malzeme ve iscilik ayri tabanlardan, ayni oranla', () => {
    const rows = [
      satir(1, { mat: 100, lab: 40 }, { mat: 0, lab: 0 }, 10),  // mat 1000 · lab 400
      satir(2, { mat: 200, lab: 60 }, { mat: 0, lab: 0 }, 5),   // mat 1000 · lab 300
    ];
    // FIXTURE KANITI: iki tarafta da fiyat var
    expect(rows.every((r) => r._matToplam > 0 && r._labToplam > 0)).toBe(true);
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: 50, _birim: '%', _fitting: { kapsam: [1, 2] } };
    const f = fittingHesapla(fit, [...rows, fit], ROLLER)!;
    expect(f.mat!.taban).toBe(2000);
    expect(f.mat!.toplam).toBe(1000);
    expect(f.lab!.taban).toBe(700);
    expect(f.lab!.toplam).toBe(350);
  });

  it('kapsamda yalniz iscilik fiyatli ise malzeme tarafi null, iscilik dolu', () => {
    const rows = [satir(1, { lab: 40 }, { lab: 0 }, 10)];
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: 50, _birim: '%', _fitting: { kapsam: [1] } };
    const f = fittingHesapla(fit, [...rows, fit], ROLLER)!;
    expect(f.mat).toBeNull();
    expect(f.lab!.toplam).toBe(200);
  });

  it('iscilik kolonu rolde yoksa iscilik tarafi null', () => {
    const roller = { ...ROLLER, laborUnitPriceField: undefined, laborTotalField: undefined };
    const rows = [satir(1, { mat: 100, lab: 40 }, { mat: 0, lab: 0 }, 10)];
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: 50, _birim: '%', _fitting: { kapsam: [1] } };
    const f = fittingHesapla(fit, [...rows, fit], roller)!;
    expect(f.mat!.toplam).toBe(500);
    expect(f.lab).toBeNull();
  });
});

describe('F3 — oran satisa VE maliyete uygulanir (kapsamin karini tasir)', () => {
  it('kar %20 borular: fitting satisi = %35×Σsatis, maliyeti = %35×Σmaliyet', () => {
    const rows = [
      satir(1, { mat: 100 }, { mat: 20 }, 10), // satis 1200 · maliyet 1000
      satir(2, { mat: 200 }, { mat: 20 }, 10), // satis 2400 · maliyet 2000
      satir(3, { mat: 300 }, { mat: 20 }, 10), // satis 3600 · maliyet 3000
    ];
    // FIXTURE KANITI: kar > 0 dali gercekten suruluyor
    expect(rows.every((r) => r._malzKar > 0 && r._matNetPrice > 0)).toBe(true);
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: 35, _birim: '%', _fitting: { kapsam: [1, 2, 3] } };
    const f = fittingHesapla(fit, [...rows, fit], ROLLER)!;
    expect(f.mat!.taban).toBe(7200);
    expect(f.mat!.maliyetTaban).toBe(6000);
    expect(f.mat!.toplam).toBe(2520);
    expect(f.mat!.maliyet).toBe(2100);
    // fitting kari = kapsam kari × oran: (7200 − 6000) × 0,35 = 420
    expect(f.mat!.toplam - f.mat!.maliyet).toBe(420);
  });

  it('kapsam satirinin maliyet kurali satirTarafi ile AYNI — ikinci bir aritmetik yok', () => {
    const r = satir(1, { mat: 100 }, { mat: 20 }, 10);
    const t = satirTarafi(r, 10, '_matBirim', '_matToplam', '_malzKar', '_matNetPrice')!;
    expect(t.satis).toBe(1200);
    expect(t.maliyet).toBe(1000);
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: 100, _birim: '%', _fitting: { kapsam: [1] } };
    const f = fittingHesapla(fit, [r, fit], ROLLER)!;
    expect(f.mat!.taban).toBe(t.satis);
    expect(f.mat!.maliyetTaban).toBe(t.maliyet);
  });
});

describe('F5/F6 — kapsam gecerliligi ve bos durumlar', () => {
  const rows = [satir(1, { mat: 100 }, { mat: 0 }, 10), satir(2, { mat: 100 }, { mat: 0 }, 10)];

  it('silinmis satir (sayfada yok) toplama girmez, eksik sayilir', () => {
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: 10, _birim: '%', _fitting: { kapsam: [1, 2, 777] } };
    const f = fittingHesapla(fit, [...rows, fit], ROLLER)!;
    expect(f.kapsamSayisi).toBe(2);
    expect(f.eksik).toBe(1);
    expect(f.mat!.toplam).toBe(200);
  });

  it('ozet satiri, baska fitting satiri ve kendisi kapsama alinmaz (eksik sayilir)', () => {
    const ozet = { _rowIdx: 5, _isDataRow: true, _ozet: true, _miktar: 1, _matBirim: 99999, _matToplam: 99999 };
    const diger = { _rowIdx: 6, _isDataRow: true, _miktar: 50, _birim: '%', _fitting: { kapsam: [1] }, _matToplam: 500 };
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: 10, _birim: '%', _fitting: { kapsam: [1, 5, 6, 9] }, _matToplam: 123 };
    const f = fittingHesapla(fit, [...rows, ozet, diger, fit], ROLLER)!;
    expect(f.kapsamSayisi).toBe(1);
    expect(f.eksik).toBe(3);
    expect(f.mat!.taban).toBe(1000);
  });

  it('kapsam bos → iki taraf null, kapsamSayisi 0', () => {
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: 10, _birim: '%', _fitting: { kapsam: [] } };
    const f = fittingHesapla(fit, [...rows, fit], ROLLER)!;
    expect(f.kapsamSayisi).toBe(0);
    expect(f.mat).toBeNull();
    expect(f.lab).toBeNull();
  });

  it('oran bos/0 → taraflar null (₺0 yazilmaz)', () => {
    for (const miktar of ['', 0, '0', 'abc']) {
      const fit = { _rowIdx: 9, _isDataRow: true, _miktar: miktar, _birim: '%', _fitting: { kapsam: [1, 2] } };
      const f = fittingHesapla(fit, [...rows, fit], ROLLER)!;
      expect(f.oran).toBe(0);
      expect(f.mat).toBeNull();
    }
  });

  it('fiyatsiz kapsam satiri 0 katar, fiyatli sayacina girmez', () => {
    const fiyatsiz = { _rowIdx: 3, _isDataRow: true, _miktar: 10, _birim: 'Ad.' };
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: 10, _birim: '%', _fitting: { kapsam: [1, 3] } };
    const f = fittingHesapla(fit, [...rows, fiyatsiz, fit], ROLLER)!;
    expect(f.kapsamSayisi).toBe(2);
    expect(f.mat!.fiyatli).toBe(1);
    expect(f.mat!.taban).toBe(1000);
  });

  it('_fitting olmayan satir icin null', () => {
    expect(fittingHesapla(rows[0], rows, ROLLER)).toBeNull();
  });
});

describe('F7 — yuvarlama ve biriktirme', () => {
  it('ondalikli taban: 1.046.633,3 × %35 = 366.321,655 → YUKARI 366.321,7; birim 10.466,4', () => {
    const rows = [
      { _rowIdx: 1, _isDataRow: true, _miktar: 1, _matBirim: 1046633.3, _matToplam: 1046633.3 },
    ];
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: 35, _birim: '%', _fitting: { kapsam: [1] } };
    const f = fittingHesapla(fit, [...rows, fit], ROLLER)!;
    expect(f.mat!.toplam).toBe(366321.7);
    expect(f.mat!.birim).toBe(10466.4);
    expect(f.mat!.toplam).toBe(yukariYuvarla(1046633.3 * 0.35));
  });

  it('BILINCLI KARAR (inceleme M6): toplam Σ×oran\'in KENDISIDIR; 1 haneli birim × oran ondan en cok 0,1×oran sapar', () => {
    // Birim hucresi GOSTERIMDIR (kapsamin %1'i, 1 hane). Toplam ondan turetilseydi
    // musterinin gordugu yuzde kayardi; bu yuzden toplam tabandan hesaplanir ve
    // sapma birim tarafinda kalir. Kayit iki degeri de tasir (teklif-kalem.ts),
    // backend toplami yeniden TURETMEZ — sinir burada kilitlenir.
    const rows = [{ _rowIdx: 1, _isDataRow: true, _miktar: 1, _matBirim: 1046633.3, _matToplam: 1046633.3 }];
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: 35, _birim: '%', _fitting: { kapsam: [1] } };
    const f = fittingHesapla(fit, [...rows, fit], ROLLER)!;
    const carpim = Math.round(f.mat!.birim * 35 * 10) / 10; // 10466,4 × 35 = 366.324,0
    expect(carpim).toBe(366324);
    expect(Math.abs(carpim - f.mat!.toplam)).toBeLessThanOrEqual(0.1 * 35);
    expect(f.mat!.toplam).toBe(366321.7);
  });

  it('ondalikli oran: %12,5 (virgullu string) tam hesaplanir', () => {
    const rows = [{ _rowIdx: 1, _isDataRow: true, _miktar: 1, _matBirim: 8000, _matToplam: 8000 }];
    const fit = { _rowIdx: 9, _isDataRow: true, _miktar: '12,5', _birim: '%', _fitting: { kapsam: [1] } };
    const f = fittingHesapla(fit, [...rows, fit], ROLLER)!;
    expect(f.oran).toBe(12.5);
    expect(f.mat!.toplam).toBe(1000);
  });

  it('kapsam sirasi sonucu degistirmez (kurus-tamsayi biriktirme)', () => {
    const rows = [0.1, 0.2, 0.3, 1000000.7].map((t, i) => ({
      _rowIdx: i + 1, _isDataRow: true, _miktar: 1, _matBirim: t, _matToplam: t,
    }));
    const a = fittingHesapla({ _rowIdx: 9, _isDataRow: true, _miktar: 35, _birim: '%', _fitting: { kapsam: [1, 2, 3, 4] } }, rows, ROLLER)!;
    const b = fittingHesapla({ _rowIdx: 9, _isDataRow: true, _miktar: 35, _birim: '%', _fitting: { kapsam: [4, 3, 2, 1] } }, rows, ROLLER)!;
    expect(a.mat!.taban).toBe(1000001.3);
    expect(b.mat!.taban).toBe(a.mat!.taban);
    expect(b.mat!.toplam).toBe(a.mat!.toplam);
  });
});

describe('F8 — sayfaToplamlari: fitting satirinin maliyeti kapsamdan turer', () => {
  it('kar %20 borular + %35 fitting: toplam kar = boru kari × 1,35, kurusu kurusuna', () => {
    const rows = [
      satir(1, { mat: 100 }, { mat: 20 }, 10),
      satir(2, { mat: 200 }, { mat: 20 }, 10),
      satir(3, { mat: 300 }, { mat: 20 }, 10),
    ];
    const fit: any = { _rowIdx: 9, _isDataRow: true, _miktar: 35, _birim: '%', _fitting: { kapsam: [1, 2, 3] } };
    const hepsi = [...rows, fit];
    hucrelereYaz(fit, hepsi);
    // FIXTURE KANITI: hucreye gercekten yazildi
    expect(fit._matToplam).toBe('2520.0');
    const o = sayfaToplamlari(hepsi, ROLLER);
    expect(o.matToplam).toBe(7200 + 2520);
    expect(o.matMaliyet).toBe(6000 + 2100);
    expect(o.matKar).toBe(1620); // = boru kari 1200 × 1,35
    expect(o.matFiyatli).toBe(4);
    expect(o.matFiyatsiz).toBe(0);
  });

  it('fitting satirinda artik kalmis kar % hucresi (50) sonucu DEGISTIRMEZ — maliyet kapsamdan', () => {
    const rows = [satir(1, { mat: 100 }, { mat: 20 }, 10)];
    const fit: any = { _rowIdx: 9, _isDataRow: true, _miktar: 100, _birim: '%', _malzKar: 50, _fitting: { kapsam: [1] } };
    const hepsi = [...rows, fit];
    hucrelereYaz(fit, hepsi);
    const o = sayfaToplamlari(hepsi, ROLLER);
    // boru: satis 1200 maliyet 1000 · fitting %100: satis 1200 maliyet 1000
    expect(o.matToplam).toBe(2400);
    expect(o.matMaliyet).toBe(2000);
    expect(o.matKar).toBe(400);
  });

  it('kapsami bos fitting satiri: hucreler bos → fiyatsiz sayilir, kara girmez, NaN uretmez', () => {
    const rows = [satir(1, { mat: 100 }, { mat: 20 }, 10)];
    const fit: any = { _rowIdx: 9, _isDataRow: true, _miktar: 35, _birim: '%', _fitting: { kapsam: [] } };
    const hepsi = [...rows, fit];
    hucrelereYaz(fit, hepsi);
    expect(fit._matToplam).toBe('');
    const o = sayfaToplamlari(hepsi, ROLLER);
    expect(o.matToplam).toBe(1200);
    expect(o.matKar).toBe(200);
    expect(o.matFiyatsiz).toBe(1);
    expect(Number.isFinite(o.toplamKar)).toBe(true);
  });

  it('iscilik ikizi: fitting iscilik maliyeti de kapsamdan turer', () => {
    const rows = [satir(1, { mat: 100, lab: 50 }, { mat: 20, lab: 10 }, 10)]; // lab satis 550 maliyet 500
    const fit: any = { _rowIdx: 9, _isDataRow: true, _miktar: 100, _birim: '%', _fitting: { kapsam: [1] } };
    const hepsi = [...rows, fit];
    hucrelereYaz(fit, hepsi);
    const o = sayfaToplamlari(hepsi, ROLLER);
    expect(o.labToplam).toBe(1100);
    expect(o.labMaliyet).toBe(1000);
    expect(o.labKar).toBe(100);
  });
});
