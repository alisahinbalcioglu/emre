/**
 * AD UZUNLUGU HIZI (P2, 05.10.2026) — SONUC BIREBIR, IS SAYISI DUSUK.
 *
 * Olculen kusur: parseLine'in aileKelimeleri dongusu (line-parser) aile cozumunu
 * TOKEN BASINA kalan metnin tamamiyla yeniden kosuyordu; aile cozucu her
 * sondan-parcada `resolveAdDetayli` ile 305 desenin her birini metnin tamaminda
 * ariyordu. Gercek bir 1.475 karakterlik sartname adi (e2e kesif fikstürü) tek
 * basina ~0,7 sn — Nest'in tek is parcacigi o sure boyunca tum kiracilara kapali.
 *
 * Duzeltme (sonucu DEGISTIRMEZ):
 *   · ad-resolver ONEK KOVASI: yalniz ilk uc karakteri metinde gecen desenler,
 *     PATTERNS sirasiyla denenir (gecen desenin oneki de gecer).
 *   · product-index: sondan-parca artimli kurulur + cagri ici BELLEK
 *     (parca → denetim sonucu), line-parser'in dongusu bellegi paylasir.
 *
 * KAPI — sure ms ile DEGIL, deterministik IS SAYACIYLA olculur (kararsiz test
 * olmasin): sondan-parca denetimi (AILE_COZUCU_OLCUM) ve desen denemesi
 * (AD_COZUCU_OLCUM). Esdegerlik: bellekli aileKelimeleri ↔ belleksiz referans
 * dongu; onek suzgecli resolveAdDetayli ↔ suzgecsiz referans.
 * Bayt bayt genis olcum (gelistirme sirasinda, kapi disi): P3 3.125 + yerel
 * 3.850 + Pimtas 5.702 + sentetik 60 ad → tam LineQuery JSON 12.737/12.737 ayni.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseLine, resolveLineFamily } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { AILE_COZUCU_OLCUM, resolveFamily } from '../src/ozellik/eslestirme/matching/index/product-index';
import { resolveAdDetayli, resolveAdDetayliFiltresiz, sozlukKapsayan, AD_COZUCU_OLCUM } from '../src/ozellik/eslestirme/matching/ad-resolver';
import { AD_SOZLUGU, AD_ZENGINLESTIRME } from '../src/ozellik/eslestirme/matching/ad-cins-sozlugu';
import { normalizeText, extractMaterialTypeDetayli } from '../src/ozellik/eslestirme/matching/normalizer';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx');

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const js = (x: unknown) => JSON.stringify(x);

/** e2e kesif fikstürlerindeki TUM metin hucreleri (cok satirli sartname hucreleri dahil). */
function fiksturMetinleri(): string[] {
  const FIX = path.join(__dirname, '..', '..', 'test-fixtures', 'e2e');
  const k = new Set<string>();
  for (const d of fs.readdirSync(FIX).filter((x) => /\.xls[xm]$/i.test(x))) {
    const wb = XLSX.readFile(path.join(FIX, d));
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      for (const adr of Object.keys(ws)) {
        if (adr[0] === '!') continue;
        const v = ws[adr]?.v;
        if (typeof v === 'string' && v.trim().length >= 3) k.add(v.trim());
      }
    }
  }
  return [...k];
}

/**
 * ESKI aile cozucu, BAGIMSIZ kopya (0d10b59 product-index `basIsimAilesi`):
 * her adimda `slice().join()` + onek suzgecsiz desen taramasi. Uretim kodunun
 * artimli parca + bellek + onek kovasi yolu BUNA karsi olculur — uretim
 * fonksiyonunu kendisiyle karsilastirmak kurulum hatasini gizlerdi.
 */
function basIsimReferans(text: string): string | null {
  const tam = normalizeText(text);
  const kelimeler = tam.split(/\s+/).filter(Boolean);
  for (let i = kelimeler.length - 1; i >= 0; i--) {
    const parca = kelimeler.slice(i).join(' ');
    const ofset = tam.length - parca.length;
    const rx = extractMaterialTypeDetayli(parca);
    if (rx && rx.type !== 'diger') { const kap = sozlukKapsayan(tam, ofset + rx.index, ofset + rx.index + rx.length); return kap ? kap.slug : rx.type; }
    const dc = resolveAdDetayliFiltresiz(parca);
    if (dc) { const kap = sozlukKapsayan(tam, ofset + dc.index, ofset + dc.index + dc.desen.length); return kap ? kap.slug : dc.slug; }
  }
  return null;
}

