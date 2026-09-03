import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SONUK_ROZET,
  ipucu,
  kapiDurumu,
  rozetMetni,
  tiklanabilir,
} from './ozellik-kapisi';

/**
 * ORTAK OZELLIK KAPISI + onun UC TUKETICISI (DWG · Excel · iscilik).
 *
 * ⚠ EN KRITIK BLOKLAR "BAGLANTI": bugun BES kez ayni kusur cikti —
 * mekanizma kodda var ama BIR YERE baglanip digerine baglanmiyor
 * (`hasAnyDwg` tanimliydi kimse okumuyordu · `yetenekAcikMi` uretimde
 * sifir kullanim · `EXCEL_YUKLE` olu bir ucta · iscilik firma secici
 * kilitliyken birim fiyat hucresi yazilabiliyordu). Bu yuzden asagida saf
 * mantik kadar BAGLANTI da assert ediliyor.
 */

describe('kapiDurumu — uc durum', () => {
  it('yetenekler yuklenirken YUKLENIYOR (izin degeri onemsiz)', () => {
    expect(kapiDurumu({ loading: true, izinVar: false })).toBe('yukleniyor');
    expect(kapiDurumu({ loading: true, izinVar: true })).toBe('yukleniyor');
  });

  it('izin varsa ACIK, yoksa SONUK', () => {
    expect(kapiDurumu({ loading: false, izinVar: true })).toBe('acik');
    expect(kapiDurumu({ loading: false, izinVar: false })).toBe('sonuk');
  });

  it('⭐ yuklenirken TIKLANAMAZ (403 yemeden once)', () => {
    expect(tiklanabilir('yukleniyor')).toBe(false);
  });

  it('⭐ yuklenirken SUCLAYICI rozet GOSTERILMEZ', () => {
    // Iki durumlu bir kapi burada "Pro paket gerekli" yazar ve parasini
    // odemis musteriye YANLIS bilgi verir.
    expect(rozetMetni('yukleniyor')).toBeNull();
    expect(ipucu('yukleniyor', 'x')).toBeUndefined();
  });

  it('yalniz ACIK durumda etkilesim var', () => {
    expect(tiklanabilir('acik')).toBe(true);
    expect(tiklanabilir('sonuk')).toBe(false);
  });

  it('sonuk durumda ortak rozet ve ipucu', () => {
    expect(rozetMetni('sonuk')).toBe(SONUK_ROZET);
    expect(ipucu('sonuk', 'metin')).toBe('metin');
  });

  it('acik durumda rozet opsiyonel (verilmezse null)', () => {
    expect(rozetMetni('acik')).toBeNull();
    expect(rozetMetni('acik', 'PRO')).toBe('PRO');
  });
});

describe('⭐ BAGLANTI — QuickStart Excel kutusu kapiya bagli mi', () => {
  const q = readFileSync(
    join(__dirname, '..', '..', 'ortak', 'kabuk', 'components', 'dashboard', 'QuickStart.tsx'),
    'utf8',
  );

  it('OLCUT: dosya okundu ve iki kutu da iceride', () => {
    expect(q).toContain('Excel Keşif');
    expect(q).toContain('DWG Proje');
  });

  it('⭐ Excel kutusu MALZEME yetenegini okuyor', () => {
    expect(q).toContain('hasAnyMaterial()');
    expect(q).toContain('const excelAcik = tiklanabilir(excelDurum)');
  });

  it('⭐ tiklama kapali (kosulsuz acilmiyor)', () => {
    expect(q).toContain('if (excelAcik) excelInputRef.current?.click()');
    expect(q).not.toContain('onClick={() => excelInputRef.current?.click()}');
  });

  it('⭐ SURUKLEME de kapali (tiklama yetmez)', () => {
    expect(q).toContain('onDrop={excelAcik ? handleExcelDrop : undefined}');
  });

  it('⭐ gizli dosya secici DISABLED (klavyeyle tetiklenmesin)', () => {
    // `accept` bir ipucudur; disabled olmayan input programatik/klavye
    // yoluyla acilabilir.
    const i = q.indexOf('ref={excelInputRef}');
    expect(i).toBeGreaterThan(-1);
    const satirSonu = q.indexOf('/>', i);
    expect(q.slice(i, satirSonu)).toContain('disabled={!excelAcik}');
  });

  it('sonuk durumda paket sayfasina yol gosteriliyor', () => {
    expect(q).toContain('/abonelik');
  });
});

describe('⭐ BAGLANTI — iscilik kolonlari ExcelGrid.te kapali mi', () => {
  const g = readFileSync(
    join(__dirname, '..', '..', 'ozellik', 'tablo', 'excel-grid', 'ExcelGrid.tsx'),
    'utf8',
  );

  it('OLCUT: dosya okundu ve laborEnabled bayragi var', () => {
    expect(g).toContain('laborEnabled');
  });

  it('⭐ Kar % kolonu iscilik kapaliyken DUZENLENEMEZ', () => {
    expect(g).toContain("base.editable = karField === '_iscKar' ? laborEnabled : true");
  });

  it('⭐ MALZEME kar kolonu ETKILENMEZ (yanlis kolonu kapatmayalim)', () => {
    // Ayni blok `_malzKar`i da isliyor; kosul yalniz `_iscKar` icin.
    expect(g).toContain("karField === '_iscKar' ? laborEnabled : true");
  });

  it('⭐ iscilik birim/toplam kolonlari ROL uzerinden bulunuyor', () => {
    // Sabit ad kiyaslamasi YANLIS olurdu: bu kolonlarin adi Excel dosyasindan
    // gelir, sabit degildir.
    expect(g).toContain('laborUnitPriceField, data.columnRoles?.laborTotalField');
    expect(g).toContain('const iscilikKolonuMu =');
  });

  it('⭐ iscilik birim/toplam kolonlari DUZENLENEMEZ yapiliyor', () => {
    expect(g).toContain('iscilikKolonuMu(c.field) && !laborEnabled');
  });

  it('⭐ SOLUK gorunum EN SONDA uygulaniyor (onceki cellStyle ezmesin)', () => {
    const stilDali = g.indexOf('base.cellStyle = ((params: any) => {');
    const soluk = g.indexOf('solukAlanlar');
    expect(stilDali).toBeGreaterThan(-1);
    expect(soluk).toBeGreaterThan(stilDali);
  });

  it('⭐ soluk boyama onceki stili KORUYOR (uzerine yaziyor, silmiyor)', () => {
    expect(g).toContain('typeof oncekiStil === ');
    expect(g).toContain('...(taban ?? {})');
  });

  it('⭐ laborEnabled kolon useMemo BAGIMLILIGINDA (yetenek gelince yenilensin)', () => {
    // Yoksa yetenekler async gelince kolonlar ESKI haliyle kalir ve kapi
    // hic devreye girmez.
    const dep = g.indexOf('}, [data, brands, onBrandChange, laborFirms, sheetDiscipline, laborEnabled');
    expect(dep).toBeGreaterThan(-1);
  });
});
