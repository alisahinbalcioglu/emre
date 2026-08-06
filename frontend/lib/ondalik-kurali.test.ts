/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ADIM 8 KAPISI — ONDALIK TEK KURAL (kalem 67)
 *
 *  KARAR (tek yer: pricing.ts karar blogu):
 *   · Yuvarlama YALNIZ SATIRDA (yukariYuvarla, YUKARI, ONDALIK=1 hane).
 *     Toplamda ikinci yuvarlama YASAK — toplam, yuvarlanmis satirlarin
 *     kurus-tam toplamidir.
 *   · Gosterim PARA_ONDALIK=2 hane (paraBicim; backend numFmt '#,##0.00').
 *
 *  Bu test ONDALIK FARKINI YAKALAR: satirda-yuvarla ile toplamda-yuvarla
 *  ayni listede FARKLI sayi uretir; kural birinciyi secer. ₺49M'lik teklifte
 *  bu fark kurus degil binlerdir — kapinin varlik sebebi budur.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest';
import {
  ONDALIK, PARA_ONDALIK, yukariYuvarla, paraBicim, sayfaToplamlari,
  hesaplaSatisBirimFiyat, hesaplaSatirToplam,
} from '../ozellik/fiyat/pricing';

const ROLLER = {
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
  quantityField: '_miktar', unitField: '_birim',
};

describe('ADIM 8 — ondalik tek kural', () => {
  it('kural sabitleri TEK yerden: ONDALIK=1 (deger), PARA_ONDALIK=2 (gosterim)', () => {
    expect(ONDALIK).toBe(1);
    expect(PARA_ONDALIK).toBe(2);
  });

  it('yuvarlama SATIRDA: satirda-yuvarla ≠ toplamda-yuvarla — kural birinciyi secer', () => {
    // Uc satir, birim 10.01, %0, 1'er adet.
    // SATIRDA yuvarla (kural): her satir yukari 10.1 → toplam 30.3
    // TOPLAMDA yuvarla (yasak): 30.03 → 30.1 — FARK 0.2 TL (3 satirda!)
    const rows = [1, 2, 3].map(() => {
      const satis = hesaplaSatisBirimFiyat(10.01, 0); // → 10.1 (yukari, 1 hane)
      return { _isDataRow: true, _miktar: 1, _birim: 'Ad.', _malzKar: 0,
        _matBirim: satis, _matToplam: hesaplaSatirToplam(satis, 1) } as any;
    });
    const o = sayfaToplamlari(rows, ROLLER);
    const satirdaYuvarla = 30.3;
    const toplamdaYuvarla = yukariYuvarla(10.01 * 3);
    expect(toplamdaYuvarla).toBe(30.1);           // yasak yolun urettigi
    expect(o.matToplam).toBe(satirdaYuvarla);     // kuralin sectigi
    expect(o.matToplam).not.toBe(toplamdaYuvarla); // fark GERCEK — kapi bunu yakalar
  });

  it('toplamda IKINCI yuvarlama yok: kurus-tam toplam aynen doner', () => {
    // 137.7 × 78 = 10740.6 · 291.2 × 120 = 34944 → toplam 45684.6 — dokunulmaz.
    const rows = [
      { _isDataRow: true, _miktar: 78, _malzKar: 0, _matBirim: 137.7, _matToplam: 10740.6 },
      { _isDataRow: true, _miktar: 120, _malzKar: 0, _matBirim: 291.2, _matToplam: 34944 },
    ] as any[];
    expect(sayfaToplamlari(rows, ROLLER).matToplam).toBe(45684.6);
  });

  it('buyuk mertebe (KD dersi): 12200 × 152.3 → tam 1.858.060, hayalet kurus yok', () => {
    expect(hesaplaSatirToplam(152.3, 12200)).toBe(1858060);
    expect(paraBicim(1858060, 1)).toBe('1.858.060,00'); // gosterim 2 hane
  });

  it('gosterim katmani PARA_ONDALIK: paraBicim varsayilani 2 hane', () => {
    expect(paraBicim(30.3, 1)).toBe('30,30');
    expect(paraBicim(105.9, 1)).toBe('105,90');
  });
});
