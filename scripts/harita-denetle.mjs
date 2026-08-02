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
 * Bir kod dosyası haritada SAYILIR eğer:
 *   (a) tam repo-göreli yolu metinde geçiyorsa            → kesin, tercih edilen
 *   (b) YA DA dosya adı repoda TEKSE ve metinde geçiyorsa → tek anlamlı
 * `package.json` gibi repoda BİRDEN ÇOK bulunan adlar (b) ile sayılmaz:
 * "package.json" yazan bir satır hangi paketten söz ettiğini söylemiyorsa
 * o satır bir konum bildirmiyor demektir.
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

  // Ad tekligi: yalniz TEK olan dosya adlari cıplak adla sayılabilir.
  const adSayaci = new Map();
  for (const y of dosyalar) {
    const ad = y.split('/').pop();
    adSayaci.set(ad, (adSayaci.get(ad) ?? 0) + 1);
  }
  const haritadaVar = (y) => {
    if (haritaMetni.includes(y)) return 'tam-yol';
    const ad = y.split('/').pop();
    if (adSayaci.get(ad) === 1 && haritaMetni.includes(ad)) return 'tek-ad';
    return null;
  };

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

  console.log('── HARITA DENETIMI ──');
  console.log(`  kod dosyasi        : ${dosyalar.length}`);
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
