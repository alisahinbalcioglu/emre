/**
 * GUVENLIK PAKETI 1 — KABLOLAMA KAPISI  (`npm run test:guvenlik-paket1`)
 *
 * DB GEREKTIRMEZ. Hiz siniri Nest metadata'sindan OKUNUR (grep degil);
 * geri kalani yapilandirma dosyalarinin gercek iceriginden olculur.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Bu paketin degisikliklerinin cogu "eklendi mi" degil "BAGLI MI" sorusuyla
 * ayakta duruyor. Dekorator yazmak ile kapinin calismasi ayni sey degildir;
 * bu projede ayni tuzak defalarca yasandi (mekanizma var, cagiran yok).
 * Ozellikle su dort tanesi SESSIZCE olu kalabilir:
 *
 *   1) @Throttle dekoratoru konur ama sinifa ThrottlerGuard baglanmazsa
 *      hicbir sinir uygulanmaz ve hicbir hata da olusmaz.
 *   2) `trust proxy` unutulursa hiz siniri CALISIR ama IP'yi hep caddy'nin
 *      IP'si sanar: tum kullanicilar TEK kovayi paylasir. 5 hatali giris
 *      butun musterileri 15 dakika disarida birakir. Bu, sinirin olmamasindan
 *      DAHA kotudur — o yuzden burada birlikte olculuyorlar.
 *   3) Caddy'de `defer` yoksa `-X-Powered-By` silmesi upstream basligi
 *      geldikten ONCE calisir ve hicbir sey yapmaz.
 *   4) deploy.sh Caddy'yi yeniden yuklemezse Caddyfile'a yazilan her sey
 *      olu kalir — ustelik deploy "DOGRULANDI" der, cunku o dogrulama
 *      yalniz backend ve motor sha'sina bakar.
 *
 * ── OLCUTU ONCE DOGRULA (O bloklari) ────────────────────────────────────
 * Her "X var" iddiasinin yaninda, ayni probe ile olculen ve BULUNMAMASI
 * gereken bir ornek var. Amac: probe'un her seye "var" demedigini kanitlamak.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuthController } from '../src/altyapi/auth/auth.controller';

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
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');

/**
 * YORUMLARI SOY. Bu kapinin ilk surumunde bes assert YANLIS kirmizi verdi:
 * desenler kodu degil, kodun YANINDAKI aciklama satirini yakaliyordu (or.
 * "500mb ise bellegi tuketmeye izin veriyordu" yorumu "500mb kaldirildi mi"
 * olcumunu bozuyordu). Bir desen KODDA benzersiz olmali; yoksa test kendi
 * belgelerini olcer.
 */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ 	]*\/\/.*$/gm, '');
