/**
 * A1 KILIDI — URUN OLCU SINIFI (resolveProductSizeClass)
 *   npx ts-node test/olcu-sinifi-test.ts   (npm run test:olcu-sinifi)
 *
 * ── OLCULEN KUSUR (30.09, gercek Pimtas listesi + uretim yolu) ─────────────
 * `resolveProductSizeClass` ADI once CELIK kaliplariyla, sonra PLASTIK
 * kaliplariyla deniyor. "CELIK ONCE" onceligi BILEREK konmustu (Cayirova
 * 16.07: "Celik boru · PE kapli" plastik siniflanip TEMIZ SU filtresinden
 * geciyordu). Ama kural, celik kelimesinin GOVDEYI mi yoksa bir PARCAYI /
 * RENGI mi anlattigina bakmiyor:
 *
 *   "U-PVC Elektrik Aktuatorlu Kelebek Vana ... 304/316 Paslanmaz Civata-Somun-Pul"
 *      → govde U-PVC, "Paslanmaz" CIVATAYI anlatiyor          → bugun steel
 *   "UH-PVC Rakor Dis Dis Pirinc Cikisli"  → "Pirinc" CIKISI  → bugun steel
 *   "HDPE Ici Dolu Kutuk (Siyah)"          → "Siyah" RENK     → bugun steel
 *
 * Gercek listede OLCULDU (3293 adli satir): 376 satir steel siniflandi,
 * bunlarin 334'u yukaridaki uc kalip. Sonuc kullanici-gorunur: plastik urunun
 * `capTags`i `dn*` etiketini KAYBEDIYOR (celik tablosu OD uzerinden calisir),
 * "DN 63" yazan satir o urunu HIC bulamiyor ya da komsu capa dusuyor.
 *
 * Ikinci, bagimsiz kusur: PLASTIK kalibi bazi yaygin yazimlari HIC tanimiyor
 * (yalin `pe`, bosluklu `pe 100` / `pe 80`, `pead`, `ldpe`, `upvc` (tiresiz),
 * `pvcu`, `pe-rt`). "PE 100 Boru" steel siniflanip 1" sorgusu 25 mm'ye
 * dusuyordu (dogrusu 32 mm).
 *
 * ── KURAL (bu testin muhurledigi) ─────────────────────────────────────────
 *   1. KAPLAMA GOVDE DEGILDIR: plastik belirteci hemen ardindan "kapli"
 *      geliyorsa govde sinyali SAYILMAZ ("PE kapli celik boru" → steel).
 *   2. Kaplama elendikten sonra ADda ONCE gecen sinyal GOVDEDIR. Turkce urun
 *      adi govdeyle baslar, nitelik (civata/cikis/renk) sonra gelir.
 *   3. Adda hic sinyal yoksa cins metnine bakilir (eski davranis), sonra aile.
 *
 * ── GENELLIK ──────────────────────────────────────────────────────────────
 * IKI AILE olculur — ornege ozel duzeltme genellik saymaz:
 *   (P) Pimtas nitelik ailesi: paslanmaz civata · pirinc cikis · siyah renk
 *   (C) Cayirova kaplama ailesi: PE kapli celik (REGRESYON KALKANI — bu
 *       ailenin yesil kalmasi, 1. kuralin gercekten korundugunun kanitidir)
 * Ayrica KARSI ORNEKLER: govdesi gercekten celik olan urunler steel KALMALI.
 */

import { resolveProductSizeClass, buildProductIndex } from '../src/ozellik/eslestirme/matching/index/product-index';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function sinif(ad: string, cins?: string | null): string {
  return resolveProductSizeClass(ad, cins ?? null, null);
}

