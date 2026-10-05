/**
 * FAZ C (C1) — ETIKET KATMANI: B13 PN · B18 yuzey/baglanti/cins/Ø · B17 baslik baglami
 *   npx ts-node test/etiket-katmani-test.ts   (npm run test:etiket-katmani)
 *
 * Etiket katmani (normalizer → tag-generator) motorun cap/aile yolu DEGILDIR;
 * HAFIZA ANAHTARINI (matching.service buildImza: olcu|tip|cins|yuzey|baglanti),
 * cins tercih imzasini, iscilik/admin etiketlemesini ve sayfadan kaydetme
 * yolunun baslik birlestirmesini (build-material-context) besler. Yanlis etiket
 * = farkli iki satir AYNI hafiza kaydina duser (biri digerine "gecmis seciminiz"
 * diye gosterilir) ya da ayni satir kendi kaydini bulamaz.
 *
 * OLCULDU (05.10, mevcut kod):
 *   B13 PN basinc sinifi CAP sayiliyor (ciplak plastik sayi dali):
 *       "PN 16 PPR Boru" → od-16 · "PPR Boru PN 20" → dn20 (20 mm boruyla AYNI
 *       anahtar) · "PN 10 PPR Boru 25" → YOK (ilk sayida durup 25'i gormuyor) ·
 *       "PE 100 Boru 63" → dn100 · "PE100 SDR 17 Boru 63" → od-17.
 *   B18 "DKP" → galvaniz (DKP dekape celiktir, kaplama degil) · "Kompresör" /
 *       "Presostat" → baglanti 'pres' · "PPR Manşonu" → 'disli' (manşonu ISIM,
 *       manşonlu SIFAT) · "PE Basınçlı Boru" → 'celik' · "PE-X" / "PE-RT" → 'pe'
 *       · "Ø110 Boru" (mm'siz) → cap YOK.
 *   B17 build-material-context (arka uc): tirnak sinifi iki DUZ ASCII tirnakti
 *       (`/[""]/` — etkisiz; on yuz ikizi 04.10'da duzeldi) ve tam sayi inc
 *       kalibinda sol sinir yoktu: "3/4\"" icinden 4" okunuyor (dn100) →
 *       "GALVANİZ BORU 2\"" basligi "1 1/2\"" satirina eklenip "GALVANİZ BORU
 *       2\" 1 1/2\"" adi kaydediliyordu (cap korumasi ikisini de 2" sandi).
 */
import {
  extractDiameter, extractSurfaces, extractConnection, extractMaterialKind, extractODiameter,
} from '../src/ozellik/eslestirme/matching/normalizer';
import { generateTags } from '../src/ozellik/eslestirme/matching/tag-generator';
import { buildMaterialContextFromRows, extractCapFromText } from '../src/ozellik/eslestirme/utils/build-material-context';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const js = (x: unknown) => JSON.stringify(x);
const olcu = (t: string) => generateTags(t).tags.filter((x) => /^dn\d|^od-/.test(x));

