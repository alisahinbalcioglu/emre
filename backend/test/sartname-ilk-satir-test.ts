/**
 * UZUN SARTNAME: ILK SATIR KALEMIN ADIDIR (P2, 06.10 — kulliyat olcumu).
 *
 * Teklif hucresi cok satirli sartname olabilir: ilk satir kalemin adi ("Kelebek
 * Vana, DN150"), sonraki satirlar nitelik ("Türü : Yivli veya Wafer", "Montaj
 * Biçimi : Dik veya Yatay"). Iki olculen kusur (kulliyat 9.005 metin, 295 cok satirli):
 *  1. HIZMET SANILMA: nitelik ANAHTARINDAKI "Montaj" (NOT_PRODUCT_RE \bmontaj\b)
 *     tum satiri hizmet yapiyordu — motor bu kalemlere HIC urun aramiyordu (vana 13,
 *     aski 10, boru, hidrant, hortum, nozul...).
 *  2. YANLIS AILE: bas isim sondan arandigi icin nitelik satirindaki isim
 *     kaziniyordu ("6\"-DN150 Kollektör … / Siyah Dikişli Borudan İmal Edilecek" →
 *     boru; "Deneme ve Gider Vanası … / Manometre : 0-20 Bar …" → manometre).
 *
 * Kural (yalniz COK SATIRLI metin; tek satirli metin birebir ayni):
 *  - GOVDE = ilk satir + sonraki satirlar NITELIK ANAHTARI ("Montaj Biçimi :") soyulmus.
 *    Hizmet taramasi govdede VE ilk satirda (satir sonuna demirli "… İmalatı");
 *    kapsam notu ("… montaj ve sarf malzemeleri dahil") hizmet KALIR.
 *  - Aile: govdenin (parantezsiz) ilk satiri tek basina bir aileye cozuluyorsa ODUR;
 *    cozulmuyorsa ya da ilk satir baglacla bitiyorsa ("… İçin") govdenin tamami.
 *  - BILINEN SINIR (B1): baglacsiz satir sarmasi ("Boru ⏎ Kelepçesi") ilk satirin
 *    ailesini alir — kulliyatta ve canlida 0; sonuc sabitlendi, duzeltilirse guncelle.
 */
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const js = (x: unknown) => JSON.stringify(x);
const ozet = (s: string) => { const q = parseLine(s, null); return q.notProduct ? 'URUN-DEGIL' : (q.familySlug ?? '∅'); };

