/**
 * DWG → teklif grid şeması testleri.
 *
 * NEDEN VAR: DWG akışının columnDefs'i quotes/new içinde elle kurulunca
 * İŞÇİLİK kolonları unutuldu (ikizi unutma: malzeme var, işçilik yok).
 * Üstelik kolon columnDefs'te yokken ExcelGrid'in `setDataValue` çağrısı
 * SESSİZCE düşer (ölçülmüş ders: proxy ölçüt yasak) — yani işçilik fiyat
 * yazımı hiç çalışmaz ve hata da görünmez. Bu dosya şemayı mühürler.
 *
 * Referans sözleşme: app/dev/grid-test/page.tsx sabit şeması +
 * ozellik/tablo/excel-grid/types.ts ColumnRoles.
 */
import { describe, expect, it } from 'vitest';
import {
  DWG_SISTEM_ALANLARI,
  dwgTeklifSemasi,
} from './dwg-teklif-sema';

describe('dwgTeklifSemasi — kolonlar', () => {
  const { columnDefs, columnRoles } = dwgTeklifSemasi();
  const fields = columnDefs.map((c) => c.field);

  it('Excel veri kolonlari durur (DWG metraj alanlari)', () => {
    for (const f of ['Malzeme Cinsi', 'Çapı', 'Birim', 'Miktar']) {
      expect(fields).toContain(f);
    }
  });

  it('MALZEME fiyatlandirma kolonlari tam', () => {
    expect(fields).toContain('_malzKar');
    expect(fields).toContain('_marka');
    expect(columnDefs.find((c) => c.field === '_marka')?.cellRenderer).toBe('brandRenderer');
    expect(fields).toContain('Birim Fiyat');
    expect(fields).toContain('Tutar');
  });

  it('ISCILIK kolonlari tam — eksikleri bu ozelligin sikayet sebebiydi', () => {
    expect(fields).toContain('_iscKar');
    expect(fields).toContain('_firma');
    expect(columnDefs.find((c) => c.field === '_firma')?.cellRenderer).toBe('firmaRenderer');
    expect(fields).toContain('_labBirim');
    expect(fields).toContain('_labToplam');
  });

  it('genel Toplam kolonu var (malzeme + iscilik)', () => {
    expect(fields).toContain('_toplam');
  });

  it('iscilik kolonlari malzeme kolonlarindan SONRA, Toplam en sonda', () => {
    const idx = (f: string) => fields.indexOf(f);
    expect(idx('_iscKar')).toBeGreaterThan(idx('Tutar'));
    expect(idx('_firma')).toBeGreaterThan(idx('_iscKar'));
    expect(idx('_labBirim')).toBeGreaterThan(idx('_firma'));
    expect(idx('_labToplam')).toBeGreaterThan(idx('_labBirim'));
    expect(idx('_toplam')).toBe(fields.length - 1);
  });

  it('kolon basliklarinda Malz/Isc ayrimi acik (iki fiyat kolonu ayirt edilebilir)', () => {
    const header = (f: string) => columnDefs.find((c) => c.field === f)?.headerName ?? '';
    expect(header('Birim Fiyat')).toMatch(/Malz/);
    expect(header('_labBirim')).toMatch(/İşç|Isc/);
  });
});

describe('dwgTeklifSemasi — roller', () => {
  const { columnRoles } = dwgTeklifSemasi();

  it('malzeme rolleri (mevcut davranis korunur)', () => {
    expect(columnRoles.nameField).toBe('Malzeme Cinsi');
    expect(columnRoles.diameterField).toBe('Çapı');
    expect(columnRoles.quantityField).toBe('Miktar');
    expect(columnRoles.unitField).toBe('Birim');
    expect(columnRoles.materialUnitPriceField).toBe('Birim Fiyat');
    expect(columnRoles.materialTotalField).toBe('Tutar');
  });

  it('ISCILIK rolleri bagli — rol yoksa ExcelGrid iscilik fiyatini HIC yazmaz', () => {
    expect(columnRoles.laborUnitPriceField).toBe('_labBirim');
    expect(columnRoles.laborTotalField).toBe('_labToplam');
  });

  it('genel toplam rolu bagli — pinned GENEL TOPLAM malzeme+iscilik toplar', () => {
    expect(columnRoles.grandTotalField).toBe('_toplam');
  });

  it('rollerin isaret ettigi HER alan columnDefs iceriyor (sessiz setDataValue tuzagi)', () => {
    const fields = new Set(dwgTeklifSemasi().columnDefs.map((c) => c.field));
    for (const [rol, alan] of Object.entries(columnRoles)) {
      expect(fields.has(alan as string), `${rol} → "${alan}" columnDefs'te yok`).toBe(true);
    }
  });
});

describe('DWG_SISTEM_ALANLARI — satir varsayilanlari', () => {
  it('iscilik yazim yolunun ihtiyac duydugu her alan tanimli', () => {
    // ExcelGrid writeLaborPrice: _iscKar okur, _labNetPrice/_labBirim/_labToplam yazar.
    expect(DWG_SISTEM_ALANLARI._iscKar).toBe(0);
    expect(DWG_SISTEM_ALANLARI._firma).toBeNull();
    expect(DWG_SISTEM_ALANLARI._labNetPrice).toBe(0);
    expect(DWG_SISTEM_ALANLARI._labBirim).toBe('');
    expect(DWG_SISTEM_ALANLARI._labToplam).toBe('');
    expect(DWG_SISTEM_ALANLARI._toplam).toBe('');
  });

  it('malzeme alanlari (mevcut davranis korunur)', () => {
    expect(DWG_SISTEM_ALANLARI._malzKar).toBe(0);
    expect(DWG_SISTEM_ALANLARI._marka).toBeNull();
    expect(DWG_SISTEM_ALANLARI._matNetPrice).toBe(0);
  });

  it('underscore olmayan alan YOK — spare satir doluluk tespiti bozulmasin', () => {
    // ExcelGrid autoAppendRow: `!c.field.startsWith('_')` alanlara bakarak
    // "son satir dolu mu" karari verir. Sistem alanlari veri sayilmamali.
    for (const k of Object.keys(DWG_SISTEM_ALANLARI)) {
      expect(k.startsWith('_'), `"${k}" sistem alani _ ile baslamali`).toBe(true);
    }
  });
});
