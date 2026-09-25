/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  DEPLOY SONRASI "DOKUNULANI OLC" KAPISI (B2 · plan 1.12)  (`npm run test:deploy-olcum`)
 *
 *  `scripts/deploy-olcum.cjs` canli adrese karsi kosar; bu dosya onu AGSIZ, yerel
 *  bir HTTP sunucusuna karsi kosar ve KARARLARINI olcer:
 *   D1  json: surum esitse gecer, degilse kalir
 *   D2  baslik: `var` birebir, `yok` basligi varsa kalir
 *   D3  paket-metni: kucultucunun `\xNN` kacisli metni BULUNUR (canli pakette
 *       "örn" = "\xf6rn" olculdu); metin yoksa kalir; sayfada parca yoksa kalir
 *   D4  ag hatasi olcumu KALDIRIR (yutulmaz, gecti sayilmaz)
 *   D5  kural: yalniz surum olcen defter REDDEDILIR · "$SHA" + --sha yoksa hata
 *   D6  bu turun defteri: surum disinda en az bir olcum var, isaret metinleri kaynakta VAR
 *
 *  DB ve AG GEREKMEZ (127.0.0.1, rastgele port).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { olcumKos, defterKos, kacislariCoz } = require('../../scripts/deploy-olcum.cjs');

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad} — ${detay}`); }
  else { failures.push(`${ad} — ${detay}`); console.log(`  FAIL: ${ad} — ${detay}`); }
}

const KOK = path.resolve(__dirname, '../..');

/** Kucultulmus pakette gorulen bicim: Latin-1 harfleri \xNN kacisli. */
const PARCA_A = 'cancelText:"Vazge\\xe7",input:{yerTutucu:"\\xf6rn 30 ya da %30"}});';
const PARCA_B = 'if(null==t?void 0:t.kurAlinamadi)return{netPrice:0,kurAlinamadi:!0};';

function sunucu(): Promise<{ taban: string; kapat: () => Promise<void> }> {
  const srv = http.createServer((req, res) => {
    const yol = (req.url ?? '').split('?')[0];
    if (yol === '/api/health') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
      return res.end(JSON.stringify({ status: 'ok', build_sha: 'abc123def456' }));
    }
    if (yol === '/ciplak') {
      res.setHeader('X-Powered-By', 'Express');
      return res.end('{}');
    }
    if (yol === '/quotes/new') {
      res.setHeader('Content-Type', 'text/html');
      return res.end('<html><script src="/_next/static/chunks/a-1.js" async></script><script src="/_next/static/chunks/app/b-2.js"></script></html>');
    }
    if (yol === '/parcasiz') return res.end('<html><body>bos</body></html>');
    if (yol === '/_next/static/chunks/a-1.js') return res.end(PARCA_A);
    if (yol === '/_next/static/chunks/app/b-2.js') return res.end(PARCA_B);
    res.statusCode = 404;
    return res.end('yok');
  });
  return new Promise((coz) => srv.listen(0, '127.0.0.1', () => {
    const port = (srv.address() as { port: number }).port;
    coz({ taban: `http://127.0.0.1:${port}`, kapat: () => new Promise<void>((k) => srv.close(() => k())) });
  }));
}

