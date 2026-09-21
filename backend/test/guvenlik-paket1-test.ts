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
    deploy.includes('docker run --rm --env-file .env -v "$PWD/Caddyfile'),
  );
  check(
    'F9 dogrulama konteyneri ORTAM DEGISKENLERINI aliyor (--env-file)',
    deploy.includes('--env-file .env'),
    'Caddyfile {$DOMAIN}/{$ACME_EMAIL} kullaniyor; env`siz dogrulama GECERLI dosyayi GECERSIZ ilan eder (07.09`da yasandi)',
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

  check(
    'F7 build cache SINIRLI budaniyor (budama yoktu; disk 06.09`da %84`e ulasmisti)',
    /docker builder prune/.test(deploy) && /until=72h/.test(deploy),
    'olculdu: iki deploy 5,94 GB cache uretti (~3 GB/deploy)',
  );
  check(
    'F8 budama DOGRULAMADAN SONRA ve deploy`u dusurmeyecek sekilde',
    deploy.indexOf('DEPLOY DOGRULANDI') < deploy.indexOf('docker builder prune') &&
      deploy.includes('docker builder prune -af --filter until=72h >/dev/null 2>&1 || true'),
    'budama basarisizligi teslimati dusurmemeli — disk temizligi onkosul degil',
  );

  // ── F10 / F11 (10.09.2026) ────────────────────────────────────────────
  // F10 KONUMSAL: salt varlik arayan bir assert, umask pg_dump'tan SONRAYA
  // tasinsa da yesil kalirdi. Dilim sart: `umask 077` backup.sh'ta da geciyor;
  // dilim onu deploy.sh dump blogunda benzersiz kilar.
  const dumpBas = deploy.indexOf('docker compose exec -T -e ADI=');
  const dumpSon = deploy.indexOf('YEDEK DOGRULANDI');
  const dumpBlok = dumpBas !== -1 && dumpSon > dumpBas ? deploy.slice(dumpBas, dumpSon) : '';
  check(
    'F10-OLCUT deploy oncesi dump blogu bulundu',
    dumpBlok.includes('pg_dump'),
    `dilim uzunlugu=${dumpBlok.length}`,
  );
  check(
    'F10 deploy oncesi dump 0600 doguyor (umask 077, pg_dump ONCESINDE)',
    dumpBlok.includes('umask 077') && dumpBlok.indexOf('umask 077') < dumpBlok.indexOf('pg_dump'),
    'olculdu 09.09: exec kabugu umask=0022, uc deploy dump dosyasi 0644 dogdu',
  );
  // ⚠ Bitis BASLANGICTAN SONRA aranir: `DEPLOY DOGRULANAMADI (backend)` basari
  // dalindan ONCE de geciyor. Ilk surum duz indexOf kullandi, dilim BOS kaldi
  // ve assert var olan satiri bulamadi (olculdu 13.09).
  const basariBas = deploy.indexOf('DEPLOY DOGRULANDI');
  const basariSon = deploy.indexOf('DEPLOY DOGRULANAMADI', basariBas);
  const basariDali = basariBas !== -1 && basariSon > basariBas ? deploy.slice(basariBas, basariSon) : '';
  check(
    'F11-OLCUT basari dali dilimi bulundu (ilk builder prune icinde)',
    basariDali.includes('docker builder prune -af --filter until=72h'),
    `dilim uzunlugu=${basariDali.length}`,
  );
  check(
    'F11 build cache MUTLAK TAVANLI (yas suzgeci art arda deploy`larda sifir siliyordu)',
    basariDali.includes('docker builder prune -af --keep-storage 10GB >/dev/null 2>&1 || true'),
    'olculdu 09.09: 88 kayit / 12.76 GB, hepsi 72 saatten genc',
  );

  // ── F12-F16 (21.09.2026) · DEPLOY ONCESI DOKUMLERDE 30 GUN SAKLAMA ────
  // K5: butun yedekler en fazla 30 gun. OLCULDU 21.09 canlida: deploy oncesi
  // dokumler HIC silinmiyordu — 104 dosya, en eskisi 4 Agustos, 1,1 GB, 47`si
  // 30 gunden eski. Gizlilik metni "silinen veriler yedeklerden en gec 30 gun
  // icinde cikar" diyor; suresiz saklanan bir dokum o cumleyi YALAN yapar.
  // ⚠ Desenler CRLF`e dayanikli olmali: `oku` ham okur, calisma agacinda
  // satirlar \r\n ile biter ama CI`da \n. `^...$` capasi kullanmayin.
  const budamaIdx = deploy.indexOf('-name "deploy-oncesi-*.sql.gz" ! -name');
  check(
    'F12-OLCUT deploy yedegi budama satiri bulundu',
    budamaIdx !== -1,
    'bulunamazsa asagidaki F13-F16 hicbir sey olcmez (bos dilim yalanci yesil verir)',
  );
  check(
    'F13 deploy oncesi dokumler 30 gun saklaniyor',
    /YEDEK_SAKLAMA_GUN=30/.test(deploy) && /-mtime "\+\$SAKLAMA"/.test(deploy),
    'esik DEGISKENDEN okunmali; sabit yazilirsa iki yer sessizce ayrisir',
  );
  const backupKodu = kabukKodu(oku('scripts/backup.sh'));
  // ⚠ CAPA SART. Ilk surum `/SAKLAMA_GUN=30/` ariyordu; 21.09'da ayni dosyaya
  // `DIGER_SAKLAMA_GUN=30` eklenince desen ONU yakaladi ve F14 YANLIS KIRMIZI
  // verdi — oysa 14 hic degismemisti. Desen KODDA benzersiz olmali: `[^A-Z_]`
  // on eki `DIGER_` gibi onekleri ayirir. CRLF icin `$` capasi KULLANILMAZ.
  check(
    'F14 backup.sh gunluk dokum saklamasi 14 gun — DEGISMEDI',
    /(^|[^A-Z_])SAKLAMA_GUN=14\b/m.test(backupKodu) &&
      !/(^|[^A-Z_])SAKLAMA_GUN=(?!14\b)\d/m.test(backupKodu) &&
      backupKodu.includes(
        "find /backups -name 'metaprice-*.sql.gz' -mtime \"+$SAKLAMA_GUN\" -delete",
      ),
    'deploy yedeginin 30 gunu gunluk dokumun 14 gununu DEGISTIRMEZ — ayri karar',
  );
  // KONUMSAL. Salt varlik arayan bir assert, budama pg_dump`tan ONCEYE
  // tasinsa da yesil kalirdi. Tam olarak bu mutasyon kosuldu (21.09): budama
  // `umask 077` altina tasinip BASARISIZ bir dump kosturuldu — 104 dosyanin
  // 47`si silindi, yani yedeksiz kalinabiliyordu. Bu assert onu kirmizi yapar.
  check(
    'F15 budama YALNIZ dogrulanmis dump`tan SONRA (dump dusen gunde silme YOK)',
    deploy.indexOf('mv "$GECICI" "/backups/$ADI"') !== -1 &&
      deploy.indexOf('mv "$GECICI" "/backups/$ADI"') < budamaIdx &&
      deploy.indexOf('YEDEK DOGRULANDI') < budamaIdx,
    'backup.sh:6-15 ayni kusuru anlatiyor: silme `if` blogunun disindaydi ve basarisiz gunlerde de kosuyordu',
  );
  check(
    'F16 budama yalniz deploy-oncesi ailesini seciyor, YENI yedegi disarida birakiyor',
    /! -name "\$ADI"/.test(deploy) &&
      !/find \/backups -name "metaprice-/.test(deploy),
    'metaprice-* backup.sh`in isi; bu betik ona DOKUNMAMALI',
  );

  // ── F17 (21.09.2026) · BU TURDA GERCEKTEN YASANDI ─────────────────────
  // Dump yuku TEK TIRNAKLI bir kabuk dizgisi. Icine Turkce kesme isareti
  // (deploy + kesme + un gibi) yazilinca dizgi ERKEN kapandi ve BUTUN betik
  // sozdizimi hatasi verdi. `bash -n` yakaladi, kapilar yakalamadi.
  // ⚠ HAM metin kullanilir, `kabukKodu` DEGIL: yuk icindeki `#` satirlari
  // kabuk icin YORUM DEGIL duz metindir — soyulursa kesme isareti gizlenir.
  // ⚠ sunucu-urunleri kapisindaki Y2 assert`i bunu YAKALAMAZ: yalniz
  // pg_dump`tan ONCEKI metne bakar (`metin.slice(0, m.index)`) ve yorumlari
  // soyar. OLCULDU 21.09: kesme isareti yuke geri konuldu, Y2 YESIL kaldi.
  const ACICI = 'backup sh -c ' + String.fromCharCode(39);
  const deployHam = oku('scripts/deploy.sh').replace(/\r\n/g, '\n');
  const yukBas = deployHam.indexOf(ACICI);
  const yukSon = deployHam.indexOf('\n' + String.fromCharCode(39) + ' 2>&1', yukBas);
  const yuk =
    yukBas !== -1 && yukSon > yukBas
      ? deployHam.slice(yukBas + ACICI.length, yukSon)
      : '';
  check(
    'F17-OLCUT dump yuku dilimi bulundu',
    yuk.includes('pg_dump') && yuk.includes('BUDAMA'),
    `dilim uzunlugu=${yuk.length} (0 ise F17 hicbir sey olcmez)`,
  );
  check(
    'F17 TEK TIRNAKLI dump yukunde kesme isareti YOK (yoksa yuk erken kapanir, betik olur)',
    !yuk.includes(String.fromCharCode(39)),
    'olculdu 21.09: budama yorumlarindaki iki Turkce kesme isareti betigi kirdi',
  );

  // ── F18-F20 (21.09.2026) · BACKUP.SH GUNLUK DONGUSU — DIGER UC AILE ────
  // OLCULDU 21.09: /backups altinda DORT dokum ailesi var, yalniz `metaprice-*`
  // suruluyordu. K5 "butun yedekler en fazla 30 gun" diyor ve gizlilik metnine
  // "silinen veriler yedeklerden en gec 30 gun icinde cikar" cumlesi giriyor;
  // suresiz saklanan bir aile o cumleyi YANLIS BEYAN yapar.
  // deploy.sh kendi ailesini buduyor AMA yalniz deploy aninda — deploy
  // yapilmayan donemde taahhut GUNLUK donguden gelmek zorunda.
  check(
    'F18 backup.sh gunluk dongusu diger UC aileyi 30 gun tutuyor (K5)',
    /DIGER_SAKLAMA_GUN=30/.test(backupKodu) &&
      /-name 'geri-yukleme-oncesi-\*\.sql\.gz'/.test(backupKodu) &&
      /-name 'bekci-\*\.sql\.gz'/.test(backupKodu) &&
      /-name 'deploy-oncesi-\*\.sql\.gz'/.test(backupKodu) &&
      /-mtime "\+\$DIGER_SAKLAMA_GUN"/.test(backupKodu),
    'biri eksikse o aile SURESIZ birikir ve gizlilik cumlesi yalan olur',
  );
  const tazeIdx = backupKodu.indexOf('TAZE_YEDEK=');
  const silmeIdx = backupKodu.indexOf('-mtime "+$DIGER_SAKLAMA_GUN"');
  check(
    'F19-OLCUT can simidi kapisi ve 30 gun silmesi bulundu',
    tazeIdx !== -1 && silmeIdx !== -1,
    `taze=${tazeIdx} silme=${silmeIdx} (biri -1 ise F19/F20 hicbir sey olcmez)`,
  );
  // KONUMSAL. `geri-yukleme-oncesi-*` bir geri yuklemenin TEK donusudur;
  // elde guncel dogrulanmis yedek yokken silinmesi kabul edilemez.
  check(
    'F19 30 gun silmesi TAZE metaprice yedegi kapisinin ARKASINDA',
    tazeIdx !== -1 &&
      silmeIdx > tazeIdx &&
      /if \[ "\$TAZE_YEDEK" -lt 1 \]/.test(backupKodu),
    'olculdu 21.09: kapi devre disi birakilinca taze yedek SIFIRKEN can simidi dahil 6 dosya silindi',
  );
  const digerBas = backupKodu.indexOf('SILINEN_DIGER=');
  const digerDilim =
    digerBas !== -1 && silmeIdx > digerBas ? backupKodu.slice(digerBas, silmeIdx) : '';
  check(
    'F20-OLCUT 30 gun silme dilimi bulundu',
    digerDilim.includes('geri-yukleme-oncesi'),
    `dilim uzunlugu=${digerDilim.length}`,
  );
  check(
    'F20 30 gun silmesi metaprice-* ailesine DOKUNMUYOR (o aile 14 gunde kaliyor)',
    digerDilim.length > 0 && !digerDilim.includes('metaprice-'),
    '30 gun blogu metaprice-*yi kapsarsa gunluk yedek 14 yerine 30 gun yasar — K5 ayri karar',
  );

  // ── F21-F23 (21.09.2026) · YEDEK SERVISI TAZELIGI — KOSULLU YENIDEN YARATMA
  // backup.sh konteynere TEK DOSYA olarak bagli (docker-compose.yml:216).
  // Iki kat bayatlik: Docker tek-dosya mount'u INODE'a baglar VE entrypoint
  // sonsuz while dongusunde oldugu icin kabuk dosyayi yeniden okumaz. Yani
  // yeniden yaratmadan backup.sh degisikligi ASLA yururluge girmez ve deploy
  // yine "DOGRULANDI" der — SESSIZ basarisizlik. K5 saklama kurali artik o
  // dosyada oldugu icin bu, gizlilik metnindeki 30 gun sozunu yanlis beyana
  // cevirebilir.
  // ⚠ Ama KOSULSUZ yeniden yaratmak da yanlis: kap yeniden dogunca 24 saatlik
  // dump dongusu bastan baslar, art arda deploy'lar gunluk yedegi erteler.
  // Bu yuzden assert'ler "yeniden yaratiyor" degil, "YALNIZ DEGISINCE
  // yeniden yaratiyor" olcer.
  const tazelikKiyas = deploy.indexOf('[ "$YEDEK_HOST_MD5" = "$YEDEK_KAP_MD5" ]');
  const tazelikYarat = deploy.indexOf('--force-recreate backup');
  check(
    'F21-OLCUT yedek tazeligi blogu bulundu (kiyas + yeniden yaratma)',
    tazelikKiyas !== -1 && tazelikYarat !== -1,
    `kiyas=${tazelikKiyas} yarat=${tazelikYarat} (biri -1 ise F22/F23 hicbir sey olcmez)`,
  );
  check(
    'F21 tazelik KONTEYNERIN GORDUGU dosyadan olculuyor (saklanan hash YOK)',
    deploy.includes('docker compose exec -T backup md5sum /backup.sh') &&
      deploy.includes('md5sum scripts/backup.sh'),
    'saklanan bir hash yanlis yerde dururken her yeniden yaratmada DEGISTI sanilir ve dongu tekrar sifirlanir',
  );
  check(
    'F22 yeniden yaratma KIYASIN ARKASINDA — her deployda DEGIL, yalniz backup.sh degisince',
    tazelikKiyas !== -1 && tazelikYarat > tazelikKiyas,
    'kosulsuz yeniden yaratma 24 saatlik dump dongusunu her deployda sifirlar',
  );
  check(
    'F23 yeniden yaratma SONRASI mount tazeligi tekrar OLCULUYOR (iddia degil)',
    /YENI_YEDEK_MD5/.test(deploy) &&
      deploy.indexOf('YENI_YEDEK_MD5') > tazelikYarat,
    'olculdu 07.09: caddy reload cikis kodu 0 dondu ve ESKI yapilandirmayi yukledi',
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