async function main() {
  // ── P: PIMTAS NITELIK AILESI — govde plastik, celik kelimesi NITELIK ─────
  // Adlar gercek listeden birebir alindi (Pimtas TAM sayfasi).
  const P: Array<[string, string]> = [
    ['U-PVC Elektrik Aktüatörlü Kelebek Vana 24 V DC/24 V AC 304/316 Paslanmaz Civata-Somun-Pul', '192 satir'],
    ['U-PVC Pnömatik Aktüatörlü Kelebek Vana Çift Etkili 304/316 Paslanmaz Civata-Somun-Pul', 'ayni aile'],
    ['U-PVC Flanş Bağlanılı Çalparalı Çekvalf (Takım- 304 Paslanmaz Civata-Somun-Pul)', '52 satir'],
    ['UH-PVC Rakor Dış Diş Pirinç Çıkışlı', '24 satir'],
    ['U-PVC Küresel Su Vanası (Tek Tarafı Pirinç Dış Diş)', '36 satir'],
    ['HDPE İçi Dolu Kütük (Siyah)', '18 satir — renk'],
    ['HDPE Plaka (Siyah)', '12 satir — renk'],
    ['PPR Pirinç Dişli Dirsek', 'sentetik ikiz (e1)'],
  ];
  for (const [ad, not] of P) {
    check(`P ${ad.slice(0, 52)}… → plastic (${not})`, sinif(ad) === 'plastic', `bugun: ${sinif(ad)}`);
  }

  // ── C: CAYIROVA KAPLAMA AILESI — REGRESYON KALKANI (steel KALMALI) ───────
  const C: Array<[string, string | null]> = [
    ['Çelik Boru PE Kaplı Doğalgaz', null],
    ['PE Kaplı Çelik Boru', null],
    ['Çelik boru', 'PE kaplı doğalgaz · sarı polietilen 3 kat kaplı'],
    ['PE Kaplı Boru', null],                       // 'pe' ardinda 'kapli' → govde DEGIL
  ];
  for (const [ad, cins] of C) {
    check(`C "${ad}" → steel (kaplama govde degil)`, sinif(ad, cins) === 'steel', `bugun: ${sinif(ad, cins)}`);
  }

  // ── K: KARSI ORNEKLER — govdesi gercekten celik, steel KALMALI ───────────
  for (const ad of ['304 Paslanmaz Çelik Ön Filtre', 'Siyah Çelik Boru TS EN 10255', 'Galvaniz Boru', 'Pirinç Küresel Vana', 'Döküm Flanş']) {
    check(`K "${ad}" → steel`, sinif(ad) === 'steel', `bugun: ${sinif(ad)}`);
  }

  // ── F: GERI DONUSLER — AD sessizse zincir DEVAM ETMELI ──────────────────
  // AD'de hic sinyal yoksa karar ERKEN verilemez: once CINS metni, sonra aile.
  // (v10 canli vakasi, KALDE: ad "PP Boru / PN 20" degil — ad sessiz, cins
  // "PP-R". Zincir kesilirse o urun yine steel siniflanir ve kusur geri gelir.)
  check('F ad sessiz + cins PP-R → plastic (cins geri donusu)',
    sinif('Boru', 'PP-R PN 20') === 'plastic', `bugun: ${sinif('Boru', 'PP-R PN 20')}`);
  check('F ad sessiz + cins sessiz + aile boru → steel (aile geri donusu)',
    sinif('Boru', null) === 'steel', `bugun: ${sinif('Boru', null)}`);
  // P4 KORUMASI: hicbir sinyal YOK ve aile de cozulmuyorsa 'unknown' KALMALI —
  // 'unknown' sizeEquivalents union'u uretir ve sorgu tarafi ASLA otomatik
  // yazmaz. Burayi steel'e cevirmek sessiz yanlis fiyat yazdirirdi.
  check('F sinyalsiz + aile cozulmez → unknown (P4: otomatik yazim kapali)',
    sinif('Somun Kelepçe (Metal)') === 'unknown', `bugun: ${sinif('Somun Kelepçe (Metal)')}`);

  // ── Y: EKSIK PLASTIK YAZIMLARI (ikinci, bagimsiz kusur) ─────────────────
  for (const ad of ['PE Boru', 'PE 100 Boru', 'PE 100 SDR 11 Boru', 'PE 80 Boru', 'PEAD Boru', 'LDPE Boru', 'uPVC Boru', 'PVCU Boru', 'PE-RT Boru']) {
    check(`Y "${ad}" → plastic`, sinif(ad) === 'plastic', `bugun: ${sinif(ad)}`);
  }

  // ── S: SONUC — yanlis sinif capTags'i BOZUYOR (kullanici-gorunur etki) ───
  // Plastik urun 63 mm ise hem od-63 hem dn63 tasimali; steel siniflaninca
  // dn63 DUSUYOR ve "DN 63" yazan satir urunu bulamiyor.
  const pe = buildProductIndex({ ad: 'PE 100 Boru', cins: 'SDR 11 PN 16', cap: '63 mm', price: 100 } as any);
  check('S PE 100 Boru 63 mm → capTags dn63 TASIR', (pe.capTags ?? []).includes('dn63'),
    `capTags=${JSON.stringify(pe.capTags)}`);
  const upvc = buildProductIndex({ ad: 'U-PVC Küresel Su Vanası (Tek Tarafı Pirinç Dış Diş)', cins: null, cap: '63 mm', price: 100 } as any);
  check('S U-PVC pirinç çıkışlı 63 mm → capTags dn63 TASIR', (upvc.capTags ?? []).includes('dn63'),
    `capTags=${JSON.stringify(upvc.capTags)}`);
  // KARSI: celik urun dn63 TASIMAMALI (kapi kor degil)
  const celik = buildProductIndex({ ad: 'Siyah Çelik Boru', cins: null, cap: '63 mm', price: 100 } as any);
  check('S KARSI: çelik 63 mm → dn63 TASIMAZ', !(celik.capTags ?? []).includes('dn63'),
    `capTags=${JSON.stringify(celik.capTags)}`);

  console.log(`\n${'='.repeat(60)}\nA1 OLCU SINIFI: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