bitmezseKirmizi((async () => {
  const { taban, kapat } = await sunucu();
  const sessiz = () => undefined;

  console.log('── D1) json: surum ──');
  {
    const esit = await olcumKos({ tip: 'json', yol: '/api/health', alan: 'build_sha', esit: '$SHA' }, taban, 'abc123def456');
    check('D1a surum esit → GECTI', esit.gecti === true, esit.gozlem);
    const farkli = await olcumKos({ tip: 'json', yol: '/api/health', alan: 'build_sha', esit: '$SHA' }, taban, '8c71c7836441');
    check('D1b surum farkli → KALDI', farkli.gecti === false, farkli.gozlem);
  }

  console.log('── D2) baslik ──');
  {
    const var_ = await olcumKos({ tip: 'baslik', yol: '/api/health', var: { 'X-Permitted-Cross-Domain-Policies': 'none' }, yok: ['X-Powered-By'] }, taban);
    check('D2a baslik birebir + yasakli baslik yok → GECTI', var_.gecti === true, var_.gozlem);
    const eksik = await olcumKos({ tip: 'baslik', yol: '/ciplak', var: { 'X-Permitted-Cross-Domain-Policies': 'none' } }, taban);
    check('D2b beklenen baslik eksik → KALDI', eksik.gecti === false && eksik.gozlem.includes('X-Permitted-Cross-Domain-Policies'), eksik.gozlem);
    const fazla = await olcumKos({ tip: 'baslik', yol: '/ciplak', yok: ['X-Powered-By'] }, taban);
    check('D2c yasakli baslik (X-Powered-By) varsa → KALDI', fazla.gecti === false && fazla.gozlem.includes('Express'), fazla.gozlem);
  }

  console.log('── D3) paket-metni ──');
  {
    check('D3-olcut kacis cozumu: "\\xf6rn" → "örn"', kacislariCoz('"\\xf6rn 30"') === '"örn 30"', kacislariCoz('"\\xf6rn 30"'));
    const bulundu = await olcumKos({ tip: 'paket-metni', yol: '/quotes/new', icerir: ['örn 30 ya da %30', 'Vazgeç', 'kurAlinamadi'] }, taban);
    check('D3a kacisli ve kacissiz metinler iki parcadan BULUNDU → GECTI', bulundu.gecti === true && bulundu.gozlem.includes('a-1.js') && bulundu.gozlem.includes('b-2.js'), bulundu.gozlem);
    const yok = await olcumKos({ tip: 'paket-metni', yol: '/quotes/new', icerir: ['örn 30 ya da %30', 'Kur alınamadı — fiyat yazılmadı'] }, taban);
    check('D3b metinlerden biri pakette yoksa → KALDI', yok.gecti === false && yok.gozlem.includes('→YOK'), yok.gozlem);
    const parcasiz = await olcumKos({ tip: 'paket-metni', yol: '/parcasiz', icerir: ['herhangi'] }, taban);
    check('D3c sayfada JS parcasi yoksa → KALDI (bos kume gecti sayilmaz)', parcasiz.gecti === false, parcasiz.gozlem);
  }

  console.log('── D4) ag hatasi ──');
  {
    const r = await olcumKos({ tip: 'json', yol: '/api/health', alan: 'build_sha', esit: 'x' }, 'http://127.0.0.1:1');
    check('D4 baglanti kurulamazsa → KALDI, istisna yutulmadi', r.gecti === false && r.gozlem.startsWith('olcum hatasi'), r.gozlem);
  }

  console.log('── D5) defter kurallari ──');
  {
    let red = '';
    try {
      await defterKos({ olcumler: [{ ad: 'surum', tip: 'json', yol: '/api/health', alan: 'build_sha', esit: 'abc123def456' }] }, { taban, yaz: sessiz });
    } catch (e: any) { red = e.message; }
    check('D5a yalniz surum olcen defter REDDEDILDI (plan 1.12)', red.includes('yalniz surum'), red || 'reddedilmedi');
    const shasiz = await olcumKos({ tip: 'json', yol: '/api/health', alan: 'build_sha', esit: '$SHA' }, taban, null);
    check('D5b "$SHA" kullanilip --sha verilmezse olcum KALDI', shasiz.gecti === false && shasiz.gozlem.includes('--sha'), shasiz.gozlem);
    const satirlar: string[] = [];
    const { kalan, sonuclar } = await defterKos({
      olcumler: [
        { ad: 'surum', tip: 'json', yol: '/api/health', alan: 'build_sha', esit: '$SHA' },
        { ad: 'baslik', tip: 'baslik', yol: '/api/health', var: { 'X-Permitted-Cross-Domain-Policies': 'none' } },
      ],
      olculemeyenler: [{ ad: 'oturumlu olcum', neden: 'veri yok' }],
    }, { taban, sha: 'abc123def456', yaz: (s: string) => satirlar.push(s) });
    check('D5c olculemeyenler basari SAYILMADI ve ayri basildi',
      kalan === 0 && sonuclar.length === 2 && satirlar.some((s) => s.includes('ÖLÇÜLEMEDİ')) && satirlar.some((s) => s.includes('1 olculemedi')),
      satirlar[satirlar.length - 1].trim());
  }

  console.log('── D6) bu turun defteri ──');
  {
    const defter = JSON.parse(fs.readFileSync(path.join(KOK, 'scripts/deploy-olcum/para-dogrulugu-turu.json'), 'utf-8'));
    const surumDisi = defter.olcumler.filter((o: any) => !(o.tip === 'json' && o.alan === 'build_sha'));
    check('D6a defterde surum DISINDA olcum var', surumDisi.length >= 3, surumDisi.map((o: any) => o.ad).join(' · '));
    // Isaret metni kaynakta yoksa canlida hic bulunamaz → olcum sonsuza dek kalir
    // (ya da biri metni degistirir, defter bayatlar). Kaynak ile defter AYNI metni tasimali.
    const kaynaklar = [
      fs.readFileSync(path.join(KOK, 'frontend/app/(protected)/quotes/new/page.tsx'), 'utf-8'),
      fs.readFileSync(path.join(KOK, 'frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx'), 'utf-8'),
    ].join('\n');
    const isaretler: string[] = surumDisi.filter((o: any) => o.tip === 'paket-metni').flatMap((o: any) => o.icerir);
    const kaynaktaYok = isaretler.filter((m) => !kaynaklar.includes(m));
    check('D6b paket isaret metinlerinin HEPSI on yuz kaynaginda birebir var', isaretler.length >= 3 && kaynaktaYok.length === 0,
      `isaret ${isaretler.length} · kaynakta yok: [${kaynaktaYok.join(', ')}]`);
  }

  await kapat();
  console.log(`\nSONUC: ${passed} PASS, ${failures.length} FAIL`);
  if (failures.length) {
    for (const f of failures) console.log(`  ❌ ${f}`);
    // process.exit DEGIL: fetch'in acik soketleri varken Windows'ta surec
    // 3221226505 (0xC0000409) ile coker — kirmizi kalir ama kod belirsizlesir
    // (mutasyon kosumunda olculdu). Dongu bosalinca 1 ile cikar.
    process.exitCode = 1;
  }
})().catch((e) => { console.error('BEKLENMEYEN:', e); process.exit(1); }));
