/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  AILE COZUM ONCELIGI — SIMULASYON (uretim kodunu DEGISTIRMEZ, yalniz olcer)
 *
 *  SORUN (06.08 oturumunda goruldu, `sozluk-golgeleme-olcum.ts` ile olculdu):
 *    `basIsimAilesi` her sondan-parcada ONCE gevsek regex, SONRA sozluk
 *    cagiriyor. Regex'te longest-wins yok → uzman eliyle yazilmis cok kelimeli
 *    sozluk desenleri regex'e yeniliyor. Olculen: 6 desen (izolasyon x3,
 *    klima-santrali, hortum, yangin-dolabi) = OLU KOD.
 *
 *  ADAY KURAL (K1 — "kapsama ustunlugu"):
 *    Bir sondan-parcada regex'in TUTTUGU parca, sozluk deseninin TUTTUGU
 *    parcanin ICINDE kaliyorsa → SOZLUK kazanir.
 *    Sezgi: sozluk o kelimeyi ZATEN sahiplenmis ("vana ceketi" icindeki
 *    "vana" bir vana degildir; "prefabrik boru yalitimi" icindeki "boru"
 *    bir boru degildir).
 *    Kapsamiyorsa → BUGUNKU davranis (regex kazanir) AYNEN korunur:
 *      "yangin dolabi vanasi" → regex 'vanasi'te tutar, sozluk deseni
 *      'yangin dolabi' onu KAPSAMAZ → 'vana' kalir (dogru).
 *
 *  BU BETIK NE YAPAR:
 *    0) normalizeText idempotent mi — indeks karsilastirmasinin on kosulu.
 *    1) IC TUTARLILIK: K3 replikasi uretim `resolveFamily` ile BIREBIR mi?
 *       Ayrilirsa simulasyon yanlistir, sayilar okunmaz ve exit 1 verilir.
 *       ⚠ K3 ARTIK URETIMDE (66d7373) — denetim bu yuzden K3'e bakar; R0
 *       tarihsel TABANDIR (302a21e davranisi) ve fark sutunlarinin sifir
 *       noktasidir. Denetimi R0'a birakmak her kosumda yalanci alarm verirdi.
 *    2) R0 → aday kural farkini UC ayri girdi kumesinde sayar + liste basar:
 *         A. sozlugun kendi desenleri
 *         B. gercek urun havuzu (yerel ProductIndex dokumu)
 *         C. gercek teklif satirlari (test/fixtures/*.xls*)
 *
 *  KOSUM:  cd backend && npx ts-node test/aile-oncelik-simulasyon.ts
 *  CIKIS:  0 = olcum geldi · 1 = replika uretimden AYRILDI (olcum gecersiz)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as fs from 'fs';
import * as path from 'path';
import { AD_SOZLUGU, AD_ZENGINLESTIRME } from '../src/ozellik/eslestirme/matching/ad-cins-sozlugu';
import { resolveAd, resolveAdDetayli } from '../src/ozellik/eslestirme/matching/ad-resolver';
import {
  extractMaterialType,
  extractMaterialTypeDetayli,
  normalizeText,
} from '../src/ozellik/eslestirme/matching/normalizer';
import { resolveFamily } from '../src/ozellik/eslestirme/matching/index/product-index';

// ── R0: BUGUNKU kural (product-index.ts basIsimAilesi replikasi) ─────────────
function aileR0(text: string): string | null {
  const kelimeler = normalizeText(text).split(/\s+/).filter(Boolean);
  for (let i = kelimeler.length - 1; i >= 0; i--) {
    const parca = kelimeler.slice(i).join(' ');
    const byRegex = extractMaterialType(parca);
    if (byRegex && byRegex !== 'diger') return byRegex;
    const byDict = resolveAd(parca);
    if (byDict) return byDict;
  }
  return null;
}

// ── K1: kapsama ustunlugu — YALNIZ AYNI sondan-parcada ──────────────────────
function aileK1(text: string): string | null {
  const kelimeler = normalizeText(text).split(/\s+/).filter(Boolean);
  for (let i = kelimeler.length - 1; i >= 0; i--) {
    const parca = kelimeler.slice(i).join(' ');
    const rx = extractMaterialTypeDetayli(parca);
    const dc = resolveAdDetayli(parca);
    if (rx && rx.type !== 'diger') {
      // Sozluk deseni regex'in tuttugu parcayi KAPSIYOR mu?
      if (dc && dc.index <= rx.index && dc.index + dc.desen.length >= rx.index + rx.length) {
        return dc.slug;
      }
      return rx.type;
    }
    if (dc) return dc.slug;
  }
  return null;
}

// ── K2: kapsama ustunlugu — TUM METIN uzerinde ──────────────────────────────
//
// K1 yetmiyor (olculdu: 6 golgeli desenin yalniz 2'sini kurtariyor). Sebep:
// tarama EN KISA sondan-parcada durur; daha UZUN sozluk ifadesine hic sira
// gelmez. Ornek: "prefabrik boru yalitimi" → i=1 parcasi "boru yalitimi";
// orada sozlukte hicbir desen yok, regex /boru/ tutuyor ve is bitiyor.
// Sozlugun 'prefabrik boru yalitimi' deseni yalniz i=0'da gorunurdu.
//
// K2: regex tuttugunda, TUM METINDE regex'in tuttugu parcayi KAPSAYAN bir
// sozluk deseni var mi diye bakilir (uzunluk sirali — en uzun kazanir).
// Varsa sozluk kazanir.
//   ✓ "prefabrik boru yalitimi" → 'boru' ifadenin ICINDE → izolasyon
//   ✓ "yangin dolabi vanasi"    → 'vana' ifadenin DISINDA → vana (KORUNUR)
// Yani kural "sozluk her zaman kazanir" DEGIL; "sozluk, regex'in kilitlendigi
// KELIMEYI zaten sahiplenmisse kazanir".
type Aday = { p: string; slug: string };
const K2_PATTERNS: Aday[] = [...AD_SOZLUGU, ...AD_ZENGINLESTIRME]
  .flatMap((e) => e.patterns.filter((p) => p.length >= 3).map((p) => ({ p: normalizeText(p), slug: e.slug })))
  .sort((a, b) => b.p.length - a.p.length);

/** Tum metinde [a,b) araligini KAPSAYAN en uzun sozluk desenini bulur. */
function kapsayanSozluk(tamMetin: string, a: number, b: number, cokKelimeSart: boolean): Aday | null {
  for (const aday of K2_PATTERNS) {
    if (cokKelimeSart && !aday.p.includes(' ')) continue;
    let from = 0;
    for (;;) {
      const idx = tamMetin.indexOf(aday.p, from);
      if (idx < 0) break;
      if (idx <= a && idx + aday.p.length >= b) return aday;
      from = idx + 1;
    }
  }
  return null;
}


function aileK2(text: string, cokKelimeSart: boolean): string | null {
  const tam = normalizeText(text);
  const kelimeler = tam.split(/\s+/).filter(Boolean);
  for (let i = kelimeler.length - 1; i >= 0; i--) {
    const parca = kelimeler.slice(i).join(' ');
    const ofset = tam.length - parca.length; // parca daima metnin SONUNDA
    const rx = extractMaterialTypeDetayli(parca);
    if (rx && rx.type !== 'diger') {
      const kap = kapsayanSozluk(tam, ofset + rx.index, ofset + rx.index + rx.length, cokKelimeSart);
      if (kap) return kap.slug;
      return rx.type;
    }
    const dc = resolveAdDetayli(parca);
    if (dc) return dc.slug;
  }
  return null;
}

// ── 0) ON KOSUL: normalizeText idempotent mi ────────────────────────────────
const ornekler = ['Sprinkler Boru Askısı, DN150', 'PP-R  Boru  /  PN 20', 'Tas Yünü Vana Ceketi'];
for (const o of ornekler) {
  if (normalizeText(normalizeText(o)) !== normalizeText(o)) {
    console.error(`ON KOSUL COKTU — normalizeText idempotent DEGIL: "${o}"`);
    process.exit(1);
  }
}

// ── Girdi kumeleri ──────────────────────────────────────────────────────────
type Kume = { ad: string; metinler: string[] };
const kumeler: Kume[] = [];

// A) sozlugun kendi desenleri
kumeler.push({
  ad: 'A. SOZLUK DESENLERI',
  metinler: [...AD_SOZLUGU, ...AD_ZENGINLESTIRME].flatMap((e) => e.patterns),
});

// B) gercek urun havuzu (yerel dokum)
const DOKUM = path.join(__dirname, '..', '.olcum-urun-dokumu.json');
if (fs.existsSync(DOKUM)) {
  const satirlar = JSON.parse(fs.readFileSync(DOKUM, 'utf8')) as Array<{ ad: string }>;
  kumeler.push({
    ad: `B. GERCEK URUN ADLARI (yerel dokum, ${satirlar.length} satir)`,
    metinler: satirlar.map((s) => s.ad).filter(Boolean),
  });
} else {
  kumeler.push({ ad: 'B. GERCEK URUN ADLARI — DOKUM YOK (bash scripts/s45-olcu.sh dokum)', metinler: [] });
}

// C) gercek teklif satirlari
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');
  const dizin = path.join(__dirname, 'fixtures');
  const metinler: string[] = [];
  for (const dosya of fs.readdirSync(dizin).filter((f) => /\.xls[xm]$/i.test(f))) {
    const wb = XLSX.readFile(path.join(dizin, dosya));
    for (const sheet of wb.SheetNames) {
      const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: false });
      for (const r of rows) {
        for (const h of r) {
          const s = String(h ?? '').trim();
          // Malzeme adi adayi: harf iceren, makul uzunlukta hucre
          if (s.length >= 6 && s.length <= 120 && /[a-zA-ZçğıöşüÇĞİÖŞÜ]{3}/.test(s)) metinler.push(s);
        }
      }
    }
  }
  kumeler.push({ ad: `C. GERCEK TEKLIF HUCRELERI (fixtures, ${metinler.length} hucre)`, metinler });
} catch (e) {
  kumeler.push({ ad: `C. TEKLIF HUCRELERI — OKUNAMADI (${(e as Error).message})`, metinler: [] });
}

