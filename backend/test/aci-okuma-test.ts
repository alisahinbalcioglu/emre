/**
 * A3 KILIDI — ACI OKUMA (fitting aci suzgeci)
 *   npx ts-node test/aci-okuma-test.ts   (npm run test:aci-okuma)
 *
 * ── OLCULEN KUSUR (02.10, gercek Pimtas listesi) ──────────────────────────
 * `query-engine` fitting ailesinde aci suzgeci kosturur: satirda aci varsa
 * aci-uyumsuz urunler elenir. Okuyucu `(\d{2,3})\s*(?:°|derece)` idi ve
 * YALNIZ urunun ADINI okuyordu. Uc bosluk:
 *   (1) ONDALIK aci okunmuyor  — "22,5°" → null  (ayrica "22.5°" de)
 *   (2) TEK HANE okunmuyor     — "5°"    → null
 *   (3) CINS okunmuyor         — aci `cins` kolonundaysa gorulmez
 *
 * (1) KULLANICI-GORUNUR: okunmayan aci "acisi YOK" demektir ve koddaki
 * `urunAci === null && satirAci === '90'` kurali o urunu 90° satirina ADAY
 * yapar. Yani "90° dirsek" satirina 22,5° dirsek eslesir.
 *
 * GERCEK LISTEDE SAYILDI (3.293 adli satir, aci tasiyan 336):
 *   198  kapi KOSMAZ  · eski okumaz → "Deve Boynu" ‖ "22,5° PN 10" (aci CINSTE,
 *                                     aile kendi adi — suzgec bu urunlere HIC
 *                                     uygulanmiyor; bkz. KAPSAM DISI)
 *   132  kapi kosar   · eski okur   → "U-PVC 45° … Dirsek" (aci ADDA, tam sayi)
 *     6  kapi kosar   · ESKI OKUMAZ → "U-PVC 22,5° Geçme Muflu Dirsek F/F"
 * Yani ONDALIK duzeltmesi bu listede 6 satiri DOGRUDAN duzeltir ve o 6'si tam
 * olarak bildirilen belirtidir. CINS okumasi bu listede 0 satir etkiler (cinste
 * aci tasiyan 198 satirin hepsi kapinin kosmadigi ailede) — yine de yapilir:
 * kural "aci nerede yazarsa yazsin ayni urundur", baska listede cinste olacak.
 *
 * ── KAPSAM DISI (olculdu, ayri karar) ─────────────────────────────────────
 * Aci suzgeci YALNIZ `familySlug === 'fitting'` iken kosar. Gercek listedeki
 * 198 satir kendi-ailesinde ("u-pvc gecme muflu temiz su deve boynu") oldugu
 * icin suzgece HIC girmiyor. Bu kapi onu DEGISTIRMEZ — aile kisitini kaldirmak
 * cok daha genis bir davranis degisikligidir (aci suzgeci bircok kendi-aileli
 * urune uygulanmaya baslar) ve kendi olcumunu ister.
 */

import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
import type { IndexedRow } from '../src/ozellik/eslestirme/matching/index/types';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

let n = 0;
function urun(c: Partial<ProductColumns> & { ad: string; price: number }): IndexedRow {
  const idx = buildProductIndex(c as ProductColumns);
  n++;
  return {
    id: `lib-${n}`, listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY',
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null,
      kategori: null, boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: null },
  } as IndexedRow;
}
const sor = (satir: string, havuz: IndexedRow[]) => runQuery(parseLine(satir), havuz, undefined) as any;
const adlar = (o: any): string[] =>
  (o.kind === 'ask' ? o.rows : o.kind === 'single' || o.kind === 'auto-variant' ? [o.row] : [])
    .map((r: any) => `${r.urun.ad}${r.urun.cins ? ' | ' + r.urun.cins : ''}`);
const ozet = (o: any) => `${o.kind}${o.reason ? '/' + o.reason : ''} → ${JSON.stringify(adlar(o))}`;

