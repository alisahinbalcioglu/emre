/**
 * Teklif kalemi payload sozlesmesi — CANLI 400'un muhru.
 *
 * VAKA (11.08 gece, PANOVA): DWG metrajı fiyatlandırılıp "Teklifi Kaydet"
 * denince POST /api/quotes → HTTP 400, toast yalnız "bir hata oluştu" diyordu.
 *
 * KÖK: handleSave'de payload'un 9 sayısal alanından 7'si
 * `parseFloat(String(...)) || 0` ile korunuyordu; SADECE `materialMargin`
 * ve `laborMargin` korumasızdı (`r._malzKar || 0`). Kullanıcı Kar % hücresine
 * ELLE "50" yazınca AG-Grid değeri STRING saklıyor (kolonda cellRenderer
 * olduğu için ag-grid cellDataType çıkarımını kapatıyor, sayı valueParser'ı
 * enjekte edilmiyor) ve `"50" || 0` boş olmayan string'i AYNEN geçiriyordu.
 * Backend `@IsNumber()` reddediyordu.
 *
 * NEDEN 1e5334b'de KIRILDI: o commit'ten önce `_malzKar` kolonu `editable`
 * DEĞİLDİ ve `_iscKar` kolonu HİÇ YOKTU — elle yazma yolu kapalıydı, değer
 * yalnız fill-handle'dan (parseFloat'lı) NUMBER olarak gelebiliyordu.
 *
 * Bu dosya payload sözleşmesini mühürler: hücre NE TUTARSA TUTSUN, kaleme
 * giden her sayısal alan gerçek `number` olmalı (DTO: @IsNumber + @Min(0)).
 */
import { describe, expect, it } from 'vitest';
import { kalemUret, sayiAlani } from './teklif-kalem';

const roller = {
  nameField: 'Malzeme Cinsi',
  diameterField: 'Çapı',
  quantityField: 'Miktar',
  unitField: 'Birim',
  materialUnitPriceField: 'Birim Fiyat',
  materialTotalField: 'Tutar',
  laborUnitPriceField: '_labBirim',
  laborTotalField: '_labToplam',
  grandTotalField: '_toplam',
};

/** DTO kurallari (backend create-quote.dto.ts ile birebir). */
const SAYI_ALANLARI = [
  'quantity', 'unitPrice', 'materialUnitPrice', 'laborUnitPrice',
  'materialTotalPrice', 'laborTotalPrice', 'materialMargin', 'laborMargin',
] as const;

function dtoyaUyar(item: Record<string, any>): string[] {
  const hata: string[] = [];
  if (typeof item.materialName !== 'string' || !item.materialName) hata.push('materialName');
  for (const a of SAYI_ALANLARI) {
    const v = item[a];
    if (v === undefined) continue;                       // @IsOptional
    if (typeof v !== 'number') { hata.push(`${a}: ${typeof v} (${JSON.stringify(v)})`); continue; }
    if (!Number.isFinite(v)) { hata.push(`${a}: NaN/Infinity`); continue; }
    if (v < 0) hata.push(`${a}: negatif ${v}`);
  }
  return hata;
}

describe('sayiAlani — payload sayı süzgeci', () => {
  it('ELLE YAZILAN STRING sayıya çevrilir (400\'ün kökü)', () => {
    expect(sayiAlani('50')).toBe(50);
    expect(typeof sayiAlani('50')).toBe('number');
  });
  it('sayı aynen geçer', () => {
    expect(sayiAlani(50)).toBe(50);
    expect(sayiAlani(0)).toBe(0);
  });
  it('virgüllü ondalık (TR klavye) çözülür', () => {
    expect(sayiAlani('12,5')).toBe(12.5);
  });
  it('boş / null / undefined / çöp -> 0', () => {
    expect(sayiAlani('')).toBe(0);
    expect(sayiAlani(null)).toBe(0);
    expect(sayiAlani(undefined)).toBe(0);
    expect(sayiAlani('abc')).toBe(0);
  });
  it('NaN ve Infinity ASLA sızmaz (DTO ikisini de reddeder)', () => {
    expect(sayiAlani(NaN)).toBe(0);
    expect(sayiAlani(Infinity)).toBe(0);
    expect(sayiAlani(-Infinity)).toBe(0);
  });
  it('NEGATİF -> 0 (DTO @Min(0) reddeder)', () => {
    expect(sayiAlani(-5)).toBe(0);
    expect(sayiAlani('-5')).toBe(0);
  });
});

