/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SIR DONDURME KAPISI  (devir Gorev 5, 13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 07.09 rotasyonu "5/5 kanitla" tamamlandi ama DB'deki CLAUDE_API_KEY'i
 * atlamisti ve betigin kapsam cumlesi SABIT bir metindi: o gunden sonra .env'e
 * giren SMTP_PASS'i ANMIYOR, yalniz basari dalinda basiliyordu. Sessizce atlayan
 * bir rotasyon betigi, rotasyon yapildi sanilmasina yol acar — nitekim acti.
 *
 * Bu kapi uc seyi olcer:
 *   - .env satir satir guncelleniyor, YENIDEN YAZILMIYOR (SMTP_* yasar)
 *   - kapsam raporu .env'den TURETILIYOR ve iki cikis dalinda da basiliyor
 *     (D blogu fonksiyonu sahte bir .env uzerinde GERCEKTEN calistirir)
 *   - "eski parola reddedildi" kaniti Postgres'in kendi red cumlesine bagli
 *
 * DB, SUNUCU ve AG GEREKTIRMEZ. D blogu `bash` gerektirir.
 * Cikis: 0 = PASS · digeri = FAIL.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

const KOK = path.join(__dirname, '../..');
// ⚠ Calisma agaci CRLF olabilir (core.autocrlf); betik metni LF'e cevrilir.
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8').replace(/\r\n/g, '\n');
/** Tam satir `#` yorumlarini soyar: basliktaki CLAUDE_API_KEY/IYZICO/.env gecisleri kodu olcmesin. */
const kabukKodu = (s: string) => s.replace(/^[ \t]*#.*$/gm, '');

function main(): void {
  const ham = oku('scripts/sir-dondur.sh');
  const kod = kabukKodu(ham);

  // ── S · YAPI ───────────────────────────────────────────────────────────
  console.log('\n── S · YAPI ──');
  const sedSatiri = /^sed -i -E "[^\n]*" \.env$/m.exec(kod)?.[0] ?? '';
  check('S-OLCUT betik okundu ve .env guncelleme satiri KODDA bulundu', sedSatiri.length > 0);

  check(
    'S1 .env YENIDEN YAZILMIYOR (tam yazim yok; SMTP_* bu yuzden yasar)',
    !/(cat|printf|echo)[^\n]*>\s*\.env(\s|$)/m.test(kod) && !/\btee\s+(-a\s+)?\.env\b/.test(kod),
  );

  const dondurulen = /^DONDURULEN="([^"]+)"$/m.exec(kod)?.[1]?.split(/\s+/) ?? [];
  check(
    'S2 dondurulen uc sir hem kapsam listesinde hem .env guncellemesinde',
    ['POSTGRES_PASSWORD', 'JWT_SECRET', 'INTERNAL_API_TOKEN'].every(
      (k) => dondurulen.includes(k) && sedSatiri.includes(`^${k}=`),
    ),
    `liste=${JSON.stringify(dondurulen)}`,
  );

  const fonk = /^kapsam_raporu\(\) \{\n([\s\S]*?)\n\}$/m.exec(kod)?.[1] ?? '';
  check(
    'S3 kapsam raporu .env anahtarlarindan TURETILIYOR (sabit metin degil)',
    fonk.includes("grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' .env") && fonk.includes('$SIR_DESENI'),
  );

  const cagri = kod.search(/^kapsam_raporu$/m);
  const sonKarar = kod.indexOf('if [ "$HATA" = 0 ]; then');
  check(
    'S4 kapsam raporu SON KARARDAN ONCE cagriliyor (basari da basarisizlik da gorur)',
    cagri !== -1 && sonKarar !== -1 && cagri < sonKarar,
    `cagri=${cagri} karar=${sonKarar}`,
  );
  check(
    'S5 kodda eski SABIT kapsam cumlesi kalmadi',
    !kod.includes('Bu betigin DOKUNMADIGI sirlar:'),
  );

  // ── S6 (Faz 7 F2a · T11): KIMLIK_SIFRELEME_KEY DONDURULMEZ ─────────────
  // Bu anahtar DB'deki MFA ve kurumsal giris sirlarini sifreler. Betik onu
  // dondururse eski deger kaybolur: DB'deki butun sirlar cozulemez ve HERKESIN
  // iki adimli girisi kirilir. Anahtar betigin KODUNDA hic gecmemeli (liste,
  // sed satiri, baska bir yazim). Betik bu turda DEGISMEDI; kapi yalniz olcer.
  const kimlikDondurulmez = (betikKodu: string): boolean => {
    const liste = /^DONDURULEN="([^"]+)"$/m.exec(betikKodu)?.[1]?.split(/\s+/) ?? [];
    return liste.length > 0 && !liste.includes('KIMLIK_SIFRELEME_KEY') && !betikKodu.includes('KIMLIK_SIFRELEME_KEY');
  };
  check(
    'S6 KIMLIK_SIFRELEME_KEY betik kodunda YOK (dondurulurse DB`deki MFA/kurumsal giris sirlari cozulemez)',
    kimlikDondurulmez(kod),
    `liste=${JSON.stringify(dondurulen)}`,
  );
  // FIXTURE KANITI: ayni olcut, listeye anahtar yazilmis SAHTE bir kopyada
  // gercekten kirmizi — olcut kor degil (liste ayristirilamazsa da kirmizi).
  const sahteKod = kod.replace(/^DONDURULEN="/m, 'DONDURULEN="KIMLIK_SIFRELEME_KEY ');
  check(
    'S6-OLCUT olcut listeye eklenmis anahtari yakaliyor (sahte kopya kirmizi)',
    sahteKod !== kod && !kimlikDondurulmez(sahteKod),
  );

  // ── K · KANITLAR ───────────────────────────────────────────────────────
  console.log('\n── K · KANITLAR ──');
  const k2 = kod.slice(kod.indexOf('ESKI_CIKTI='), kod.indexOf('BE_JWT='));
  check(
    'K2 "eski parola reddedildi" yalniz Postgres red cumlesiyle yesil',
    k2.includes("grep -qi 'password authentication failed'") && /OLCULEMEDI[^\n]*HATA=1/.test(k2),
    'onceki surum exec herhangi bir sebeple patlayinca da reddedildi yaziyordu',
  );
  const smtpListe = /^KORUNACAK_SMTP="([^"]+)"$/m.exec(kod)?.[1]?.split(/\s+/) ?? [];
  check(
    'K6 bes SMTP anahtari rotasyon oncesi/sonrasi karsilastiriliyor',
    ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'].every((k) => smtpListe.includes(k)) &&
      /for k in \$KORUNACAK_SMTP; do/.test(kod),
    `liste=${JSON.stringify(smtpListe)}`,
  );
  const korunanOnce = kod.indexOf('KORUNAN_ONCE=');
  const sedYeri = kod.indexOf(sedSatiri);
  const korunanKarsilastir = kod.indexOf('if [ "$KORUNAN_ONCE" != "$KORUNAN_SONRA" ]; then');
  const alterUser = kod.indexOf('ALTER USER');
  check(
    'K7 dondurulmeyen satirlar DB`ye dokunmadan ONCE dogrulaniyor (degistiyse .env geri alinir)',
    korunanOnce !== -1 && korunanOnce < sedYeri && sedYeri < korunanKarsilastir && korunanKarsilastir < alterUser,
    `once=${korunanOnce} sed=${sedYeri} karsilastir=${korunanKarsilastir} alter=${alterUser}`,
  );
  check(
    'K8 rotasyon yedegi git tarafindan izlenmiyor (.env.yedek-* ESKI sirlari duz metin tasir)',
    /^\.env\.yedek-\*$/m.test(oku('.gitignore')),
  );

  // ── D · DAVRANIS: kapsam raporu sahte .env uzerinde ────────────────────
  console.log('\n── D · DAVRANIS (kapsam_raporu sahte .env ile) ──');
  const okuTanim = /^oku\(\) \{[^\n]*\}$/m.exec(kod)?.[0] ?? '';
  const kapsamBloku = /^DONDURULEN="[\s\S]*?^kapsam_raporu\(\) \{\n[\s\S]*?\n\}$/m.exec(kod)?.[0] ?? '';
  check('D-OLCUT fonksiyon ve yardimcisi betikten cikarildi', okuTanim !== '' && kapsamBloku !== '');

  const dizin = fs.mkdtempSync(path.join(os.tmpdir(), 'sir-kapsam-'));
  fs.writeFileSync(
    path.join(dizin, '.env'),
    [
      'POSTGRES_USER=metaprice',
      'POSTGRES_PASSWORD=eski-pg',
      'JWT_SECRET=eski-jwt',
      'INTERNAL_API_TOKEN=eski-ic',
      'SMTP_HOST=smtp.ornek.test',
      'SMTP_PASS=gizli-smtp',
      'IYZICO_SECRET_KEY=gizli-iyzico',
      'GEMINI_API_KEY=',
      'UYGULAMA_URL=https://ornek.test',
      '',
    ].join('\n'),
  );
  const p = spawnSync('bash', ['-c', `set -euo pipefail\n${okuTanim}\n${kapsamBloku}\nkapsam_raporu\n`], {
    cwd: dizin,
    encoding: 'utf8',
  });
  fs.rmSync(dizin, { recursive: true, force: true });
  const cikti = `${p.stdout ?? ''}${p.stderr ?? ''}`;
  check('D-OLCUT2 bash ile kostu (cikis 0)', p.status === 0, `status=${p.status} hata=${p.error?.message ?? ''} cikti=${cikti.slice(0, 160)}`);

  const satir = (ad: string, etiket: string) => new RegExp(`${etiket}\\s+${ad}\\b`).test(cikti);
  check('D1 dondurulen sir raporda DONDURULDU', satir('JWT_SECRET', 'DONDURULDU'));
  check('D2 SMTP_PASS ADIYLA ATLANDI olarak listeleniyor (07.09 raporu bunu anmiyordu)', satir('SMTP_PASS', 'ATLANDI'));
  check('D3 IYZICO_SECRET_KEY ADIYLA ATLANDI', satir('IYZICO_SECRET_KEY', 'ATLANDI'));
  check('D4 bos sir BOS olarak ayriliyor', satir('GEMINI_API_KEY', 'BOS'));
  check('D5 .env disindaki CLAUDE_API_KEY ADIYLA ATLANDI', satir('CLAUDE_API_KEY', 'ATLANDI'));
  check(
    'D6 sir olmayan anahtar ve dondurulen sir ATLANDI listesine girmiyor',
    !satir('SMTP_HOST', 'ATLANDI') && !satir('UYGULAMA_URL', 'ATLANDI') && !satir('JWT_SECRET', 'ATLANDI'),
  );
  check('D7 rapor hicbir sir DEGERINI yazmiyor', !/gizli-|eski-/.test(cikti), cikti);

  console.log(`\n${'='.repeat(64)}\nSIR DONDURME KAPSAMI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

main();