async function main() {
  // ── F: ACI ADDA, ONDALIK (gercek listedeki 6 satir) ─────────────────────
  const F = [
    urun({ ad: 'U-PVC 22,5° Geçme Muflu Dirsek F/F', cap: '110 mm', price: 22 }),
    urun({ ad: 'U-PVC 90° Geçme Muflu Dirsek F/F', cap: '110 mm', price: 90 }),
    urun({ ad: 'U-PVC 45° Geçme Muflu Dirsek F/F', cap: '110 mm', price: 45 }),
  ];
  // ⚠ GENEL SATIR SART: tam-ad satirinda ("U-PVC 90° … F/F") exact-name yolu
  // dogru urunu zaten seciyor ve aci suzgecini GOLGELIYOR — o satirla yazilan
  // assert, okuyucu eski 2-3 haneli haline dondurulse bile YESIL kaliyordu
  // (olculdu). Kusur ancak satir GENEL oldugunda (ad token'lari ayirt etmiyor)
  // aci suzgecine kalir. Asagidaki iki assert ayni vakanin iki yazimi.
  const g90 = sor('Dirsek 90° 110 mm', F);
  check('★ F GENEL 90° satirina 22,5° dirsek ADAY OLMAZ (aci suzgeci)',
    g90.kind === 'single' && adlar(g90)[0].includes('90°'), ozet(g90));
  const g225 = sor('Dirsek 22,5° 110 mm', F);
  check('★ F GENEL 22,5° satiri kendi urununu bulur',
    g225.kind === 'single' && adlar(g225)[0].includes('22,5°'), ozet(g225));
  const g225n = sor('Dirsek 22.5° 110 mm', F);
  check('★ F GENEL nokta yazimi da ayni urunu bulur (virgul→nokta)',
    g225n.kind === 'single' && adlar(g225n)[0].includes('22,5°'), ozet(g225n));

  const f90 = sor('U-PVC 90° Geçme Muflu Dirsek F/F 110 mm', F);
  check('★ F 90° satirina 22,5° dirsek ADAY OLMAZ',
    !adlar(f90).some((a) => a.includes('22,5°')), ozet(f90));
  check('F 90° satiri 90° urunu bulur', adlar(f90).some((a) => a.includes('90°')), ozet(f90));

  const f225 = sor('U-PVC 22,5° Geçme Muflu Dirsek F/F 110 mm', F);
  check('★ F ondalik aci (22,5°) OKUNUR ve kendi urununu bulur',
    adlar(f225).length === 1 && adlar(f225)[0].includes('22,5°'), ozet(f225));

  // Nokta yazimi da ayni urundur (ayni aci, baska yazim)
  const f225n = sor('U-PVC 22.5° Geçme Muflu Dirsek F/F 110 mm', F);
  check('F nokta yazimi (22.5°) ayni aciyi bulur',
    adlar(f225n).length === 1 && adlar(f225n)[0].includes('22,5°'), ozet(f225n));

  // ── C: ACI CINSTE (ikinci aile — bu listede 0 satir, baska listede olur) ─
  const C = [
    urun({ ad: 'Dirsek', cins: '45° PN 16', cap: '110 mm', price: 70 }),
    urun({ ad: 'Dirsek', cins: '87° PN 16', cap: '110 mm', price: 80 }),
  ];
  const c45 = sor('Dirsek 45° 110 mm', C);
  check('★ C aci CINSTE yazili urun bulunur (45°)',
    adlar(c45).length === 1 && adlar(c45)[0].includes('45°'), ozet(c45));
  const c90 = sor('Dirsek 90° 110 mm', C);
  check('★ C 90° satirina 45°/87° urun ADAY OLMAZ (acilari artik okunuyor)',
    adlar(c90).length === 0, ozet(c90));

  // ── T: TAM AD KIYASINDA ACI SOZCUGU URUN TARAFINDAN DA ATILIR ───────────
  // Satirda aci yoksa `adCekirdekAci` satirdan aci token'ini atiyordu ama urun
  // token'lari aciyi TASIYOR — tam-ad kiyasi (kume esitligi) bu yuzden kaciyor.
  const t = sor('U-PVC Geçme Muflu Dirsek F/F 110 mm', F);
  check('T acisiz satir aci tasiyan UC urunu de gorur (suzgec kosmaz, soru acilir)',
    adlar(t).length === 3, ozet(t));

  // ── K: KARSI ORNEKLER — bugunku dogru davranis AYNEN kalmali ────────────
  const K = [
    urun({ ad: 'U-PVC 45° Geçme Muflu Dirsek F/F', cap: '110 mm', price: 45 }),
    urun({ ad: 'U-PVC 90° Geçme Muflu Dirsek F/F', cap: '110 mm', price: 90 }),
  ];
  const k45 = sor('U-PVC 45° Geçme Muflu Dirsek F/F 110 mm', K);
  check('K tam sayi aci (45°) eskisi gibi tek eslesme', k45.kind === 'single', ozet(k45));

  // Acisi GERCEKTEN olmayan urun 90° satirina aday KALIR (kural korunur)
  const K2 = [urun({ ad: 'Geçme Muflu Dirsek', cap: '110 mm', price: 10 })];
  const k90 = sor('Geçme Muflu Dirsek 90° 110 mm', K2);
  check('K acisi HIC yazmayan urun 90° satirina aday kalir',
    adlar(k90).length === 1, ozet(k90));

  // Farkli aci ayri urundur
  const k135 = sor('U-PVC 135° Geçme Muflu Dirsek F/F 110 mm', K);
  check('K farkli aci (135°) eslesmez', adlar(k135).length === 0, ozet(k135));

  console.log(`\n${'='.repeat(60)}\nA3 ACI OKUMA: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
