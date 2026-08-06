/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  KAR YUZDESI DEGISIMI — maliyet geriye turetilir  (`npx vitest run`)
 *
 *  KULLANICI BILDIRIMI (06.08): "kar giriyorum carpiyor topluyor hersey yolunda
 *  ancak ayni kalemde kar marjini tekrar 0 yaptigimda rakam net fiyata donmuyor,
 *  oldugu yerde kaliyor."
 *
 *  ── OLCULEN KOK NEDEN ────────────────────────────────────────────────────
 *  `_matNetPrice` / `_labNetPrice` bir GRID KOLONU DEGIL. AG-Grid'in
 *  `setDataValue` sozlesmesi: colKey bir kolona cozulmezse veriye DOKUNMADAN
 *  `false` doner. Yani maliyet alani hicbir zaman yazilamiyordu ve 0 kaliyordu
 *  (bugune kadar KAYDEDILMIS tekliflerde de 0 — sheets JSON'a oyle gitti).
 *  Kar dali bu durumda HUCREYI net saniyordu; oysa hucre SATIS tasir.
 *
 *  ── KORUNAN SOZLESME ─────────────────────────────────────────────────────
 *  Hucredeki satis + O DEGERI URETEN kar → maliyet GERIYE TURETILIR.
 *  Boylece kar 0'a dondugunde fiyat maliyete doner ve ardisik kar
 *  degisimleri BILESIK CARPMAZ.
 *
 *  ⚠ Bu dosya SAF fonksiyonu (maliyetiGeriTuret) ve onun kar zinciriyle
 *  birlesimini olcer. AG-Grid'in kendi guard'ini TAKLIT ETMEZ — taklit,
 *  kanitlanmak istenen davranisi varsayima koymak olurdu
 *  ([[feedback-dairesel-olcut-yasak]]). Kablolamanin kendisi (setDataValue
 *  yerine dogrudan mutasyon) gercek tarayicida dogrulanir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest';
import {
  maliyetiGeriTuret, hesaplaSatisBirimFiyat, hesaplaSatirToplam,
} from '../ozellik/fiyat/pricing';

/**
 * Kar dalinin YAPTIGI isin birebir modeli (ExcelGrid.tsx kar dallari):
 *  1. `_matNetPrice` DOLUYSA maliyet ODUR (kesin).
 *  2. BOSSA hucredeki satis, ONCEKI kar ile bolunerek turetilir…
 *  3. …ve TURETILEN DEGER SATIRA YAZILIR — yani turetme satir basina EN COK
 *     BIR KEZ olur, sonraki degisimler kesin degeri kullanir.
 * Bu ucuncu adim onemli: yuvarlama kaynakli sapma birikmez.
 */
type Satir = { hucre: number; kar: number; net: number };
function karDegistir(r: Satir, yeniKar: number, miktar: number) {
  const maliyet = r.net > 0 ? r.net : maliyetiGeriTuret(r.hucre, r.kar);
  if (!(r.net > 0)) r.net = maliyet;            // ← satira yazilir (kalici)
  const satis = hesaplaSatisBirimFiyat(maliyet, yeniKar);
  r.hucre = satis; r.kar = yeniKar;
  return { maliyet, satis, toplam: hesaplaSatirToplam(satis, miktar) };
}
/** Maliyeti hic saklanmamis ESKI kayit (bugune kadarki tum teklifler). */
const eskiSatir = (hucre: number, kar: number): Satir => ({ hucre, kar, net: 0 });

describe('kâr değişimi — maliyet geriye türetilir', () => {
  it('KULLANICININ VAKASI: %20 → %0 fiyat MALIYETE doner (olduğu yerde kalmaz)', () => {
    // net 1558.5 · %20 → hucre 1870.2 (canli ekran degeri)
    const hucre = hesaplaSatisBirimFiyat(1558.5, 20);
    expect(hucre).toBe(1870.2);
    const r = karDegistir(eskiSatir(hucre, 20), 0, 7873);
    expect(r.maliyet).toBeCloseTo(1558.5, 6);
    expect(r.satis).toBe(1558.5);          // ✗ eski kod 1870.2 birakiyordu
  });

  it('ARDISIK DEGISIM BILESIK CARPMAZ: %20 → %30', () => {
    const hucre = hesaplaSatisBirimFiyat(1558.5, 20); // 1870.2
    const r = karDegistir(eskiSatir(hucre, 20), 30, 1);
    expect(r.satis).toBe(2026.1);          // ✗ eski kod 2431.3 (₺405,20 fazla)
  });

  it('ILK KAR GIRISI (eski kar 0) — hucre zaten maliyettir, bozulmaz', () => {
    const r = karDegistir(eskiSatir(1558.5, 0), 20, 1);
    expect(r.maliyet).toBe(1558.5);
    expect(r.satis).toBe(1870.2);
  });

  it('TUR TAMAMLANIR: 0 → 20 → 30 → 0 baslangic degerine doner', () => {
    const r = eskiSatir(1558.5, 0);
    karDegistir(r, 20, 1);
    karDegistir(r, 30, 1);
    karDegistir(r, 0, 1);
    expect(r.hucre).toBe(1558.5);
  });

  it('toplam da maliyete doner (miktar 7873)', () => {
    const hucre = hesaplaSatisBirimFiyat(1558.5, 20);
    expect(karDegistir(eskiSatir(hucre, 20), 0, 7873).toplam).toBe(hesaplaSatirToplam(1558.5, 7873));
  });

  it('SINIR: bos/sifir/negatif hucre 0 doner, cokmez', () => {
    expect(maliyetiGeriTuret(0, 20)).toBe(0);
    expect(maliyetiGeriTuret(NaN, 20)).toBe(0);
    expect(maliyetiGeriTuret(-5, 20)).toBe(0);
  });

  it('SINIR: onceki kar bilinmiyorsa (0/NaN) hucre MALIYET sayilir', () => {
    expect(maliyetiGeriTuret(1558.5, 0)).toBe(1558.5);
    expect(maliyetiGeriTuret(1558.5, NaN)).toBe(1558.5);
  });

  it('ISCILIK IKIZI ayni formulle calisir (tek fonksiyon, iki taraf)', () => {
    // ⚠ DURUST SINIR — hesaplanmis, gozle secilmis degil:
    // Hucre 1 haneye YUKARI yuvarlidir (ADIM 8 muhrü), yani gercek satisi
    // en cok +0.1 asar. Bolunce sapma 0.1/(1+k/100) olur, sonra yeni satis
    // yine YUKARI yuvarlanip en cok +0.1 ekler. Ust sinir: 0.1/1.1 + 0.1 ≈ 0.19.
    // 137.65 → 151.5 → 151.5/1.1 = 137.727 → 137.8 (sapma 0.15).
    // ★ Sapma BIR KEZ olur: turetilen deger satira yazilir, sonrasi kesindir.
    const SINIR = 0.1 / 1.1 + 0.1; // ≈ 0.1909
    const r = eskiSatir(hesaplaSatisBirimFiyat(137.65, 10), 10); // 151.5
    const ilk = karDegistir(r, 0, 12);
    expect(Math.abs(ilk.satis - 137.65)).toBeLessThanOrEqual(SINIR);
    // Ikinci tur ARTIK KESIN — sapma birikmez
    karDegistir(r, 25, 12);
    expect(karDegistir(r, 0, 12).satis).toBe(ilk.satis);
  });
});
