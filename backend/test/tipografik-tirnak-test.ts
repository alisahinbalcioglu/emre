/**
 * B2 KILIDI — TIPOGRAFIK TIRNAKLA YAZILAN INC OKUNMUYOR
 *   npx ts-node test/tipografik-tirnak-test.ts   (npm run test:tipografik-tirnak)
 *
 * ── OLCULEN KUSUR (04.10) ─────────────────────────────────────────────────
 * `normalizer.normalizeText` iki ayri tirnak normalizasyonu yapar:
 *   .replace(/["" “”″]/g, '"')   ← CIFT tirnak ailesi (dogru)
 *   .replace(/['']/g, "'")                      ← TEK tirnak ailesi
 * Ikinci kalibin icindeki iki karakter TIPOGRAFIK degil, IKI ASCII KESME
 * ISARETI (U+0027 U+0027) — yani ASCII tirnagi yine ASCII tirnaga ceviren bir
 * NO-OP. Tipografik tirnaklar (U+2018 ' · U+2019 ') ve prime (U+2032 ′) HIC
 * donusturulmuyor.
 *
 * Sonuc OLCULDU (`extractSizeInfo`):
 *   BORU 1"      → inch/1   ✔        BORU 1''  (ASCII)  → inch/1  ✔
 *   BORU 1''  (U+2019×2)    → YOK ✘  BORU 1'   (U+2019) → YOK ✘
 *   BORU 1''  (U+2018×2)    → YOK ✘  BORU 1′′  (U+2032) → YOK ✘
 *   BORU 1″   (U+2033)      → inch/1 ✔ (ilk kalip kapsiyor)
 * Yani TAM SAYI inc tipografik tirnakla yazilinca satirin capi TAMAMEN duser.
 * ⚠ Kesirli yazim ("1 1/4''") etkilenmez — kesir kalibi tirnak istemez; bu
 * yuzden kusur yalnizca bazi satirlarda gorunur ve kolayca gozden kacar.
 *
 * ── IKIZ (on yuz) ─────────────────────────────────────────────────────────
 * `frontend/ozellik/tablo/excel-grid/build-material-context.ts` ayni kaliplari
 * tasiyor (satir 10 `/'{2}/`, 27, 34 `["']`): `hasSizeExpression` ve
 * `isSelfSufficientRow` tipografik tirnakli olcuyu GORMEZ, yani "1''" satiri
 * "olcusu yok" sayilip yanlis bir baslikla zenginlestirilebilir. O taraf
 * `frontend/.../build-material-context.test.ts` ile kilitlenir.
 *
 * ── KAPSAM (olculdu) ──────────────────────────────────────────────────────
 * Elimizdeki Pimtas listesinde tipografik tirnak HIC YOK (tarandi: U+2018,
 * U+2019, U+2032, U+2033, U+201C, U+201D, U+02BC → 0 adet), yani once/sonra
 * farki 0 satir. Kusur kullanicinin Word/Excel'de yazdigi tekliflerde dogar
 * (otomatik duzeltme ASCII tirnagi tipografige cevirir).
 */

import { normalizeText } from '../src/ozellik/eslestirme/matching/normalizer';
import { extractSizeInfo } from '../src/ozellik/eslestirme/matching/conversion';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const SAG = '’';   // ' tipografik sag tek tirnak (Word'un urettigi)
const SOL = '‘';   // ' tipografik sol tek tirnak
const PRIME = '′'; // ′ prime
const CIFT_PRIME = '″'; // ″ cift prime

const olcu = (s: string) => { const i = extractSizeInfo(s); return i ? `${i.source}/${i.value}` : null; };

async function main() {
  // ── T: TIPOGRAFIK TEK TIRNAK AILESI ─────────────────────────────────────
  for (const [ad, q] of [['sag tek tirnak (U+2019)', SAG], ['sol tek tirnak (U+2018)', SOL]] as const) {
    check(`★ T ${ad} · "BORU 1${q}${q}" inc okunur`, olcu(`BORU 1${q}${q}`) === 'inch/1', `olcu=${olcu(`BORU 1${q}${q}`)}`);
    // ⚠ TEK tirnak ASCII'de de OKUNMAZ (olculdu: "BORU 2'" → YOK) ve bu
    // KASITLI: tek tirnak imperial'de FIT demektir, Turkce'de de ek kesmesidir
    // ("Ayvaz'in"). Sozlesme "tipografik ASCII ile AYNI davranir" — tipografik
    // tirnagin yeni bir okuma ACMASI degil. Ilk yazimda bunu duzeltme sandim;
    // olcum testi duzeltti.
    check(`T ${ad} · TEK tirnak ASCII ile AYNI (ikisi de okunmaz)`,
      olcu(`BORU 2${q}`) === olcu("BORU 2'"), `tipografik=${olcu(`BORU 2${q}`)} ascii=${olcu("BORU 2'")}`);
    check(`T ${ad} · normalizeText ASCII kesmeye cevirir`,
      normalizeText(`1${q}`) === "1'", `norm=${JSON.stringify(normalizeText(`1${q}`))}`);
  }

  // ── P: PRIME AILESI (ikinci aile — CAD/teknik cizim cikislarinda yaygin) ─
  check('★ P prime (U+2032) · "BORU 1′′" inc okunur', olcu(`BORU 1${PRIME}${PRIME}`) === 'inch/1', `olcu=${olcu(`BORU 1${PRIME}${PRIME}`)}`);
  check('P prime TEK · ASCII ile AYNI (ikisi de okunmaz)',
    olcu(`BORU 3${PRIME}`) === olcu("BORU 3'"), `prime=${olcu(`BORU 3${PRIME}`)} ascii=${olcu("BORU 3'")}`);

  // ── B: BILESIK OLCU de tipografikle okunmali ────────────────────────────
  check('★ B "1 1/4′′" bilesik olcu okunur', olcu(`1 1/4${PRIME}${PRIME}`) === 'inch/1.25', `olcu=${olcu(`1 1/4${PRIME}${PRIME}`)}`);

  // ── K: KARSI ORNEKLER — bugunku dogru davranis AYNEN kalmali ────────────
  check('K ASCII cift tirnak degismez', olcu('BORU 1"') === 'inch/1', `olcu=${olcu('BORU 1"')}`);
  check('K ASCII iki kesme degismez', olcu("BORU 1''") === 'inch/1', `olcu=${olcu("BORU 1''")}`);
  check('K cift prime (U+2033) degismez', olcu(`BORU 1${CIFT_PRIME}`) === 'inch/1', `olcu=${olcu(`BORU 1${CIFT_PRIME}`)}`);
  check('K kesirli ASCII yazim degismez', olcu('1 1/4"') === 'inch/1.25', `olcu=${olcu('1 1/4"')}`);
  check('K mm olcusu etkilenmez', olcu('BORU 110 mm') === 'mm/110', `olcu=${olcu('BORU 110 mm')}`);
  // Tirnak OLCU DISI baglamda metni bozmamali (kesme isareti Turkce'de eklerde gecer)
  check('K kesme isaretli ad bozulmaz', normalizeText(`Ayvaz${SAG}in borusu`) === "ayvaz'in borusu",
    `norm=${JSON.stringify(normalizeText(`Ayvaz${SAG}in borusu`))}`);

  console.log(`\n${'='.repeat(60)}\nB2 TIPOGRAFIK TIRNAK: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