async function main() {
  const warn = console.warn; console.warn = () => {};
  try {
    // ══ S1 · nitelik anahtarindaki "Montaj" satiri hizmete cevirmez ═════════
    const kelebek = 'Kelebek Vana, DN150\nTürü : Yivli veya Wafer\nMontaj Biçimi : Dik veya Yatay';
    check('FIXTURE KANITI: tek satira cevrilince bugunku kural hizmet der (anahtar "Montaj")', ozet(kelebek.replace(/\n/g, ' ')) === 'URUN-DEGIL', ozet(kelebek.replace(/\n/g, ' ')));
    check('★ S1 "Kelebek Vana, DN150 / … / Montaj Biçimi : Dik" → urun, vana', ozet(kelebek) === 'vana', ozet(kelebek));
    check('★ S1b "Çek Vana / Giriş – Çıkış : DN 250 / Montaj Biçimi : …" → urun, vana', ozet('Çek Vana\nGiriş – Çıkış : DN 250\nMontaj Biçimi : Dik veya Yatay') === 'vana');

    // ══ S2 · aile ILK SATIRDAN (nitelik satirindaki isim kazanmaz) ═══════════
    const hedef: Array<[string, string]> = [
      ['6"-DN150 Kollektör (2xDN100+3xDN80+1xDN40+1xDN15)\nSiyah Dikişli Borudan İmal Edilecek', 'kolektor'],
      ['Deneme ve Gider Vanası, DN32 veya DN50 K=240\nGözetleme Camı : Vardır\nManometre : 0-20 Bar, Gliserinli ve Kesme Vanalı', 'vana'],
      // gercek e2e hucresi (kisaltilmis): son satirdaki "Hava Atma Ventili" tam metni vanaya cekiyordu
      ['Dizel Motorlu Yangın Pompası \r\nTürü : Tek Kademeli, Yatay, Ayrılabilir Gövdeli (Horizontal Split-Case)\r\nAnma Debisi (Rated Flow) : 2500 gpm\r\nİçindekiler : Yakıt Deposu, Egzoz, 2 Tk. Kuru Tip Akü, Motor Soğutma Hattı,\r\nManometreler, Hava Atma Ventili,', 'pompa'],
    ];
    for (const [s, beklenen] of hedef) {
      const tam = ozet(s.replace(/\r?\n/g, ' '));
      check(`FIXTURE KANITI: "${s.split(/\r?\n/)[0].slice(0, 30)}" tek satira cevrilince ${beklenen} DEGIL (${tam})`, tam !== beklenen, tam);
      check(`★ S2 "${s.split(/\r?\n/)[0].slice(0, 40)}" → ${beklenen}`, ozet(s) === beklenen, ozet(s));
    }

    // ══ S3 · aile kelimeleri ailenin geldigi satirdan; T → te ilk satirda ══
    const kol = parseLine('6"-DN150 Kollektör (2xDN100)\nSiyah Dikişli Borudan İmal Edilecek', null);
    check('S3 kolektor satirinda aile kelimesi "kollektor" (tum belirtecler boruya cozulur, ilk satirinkiler kolektore)', js(kol.aileKelimeleri) === js(['kollektor']), js(kol.aileKelimeleri));
    const t = parseLine('T 1"\nMalzeme : Siyah Çelik Boru', null);
    check('S3b ilk satir yalniz "T" ise te: aile fitting, belirtec "te", aile kelimesi "te" (tam metin: boru)',
      t.familySlug === 'fitting' && t.tokens.includes('te') && js(t.aileKelimeleri) === js(['te']), js({ f: t.familySlug, t: t.tokens, ak: t.aileKelimeleri }));

    // ══ S4 · ilk satir PARANTEZ SOYULDUKTAN sonra alinir ══════════════════
    const aski = 'ASKILAMA EKİPMANLARI ( KELEPÇE, TİJ, U BOLT\nVS. )';
    check('FIXTURE KANITI: ham ilk satir (kapanmamis parantez) tek basina bir aile cozer', parseLine(aski.split('\n')[0], null).familySlug !== null, String(parseLine(aski.split('\n')[0], null).familySlug));
    check('S4 satir asan "( KELEPÇE, TİJ, U BOLT … VS. )" notu aile vermez', ozet(aski) === '∅', ozet(aski));

    // ══ S5 · ilk satir aile cozmezse aile ANAHTARSIZ govdeden ════════════
    check('S5 "… / Manometre : Vardır" anahtari aile vermez (eskisi manometre)', ozet('Köpük Yapıcı, Alçak Genleşmeli\nManometre : Vardır') === '∅', ozet('Köpük Yapıcı, Alçak Genleşmeli\nManometre : Vardır'));
    check('S5b "… / Montaj Biçimi : Yatay" anahtari ne hizmet ne "montaj" ailesi', ozet('Su Püskürtme Memesi, (Spray Nozzle)\nTürü : Açık\nMontaj Biçimi : Yatay') === '∅');

    // ══ S6 · ilk satir AYRICA hizmet taramasina girer (kod incelemesi M1) ════
    const imalat = 'Hidrant Koruyucu İmalatı (Yeni Planlanan)\nTürü : Yer Üstü\nMontaj Yeri : Hidrant Yakınına';
    check('FIXTURE KANITI: S6 ayni ilk satir TEK BASINA hizmet (S5: satir sonunda "İmalatı")', ozet(imalat.split('\n')[0]) === 'URUN-DEGIL', ozet(imalat.split('\n')[0]));
    check('★ S6 "Hidrant Koruyucu İmalatı ⏎ Türü … ⏎ Montaj Yeri …" tek satirdaki gibi hizmet (hidrant degil)', ozet(imalat) === 'URUN-DEGIL', ozet(imalat));

    // ══ S7 · baglacla biten ilk satir yarimdir ══════════════════════════
    const icin = 'Yangın Dolabı İçin\nYangın Hortumu 25 mm';
    check('FIXTURE KANITI: S7 ilk satir tek basina yangin-dolabi', parseLine(icin.split('\n')[0], null).familySlug === 'yangin-dolabi', String(parseLine(icin.split('\n')[0], null).familySlug));
    check('★ S7 "Yangın Dolabı İçin ⏎ Yangın Hortumu 25 mm" → hortum (aile govdeden)', ozet(icin) === 'hortum', ozet(icin));

    // ══ S8 · ZAYIF KAYNAK: ilk satirin ailesi kelime ici ya da yer adindan geliyorsa atlanir ══
    const zayif: Array<[string, string, string]> = [
      ['PK-1: Standart Priz Kombinasyon Kutusu IP65\r\n1 adet 25A 3P+N+E CEE tip trifaze priz (eğik yaylı kapaklı)\r\n1 adet 3x25A 6kA sigorta', 'kombi', 'sigorta'],
      ['KLEMENS; WAGO,WEIDMULLER, PHOENIX CONTACT,\r\nKABLO; NEXANS, \r\nPRYSMIAN,\r\nBORU-BUAT; CANLAR, ENSMET, İPEK, ELSU,\r\nELECTROLINE,\r\nTURKUAZ', 'conta', 'boru'],
      ['Pompa Odası Gider Sistemi \r\nPompa odasına çizimlerde belirtildiği şekilde yer süzgeci kurulumlarıyla en az %4 eğimle\r\ndoğal cazibeyle oda dışına atılması', 'pompa', 'suzgec'],
      ['POMPA DAİRESİ\nKelebek Vanalar DN 25', 'pompa', 'vana'],
    ];
    for (const [s, ilkAile, beklenen] of zayif) {
      const ilk = s.split(/\r?\n/)[0];
      check(`FIXTURE KANITI: S8 "${ilk.slice(0, 30)}" ilk satir tek basina ${ilkAile}`, parseLine(ilk, null).familySlug === ilkAile, String(parseLine(ilk, null).familySlug));
      check(`★ S8 "${ilk.slice(0, 40)}" ilk satir atlanir → ${beklenen} (tam metin)`, ozet(s) === beklenen, ozet(s));
    }
    const hidrofor = 'Hidrofor Odası Dalgıç Pompası\nÇıkış : Vana Bağlantılı';
    check('FIXTURE KANITI: K7 govdenin tamami baska aileye (vana) cozulur', ozet('Hidrofor Odası Dalgıç Pompası Vana Bağlantılı') === 'vana', ozet('Hidrofor Odası Dalgıç Pompası Vana Bağlantılı'));
    check('K7 ilk satirda yer adi var ama aile BAS ISIMDEN: "Hidrofor Odası Dalgıç Pompası ⏎ Çıkış : Vana Bağlantılı" → pompa (ilk satir kalir)',
      ozet(hidrofor) === 'pompa', ozet(hidrofor));
    check('K8 cozucu DEGISMEDI: tek satirli "Exproof Kombine Dedektör" bugunku ailesinde (kombi; urun tarafiyla ortak — ayri is: dedektor ailesi)',
      ozet('Exproof Kombine Dedektör (Optik+Isı)') === 'kombi', ozet('Exproof Kombine Dedektör (Optik+Isı)'));

    // ══ B · BILINEN SINIR (kod incelemesi M2; kulliyat ve canli 0) ════════
    check('B1 BILINEN SINIR: baglacsiz satir sarmasi "Boru ⏎ Kelepçesi 1\\"" ilk satirin ailesi (boru) — duzeltilirse bu satiri guncelle',
      ozet('Boru\nKelepçesi 1"') === 'boru', ozet('Boru\nKelepçesi 1"'));

    // ══ K · karsi ════════════════════════════════════════════════════════
    check('K1 kapsam notu ("… montaj ve sarf malzemeleri dahil", anahtar DEGIL) hizmet kalir',
      ozet('PLASTİK BORULAR, METAL BORULAR, BUATLAR\nHer türlü aksesuar, montaj ve sarf malzemeleri dahil çalışır vaziyette teslim edilmesi') === 'URUN-DEGIL');
    const tank = 'Dikey Dengelenmiş Basınçlı Diyafram Tankı – 3000 L\nKullanım : Köpüklü Depolama\nMalzeme : Karbon Çelik, Vana Bağlantılı';
    check('FIXTURE KANITI: K2 ilk satir tek basina aile cozmuyor', parseLine(tank.split('\n')[0], null).familySlug === null);
    check('K2 ilk satir aile cozmuyorsa aile govdenin tamamindan (anahtarsiz; bu metinde tam metinle ayni)', ozet(tank) === ozet(tank.replace(/\n/g, ' ')), `${ozet(tank)} / ${ozet(tank.replace(/\n/g, ' '))}`);
    check('K3 tek satirli metin degismez ("… Montaj Biçimi : Dik" hizmet kalir)', ozet('Kelebek Vana DN150 Montaj Biçimi : Dik') === 'URUN-DEGIL');
    check('K4 ilk satirin KENDISI hizmetse hizmet kalir (anahtar yalniz 2. satirdan soyulur)', ozet('Boru Montaj Bedeli\nÇap : DN 50') === 'URUN-DEGIL');
    check('K5 nitelik DEGERINDEKI hizmet kelimesi hizmet kalir ("Kapsam : montaj dahil")', ozet('Kelebek Vana, DN150\nKapsam : montaj ve sarf dahil') === 'URUN-DEGIL');
    check('K6 uzun cumlenin icindeki ":" anahtar degildir (40 karakter siniri) — kapsam notu hizmet kalir',
      ozet('Kelebek Vana, DN150\nHer türlü aksesuar, montaj ve sarf malzemeleri dahil olacaktır, not: teslim') === 'URUN-DEGIL');
  } finally { console.warn = warn; }

  // ══ M · motor: sartname satiri artik urun arar ═══════════════════════
  let k = 0;
  const urun = (ad: string, cap: string | null, price: number) => {
    k++;
    const idx = buildProductIndex({ ad, cap, cins: null, price } as ProductColumns);
    return { id: `lib-${k}`, materialId: null, material: null, materialName: idx.displayName, listPrice: price, customPrice: null, discountRate: 0, currency: 'TRY',
      productIndexId: `pi-${k}`, sortOrder: k, brand: { id: 'b1', name: 'B1' },
      product: { ...idx, id: `pi-${k}`, ad, cins: null, baglanti: null, capRaw: cap, kategori: null, boyMm: null, urunKodu: null, sheetName: null, price, birim: null } };
  };
  const kutuphane = [urun('Kelebek Vana', 'DN150', 1200), urun('Küresel Vana', 'DN150', 900)];
  // ISCILIK IKIZI (kod incelemesi L6): bulkMatchLabor da ayni parseLine yolundan gecer
  const iscilik = (name: string, unitPrice: number) => ({
    id: `lp|${name}`, unitPrice, discountRate: 0, unit: 'Ad', currency: 'TRY', firma: null,
    laborItem: { id: `li|${name}`, name, unit: 'Ad', unitPrice, discipline: 'mechanical', category: null, description: null,
      cins: null, baglanti: null, capRaw: null, boyMm: null, not: null, adSlug: null, adBucket: null, adTokens: [],
      cinsNorm: null, cinsTokens: [], baglantiNorm: null, baglantiTokens: [], sizeClass: 'unknown', capTags: [],
      capNorm: null, boyTag: null, displayName: null, indexVersion: 0, belirsiz: false },
  });
  const iscilikHavuzu = [iscilik('Kelebek Vana', 250), iscilik('Küresel Vana', 150)];
  const prisma: any = {
    userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? [] : kutuphane) },
    laborPrice: { findMany: async (a: any) => (a?.where?.firmaId ? iscilikHavuzu : []) },
    brand: { findUnique: async () => ({ name: 'B1' }) },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => undefined },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    user: { findUnique: async () => ({ firmaId: 'u1' }) },
  };
  const svc = new MatchingService(prisma, new TerminologyService(prisma), { getRates: async () => ({ usdTry: 40, eurTry: 48, source: 'tcmb' }) } as any);
  const satir = 'Kelebek Vana, DN150\nTürü : Yivli veya Wafer\nMontaj Biçimi : Dik veya Yatay';
  const a = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  let r: any; let ri: any;
  try {
    r = (await svc.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'b1', [satir]))[satir];
    ri = (await svc.bulkMatchLabor({ userId: 'u1', firmaId: 'u1' }, 'u1', [satir]))[satir];
  } finally { Object.assign(console, a); }
  const adaylar: string[] = [r?.matchedName, ...(r?.candidates ?? []).map((c: any) => c.materialName)].filter(Boolean).map(String);
  check('★ M motor: sartname satiri "urun degil" DONMEZ ve "Kelebek Vana" adayi/eslesmesi gelir', !r?.notProduct && adaylar.some((x) => /Kelebek Vana/.test(x)), js({ notProduct: r?.notProduct, adaylar }));
  const iAdaylar: string[] = [ri?.matchedName, ...(ri?.candidates ?? []).map((c: any) => c.materialName)].filter(Boolean).map(String);
  check('★ M2 iscilik ikizi: ayni satir iscilikte de "urun degil" DONMEZ ve "Kelebek Vana" iscilik kalemi gelir', !ri?.notProduct && iAdaylar.some((x) => /Kelebek Vana/.test(x)), js({ notProduct: ri?.notProduct, iAdaylar }));

  console.log(`\n${'='.repeat(60)}\nSARTNAME ILK SATIR (P2): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
