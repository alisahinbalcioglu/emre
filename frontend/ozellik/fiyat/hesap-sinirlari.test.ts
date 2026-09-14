/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  HESAP DOGRULUGU TURU (13.09.2026) — FIYAT ZINCIRININ SINIRLARI
 *
 *  Is emri "fiyat hesabinin birim testi yok" diyordu; olculdu, YANLIS: 18 FE
 *  dosyasinda 265 hesap testi vardi. Bu dosya o envanterde OLCULMEYEN
 *  sinirlari kapatir — mutlu yolu degil.
 *
 *  HESAP ZINCIRI (uretimde gercekten kosan sira, olculdu):
 *   1. Kutuphane liste fiyati (orijinal para biriminde saklanir)
 *   2. Kur cevrimi — eslestirme aninda BACKEND'de, TRY tabanina:
 *      matching.service.ts buildTryConverter, Math.round(v × kur × 100)/100
 *   3. Iskonto (TEK, yuzde, 0-100 kirpilir) → NET: hesaplaNetFiyat
 *      — yalniz kutuphane asamasinda; teklifte ikinci iskonto YOK
 *   4. Kar % → SATIS birim: hesaplaSatisBirimFiyat (negatif kar 0 sayilir)
 *   5. Satir toplami = satis × etkinMiktar: hesaplaSatirToplam
 *      (2-5 arasi her adim YUKARI 1 hane: yukariYuvarla)
 *   6. Sayfa toplami = satir toplamlarinin KURUS-TAM toplami, _ozet haric:
 *      sayfaToplamlari (ikinci yuvarlama YOK)
 *   7. KDV — gridde YOK; yalniz "Teklif Formatinda Aktar" ciktisinda
 *      (backend format-engine.ts, (malzeme+iscilik) × 0,20)
 *   8. ICMAL — gridde HESAPLANMAZ (dosyadan kopyadir); ciktida sayfa
 *      toplamlarinin SUM formulu. Degismezi backend `test:hesap` olcer.
 *   Gosterim: paraBicim (TRY × kur, 2 hane) — hesap degil, yalniz gorunum.
 *
 *  Mutasyon kapisi (13.09): ONDALIK 1→2 ve kurus birikimini ham float'a
 *  cevirmek bu dosyayi KIRMIZIYA dondurur (tur raporunda ciktilariyla).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest';
import {
  yukariYuvarla, kurusTamsayi, hesaplaNetFiyat, hesaplaSatisBirimFiyat,
  hesaplaSatirToplam, sayfaToplamlari, karSatiri, paraBicim, etkinMiktar,
} from './pricing';

const ROLLER = {
  materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
  quantityField: '_miktar', unitField: '_birim',
};

/** Dosyadan gelmis gibi TOPLAM tasiyan satir (kar yok: satis = maliyet). */
const dosyaSatiri = (mat: string, lab = '') => ({
  _isDataRow: true, _miktar: 1, _birim: 'Ad.',
  _matBirim: mat, _matToplam: mat, _labBirim: lab, _labToplam: lab,
});

describe('ZINCIR SIRASI — iskonto kardan ONCE, her adim ayri yuvarlanir', () => {
  it('liste 3354,64 · %10 iskonto · %15 kar · 78 adet → tam sayi aritmetigiyle dogrulanmis zincir', () => {
    // 3354,64 × 0,9 = 3019,176 → YUKARI 3019,2
    const net = hesaplaNetFiyat(3354.64, 10);
    expect(net).toBe(3019.2);
    // 30192 × 115 = 3.472.080 → /1000 = 3472,08 → YUKARI 3472,1
    const satis = hesaplaSatisBirimFiyat(net, 15);
    expect(satis).toBe(3472.1);
    // 34721 × 78 = 2.708.238 → /10 = 270.823,8 (tam)
    expect(hesaplaSatirToplam(satis, 78)).toBe(270823.8);
  });

  it('SIRA ONEMLI: ayni oranlar ters sirada uygulansa kurus farki doğar (iskonto→kar = 5,7; kar→iskonto = 5,6)', () => {
    // 10,01 × 0,5 = 5,005 → 5,1 ; × 1,1 = 5,61 → 5,7
    expect(hesaplaSatisBirimFiyat(hesaplaNetFiyat(10.01, 50), 10)).toBe(5.7);
    // ters sira (urunde YOK — sirayi belgelemek icin): 10,01 × 1,1 = 11,011 → 11,1 ; × 0,5 = 5,55 → 5,6
    expect(hesaplaNetFiyat(hesaplaSatisBirimFiyat(10.01, 10), 50)).toBe(5.6);
  });
});

