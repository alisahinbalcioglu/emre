/**
 * ORTAM DEGISKENLERI KAPISI  (`npm run test:ortam`)
 *
 * DB/SUNUCU GEREKTIRMEZ. Kaynak kod, docker-compose.yml ve .env.example
 * metin olarak okunup KARSILASTIRILIR.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Bu kurulumda bir ortam degiskeni IKI YERE birden yazilmak zorundadir:
 *
 *   1. sunucudaki `.env`            → DEGERI saglar
 *   2. `docker-compose.yml`         → degeri KONTEYNERE gecirir
 *      (backend.environment blogu)
 *
 * Yalniz `.env`e yazmak YETMEZ: compose'un `environment` blogunda ANILMAYAN
 * bir degisken konteynere HIC GECMEZ. Uygulama onu tanimsiz gorur ve —
 * odeme tarafinda — sessizce "yapilandirilmamis" moda duser.
 *
 * Bu kusurun sinsi tarafi: hicbir sey PATLAMAZ. `.env` dolu, panel dolu,
 * gunlukte "eksik degisken" uyarisi ciksa bile kimse .env'i kontrol edip
 * "ama ben yazmistim" der ve compose'a bakmak akla gelmez.
 *
 * Kapi kodun GERCEKTEN OKUDUGU degiskenleri kaynaktan cikarir
 * (`config.get('X')` / `getOrThrow('X')` / `process.env.X`) ve compose'da
 * anilip anilmadigini olcer. Yon TEK: kodun okudugu compose'da OLMALI.
 * Tersi serbest — compose baska servisler icin fazladan degisken tasiyabilir.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

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
const ODEME = path.join(__dirname, '../src/ozellik/odeme');

/** Bir dizindeki tum .ts dosyalarini toplar. */
function tsDosyalari(dizin: string): string[] {
  const cikti: string[] = [];
  for (const g of fs.readdirSync(dizin, { withFileTypes: true })) {
    const tam = path.join(dizin, g.name);
    if (g.isDirectory()) cikti.push(...tsDosyalari(tam));
    else if (g.name.endsWith('.ts')) cikti.push(tam);
  }
  return cikti;
}

