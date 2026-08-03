#!/usr/bin/env node
/**
 * HR3 + HR4 — KOD HARİTASI DENETİM KAPISI
 *   node scripts/harita-denetle.mjs            → denetler
 *   node scripts/harita-denetle.mjs --bekleyen → bekleyenler listesini ilk kez üretir
 *
 * KURAL: otomatik katmanda görünen HER kod dosyası, ya `KOD_HARITASI.md`'de
 * ya `harita-bekleyenler.txt`'de olacak. İkisinde de yoksa harita eskimiş
 * demektir ve kapı kırmızı yanar.
 *
 * ÇIKIŞ KODU SÖZLEŞMESİ:
 *   0 → otomatik katmandaki her kod dosyasının karşılığı var
 *   1 → en az bir dosya hiçbir listede yok   VEYA
 *       bekleyenler listesi UZADI            VEYA
 *       bekleyenlerde artık var olmayan bir dosya duruyor
 *   2 → ön koşul yok: git deposu değil, ya da KOD_HARITASI_OTOMATIK.md
 *       üretilmemiş, ya da KOD_HARITASI.md yok
 *
 * ── "HARİTADA VAR" NE DEMEK (bu bir İDDİA, o yüzden açıkça yazılıyor) ──
 * Bir kod dosyası haritada SAYILIR eğer haritada, o dosyaya çözülen ve
 * EN AZ BİR `/` içeren bir YOL ifadesi geçiyorsa. Kısayol serbesttir
 * (`e2e-golden/helpers.ts`, tek dosyaya çözüldüğü sürece); çıplak dosya
 * adı SAYILMAZ.
 *
 * ⚠ ÇIPLAK-AD GERİ DÜŞÜŞÜ 03.08'de KALDIRILDI — ve sebebi ölçümdür, fikir
 * değil. Eski kural "adı repoda TEKSE çıplak ad yeter" diyordu. Klasör
 * taşıma turunun ADIM 1c'sinde kapı KASTEN ateşlendi: bir dosya taşındı,
 * harita güncellenmedi, kapı **YEŞİL** dedi (307/307, çıkış 0). Ölçüldü:
 * kapsam içi 306 dosyanın 257'sinin (%84) adı tek — yani taşımanın %84'ü
 * denetimsizdi. Kapı "her dosya haritada ANILMIŞ mı" diye bakıyordu;
 * oysa taşıma turunda sorulması gereken "her dosya haritada DOĞRU YERDE
 * mi" sorusudur. Çıplak ad bir KONUM bildirmez.
 *
 * ── TERS YÖN (03.08'de eklendi) ──
 * Haritada geçen her yol ifadesi, izlenen bir dosyaya çözülmek ZORUNDA.
 * Bu yön hiç denetlenmiyordu ve ilk koşumunda gerçek bir bayat referans
 * buldu: `e2e-golden/sahinkul-golden.spec.ts` — dosya `5d3c30b`
 * (fixture anonimleştirme) commit'inde `firma-a-golden.spec.ts` olmuştu,
 * harita eski adı taşımaya devam ediyordu. Düz metin artıkları ve derleme
 * çıktıları `harita-yol-istisna.txt` ile muaf tutulur.
 *
 * ── HR4 CIRCIR ──
 * `harita-bekleyenler.txt` yalnız KISALIR. HEAD'deki hâlinden uzunsa kapı
 * kırmızı. Gerekçe: bekleme listesi, doldurulmamış her satırın görünür
 * borcudur; büyümesine izin verilirse borç görünmez olur.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kapsamOku, kodDosyalari } from './harita-uret.mjs';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARITA = path.join(KOK, 'KOD_HARITASI.md');
const OTOMATIK = path.join(KOK, 'KOD_HARITASI_OTOMATIK.md');
const BEKLEYEN = path.join(KOK, 'harita-bekleyenler.txt');

const nfc = (s) => s.normalize('NFC');

function bekleyenOku(dosya) {
  if (!fs.existsSync(dosya)) return null;
  return fs.readFileSync(dosya, 'utf8').split(/\r?\n/)
    .map((s) => s.trim()).filter((s) => s && !s.startsWith('#')).map(nfc);
}

function headBekleyen() {
  try {
    return execFileSync('git', ['show', 'HEAD:harita-bekleyenler.txt'], { cwd: KOK, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#')).map(nfc);
  } catch { return null; }   // HEAD'de yok — ilk oluşturma
}

function main() {
  const argv = process.argv.slice(2);

  try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: KOK, stdio: 'ignore' }); }
  catch { console.log('ON KOSUL YOK — git deposu degil.'); process.exit(2); }

  const kapsam = kapsamOku();
  if (!kapsam) { console.log('ON KOSUL YOK — harita-kapsam-disi.txt yok.'); process.exit(2); }
  if (!fs.existsSync(OTOMATIK)) { console.log('ON KOSUL YOK — KOD_HARITASI_OTOMATIK.md uretilmemis (once: node scripts/harita-uret.mjs).'); process.exit(2); }
  if (!fs.existsSync(HARITA)) { console.log('ON KOSUL YOK — KOD_HARITASI.md yok.'); process.exit(2); }

  const dosyalar = kodDosyalari(kapsam).map(nfc);
  const haritaMetni = nfc(fs.readFileSync(HARITA, 'utf8'));

  // ── YOL IFADELERI — haritadan bir kez cikarilir, iki yonde de kullanilir ──
  // Uzantilar KAPSAM DOSYASINDAN turetilir, elle yazilmaz — kapsam
  // genisledigi gun (or. `.prisma` eklendigi gun) kapi kendiliginde takip
  // etsin. Elle yazdigimda `.prisma`yi atlamistim ve schema.prisma yanlislikla
  // "listesiz" gorunmustu.
  // ⚠ UZUN UZANTI ONCE: `tsx|ts` sirasi sart. `ts|tsx` yazilirsa regex
  // alternasyonu soldan eslestigi icin `ExcelGrid.tsx` -> `ExcelGrid.ts`
  // diye KIRPILIR ve olcut, olcmedigi bir dosyayi "yok" sanir. Bu tuzak
  // 03.08'de bu kapiyi yazarken bir kez yasandi.
  const uzantiAlt = kapsam.uzantilar
    .map((u) => u.replace(/^\./, ''))
    .sort((a, b) => b.length - a.length)        // uzun once
    .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const YOL_DESENI = new RegExp(`([A-Za-z0-9_.\\-]+/[A-Za-z0-9_.\\-/[\\]()]*\\.(?:${uzantiAlt}))`, 'g');
  const yolTokenlari = new Set();
  for (const m of haritaMetni.matchAll(YOL_DESENI)) yolTokenlari.add(m[1]);

  /** Bir token, izlenen dosyalardan hangisine cozulur? (tam yol ya da kisayol) */
  const cozulenler = (token) => dosyalar.filter((y) => y === token || y.endsWith('/' + token));

  // ILERI YON: dosya, haritada kendisine cozulen bir YOL ifadesiyle anilmis mi?
  // Ciplak ad SAYILMAZ — konum bildirmez (bkz. bas yorumdaki olcum).
  const yolluAnilanlar = new Set();
  for (const t of yolTokenlari) for (const y of cozulenler(t)) yolluAnilanlar.add(y);
  const haritadaVar = (y) => (yolluAnilanlar.has(y) ? 'yol' : null);

  // ── --bekleyen: ilk olusturma ──────────────────────────────────────────
  if (argv.includes('--bekleyen')) {
    const kalanlar = dosyalar.filter((y) => !haritadaVar(y));
    const bas = [
      '# KOD HARİTASI — BEKLEYENLER',
      '#',
      '# Bu liste bir BORÇTUR: haritada karşılığı olmayan her kod dosyası burada durur.',
      '# HR4 CIRCIR KURALI: bu liste yalnız KISALIR. Uzarsa `npm run test:harita` kırmızı.',
      '# Bir dosya haritaya yazıldığında buradan SİLİNİR — tersi yapılmaz.',
      `# İlk oluşturma: ${dosyalar.length} kod dosyasının ${kalanlar.length} tanesinin haritada karşılığı yok.`,
      '',
    ];
    fs.writeFileSync(BEKLEYEN, bas.concat(kalanlar).join('\n') + '\n');
    console.log(`YAZILDI: harita-bekleyenler.txt — ${kalanlar.length} dosya`);
    process.exit(0);
  }

  const bekleyen = bekleyenOku(BEKLEYEN) ?? [];
  const bekleyenKume = new Set(bekleyen);
  const hatalar = [];

  // (a) hiçbir listede olmayan dosya
  const listesiz = dosyalar.filter((y) => !haritadaVar(y) && !bekleyenKume.has(y));

  // (b) HR4 cırcır — liste uzadı mı?
  const onceki = headBekleyen();
  const uzadiMi = onceki !== null && bekleyen.length > onceki.length;

  // (c) bekleyenlerde artık var olmayan dosya
  const dosyaKume = new Set(dosyalar);
  const hayalet = bekleyen.filter((y) => !dosyaKume.has(y));

  // (d) TERS YON — haritada yazan ama hicbir dosyaya cozulmeyen yol.
  // Tasima turunun asil riski bu: dosya tasinir, harita eski yolu tasimaya
  // devam eder ve hicbir sey sikayet etmez. Istisna listesi duz metin
  // artiklari (`.js/.ts` gibi) ve derleme ciktilari (`dist/main.js`) icindir.
  const ISTISNA = path.join(KOK, 'harita-yol-istisna.txt');
  const istisna = new Set(
    fs.existsSync(ISTISNA)
      ? fs.readFileSync(ISTISNA, 'utf8').split(/\r?\n/)
        .map((s) => s.trim()).filter((s) => s && !s.startsWith('#')).map(nfc)
      : [],
  );
  const olmayanYol = [...yolTokenlari]
    .filter((t) => !istisna.has(t) && cozulenler(t).length === 0)
    .sort();

  console.log('── HARITA DENETIMI ──');
  console.log(`  kod dosyasi        : ${dosyalar.length}`);

  // ⚠ UYARI (cikis kodunu DEGISTIRMEZ — sozlesmede olmayan bir ret sarti
  // eklemek yok). 02.08'de AYNI tuzak IKI KEZ yasandi: denetim `git add`den
  // ONCE kosuldu, yeni dosyalar henuz izlenmiyordu, kapi yesil dedi; commit
  // sonrasi CI kirmizi yandi. Kapi dogru calisiyordu, SIRA yanlisti.
  // Bu satir o siranin yanlis oldugunu KOSUM ANINDA soyler.
  let izlenmeyen = [];
  try {
    izlenmeyen = execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'],
      { cwd: KOK, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0').filter(Boolean).map(nfc)
      .filter((y) => kapsam.uzantilar.some((u) => y.endsWith(u)))
      .filter((y) => !kapsam.disi.some((d) => y.startsWith(d.desen) || (d.desen.startsWith('*') && y.endsWith(d.desen.slice(1)))));
  } catch { /* olcum basarisizsa sessiz gec — bu bir uyari, kapi degil */ }
  if (izlenmeyen.length) {
    console.log(`  ⚠ IZLENMEYEN kod dosyasi: ${izlenmeyen.length} — bunlar HENUZ olculmuyor.`);
    izlenmeyen.slice(0, 5).forEach((y) => console.log(`     · ${y}`));
    console.log('     `git add` sonrasi bu denetimi TEKRAR kosun; aksi halde CI\'da kirmizi yanar.');
  }
  console.log(`  haritada karsiligi : ${dosyalar.filter((y) => haritadaVar(y)).length}`);
  console.log(`  bekleyenlerde      : ${bekleyen.length}${onceki === null ? ' (HEAD`de yok — ilk olusturma)' : ` (HEAD: ${onceki.length})`}`);

  if (listesiz.length) {
    hatalar.push(`HICBIR LISTEDE YOK: ${listesiz.length} dosya`);
    listesiz.slice(0, 15).forEach((y) => console.log(`  ❌ listesiz: ${y}`));
    if (listesiz.length > 15) console.log(`  … +${listesiz.length - 15} dosya daha`);
  }
  if (uzadiMi) {
    hatalar.push(`BEKLEYENLER UZADI: ${onceki.length} → ${bekleyen.length}`);
    const yeni = bekleyen.filter((y) => !onceki.includes(y));
    yeni.slice(0, 15).forEach((y) => console.log(`  ❌ listeye eklenmis: ${y}`));
  }
  if (hayalet.length) {
    hatalar.push(`BEKLEYENLERDE HAYALET: ${hayalet.length} dosya artik yok`);
    hayalet.slice(0, 15).forEach((y) => console.log(`  ❌ hayalet: ${y}`));
  }
  if (olmayanYol.length) {
    hatalar.push(`HARITADA OLMAYAN YOL: ${olmayanYol.length} ifade hicbir dosyaya cozulmuyor`);
    olmayanYol.slice(0, 15).forEach((y) => console.log(`  ❌ bayat yol: ${y}`));
    if (olmayanYol.length > 15) console.log(`  … +${olmayanYol.length - 15} ifade daha`);
    console.log('     (kasitli ise harita-yol-istisna.txt icine yazin)');
  }

  if (hatalar.length) {
    console.log('');
    hatalar.forEach((h) => console.log(`  ⛔ ${h}`));
    console.log('\nHARITA DENETIMI: FAIL');
    process.exit(1);
  }
  console.log('\nHARITA DENETIMI: PASS — her kod dosyasinin karsiligi var.');
  process.exit(0);
}

main();
