/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ADIM 10 KAPISI — KAR SATIRI (kullanicinin 05.08 istegi)
 *
 *  Belgenin kapi listesi birebir:
 *   · Iki satir, malzeme %20 / iscilik %10, FARKLI tutarlar → uc hucre
 *     ELLE HESAPLANAN sayiyi gosterir.
 *   · Toplam Kar = Malzeme Kari + Iscilik Kari — kurusu kurusuna (KE26).
 *   · Butun yuzdeler 0 VE fiyatlar dolu → kar satiri ₺0,00 (null degil).
 *   · Malzeme fiyati BOS → Malzeme Kari ₺0,00 DEGIL (KE29): deger null,
 *     gosterim '—'; fiyatsiz sayaci tasinir.
 *   · Sayfalarin kar toplami = Icmal'in kar satiri (KE30, kurus duzeyi).
 *   · Musteri ciktisinda kar YOK (KE31 FE yarisi): satir PINNED isaretli —
 *     rowData disinda yasar, kayda giremez. (BE yarisi: standart-cikti
 *     testindeki 'KÂR etiketi taranmaz' asserti.)
 *   · YUZDE YAZILMAZ (KE28): hicbir hucre degerinde '%' gecmez.
 *  Kar BURADA HESAPLANMAZ: karSatiri yalniz sayfaToplamlari'nin alanlarini
 *  yerlestirir (KE27 — 22. aritmetik yeri yok).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest';
import {
  sayfaToplamlari, karSatiri, hesaplaSatisBirimFiyat, hesaplaSatirToplam, karYuzdesi,
} from '../ozellik/fiyat/pricing';

const ROLLER = {
  nameField: '_ad',
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
  grandTotalField: '_toplam',
  quantityField: '_miktar', unitField: '_birim',
};

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

describe('ADIM 10 — kar satiri', () => {
  it('belge senaryosu: 2 satir, malzeme %20 / iscilik %10, farkli tutarlar → uc hucre ELLE hesap', () => {
    // Satir 1: malzeme net 100, %20, 3 adet → satis 120, maliyet 100 → kar 20×3 = 60
    // Satir 2: iscilik net 50, %10, 4 adet → satis 55, maliyet 50 → kar 5×4 = 20
    const rows = [satir({ mat: 100 }, { mat: 20 }, 3), satir({ lab: 50 }, { lab: 10 }, 4)];
    const ozet = sayfaToplamlari(rows, ROLLER);
    const kr = karSatiri(ozet, ROLLER, ROLLER.nameField);
    expect(kr._ad).toBe('KÂR');
    expect(kr._matToplam).toBe(60);   // Malz. Toplam'in altinda: MALZEME KARI
    expect(kr._labToplam).toBe(20);   // Isc. Toplam'in altinda: ISCILIK KARI
    expect(kr._toplam).toBe(80);      // Genel Toplam'in altinda: TOPLAM KAR
  });

  it('KE26: Toplam Kar = Malzeme + Iscilik — kurusu kurusuna, ozet alanlariyla BIREBIR', () => {
    const rows = [satir({ mat: 105.86, lab: 47.3 }, { mat: 20, lab: 10 }, 78)];
    const ozet = sayfaToplamlari(rows, ROLLER);
    const kr = karSatiri(ozet, ROLLER);
    expect(kr._toplam).toBe(kr._matToplam + kr._labToplam);
    // KE27: hucre degerleri ozet alanlarinin KENDISI — ikinci hesap yok.
    expect(kr._matToplam).toBe(ozet.matKar);
    expect(kr._labToplam).toBe(ozet.labKar);
    expect(kr._toplam).toBe(ozet.toplamKar);
  });

  it('butun yuzdeler 0 ve fiyatlar dolu → kar satiri 0 (null DEGIL → ekranda ₺0,00)', () => {
    const rows = [satir({ mat: 105.9, lab: 47.3 }, {}, 7)];
    const kr = karSatiri(sayfaToplamlari(rows, ROLLER), ROLLER);
    expect(kr._matToplam).toBe(0);
    expect(kr._labToplam).toBe(0);
    expect(kr._toplam).toBe(0);
  });

  it('KE29: malzeme fiyati BOS iken Malzeme Kari ₺0,00 DEGIL — null (gosterim: —) + sayac', () => {
    const fiyatsiz: any = { _isDataRow: true, _miktar: 5, _matBirim: '', _matToplam: '' };
    const rows = [fiyatsiz, satir({ lab: 100 }, { lab: 10 }, 2)];
    const kr = karSatiri(sayfaToplamlari(rows, ROLLER), ROLLER);
    expect(kr._matToplam).toBeNull();          // 0 degil!
    expect(kr._karBilgi.matYok).toBe(true);
    expect(kr._karBilgi.matFiyatsiz).toBe(2);
    expect(kr._labToplam).toBe((110 - 100) * 2);
    expect(kr._toplam).toBe(20);               // toplam yalniz fiyatli taraftan
  });

  it('KE30: sayfalarin kar satirlari toplami = Icmal\'in kar satiri (kurus)', () => {
    const kurus = (v: number) => Math.round(v * 100);
    const s1 = [satir({ mat: 100 }, { mat: 20 }, 3)];
    const s2 = [satir({ mat: 291.2, lab: 137.65 }, { mat: 15, lab: 5 }, 12)];
    const k1 = karSatiri(sayfaToplamlari(s1, ROLLER), ROLLER);
    const k2 = karSatiri(sayfaToplamlari(s2, ROLLER), ROLLER);
    const icmal = karSatiri(sayfaToplamlari([...s1, ...s2], ROLLER), ROLLER);
    expect(kurus(icmal._toplam)).toBe(kurus(k1._toplam) + kurus(k2._toplam));
  });

  it('KE31 (FE yarisi): kar satiri PINNED — rowData/kayit/cikti yoluna giremez', () => {
    const kr = karSatiri(sayfaToplamlari([satir({ mat: 100 }, { mat: 20 }, 1)], ROLLER), ROLLER);
    expect(kr._isPinnedTotal).toBe(true);
    expect(kr._isKarRow).toBe(true);
    expect(kr._isDataRow).toBe(false); // sheetsPayload yalniz rowData satirlarini alir
  });

  it('KE28: hicbir hucre degerinde YUZDE yok', () => {
    const kr = karSatiri(sayfaToplamlari([satir({ mat: 100, lab: 50 }, { mat: 20, lab: 10 }, 3)], ROLLER), ROLLER);
    for (const v of Object.values(kr)) {
      expect(String(v ?? '')).not.toContain('%');
    }
  });
});

