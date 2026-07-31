/**
 * TAM ZINCIR — TEK KOMUT: backend regresyon + frontend vitest + Playwright
 *   npm run test:tam                (backend/ dizininden)
 *
 * KAPATMA TURU ADIM 3d (31.07.2026). Delik: Playwright paketi vardi ama
 * regresyon zincirine BAGLI DEGILDI — ayri ayri hatirlanmasi gerekiyordu ve
 * hatirlanmadigi icin 3 spec HIC kosmadi. Artik tek komut ucunu de surer.
 *
 * SKIP FELSEFESI (paket geneliyle ayni): sessiz atlama YOK. Playwright yerel
 * yigin (PG + backend:3001 + frontend:3005) ayakta degilse KOSULMAZ ama
 * tabloya SKIP olarak, sebebi ve baslatma komutlariyla yazilir. SKIP, PASS
 * DEGILDIR — ozet satirinda ayri sayilir.
 *
 * DB paketleri icin PG_REGRESSION=1 gerekir (regression-all.ts ile ayni kural).
 */
import { spawnSync } from 'child_process';
import * as path from 'path';

const FE = path.resolve(__dirname, '../../frontend');
const BE = path.resolve(__dirname, '..');

interface Halka { ad: string; durum: 'PASS' | 'FAIL' | 'SKIP'; sure: string; not?: string }
const sonuclar: Halka[] = [];

const kos = (ad: string, cmd: string, args: string[], cwd: string): boolean => {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { shell: true, cwd, stdio: 'inherit' });
  const sure = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const gecti = r.status === 0;
  sonuclar.push({ ad, durum: gecti ? 'PASS' : 'FAIL', sure });
  console.log(`${gecti ? '🟢' : '🔴'} ${ad} (${sure})`);
  return gecti;
};

/** Yerel yigin ayakta mi? Playwright yalniz o zaman anlamli kosar. */
async function yiginAyakta(): Promise<{ ok: boolean; eksik: string[] }> {
  const eksik: string[] = [];
  for (const [ad, url] of [
    ['backend:3001', 'http://localhost:3001/api/health'],
    ['frontend:3005', 'http://localhost:3005/'],
  ] as const) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) eksik.push(`${ad} (HTTP ${r.status})`);
    } catch {
      eksik.push(`${ad} (yanit yok)`);
    }
  }
  return { ok: eksik.length === 0, eksik };
}

async function main() {
  console.log('\n════════ TAM ZINCIR — backend + frontend + E2E ════════\n');

  kos('Backend regresyon paketi (Z1-Z5)', 'npm', ['run', 'test:regression'], BE);
  kos('Frontend birim testleri (vitest)', 'npx', ['vitest', 'run'], FE);

  const yigin = await yiginAyakta();
  if (yigin.ok) {
    kos('E2E ALTIN YOL (Playwright + verify)', 'npm', ['run', 'test:e2e-golden'], FE);
  } else {
    sonuclar.push({
      ad: 'E2E ALTIN YOL (Playwright + verify)',
      durum: 'SKIP',
      sure: '-',
      not: `yerel yigin eksik: ${yigin.eksik.join(', ')}`,
    });
    console.log(`⚪ E2E ALTIN YOL — SKIP (${yigin.eksik.join(', ')})`);
    console.log('   Baslatmak icin:');
    console.log('     1) PostgreSQL 5432 ayakta olmali');
    console.log('     2) backend/  : npm run build && node dist/main');
    console.log('     3) frontend/ : NEXT_PUBLIC_API_URL=http://localhost:3001/api ile npm run build && npx next start -p 3005');
  }

  console.log('\n════════════════ TAM ZINCIR — OZET ════════════════');
  for (const s of sonuclar) {
    const iz = s.durum === 'PASS' ? '🟢' : s.durum === 'FAIL' ? '🔴' : '⚪';
    console.log(`  ${iz} ${s.durum.padEnd(4)} ${s.ad} (${s.sure})${s.not ? ' — ' + s.not : ''}`);
  }
  const p = sonuclar.filter((s) => s.durum === 'PASS').length;
  const f = sonuclar.filter((s) => s.durum === 'FAIL').length;
  const k = sonuclar.filter((s) => s.durum === 'SKIP').length;
  console.log(`TOPLAM: ${p} PASS · ${f} FAIL · ${k} SKIP`);
  if (k) console.log('⚠ SKIP PASS DEGILDIR — atlanan halka dogrulanmamis sayilir.');
  process.exit(f > 0 ? 1 : 0);
}

main();
