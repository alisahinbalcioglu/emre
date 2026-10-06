/**
 * SONDAKI SIFATLI URUN SORU LISTESININ SONUNDA (P2 6a-sira, 06.10 — canli v7 olcumu).
 *
 * 6a ("sondaki -li/-lu sifati bas isim degildir") + INDEX 21 sonrasi canlida 153
 * "… Vana … Aktüatörlü" urunu vana ailesine gecer. Fiyat davranisi DEGISMEZ
 * (v6: 2.053 sorguda dogan/kaybolan/degisen 0) ama vana sorularina ek aday olurlar.
 * "Ust kume adlar sona" kurali yalniz TAM AD bulundugunda calisir; urun adi satirdan
 * FAZLA token tasiyinca (adinda cap vb.) alt kume yolu havuz sirasini korur →
 * aktuatorlu vanalar duz vanalarla KARISIK listelenir. Canli v7: 70 canli vana
 * sorusunun 51'inde karisik, soru basina ortalama ~23 aktuatorlu aday.
 *
 * Kural: soru listesinde (iki+ aday — tek aday yolu hic DEGISMEZ) adinin SONUNDAKI
 * sifati (-li/-lu; arkasinda olcu olabilir) satirin ANMADIGI urunler listenin
 * SONUNA gider; elenmez, kalanlarin gorelı sirasi korunur.
 */
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { parseLine } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { runQuery } from '../src/ozellik/eslestirme/matching/index/query-engine';
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

let n = 0;
const satir = (ad: string, cap: string | null, price: number, kategori: string | null = null) => {
  n++;
  const idx = buildProductIndex({ ad, cap, cins: null, price, kategori } as ProductColumns);
  return { id: `r${n}`, listPrice: price, customPrice: null, discountRate: 0, currency: 'TRY',
    urun: { ...idx, ad, cins: null, baglanti: null, capRaw: cap, kategori, boyMm: null, price } } as any;
};
/** Sorgu sonucunun aday adlari, SIRASIYLA. */
function sira(line: string, havuz: any[]): { kind: string; adlar: string[] } {
  const o: any = runQuery(parseLine(line, null), havuz);
  return { kind: o.kind, adlar: (o.rows ?? (o.row ? [o.row] : [])).map((r: any) => r.urun.ad) };
}
const aktuatorlu = (a: string) => /Aktüatörlü/.test(a);
/** Sifatli adaylarin HEPSI duzlerden sonra mi? (en az bir duz + en az bir sifatli gerekir) */
const sonda = (adlar: string[], sifatli: (a: string) => boolean) => {
  const b = adlar.map(sifatli);
  return b.includes(true) && b.includes(false) && b.indexOf(true) > b.lastIndexOf(false);
};