const kaddyKodu = (s: string) => s.replace(/^[ 	]*#.*$/gm, '');
// Kabuk betikleri icin ayni soyma. Bu kapinin F2 assert'i UC KEZ ayni tuzaga
// dustu: `indexOf('caddy reload')` kodu degil, kodun yanindaki aciklama
// satirindaki ayni kelimeleri buluyordu.
const kabukKodu = (s: string) => s.replace(/^[ 	]*#.*$/gm, '');

function main(): void {
  const proto = AuthController.prototype as unknown as Record<string, unknown>;
  const limit = (m: string) =>
    Reflect.getMetadata('THROTTLER:LIMITdefault', proto[m] as object);
  const ttl = (m: string) =>
    Reflect.getMetadata('THROTTLER:TTLdefault', proto[m] as object);

  // ── A. HIZ SINIRI: gercek Nest metadata'si ────────────────────────────
  console.log('\n── A · HIZ SINIRI (metadata, grep degil) ──');
  const guards = (Reflect.getMetadata('__guards__', AuthController) ??
    []) as Array<{ name?: string }>;
  const guardAdlari = guards.map((g) => g?.name ?? String(g));
  check(
    'A1 AuthController sinifina ThrottlerGuard BAGLI',
    guardAdlari.includes('ThrottlerGuard'),
    `bagli guard'lar: ${JSON.stringify(guardAdlari)}`,
  );
  check('A2 login limiti 5', limit('login') === 5, `okunan: ${limit('login')}`);
  check('A3 login penceresi 15 dk', ttl('login') === 900_000, `okunan: ${ttl('login')}`);
  check('A4 register limiti 5', limit('register') === 5, `okunan: ${limit('register')}`);
  check(
    'A5 register penceresi 15 dk',
    ttl('register') === 900_000,
    `okunan: ${ttl('register')}`,
  );
  // O blogu: probe her metoda "var" demiyor. `me` ucunda sinir OLMAMALI —
  // oturum acmis kullanicinin profilini okumasi kisitlanacak bir sey degil.
  check(
    'A6 ⟨olcut⟩ /auth/me ucunda sinir YOK (probe her seye "var" demiyor)',
    limit('me') === undefined,
    `okunan: ${limit('me')}`,
  );

  const appModule = oku('backend/src/app.module.ts');
  check(
    'A7 ThrottlerModule app.module.ts imports dizisinde',
    /ThrottlerModule\.forRoot\(/.test(appModule),
    'forRoot cagrisi bulunamadi',
  );
  // v6 API DIZI alir; v5 obje aliyordu. Yanlis sekil sessizce varsayilana duser.
  check(
    'A8 forRoot v6 sekliyle cagrilmis (DIZI, obje degil)',
    /ThrottlerModule\.forRoot\(\s*\[/.test(appModule),
    'forRoot([...]) bekleniyordu',
  );

  // ── B. TRUST PROXY: sinirin onkosulu ──────────────────────────────────
  console.log('\n── B · TRUST PROXY (sinirin IP tabani) ──');
  const mainTs = kodu(oku('backend/src/main.ts'));
  check(
    "B1 main.ts 'trust proxy' ayarini yapiyor",
    /app\.set\(\s*['"]trust proxy['"]/.test(mainTs),
  );
  check(
    'B2 deger 1 (tek hop) — `true` DEGIL',
    /app\.set\(\s*['"]trust proxy['"]\s*,\s*1\s*\)/.test(mainTs),
    '`true` yazilsaydi istemcinin uydurdugu X-Forwarded-For yutulur, sinir asilirdi',
  );
  check(
    'B3 NestExpressApplication tipi kullanilmis (yoksa .set DERLENMEZ)',
    /NestFactory\.create<NestExpressApplication>/.test(mainTs),
  );

  // ── C. GOVDE LIMITI ───────────────────────────────────────────────────
  console.log('\n── C · GOVDE LIMITI ──');
  check('C1 500mb limiti kaldirilmis', !/500mb/.test(mainTs));
  const limitler = mainTs.match(/limit:\s*['"](\d+)mb['"]/g) ?? [];
  check(
    'C2 json ve urlencoded IKISI de sinirli',
    limitler.length === 2,
    `bulunan limit sayisi: ${limitler.length}`,
  );
  check(
    'C3 limit 10mb DEGIL (olculdu: kaydedilen teklif govdesi ve fiyat listesi ice aktarimi 10mb`i asiyor)',
    !/limit:\s*['"]10mb['"]/.test(mainTs),
  );

  // ── D. CORS ───────────────────────────────────────────────────────────
  console.log('\n── D · CORS ──');
  check(
    "D1 uretimde localhost origin'leri EKLENMIYOR",
    /NODE_ENV\s*===\s*['"]production['"]/.test(mainTs) &&
      /uretim\s*\?\s*\[\]/.test(mainTs),
  );
  check(
    'D2 joker vercel/pages.dev desenleri KALDIRILMIS (o adlari herkes kaydedebilir)',
    !/vercel\\?\.app\$/.test(mainTs) && !/pages\\?\.dev\$/.test(mainTs),
  );
  check(
    'D3 ⟨olcut⟩ CORS_ORIGINS hala okunuyor (kapiyi tamamen kapatmadik)',
    /CORS_ORIGINS/.test(mainTs),
  );

  // ── E. CADDY GUVENLIK BASLIKLARI ──────────────────────────────────────
  console.log('\n── E · CADDY BASLIKLARI ──');
  const caddy = kaddyKodu(oku('Caddyfile'));
  check('E1 (guvenlik) snippet tanimli', /^\(guvenlik\)\s*\{/m.test(caddy));
  const importSayisi = (caddy.match(/^\s*import guvenlik\s*$/gm) ?? []).length;
  // Site blogu = yorum olmayan, snippet olmayan, girintisiz ve `{` ile biten
  // satir. Global options blogu (tek basina `{`) ve `(guvenlik) {` haric.
  const siteBlogu = (caddy.match(/^[^\s#(].*\{\s*$/gm) ?? []).length;
  check(
    `E2 HER site blogunda import var (${importSayisi}/${siteBlogu})`,
    importSayisi === siteBlogu && importSayisi >= 2,
    'a6a32ce`de tam olarak www blogu unutulmustu',
  );
  check(
    'E3 `defer` var (yoksa -X-Powered-By silmesi SESSIZCE etkisiz kalir)',
    /^\s*defer\s*$/m.test(caddy),
  );
  check('E4 HSTS var', /Strict-Transport-Security/.test(caddy));
  check(
    'E5 HSTS`de includeSubDomains/preload YOK (geri alinmasi cok zor taahhut)',
    !/includeSubDomains|preload/.test(caddy),
  );
  check(
    'E6 X-Frame-Options SAMEORIGIN (DENY DEGIL — teklif formati blob iframe kullaniyor)',
    /X-Frame-Options\s+"SAMEORIGIN"/.test(caddy),
  );
  check('E7 nosniff var', /X-Content-Type-Options\s+"nosniff"/.test(caddy));
  check('E8 Referrer-Policy var', /Referrer-Policy/.test(caddy));
  check('E9 Permissions-Policy var', /Permissions-Policy/.test(caddy));
  check(
    'E10 CSP RAPOR-ONLY (enforce DEGIL — once ihlal olmadigi dogrulanmali)',
    /Content-Security-Policy-Report-Only/.test(caddy) &&
      !/^\s*Content-Security-Policy\s/m.test(caddy),
  );
  check(
    'E11 CSP`de blob: var (PDF onizlemesi blob iframe`i)',
    /frame-src[^;"]*blob:/.test(caddy),
  );
  check('E12 -X-Powered-By silmesi var', /-X-Powered-By/.test(caddy));

  // ── F. DEPLOY CADDY'YI YENIDEN YUKLUYOR ───────────────────────────────
  console.log('\n── F · DEPLOY → CADDY RELOAD ──');
  const deploy = kabukKodu(oku('scripts/deploy.sh'));
  // DESEN KOMUTU HEDEFLEMELI: ilk surumde /caddy reload/ arandi ve bu, komutu
  // degil ASAGIDAKI HATA MESAJINDAKI ayni kelimeleri yakaliyordu — mutant
  // hayatta kaldi. Simdi tam cagri sekli aranıyor.
  check(
    'F1 deploy.sh caddy reload adimi iceriyor',
    /exec -T caddy caddy reload/.test(deploy),
    'yoksa Caddyfile degisiklikleri OLU kalir ve deploy yine "DOGRULANDI" der',
  );
  // ── 07.09.2026 · IKI SESSIZ KUSUR ─────────────────────────────────────
  // Ikisi de bugun CANLIDA olculdu ve ikisi de "basarili" gorunuyordu.
  check(
    'F3 deploy.sh KENDINI DEGISTIRME korumasi var (git pull betigi yeni inode ile yazar; bash eski kopyayi surdurur)',
    /IMZA_SONRA/.test(deploy) && /exec bash "\$0"/.test(deploy),
    'olculdu: caddy adimi eklendi, deploy "DOGRULANDI" dedi, adim HIC kosmadi',
  );
  check(
    'F4 Caddyfile dogrulamasi HOST dosyasi uzerinden, TAZE mount ile (konteyner icinden dogrulamak bayat kopyayi dogrular)',
    /docker run --rm -v "\$PWD\/Caddyfile/.test(deploy),
  );
  check(
    'F5 host/konteyner md5 karsilastirilip gerekirse konteyner YENIDEN OLUSTURULUYOR (reload yetmez)',
    /HOST_MD5/.test(deploy) &&
      /KAP_MD5/.test(deploy) &&
      /--force-recreate caddy/.test(deploy),
    'olculdu: host c374edde (4793B) iken konteyner ebfaeefc (1664B) goruyordu',
  );
  check(
    'F6 yeniden olusturma SONRASI mount tazeligi tekrar OLCULUYOR (iddia degil)',
    /YENI_MD5/.test(deploy),
  );
  check(

    'F2 reload`dan ONCE validate var (bozuk yapilandirmayla reload siteyi indirebilir)',
    // Dogrulama, DEGISTIREN her adimdan ONCE gelmeli: hem reload hem
    // force-recreate. Ilk surum yalniz reload'a bakiyordu; recreate eklenince
    // o assert sessizce eksik kalirdi.
    deploy.indexOf('caddy validate') !== -1 &&
      deploy.indexOf('caddy validate') < deploy.indexOf('caddy reload') &&
      deploy.indexOf('caddy validate') < deploy.indexOf('--force-recreate caddy'),
  );

  // ── G. ON YUZ ─────────────────────────────────────────────────────────
  console.log('\n── G · ON YUZ ──');
  const kokLayout = kodu(oku('frontend/app/layout.tsx'));
  check('G1 <html lang="tr">', /<html lang="tr">/.test(kokLayout));
  check(
    'G2 Inter fontunda latin-ext var (Turkce g s I harfleri icin)',
    /subsets:\s*\[\s*'latin',\s*'latin-ext'\s*\]/.test(kokLayout),
  );
  check(
    'G3 description Turkce ve olmayan bir ozelligi (PDF disa aktarma) vaat etmiyor',
    !/Manage pricing libraries/.test(kokLayout) &&
      !/export PDFs/.test(kokLayout),
  );
  const korumali = oku('frontend/app/(protected)/layout.tsx');
  check(
    'G4 ust barda cikis dugmesi JSX`e BAGLI (bilesen tanimli olmasi yetmez)',
    /<UserDropdown\s+user=\{user\}\s+onLogout=\{handleLogout\}/.test(korumali),
  );

  // ── H. ODEME: TAHSILAT KANITI ─────────────────────────────────────────
  console.log('\n── H · ODEME (kanitsiz uzatma) ──');
  const abonelik = kodu(
    oku('backend/src/ozellik/odeme/abonelik/abonelik.servisi.ts'),
  );
  check(
    'H1 siparis dogrulanamazsa HATA firlatiliyor (erisim uzatilmiyor)',
    /if\s*\(!siparis\)\s*\{[\s\S]{0,600}?throw new Error\(/.test(abonelik),
  );
  check(
    'H2 donemSonuHesapla geri dusumu artik `siparis` YOKKEN calismiyor',
    !/siparis\?\.endPeriod/.test(abonelik),
    'eski hal `siparis?.endPeriod ? ... : donemSonuHesapla(...)` idi — kanit yoksa bir donem hediye ediyordu',
  );
  check(
    'H3 ⟨olcut⟩ gecerli siparis geldiginde endPeriod hala kullaniliyor',
    /siparis\.endPeriod/.test(abonelik),
  );

  son();
}

function son(): void {
  console.log(
    `\n${'='.repeat(64)}\nGUVENLIK PAKETI 1: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
  );
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

main();
