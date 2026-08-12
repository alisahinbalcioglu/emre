/**
 * FIYAT HUCRESI ISARETI — MALZEME ↔ ISCILIK IKIZI (12.08).
 *
 * KUSUR: doldurma yolu iscilik dalinda `_labStatus`/`_labSebep`/
 * `_labAdaySayisi` yaziyordu ama UC okuyucunun UCU DE (cellStyle, tooltip,
 * "N satir secim bekliyor" sayaci) yalniz `_matStatus` okuyordu. Iscilik
 * firmasi surukle-doldur yapilan satirlar, o firmada kalem yoksa TAMAMEN
 * SESSIZ kaliyordu.
 *
 * ★ TEST GERCEKTEN AYIRT EDIYOR MU? — eski okuyucularin replikasi
 * (`eskiStil`, `eskiTooltip`, `eskiSayacOlcutu`) ayni kriterlerle olculur ve
 * ISCILIK tarafinda IHLAL ETTIKLERI assert edilir.
 *
 * ⚠ BIR ASSERT TEK KRITERE: her kriter kendi it() blogunda.
 * ⚠ MALZEME DAVRANISI DEGISMEDI — A blogu eski cikti ile BIREBIR karsilastirir
 *   (ExcelGrid.tsx'ten tasima sirasinda sessiz kayma olmadigi olculur).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isaretStili, isaretTooltip, secimBekliyor, type IsaretGirdisi } from './isaret';

// ── ESKI OKUYUCULARIN REPLIKASI (ExcelGrid.tsx, fix oncesi) ─────────────────

/** ExcelGrid.tsx:2336-2352 — YALNIZ `_matStatus` okurdu. */
function eskiStil(d: any): { backgroundColor?: string; color?: string } | null {
  if (d?._matAutoVariant) return { backgroundColor: '#e0f2fe', color: '#0c4a6e' };
  if (d?._matSuggestion) return { backgroundColor: '#fef9c3', color: '#854d0e' };
  if (d?._matStatus === 'yok' || d?._matStatus === 'belirsiz') return { backgroundColor: '#fee2e2' };
  if (d?._matStatus === 'urun_degil') return { backgroundColor: '#f1f5f9' };
  return null;
}

/** ExcelGrid.tsx:2354-2372 — YALNIZ `_mat*` alanlarini okurdu. */
function eskiTooltip(d: any): string {
  if (d._matAutoVariant) return `⚡ otomatik: ${d._matAutoVariant} — farklı varyant için marka menüsünü yeniden açın`;
  if (d._matStatus === 'belirsiz') {
    const n = d._matAdaySayisi;
    return [d._matSebep || 'Seçim bekliyor',
      n ? `${n} aday var — marka menüsünü açıp seçin` : 'marka menüsünü açıp varyant seçin',
    ].join(' · ');
  }
  if (d._matStatus === 'yok') return d._matSebep || 'Kütüphanede eşleşme yok';
  if (d._matStatus === 'hata') return `Eşleştirme hatası: ${d._matSebep || 'bilinmeyen'} — tekrar deneyin`;
  if (d._matStatus === 'ad-yok') return 'Bu satırda malzeme adı yok — fiyat sorgulanamadı';
  if (d._matStatus === 'urun_degil') return 'Oran/hizmet satırı — fiyat beklenmiyor';
  if (d._matSuggestion) return 'Öneri — kontrol edin';
  return '';
}

/** ExcelGrid.tsx:1760 — sayac YALNIZ `_matStatus` sayardi. */
function eskiSayacOlcutu(d: any): boolean {
  return d._matStatus === 'yok' || d._matStatus === 'belirsiz';
}

const malz = (p: Partial<IsaretGirdisi> = {}): IsaretGirdisi => ({ dal: 'malzeme', ...p });
const isc = (p: Partial<IsaretGirdisi> = {}): IsaretGirdisi => ({ dal: 'iscilik', ...p });

// ── A) MALZEME DAVRANISI DEGISMEDI (tasima muhru) ───────────────────────────

