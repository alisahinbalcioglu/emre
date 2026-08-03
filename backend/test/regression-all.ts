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
  // ── KAPATMA TURU ADIM 2 (31.07.2026): pakette OLMAYAN 4 suite eklendi.
  //    Delik: bu dordu assert'liydi ama `npm run test:regression` onlari HIC
  //    kosmuyordu — "regresyon yesil" cumlesi KG9-KG13'u kapsamiyordu.
  //    Dordu de DB'siz (fixture/saf fonksiyon) → db bayragi YOK, hep kosar.
  { ad: 'Önceden fiyatlı (KG9-KG13)', script: 'test:of', zincir: 'Z1' },
  { ad: 'Admin Excel import (import-fidelity)', script: 'test:admin-import', zincir: 'Z1' },
  { ad: 'Kütüphane sayfa üretici (L1-L3)', script: 'test:library', zincir: 'Z1' },
  { ad: 'Performans bütçeleri', script: 'test:perf', zincir: 'Z3' },
  // ── PK1 (31.07.2026): MANIFEST KAPISI. Yukaridaki 4 suite aylarca bu
  //    listede DEGILDI; kok neden "unutmayi engelleyen kapi yok" idi. Bu suite
  //    o kapiyi kurar: package.json'daki her `test:*` ya burada olacak ya da
  //    manifest-kapisi.ts'teki GEREKCELI istisna listesinde.
  { ad: 'Manifest kapısı (PK1)', script: 'test:manifest', zincir: 'Z0' },
  { ad: 'build_sha kablolaması (PK2)', script: 'test:build-sha', zincir: 'Z0' },
  { ad: 'Sessiz indeks geri-düşüşü yasak (PK9)', script: 'test:pk9', zincir: 'Z2' },
  { ad: 'Para birimi çıktıya geçer (18a-18c)', script: 'test:18', zincir: 'Z4' },
  { ad: 'Toplamlar: üç yol × iki sütun (KD11)', script: 'test:kd11', zincir: 'Z1' },
  { ad: 'Kayıt toplamı ekranla aynı (KL P1-b)', script: 'test:kl-kayit', zincir: 'Z1' },
  { ad: 'Başlık satırı veri sayılmaz (KD12)', script: 'test:kd12', zincir: 'Z1' },
  { ad: 'Kimlik haritası sözleşmesi (PK3)', script: 'test:pk3', zincir: 'Z0' },
  { ad: 'Fixture kapsama kapısı (PK3-repo)', script: 'test:pk3-repo', zincir: 'Z0' },
  { ad: 'Kur ölçütünün kendisi (KD9)', script: 'test:kd9', zincir: 'Z4' },
  { ad: 'Kod haritası denetimi (HR3)', script: 'test:harita', zincir: 'Z0' },
  // ── DB gerektirenler (yerelde PG yoksa SKIP; VPS/CI'da kosulur) ──
  { ad: 'Eşleştirme DB regresyonu', script: 'test:regression:db', zincir: 'Z2', db: true },
  { ad: 'Kütüphane liste ekleme (KL)', script: 'test:kl', zincir: 'Z1', db: true },
  { ad: 'İşçilik sheet (DB)', script: 'test:labor-sheet', zincir: 'Z1', db: true },
  { ad: 'Sheets indeks + mükerrer yasağı (P2-2)', script: 'test:p2-2', zincir: 'Z1', db: true },
  { ad: 'Öksüz kütüphane satırı raporlanır (kalem 59)', script: 'test:kalem59', zincir: 'Z1', db: true },
];

function dbErisilebilir(): boolean {
  // Hizli TCP kontrolu yerine: DATABASE_URL tanimli + PG_REGRESSION=1 bayragi
  // (yerel gelistirmede PG cogu zaman kapali — yanlis negatif kirmizi yerine
  // ACIK bayrakla kosulur; VPS/CI ortami bayragi set eder).
  return process.env.PG_REGRESSION === '1';
}

const sonuclar: Array<{ ad: string; zincir: string; durum: 'PASS' | 'FAIL' | 'SKIP'; sure: string; not?: string }> = [];
const dbVar = dbErisilebilir();

for (const s of SUITES) {
  if (s.db && !dbVar) {
    sonuclar.push({ ad: s.ad, zincir: s.zincir, durum: 'SKIP', sure: '-', not: 'DB yok — PG_REGRESSION=1 ile koşulur' });
    continue;
  }
  const t0 = Date.now();
  const r = spawnSync('npm', ['run', s.script], { shell: true, encoding: 'utf-8' });
  const sure = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  // CIKIS KODU SOZLESMESI (31.07): 0 = PASS · 2 = ON KOSUL YOK (fixture
  // verisi eksik → SKIP) · diger = FAIL. Ayrimin sebebi: veri eksikligi
  // motor gerilemesi gibi gorunuyordu (test:regression:db 9/10 kirmizi,
  // oysa ÇAYIROVA fiyat listesinin adlari cokmus + ProductIndex 0 satir).
  const durum = r.status === 0 ? 'PASS' : r.status === 2 ? 'SKIP' : 'FAIL';
  const onKosulNotu = (r.stdout ?? '').split('\n').find((l: string) => l.includes('ON KOSUL YOK'))?.trim();
  sonuclar.push({
    ad: s.ad, zincir: s.zincir, durum, sure,
    not: durum === 'SKIP' ? (onKosulNotu ?? 'ÖN KOŞUL YOK (çıkış 2)') : undefined,
  });
  console.log(`${durum === 'PASS' ? '✅' : durum === 'SKIP' ? '⚪' : '❌'} [${s.zincir}] ${s.ad} (${sure})`);
  if (durum === 'FAIL') {
    console.log((r.stdout ?? '').split('\n').filter((l: string) => l.includes('FAIL')).slice(0, 10).join('\n'));
  }
  if (durum === 'SKIP') {
    console.log((r.stderr ?? '').split('\n').filter((l: string) => /ON KOSUL|marka fiyat|farkli cap|ProductIndex|→/.test(l)).slice(0, 6).join('\n'));
  }
}

console.log(`\n${'═'.repeat(64)}`);
console.log('ARINMA REGRESYON PAKETI — OZET');
console.log('═'.repeat(64));
for (const r of sonuclar) {
  console.log(`  ${r.durum === 'PASS' ? '🟢' : r.durum === 'SKIP' ? '⚪' : '🔴'} ${r.durum.padEnd(4)} [${r.zincir}] ${r.ad}`
    + `${r.sure !== '-' ? ` (${r.sure})` : ''}${r.not ? ` — ${r.not}` : ''}`);
}
const fail = sonuclar.filter((r) => r.durum === 'FAIL').length;
const skip = sonuclar.filter((r) => r.durum === 'SKIP').length;
console.log(`\nTOPLAM: ${sonuclar.length - fail - skip} PASS · ${fail} FAIL · ${skip} SKIP`);
if (skip) console.log('⚠ SKIP PASS DEĞİLDİR — atlanan paket doğrulanmamış sayılır.');
process.exit(fail > 0 ? 1 : 0);