describe('YUVARLAMA SINIRLARI — deger katmani YUKARI 1 hane', () => {
  it('yukari demek YUKARI: 2,04 · 2,05 · 2,0000001 hepsi 2,1 (yari-cift ya da en-yakin DEGIL)', () => {
    expect(yukariYuvarla(2.04)).toBe(2.1);
    expect(yukariYuvarla(2.05)).toBe(2.1);
    expect(yukariYuvarla(2.0000001)).toBe(2.1);
    // ONDALIK=1'e bagli davranis: 2 hane olsaydi 1,23 kalirdi
    expect(yukariYuvarla(1.23)).toBe(1.3);
  });

  it('ikili artik ust dilime TASINMAZ: 0,1+0,2 = 0,30000000000000004 → 0,3; ama 0,30001 → 0,4', () => {
    expect(yukariYuvarla(0.1 + 0.2)).toBe(0.3);
    expect(yukariYuvarla(0.30001)).toBe(0.4);
  });

  it('gurultu esigi: dilimin 1e-10 ustu artik sayilir (2,00000000001 → 2), 1e-7 ustu gercek deger (→ 2,1)', () => {
    expect(yukariYuvarla(2.00000000001)).toBe(2);
    expect(yukariYuvarla(2.0000001)).toBe(2.1);
  });

  it('eksi sifir uretilmez (epsilon sifiri eksiye itebilir)', () => {
    expect(Object.is(yukariYuvarla(-1e-11), 0)).toBe(true);
  });
});

describe('KURUS SINIRI (0,005) — toplam, GORUNEN satirlarin toplamidir', () => {
  // Ikili temsilde yarim kurusun ALTINDA duran degerler: eski
  // Math.round(v*100) bunlari asagi atiyordu, ekran (paraBicim) ise yukari
  // gosteriyordu. Beklenenler ekranin kendi bicimleyicisinden okunur.
  const YARIM_KURUS = [10.075, 1.015, 1.005, 0.285, 0.005];

  it('kurusTamsayi, 15 anlamli haneye kadar yazilmis degerde ekranin 2 haneli gosterimiyle ayni kurusu verir', () => {
    for (const v of YARIM_KURUS) {
      const ekran = Number(paraBicim(v, 1).replace(/\./g, '').replace(',', '.'));
      expect(kurusTamsayi(v), `v=${v} ekran=${ekran}`).toBe(Math.round(ekran * 100));
    }
    expect(kurusTamsayi(10.075)).toBe(1008);
    expect(kurusTamsayi(1.015)).toBe(102);
  });

  it('BILINEN SINIR: yarimin HEMEN altina ozel kurulmus 17 haneli double ekranla ayrisir', () => {
    // 1.0049999999999997 dosyadan/klavyeden gelen bir deger degildir (15 haneden
    // uzun); 15 haneye kirpinca 100.5 olur ve yukari gider, Intl ise 1,00 basar.
    // Kural "15 anlamli hane" ile sinirlidir — bu assert o siniri BELGELER.
    expect(kurusTamsayi(1.0049999999999997)).toBe(101);
    expect(paraBicim(1.0049999999999997, 1)).toBe('1,00');
  });

  it('yarim kurus sifirdan UZAGA — negatifte simetrik, eksi sifir yok', () => {
    expect(kurusTamsayi(-10.075)).toBe(-1008);
    expect(kurusTamsayi(-0.005)).toBe(-1);
    expect(Object.is(kurusTamsayi(-0.0049), 0)).toBe(true);
  });

  it('2 ondalikli deger DEGISMEZ ve okunamayan sayi 0 olur', () => {
    expect(kurusTamsayi(1858060.05)).toBe(185806005);
    expect(kurusTamsayi(323308.13)).toBe(32330813);
    expect(kurusTamsayi(NaN)).toBe(0);
    expect(kurusTamsayi(Infinity)).toBe(0);
  });

  it('sayfa toplami = gorunen satir degerlerinin kurus toplami (3 ondalikli dosya toplamlari)', () => {
    const rows = YARIM_KURUS.map((v) => dosyaSatiri(String(v)));
    const o = sayfaToplamlari(rows, ROLLER);
    const gorunenToplamK = YARIM_KURUS
      .map((v) => Math.round(Number(paraBicim(v, 1).replace(/\./g, '').replace(',', '.')) * 100))
      .reduce((a, b) => a + b, 0);
    expect(Math.round(o.matToplam * 100)).toBe(gorunenToplamK);
    // 1008 + 102 + 101 + 29 + 1 = 1241 kurus
    expect(o.matToplam).toBe(12.41);
  });
});