describe('isaret — malzeme davranisi ExcelGrid.tsx ile BIREBIR', () => {
  const VAKALAR: Array<{ ad: string; d: any }> = [
    { ad: 'otomatik varyant', d: { _matAutoVariant: 'kaynaklı' } },
    { ad: 'oneri', d: { _matSuggestion: true } },
    { ad: 'belirsiz + sebep + aday', d: { _matStatus: 'belirsiz', _matSebep: 'Çap eşleşmedi', _matAdaySayisi: 3 } },
    { ad: 'belirsiz, aday sayisi yok', d: { _matStatus: 'belirsiz' } },
    { ad: 'yok', d: { _matStatus: 'yok' } },
    { ad: 'yok + sebep', d: { _matStatus: 'yok', _matSebep: 'Markada bu cins yok' } },
    { ad: 'hata', d: { _matStatus: 'hata', _matSebep: 'HTTP 500' } },
    { ad: 'ad-yok', d: { _matStatus: 'ad-yok' } },
    { ad: 'urun_degil', d: { _matStatus: 'urun_degil' } },
    { ad: 'temiz satir', d: { _matStatus: '' } },
  ];

  it('stil ciktisi eski okuyucuyla AYNI (10 vaka)', () => {
    // ⚠ BOS DIZIDE .every() YALANCI YESIL — payda acikca kilitlenir.
    expect(VAKALAR).toHaveLength(10);
    for (const { ad, d } of VAKALAR) {
      const yeni = isaretStili(malz({
        durum: d._matStatus, sebep: d._matSebep, adaySayisi: d._matAdaySayisi,
        otoVaryant: d._matAutoVariant, oneri: d._matSuggestion,
      }));
      expect(yeni, `stil sapti: ${ad}`).toEqual(eskiStil(d));
    }
  });

  it('tooltip ciktisi eski okuyucuyla AYNI (10 vaka)', () => {
    expect(VAKALAR).toHaveLength(10);
    for (const { ad, d } of VAKALAR) {
      const yeni = isaretTooltip(malz({
        durum: d._matStatus, sebep: d._matSebep, adaySayisi: d._matAdaySayisi,
        otoVaryant: d._matAutoVariant, oneri: d._matSuggestion,
      }));
      expect(yeni, `tooltip sapti: ${ad}`).toBe(eskiTooltip(d));
    }
  });
});

// ── B) ISCILIK TARAFI ARTIK ISARETLENIYOR (IKIZ) ────────────────────────────

describe('isaret — iscilik tarafi (ikiz)', () => {
  it("iscilik 'yok' KIRMIZI hucre uretir", () => {
    expect(isaretStili(isc({ durum: 'yok' }))).toEqual({ backgroundColor: '#fee2e2' });
  });

  it("iscilik 'belirsiz' KIRMIZI hucre uretir", () => {
    expect(isaretStili(isc({ durum: 'belirsiz' }))).toEqual({ backgroundColor: '#fee2e2' });
  });

  it("iscilik 'urun_degil' GRI hucre uretir", () => {
    expect(isaretStili(isc({ durum: 'urun_degil' }))).toEqual({ backgroundColor: '#f1f5f9' });
  });

  it('iscilik tooltip SEBEP ve ADAY SAYISINI tasir (SD6: isaret eylemli)', () => {
    const t = isaretTooltip(isc({ durum: 'belirsiz', sebep: 'Birim uyuşmuyor', adaySayisi: 4 }));
    expect(t).toBe('Birim uyuşmuyor · 4 aday var — firma menüsünü açıp seçin');
  });

  it("iscilik tooltip'i kullaniciyi FIRMA menusune yollar, marka menusune DEGIL", () => {
    const t = isaretTooltip(isc({ durum: 'belirsiz', adaySayisi: 2 }));
    expect(t).toContain('firma menüsünü');
    expect(t).not.toContain('marka menüsünü');
  });

  it("iscilik 'ad-yok' metni ISCILIK der, malzeme DEMEZ", () => {
    expect(isaretTooltip(isc({ durum: 'ad-yok' }))).toBe('Bu satırda işçilik adı yok — fiyat sorgulanamadı');
  });

  it('ESKI OKUYUCU bu kriteri IHLAL EDERDI — iscilik satiri isaretsiz kalirdi', () => {
    const iscilikSatiri = { _labStatus: 'yok', _labSebep: 'Firmada bu kalem yok' };
    expect(eskiStil(iscilikSatiri)).toBeNull();      // hucre boyanmazdi
    expect(eskiTooltip(iscilikSatiri)).toBe('');     // tooltip bos
    expect(isaretStili(isc({ durum: 'yok' }))).not.toBeNull();
  });
});

