/**
 * FAZ B PARTI 2a KILIDI — KIMLIK SUZGECLERI (A4 · A6 · A7 · B8)
 *   npx ts-node test/kimlik-suzgecleri-test.ts   (npm run test:kimlik-suzgecleri)
 *
 * OLCULDU (04.10, saf motor):
 *   A4  cins/yuzey suzgeci urunun YALNIZ cins sutununa bakiyor. Ailenin
 *       dagarciginda kelime cinste gectigi icin satir kelimesi CINS sayiliyor;
 *       adinda tasiyan urun eleniyor:
 *         "PİRİNÇ KÜRESEL VANA 1\"" | [Küresel Vana·Pirinç 2", Pirinç Küresel
 *            Vana 1", Küresel Vana·Krom 1"] → none/cap-yok   ("bu markada yok" YALANI)
 *         "GALVANİZ BORU 1\""       | [Boru·Galvaniz 2", Galvaniz Boru 1",
 *            Boru·Siyah 1"] → ask [Galvaniz Boru 1" + SIYAH boru] (yuzey-genisletildi)
 *   A6  "capsiz" olcutu capTags bosluguydu: okunabilen ama cevrilemeyen capli
 *       urun (3/8") 1/2" satirina "capsiz" diye aday oluyor, gerekce "urunun
 *       capi dogrulanamadi" — oysa urunun capi BELLI ve FARKLI.
 *   A7  capraz-marka oneri barajinda (guclutekAday) ve teshis barajinda
 *       'dn-koprusu' YOK: istenen DN urunde yokken komsu DN oneri olarak
 *       sunuluyor. 'cap-belirsiz' (A2) ayni turden — o da yok.
 *   B8  tek harf "T" belirtec uretmiyor (tokenize <2 harfi atar): "T 1\"" → aile
 *       yok, onay listesi; "TE 1\"" / "TEE 1\"" otomatik. Te = Tee = T (14.08
 *       kullanici karari). ⚠ 't' TON da olabilir ("5 t celik") — hafiza notu:
 *       belirsiz kisaltmada yanlis esleme, eslememekten kotudur.
 */

import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery, guclutekAday, aileUyusmazligiTeshisi, urunVariantTags } from '../src/ozellik/eslestirme/matching/index/query-engine';
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
  return { id: `lib-${n}`, listPrice: c.price, customPrice: null, discountRate: 0, currency: 'TRY',
    urun: { ...idx, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null, kategori: c.kategori ?? null,
      boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: null } } as IndexedRow;
}
const sor = (q: string, h: IndexedRow[], opts?: any) => runQuery(parseLine(q), h, opts) as any;
const sec = (o: any): string[] => (o.kind === 'ask' ? o.rows : o.row ? [o.row] : []).map((r: any) => `${r.urun.ad}·${r.urun.cins ?? ''}·${r.urun.capRaw ?? ''}@${r.listPrice}`);
const ozet = (o: any) => `${o.kind}${o.reason ? '/' + o.reason : ''} ${JSON.stringify(sec(o))} kapilar=${JSON.stringify(o.kapilar)}`;

