/**
 * AILE KELIMESI MUAFIYETI (P2, 05.10 — "55 ad" bulgusu) — tanim TOKEN kumesine gore.
 *
 * Olculen kusur: parseLine `aileKelimeleri` = kaldirilinca aile cozumu bozulan
 * token'lar. Karsilastirma TOKEN birlesimiyle degil, HAM metnin ailesiyle
 * (`familySlug`, parantezsiz ham metinden) yapiliyordu. Aile token'larda
 * OLMAYAN bir kelimeden geliyorsa (durak sozcugu "montajı"; uzun sartnamenin
 * sonundaki "Basınç Anahtarı") token birlesimi o aileyi HIC cozmuyor → hicbir
 * token'in kaldirilmasi "bozamiyor", her token aile kelimesi sayiliyor ve
 * query-engine'deki bilinmeyen-sozcuk denetiminden (aileMuaf) TOPTAN muaf
 * kaliyordu: satirdaki taninmayan nitelikler kisit/not olmaktan cikiyordu.
 * Kulliyat (P3 + yerel, 05.10): ailesi cozulen 1.348 adin 136'sinda TUM token'lar
 * aile kelimesi — 75'i tek token (aile adinin kendisi, dogru), 41'i cok kelimeli
 * aile adi ("Akış Anahtarı", "Pislik Tutucu", dogru), 20'si KUSUR (token
 * birlesiminin ailesi ≠ satirin ailesi: 16 montaj notu, 3 baskin vana sartnamesi,
 * 1 diger).
 *
 * Kural: token birlesimi satirin ailesini cozmuyorsa (F0 ≠ familySlug) HICBIR
 * token aile kelimesi DEGILDIR — aile token'lardan gelmiyor. Yon GUVENLI:
 * muafiyet kalkinca taninmayan sozcuk yine "dogrulanamadi" olur (otomatik yazim
 * kapanir), yeni otomatik yazim dogmaz.
 */
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const js = (x: unknown) => JSON.stringify(x);

async function main() {
  const warn = console.warn; console.warn = () => {};
  try {
    // ══ K1 · aile token'lardan GELMIYOR → aile kelimesi yok ══════════════════
    const hedefler = [
      'Projede verilen detay doğrultusunda rogar yapılması, temini ve montajı',
      'SPRINKLER MONTAJI ÖZEL EL ANAHTARI',
      'UPS ve akü kabininin temini ve montajı İşveren kapsamındadır',
    ];
    for (const s of hedefler) {
      const q = parseLine(s, null);
      check(`FIXTURE KANITI: "${s.slice(0, 40)}…" ailesi cozuluyor (${q.familySlug}), ${q.tokens.length} token`, !!q.familySlug && q.tokens.length >= 2);
      check(`★ K1 "${s.slice(0, 40)}…" → aile kelimesi YOK (token birlesimi aileyi cozmuyor)`, q.aileKelimeleri.length === 0, js(q.aileKelimeleri));
    }

    // ══ K2 · karsi: aile token'lardan geliyorsa davranis AYNI ═══════════════
    const karsi: Array<[string, string[]]> = [
      ['Akış Anahtarı DN65', ['akis', 'anahtari']],
      ['2" Pislik Tutucu', ['pislik', 'tutucu']],
      ['İtfaiye Bağlantı Ağzı', ['itfaiye', 'baglanti', 'agzi']],
      ['MANOMETRE', ['manometre']],
      ['ÇEKVALF', ['cekvalf']],
      ['Siyah Çelik Boru 2"', ['boru']],
      ['Küresel Vana 1"', ['vana']],
    ];
    for (const [s, beklenen] of karsi) {
      const q = parseLine(s, null);
      check(`K2 karsi: "${s}" → aile kelimeleri ${js(beklenen)} (degismez)`, js(q.aileKelimeleri) === js(beklenen), js(q.aileKelimeleri));
    }
  } finally { console.warn = warn; }

  console.log(`\n${'='.repeat(60)}\nAILE KELIMESI (P2 55 ad): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