describe('BIRIKIM — cok kalemde yuvarlama farki birikmez', () => {
  it('10.000 × 0,1 TL = TAM 1.000 (ham float toplam 1000,0000000001588 verirdi)', () => {
    let ham = 0;
    for (let i = 0; i < 10000; i++) ham += 0.1;
    expect(ham).not.toBe(1000); // olcutun kendisi: ham toplam GERCEKTEN sapar
    const rows = Array.from({ length: 10000 }, () => dosyaSatiri('0.1'));
    expect(sayfaToplamlari(rows, ROLLER).matToplam).toBe(1000);
  });

  it('toplam SIRADAN BAGIMSIZ: satirlar ters ve karisik sirada ayni kurusu verir', () => {
    const degerler = ['323308.125', '0.005', '1.015', '10.075', '2.675', '99999.995', '7.105', '0.1', '0.2'];
    const rows = degerler.map((v, i) => dosyaSatiri(v, String(Number(v) / (i + 2))));
    const a = sayfaToplamlari(rows, ROLLER);
    const b = sayfaToplamlari([...rows].reverse(), ROLLER);
    const c = sayfaToplamlari([rows[4], rows[0], rows[8], rows[2], rows[6], rows[1], rows[7], rows[3], rows[5]], ROLLER);
    for (const x of [b, c]) {
      expect(x.matToplam).toBe(a.matToplam);
      expect(x.labToplam).toBe(a.labToplam);
      expect(x.genelToplam).toBe(a.genelToplam);
    }
  });

  it('toplamda IKINCI yuvarlama yok: 1.000 satir × 0,33 birim → satir 0,4 → toplam 400 (330 degil, 400,1 degil)', () => {
    // Uclu YUKARI yuvarlama spec geregidir (ONDALIK=1); toplam onu yeniden yuvarlamaz.
    const satir = hesaplaSatirToplam(0.33, 1);
    expect(satir).toBe(0.4);
    const rows = Array.from({ length: 1000 }, () => dosyaSatiri(String(satir)));
    expect(sayfaToplamlari(rows, ROLLER).matToplam).toBe(400);
  });
});