describe('kalemUret — CANLI 400 senaryosu', () => {
  const ekranSatiri = (kar: unknown, iscKar: unknown) => ({
    _isDataRow: true,
    'Malzeme Cinsi': '6" siyah boru', 'Çapı': '6"', Birim: 'm', Miktar: '794.82',
    'Birim Fiyat': '705.1', Tutar: '560421.8',
    _malzKar: kar, _iscKar: iscKar,
    _labBirim: '1687.5', _labToplam: '1341160.5', _toplam: '1901582.3',
  });

  it('KAR % STRING iken bile payload SAYI gider (400 tekrar etmez)', () => {
    const item = kalemUret(ekranSatiri('50', '50'), roller)!;
    expect(typeof item.materialMargin).toBe('number');
    expect(typeof item.laborMargin).toBe('number');
    expect(item.materialMargin).toBe(50);
    expect(item.laborMargin).toBe(50);
    expect(dtoyaUyar(item)).toEqual([]);
  });

  it('KAR % SAYI iken davranış değişmez (regresyon yok)', () => {
    const item = kalemUret(ekranSatiri(50, 50), roller)!;
    expect(item.materialMargin).toBe(50);
    expect(item.laborMargin).toBe(50);
    expect(dtoyaUyar(item)).toEqual([]);
  });

  it('kâr girilmemiş satır -> 0', () => {
    const item = kalemUret(ekranSatiri(undefined, undefined), roller)!;
    expect(item.materialMargin).toBe(0);
    expect(item.laborMargin).toBe(0);
    expect(dtoyaUyar(item)).toEqual([]);
  });

  it('fiyatsız satır (Belirtilmemis) DTO\'dan geçer', () => {
    const item = kalemUret({
      _isDataRow: true, 'Malzeme Cinsi': 'Belirtilmemis', 'Çapı': '', Birim: 'm',
      Miktar: '3123.64', 'Birim Fiyat': '', Tutar: '',
      _malzKar: 0, _iscKar: 0, _labBirim: '', _labToplam: '', _toplam: '',
    }, roller)!;
    expect(item.materialName).toBe('Belirtilmemis');
    expect(item.quantity).toBeCloseTo(3123.64);
    expect(dtoyaUyar(item)).toEqual([]);
  });

  it('PAYLOAD\'IN HER SAYISAL ALANI number — tek tek', () => {
    const item = kalemUret(ekranSatiri('50', '50'), roller)!;
    for (const a of SAYI_ALANLARI) {
      if (item[a] === undefined) continue;
      expect(typeof item[a], `${a} number olmalı`).toBe('number');
    }
  });

  it('çap + cins birleşimi ad olur (eşleştirme adı)', () => {
    const item = kalemUret(ekranSatiri(0, 0), roller)!;
    expect(item.materialName).toBe('6" 6" siyah boru');
  });

  it('adsız satır atlanır (null döner)', () => {
    expect(kalemUret({ _isDataRow: true, 'Malzeme Cinsi': '', 'Çapı': '' }, roller)).toBeNull();
  });

  it('roller eksikse (labor kolonu olmayan Excel dosyası) çökmez', () => {
    const item = kalemUret(ekranSatiri(0, 0), {
      nameField: 'Malzeme Cinsi', quantityField: 'Miktar',
    })!;
    expect(item.laborUnitPrice).toBe(0);
    expect(item.laborTotalPrice).toBeUndefined();
    expect(dtoyaUyar(item)).toEqual([]);
  });
});
