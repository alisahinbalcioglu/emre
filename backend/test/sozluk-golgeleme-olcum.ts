/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SOZLUK GOLGELEME OLCUSU  (SALT-OKUMA, kod DEGISTIRMEZ)
 *
 *  SORU: Sozluge yazdigimiz desenler motora ULASIYOR MU?
 *
 *  Iddia (06.08 oturumunda yapisal olarak gorulen, HENUZ OLCULMEMIS):
 *    `product-index.ts basIsimAilesi` her sondan-parcada ONCE regex
 *    (`extractMaterialType`) SONRA sozluk (`resolveAd`) cagiriyor. Regex'te
 *    longest-wins YOK ve desenleri GEVSEK (/boru/, /vana/, /pompa/ ...).
 *    Dolayisiyla icinde boyle bir kelime GECEN cok-kelimeli sozluk desenleri
 *    hicbir zaman sozluge sira gelmeden regex'e takilir = OLU KOD.
 *
 *  BU BETIK O IDDIAYI OLCER — kanitlamaz da curutebilir de.
 *
 *  PAYDA + KIRILIM (ders: [[feedback-sayim-payda-ve-kirilim]]):
 *    "0 golgeli desen" ile "hic cok-kelimeli desen yok" KARISMASIN diye
 *    her sayinin paydasi birlikte basilir.
 *
 *  KOSUM:  cd backend && npx ts-node test/sozluk-golgeleme-olcum.ts
 *  CIKIS:  her zaman 0 — bu bir OLCU, bir kapi degil.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { AD_SOZLUGU, AD_ZENGINLESTIRME } from '../src/ozellik/eslestirme/matching/ad-cins-sozlugu';
import { resolveAd } from '../src/ozellik/eslestirme/matching/ad-resolver';
import { extractMaterialType, normalizeText } from '../src/ozellik/eslestirme/matching/normalizer';
import { resolveFamily } from '../src/ozellik/eslestirme/matching/index/product-index';

type Satir = {
  slug: string;
  desen: string;
  kelime: number;
  motor: string | null; // basIsimAilesi'nin (resolveFamily) gercek cevabi
  sozluk: string | null; // sozluk TEK BASINA ne derdi
  regex: string; // regex TEK BASINA ne derdi (tum ifade uzerinde)
  golge: boolean; // motor !== desenin sahibi slug
};

const TUM = [...AD_SOZLUGU, ...AD_ZENGINLESTIRME];
const satirlar: Satir[] = [];

for (const girdi of TUM) {
  for (const ham of girdi.patterns) {
    const desen = normalizeText(ham);
    if (desen.length < 3) continue; // resolveAd zaten <3'u atiyor
    const kelime = desen.split(/\s+/).filter(Boolean).length;
    const motor = resolveFamily(desen);
    satirlar.push({
      slug: girdi.slug,
      desen,
      kelime,
      motor,
      sozluk: resolveAd(desen),
      regex: extractMaterialType(desen),
      golge: motor !== girdi.slug,
    });
  }
}

const tek = satirlar.filter((s) => s.kelime === 1);
const cok = satirlar.filter((s) => s.kelime > 1);

const yaz = (b: string) => console.log(b);
const oran = (a: number, b: number) => (b === 0 ? '—' : `%${((a / b) * 100).toFixed(1)}`);

yaz('════════════════════════════════════════════════════════════════════');
yaz(' SOZLUK GOLGELEME OLCUSU — desenler motora ulasiyor mu?');
yaz('════════════════════════════════════════════════════════════════════');
yaz('');
yaz('── A) PAYDA ──');
yaz(`   sozluk girdisi (aile)        : ${TUM.length}`);
yaz(`   olculebilir desen (>=3 harf) : ${satirlar.length}`);
yaz(`     tek kelimeli               : ${tek.length}`);
yaz(`     cok kelimeli               : ${cok.length}`);
yaz('');

const tekGolge = tek.filter((s) => s.golge);
const cokGolge = cok.filter((s) => s.golge);

yaz('── B) GOLGELENEN DESEN (motor, desenin kendi ailesini VERMIYOR) ──');
yaz(`   tek kelimeli : ${tekGolge.length}/${tek.length}  ${oran(tekGolge.length, tek.length)}`);
yaz(`   cok kelimeli : ${cokGolge.length}/${cok.length}  ${oran(cokGolge.length, cok.length)}`);
yaz('');

// Golgeyi KIM yapti: regex mi, baska bir sozluk deseni mi?
const regexKurbani = cokGolge.filter((s) => s.motor !== null && s.motor === s.regex && s.regex !== 'diger');
const sozlukKurbani = cokGolge.filter((s) => !regexKurbani.includes(s) && s.motor !== null);
const cozulemeyen = cokGolge.filter((s) => s.motor === null);

yaz('── C) COK-KELIMELI GOLGENIN FAILI ──');
yaz(`   REGEX yuttu        : ${regexKurbani.length}`);
yaz(`   baska sozluk deseni: ${sozlukKurbani.length}`);
yaz(`   hic cozulemedi     : ${cozulemeyen.length}`);
yaz('');

if (regexKurbani.length > 0) {
  yaz('── D) REGEX\'IN YUTTUGU COK-KELIMELI DESENLER (tam liste) ──');
  yaz('   desen                                   | sozluk der | motor der');
  yaz('   ----------------------------------------+------------+-----------');
  for (const s of regexKurbani.sort((a, b) => a.desen.localeCompare(b.desen))) {
    yaz(`   ${s.desen.padEnd(39)} | ${String(s.sozluk).padEnd(10)} | ${s.motor}`);
  }
  yaz('');
}

if (sozlukKurbani.length > 0) {
  yaz('── E) BASKA SOZLUK DESENININ YUTTUKLARI (tasarim geregi olabilir) ──');
  for (const s of sozlukKurbani.sort((a, b) => a.desen.localeCompare(b.desen))) {
    yaz(`   ${s.desen.padEnd(39)} | sahibi=${s.slug.padEnd(18)} | motor=${s.motor}`);
  }
  yaz('');
}

if (cozulemeyen.length > 0) {
  yaz('── F) HIC COZULEMEYEN COK-KELIMELI DESENLER ──');
  for (const s of cozulemeyen) yaz(`   ${s.desen.padEnd(39)} | sahibi=${s.slug}`);
  yaz('');
}

yaz('── G) DURUSTLUK NOTU ──');
yaz('   Bu olcu SOZLUGUN KENDI desenlerini girdi kabul eder; gercek urun/teklif');
yaz('   metinleri daha gurultuludur. Yani buradaki golge sayisi ALT SINIRDIR:');
yaz('   gercek metinde nitelemeler eklendikce regex daha da erken yakalar.');
yaz('');