async function main() {
  // ══ A4 · cins/yuzey kelimesi urunun ADINDA ═════════════════════════════
  const vana = () => [urun({ ad: 'Küresel Vana', cins: 'Pirinç', cap: '2"', price: 120 }),
    urun({ ad: 'Pirinç Küresel Vana', cap: '1"', price: 80 }), urun({ ad: 'Küresel Vana', cins: 'Krom', cap: '1"', price: 70 })];
  const a1 = sor('PİRİNÇ KÜRESEL VANA 1"', vana());
  check('A4 fixture: "pirinc" satirda CINS kelimesi olarak siniflanir (dagarcik cinste)', parseLine('PİRİNÇ KÜRESEL VANA 1"').tokens.includes('pirinc'), JSON.stringify(parseLine('PİRİNÇ KÜRESEL VANA 1"').tokens));
  check('★ A4 cins kelimesi ADINDA olan urun bulunur ve yazilir (@80)', a1.kind === 'single' && a1.row?.listPrice === 80, ozet(a1));
  const boru = () => [urun({ ad: 'Boru', cins: 'Galvaniz', cap: '2"', price: 120 }),
    urun({ ad: 'Galvaniz Boru', cap: '1"', price: 60 }), urun({ ad: 'Boru', cins: 'Siyah', cap: '1"', price: 50 })];
  const a2 = sor('GALVANİZ BORU 1"', boru());
  check('★ A4 yuzey kelimesi ADINDA olan urun yazilir, SIYAH boru aday OLMAZ (@60)', a2.kind === 'single' && a2.row?.listPrice === 60, ozet(a2));
  const a3 = sor('SİYAH BORU 1"', boru());
  check('A4 karsi: yuzeyi CINSTE olan urun AYNEN (@50)', a3.kind === 'single' && a3.row?.listPrice === 50, ozet(a3));
  const a4 = sor('KROM KÜRESEL VANA 1"', vana());
  check('A4 karsi: cinsi CINSTE olan urun AYNEN (@70)', a4.kind === 'single' && a4.row?.listPrice === 70, ozet(a4));
  // Ad gevsetme yolu da ayni kurali gorur (swing ikizi): cins kelimesi adda
  const cek = [urun({ ad: 'Kelebek Vana', cins: 'Pirinç', cap: 'DN50', price: 1500 }), urun({ ad: 'Swing Çekvalf BC-100', cap: 'DN50', price: 2222 })];
  const a5 = sor('KELEBEK SWING VANA DN 50', cek);
  check('A4 ad-gevsetme: cins kelimesi ADINDA olan urun de bulunur (onayla)', a5.kind === 'ask' && sec(a5).some((x) => x.endsWith('@2222')), ozet(a5));

  // Mutasyonun yasattigi iki yer (04.10) — senaryosu yoktu:
  // ad gevsetme: cins kelimesi YALNIZ adinda olan urun. On kosul: kelime
  // CINS siniflanmali → malzeme kelimesi (pirinc) VE ailede cinsi pirinc olan
  // bir urun (baska cap). (Ilk fikstur 'swing' ile kuruldu: malzeme kelimesi
  // olmadigi icin AD siniflandi, gevsetme yoluna hic girilmedi — olculdu.)
  const cek2 = [urun({ ad: 'Kelebek Vana', cins: 'Döküm', cap: 'DN50', price: 1500 }),
    urun({ ad: 'Pirinç Küresel Vana', cap: 'DN50', price: 2100 }), urun({ ad: 'Küresel Vana', cins: 'Pirinç', cap: 'DN80', price: 3000 })];
  const a6g = sor('PİRİNÇ KELEBEK VANA DN 50', cek2);
  check('A4 ad-gevsetme: cins kelimesi YALNIZ adinda olan urun bulunur (@2100, onayla)',
    a6g.kind === 'ask' && sec(a6g).some((x) => x.endsWith('@2100')) && (a6g.kapilar ?? []).includes('ad-gevsetildi'), ozet(a6g));
  // yuzey OR yolu: celisen iki yuzey yazili, biri urunun ADINDA. On kosul:
  // iki kelime de CINS siniflanmali → ikisi de dagarcikta CINSTE gecmeli.
  // (Ilk fikstur galvanizi yalniz bir urun ADINA koymustu — AD siniflandi.)
  const or = [urun({ ad: 'Boru', cins: 'Galvaniz', cap: '1"', price: 90 }), urun({ ad: 'Galvaniz Boru', cap: '2"', price: 160 }),
    urun({ ad: 'Boru', cins: 'Siyah', cap: '2"', price: 140 }), urun({ ad: 'Boru', cins: 'Kırmızı Boyalı', cap: '2"', price: 150 })];
  const aor = sor('2" GALVANİZ SİYAH BORU', or);
  check('A4 yuzey OR: celisen yuzeylerden biri ADINDA olan urun listede (@160) + kirmizi DISARIDA',
    aor.kind === 'ask' && sec(aor).some((x) => x.endsWith('@160')) && !sec(aor).some((x) => x.endsWith('@150')), ozet(aor));

  // ══ A6 · cevrilemeyen capli urun "capsiz" DEGILDIR ═════════════════════
  const c38 = () => [urun({ ad: 'Küresel Vana', cins: 'Pirinç', cap: '3/8"', price: 40 })];
  const c1 = sor('KÜRESEL VANA 1/2"', c38());
  check('★ A6 1/2" satirina 3/8" capli urun "capsiz" diye aday OLMAZ', c1.kind === 'none', ozet(c1));
  const c2 = sor('KÜRESEL VANA 3/8"', c38());
  check('A6 karsi: ayni cevrilemez cap kendi satirina yazilir (@40)', c2.kind === 'single' && c2.row?.listPrice === 40, ozet(c2));
  const capsiz = [urun({ ad: 'Küresel Vana', cins: 'Pirinç', price: 45 })];
  const c3 = sor('KÜRESEL VANA 1/2"', capsiz);
  check('A6 karsi: GERCEKTEN capsiz urun aday kalir, onay ister (capsiz-dusum)', c3.kind === 'ask' && (c3.kapilar ?? []).includes('capsiz-dusum'), ozet(c3));
  const capMetni = [urun({ ad: 'Küresel Vana', cins: 'Pirinç', cap: 'Standart', price: 46 })];
  const c4 = sor('KÜRESEL VANA 1/2"', capMetni);
  check('A6 karsi: cap sutununda OLCU OLMAYAN metin ("Standart") capsiz sayilir', c4.kind === 'ask' && (c4.kapilar ?? []).includes('capsiz-dusum'), ozet(c4));

  // Surukleme kurtarmasi: CEVRILEBILIR satirda farkli okunabilir cap kurtarilmaz
  // (cevrilemez satirda — test:erken-kurtarma EK-17 — CC cizgisi gereği gorunur kalir)
  const ek = () => [urun({ ad: 'Boru', cins: 'çelik dikişli', cap: '5/8"', price: 700 }),
    urun({ ad: 'Zzqq Parça', kategori: 'Borular', cins: 'paslanmaz', cap: 'DN50', price: 5 })];
  const ekH = ek();
  const kurt = sor('PASLANMAZ BORU 1/2"', ekH, { variantTags: urunVariantTags(ekH[0]) });
  check('A6 surukleme: 1/2" satirina 5/8" kalem "capsiz" diye KURTARILMAZ', !sec(kurt).some((x) => x.endsWith('@700')), ozet(kurt));
  const kurt0 = sor('PASLANMAZ BORU 3/8"', ek(), { variantTags: urunVariantTags(ek()[0]) });
  check('A6 surukleme karsi: cevrilemez 3/8" satirinda kalem GORUNUR (CC)', sec(kurt0).some((x) => x.endsWith('@700')), ozet(kurt0));

  // ══ A7 · DN koprusu ve cap belirsizligi oneri/teshis barajinda ═════════
  const dnK = runQuery(parseLine('Boru DN 110'), [urun({ ad: 'Boru', cins: 'çelik dikişli siyah', cap: 'DN 100', price: 1200 }), urun({ ad: 'PPR Boru', cins: 'ppr', cap: '63 mm', price: 90 })]) as any;
  check('A7 fixture: komsu DN kapisi acik (dn-koprusu, tek aday)', dnK.kind === 'ask' && dnK.rows.length === 1 && (dnK.kapilar ?? []).includes('dn-koprusu'), ozet(dnK));
  check('★ A7 dn-koprusu adayi capraz-marka ONERISI olamaz', guclutekAday(dnK) === null, JSON.stringify(guclutekAday(dnK)?.row?.listPrice));
  const cb = runQuery(parseLine('Kör Flanş 1"'), [urun({ ad: 'Kör Flanş', cap: '3/4"', price: 70 })]) as any;
  check('A7 fixture: cap-belirsiz kapisi acik (tek aday)', cb.kind === 'ask' && cb.rows.length === 1 && (cb.kapilar ?? []).includes('cap-belirsiz'), ozet(cb));
  check('★ A7 cap-belirsiz (komsu cap) adayi ONERI olamaz', guclutekAday(cb) === null, JSON.stringify(guclutekAday(cb)?.row?.listPrice));
  const kesin = runQuery(parseLine('Boru DN 100'), [urun({ ad: 'Boru', cins: 'çelik dikişli siyah', cap: 'DN 100', price: 1200 })]) as any;
  check('A7 karsi: kesin aday oneri OLUR', !!guclutekAday(kesin), ozet(kesin));
  const bil = runQuery(parseLine('SARI KOLLU KÜRESEL VANA 20 mm'), [urun({ ad: 'Küresel Vana', cins: 'Pirinç', cap: '20 mm', price: 70 })]) as any;
  check('A7 karsi: ek nitelik kapisi (bilinmeyen-kelime) oneri OLUR (cekinceyle)', bil.kind === 'ask' && !!guclutekAday(bil), ozet(bil));

  // ══ B8 · tek harf T = Te ═══════════════════════════════════════════════
  const te = () => [urun({ ad: 'Te', cins: 'Galvaniz', cap: '1"', price: 30 }), urun({ ad: 'Eşit Te', cins: 'Galvaniz', cap: '1"', price: 31 }),
    urun({ ad: 'İnegal Te', cins: 'Galvaniz', cap: '1"', price: 32 }), urun({ ad: 'Dirsek', cins: 'Galvaniz', cap: '1"', price: 20 })];
  // FIXTURE KANITI: ayni satirlar "TE" yazimiyla bugun bu urunlere gidiyor
  for (const [q, f] of [['TE 1"', 30], ['EŞİT TE 1"', 31], ['İNEGAL TE 1"', 32]] as const) {
    const o = sor(q, te());
    check(`B8 fixture: "${q}" → @${f}`, o.kind === 'single' && o.row?.listPrice === f, ozet(o));
  }
  for (const [q, f] of [['T 1"', 30], ['1" T', 30], ['GALVANİZ T 1"', 30], ['EŞİT T 1"', 31], ['İNEGAL T 1"', 32]] as const) {
    const o = sor(q, te());
    check(`★ B8 "${q}" → @${f} (T = Te)`, o.kind === 'single' && o.row?.listPrice === f, ozet(o));
  }
  check('B8 karsi: TE/TEE degismez', sor('TEE 1"', te()).row?.listPrice === 30 && sor('TE 1"', te()).row?.listPrice === 30);
  // 't' = TON: sayidan hemen sonra gelen t te DEGILDIR
  for (const q of ['5 T ÇELİK', '2,5 t sac', 'KAPASİTE 3 T']) {
    check(`B8 karsi (ton): "${q}" Te ailesine gitmez`, parseLine(q).familySlug !== parseLine('TE 1"').familySlug && !parseLine(q).tokens.includes('te'),
      `fam=${parseLine(q).familySlug} tokens=${JSON.stringify(parseLine(q).tokens)}`);
  }
  // T TIP belirteci (once/sonra karsilastirmasi yakaladi — Pimtas'ta 12 satir):
  // satir zaten baska bir aileye cozuluyorsa T cevrilmez.
  for (const q of ['U-PVC Tek Taraf İç Dişli T Çekvalf 50 mm', 'U-PVC Yapıştırma Muflu T Çekvalf 63 mm']) {
    check(`B8 karsi: "${q}" (T tip belirteci) belirtecinde te YOK`, !parseLine(q).tokens.includes('te'), JSON.stringify(parseLine(q).tokens));
  }
  // Aile koşulu bu ikisini zaten korur; korumalarin KENDISI aile cozulmeyen
  // satirda olculur (mutant B8-3/B8-4 yalnız burada olur):
  // Belirtecler TAM degere baglidir: tire korumasi kalkinca "T-25" → 'te25'
  // olur, 'te' aramasi bunu gormez (mutant B8-4 yasadi — olculdu).
  for (const [q, b] of [['T TİPİ 1"', []], ['T-25 1"', ['t25']]] as const) {
    check(`B8 karsi: ailesiz "${q}" belirtecleri degismez ${JSON.stringify(b)}`, JSON.stringify(parseLine(q).tokens) === JSON.stringify(b), JSON.stringify(parseLine(q).tokens));
  }
  // "T tipi" ve kod parcasi te degildir
  for (const q of ['T TİPİ PİSLİK TUTUCU 1"', 'T-25 KELEPÇE']) {
    check(`B8 karsi: "${q}" belirtecinde te YOK`, !parseLine(q).tokens.includes('te'), JSON.stringify(parseLine(q).tokens));
  }

  console.log(`\n${'='.repeat(60)}\nKIMLIK SUZGECLERI (FAZ B parti 2a): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
  void aileUyusmazligiTeshisi;
}

bitmezseKirmizi(main());
