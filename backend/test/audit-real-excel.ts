// ════════════════════════════════════════════════════════════════════
// FAZ 1 DENETIM ARACI (gecici) — Gercek teklif Excel'i ile satir-cozucu kaniti
// Dosya: 2024-0001-Aksa_Göynük_YSS -R003 -LİNTU.xlsx
// Amac: parseLine (v2 satir etiketleme) gercek veride ne kadar cozuyor?
// DB YOK — yalniz saf moduller. Rapor stdout'a yazilir.
// ════════════════════════════════════════════════════════════════════
import * as XLSX from 'xlsx';
import { parseLine } from '../src/modules/matching/index/line-parser';
import { tokenEsit } from '../src/modules/matching/index/product-index';

const FILE = process.argv[2];
if (!FILE) { console.error('kullanim: ts-node audit-real-excel.ts <xlsx>'); process.exit(1); }

const wb = XLSX.readFile(FILE);
console.log(`SAYFALAR: ${wb.SheetNames.join(' | ')}`);

interface Satir { sheet: string; row: number; text: string; unit: string | null; qty: string | null }
const satirlar: Satir[] = [];

for (const sn of wb.SheetNames) {
  const ws = wb.Sheets[sn];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (rows.length < 2) continue;
  // Kolon rolleri: en cok metin tasiyan kolon = ad; 'birim' basligini ara
  const headerRowIdx = rows.findIndex((r) => r.some((c) => /malzeme|aciklama|açıklama|tanım|tanim|cinsi|poz/i.test(String(c))));
  const hdr = headerRowIdx >= 0 ? rows[headerRowIdx].map((c) => String(c).toLowerCase()) : [];
  const nameCol = hdr.findIndex((c) => /malzeme|aciklama|açıklama|tanım|tanim|cinsi/i.test(c));
  const unitCol = hdr.findIndex((c) => /birim(?!\s*fiyat)/i.test(c) && !/fiyat/i.test(c));
  const qtyCol = hdr.findIndex((c) => /miktar|adet/i.test(c));
  const start = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const text = String(nameCol >= 0 ? r[nameCol] : (r.find((c) => String(c).trim().length > 3) ?? '')).trim();
    if (!text || text.length < 3) continue;
    satirlar.push({
      sheet: sn, row: i + 1, text,
      unit: unitCol >= 0 ? String(r[unitCol] ?? '').trim() || null : null,
      qty: qtyCol >= 0 ? String(r[qtyCol] ?? '').trim() || null : null,
    });
  }
}

console.log(`\nTOPLAM METIN SATIRI: ${satirlar.length}\n`);

let aile = 0, capli = 0, urunDegil = 0, cozumsuz = 0;
const cozumsuzler: string[] = [];
const aileDagilimi = new Map<string, number>();

for (const s of satirlar) {
  const q = parseLine(s.text, s.unit);
  if (q.notProduct) { urunDegil++; continue; }
  if (q.familySlug) { aile++; aileDagilimi.set(q.familySlug, (aileDagilimi.get(q.familySlug) ?? 0) + 1); }
  if (q.capInfo) capli++;
  if (!q.familySlug && !q.capInfo) { cozumsuz++; if (cozumsuzler.length < 25) cozumsuzler.push(`[${s.sheet}:${s.row}] "${s.text.slice(0, 70)}"`); }
}

const urun = satirlar.length - urunDegil;
console.log(`AILE COZULDU : ${aile}/${urun} (%${Math.round((aile / Math.max(urun, 1)) * 100)})`);
console.log(`CAP COZULDU  : ${capli}/${urun} (%${Math.round((capli / Math.max(urun, 1)) * 100)})`);
console.log(`URUN DEGIL   : ${urunDegil} (oran/iscilik R12)`);
console.log(`COZUMSUZ (aile+cap yok): ${cozumsuz}`);
console.log(`\nAILE DAGILIMI: ${Array.from(aileDagilimi.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ')}`);
if (cozumsuzler.length) { console.log(`\nCOZUMSUZ ORNEKLER:`); for (const c of cozumsuzler) console.log('  ' + c); }

// ── ORNEK SATIR DOKUMU (ilk 15 urun satiri) ─────────────────────────
console.log(`\nORNEK COZUMLEME (ilk 15):`);
let n = 0;
for (const s of satirlar) {
  const q = parseLine(s.text, s.unit);
  if (q.notProduct) continue;
  if (n++ >= 15) break;
  console.log(`  "${s.text.slice(0, 55)}" → aile=${q.familySlug ?? '∅'} cap=${q.capInfo?.display ?? '∅'} tokens=[${q.tokens.join(',')}]`);
}

// ── K-D RISK KANITI: onek toleransi -siz ekini yutuyor mu? ──────────
console.log(`\nK-D KANIT (tokenEsit):`);
const kd: [string, string][] = [
  ['galvaniz', 'galvanizsiz'], ['galvaniz', 'galvanizli'], ['conta', 'contasiz'],
  ['kuresel', 'kelebek'], ['vana', 'vanasi'], ['boru', 'borusuz'], ['izole', 'izolesiz'],
];
for (const [a, b] of kd) console.log(`  tokenEsit('${a}','${b}') = ${tokenEsit(a, b)}`);