// ── 1) REPLIKA DOGRULAMASI + 2) FARK OLCUSU ────────────────────────────────
const yaz = (s = '') => console.log(s);
yaz('════════════════════════════════════════════════════════════════════════');
yaz(' AILE COZUM ONCELIGI — R0 (bugun) vs K1 (kapsama ustunlugu)');
yaz('════════════════════════════════════════════════════════════════════════');

let replikaHatasi = 0;
let toplamGirdi = 0;

// ── K3: K2 + AYNI KURAL SOZLUGUN KENDI ICINDE ───────────────────────────────
//
// Ayni "kisa parca uzun ifadeyi onceler" kusuru sozluk-sozluk carpismasinda da
// var. Kod bunun AKSINI YAZIYOR ama tutmuyor:
//   ad-cins-sozlugu.ts:38  "'pislik tutucu' yalin 'suzgec'ten uzun → catismaz"
//   ad-cins-sozlugu.ts:81  "'isi sayaci' yalin 'sayac'tan UZUN oldugu icin yener"
// Gercekte "y suzgec" → suzgec (yer suzgeci!), "isi sayaci" → sayac cikiyor,
// cunku tarama daha kisa sondan-parcada ('suzgec' / 'sayaci') duruyor.
// K3 tek kurali her iki cozucuye de uygular.
function aileK3(text: string): string | null {
  const tam = normalizeText(text);
  const kelimeler = tam.split(/\s+/).filter(Boolean);
  for (let i = kelimeler.length - 1; i >= 0; i--) {
    const parca = kelimeler.slice(i).join(' ');
    const ofset = tam.length - parca.length;
    const rx = extractMaterialTypeDetayli(parca);
    if (rx && rx.type !== 'diger') {
      const kap = kapsayanSozluk(tam, ofset + rx.index, ofset + rx.index + rx.length, true);
      return kap ? kap.slug : rx.type;
    }
    const dc = resolveAdDetayli(parca);
    if (dc) {
      const kap = kapsayanSozluk(tam, ofset + dc.index, ofset + dc.index + dc.desen.length, true);
      return kap ? kap.slug : dc.slug;
    }
  }
  return null;
}

