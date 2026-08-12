/**
 * FİYATSIZ KALEM UYARISI — kabul testleri.
 *
 * Kapatılan vaka: DWG'de çapı okunamayan borular "Belirtilmemis" adıyla tek
 * satırda toplanıp teklife 0 ₺ ile SESSİZCE giriyordu (PANOVA: 3.123,64 m).
 *
 * ⚠ İKİ AİLE KANITI: uyarı DWG'ye özel bir kural DEĞİL. Aynı kusur Excel
 * yolunda da var (markası eşleşmemiş satır da fiyatsız kaydedilir). Bu
 * yüzden aşağıdaki ölçümler kalemleri İKİ AKIŞIN DA gerçek satır şeklinden
 * `kalemUret` ile üretir — ölçüt tek, aile iki.
 */
import { describe, expect, it } from 'vitest';
import { kalemUret } from './teklif-kalem';
import {
  fiyatsizKalemOzeti,
  fiyatsizOnayMetni,
  kalemFiyatsizMi,
  uyariyaGirerMi,
  type UyariKalemi,
} from './fiyatsiz-kalem-uyarisi';

/** DWG akışının rolleri (ozellik/teklif/dwg-teklif-sema.ts ile birebir). */
const DWG_ROLLER = {
  nameField: 'Malzeme Cinsi', diameterField: 'Çapı',
  quantityField: 'Miktar', unitField: 'Birim',
  materialUnitPriceField: 'Birim Fiyat', materialTotalField: 'Tutar',
  laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
};

/** Excel akışının tipik rolleri — kolon ADLARI farklı, ölçüt aynı olmalı. */
const EXCEL_ROLLER = {
  nameField: 'MALZEMENIN CINSI', quantityField: 'MIKTAR', unitField: 'BIRIM',
  materialUnitPriceField: 'BIRIM FIYAT', materialTotalField: 'TUTAR',
};

const kalem = (o: Partial<UyariKalemi>): UyariKalemi => ({
  materialName: 'X', unit: 'm', quantity: 1,
  unitPrice: 0, materialUnitPrice: 0, laborUnitPrice: 0,
  ...o,
});

describe('kalemFiyatsizMi — ölçüt', () => {
  it('dört para sinyali de sıfır → FİYATSIZ', () => {
    expect(kalemFiyatsizMi(kalem({}))).toBe(true);
  });

  it('malzeme birim fiyatı varsa fiyatlı', () => {
    expect(kalemFiyatsizMi(kalem({ materialUnitPrice: 705.1, unitPrice: 705.1 }))).toBe(false);
  });

  it('YALNIZ İŞÇİLİĞİ olan kalem fiyatsız SAYILMAZ (montaj bedeli)', () => {
    expect(kalemFiyatsizMi(kalem({ laborUnitPrice: 120 }))).toBe(false);
  });

  it('birim fiyat boş ama TUTAR doluysa fiyatlı (dosyadan gelen toplam)', () => {
    expect(kalemFiyatsizMi(kalem({ materialTotalPrice: 4500 }))).toBe(false);
    expect(kalemFiyatsizMi(kalem({ laborTotalPrice: 4500 }))).toBe(false);
  });

  it('NaN fiyat FİYATSIZ sayılır (=== 0 karşılaştırması NaN\'ı kaçırır)', () => {
    expect(kalemFiyatsizMi(kalem({ materialUnitPrice: NaN }))).toBe(true);
  });
});

