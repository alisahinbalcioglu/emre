/**
 * CAP SORGUYA GIRER — kaynak taramasi kapisi (12.08).
 *
 * ── KUSUR ───────────────────────────────────────────────────────────────────
 * `buildMaterialContextDetailed` `diameterField`i HIC bilmiyordu. Ad hucresi
 * doluyken HER daldan bos olmayan `name` dondugu icin cagiranlardaki
 * `ctxDetail.name || <capli ad>` ifadelerinde CAPLI dal PRATIKTE OLUYDU —
 * DWG satirlarinda motora CAPSIZ ad gidiyordu.
 *
 * BEDELI SESSIZ VE PARASAL: cap sorguda yoksa `query-engine.ts`teki sert cap
 * filtresi (`if (line.capInfo)`) HIC kosmaz. Kutuphanede o aileden TEK kalem
 * varsa `rows.length === 1` → `kind:'single'` → outcome-mapper fiyati YAZAR.
 * Yani Ø110 satirina Ø50'nin fiyati sessizce girerdi. Capli sorguda ayni satir
 * `{kind:'none', reason:'cap-yok', mevcutCaplar}` donup kullaniciya "bu cap
 * yok, en yakin: 50/100" derdi.
 *
 * ── NEDEN KAYNAK TARAMASI ───────────────────────────────────────────────────
 * ExcelGrid.tsx AG-Grid olay nesnelerine bagli ve bu depoda jsdom YOK; o yollar
 * birim testiyle kosulamiyor. Olculebilen tek sey KAYNAGIN KENDISI. Ayni desen
 * projede yerlesik: `ozellik/fiyat/kar-tek-suzgec.test.ts`,
 * `ozellik/tablo/excel-grid/isaret.test.ts`, `lib/marj-tek-kaynak.test.ts`.
 *
 * ⚠ OLCUT ADI DEGIL KULLANIMI ARAR. Bu depoda kapi yazarken tam bu tuzaga
 * dusuldu (isaret kapisi, mutasyon M10): kriter degiskenin ADINI ariyordu,
 * bildirim satiri yerinde kaldigi icin kullanim silindiginde kapi YESIL yandi.
 * Asagidaki kriterler cagri ARGUMAN LISTESINI ve `capliAd` govdesini olcer.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const EXCELGRID = path.join(__dirname, 'ExcelGrid.tsx');

/** `buildMaterialContextDetailed(` cagrilarinin arguman listelerini cikarir
 *  (cok satirli cagrilar dahil — parantez dengeleyerek). */
function cagriArgumanlari(src: string, fnAdi: string): string[] {
  const out: string[] = [];
  let i = 0;
  const desen = fnAdi + '(';
  while ((i = src.indexOf(desen, i)) !== -1) {
    let derinlik = 0;
    let j = i + desen.length - 1;
    for (; j < src.length; j++) {
      if (src[j] === '(') derinlik++;
      else if (src[j] === ')') { derinlik--; if (derinlik === 0) break; }
    }
    out.push(src.slice(i + desen.length, j));
    i = j;
  }
  return out;
}

const KRITERLER: Array<{ ad: string; gecer: (s: string) => boolean }> = [
  {
    ad: 'buildMaterialContextDetailed imzasi diameterField ALIR',
    gecer: (s) => /function buildMaterialContextDetailed\([\s\S]{0,400}?diameterField\?: string,/.test(s),
  },
  {
    ad: 'cap KOLONDAN okunur (kolonCapi)',
    gecer: (s) => /const kolonCapi = diameterField \? String\(currentNode\.data\[diameterField\]/.test(s),
  },
  {
    ad: 'capliAd once KOLON capini kullanir',
    gecer: (s) => /if \(kolonCapi\) return `\$\{ad\} \$\{kolonCapi\}`;/.test(s),
  },
  {
    ad: 'cap ADIN SONUNA eklenir, BASINA DEGIL (S4 startsWith kapisi yasasin)',
    gecer: (s) => !/return `\$\{kolonCapi\} \$\{ad\}`/.test(s),
  },
  {
    ad: 'buildMaterialContext sarmalayicisi diameterField ILETIR',
    gecer: (s) => /return buildMaterialContextDetailed\(api, rowIdx, nameField, noField, brandField, quantityField, diameterField\)/.test(s),
  },
  {
    // ⚠ ASIL KRITER: TEK BIR cagri bile capsiz kalirsa golgeleme orada yasar.
    ad: 'buildMaterialContextDetailed cagrilarinin HEPSI diameterField gecirir',
    gecer: (s) => {
      const args = cagriArgumanlari(s, 'buildMaterialContextDetailed')
        .filter((a) => !/\?: string/.test(a)); // fonksiyon TANIMI degil, CAGRI
      return args.length >= 5 && args.every((a) => /diameterField/.test(a));
    },
  },
];

describe('CAP SORGUYA GIRER — kaynak taramasi', () => {
  it('A) ExcelGrid.tsx GERCEKTEN okunabiliyor (bos-kume kapisi)', () => {
    expect(fs.existsSync(EXCELGRID), 'ExcelGrid.tsx bulunamadi — kapi kapsamini kaybetmis').toBe(true);
    expect(fs.readFileSync(EXCELGRID, 'utf8').length).toBeGreaterThan(50000);
    expect(KRITERLER.length).toBeGreaterThanOrEqual(6);
  });

  it('B) cap sorgu adina giriyor ve HICBIR cagri disarida kalmiyor', () => {
    const s = fs.readFileSync(EXCELGRID, 'utf8');
    const ihlaller = KRITERLER.filter((k) => !k.gecer(s)).map((k) => k.ad);
    expect(ihlaller, 'Cap golgelemesi geri gelmis:\n' + ihlaller.join('\n')).toEqual([]);
  });

  it('C) cagri sayaci PAYDAYI kilitler — kapi bos kumede yesil yanamaz', () => {
    // "hepsi gecirir" kriteri BOS dizide de dogrudur (.every yalanci yesil).
    // Payda burada acikca olculur.
    const s = fs.readFileSync(EXCELGRID, 'utf8');
    const cagrilar = cagriArgumanlari(s, 'buildMaterialContextDetailed')
      .filter((a) => !/\?: string/.test(a));
    expect(cagrilar.length).toBeGreaterThanOrEqual(5);
  });

  it('D) OLCUTUN KENDISI olculuyor: ESKI icerik bu kapidan GECEMEZ', () => {
    // Fix oncesi ExcelGrid.tsx'in ilgili satirlarinin birebir replikasi.
    const ESKI = `
      function buildMaterialContextDetailed(
        api: any,
        rowIdx: number,
        nameField?: string,
        noField?: string,
        brandField?: string,
        quantityField?: string,
      ): { name: string; header: string | null } {
        const capliAd = (ad: string) =>
          altBaglam?.cap && !extractCapFromText(ad) ? \`\${ad} \${altBaglam.cap}\` : ad;
      }
      const ctxDetail = buildMaterialContextDetailed(api, node.rowIndex ?? 0, nameField, noField, brandField, quantityField);
      const queryName = ctxDetail.name || currentName;
    `;
    const gecenler = KRITERLER.filter((k) => k.gecer(ESKI)).map((k) => k.ad);
    // Yalniz "basa eklenmez" kriteri eski icerikte de dogrudur (orada hic
    // kolonCapi yok) — o yuzden beklenen gecen kume TAM OLARAK odur.
    expect(gecenler).toEqual(['cap ADIN SONUNA eklenir, BASINA DEGIL (S4 startsWith kapisi yasasin)']);
  });
});
