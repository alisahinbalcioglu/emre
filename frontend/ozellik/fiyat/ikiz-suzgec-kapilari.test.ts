/**
 * IKIZ KAPILARI — "ayni is iki tarafta da AYNI kodla yapilir" (28.08.2026)
 *
 * Bu dosya davranis degil KAYNAK KODU olcer. Sebep: iki kusur da ExcelGrid /
 * sayfa bilesenlerinin ICINDE yasiyor ve jsdom'suz kosulamiyor; ama ikisi de
 * "bir tarafta dogru, ikizinde yanlis" sinifindan — yani tam olarak metin
 * duzeyinde yakalanabilecek bir ayrisma.
 *
 * ── K1: ISARET TEMIZLEME (malzeme ↔ iscilik) ────────────────────────────────
 * Elle girilen ya da yapistirilan fiyat, satirdaki kirmizi "eslesme yok"
 * isaretini kaldirmali. Malzeme dalinda cagri VARDI ama `setDataValue` ile
 * yazilmisti: `_matStatus` bir grid KOLONU DEGIL, yalnizca satir verisinde
 * yasayan bir alan — AG Grid kolonu bulamayinca cagriyi SESSIZCE dusuruyor
 * (`return false`). Iscilik dalinda ise temizleme HIC YAZILMAMISTI.
 * Sonuc: fiyat girilse bile hucre kirmizi kaliyor ve "⚠ N satır seçim
 * bekliyor" bandi sonmuyordu. Dogru arac ayni kapsamdaki `yazVeriHucre`.
 *
 * ── K2: KUTUPHANE FIYAT SUZGECI (malzeme ↔ iscilik) ─────────────────────────
 * Kaydetme yolunda malzeme kutuphanesi ham `parseFloat` kullaniyordu:
 *   parseFloat('6.500,00')    → 6.5   (BIN KAT dusuk, kalici olarak DB'ye)
 *   parseFloat('₺105.800,00') → NaN → `|| 0` → 0 (fiyat SILINIR)
 * Iscilik ikizi ayni metni `parseTrNum` ile DOGRU okuyordu. Ayni alan, ikiz
 * sayfa, iki farkli sonuc.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KOK = join(__dirname, '..', '..');
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

const EXCEL_GRID = 'ozellik/tablo/excel-grid/ExcelGrid.tsx';
const MALZEME_SAYFA = 'app/(protected)/library/brand/[brandId]/page.tsx';
const ISCILIK_SAYFA = 'app/(protected)/labor-firms/[firmaId]/page.tsx';

describe('K1 — isaret temizleme ikizi (elle/yapistirilan fiyat kirmiziyi kaldirir)', () => {
  const src = oku(EXCEL_GRID);

  it('★ MALZEME dali isareti `yazVeriHucre` ile temizler', () => {
    expect(src).toContain("yazVeriHucre(e.node, '_matStatus', '')");
  });

  it('★ ISCILIK dali da temizler (ikiz — eskiden HIC yoktu)', () => {
    expect(src).toContain("yazVeriHucre(e.node, '_labStatus', '')");
  });

  it('★ ELLE GIRIS dalinda `setDataValue` ile isaret yazilmaz (sessizce duserdi)', () => {
    // Kapsam BILEREK dar: yalniz hucre-edit dalindaki `e.node` cagrilari.
    // ⚠ AYRI BORC (bu turun kapsami disi): marka/firma secim yolunda ayni
    // sinifin ALTI kopyasi daha var (`targetNode.setDataValue('_matStatus'…)`,
    // `node.setDataValue('_matStatus', 'belirsiz'|'yok'…)`). Kodun kendi
    // yorumu bunu zaten belgeliyor: "_matStatus grid KOLONU OLMADIGI icin
    // AG-Grid cagriyi sessizce yok sayiyordu (141 satirin 131'i isaretsiz
    // bos kaldi)". Onlar isareti YAZAN cagrilar; duzeltmek ekranda yeni
    // kirmizilar dogurur ve kendi olcumunu ister — ayri bir tur.
    expect(src).not.toContain("e.node.setDataValue('_matStatus'");
    expect(src).not.toContain("e.node.setDataValue('_labStatus'");
  });

  it('temizlemenin ardindan hucre TAZELENIR (dogrudan veri yazimi boyamaz)', () => {
    // `cellStyle` isareti okur; veri alanina yazmak yeniden cizim tetiklemez.
    // Iki dal da kendi tazelemesini yapmali — ikizin biri unutulursa o taraf
    // kirmizi kalir. (Dosyada baska baglamlarda da tazeleme var; bu yuzden
    // sayim degil, IKI DALIN metni olculur.)
    const malzemeDali = src.slice(src.indexOf("yazVeriHucre(e.node, '_matStatus', '')"));
    const iscilikDali = src.slice(src.indexOf("yazVeriHucre(e.node, '_labStatus', '')"));
    expect(malzemeDali.slice(0, 600)).toContain('refreshCells({ rowNodes: [e.node], force: true })');
    expect(iscilikDali.slice(0, 600)).toContain('refreshCells({ rowNodes: [e.node], force: true })');
  });
});

describe('K2 — kutuphane fiyat suzgeci ikizi (TR para metni)', () => {
  it('★ MALZEME kaydetme yolu ham `parseFloat` KULLANMAZ', () => {
    const src = oku(MALZEME_SAYFA);
    const satir = src.split(/\r?\n/).find((l) => l.includes('listPrice:'));
    expect(satir, 'listPrice alani bulunamadi — dosya yapisi degismis olabilir').toBeTruthy();
    expect(satir).toContain('numOrU');
    expect(satir).not.toContain('parseFloat');
  });

  it('★ ISCILIK ikizi kendi TR suzgecini kullanmaya devam eder', () => {
    const src = oku(ISCILIK_SAYFA);
    const satir = src.split(/\r?\n/).find((l) => l.includes('listPrice:'));
    expect(satir).toBeTruthy();
    expect(satir).toContain('parseTrNum');
  });

  it('★ IKI SUZGEC DE TR binlik ayiricisini atar (davranis ayrisamaz)', () => {
    // Kural: virgul VE nokta birlikteyse nokta binliktir, atilir.
    for (const [ad, yol] of [['malzeme', MALZEME_SAYFA], ['iscilik', ISCILIK_SAYFA]] as const) {
      const src = oku(yol);
      expect(src, `${ad} suzgecinde TR binlik kurali yok`).toMatch(/hasComma && hasDot/);
      expect(src, `${ad} suzgecinde para sembolu siyirma yok`).toMatch(/\[₺\$€\\s\]/);
    }
  });
});