async function main() {
  const warn = console.warn; console.warn = () => {};
  try {
    // ══ T1 · alt kume yolu (urun adinda cap → tam ad yok), havuz sirasi KARISIK ══
    const h1 = [
      satir('Kelebek Vana DN100 Aktüatörlü', 'DN100', 4100), satir('Kelebek Vana DN100', 'DN100', 900),
      satir('Kelebek Vana DN100 Elektrik Aktüatörlü', 'DN100', 4300), satir('Kelebek Vana DN100 Lug Tip', 'DN100', 950),
    ];
    const s1 = sira('Kelebek Vana DN100', h1);
    check('FIXTURE KANITI: T1 soru, 4 aday (aktuatorlu ilk sirada havuzda)', s1.kind === 'ask' && s1.adlar.length === 4, js(s1));
    check('★ T1 aktuatorlu vanalar SONDA, duzlerin gorelı sirasi korunur', sonda(s1.adlar, aktuatorlu)
      && js(s1.adlar.filter((a) => !aktuatorlu(a))) === js(['Kelebek Vana DN100', 'Kelebek Vana DN100 Lug Tip'])
      && js(s1.adlar.filter(aktuatorlu)) === js(['Kelebek Vana DN100 Aktüatörlü', 'Kelebek Vana DN100 Elektrik Aktüatörlü']), js(s1.adlar));

    // ══ T2 · sifatin arkasinda olcu kuyrugu: "… Aktüatörlü DN100" de sondaki sifattir ══
    const h2 = [satir('Kelebek Vana Aktüatörlü DN80', 'DN80', 3500), satir('Kelebek Vana DN80', 'DN80', 700)];
    const s2 = sira('Kelebek Vana DN80', h2);
    check('★ T2 olcu kuyruklu sifatli urun de SONDA', s2.kind === 'ask' && sonda(s2.adlar, aktuatorlu), js(s2));

    // ══ T2c · 6a ile AYNI "sondaki" tanimi: kisa kelime ("ve") yok sayilir (canli v8: 30 soru karisik kaldi) ══
    // 6a "… Aktüatörlü ve Redüktörlü"yu sondaki sayip aileyi vana yapar; siralama "ve"de durursa yalniz
    // "Redüktörlü"yu gorur (urun turu degil) → aktuatorlu vana duzlerin ONUNDE kalirdi.
    const h2c = [satir('Kelebek Vana DN80 Aktüatörlü ve Redüktörlü', 'DN80', 3900), satir('Kelebek Vana DN80', 'DN80', 700)];
    const s2c = sira('Kelebek Vana DN80', h2c);
    check('★ T2c "… Aktüatörlü ve Redüktörlü" SONDA (kisa "ve" sondaki sifati kesmez)', s2c.kind === 'ask' && js(s2c.adlar) === js(['Kelebek Vana DN80', 'Kelebek Vana DN80 Aktüatörlü ve Redüktörlü']), js(s2c));

    // ══ T2b · parantez icindeki urun turu sifati da sondaki sifattir: "… (Aktüatörlü)" ══
    const h2b = [satir('Kelebek Vana DN100 (Aktüatörlü)', 'DN100', 4100), satir('Kelebek Vana DN100', 'DN100', 900)];
    const s2b = sira('Kelebek Vana DN100', h2b);
    check('★ T2b "Kelebek Vana DN100 (Aktüatörlü)" de SONDA', s2b.kind === 'ask' && js(s2b.adlar) === js(['Kelebek Vana DN100', 'Kelebek Vana DN100 (Aktüatörlü)']), js(s2b));

    // ══ T3 · karsi: satir sifati ANIYORSA siralama degismez (aradigi urun) ══
    const s3 = sira('Aktüatörlü Kelebek Vana DN100', [...h1, satir('Kelebek Vana DN100 Pnömatik Aktüatörlü', 'DN100', 3900)]);
    check('T3 karsi: "Aktüatörlü …" satirinda aktuatorlu adaylar one alinmaz/sona itilmez (havuz sirasi)',
      js(s3.adlar) === js(['Kelebek Vana DN100 Aktüatörlü', 'Kelebek Vana DN100 Elektrik Aktüatörlü', 'Kelebek Vana DN100 Pnömatik Aktüatörlü']), js(s3));

    const s3b = sira('Kelebek Vana DN100 (Aktüatörlü)', h1);
    check('T3b karsi: sifati PARANTEZ icinde anan satir — parantez daraltmasi yalniz aktuatorlu adaylari birakir, havuz sirasinda',
      js(s3b.adlar) === js(['Kelebek Vana DN100 Aktüatörlü', 'Kelebek Vana DN100 Elektrik Aktüatörlü']), js(s3b));

    // ══ T4 · karsi: sifat SONDA DEGILSE (onde ya da arkasinda kelime) siralama degismez ══
    const h4 = [satir('Dişli Küresel Vana DN50', 'DN50', 300), satir('Küresel Vana Kollu Tip DN50', 'DN50', 280), satir('Küresel Vana DN50', 'DN50', 250)];
    const s4 = sira('Küresel Vana DN50', h4);
    check('FIXTURE KANITI: T4 soru, 3 aday', s4.kind === 'ask' && s4.adlar.length === 3, js(s4));
    check('T4 karsi: ondeki sifat ("Dişli …") ve arkasinda kelime olan ("… Kollu Tip") yerinde kalir', js(s4.adlar) === js(h4.map((r: any) => r.urun.ad)), js(s4.adlar));

    // ══ T4b · karsi: urun turu OLMAYAN parantezli sifat ("(Kafalı)") yerinde kalir ══
    // Pimtas once/sonra yakaladi (genel kuralda): "(Kafalı)" isteyen satirin aradigi urun sona itiliyordu.
    const h4b = [satir('Somunlu Ağır Yük Kelepçesi (Kafalı)', '125 mm', 6.27), satir('Somunlu Ağır Yük Kelepçesi (Metal)', '125 mm', 4.16)];
    for (const l of ['Somunlu Ağır Yük Kelepçesi (Kafalı) 125 mm', 'Somunlu Ağır Yük Kelepçesi 125 mm']) {
      const s4b = sira(l, h4b);
      check(`T4b karsi: "${l}" — parantezli sifatli urun yerinde (ilk aday "(Kafalı)")`, s4b.adlar[0] === 'Somunlu Ağır Yük Kelepçesi (Kafalı)', js(s4b));
    }

    // ══ T4c · karsi: kisa isim "Te" ve harfli "F/F/F" olcu kuyrugu DEGIL (Pimtas once/sonra) ══
    const h4c = [satir('UH-PVC Tek Taraf İçten Dişli Te', '32 mm', 0.85), satir('UH-PVC Yapıştırma Muflu İnegal Te', '32 mm', 0.83), satir('U-PVC Geçme Muflu Te F/F/F', '32 mm', 1.2)];
    const s4c = sira('Te 32 mm', h4c);
    check('FIXTURE KANITI: T4c soru, 3 aday', s4c.kind === 'ask' && s4c.adlar.length === 3, js(s4c));
    check('T4c karsi: "… Dişli Te" ve "… Muflu Te F/F/F" yerinde (sifat sonda degil)', js(s4c.adlar) === js(h4c.map((r: any) => r.urun.ad)), js(s4c.adlar));
    // urun TURU sifati + kisa isim: 6a gibi 2 harfli "Te" yok sayilir → "Redüksiyonlu Te" (redüksiyonlu
    // varyant) duz te'nin ARKASINA gecer; urun turu olmayan "… Dişli Te" (T4c) yerinde kalir.
    const h4e = [satir('U-PVC Redüksiyonlu Te', '32 mm', 1.1), satir('U-PVC Te', '32 mm', 0.9)];
    const s4e = sira('Te 32 mm', h4e);
    check('FIXTURE KANITI: T4e soru, 2 aday', s4e.kind === 'ask' && s4e.adlar.length === 2, js(s4e));
    check('T4e "U-PVC Redüksiyonlu Te" duz te\'nin arkasinda (6a tanimi: 2 harfli "Te" yok sayilir)', js(s4e.adlar) === js(['U-PVC Te', 'U-PVC Redüksiyonlu Te']), js(s4e.adlar));

    // ══ T4d · karsi: BAGLANTI sifati ("… İçten Dişli") urun turu degil → yerinde kalir ══
    // Genel kural Pimtas kulliyatinda 36 soruda ilk adayi yalniz bu varyantlari geri iterek degistiriyordu.
    const h4d = [satir('U-PVC Küresel Su Vanası Tek Taraf İçten Dişli', '50 mm', 9.5), satir('U-PVC Yapıştırma Muflu Küresel Su Vanası', '50 mm', 8.2)];
    const s4d = sira("1 1/2'' Küresel Vana", h4d);
    check('FIXTURE KANITI: T4d soru, 2 aday', s4d.kind === 'ask' && s4d.adlar.length === 2, js(s4d));
    check('T4d karsi: "… Tek Taraf İçten Dişli" ilk sirada kalir (baglanti sifati paket urun degil)', js(s4d.adlar) === js(h4d.map((r: any) => r.urun.ad)), js(s4d.adlar));

    // ══ T4g · karsi: urun turu sifati ONDE ("Aktüatörlü Kelebek Vana") — 6a oncesi de vanaydi, yeri degismez ══
    const h4g = [satir('Aktüatörlü Kelebek Vana DN100', 'DN100', 4000), satir('Kelebek Vana DN100', 'DN100', 900)];
    const s4g = sira('Kelebek Vana DN100', h4g);
    check('FIXTURE KANITI: T4g soru, 2 aday', s4g.kind === 'ask' && s4g.adlar.length === 2, js(s4g));
    check('T4g karsi: sifati ONDE olan urun yerinde (zincir ilk sifat-disi kelimede kesilir)', js(s4g.adlar) === js(h4g.map((r: any) => r.urun.ad)), js(s4g.adlar));

    // ══ T7 · ailesi KATEGORIDEN gelen urun (canli v11: 30 aday) — kategorinin sondaki urun turu sifati sayilir ══
    // Ad tek basina cozulmez ("Kelebek Kulaklı"); 6a aileyi "ad + kategori" metninde ("… Vana Aktüatörlü") vana yapar.
    const h7 = [satir('Kelebek Kulaklı', 'DN100', 3000, 'Vana Aktüatörlü'), satir('Kelebek Vana DN100', 'DN100', 900)];
    check('FIXTURE KANITI: T7 kategori urunu vana ailesinde ve aileZayif', h7[0].urun.adSlug === 'vana' && h7[0].urun.aileZayif === true, js({ aile: h7[0].urun.adSlug, zayif: h7[0].urun.aileZayif }));
    const s7 = sira('Kelebek Vana DN100', h7);
    check('★ T7 kategorisi "… Aktüatörlü" olan (aileZayif) urun SONDA', s7.kind === 'ask' && js(s7.adlar) === js(['Kelebek Vana DN100', 'Kelebek Kulaklı']), js(s7));
    // karsi: kategorinin sonunda sifat yok → yerinde
    const h7b = [satir('Kelebek Kulaklı', 'DN100', 3000, 'Vanalar'), satir('Kelebek Vana DN100', 'DN100', 900)];
    const s7b = sira('Kelebek Vana DN100', h7b);
    check('FIXTURE KANITI: T7b kategori urunu vana ailesinde ve aileZayif', h7b[0].urun.adSlug === 'vana' && h7b[0].urun.aileZayif === true, js({ aile: h7b[0].urun.adSlug, zayif: h7b[0].urun.aileZayif }));
    check('T7b karsi: kategorisi sifatsiz ("Vanalar") urun yerinde', js(s7b.adlar) === js(h7b.map((r: any) => r.urun.ad)), js(s7b));
    // karsi: ailesi ADDAN gelen urunde kategori yok sayilir
    const h7c = [satir('Kelebek Vana DN100 Lug Tip', 'DN100', 950, 'Vana Aktüatörlü'), satir('Kelebek Vana DN100', 'DN100', 900)];
    const s7c = sira('Kelebek Vana DN100', h7c);
    check('FIXTURE KANITI: T7c urun ailesi addan (aileZayif degil), 2 aday', h7c[0].urun.aileZayif === false && s7c.adlar.length === 2, js({ zayif: h7c[0].urun.aileZayif, s7c }));
    check('T7c karsi: ailesi ADDAN gelen urunde kategorinin sifati sayilmaz — yerinde', js(s7c.adlar) === js(h7c.map((r: any) => r.urun.ad)), js(s7c.adlar));

    // ══ T5 · karsi: TEK aday yolu dokunulmaz (fiyat davranisi) ══
    const s5 = sira('Kelebek Vana', [satir('Kelebek Vana', 'DN100', 900), satir('Kelebek Vana Aktüatörlü', 'DN100', 4100)].slice(0, 1));
    check('T5 karsi: tek aday otomatik kalir', s5.kind === 'single' && js(s5.adlar) === js(['Kelebek Vana']), js(s5));
  } finally { console.warn = warn; }

  // ══ T6 · motor: soru listesi (MatchResult.candidates) ayni sirayi tasir ══
  let k = 0;
  const urun = (ad: string, cap: string | null, price: number) => {
    k++;
    const idx = buildProductIndex({ ad, cap, cins: null, price } as ProductColumns);
    return { id: `lib-${k}`, materialId: null, material: null, materialName: idx.displayName, listPrice: price, customPrice: null, discountRate: 0, currency: 'TRY',
      productIndexId: `pi-${k}`, sortOrder: k, brand: { id: 'b1', name: 'B1' },
      product: { ...idx, id: `pi-${k}`, ad, cins: null, baglanti: null, capRaw: cap, kategori: null, boyMm: null, urunKodu: null, sheetName: null, price, birim: null } };
  };
  const kutuphane = [urun('Kelebek Vana DN100 Aktüatörlü', 'DN100', 4100), urun('Kelebek Vana DN100', 'DN100', 900), urun('Kelebek Vana DN100 Lug Tip', 'DN100', 950)];
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
  let r: any;
  try { r = (await svc.bulkMatch({ userId: 'u1', firmaId: 'u1' }, 'b1', ['Kelebek Vana DN100']))['Kelebek Vana DN100']; } finally { Object.assign(console, a); }
  const adaylar: string[] = (r?.candidates ?? []).map((c: any) => String(c.materialName ?? ''));
  check('FIXTURE KANITI: T6 soru (fiyat yazilmaz), 3 aday', !(r?.netPrice > 0) && adaylar.length === 3, js({ net: r?.netPrice, adaylar }));
  check('★ T6 motor soru listesinde aktuatorlu vana SONDA', sonda(adaylar, aktuatorlu), js(adaylar));

  console.log(`\n${'='.repeat(60)}\nSIFAT SIRASI (P2 6a-sira): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