/** Eski tanimla aileKelimeleri (bagimsiz referans cozucuyle, bellek ve suzgec yok). */
function referansAileKelimeleri(tokens: string[], familySlug: string | null): string[] {
  const out: string[] = [];
  if (familySlug) for (const t of tokens) if (basIsimReferans(tokens.filter((x) => x !== t).join(' ')) !== familySlug) out.push(t);
  return out;
}

/** IS SAYACI icin: uretim cozucusu belleksiz (eski dongunun yaptigi is). */
function belleksizDongu(tokens: string[], familySlug: string | null): void {
  if (familySlug) for (const t of tokens) resolveLineFamily(tokens.filter((x) => x !== t).join(' '));
}

async function main() {
  const warn = console.warn; const log = console.log;
  const metinler = fiksturMetinleri();
  const enUzun = metinler.slice().sort((a, b) => b.length - a.length)[0];
  const DESEN_SAYISI = [...AD_SOZLUGU, ...AD_ZENGINLESTIRME].reduce((s, e) => s + e.patterns.filter((p) => p.length >= 3).length, 0);

  // ══ H0 · aile cozucu: artimli parca + onek kovasi == eski algoritma ══════════
  console.warn = () => {};
  const cozucuGirdileri = [...metinler, ...normalizeText(enUzun).split(/\s+/).filter(Boolean).map((_, i, w) => w.slice(i).join(' '))];
  let aileBulunan = 0; const farkA: string[] = [];
  for (const a of cozucuGirdileri) {
    const y = resolveFamily(a); const r = basIsimReferans(a);
    if (y === r) { if (y) aileBulunan++; } else if (farkA.length < 5) farkA.push(`${js(a).slice(0, 40)}: ${y} ≠ ${r}`);
  }
  console.warn = warn;
  check(`FIXTURE KANITI: ${cozucuGirdileri.length} girdi, ${aileBulunan} tanesinde aile cozuldu (≥ 1.000)`, aileBulunan >= 1000);
  check('★ H0 resolveFamily: artimli sondan-parca + onek kovasi ESKI algoritmayla birebir', farkA.length === 0, farkA.join(' | '));

  // ══ H1 · aileKelimeleri: bellekli == belleksiz referans (tum fikstür metinleri) ══
  console.warn = () => {};
  let karsilastirilan = 0; let uzunKarsilastirilan = 0; const farklar: string[] = [];
  for (const a of metinler) {
    const q = parseLine(a, null);
    if (!q.familySlug || q.tokens.length < 2) continue;
    karsilastirilan++;
    if (a.length > 1000) uzunKarsilastirilan++;
    const ref = referansAileKelimeleri(q.tokens, q.familySlug);
    if (js(ref) !== js(q.aileKelimeleri) && farklar.length < 5) farklar.push(`${a.length} kar: ${js(q.aileKelimeleri).slice(0, 80)} ≠ ${js(ref).slice(0, 80)}`);
  }
  console.warn = warn;
  check(`FIXTURE KANITI: ${karsilastirilan} aileli ad karsilastirildi (≥ 500), ${uzunKarsilastirilan} tanesi 1.000 karakterden uzun (≥ 1)`, karsilastirilan >= 500 && uzunKarsilastirilan >= 1);
  check('★ H1 aileKelimeleri: cagri ici bellek sonucu DEGISTIRMEZ (belleksiz referansla birebir)', farklar.length === 0, farklar.join(' | '));

  // ══ H2 · resolveAdDetayli: onek suzgeci == suzgecsiz referans ══════════════
  const ucKarakterli = [...AD_SOZLUGU, ...AD_ZENGINLESTIRME].flatMap((e) => e.patterns.filter((p) => p.length === 3));
  const girdiler: string[] = [
    ...metinler,
    // en uzun metnin TUM kelime-hizali sondan-parcalari (aile cozucunun gercekte sordugu dizeler)
    ...normalizeText(enUzun).split(/\s+/).filter(Boolean).map((_, i, w) => w.slice(i).join(' ')),
    // sinirlar: bos, <3, metnin SON uc karakterinde biten desen, koruma (kanalizasyon ↔ kanal), cok baytli
    '', 'a', 'ab', ...ucKarakterli.map((p) => `xx ${p}`), ...ucKarakterli.map((p) => p),
    'hava kanalı', 'hava kanalı kanalizasyon', 'kanalizasyon borusu', 'boru 🔧 vana', 'ÇEKVALF', 'yangın hortumu dolabı',
  ];
  let ayni = 0; let bulunan = 0; const farkB: string[] = [];
  for (const g of girdiler) {
    const a = resolveAdDetayli(g); const b = resolveAdDetayliFiltresiz(g);
    if (js(a) === js(b)) { ayni++; if (a) bulunan++; } else if (farkB.length < 5) farkB.push(`${js(g).slice(0, 40)}: ${js(a)} ≠ ${js(b)}`);
  }
  check(`FIXTURE KANITI: ${girdiler.length} girdi, ${bulunan} tanesinde desen bulundu (≥ 300), 3 karakterli desen ${ucKarakterli.length} (≥ 1)`, bulunan >= 300 && ucKarakterli.length >= 1);
  check('★ H2 resolveAdDetayli: onek kovasi sonucu DEGISTIRMEZ (suzgecsiz referansla birebir, sira + koruma dahil)', farkB.length === 0 && ayni === girdiler.length, farkB.join(' | '));
  check('H2 karsi: koruma hala calisir — "hava kanalı kanalizasyon" kanal DEGIL', resolveAdDetayli('hava kanalı kanalizasyon')?.slug !== 'kanal', js(resolveAdDetayli('hava kanalı kanalizasyon')));

  // ══ H2b · her desen cagri basina EN COK BIR KEZ denenir (tekrarlayan onek) ══
  // Girdi: tek bir desen oneki 200 kez; hicbir desen TAM gecmez → tarama erken
  // bitmez, deneme sayisi = oneki metinde gecen desen sayisi OLMALI (fazlasi
  // ayni desenin tekrar denenmesi ya da gevsek anahtar = bosa is).
  const DESENLER = [...AD_SOZLUGU, ...AD_ZENGINLESTIRME].flatMap((e) => e.patterns.filter((p) => p.length >= 3));
  const ornek = DESENLER.find((p) => p.length >= 5 && !p.slice(0, 4).includes(' ') && normalizeText(p.slice(0, 3)) === p.slice(0, 3));
  const tekrarli = Array.from({ length: 200 }, () => ornek!.slice(0, 3)).join(' ');
  const tekrarliNorm = normalizeText(tekrarli);
  const beklenenDeneme = DESENLER.filter((p) => tekrarliNorm.includes(p.slice(0, 3))).length;
  AD_COZUCU_OLCUM.desenDenemesi = 0;
  const tekrarliSonuc = resolveAdDetayli(tekrarli);
  const tekrarliDeneme = AD_COZUCU_OLCUM.desenDenemesi;
  check(`FIXTURE KANITI: "${ornek?.slice(0, 3)}" × 200 — hicbir desen tam gecmiyor, ${beklenenDeneme} desenin oneki geciyor (≥ 1)`, !!ornek && tekrarliSonuc === null && beklenenDeneme >= 1, js(tekrarliSonuc));
  check(`★ H2b tekrarlayan onekte her desen tek kez denenir: ${tekrarliDeneme} deneme = ${beklenenDeneme} aday`, tekrarliDeneme === beklenenDeneme, `${tekrarliDeneme}`);

  // ══ H3 · IS SAYISI (deterministik): en uzun gercek sartname adi ══════════
  console.warn = () => {}; console.log = () => {};
  const q = parseLine(enUzun, null);
  AILE_COZUCU_OLCUM.parcaDenetimi = 0; AD_COZUCU_OLCUM.desenDenemesi = 0;
  parseLine(enUzun, null);
  const yeniParca = AILE_COZUCU_OLCUM.parcaDenetimi; const yeniDesen = AD_COZUCU_OLCUM.desenDenemesi;
  AILE_COZUCU_OLCUM.parcaDenetimi = 0;
  belleksizDongu(q.tokens, q.familySlug);
  const refParca = AILE_COZUCU_OLCUM.parcaDenetimi;
  console.warn = warn; console.log = log;
  check(`FIXTURE KANITI: en uzun fikstür adi ${enUzun.length} karakter (≥ 1.400), ${q.tokens.length} token (≥ 100), aile ${q.familySlug}`, enUzun.length >= 1400 && q.tokens.length >= 100 && !!q.familySlug);
  check(`★ H3a sondan-parca denetimi: parseLine ${yeniParca} ≤ belleksiz dongunun %25'i (${refParca})`, refParca > 0 && yeniParca <= refParca * 0.25, `${yeniParca}/${refParca}`);
  const ortalama = yeniParca > 0 ? yeniDesen / yeniParca : Infinity;
  check(`★ H3b desen denemesi: parca basina ortalama ${ortalama.toFixed(1)} ≤ desen sayisinin %15'i (${DESEN_SAYISI})`, ortalama <= DESEN_SAYISI * 0.15, `${yeniDesen}/${yeniParca}`);

  console.log(`\n${'='.repeat(60)}\nAD UZUNLUGU HIZI (P2): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