// ── C) MALZEMEYE OZGU ISARETLER ISCILIGE SIZMAZ ─────────────────────────────

describe('isaret — malzemeye ozgu sinyaller iscilikte okunmaz', () => {
  it('iscilik dalinda otoVaryant MAVI yapmaz (dolduran yol onu zaten yazmaz)', () => {
    expect(isaretStili(isc({ otoVaryant: 'kaynaklı' }))).toBeNull();
  });

  it('iscilik dalinda oneri SARI yapmaz', () => {
    expect(isaretStili(isc({ oneri: true }))).toBeNull();
  });

  it('iscilik dalinda otoVaryant tooltip uretmez', () => {
    expect(isaretTooltip(isc({ otoVaryant: 'kaynaklı' }))).toBe('');
  });
});

// ── D) GUVEN KAPISI SAYACI OLCUTU ───────────────────────────────────────────

describe('secimBekliyor — sayac olcutu', () => {
  it("'yok' bekliyor sayilir", () => expect(secimBekliyor('yok')).toBe(true));
  it("'belirsiz' bekliyor sayilir", () => expect(secimBekliyor('belirsiz')).toBe(true));
  it("'urun_degil' bekliyor SAYILMAZ (fiyat beklenmiyor)", () => expect(secimBekliyor('urun_degil')).toBe(false));
  it("bos durum bekliyor sayilmaz", () => expect(secimBekliyor('')).toBe(false));
  it('tanimsiz durum bekliyor sayilmaz', () => expect(secimBekliyor(undefined)).toBe(false));

  it('ESKI SAYAC bu kriteri IHLAL EDERDI — iscilik bekleyeni gormezdi', () => {
    const satir = { _matStatus: '', _labStatus: 'yok' };
    expect(eskiSayacOlcutu(satir)).toBe(false); // sayac 0 gosteriyordu
    // Yeni olcut satiri iki taraftan da sorar (ExcelGrid OR'lar):
    expect(secimBekliyor(satir._matStatus) || secimBekliyor(satir._labStatus)).toBe(true);
  });
});

// ── E) BAGLANTI KAPISI: ExcelGrid GERCEKTEN bu modulu kullaniyor mu? ────────
//
// NEDEN KAYNAK TARAMASI: yukaridaki bloklar KARAR mantigini olcuyor, ama
// karar dogru olsa bile ExcelGrid onu CAGIRMAZSA kullanici hicbir sey gormez
// ("wiring" kusuru — bu depoda daha once tam olarak boyle yasandi: doldurma
// yolu `_labStatus` YAZIYORDU, hicbir okuyucu yoktu ve testler yesildi).
// ExcelGrid.tsx AG-Grid olay nesnelerine bagli ve bu depoda jsdom YOK; o yollar
// birim testiyle kosulamiyor. Olculebilen tek sey KAYNAGIN KENDISI.
// Ayni desen projede zaten var: `ozellik/fiyat/kar-tek-suzgec.test.ts`,
// `lib/marj-tek-kaynak.test.ts`, `lib/popup-secici-sozlesmesi.test.ts`.

const EXCELGRID = path.join(__dirname, 'ExcelGrid.tsx');

