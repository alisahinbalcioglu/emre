#!/usr/bin/env node
/**
 * ADIM 6 — KLASÖR↔GRUP DİSİPLİN KAPISI
 *   node scripts/klasor-denetle.mjs   (backend paketinden: `npm run test:klasor`)
 *
 * NEDEN: 04.08'de 155 dosya taşındı, A-M gruplarına göre yeni bir düzen kuruldu.
 * `test:harita` bir dosyanın haritada ANILDIĞINI denetler; DOĞRU KLASÖRDE
 * olduğunu denetlemez. Kapısız düzen bir turluktur.
 *
 * İDDİA BURADA DEĞİL: kural metni `klasor-duzeni.txt`'de. Bu betik yalnız
 * onu uygular (harita-denetle.mjs / harita-kapsam-disi.txt ikilisinin aynısı).
 *
 * ÇIKIŞ KODU SÖZLEŞMESİ (regression-all.ts bunu okur):
 *   0 → iki kural da geçti
 *   1 → RET: ilan edilmemiş klasör · grubun yolu dışına düşen dosya ·
 *       hayalet istisna · istisna listesi UZADI
 *   2 → ÖN KOŞUL YOK: git deposu değil · klasor-duzeni.txt yok ·
 *       KOD_HARITASI.md yok · ölçüt boşa düştü (aşağıya bak)
 *
 * ── ÖLÇÜTÜ ÖNCE DOĞRULA (bu turun mühürlü kuralı) ──
 * Kapının kendisi de ölçülür. Şu üçünden biri olursa kapı YEŞİL DEMEZ, `2`
 * döner — çünkü "hiçbir ihlal bulamadım" ile "hiçbir şeye bakmadım" aynı
 * çıktıyı verirdi ve BOŞ KÜME YALANCI YEŞİL üretirdi:
 *   (a) kapsam içi kod dosyası sayısı 0   → KURAL 1'in girdisi boş
 *   (b) sınıflandırılmış dosya sayısı 0   → KURAL 2'nin girdisi boş
 *   (c) ilan edilmiş bir grubun `### <HARF> ·` başlığı haritada yok
 *       → sınıflandırma bölümünün biçimi değişmiş, ayrıştırıcı sessizce
 *         boşa düşmüş olabilir
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kapsamOku, kodDosyalari } from './harita-uret.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DUZEN = path.join(KOK, 'klasor-duzeni.txt');
const HARITA = path.join(KOK, 'KOD_HARITASI.md');

const nfc = (s) => s.normalize('NFC');

/** `harita-kapsam-disi.txt` ile BİREBİR aynı desen anlamı — iki kapı ayrışmasın. */
const eslesir = (yol, desen) => desen.endsWith('/') ? yol.startsWith(desen)
  : desen.startsWith('*') ? yol.endsWith(desen.slice(1))
    : yol === desen;

// ── düzen tanımını oku ────────────────────────────────────────────────────
export function duzenOku(dosya = DUZEN) {
  if (!fs.existsSync(dosya)) return null;
  const kokler = [];        // {desen, gerekce}
  const grupYollari = [];   // {harf, desenler[]}
  const cerceve = [];       // {desen, gerekce}
  const istisnalar = [];    // {yol, harf, gerekce}
  let bolum = '';
  for (const ham of fs.readFileSync(dosya, 'utf8').split(/\r?\n/)) {
    const s = nfc(ham.trim());
    if (!s || s.startsWith('#')) continue;
    if (s.startsWith('[')) { bolum = s; continue; }
    const parca = s.split('::').map((x) => x.trim());
    if (bolum === '[ALAN KOKLERI]') {
      if (parca[0]) kokler.push({ desen: parca[0], gerekce: parca[1] ?? '' });
    } else if (bolum === '[GRUP YOLLARI]') {
      const harf = parca[0];
      const desenler = (parca[1] ?? '').split('|').map((x) => x.trim()).filter((x) => x && x !== '(bos)');
      if (harf) grupYollari.push({ harf, desenler });
    } else if (bolum === '[CERCEVE BAGLI]') {
      if (parca[0]) cerceve.push({ desen: parca[0], gerekce: parca[1] ?? '' });
    } else if (bolum === '[ISTISNA]') {
      if (parca[0] && parca[1]) istisnalar.push({ yol: parca[0], harf: parca[1], gerekce: parca[2] ?? '' });
    }
  }
  return { kokler, grupYollari, cerceve, istisnalar };
}

/**
 * KOD_HARITASI.md'nin TAM SINIFLANDIRMA bölümünden dosya→grup eşlemesi.
 * SIĞ katman tablolarını okur: `### <HARF> · …` başlığı altındaki
 * `| \`yol\` | açıklama |` satırları. Derin katman (üstteki A-I bölümleri)
 * `dosya:satır` biçiminde yazılı ve tek-dosya-tek-satır değil — oradan grup
 * çıkarmak uydurma olurdu, o yüzden okunmaz ve KURAL 2 kapsamına girmez.
 */
