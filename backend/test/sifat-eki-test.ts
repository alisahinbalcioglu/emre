/**
 * SIFAT EKI BAS ISIM DEGILDIR (P2 6a, 06.10 — canli bulgu).
 *
 * Olculen kusur: aile cozucu (product-index `basIsimAilesi`) metni sondan-parcalara
 * boler, en kisa cozulen parcada durur. Parca denetimindeki iki cozucu GEVSEK:
 * TYPE_PATTERNS regex'i (/hortum/, /vana/, /manson/ …) ve sozluk "normalize metin
 * ICERIR" eslesmesi kelimenin ICINI de yakalar. "-li/-lu" sifati ("Hortumlu" =
 * hortumu olan) boylece BAS ISIM sayiliyordu:
 *   "Yangın Dolabı 1'' - 30 m Hortumlu - 200 lt/dk" → aile 'hortum'
 * Canli (06.10, v4 olcumu): 8 gercek teklif satiri bu bicimde, hicbiri
 * yangin-dolabi'ye cozulmuyor; motor satira tek aday olarak "Yangın Hortumu"
 * oneriyordu (yanlis urun onerisi; otomatik yazim yok).
 *
 * Kural (YEDEKLI varyant, koordinator onayi 06.10; "sondaki sifat" daraltmasi
 * olcumle): eslesmenin bittigi kelimenin KALANI yalniz sifat eki ise (-li/-lu,
 * onunde cogul olabilir) VE sagda anlamli kelime yoksa o eslesme bas isim
 * DEGILDIR — sifat soldaki kalemi niteler. Sagda kelime varsa sifat ONU niteler
 * ("Kanala Montajlı G.Hatlı İkili Priz Sortisi"): sola gecmek 'kanal' veriyor,
 * aile kilidi dogru "Priz Sortisi" adayini dusuruyordu (6 kulliyat satiri,
 * olculdu) → eski sonuc kalir. Reddedilen eslesme ELENMEZ, SONA kalir: hicbir
 * parca kabul edilmezse ESKI sonuc doner ("taban yuzey siralar, elemez" dersi).
 * Elemek "Redüksiyonlu Adaptör"u (Pimtas 7 urun) fitting ailesinden dusururdu —
 * "Adaptör" sozlukte yok (olculdu).
 */
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { buildProductIndex, resolveFamily, INDEX_VERSION, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { extractMaterialTypeDetayli } from '../src/ozellik/eslestirme/matching/normalizer';
import { resolveAdDetayli } from '../src/ozellik/eslestirme/matching/ad-resolver';
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
const aile = (s: string) => parseLine(s, null).familySlug;

let n = 0;
function urun(ad: string, cap: string | null, price: number) {
  n++;
  const idx = buildProductIndex({ ad, cap, cins: null, price } as ProductColumns);
  return { id: `lib-${n}`, materialId: null, material: null, materialName: idx.displayName, listPrice: price, customPrice: null,
    discountRate: 0, currency: 'TRY', productIndexId: `pi-${n}`, brand: { id: 'b1', name: 'B1' },
    product: { ...idx, id: `pi-${n}`, ad, cins: null, baglanti: null, capRaw: cap, kategori: null, boyMm: null, urunKodu: null, sheetName: null, price, birim: null } };
}
async function esle(kutuphane: any[], satirlar: string[]): Promise<Record<string, any>> {
  const prisma: any = {
    userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? [] : kutuphane) },
    brand: { findUnique: async () => ({ name: 'B1' }) },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => undefined },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    user: { findUnique: async () => ({ firmaId: 'u1' }) },
  };
  const svc = new MatchingService(prisma, new TerminologyService(prisma), { getRates: async () => ({ usdTry: 40, eurTry: 48, source: 'tcmb' }) } as any);
  const a = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try { return await svc.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'b1', satirlar); } finally { Object.assign(console, a); }
}

