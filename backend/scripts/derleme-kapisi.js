/**
 * KD3 — SIFIR DOSYA URETEN DERLEME 0 DONEMEZ (pano kalem 47'nin kapisi)
 *
 * KALEM 47 NEYDI: `tsbuildinfo` dist'in DISINDA dururken `nest-cli.json`
 * `deleteOutDir: true` dist'i siliyordu. TypeScript "her sey guncel" deyip
 * HIC EMIT ETMIYOR, `nest build` yine de **cikis kodu 0** doniyordu.
 *   olculdu: tsbuildinfo VARKEN  → dist .js = 0   · cikis 0
 *            tsbuildinfo SILININCE→ dist .js = 100 · cikis 0
 * Sonra `node dist/main` MODULE_NOT_FOUND ile oluyor, PORTU ESKI SUREC
 * tutmaya devam ediyor ve kosum 18 SAATLIK kodu olcuyordu (kalem 45).
 *
 * Kok neden `tsBuildInfoFile` ile duzeltildi — AMA YALNIZ BU MAKINEDE.
 * Bu kapi tekrarini her makinede engeller: derleme sonrasi `dist` sayilir.
 *
 * ⚠ PK11c ILE KARISTIRMA: PK11c BAYAT SURECI yakalar (surec baslangici dist
 * mtime'indan eski). KD3 BOS DERLEMEYI yakalar. Bugunku olayda ikisi arka
 * arkaya oldu ama FARKLI sekillerde bozulurlar; biri digerinin yerine gecmez.
 *
 * CIKIS KODU: 0 = TAMAM · 3 = BOS/EKSIK DERLEME.
 * 2 KULLANILMAZ — bu projede 2 "ON SART YOK (SKIP)" demek ve atlanabilir;
 * bos derleme atlanacak bir sey degil (KD8'de aynen bu tuzaga dusuldu).
 */
const fs = require('fs');
const path = require('path');

const kok = path.resolve(__dirname, '..');
const dist = path.join(kok, 'dist');
const src = path.join(kok, 'src');

const say = (dizin, uzanti) => {
  if (!fs.existsSync(dizin)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dizin, { withFileTypes: true })) {
    const p = path.join(dizin, e.name);
    if (e.isDirectory()) n += say(p, uzanti);
    else if (e.name.endsWith(uzanti)) n++;
  }
  return n;
};

const jsSayisi = say(dist, '.js');
const tsSayisi = say(src, '.ts');
// Giris dosyasi da diskten dogrulanir — sayi dolu ama main.js yoksa yine bozuk.
const girisVar = fs.existsSync(path.join(dist, 'main.js'));

console.log(`[derleme-kapisi] dist/*.js = ${jsSayisi} · src/*.ts = ${tsSayisi} · dist/main.js = ${girisVar ? 'VAR' : 'YOK'}`);

if (jsSayisi === 0 || !girisVar) {
  console.error('');
  console.error('⛔ DERLEME BOS — `nest build` basarili gorundu ama dist URETILMEDI.');
  console.error(`   dist/*.js = ${jsSayisi} · dist/main.js = ${girisVar ? 'VAR' : 'YOK'}`);
  console.error('   Bilinen kok neden (kalem 47): tsbuildinfo dist DISINDA + deleteOutDir.');
  console.error('   Cozum: backend/tsconfig.json → "tsBuildInfoFile": "./dist/tsconfig.tsbuildinfo"');
  console.error('   Kontrol: rm -f backend/tsconfig.tsbuildinfo && npx nest build');
  process.exit(3);
}

// Kismi emit de tehlikelidir: 29/100 uretilmisti ve MODULE_NOT_FOUND verdi.
// Esik %80 — TS dosyalarinin bir kismi tip-only olabilir (emit uretmez).
if (tsSayisi > 0 && jsSayisi < tsSayisi * 0.8) {
  console.error('');
  console.error(`⛔ DERLEME EKSIK — ${jsSayisi}/${tsSayisi} (beklenen en az %80).`);
  console.error('   Kalem 47\'de tam boyle oldu: 29 .js / 100 .ts, sonra MODULE_NOT_FOUND.');
  process.exit(3);
}

console.log('[derleme-kapisi] ✅ derleme dolu');
