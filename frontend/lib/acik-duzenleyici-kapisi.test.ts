/**
 * ACIK DUZENLEYICI KAPISI (05.10) — /quotes/new satir okuyan/degistiren her
 * eylemin BASINDA acik hucre duzenleyicisini isler (`duzenlemeyiBitir()`).
 *
 * Neden kaynak kapisi: kayit yolunu bugun sayfa yeniden cizimi TESADUFEN
 * koruyor (e2e AD1 kapi olmadan da yesil — olculdu); kapinin silinmesini
 * yalniz sira olcumu yakalar. Davranisi e2e olcer: sekme degisimi (AD2) kapi
 * olmadan degeri SILIYORDU. Bu dosya her eylemde kapinin satir okumadan
 * ONCE cagrildigini ve gercekten `stopEditing()` oldugunu kilitler.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SAYFA = path.resolve(__dirname, '../app/(protected)/quotes/new/page.tsx');
const kaynak = fs.readFileSync(SAYFA, 'utf8');

/** Yorumlari bosluga cevirir (konumlar korunur) — yorumdaki ibare kodu olcmez. */
function yorumsuz(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, on) => on + ' '.repeat(m.length - on.length));
}
const kod = yorumsuz(kaynak);

/** `bas` ifadesinden sonraki ilk `{`'dan eslesen `}`'a kadar govde. */
function govde(bas: RegExp): string {
  const m = bas.exec(kod);
  if (!m) return '';
  const ilk = kod.indexOf('{', m.index + m[0].length - 1);
  let derinlik = 0;
  for (let i = ilk; i < kod.length; i++) {
    if (kod[i] === '{') derinlik++;
    else if (kod[i] === '}' && --derinlik === 0) return kod.slice(ilk, i + 1);
  }
  return '';
}

const OKUMA = /liveRowDataBySheet|getRowData\(|setActiveSheetIndex\(|mergeMultiSheet\(|setColFloorsBySheet\(/;

const EYLEMLER: Array<[string, RegExp]> = [
  ['handleSave (Teklifi Kaydet)', /async function handleSave\(\)\s*\{/],
  ['SheetTabs onChange (sekme degisimi)', /<SheetTabs[\s\S]*?onChange=\{\(idx\) => \{/],
  ['handleCeviri (ceviri)', /const handleCeviri = async \(\) => \{/],
  ['duzeltmeyiUygula (ceviri duzeltmesi)', /const duzeltmeyiUygula = \([^)]*\) => \{/],
  ['applyIncomingMultiSheet (Excel yeniden yukleme)', /function applyIncomingMultiSheet\([^)]*\)\s*\{/],
  ['toggleColumnFloor (kat sutunu)', /function toggleColumnFloor\([^)]*\)\s*\{/],
  ['removeColumn (sutun silme)', /async function removeColumn\([^)]*\)\s*\{/],
];

describe('/quotes/new acik duzenleyici kapisi', () => {
  it('kapi gercekten izgaranin stopEditing()ini cagirir', () => {
    expect(kod).toMatch(/const duzenlemeyiBitir = \(\) => excelGridRef\.current\?\.stopEditing\(\);/);
  });

  it.each(EYLEMLER)('%s satir okumadan ONCE duzenlemeyiBitir() cagirir', (_ad, bas) => {
    const g = govde(bas);
    // FIKSTUR KANITI: eylem bulundu ve gercekten satir okuyor/degistiriyor
    expect(g.length, 'eylem govdesi bulunamadi').toBeGreaterThan(20);
    const okuma = g.search(OKUMA);
    expect(okuma, 'eylem satir okumuyor — kapi bu eylemi olcmez').toBeGreaterThan(-1);
    const kapi = g.indexOf('duzenlemeyiBitir()');
    expect(kapi, 'kapi cagrisi yok').toBeGreaterThan(-1);
    expect(kapi, 'kapi satir okumadan SONRA').toBeLessThan(okuma);
  });
});