describe('fiyatsizKalemOzeti', () => {
  it('fiyatsız kalem yoksa null — uyarı GÖRÜNMEZ', () => {
    expect(fiyatsizKalemOzeti([kalem({ materialUnitPrice: 10, unitPrice: 10 })])).toBeNull();
    expect(fiyatsizKalemOzeti([])).toBeNull();
  });

  it('PANOVA vakası: DWG çapsız satırı yakalanır, miktar korunur', () => {
    const capsiz = kalemUret({
      _isDataRow: true, 'Malzeme Cinsi': 'Belirtilmemis', 'Çapı': '', Birim: 'm',
      Miktar: '3123.64', 'Birim Fiyat': '', Tutar: '', _labBirim: '', _labToplam: '',
    }, DWG_ROLLER)!;
    const fiyatli = kalemUret({
      _isDataRow: true, 'Malzeme Cinsi': 'siyah boru', 'Çapı': '6"', Birim: 'm',
      Miktar: '794.82', 'Birim Fiyat': '705.1', Tutar: '560421.8',
      _labBirim: '', _labToplam: '',
    }, DWG_ROLLER)!;

    const o = fiyatsizKalemOzeti([capsiz, fiyatli])!;
    expect(o.adet).toBe(1);
    expect(o.toplamKalem).toBe(2);
    expect(o.birimToplamlari).toEqual([{ birim: 'm', miktar: 3123.64 }]);
    expect(o.ornekler[0].ad).toBe('Belirtilmemis');
  });

  it('İKİNCİ AİLE: Excel yolunda markası eşleşmemiş satır da yakalanır', () => {
    const eslesmemis = kalemUret({
      _isDataRow: true, 'MALZEMENIN CINSI': 'PPRC BORU 25mm', MIKTAR: '120', BIRIM: 'mt',
      'BIRIM FIYAT': '', TUTAR: '',
    }, EXCEL_ROLLER)!;
    const o = fiyatsizKalemOzeti([eslesmemis])!;
    expect(o.adet).toBe(1);
    expect(o.birimToplamlari).toEqual([{ birim: 'mt', miktar: 120 }]);
  });

  it('farklı birimler AYRI toplanır, büyükten küçüğe sıralanır', () => {
    const o = fiyatsizKalemOzeti([
      kalem({ materialName: 'A', unit: 'adet', quantity: 5 }),
      kalem({ materialName: 'B', unit: 'm', quantity: 300 }),
      kalem({ materialName: 'C', unit: 'm', quantity: 200 }),
    ])!;
    expect(o.birimToplamlari).toEqual([
      { birim: 'm', miktar: 500 },
      { birim: 'adet', miktar: 5 },
    ]);
  });

  it('miktarı 0 olan birim LİSTELENMEZ ama kalem SAYILIR', () => {
    const o = fiyatsizKalemOzeti([kalem({ materialName: 'Not', unit: 'm', quantity: 0 })])!;
    expect(o.adet).toBe(1);
    expect(o.birimToplamlari).toEqual([]);
  });

  it('örnekler en BÜYÜK miktarlı üç kalem (kullanıcı önce onları görmeli)', () => {
    const o = fiyatsizKalemOzeti([
      kalem({ materialName: 'kucuk', quantity: 1 }),
      kalem({ materialName: 'dev', quantity: 900 }),
      kalem({ materialName: 'orta', quantity: 50 }),
      kalem({ materialName: 'buyuk', quantity: 400 }),
    ])!;
    expect(o.ornekler.map((e) => e.ad)).toEqual(['dev', 'buyuk', 'orta']);
  });
});