export function siniflandirmaOku(metin) {
  const satirlar = nfc(metin).split(/\r?\n/);
  const bas = satirlar.findIndex((s) => s.startsWith('## TAM SINIFLANDIRMA'));
  if (bas < 0) return null;
  let son = satirlar.findIndex((s, i) => i > bas && /^## (?!#)/.test(s));
  if (son < 0) son = satirlar.length;
  const grupOf = new Map();
  const cift = [];
  const gorulenBasliklar = new Set();
  let aktif = null;
  for (let i = bas; i < son; i++) {
    const h = /^###\s+([A-ZĞÜŞİÖÇ]+)\s+·/.exec(satirlar[i].trim());
    if (h) { aktif = h[1]; gorulenBasliklar.add(aktif); continue; }
    if (!aktif) continue;
    const m = /^\|\s*`([^`]+)`\s*\|/.exec(satirlar[i]);
    if (!m) continue;
    if (grupOf.has(m[1])) cift.push({ yol: m[1], a: grupOf.get(m[1]), b: aktif });
    else grupOf.set(m[1], aktif);
  }
  return { grupOf, cift, gorulenBasliklar };
}

function headIstisnaSayisi() {
  try {
    const m = execFileSync('git', ['show', 'HEAD:klasor-duzeni.txt'],
      { cwd: KOK, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const g = duzenOkuMetinden(m);
    return g.istisnalar.length;
  } catch { return null; }   // HEAD'de yok — ilk oluşturma
}

function duzenOkuMetinden(metin) {
  const gecici = path.join(KOK, `.klasor-duzeni-head-${process.pid}.tmp`);
  fs.writeFileSync(gecici, metin);
  try { return duzenOku(gecici); } finally { fs.unlinkSync(gecici); }
}

function main() {
  try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: KOK, stdio: 'ignore' }); }
  catch { console.log('ON KOSUL YOK — git deposu degil.'); process.exit(2); }

  const duzen = duzenOku();
  if (!duzen) { console.log('ON KOSUL YOK — klasor-duzeni.txt yok.'); process.exit(2); }
  if (!fs.existsSync(HARITA)) { console.log('ON KOSUL YOK — KOD_HARITASI.md yok.'); process.exit(2); }

  const kapsam = kapsamOku();
  if (!kapsam) { console.log('ON KOSUL YOK — harita-kapsam-disi.txt yok.'); process.exit(2); }

  const dosyalar = kodDosyalari(kapsam).map(nfc);
  const sinif = siniflandirmaOku(fs.readFileSync(HARITA, 'utf8'));
  if (!sinif) { console.log('ON KOSUL YOK — KOD_HARITASI.md`de "## TAM SINIFLANDIRMA" bolumu yok.'); process.exit(2); }

  // ── ÖLÇÜT DOĞRULAMA — üç ayrı assert, üçü de girdinin DOLU olduğunu ölçer ──
  if (dosyalar.length === 0) {
    console.log('ON KOSUL YOK — kapsam ici kod dosyasi 0. KURAL 1`in girdisi bos, yesil ANLAMSIZ.');
    process.exit(2);
  }
  if (sinif.grupOf.size === 0) {
    console.log('ON KOSUL YOK — siniflandirma tablosundan 0 dosya okundu. KURAL 2`nin girdisi bos.');
    process.exit(2);
  }
  const eksikBaslik = duzen.grupYollari.map((g) => g.harf).filter((h) => !sinif.gorulenBasliklar.has(h));
  if (eksikBaslik.length) {
    console.log(`ON KOSUL YOK — ilan edilmis grup basligi haritada bulunamadi: ${eksikBaslik.join(', ')}`);
    console.log('   (siniflandirma bolumunun bicimi degismis olabilir — ayristirici sessizce bosa duser.)');
    process.exit(2);
  }

  console.log('── KLASOR DUZENI DENETIMI ──');
  console.log(`  kapsam ici kod dosyasi : ${dosyalar.length}`);
  console.log(`  ilan edilmis alan koku : ${duzen.kokler.length}`);
  console.log(`  siniflandirilmis dosya : ${sinif.grupOf.size}  (KURAL 2 kapsami)`);
  console.log(`  ilan edilmis istisna   : ${duzen.istisnalar.length}`);

  // `git add` SIRASI uyarısı — harita kapısındaki ile aynı tuzak, aynı uyarı.
  // Bu bir UYARIDIR, çıkış kodunu DEĞİŞTİRMEZ (sözleşmede olmayan ret şartı yok).
  try {
    const izlenmeyen = execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'],
      { cwd: KOK, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0').filter(Boolean).map(nfc)
      .filter((y) => kapsam.uzantilar.some((u) => y.endsWith(u)))
      .filter((y) => !kapsam.disi.some((d) => eslesir(y, d.desen)));
    if (izlenmeyen.length) {
      console.log(`  ⚠ IZLENMEYEN kod dosyasi: ${izlenmeyen.length} — HENUZ olculmuyor. \`git add\` sonrasi TEKRAR kosun.`);
      izlenmeyen.slice(0, 5).forEach((y) => console.log(`     · ${y}`));
    }
  } catch { /* olcum basarisizsa sessiz gec — uyari, kapi degil */ }

  const hatalar = [];

  // ── KURAL 1 — ilan edilmemiş klasör ──────────────────────────────────────
  const kokDisi = dosyalar.filter((y) => !duzen.kokler.some((k) => eslesir(y, k.desen)));
  if (kokDisi.length) {
    hatalar.push(`KURAL 1 — ILAN EDILMEMIS KLASOR: ${kokDisi.length} dosya`);
    kokDisi.slice(0, 20).forEach((y) => console.log(`  ❌ ilan disi: ${y}`));
    if (kokDisi.length > 20) console.log(`  … +${kokDisi.length - 20} dosya daha`);
    console.log('     (yeni bir alan aciliyorsa klasor-duzeni.txt [ALAN KOKLERI] icine GEREKCELI satir yazin)');
  }

  // ── KURAL 2 — grubun yolu dışına düşen dosya ─────────────────────────────
  const grupDeseni = new Map(duzen.grupYollari.map((g) => [g.harf, g.desenler]));
  const istisnaKume = new Map(duzen.istisnalar.map((i) => [i.yol, i.harf]));
  const kullanilanIstisna = new Set();
  const yanlisYer = [];
  let kural2Olculen = 0;
  let cercevedeAtlanan = 0;

  for (const [yol, harf] of sinif.grupOf) {
    if (!grupDeseni.has(harf)) continue;                       // ilan edilmemiş grup — denetlenmez
    if (duzen.cerceve.some((c) => eslesir(yol, c.desen))) { cercevedeAtlanan++; continue; }
    kural2Olculen++;
    const desenler = grupDeseni.get(harf);
    if (desenler.some((d) => eslesir(yol, d))) continue;       // kurala uyuyor
    if (istisnaKume.get(yol) === harf) { kullanilanIstisna.add(yol); continue; }
    yanlisYer.push({ yol, harf, izin: desenler });
  }
  console.log(`  KURAL 2 olculen        : ${kural2Olculen}  (cerceve bagli atlanan: ${cercevedeAtlanan})`);

  if (kural2Olculen === 0) {
    console.log('ON KOSUL YOK — KURAL 2 hicbir dosya olcmedi; yesil ANLAMSIZ olurdu.');
    process.exit(2);
  }

  if (yanlisYer.length) {
    hatalar.push(`KURAL 2 — YANLIS KLASOR: ${yanlisYer.length} dosya`);
    yanlisYer.slice(0, 20).forEach((v) => {
      console.log(`  ❌ yanlis yer: ${v.yol}`);
      console.log(`       harita bunu ${v.harf} grubuna koymus; ${v.harf} icin izinli: ${v.izin.join(' | ') || '(yok)'}`);
    });
    if (yanlisYer.length > 20) console.log(`  … +${yanlisYer.length - 20} dosya daha`);
    console.log('     (bilincli sapma ise klasor-duzeni.txt [ISTISNA] icine GEREKCELI satir yazin)');
  }

  // ── HAYALET ISTISNA — artık geçerli olmayan istisna sessiz çöp kutusudur ──
  const hayalet = duzen.istisnalar.filter((i) => !kullanilanIstisna.has(i.yol));
  if (hayalet.length) {
    hatalar.push(`HAYALET ISTISNA: ${hayalet.length} satir artik hicbir seyi muaf tutmuyor`);
    hayalet.forEach((i) => console.log(`  ❌ hayalet istisna: ${i.yol} (${i.harf}) — dosya yok, grubu degismis ya da artik kurala uyuyor`));
  }

  // ── ÇIRÇIR — istisna listesi yalnız KISALIR (HR4 ile aynı gerekçe) ────────
  const oncekiSayi = headIstisnaSayisi();
  if (oncekiSayi !== null && duzen.istisnalar.length > oncekiSayi) {
    hatalar.push(`ISTISNA LISTESI UZADI: ${oncekiSayi} → ${duzen.istisnalar.length}`);
    console.log('  ❌ istisna listesi bir BORCTUR; buyumesine izin verilirse borc gorunmez olur.');
  }

  // ── ÇİFT SINIFLANDIRMA — bir dosya iki grupta olamaz (ölçüt bütünlüğü) ───
  if (sinif.cift.length) {
    hatalar.push(`CIFT SINIFLANDIRMA: ${sinif.cift.length} dosya iki grupta birden`);
    sinif.cift.slice(0, 10).forEach((c) => console.log(`  ❌ cift: ${c.yol} → ${c.a} ve ${c.b}`));
  }

  if (hatalar.length) {
    console.log('');
    hatalar.forEach((h) => console.log(`  ⛔ ${h}`));
    console.log('\nKLASOR DUZENI DENETIMI: FAIL');
    process.exit(1);
  }
  console.log('\nKLASOR DUZENI DENETIMI: PASS — her dosya ilan edilmis bir alan kokunde, her grup kendi yolunda.');
  process.exit(0);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