describe('KAR YUZDESI (17.08 kullanici istegi)', () => {
  // ⚠ KULLANICININ TANIMI, BIREBIR: "maliyet 100 TL (kar yuzdesi %0 iken),
  // kar 20 TL ise kar %20'dir." Payda SATIS DEGIL MALIYET.
  it('kullanicinin ornegi: maliyet 100, kar 20 → %20', () => {
    expect(karYuzdesi(20, 100)).toBe(20);
  });

  // ⚠ Ayni rakamlar SATISA bolunseydi 20/120 = %16,7 cikardi. Bu kriter
  // paydanin maliyet oldugunu kilitler.
  it('payda SATIS degil: 20/120 (%16,7) DEGIL', () => {
    expect(karYuzdesi(20, 100)).not.toBe(16.7);
  });

  // ⚠ SIFIRA BOLME: maliyeti sifir olan bir kalemin kar orani TANIMSIZDIR.
  // Korunmasaydi Infinity uretilir ve ekranda "%∞" yazardi.
  it('maliyet 0 → null (sifira bolme)', () => {
    expect(karYuzdesi(20, 0)).toBeNull();
  });

  it('maliyet negatif → null', () => {
    expect(karYuzdesi(20, -50)).toBeNull();
  });

  // KE29'un yuzde tarafi: "fiyatli satir yok" ile "kar sifir" AYNI SEY DEGIL.
  it('kar null (fiyatli satir yok) → null', () => {
    expect(karYuzdesi(null, 100)).toBeNull();
  });

  it('kar 0 ama maliyet var → %0 (null DEGIL — gercek bir olcum)', () => {
    expect(karYuzdesi(0, 100)).toBe(0);
  });

  it('bir ondalik basamaga yuvarlanir', () => {
    expect(karYuzdesi(1, 3)).toBe(33.3);
  });

  // ── ENTEGRASYON: kar satiri yuzdeleri tasiyor mu ──────────────────────
  it('kar satiri malzeme yuzdesini tasir (%20 girisi → %20 gerceklesen)', () => {
    const ozet = sayfaToplamlari([satir({ mat: 100 }, { mat: 20 }, 1)], ROLLER);
    const kr = karSatiri(ozet, ROLLER);
    expect(kr._karBilgi.matYuzde).toBe(20);
  });

  it('fiyatsiz tarafin yuzdesi null (tutarla AYNI kosul)', () => {
    const ozet = sayfaToplamlari([satir({ mat: 100 }, { mat: 20 }, 1)], ROLLER);
    const kr = karSatiri(ozet, ROLLER);
    expect(kr._karBilgi.labYuzde).toBeNull();
  });

  // ⚠ KE27 KORUNDU: yuzde eklemek TUTARLARI degistirmemeli — kar hala
  // maliyet−satis farki, 22. bir aritmetik yeri acilmadi.
  it('yuzde eklemek TUTARI degistirmez', () => {
    const ozet = sayfaToplamlari([satir({ mat: 100 }, { mat: 20 }, 1)], ROLLER);
    const kr = karSatiri(ozet, ROLLER);
    expect(kr._matToplam).toBe(ozet.matKar);
  });
});