function main() {
  // ── Kodun okudugu degiskenler ────────────────────────────────────────
  const dosyalar = tsDosyalari(ODEME);
  const okunan = new Set<string>();
  for (const d of dosyalar) {
    const s = fs.readFileSync(d, 'utf8');
    for (const m of s.matchAll(
      /config\.(?:get|getOrThrow)<[^>]*>?\(\s*'([A-Z0-9_]+)'/g,
    )) {
      okunan.add(m[1]);
    }
    for (const m of s.matchAll(/config\.(?:get|getOrThrow)\(\s*'([A-Z0-9_]+)'/g)) {
      okunan.add(m[1]);
    }
    for (const m of s.matchAll(/process\.env\.([A-Z0-9_]+)/g)) okunan.add(m[1]);
    // yapilandirma.ts'teki zorunlu liste
    for (const m of s.matchAll(/'(IYZICO_[A-Z0-9_]+)'/g)) okunan.add(m[1]);
  }

  // OLCUT: cikarici gercekten calisiyor mu? Bilinen bir degisken cikmali.
  check(
    'O-OLCUT kaynak taraycisi calisiyor (IYZICO_API_KEY bulundu)',
    okunan.has('IYZICO_API_KEY'),
    `bulunan=${JSON.stringify([...okunan].sort())}`,
  );
  check(
    'O-OLCUT anlamli sayida degisken bulundu (>= 8)',
    okunan.size >= 8,
    `adet=${okunan.size} → ${JSON.stringify([...okunan].sort())}`,
  );

  // ── docker-compose backend.environment blogu ─────────────────────────
  const composeYol = path.join(KOK, 'docker-compose.yml');
  check('O-OLCUT docker-compose.yml bulundu', fs.existsSync(composeYol), composeYol);
  if (!fs.existsSync(composeYol)) return son();
  const compose = fs.readFileSync(composeYol, 'utf8');

  // OLCUT: bilinen, ADIM 2 ile ilgisi olmayan bir degisken compose'da olmali.
  check(
    'O-OLCUT compose okundu (bilinen JWT_SECRET goruluyor)',
    /^\s*JWT_SECRET:/m.test(compose),
  );

  const composeEksik = [...okunan].filter(
    (d) => !new RegExp(`^\\s*${d}:`, 'm').test(compose),
  );
  check(
    'E1 kodun okudugu HER degisken docker-compose"da aniliyor',
    composeEksik.length === 0,
    `compose'da YOK: ${JSON.stringify(composeEksik.sort())} — bu degiskenler konteynere HIC GECMEZ`,
  );

  // ── .env.example ─────────────────────────────────────────────────────
  // Gerekce: operator hangi degeri doldurmasi gerektigini buradan ogrenir.
  // Compose'da olup burada olmayan degisken "gorunmez zorunluluk"tur.
  const ornekYol = path.join(KOK, '.env.example');
  check('O-OLCUT .env.example bulundu', fs.existsSync(ornekYol), ornekYol);
  if (!fs.existsSync(ornekYol)) return son();
  const ornek = fs.readFileSync(ornekYol, 'utf8');

  const ornekEksik = [...okunan].filter(
    (d) => !new RegExp(`^\\s*#?\\s*${d}=`, 'm').test(ornek),
  );
  check(
    'E2 kodun okudugu HER degisken .env.example"da belgeli',
    ornekEksik.length === 0,
    `.env.example'da YOK: ${JSON.stringify(ornekEksik.sort())} — operator bu degeri bilemez`,
  );

  // ── Guvenlik: ornek dosyada GERCEK sir olmamali ──────────────────────
  // .env.example COMMIT EDILIR. Icine gercek anahtar kacarsa depoya girer.
  // ⚠ DESEN SATIR SONUNA SABITLENIR (`m` bayragi + `$`). Ilk yazimda
  // `=\s*\S+` kullanildi ve YANLIS ALARM verdi: `\s` newline'i da
  // kapsadigi icin BOS bir `IYZICO_API_KEY=` satiri, bir sonraki satirin
  // ADINI "deger" sanip esletti. Olculdu: dosyada degerler gercekten
  // bostu, kusur olcutteydi.
  const supheli = [
    /^IYZICO_API_KEY=\S+/m,
    /^IYZICO_SECRET_KEY=\S+/m,
    /^RESEND_API_KEY=re_\S+/m,
    /^PARASUT_(?:CLIENT_SECRET|PAROLA)=\S+/m,
  ].filter((r) => r.test(ornek));
  check(
    'G1 .env.example GERCEK sir TASIMIYOR (dosya commit edilir)',
    supheli.length === 0,
    `dolu gorunen alanlar: ${supheli.map(String).join(', ')}`,
  );

  // ── Varsayilan davranis: imza ZORUNLU DEGIL ile baslamali ────────────
  // Ilk gercek webhook gelip hangi alan sirasinin tuttugu ogrenilmeden
  // true yapilirsa her olay sessizce dusulur.
  check(
    'G2 IYZICO_IMZA_ZORUNLU varsayilani false (ilk webhook oncesi true = sessiz kayip)',
    /IYZICO_IMZA_ZORUNLU:\s*\$\{IYZICO_IMZA_ZORUNLU:-false\}/.test(compose),
    'compose varsayilani false degil',
  );

  // ── Odeme degiskenleri ZORUNLU OLMAMALI ──────────────────────────────
  // compose'da `${X:?err}` bicimi degiskeni ZORUNLU kilar ve eksikse
  // `docker compose up` PATLAR — odeme yapilandirmasi tum urunu
  // ayaga kaldirmama hakkina sahip olmamali.
  const zorunluKilinan = [...okunan].filter((d) =>
    new RegExp(`\\$\\{${d}\\?`).test(compose) || new RegExp(`\\$\\{${d}:\\?`).test(compose),
  );
  check(
    'G3 hicbir odeme degiskeni compose"da ZORUNLU kilinmamis (urun rehin alinmaz)',
    zorunluKilinan.length === 0,
    `zorunlu kilinan: ${JSON.stringify(zorunluKilinan)}`,
  );

  // ── G4: YINELENEN ANAHTAR — compose'u komple kiran sinif ─────────────
  //
  // ⚠ 08.09'da OLCULDU, tahmin degil: Faz 3'te `EPOSTA_GONDEREN` zaten
  // tanimliyken IKINCI kez eklendi. YAML'da yinelenen mapping anahtari
  // `docker compose`un TAMAMINI kirar — yalniz yeni ozelligi degil,
  // `docker compose exec backup pg_dump`i da. Yani deploy'un DEPLOY ONCESI
  // YEDEK adimi coktu ve deploy (dogru sekilde) durdu. Tek satirlik bir
  // gozden kacirma, yedek alma yetenegini goturdu.
  //
  // Bu kapi o sinifi yakalar: her servis blogunda `environment` altindaki
  // her anahtar EN FAZLA BIR KEZ gecmeli.
  const composeSatirlar = compose.split(/\r?\n/);
  const yinelenen: string[] = [];
  let ortamda = false;
  let ortamGirinti = 0;
  let gorulen = new Set<string>();
  for (const satir of composeSatirlar) {
    const girinti = satir.length - satir.trimStart().length;
    if (/^\s*environment:\s*$/.test(satir)) {
      ortamda = true;
      ortamGirinti = girinti;
      gorulen = new Set<string>();
      continue;
    }
    if (!ortamda) continue;
    if (satir.trim() === '' || /^\s*#/.test(satir)) continue;
    // Blok bitti: girinti `environment:` seviyesine dondu.
    if (girinti <= ortamGirinti) {
      ortamda = false;
      continue;
    }
    const m = satir.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (!m) continue;
    if (gorulen.has(m[1])) yinelenen.push(m[1]);
    else gorulen.add(m[1]);
  }
  check(
    'G4 compose environment bloklarinda YINELENEN anahtar YOK (yinelenen anahtar TUM compose komutlarini kirar)',
    yinelenen.length === 0,
    `yinelenen: ${JSON.stringify(yinelenen)}`,
  );
  check(
    'G4-OLCUT yineleme tarayicisi calisiyor (environment blogu gercekten okundu)',
    gorulen.size > 5 || composeSatirlar.some((l) => /^\s*environment:\s*$/.test(l)),
  );

  son();
}

function son() {
  console.log(
    `\n${'='.repeat(64)}\nORTAM DEGISKENLERI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
  );
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

main();