async function main() {
  const warn = console.warn; console.warn = () => {};
  try {
    // ══ B13 · PN / PE sinifi / SDR cap DEGILDIR ═══════════════════════════
    const b13: Array<[string, string | null]> = [
      ['PN 16 PPR Boru', null],
      ['PPR Boru PN 20', null],
      ['PN 10 PPR Boru 25', 'dn25'],
      ['PN:16 PPR Boru 32', 'dn32'],
      ['PE 100 Boru 63', 'od-63'],
      ['PE100 SDR 17 Boru 63', 'od-63'],
    ];
    for (const [t, b] of b13) check(`★ B13 "${t}" → ${b ?? 'cap yok'}`, extractDiameter(t) === b, String(extractDiameter(t)));
    // KARSI (L5 kilidi ve mevcut dogrular)
    check('B13 karsi: "63 PE100 - SDR17, PN10" → od-63 (ciplak PE capi korunur)', extractDiameter('63 PE100 - SDR17, PN10') === 'od-63', String(extractDiameter('63 PE100 - SDR17, PN10')));
    check('B13 karsi: "PPR Boru 25 PN 20" → dn25', extractDiameter('PPR Boru 25 PN 20') === 'dn25', String(extractDiameter('PPR Boru 25 PN 20')));
    // A8 (ciplak sayi) KAPSAMI DISI: ilk ONEKSIZ sayi karar verir (eski davranis aynen)
    check('B13 karsi: "PVC Boru 14 63" → cap yok (ilk oneksiz sayi 14 < 16 — A8 kapsami, dokunulmadi)', extractDiameter('PVC Boru 14 63') === null, String(extractDiameter('PVC Boru 14 63')));
    check('B13 karsi: "PPR Boru 20" → dn20 (gercek 20 mm)', extractDiameter('PPR Boru 20') === 'dn20', String(extractDiameter('PPR Boru 20')));
    check('★ B13 hafiza anahtari: "PPR Boru PN 20" ile "PPR Boru 20" AYNI olcu etiketini TASIMAZ',
      js(olcu('PPR Boru PN 20')) !== js(olcu('PPR Boru 20')), `${js(olcu('PPR Boru PN 20'))} vs ${js(olcu('PPR Boru 20'))}`);

    // ══ B18 · yuzey / baglanti / cins / Ø ═══════════════════════════════
    check('★ B18 "DKP Boru 2\\"" galvaniz SAYILMAZ', !extractSurfaces('DKP Boru 2"').includes('galvaniz'), js(extractSurfaces('DKP Boru 2"')));
    check('B18 karsi: "Galvaniz Boru" / "Sıcak Daldırma Boru" galvaniz', extractSurfaces('Galvaniz Boru').includes('galvaniz') && extractSurfaces('Sıcak Daldırma Boru').includes('galvaniz'));
    for (const t of ['Kompresör', 'Presostat', 'Ekspres Vana']) check(`★ B18 "${t}" baglanti 'pres' DEGIL`, extractConnection(t) !== 'pres', String(extractConnection(t)));
    for (const t of ['Pres Fitting 22', 'Press Fitting 22', 'Presli Dirsek 22', 'Pres Bağlantılı Te']) check(`B18 karsi: "${t}" → pres`, extractConnection(t) === 'pres', String(extractConnection(t)));
    check('★ B18 "PPR Manşonu 25" baglanti disli DEGIL (manşonu ISIM)', extractConnection('PPR Manşonu 25') !== 'disli', String(extractConnection('PPR Manşonu 25')));
    check('B18 karsi: "Manşonlu Galvaniz Boru" → disli (SIFAT)', extractConnection('Manşonlu Galvaniz Boru') === 'disli', String(extractConnection('Manşonlu Galvaniz Boru')));
    for (const t of ['PE Basınçlı Boru 63', 'PVC Basınçlı Boru 110', 'PE100 Basınçlı Boru 63']) check(`★ B18 "${t}" celik SAYILMAZ`, !extractMaterialKind(t).includes('celik'), js(extractMaterialKind(t)));
    check('B18 karsi: "Basınçlı Boru 2\\"" (malzemesiz) celik kalir', extractMaterialKind('Basınçlı Boru 2"').includes('celik'), js(extractMaterialKind('Basınçlı Boru 2"')));
    for (const t of ['PE-X Boru 16', 'PE-RT Boru 16', 'PE-Xa Boru 20']) check(`★ B18 "${t}" 'pe' (polietilen) SAYILMAZ`, !extractMaterialKind(t).includes('pe'), js(extractMaterialKind(t)));
    check('B18 karsi: "PE Boru 63" / "PE 100 Boru" → pe', extractMaterialKind('PE Boru 63').includes('pe') && extractMaterialKind('PE 100 Boru').includes('pe'));
    // Yan etki kilidi (once/sonra yakaladi): 'pe' dusunce "malzemesiz boru = celik"
    // varsayilani PE-X'i CELIK yapiyordu; bitisik "PEX Boru" bugun de celikti.
    for (const t of ['PE-X Boru 16', 'PE-RT Boru 16', 'PEX Boru 16']) {
      const g = generateTags(t).tags;
      check(`★ B18 "${t}" celik SAYILMAZ (pex kendi cinsi)`, !g.includes('celik') && g.includes('pex'), js(g));
    }
    // \bpe\b'nin ters yonu: bitisik PE sinifi ("PE100") polietilendir ama etiketlenmiyordu
    for (const t of ['PE100 Boru 63', 'PE80 Boru 32', 'PE-100 Boru 63']) check(`★ B18 "${t}" → pe (PE sinifi polietilendir)`, extractMaterialKind(t).includes('pe'), js(extractMaterialKind(t)));
    check('★ B18 "Ø110 Boru" (mm\'siz) → dn100', extractODiameter('Ø110 Boru') === 'dn100', String(extractODiameter('Ø110 Boru')));
    check('B18 "⌀63 Boru" → od-63 (cap simgeleri, conversion B9 ikizi)', extractODiameter('⌀63 Boru') === 'od-63', String(extractODiameter('⌀63 Boru')));
    check('B18 karsi: "Ø110 mm Boru" → dn100', extractODiameter('Ø110 mm Boru') === 'dn100');
    check('★ B18 hafiza anahtari: "Ø110 Boru" olcu etiketi tasir', js(olcu('Ø110 Boru')) === '["dn100"]', js(olcu('Ø110 Boru')));

    // ══ P2-EK (05.10, koordinator onayi) · Ø tablosu tek · siyah plastik boru ═
    // Olculdu: extractODiameter'in KENDI mm→DN tablosu MM_TO_DN'den eksikti —
    // ayni boru iki yazimda FARKLI hafiza anahtari ("Ø22 Boru" od-22 ↔ "22 mm
    // Boru" dn15). FAZ C'de mm'siz Ø okunmaya baslayinca ayrisma yayildi.
    for (const mm of [22, 28, 60, 114, 110]) {
      check(`★ P2-ek "Ø${mm} Boru" ile "${mm} mm Boru" AYNI olcu etiketi`, js(olcu(`Ø${mm} Boru`)) === js(olcu(`${mm} mm Boru`)), `${js(olcu(`Ø${mm} Boru`))} vs ${js(olcu(`${mm} mm Boru`))}`);
    }
    check('P2-ek "Ø22 mm Boru" (mm\'li) de ayni: dn15', js(olcu('Ø22 mm Boru')) === '["dn15"]', js(olcu('Ø22 mm Boru')));
    // "siyah.*boru → celik" plastik yazili metinde gecersiz (basincli boru kuralinin ikizi)
    for (const t of ['Siyah PE100 Boru 63', 'Siyah HDPE Boru 110', 'Boru Siyah PE 63']) check(`★ P2-ek "${t}" celik SAYILMAZ`, !extractMaterialKind(t).includes('celik'), js(extractMaterialKind(t)));
    for (const t of ['Siyah Boru 2"', 'Siyah Çelik Boru 2"']) check(`P2-ek karsi: "${t}" → celik`, extractMaterialKind(t).includes('celik') && generateTags(t).tags.includes('celik'), js(extractMaterialKind(t)));

    // ══ P2-EK · extractCapFromText IKIZ KURALI (on yuz ↔ arka uc) ═══════════
    // Olculdu (05.10): 21 gercek dosya, 3.850 tekil ad — eski iki taraf 169 adda
    // ayrisiyordu (P3 kulliyati: 3.142 adda 154). Kural build-material-context'te.
    const cap: Array<[string, string | null, string]> = [
      // A · coklu DN
      ['Boru DN25 (1”) Yukarıdaki gibi ancak Çap: DN50', 'dn50', 'A etiket "Çap:" kazanir'],
      ['Kelepçe/U-Bolt Çapı : Muhtelif (DN100, DN80, DN65)', 'dn100', 'A etiket "Çapı :"'],
      ['DN150 Kollektör (2xDN100+3xDN80+1xDN15)', 'dn150', 'A parantez ici ikincil (eski arka uc dn15)'],
      ['Branşman Kelepçesi, DN150 x DN50', 'dn150', 'A ilk DN = asil hat (eski arka uc dn50)'],
      ['3"x1"-DN80 x DN25 Dişli Mekanik Te', 'dn80', 'A DN incten once, ilk'],
      ['Giriş-Çıkış : 1xHDPE225 Flanşlı Giriş - 1xDN65 Flanşlı Çıkış', 'dn65', 'A bitisik "1xDN65"'],
      // B · unicode bilesik kesir
      ['2½" ve üstü borular', 'dn65', 'B "2½" bilesiktir (eski arka uc null)'],
      ['1¼" galvaniz boru', 'dn32', 'B "1¼"'],
      ['½" küresel vana', 'dn15', 'B yalin ½'],
      // C · tirnak / kesme
      ['1” EMT Galvaniz Boru', 'dn25', 'C tipografik ”'],
      ["2'' siyah boru", 'dn50', "C iki kesme ''"],
      ["1' siyah boru", 'dn25', 'C tek kesme, arkasinda harf yok'],
      ["Ex-Proof Tehlike sınıfı 1'e uygun", null, "C Turkce ek 1'e — olcu degil (eski arka uc dn25)"],
      ['TSE Onaylı, EN 671-1’e Uygun', null, 'C tipografik kesme + ek'],
      ["2'li priz grubu", null, "C 2'li — olcu degil"],
      // yan bulgular (olcum sirasinda)
      ['Sonsuz sargı CP 648-E-W45/1.8"', null, 'ondalik "1.8\\"" icinden 8" okunmaz (eski dn200)'],
      ["1 1/ 4'' x 1''x 1'' İnegal Tee", 'dn32', 'bolunmus kesir "1 1/ 4" (eski 4" → dn100 riski)'],
      ["4''x3'' Yivli Redüksiyon", 'dn100', 'inc de ILK olcu (asil hat)'],
      ['Esnek bağlantı hortumu 1.5" uçlu', null, 'ondalik "1.5\\"" icinden 5" okunmaz (eski arka uc dn125)'],
      ['Pis Su Kolektörü (DN50 çıkışlı) DN100', 'dn100', 'A parantezdeki olcu ONCE gelse de asil olcu disaridaki'],
      ['Sprinkler Flex ve seti,1"-500', 'dn25', 'karsi: liste virgulu ondalik degil'],
      // P3 kulliyati incelemesi (05.10): sartname metninde SONRAKI etiketler alt parcayi anlatir
      ['Baskın Vana İstasyonu, DN100 (4”)\nTür : Klapeli\nÇapı : DN100 (4”)\nElle Tahrik Ünitesi : - Türü : Küresel Vana\n: - Çapı : ½”', 'dn100', 'A ILK etiket asil kalem (son etiket alt parcanin ½"i: dn15)'],
      ['Yerüstü Hidrantı\nGiriş Çapı : DN100\nÇıkış Çapı : 2 x DN 65 Storz', 'dn100', 'A ILK etiket (giris), cikis ikincil'],
      ['Çap : 2"\nÇıkış Çapı : DN65', 'dn50', 'A etiketin KENDI bolgesi: sonraki etiketin DN\'i incin onune gecmez'],
      ['Boru DN25\nÇap : muhtelif\nBağlantı Çapı : DN40', 'dn40', 'A ilk etiket okunamazsa sonraki ETIKET (etiketsiz DN25 degil)'],
      ['TS EN 671-1,1" hortum,30m', 'dn25', 'virgul ondalik DEGIL, liste ayiraci (P3 kulliyati; eski dn25)'],
      ['3/4" küresel vana', 'dn20', 'karsi: "3/4\\"" icinden 4" okunmaz'],
      ['GALVANİZ BORU', null, 'karsi: olcusuz'],
    ];
    for (const [t, b, ad] of cap) {
      check(`${ad.startsWith('karsi') ? '' : '★ '}CAP ${ad}: "${t}" → ${b}`, extractCapFromText(t) === b, String(extractCapFromText(t)));
    }

    // ══ B17 · baslik baglami (arka uc build-material-context) ═════════════
    const roles = { noField: 'no', nameField: 'ad', brandField: 'marka' };
    const bag = (baslik: string, satir: string) => buildMaterialContextFromRows(
      [{ no: '1', ad: baslik, marka: '' }, { no: '', ad: satir, _isDataRow: true }], 1, roles);
    check('★ B17 sol sinir: "GALVANİZ BORU 2\\"" + "1 1/2\\"" → yalniz satir (caplar farkli)', bag('GALVANİZ BORU 2"', '1 1/2"') === '1 1/2"', bag('GALVANİZ BORU 2"', '1 1/2"'));
    check('★ B17 tirnak: "VANA 3”" + "1”" (tipografik) → yalniz satir', bag('VANA 3”', '1”') === '1”', bag('VANA 3”', '1”'));
    check('B17 karsi: capsiz baslik birlesir: "GALVANİZ BORU" + "1 1/2\\""', bag('GALVANİZ BORU', '1 1/2"') === 'GALVANİZ BORU 1 1/2"', bag('GALVANİZ BORU', '1 1/2"'));
    check('B17 karsi: ayni cap birlesir: "GALVANİZ BORU 1\\"" + "1\\""', bag('GALVANİZ BORU 1"', '1"') === 'GALVANİZ BORU 1" 1"', bag('GALVANİZ BORU 1"', '1"'));
    check('B17 karsi: "GALVANİZ BORU 1\\"" + "3/4\\"" → yalniz satir (bugun de dogru)', bag('GALVANİZ BORU 1"', '3/4"') === '3/4"', bag('GALVANİZ BORU 1"', '3/4"'));
    check('★ B17 sol sinir (kesir ici): "VANA 4\\"" + "3/4\\"" → yalniz satir', bag('VANA 4"', '3/4"') === '3/4"', bag('VANA 4"', '3/4"'));
  } finally { console.warn = warn; }

  console.log(`\n${'='.repeat(60)}\nETIKET KATMANI (FAZ C1): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