describe('uyariyaGirerMi — İCMAL satırı yanlış alarm üretmez (ÜÇÜNCÜ AİLE)', () => {
  // Çok sayfalı keşifte backend "İcmal" sayfasını özet sayar ve satırlarını
  // `_isDataRow=true` + `_ozet=true` yapar; para YALNIZ genel toplam hücresinde
  // durur, birim/tutar BOŞ kalır. `kalemUret` genel toplamı okumaz → kalem
  // fiyatsız görünür. Ama kullanıcı o satırı fiyatlandıramaz: ExcelGrid
  // marka/firma açılırı yerine gri "özet" yazar. Alarm yanlış olurdu.
  const ICMAL_ROLLER = {
    nameField: '_ad', quantityField: '_miktar', unitField: '_birim',
    materialUnitPriceField: '_matBirim', materialTotalField: '_matToplam',
    laborUnitPriceField: '_labBirim', laborTotalField: '_labToplam',
    grandTotalField: '_toplam',
  };
  const icmalSatiri = {
    _isDataRow: true, _ozet: true,
    _ad: 'MEKANİK TESİSAT İŞLERİ', _miktar: '', _birim: '',
    _matBirim: '', _matToplam: '', _labBirim: '', _labToplam: '',
    _toplam: '62043700',   // ★ paranın durduğu TEK hücre
  };

  it('İcmal satırı uyarıya GİRMEZ', () => {
    expect(uyariyaGirerMi(icmalSatiri)).toBe(false);
  });

  it('normal satır uyarıya GİRER (kural fazla geniş değil)', () => {
    expect(uyariyaGirerMi({ _isDataRow: true } as any)).toBe(true);
    expect(uyariyaGirerMi({ _isDataRow: true, _ozet: false } as any)).toBe(true);
    expect(uyariyaGirerMi(undefined)).toBe(true);
  });

  it('ÖLÇÜT SINAMASI: dışlanmasaydı İcmal satırı FİYATSIZ sayılırdı', () => {
    // Bu assert olmadan yukarıdaki ikisi "hiçbir şeyi olmayan bir kuralı"
    // ölçerdi: dışlamanın GEREKLİ olduğunu ayrıca kanıtla.
    const kalem = kalemUret(icmalSatiri, ICMAL_ROLLER)!;
    expect(kalem.materialName).toBe('MEKANİK TESİSAT İŞLERİ');
    expect(kalemFiyatsizMi(kalem)).toBe(true);          // ← yanlış alarmın kaynağı
    expect(fiyatsizKalemOzeti([kalem])).not.toBeNull();
    // Dışlama uygulanınca uyarı YOK olur
    const suzulmus = [icmalSatiri].filter(uyariyaGirerMi).map((r) => kalemUret(r, ICMAL_ROLLER)!);
    expect(fiyatsizKalemOzeti(suzulmus)).toBeNull();
  });
});

describe('fiyatsizOnayMetni — cümle', () => {
  const metin = fiyatsizOnayMetni(fiyatsizKalemOzeti([
    kalem({ materialName: 'Belirtilmemis', unit: 'm', quantity: 3123.6449 }),
  ])!);

  it('başlık PAYDALI kalem sayısını ve BEDELİ söyler', () => {
    // "2 kalem" ile "2/5 kalem" farklı şeyler söyler; ikincisi sorunun
    // büyüklüğünü verir. `toplamKalem` önce hesaplanıp testlenip cümlede
    // HİÇ kullanılmıyordu — tutulmayan vaat.
    expect(metin.title).toContain('1/1 kalem');
    expect(metin.title).toContain('0 ₺');
  });

  it('payda GERÇEK toplam kalem sayısı (fiyatlılar da sayılır)', () => {
    const m = fiyatsizOnayMetni(fiyatsizKalemOzeti([
      kalem({ materialName: 'fiyatsiz' }),
      kalem({ materialName: 'fiyatli', materialUnitPrice: 5, unitPrice: 5 }),
      kalem({ materialName: 'fiyatli2', laborUnitPrice: 7 }),
    ])!);
    expect(m.title).toContain('1/3 kalem');
  });

  it('miktar TR biçiminde (binlik nokta, ondalık virgül)', () => {
    expect(metin.description).toContain('3.123,64 m');
  });

  it('kalem adı geçer — kullanıcı NEYİN fiyatsız olduğunu görür', () => {
    expect(metin.description).toContain('Belirtilmemis');
  });

  it('soru sorar ve onay butonu BLOKLAMADIĞINI söyler', () => {
    expect(metin.description.trim().endsWith('?')).toBe(true);
    expect(metin.confirmText).toBe('Yine de kaydet');
  });

  it('üçten fazlada "ve N kalem daha" der (liste taşmaz)', () => {
    const cok = fiyatsizOnayMetni(fiyatsizKalemOzeti(
      Array.from({ length: 7 }, (_, i) => kalem({ materialName: `K${i}`, quantity: 10 - i })),
    )!);
    expect(cok.description).toContain('ve 4 kalem daha');
  });
});