/** Kriterler icerik uzerinde TEK yerde tanimli — testle olcut ayni sey. */
const KRITERLER: Array<{ ad: string; gecer: (s: string) => boolean }> = [
  { ad: 'isaret modulunu import eder', gecer: (s) => /from '\.\/isaret'/.test(s) },
  { ad: 'iscilik fiyat kolonu icin isaret girdisi kurar', gecer: (s) => /dal:\s*'iscilik'/.test(s) && /durum:\s*d\?\._labStatus/.test(s) },
  // ⚠ PROXY OLCUT YASAGI (bu kapinin ilk hali tam bu tuzaga dustu): olcut
  // `/iscilikFiyatKolonu/` idi — yani DEGISKENIN ADINI ariyordu. `if` kosulundan
  // `|| iscilikFiyatKolonu` silindiginde bildirim satiri yerinde kaldigi icin
  // kapi YESIL yandi (mutasyon M10 sag kaldi). Olcut artik KULLANIMI arar.
  { ad: 'iscilik fiyat kolonu isaret DALINA GIRER (kosulda kullanilir)', gecer: (s) => /if\s*\(\s*malzemeFiyatKolonu\s*\|\|\s*iscilikFiyatKolonu\s*\)/.test(s) },
  { ad: 'sayac IKI tarafi da okur', gecer: (s) => /secimBekliyor\(d\._matStatus\)/.test(s) && /secimBekliyor\(d\._labStatus\)/.test(s) },
  { ad: 'FirmaDropdown fiyat yazarken isareti temizler', gecer: (s) => /yazVeriLab\(node, '_labStatus', ''\)/.test(s) },
  { ad: "FirmaDropdown aday donunce 'belirsiz' isaretler", gecer: (s) => /yazVeriLab\(node, '_labStatus', 'belirsiz'\)/.test(s) },
  { ad: "FirmaDropdown eslesme yokken 'yok'/'urun_degil' isaretler", gecer: (s) => /_labStatus',\s*\(result as any\)\?\.notProduct \? 'urun_degil' : 'yok'/.test(s) },
  // TEK KAYNAK: isaret renkleri modulde kaldi, ExcelGrid'e KOPYALANMADI.
  { ad: 'isaret renkleri ExcelGrid icinde kopyalanmamis', gecer: (s) => !/#fee2e2|#e0f2fe|#fef9c3/.test(s) },
];

describe('isaret — ExcelGrid baglanti kapisi (kaynak taramasi)', () => {
  it('A) ExcelGrid.tsx GERCEKTEN okunabiliyor (bos-kume kapisi)', () => {
    expect(fs.existsSync(EXCELGRID), 'ExcelGrid.tsx bulunamadi — kapi kapsamini kaybetmis olabilir').toBe(true);
    expect(fs.readFileSync(EXCELGRID, 'utf8').length).toBeGreaterThan(50000);
    expect(KRITERLER.length).toBeGreaterThanOrEqual(8);
  });

  it('B) ExcelGrid isaret modulune BAGLI ve iki tarafi da isaretliyor', () => {
    const s = fs.readFileSync(EXCELGRID, 'utf8');
    const ihlaller = KRITERLER.filter((k) => !k.gecer(s)).map((k) => k.ad);
    expect(ihlaller, 'ExcelGrid baglantisi kopmus:\n' + ihlaller.join('\n')).toEqual([]);
  });

  it('C) OLCUTUN KENDISI olculuyor: ESKI ExcelGrid icerigi bu kapidan GECEMEZ', () => {
    // Dairesel olcut yasagi: kural "hic ihlal yok" diye yesil yaniyorsa,
    // desenin gercekten calistigini AYRI kanitla. Asagidaki parca, fix
    // oncesi ExcelGrid.tsx'in ilgili satirlarinin birebir replikasidir.
    const ESKI = `
      if (field === data.columnRoles.materialUnitPriceField) {
        base.cellStyle = ((params: any) => {
          if (params.data?._matStatus === 'yok' || params.data?._matStatus === 'belirsiz') {
            return { textAlign: 'right', backgroundColor: '#fee2e2' };
          }
          return { textAlign: 'right' };
        }) as any;
      }
      if (d?._isDataRow && (d._matStatus === 'yok' || d._matStatus === 'belirsiz')) n++;
    `;
    const gecenler = KRITERLER.filter((k) => k.gecer(ESKI)).map((k) => k.ad);
    // Eski icerik kriterlerin HICBIRINI saglamamali (renk kopyasi dahil).
    expect(gecenler, 'ESKI icerik bu kriterleri gecmemeliydi: ' + gecenler.join(', ')).toEqual([]);
  });
});
