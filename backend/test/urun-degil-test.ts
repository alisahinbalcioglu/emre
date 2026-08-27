/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  UD — "URUN DEGIL" SINIFLAMASI: PARANTEZ ICI NOT MUAFIYETI
 *  (`npm run test:urun-degil`)
 *
 *  27.08 turu, canli KAUCUK sikayetinin yan bulgusu. Kullanici kaucuk
 *  sayfasinda markaya tiklayinca "Ürün değil — Oran/hizmet satırı" toast'i
 *  gordu; olcum, NOT_PRODUCT_RE'nin MASUM urun satirlarini hizmet saydigini
 *  gosterdi:
 *    "19 mm Kauçuk İzolasyon 1/2\" (yapıştırıcı, bant vb. sarf malzemesi dahil)"
 *    "2\" siyah boru (montaj dahil)"
 *    "1\" küresel vana (montaj aparatı dahil)"
 *  Parantez satirin KENDISINI degil KAPSAMINI anlatir ("... dahil" notu);
 *  icindeki 'sarf/montaj/nakliye' kelimeleri satiri hizmete cevirmemeli.
 *  notProduct'a dusen satir TAM CIKMAZ SOKAKTIR: havuza hic bakilmaz,
 *  kurtarmalar kosmaz, capraz-marka onerisi bile uretilmez.
 *
 *  DUZELTME: hizmet taramasi parantezleri SOYULMUS metinde yapilir. Gercek
 *  hizmet satiri ("İşçilik (mekanik)") kelimeyi parantez DISINDA tasidigi
 *  icin yine yakalanir. Parantez icerigi token/cap cikarimina girmeye devam
 *  eder — yalniz bu tarama muaf.
 *
 *  ⚠ KAPSAM DISI (bilerek dokunulmadi — tasarim-hassas, ayri karar ister):
 *  "Montaj rayı 41x41", "Montaj kelepçesi 3/4\"" gibi YALIN 'montaj' ile
 *  BASLAYAN gercek urunler hala notProduct'a duser; 'montaj'i desenden
 *  cikarmak "Boru + fittings montaj bedeli" gibi GERCEK hizmet satirlarini
 *  kacirir. O sinif bu turda acilmadi.
 *
 *  DB GEREKMEZ: saf parser.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay?: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
}

// ═════════════════════════════════════════════════════════════════════
//  A) MASUM SATIRLAR — parantez notu urunu hizmete cevirmez
// ═════════════════════════════════════════════════════════════════════
console.log('── UD-1..4) parantezli masum satirlar URUN sayilir ──');
{
  const l = parseLine('19 mm Kauçuk İzolasyon 1/2" (yapıştırıcı, bant vb. sarf malzemesi dahil)', 'mt');
  check('UD-1 kaucuk + "(sarf malzemesi dahil)" notu → URUN', !l.notProduct, 'notProduct=true');
  // Yalniz sinif degil, ISLEV de korunmali: aile ve cap hala cozuluyor.
  check('UD-1b aile ve cap AYNEN cozulur (izolasyon · 1/2")',
    l.familySlug === 'izolasyon' && l.capInfo?.display === '1/2"',
    `family=${l.familySlug} cap=${l.capInfo?.display}`);
}
check('UD-2 "(montaj dahil)" notu → URUN',
  !parseLine('2" siyah boru (montaj dahil)', 'mt').notProduct, 'notProduct=true');
check('UD-3 "(montaj aparatı dahil)" notu → URUN',
  !parseLine('1" küresel vana (montaj aparatı dahil)', 'adet').notProduct, 'notProduct=true');
check('UD-4 "(nakliye dahil)" notu → URUN',
  !parseLine('Kauçuk köpüğü boru izolasyonu 22x19mm (nakliye dahil)', 'mt').notProduct, 'notProduct=true');

// ═════════════════════════════════════════════════════════════════════
//  B) GERCEK HIZMET SATIRLARI — davranis DEGISMEZ
// ═════════════════════════════════════════════════════════════════════
console.log('── UD-5..12) gercek hizmet satirlari NOT_PRODUCT kalir ──');
const HIZMETLER = [
  'FITTINGS ORANI %30',
  'İşçilik',
  'Nakliye',
  'Montaj',
  'Devreye alma',
  'Genel giderler',
  'Çelik İmalatlar',
  'Boru + fittings montaj bedeli',
];
HIZMETLER.forEach((h, i) =>
  check(`UD-${5 + i} "${h}" → hizmet kalir`, parseLine(h, 'adet').notProduct, 'notProduct=false'));

// Kelime parantez DISINDA → hala hizmet (muafiyet yalniz parantez ICI).
check('UD-13 "İşçilik (mekanik)" → hizmet kalir (kelime parantez DISINDA)',
  parseLine('İşçilik (mekanik)', 'adet').notProduct, 'notProduct=false');

// Sinir: satirin TAMAMI parantezse soyulmus metin bos kalir → hizmet
// kelimesi taranamaz → urun sayilir; parser normal yoldan devam eder.
check('UD-14 SINIR: tamami parantez olan satir hizmete DUSMEZ',
  !parseLine('(montaj dahil)', 'adet').notProduct, 'notProduct=true');

console.log('');
console.log(`── SONUC: ${passed} PASS · ${failures.length} FAIL ──`);
if (failures.length) { failures.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1); }