async function main() {
  const warn = console.warn; console.warn = () => {};
  try {
    // ══ FIXTURE KANITI · iki cozucu yolu da sifat ekli kelimeyi yakaliyor ═════
    check('FIXTURE KANITI: regex yolu — "hortumlu" icinde /hortum/ tutar', extractMaterialTypeDetayli('hortumlu')?.type === 'hortum', js(extractMaterialTypeDetayli('hortumlu')));
    check('FIXTURE KANITI: sozluk yolu — "ayar damperli": regex tutmaz, sozluk "damper" tutar',
      !extractMaterialTypeDetayli('ayar damperli') && resolveAdDetayli('ayar damperli')?.slug === 'damper', js([extractMaterialTypeDetayli('ayar damperli'), resolveAdDetayli('ayar damperli')]));

    // ══ S1 · sifat eki bas isim degil → asil isim kazanir ══════════════════
    const hedef: Array<[string, string]> = [
      ["Yangın Dolabı 1''- 30 m Hortumlu - 200 lt/dk", 'yangin-dolabi'],              // regex yolu (canli 8 satir)
      ["Köpüklü Yangın Dolabı 1''- 30 m Hortumlu - 200 lt/dk", 'yangin-dolabi'],
      ['Ç.S.K. EMİŞ ve ÜFLEME MENFEZİ - Zıt kanatlı ayar damperli', 'menfez'],     // sozluk yolu
      ['Manometre (0-16bar) Basınç tahliye vanalı', 'manometre'],
      ['Yangın Dolabı Sprinklerli', 'yangin-dolabi'],                                 // cogul + sifat (-lerli)
      ['Yangın Dolabı Vanalı Hortumlu', 'yangin-dolabi'],                             // art arda iki sifat
    ];
    for (const [s, beklenen] of hedef) check(`★ S1 "${s.slice(0, 48)}" → ${beklenen}`, aile(s) === beklenen, `${aile(s)}`);
    const urunAile = (ad: string) => buildProductIndex({ ad, cap: null, cins: null, price: 1 } as ProductColumns).adSlug;
    check('★ S1b urun tarafi ayni kural: "Yangın Dolabı Camlı Hortumlu" → yangin-dolabi', urunAile('Yangın Dolabı Camlı Hortumlu') === 'yangin-dolabi', urunAile('Yangın Dolabı Camlı Hortumlu'));
    check('★ S1c parantez ici sondaki sifat (urun adi): "Kanal Tipi Taze Hava Fanı ( DX BATARYALI )" → fan (onceden armatur)',
      urunAile('Tip : Kanal Tipi Taze Hava Fanı ( DX BATARYALI )') === 'fan', urunAile('Tip : Kanal Tipi Taze Hava Fanı ( DX BATARYALI )'));

    // ══ S2c · sifatin SAGINDA anlamli kelime var → sifat onu niteler, ESKI sonuc ═══
    const sagdaKelime: Array<[string, string]> = [
      ['Parapet Kanala Montajlı G.Hatlı İkili Priz Sortisi', 'montaj'],             // 'kanal'a GECMEZ
      ['- Yer üstü hortum bağlantı ağızları için kolektör ve manşonlu kaynak imalatı,', 'fitting'],
    ];
    for (const [s, beklenen] of sagdaKelime) check(`★ S2c sagda kelime "${s.slice(0, 48)}" → ${beklenen} (degismez)`, aile(s) === beklenen, `${aile(s)}`);

    // ══ S2 · YEDEK: sifatsiz cozum yoksa ESKI sonuc (elemez) ═════════════════
    const yedek: Array<[string, string]> = [
      ['UH-PVC Tek Taraf İçten Dişli Redüksiyonlu Adaptör', 'fitting'],             // Pimtas 7 urunun bicimi
      ['RADYANT ISITICI Doğalgazlı, U borulu İkiz Tip Radyant Isıtıcı', 'boru'],
      ['FLEKS-İzolasyonlı', 'izolasyon'],
      ['Vanalı Hortumlu', 'hortum'],                                                  // EN KISA parcadaki eslesme (eski kural)
    ];
    for (const [s, beklenen] of yedek) check(`★ S2 yedek "${s.slice(0, 48)}" → ${beklenen} (degismez)`, aile(s) === beklenen, `${aile(s)}`);
    // Canli (v5, 06.10): 153 havuz urununun ailesi degisir — kayitli adSlug eski kalirsa satir yeni aileye
    // gecer, urun gecmez: surum artisi bayat satiri istekte yeniden kurar, yeniden indeksleme kalicilastirir.
    check('★ S1d urun ailesi degisir → INDEX_VERSION >= 21 (bayatlik kapisi)', (INDEX_VERSION as number) >= 21, String(INDEX_VERSION));
    check('★ S2b urun tarafi yedek: "Redüksiyonlu Adaptör" urunu fitting kalir',
      buildProductIndex({ ad: 'UH-PVC Çift Tarafı İçten Dişli Redüksiyonlu Adaptör', cap: null, cins: null, price: 1 } as ProductColumns).adSlug === 'fitting');

    // ══ S3 · karsi: sifat OLMAYAN ekler ve onde duran sifat etkilenmez ═══════
    const karsi: Array<[string, string]> = [
      ['Emniyet Ventili', 'vana'],          // kelime "li" ile biter ama kalan '' (eslesme tum kelime)
      ['Yangın Hortumu', 'hortum'],         // iyelik
      ['Hortumlar', 'hortum'],              // cogul
      ['Galvanizli Boru', 'boru'],          // sifat onde, isim sonda
      ['Siyah Kaynaklı Boru', 'boru'],
    ];
    for (const [s, beklenen] of karsi) check(`S3 karsi "${s}" → ${beklenen}`, aile(s) === beklenen && resolveFamily(s) === beklenen, `${aile(s)} / ${resolveFamily(s)}`);
  } finally { console.warn = warn; }

  // ══ S4 · motor: hortumlu yangin dolabi satirina hortum ONERILMEZ ═══════════
  const satir = "Yangın Dolabı 1''- 30 m Hortumlu - 200 lt/dk";
  const r = (await esle([urun('Yangın Dolabı', null, 2000), urun('Yangın Hortumu', '1"', 300)], [satir]))[satir];
  const adaylar: string[] = (r?.candidates ?? []).map((c: any) => String(c.materialName ?? ''));
  check('FIXTURE KANITI: S4 satir soru (otomatik yazim yok), en az bir aday', !(r?.netPrice > 0) && adaylar.length >= 1, js({ net: r?.netPrice, adaylar }));
  check('★ S4 aday "Yangın Dolabı", "Yangın Hortumu" DEGIL', adaylar.some((a) => /Dolab/.test(a)) && !adaylar.some((a) => /Hortum/.test(a)), js(adaylar));

  // ══ S5 · motor: sagda kelimeli sifat satiri dogru adayi KAYBETMEZ ═══════════
  const priz = 'Parapet Kanala Montajlı G.Hatlı İkili Priz Sortisi';
  const r5 = (await esle([urun('Parapet Kanal 100x50', null, 300), urun('Priz Sortisi', null, 120)], [priz]))[priz];
  const adaylar5: string[] = (r5?.candidates ?? []).map((c: any) => String(c.materialName ?? ''));
  check('★ S5 "…Montajlı … Priz Sortisi" adaylarinda "Priz Sortisi" kalir (aile kilidi kanal\'a daraltmaz)', adaylar5.some((a) => /Priz Sortisi/.test(a)), js(adaylar5));

  console.log(`\n${'='.repeat(60)}\nSIFAT EKI (P2 6a): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