const VARYANTLAR: { ad: string; f: (t: string) => string | null }[] = [
  { ad: 'K1 (ayni parcada kapsama)', f: aileK1 },
  { ad: 'K2c (tum metin, COK KELIMELI desen sarti)', f: (t) => aileK2(t, true) },
  { ad: 'K2h (tum metin, desen sarti YOK)', f: (t) => aileK2(t, false) },
  { ad: 'K3 (K2c + sozluk-sozluk de ayni kurala tabi)', f: aileK3 },
];

for (const kume of kumeler) {
  const benzersiz = Array.from(new Set(kume.metinler.map((m) => normalizeText(m)))).filter(Boolean);
  const farklar = new Map<string, { metin: string; r0: string | null; yeni: string | null }[]>();
  for (const v of VARYANTLAR) farklar.set(v.ad, []);

  for (const metin of benzersiz) {
    const uretim = resolveFamily(metin);
    const r0 = aileR0(metin);
    // ⚠ K3 ARTIK URETIMDE (66d7373). Bu yuzden ic tutarlilik denetimi K3
    // replikasina bakar; R0 tarihsel TABANDIR (302a21e davranisi) ve fark
    // sutunlarinin baslangic noktasidir. Denetimi R0'a birakmak, fix
    // birlestikten sonra her kosumda "olcum gecersiz" derdi.
    const k3 = aileK3(metin);
    if (uretim !== k3) {
      if (replikaHatasi < 5) console.error(`REPLIKA AYRILDI: "${metin}" uretim=${uretim} K3replika=${k3}`);
      replikaHatasi++;
    }
    for (const v of VARYANTLAR) {
      const yeni = v.f(metin);
      if (yeni !== r0) farklar.get(v.ad)!.push({ metin, r0, yeni });
    }
  }
  toplamGirdi += benzersiz.length;

  yaz();
  yaz(`── ${kume.ad} ──`);
  yaz(`   benzersiz girdi (PAYDA) : ${benzersiz.length}`);
  for (const v of VARYANTLAR) {
    const n = farklar.get(v.ad)!.length;
    yaz(`   ${v.ad.padEnd(44)} fark: ${String(n).padStart(4)}  ${
      benzersiz.length ? `%${((n / benzersiz.length) * 100).toFixed(2)}` : '—'
    }`);
  }

  for (const v of VARYANTLAR) {
    const liste = farklar.get(v.ad)!;
    if (liste.length === 0) continue;
    yaz(`   ┌─ ${v.ad} — AILE GECIS KIRILIMI`);
    const gecis = new Map<string, number>();
    for (const f of liste) gecis.set(`${f.r0} → ${f.yeni}`, (gecis.get(`${f.r0} → ${f.yeni}`) ?? 0) + 1);
    for (const [g, n] of [...gecis.entries()].sort((a, b) => b[1] - a[1])) {
      yaz(`   │  ${String(n).padStart(5)} ×  ${g}`);
    }
    const goster = liste.slice(0, 40);
    for (const f of goster) yaz(`   │  "${f.metin}"  ${f.r0} → ${f.yeni}`);
    if (liste.length > goster.length) yaz(`   │  … ${liste.length - goster.length} satir daha (sayim yukarida TAM).`);
    yaz('   └─');
  }
}

yaz();
yaz('════════════════════════════════════════════════════════════════════════');
if (replikaHatasi > 0) {
  yaz(` ✗ K3 REPLIKASI URETIMDEN AYRILDI: ${replikaHatasi}/${toplamGirdi} girdi. OLCUM GECERSIZ.`);
  process.exit(1);
}
yaz(` ✓ K3 replikasi uretim resolveFamily ile BIREBIR (${toplamGirdi} girdi) — olcum gecerli.`);
yaz('════════════════════════════════════════════════════════════════════════');