describe('SIFIR ve NEGATIF', () => {
  it('sifir miktar ve sifir birim fiyat → satir 0', () => {
    expect(hesaplaSatirToplam(152.3, 0)).toBe(0);
    expect(hesaplaSatirToplam(0, 12)).toBe(0);
  });

  it('miktari 0 olan fiyatli satir FIYATLI sayilir, toplama 0 girer (kullanici karari: "bos degil sifir")', () => {
    const o = sayfaToplamlari([{ _isDataRow: true, _miktar: 0, _matBirim: '8250', _matToplam: '' }], ROLLER);
    expect(o.matFiyatli).toBe(1);
    expect(o.matFiyatsiz).toBe(0);
    expect(o.matToplam).toBe(0);
  });

  it('negatif kar SIFIR sayilir: satis = net (maliyetin altina satis uretilmez)', () => {
    expect(hesaplaSatisBirimFiyat(100, -10)).toBe(100);
    expect(hesaplaSatisBirimFiyat(137.65, -0.01)).toBe(137.7);
  });

  it('iskonto YUZDEDIR (tutar degil) ve ondalikli olabilir: 1000 × (1 − %12,5) = 875', () => {
    expect(hesaplaNetFiyat(1000, 12.5)).toBe(875);
    expect(hesaplaNetFiyat(1000, 100)).toBe(0);
  });
});

describe('KUR — on yuzde yalniz GOSTERIM', () => {
  it('USD gosterimi: ₺47.350 × (1/47,35) → "1.000,00" (hesap degeri TL kalir)', () => {
    expect(paraBicim(47350, 1 / 47.35)).toBe('1.000,00');
  });

  it('kur alinamadiginda carpan 1 → TL rakami (yabanci simgeyle karistirmak cagiranin sorumlulugu)', () => {
    expect(paraBicim(47350, 1)).toBe('47.350,00');
  });
});

describe('BOS / TEK / COK KALEMLI TEKLIF', () => {
  it('bos sayfa: tum toplamlar 0, sayaclar 0; KAR satiri "₺0" DEGIL null basar (bos fiyat ≠ sifir kar)', () => {
    const o = sayfaToplamlari([], ROLLER);
    expect([o.matToplam, o.labToplam, o.genelToplam, o.matKar, o.labKar, o.toplamKar]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([o.matFiyatli, o.matFiyatsiz, o.labFiyatli, o.labFiyatsiz]).toEqual([0, 0, 0, 0]);
    const kar = karSatiri(o, { ...ROLLER, grandTotalField: '_toplam' }, '_ad');
    expect(kar._matToplam).toBeNull();
    expect(kar._labToplam).toBeNull();
    expect(kar._toplam).toBeNull();
  });

  it('tek kalem: sayfa toplami o satirin toplamidir', () => {
    const o = sayfaToplamlari([dosyaSatiri('270823.8', '1200')], ROLLER);
    expect(o.matToplam).toBe(270823.8);
    expect(o.labToplam).toBe(1200);
    expect(o.genelToplam).toBe(272023.8);
  });

  it('cok sayfa: sayfalarin genel toplamlarinin toplami = birlesik listenin genel toplami (kurusu kurusuna)', () => {
    const s1 = ['10.075', '1.015', '0.1'].map((v) => dosyaSatiri(v, '0.2'));
    const s2 = ['323308.125', '7.105'].map((v) => dosyaSatiri(v, '1.005'));
    const s3 = [dosyaSatiri('0.005')];
    const ayri = [s1, s2, s3].map((s) => sayfaToplamlari(s, ROLLER).genelToplam);
    const birlesik = sayfaToplamlari([...s1, ...s2, ...s3], ROLLER).genelToplam;
    expect(Math.round(ayri.reduce((a, b) => a + b, 0) * 100)).toBe(Math.round(birlesik * 100));
  });
});

describe('MIKTAR OKUMA — etkinMiktar', () => {
  it('saf sayi olmayan miktar (bos, "3 adet") 0 okunur; sayfa toplami fiyatli satirin toplam HUCRESINI esas alir', () => {
    expect(etkinMiktar({ _miktar: '' }, '_miktar', '_birim')).toBe(0);
    expect(etkinMiktar({ _miktar: '3 adet' }, '_miktar', '_birim')).toBe(0);
    // dosya toplami ustundur (KE21): miktar okunamasa da toplam hucresi sayilir
    const o = sayfaToplamlari([{ _isDataRow: true, _miktar: '3 adet', _matBirim: '10', _matToplam: '30' }], ROLLER);
    expect(o.matToplam).toBe(30);
  });
});
