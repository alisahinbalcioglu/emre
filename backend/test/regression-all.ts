/**
 * ARINMA FAZ 1 — TEK REGRESYON PAKETI
 *   npm run test:regression
 *
 * 5 cekirdek zincirin (Z1-Z5) TUM kabul/regresyon suite'lerini SIRAYLA
 * kosar, ozet tablo basar; herhangi biri kirmiziysa exit 1.
 *  - DB'siz suite'ler HER ZAMAN kosulur.
 *  - DB gerektirenler (gercek PostgreSQL) baglanti yoksa SKIP raporlanir
 *    (CI/VPS'te DB varken tam kosulur) — sessiz atlama YOK, tabloya yazilir.
 * MUHUR KURALI (Faz 4): bu paket yesil olmadan hicbir degisiklik birlesmez.
 */
import { spawnSync } from 'child_process';

interface Suite { ad: string; script: string; zincir: string; db?: boolean }

const SUITES: Suite[] = [
  { ad: 'Gerçek dosya uyumluluk (TF/KH1)', script: 'test:tf', zincir: 'Z1' },
  { ad: 'Excel grid parse (E/KG6)', script: 'test:grid', zincir: 'Z1' },
  { ad: 'Ürün indeksleyici (P/K)', script: 'test:product-index', zincir: 'Z1' },
  { ad: 'İndeksli motor kabul (K/TS/KH4-6)', script: 'test:index', zincir: 'Z2' },
  { ad: 'Eşleştirme birim (D)', script: 'test:matching', zincir: 'Z2' },
  { ad: 'Çap çevrimi (DN/inç/OD-mm)', script: 'test:conversion', zincir: 'Z2' },
  { ad: 'Spec regresyon (R1-R12)', script: 'test:spec', zincir: 'Z2' },
  { ad: 'Sözleşme dondurma (C1-C10)', script: 'test:contract', zincir: 'Z2' },
  { ad: 'İşçilik tek motor (L)', script: 'test:labor', zincir: 'Z2' },
  // T1/T3/T4: sablona-yazan eski motor SILINDI; "kolon esleme" (test:ke) ve
  // "iki katmanli baslik" (test:kb) suite'leri onunla birlikte kaldirildi.
  // Yerine gelen sozlesmeler:
  { ad: 'Standart grid şeması (GS/MF)', script: 'test:gs', zincir: 'Z1' },
  { ad: 'Standart çıktı (EX1-EX8)', script: 'test:ex', zincir: 'Z4' },
  { ad: 'Teklif formatı kabul (T/KF2)', script: 'test:export', zincir: 'Z5' },
  { ad: 'Canlı simülasyon (SIM/G)', script: 'test:livesim', zincir: 'Z5' },
  // ── DB gerektirenler (yerelde PG yoksa SKIP; VPS/CI'da kosulur) ──
  { ad: 'Eşleştirme DB regresyonu', script: 'test:regression:db', zincir: 'Z2', db: true },
  { ad: 'Kütüphane liste ekleme (KL)', script: 'test:kl', zincir: 'Z1', db: true },
  { ad: 'İşçilik sheet (DB)', script: 'test:labor-sheet', zincir: 'Z1', db: true },
];

function dbErisilebilir(): boolean {
  // Hizli TCP kontrolu yerine: DATABASE_URL tanimli + PG_REGRESSION=1 bayragi
  // (yerel gelistirmede PG cogu zaman kapali — yanlis negatif kirmizi yerine
  // ACIK bayrakla kosulur; VPS/CI ortami bayragi set eder).
  return process.env.PG_REGRESSION === '1';
}

const sonuclar: Array<{ ad: string; zincir: string; durum: 'PASS' | 'FAIL' | 'SKIP'; sure: string }> = [];
const dbVar = dbErisilebilir();

for (const s of SUITES) {
  if (s.db && !dbVar) {
    sonuclar.push({ ad: s.ad, zincir: s.zincir, durum: 'SKIP', sure: '-' });
    continue;
  }
  const t0 = Date.now();
  const r = spawnSync('npm', ['run', s.script], { shell: true, encoding: 'utf-8' });
  const sure = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const durum = r.status === 0 ? 'PASS' : 'FAIL';
  sonuclar.push({ ad: s.ad, zincir: s.zincir, durum, sure });
  console.log(`${durum === 'PASS' ? '✅' : '❌'} [${s.zincir}] ${s.ad} (${sure})`);
  if (durum === 'FAIL') {
    console.log((r.stdout ?? '').split('\n').filter((l: string) => l.includes('FAIL')).slice(0, 10).join('\n'));
  }
}

console.log(`\n${'═'.repeat(64)}`);
console.log('ARINMA REGRESYON PAKETI — OZET');
console.log('═'.repeat(64));
for (const r of sonuclar) {
  console.log(`  ${r.durum === 'PASS' ? '🟢' : r.durum === 'SKIP' ? '⚪' : '🔴'} ${r.durum.padEnd(4)} [${r.zincir}] ${r.ad} ${r.sure !== '-' ? `(${r.sure})` : '(DB yok — PG_REGRESSION=1 ile koşulur)'}`);
}
const fail = sonuclar.filter((r) => r.durum === 'FAIL').length;
const skip = sonuclar.filter((r) => r.durum === 'SKIP').length;
console.log(`\nTOPLAM: ${sonuclar.length - fail - skip} PASS · ${fail} FAIL · ${skip} SKIP`);
process.exit(fail > 0 ? 1 : 0);
