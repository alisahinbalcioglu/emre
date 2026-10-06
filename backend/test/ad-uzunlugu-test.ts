/**
 * AD UZUNLUGU HIZI (P2, 05.10.2026) — SONUC BIREBIR, IS SAYISI DUSUK.
 *
 * Olculen kusur: parseLine'in aileKelimeleri dongusu (line-parser) aile cozumunu
 * TOKEN BASINA kalan metnin tamamiyla yeniden kosuyordu; aile cozucu her
 * sondan-parcada `resolveAdDetayli` ile 305 desenin her birini metnin tamaminda
 * ariyordu. Gercek bir 1.475 karakterlik sartname adi (e2e kesif fikstürü) tek
 * basina ~0,7 sn — Nest'in tek is parcacigi o sure boyunca tum kiracilara kapali.
 *
 * Duzeltme (sonucu DEGISTIRMEZ):
 *   · ad-resolver ONEK KOVASI: yalniz ilk uc karakteri metinde gecen desenler,
 *     PATTERNS sirasiyla denenir (gecen desenin oneki de gecer).
 *   · product-index: sondan-parca artimli kurulur + cagri ici BELLEK
 *     (parca → denetim sonucu), line-parser'in dongusu bellegi paylasir.
 *
 * KAPI — sure ms ile DEGIL, deterministik IS SAYACIYLA olculur (kararsiz test
 * olmasin): sondan-parca denetimi (AILE_COZUCU_OLCUM) ve desen denemesi
 * (AD_COZUCU_OLCUM). Esdegerlik: bellekli aileKelimeleri ↔ belleksiz referans
 * dongu; onek suzgecli resolveAdDetayli ↔ suzgecsiz referans.
 * Bayt bayt genis olcum (gelistirme sirasinda, kapi disi): P3 3.125 + yerel
 * 3.850 + Pimtas 5.702 + sentetik 60 ad → tam LineQuery JSON 12.737/12.737 ayni.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseLine, resolveLineFamily } from '../src/ozellik/eslestirme/matching/index/line-parser';
import { AILE_COZUCU_OLCUM, resolveFamily, tokenize } from '../src/ozellik/eslestirme/matching/index/product-index';
import { resolveAdDetayli, resolveAdDetayliFiltresiz, sozlukKapsayan, AD_COZUCU_OLCUM } from '../src/ozellik/eslestirme/matching/ad-resolver';
import { AD_SOZLUGU, AD_ZENGINLESTIRME } from '../src/ozellik/eslestirme/matching/ad-cins-sozlugu';
import { normalizeText, extractMaterialTypeDetayli } from '../src/ozellik/eslestirme/matching/normalizer';
import { buildProductIndex, type ProductColumns } from '../src/ozellik/eslestirme/matching/index/product-index';
import { MatchingService, AD_AZAMI_UZUNLUK, sorguAdi } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx');

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const js = (x: unknown) => JSON.stringify(x);

/** e2e kesif fikstürlerindeki TUM metin hucreleri (cok satirli sartname hucreleri dahil). */
function fiksturMetinleri(): string[] {
  const FIX = path.join(__dirname, '..', '..', 'test-fixtures', 'e2e');
  const k = new Set<string>();
  for (const d of fs.readdirSync(FIX).filter((x) => /\.xls[xm]$/i.test(x))) {
    const wb = XLSX.readFile(path.join(FIX, d));
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      for (const adr of Object.keys(ws)) {
        if (adr[0] === '!') continue;
        const v = ws[adr]?.v;
        if (typeof v === 'string' && v.trim().length >= 3) k.add(v.trim());
      }
    }
  }
  return [...k];
}

/**
 * ESKI aile cozucu, BAGIMSIZ kopya (0d10b59 product-index `basIsimAilesi`):
 * her adimda `slice().join()` + onek suzgecsiz desen taramasi. Uretim kodunun
 * artimli parca + bellek + onek kovasi yolu BUNA karsi olculur — uretim
 * fonksiyonunu kendisiyle karsilastirmak kurulum hatasini gizlerdi.
 */
function basIsimEski(text: string): string | null {
  const tam = normalizeText(text);
  const kelimeler = tam.split(/\s+/).filter(Boolean);
  for (let i = kelimeler.length - 1; i >= 0; i--) {
    const parca = kelimeler.slice(i).join(' ');
    const ofset = tam.length - parca.length;
    const rx = extractMaterialTypeDetayli(parca);
    if (rx && rx.type !== 'diger') { const kap = sozlukKapsayan(tam, ofset + rx.index, ofset + rx.index + rx.length); return kap ? kap.slug : rx.type; }
    const dc = resolveAdDetayliFiltresiz(parca);
    if (dc) { const kap = sozlukKapsayan(tam, ofset + dc.index, ofset + dc.index + dc.desen.length); return kap ? kap.slug : dc.slug; }
  }
  return null;
}

/**
 * SIFAT EKI (6a, test:sifat-eki) referansi — uretimden BAGIMSIZ mekanizma: kabul
 * suzgeci yerine reddedilen eslesmenin SON harfi '#' ile maskelenir ve cozucu
 * (suzgecsiz) yeniden cagrilir; hicbir parca kabul edilmezse eski algoritma.
 * Sondaki sifat: kelimenin kalani yalniz -li/-lu (onunde cogul olabilir) ve
 * sagdaki 3+ harfli kelimelerin hepsi de -li/-lu ile biter.
 */
function sondakiSifatRef(metin: string, son: number): boolean {
  const sag = metin.slice(son);
  const kalan = (/^[\p{L}\p{N}]*/u.exec(sag) ?? [''])[0];
  if (!/^(?:l[ae]r)?l[iu]$/.test(kalan)) return false;
  return (sag.slice(kalan.length).match(/\p{L}{3,}/gu) ?? []).every((k) => /l[iu]$/.test(k));
}
const maskele = (s: string, son: number) => `${s.slice(0, son - 1)}#${s.slice(son)}`;
function parcaRef(parca: string): { index: number; uzunluk: number; slug: string } | null {
  let m = parca;
  for (let rx = extractMaterialTypeDetayli(m); rx && rx.type !== 'diger'; rx = extractMaterialTypeDetayli(m)) {
    if (!sondakiSifatRef(parca, rx.index + rx.length)) return { index: rx.index, uzunluk: rx.length, slug: rx.type };
    m = maskele(m, rx.index + rx.length);
  }
  m = parca;
  for (let dc = resolveAdDetayliFiltresiz(m); dc; dc = resolveAdDetayliFiltresiz(m)) {
    if (!sondakiSifatRef(parca, dc.index + dc.desen.length)) return { index: dc.index, uzunluk: dc.desen.length, slug: dc.slug };
    m = maskele(m, dc.index + dc.desen.length);
  }
  return null;
}
function basIsimReferans(text: string): string | null {
  const tam = normalizeText(text);
  const kelimeler = tam.split(/\s+/).filter(Boolean);
  for (let i = kelimeler.length - 1; i >= 0; i--) {
    const parca = kelimeler.slice(i).join(' ');
    const ofset = tam.length - parca.length;
    const p = parcaRef(parca);
    if (p) { const kap = sozlukKapsayan(tam, ofset + p.index, ofset + p.index + p.uzunluk); return kap ? kap.slug : p.slug; }
  }
  return basIsimEski(text);
}

/** aileKelimeleri tanimi (bagimsiz referans cozucuyle, bellek ve suzgec yok). 55 AD (05.10):
 *  token birlesimi satirin ailesini cozmuyorsa aile kelimesi YOK (test:aile-kelimesi). */
function referansAileKelimeleri(tokens: string[], familySlug: string | null): string[] {
  const out: string[] = [];
  if (familySlug && basIsimReferans(tokens.join(' ')) === familySlug) {
    for (const t of tokens) if (basIsimReferans(tokens.filter((x) => x !== t).join(' ')) !== familySlug) out.push(t);
  }
  return out;
}

/** UZUN SARTNAME (P2, 06.10 — test:sartname-ilk-satir): cok satirli metinde aile kelimeleri
 *  ailenin GELDIGI metnin belirtecleriyle sinirlidir. Referans kesisimi BAGIMSIZ kurar:
 *  parantezsiz ilk satir tek basina satirin ailesine cozuluyorsa kume = ilk satirin belirtecleri. */
function kaynakKumesi(metin: string, tokens: string[], aile: string): string[] {
  const satirlar = metin.replace(/\([^)]*\)/g, ' ').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (satirlar.length < 2 || basIsimReferans(satirlar[0]) !== aile) return tokens;
  const ilk = new Set(tokenize(satirlar[0]));
  return tokens.filter((t) => ilk.has(t));
}

/** IS SAYACI icin: uretim cozucusu belleksiz (eski dongunun yaptigi is). */
function belleksizDongu(tokens: string[], familySlug: string | null): void {
  if (familySlug) for (const t of tokens) resolveLineFamily(tokens.filter((x) => x !== t).join(' '));
}

async function main() {
  const warn = console.warn; const log = console.log;
  const metinler = fiksturMetinleri();
  const enUzun = metinler.slice().sort((a, b) => b.length - a.length)[0];
  const DESEN_SAYISI = [...AD_SOZLUGU, ...AD_ZENGINLESTIRME].reduce((s, e) => s + e.patterns.filter((p) => p.length >= 3).length, 0);

  // ══ H0 · aile cozucu: artimli parca + onek kovasi == eski algoritma ══════════
  console.warn = () => {};
  const cozucuGirdileri = [...metinler, ...normalizeText(enUzun).split(/\s+/).filter(Boolean).map((_, i, w) => w.slice(i).join(' '))];
  let aileBulunan = 0; let sifatEtkili = 0; const farkA: string[] = [];
  for (const a of cozucuGirdileri) {
    const y = resolveFamily(a); const r = basIsimReferans(a);
    if (r !== basIsimEski(a)) sifatEtkili++;
    if (y === r) { if (y) aileBulunan++; } else if (farkA.length < 5) farkA.push(`${js(a).slice(0, 40)}: ${y} ≠ ${r}`);
  }
  console.warn = warn;
  check(`FIXTURE KANITI: ${cozucuGirdileri.length} girdi, ${aileBulunan} tanesinde aile cozuldu (≥ 1.000)`, aileBulunan >= 1000);
  check(`FIXTURE KANITI: ${sifatEtkili} girdide sondaki sifat aileyi degistiriyor (≥ 5) — H0 yeni kurali da olcer`, sifatEtkili >= 5, `${sifatEtkili}`);
  check('★ H0 resolveFamily: artimli sondan-parca + onek kovasi + sondaki sifat BAGIMSIZ referansla birebir', farkA.length === 0, farkA.join(' | '));

  // ══ H1 · aileKelimeleri: bellekli == belleksiz referans (tum fikstür metinleri) ══
  console.warn = () => {};
  let karsilastirilan = 0; let uzunKarsilastirilan = 0; const farklar: string[] = [];
  const kesisimli: string[] = []; // ilk satir kesisimi TUM belirteclerden farkli sonuc veren metinler
  for (const a of metinler) {
    const q = parseLine(a, null);
    if (!q.familySlug || q.tokens.length < 2) continue;
    karsilastirilan++;
    if (a.length > 1000) uzunKarsilastirilan++;
    const ref = referansAileKelimeleri(kaynakKumesi(a, q.tokens, q.familySlug), q.familySlug);
    if (js(ref) !== js(referansAileKelimeleri(q.tokens, q.familySlug))) kesisimli.push(`${a.split(/\r?\n/)[0].trim()} → ${js(ref)}`);
    if (js(ref) !== js(q.aileKelimeleri) && farklar.length < 5) farklar.push(`${a.length} kar: ${js(q.aileKelimeleri).slice(0, 80)} ≠ ${js(ref).slice(0, 80)}`);
  }
  if (process.env.H1_DOK) kesisimli.forEach((x) => log(`  KESISIM: ${x}`));
  check(`FIXTURE KANITI: H1 kesisim dali kosuyor — ${kesisimli.length} cok satirli metinde ilk satir kumesi sonucu degistiriyor (≥ 5)`, kesisimli.length >= 5, `${kesisimli.length}`);
  // BILINCLI FARK (P2 uzun sartname, 06.10): aile AYNI, aile kelimesi ilk satirdan — eski tanim (tum
  // belirtecler) bu metinlerde bos ya da baska kelime veriyordu. Adlariyla sabit:
  const bilincli: Array<[string, string[]]> = [
    ['SİNYALİZASYON KABLOSU', ['kablosu']], ['DİKDÖRTGEN KANAL İZOLASYONU', ['izolasyonu']],
    ['AG PANOLARI', ['panolari']], ['ALÇAK GERİLİM KABLOLARI', ['kablolari']],
  ];
  for (const [ilkSatir, beklenen] of bilincli) {
    const hedefler = metinler.filter((a) => a.split(/\r?\n/).length >= 2 && a.split(/\r?\n/)[0].trim() === ilkSatir);
    const sonuc = hedefler.map((a) => { const q = parseLine(a, null); return { ak: q.aileKelimeleri, eski: referansAileKelimeleri(q.tokens, q.familySlug) }; });
    const degisen = sonuc.filter((x) => js(x.ak) !== js(x.eski));
    check(`H1b BILINCLI "${ilkSatir}" (${hedefler.length} metin, ${degisen.length} degisen): degisenlerin aile kelimesi ${js(beklenen)}`,
      degisen.length >= 1 && degisen.every((x) => js(x.ak) === js(beklenen)), js(sonuc));
  }
  console.warn = warn;
  check(`FIXTURE KANITI: ${karsilastirilan} aileli ad karsilastirildi (≥ 500), ${uzunKarsilastirilan} tanesi 1.000 karakterden uzun (≥ 1)`, karsilastirilan >= 500 && uzunKarsilastirilan >= 1);
  check('★ H1 aileKelimeleri: cagri ici bellek sonucu DEGISTIRMEZ (belleksiz referansla birebir)', farklar.length === 0, farklar.join(' | '));

  // ══ H2 · resolveAdDetayli: onek suzgeci == suzgecsiz referans ══════════════
  const ucKarakterli = [...AD_SOZLUGU, ...AD_ZENGINLESTIRME].flatMap((e) => e.patterns.filter((p) => p.length === 3));
  const girdiler: string[] = [
    ...metinler,
    // en uzun metnin TUM kelime-hizali sondan-parcalari (aile cozucunun gercekte sordugu dizeler)
    ...normalizeText(enUzun).split(/\s+/).filter(Boolean).map((_, i, w) => w.slice(i).join(' ')),
    // sinirlar: bos, <3, metnin SON uc karakterinde biten desen, koruma (kanalizasyon ↔ kanal), cok baytli
    '', 'a', 'ab', ...ucKarakterli.map((p) => `xx ${p}`), ...ucKarakterli.map((p) => p),
    'hava kanalı', 'hava kanalı kanalizasyon', 'kanalizasyon borusu', 'boru 🔧 vana', 'ÇEKVALF', 'yangın hortumu dolabı',
  ];
  let ayni = 0; let bulunan = 0; const farkB: string[] = [];
  for (const g of girdiler) {
    const a = resolveAdDetayli(g); const b = resolveAdDetayliFiltresiz(g);
    if (js(a) === js(b)) { ayni++; if (a) bulunan++; } else if (farkB.length < 5) farkB.push(`${js(g).slice(0, 40)}: ${js(a)} ≠ ${js(b)}`);
  }
  check(`FIXTURE KANITI: ${girdiler.length} girdi, ${bulunan} tanesinde desen bulundu (≥ 300), 3 karakterli desen ${ucKarakterli.length} (≥ 1)`, bulunan >= 300 && ucKarakterli.length >= 1);
  check('★ H2 resolveAdDetayli: onek kovasi sonucu DEGISTIRMEZ (suzgecsiz referansla birebir, sira + koruma dahil)', farkB.length === 0 && ayni === girdiler.length, farkB.join(' | '));
  check('H2 karsi: koruma hala calisir — "hava kanalı kanalizasyon" kanal DEGIL', resolveAdDetayli('hava kanalı kanalizasyon')?.slug !== 'kanal', js(resolveAdDetayli('hava kanalı kanalizasyon')));

  // ══ H2b · her desen cagri basina EN COK BIR KEZ denenir (tekrarlayan onek) ══
  // Girdi: tek bir desen oneki 200 kez; hicbir desen TAM gecmez → tarama erken
  // bitmez, deneme sayisi = oneki metinde gecen desen sayisi OLMALI (fazlasi
  // ayni desenin tekrar denenmesi ya da gevsek anahtar = bosa is).
  const DESENLER = [...AD_SOZLUGU, ...AD_ZENGINLESTIRME].flatMap((e) => e.patterns.filter((p) => p.length >= 3));
  const ornek = DESENLER.find((p) => p.length >= 5 && !p.slice(0, 4).includes(' ') && normalizeText(p.slice(0, 3)) === p.slice(0, 3));
  const tekrarli = Array.from({ length: 200 }, () => ornek!.slice(0, 3)).join(' ');
  const tekrarliNorm = normalizeText(tekrarli);
  const beklenenDeneme = DESENLER.filter((p) => tekrarliNorm.includes(p.slice(0, 3))).length;
  AD_COZUCU_OLCUM.desenDenemesi = 0;
  const tekrarliSonuc = resolveAdDetayli(tekrarli);
  const tekrarliDeneme = AD_COZUCU_OLCUM.desenDenemesi;
  check(`FIXTURE KANITI: "${ornek?.slice(0, 3)}" × 200 — hicbir desen tam gecmiyor, ${beklenenDeneme} desenin oneki geciyor (≥ 1)`, !!ornek && tekrarliSonuc === null && beklenenDeneme >= 1, js(tekrarliSonuc));
  check(`★ H2b tekrarlayan onekte her desen tek kez denenir: ${tekrarliDeneme} deneme = ${beklenenDeneme} aday`, tekrarliDeneme === beklenenDeneme, `${tekrarliDeneme}`);

  // ══ H3 · IS SAYISI (deterministik): en uzun gercek sartname adi ══════════
  console.warn = () => {}; console.log = () => {};
  const q = parseLine(enUzun, null);
  AILE_COZUCU_OLCUM.parcaDenetimi = 0; AD_COZUCU_OLCUM.desenDenemesi = 0;
  parseLine(enUzun, null);
  const yeniParca = AILE_COZUCU_OLCUM.parcaDenetimi; const yeniDesen = AD_COZUCU_OLCUM.desenDenemesi;
  AILE_COZUCU_OLCUM.parcaDenetimi = 0;
  belleksizDongu(q.tokens, q.familySlug);
  const refParca = AILE_COZUCU_OLCUM.parcaDenetimi;
  console.warn = warn; console.log = log;
  check(`FIXTURE KANITI: en uzun fikstür adi ${enUzun.length} karakter (≥ 1.400), ${q.tokens.length} token (≥ 100), aile ${q.familySlug}`, enUzun.length >= 1400 && q.tokens.length >= 100 && !!q.familySlug);
  check(`★ H3a sondan-parca denetimi: parseLine ${yeniParca} ≤ belleksiz dongunun %25'i (${refParca})`, refParca > 0 && yeniParca <= refParca * 0.25, `${yeniParca}/${refParca}`);
  const ortalama = yeniParca > 0 ? yeniDesen / yeniParca : Infinity;
  check(`★ H3b desen denemesi: parca basina ortalama ${ortalama.toFixed(1)} ≤ desen sayisinin %15'i (${DESEN_SAYISI})`, ortalama <= DESEN_SAYISI * 0.15, `${yeniDesen}/${yeniParca}`);

  // ══ B · SALDIRI TAVANI (matching.service, AD_AZAMI_UZUNLUK) ══════════════
  // Satir REDDEDILMEZ: motor ilk AD_AZAMI_UZUNLUK karakterle calisir, sonuc
  // ORIJINAL ada yazilir; hafiza imzasi da ayni kirpik adla kurulur.
  const enUzunGercek = Math.max(...metinler.map((a) => a.length));
  const etkilenen = metinler.filter((a) => sorguAdi(a) !== a).length;
  check(`★ B0 gercek adlar etkilenmez: tavan ${AD_AZAMI_UZUNLUK} > en uzun fikstür adi ${enUzunGercek}, etkilenen ${etkilenen}`, AD_AZAMI_UZUNLUK > enUzunGercek && etkilenen === 0);

  const urun = (c: ProductColumns, i: number) => {
    const idx = buildProductIndex(c);
    return { id: `lib-${i}`, materialId: null, material: null, materialName: idx.displayName, listPrice: c.price, customPrice: null,
      discountRate: 0, currency: 'TRY', productIndexId: `pi-${i}`, brand: { id: 'b1', name: 'B1' },
      product: { ...idx, id: `pi-${i}`, ad: c.ad, cins: c.cins ?? null, baglanti: null, capRaw: c.cap ?? null, kategori: null, boyMm: null, urunKodu: null, sheetName: null, price: c.price, birim: null } };
  };
  const kutuphane = [
    urun({ ad: 'Küresel Vana', cins: 'Pirinç', cap: 'DN50', price: 500 } as ProductColumns, 1),
    urun({ ad: 'Küresel Vana', cins: 'Pirinç', cap: 'DN25', price: 200 } as ProductColumns, 2),
  ];
  const imzalar: string[] = [];
  const prisma: any = {
    userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' ? [] : kutuphane) },
    brand: { findUnique: async () => ({ name: 'B1' }) },
    eslesmeHafizasi: {
      findUnique: async (a: any) => { imzalar.push(`oku:${a?.where?.userId_imza?.imza}`); return null; },
      upsert: async (a: any) => { imzalar.push(`yaz:${a?.where?.userId_imza?.imza}`); return undefined; },
      findFirst: async () => null,
    },
    material: { update: async () => undefined },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s: any, i: number) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
    user: { findUnique: async () => ({ firmaId: 'u1' }) },
  };
  const svc: any = new MatchingService(prisma, new TerminologyService(prisma), { getRates: async () => ({ usdTry: 40, eurTry: 48, source: 'tcmb' }) } as any);
  const K = { userId: 'u1', firmaId: 'u1' };
  const KOK = ['kirmizi', 'pirinc', 'govdeli', 'yuksek', 'tam', 'gecisli', 'kollu', 'disli', 'sertifikali', 'onayli', 'monte', 'edilmis'];
  let dolgu = ''; for (let i = 0; dolgu.length < 50000; i++) dolgu += `${KOK[i % KOK.length]}${Math.floor(i / KOK.length)} `;
  // aile + cap TAVANIN OTESINDE: kirpilmis ad onlari gormez, tam ad gorurdu
  const uzunAd = `${dolgu}küresel vana DN50`;
  const kirpik = uzunAd.slice(0, AD_AZAMI_UZUNLUK);
  const ikiz = `${kirpik}${dolgu.slice(0, 3000)} küresel vana DN25`; // ayni ilk 2.000 karakter, farkli son
  // takma ad tohumu ('sprinkler hatti' → boru ipucu) TAVANIN OTESINDE: kirpik ad ipucunu gormemeli
  const aliasAd = `${dolgu}sprinkler hattı DN50`;
  const sus = async <T>(f: () => Promise<T>) => { const a = { log: console.log, warn: console.warn, error: console.error }; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await f(); } finally { Object.assign(console, a); } };

  AILE_COZUCU_OLCUM.parcaDenetimi = 0;
  const rUzun: any = await sus(() => svc.bulkMatch(K, 'b1', [uzunAd, ikiz]));
  const isUzun = AILE_COZUCU_OLCUM.parcaDenetimi;
  AILE_COZUCU_OLCUM.parcaDenetimi = 0;
  const rKirpik: any = await sus(() => svc.bulkMatch(K, 'b1', [kirpik]));
  const isKirpik = AILE_COZUCU_OLCUM.parcaDenetimi;
  const rAlias: any = await sus(() => svc.bulkMatch(K, 'b1', [aliasAd]));
  const tamAlias: any = await sus(() => svc.bulkMatch(K, 'b1', ['sprinkler hattı DN50']));
  const tamAd: any = await sus(() => svc.bulkMatch(K, 'b1', ['küresel vana DN50']));
  check(`FIXTURE KANITI: tavanin otesindeki "küresel vana DN50" TAM adda eslesir (${tamAd['küresel vana DN50']?.netPrice} TL), uzun ad ${uzunAd.length} karakter`, (tamAd['küresel vana DN50']?.netPrice ?? 0) > 0 && uzunAd.length > 40000);
  const anahtar = (o: any, k: string) => o != null && Object.prototype.hasOwnProperty.call(o, k);
  check('★ B1 sonuc ORIJINAL ada yazilir (iki uzun ad da kendi anahtariyla, kirpik anahtar YOK)', anahtar(rUzun, uzunAd) && anahtar(rUzun, ikiz) && !anahtar(rUzun, kirpik), js(Object.keys(rUzun ?? {}).map((x) => x.length)));
  check('★ B2 motor kirpik adla calisir: uzun adin sonucu = kirpik adin sonucu (tavan otesi DN50 GORULMEZ)', js(rUzun?.[uzunAd]) === js(rKirpik?.[kirpik]) && js(rUzun?.[ikiz]) === js(rKirpik?.[kirpik]), `${js(rUzun?.[uzunAd]).slice(0, 80)} ≠ ${js(rKirpik?.[kirpik]).slice(0, 80)}`);
  check(`FIXTURE KANITI: "sprinkler hattı DN50" tam adda takma ad ipucu sonucu DEGISTIRIR (kirpik sonuctan farkli)`, js(tamAlias?.['sprinkler hattı DN50']) !== js(rKirpik?.[kirpik]), js(tamAlias?.['sprinkler hattı DN50']).slice(0, 80));
  check('★ B2b takma ad da kirpik adla cozulur: tavan otesindeki "sprinkler hattı" ipucu GORULMEZ', js(rAlias?.[aliasAd]) === js(rKirpik?.[kirpik]), `${js(rAlias?.[aliasAd]).slice(0, 80)} ≠ ${js(rKirpik?.[kirpik]).slice(0, 80)}`);
  check(`★ B3 is tavanla sinirli: 2 uzun ad (50.000+ karakter) ${isUzun} denetim ≤ 2 × kirpik ad ${isKirpik}`, isKirpik > 0 && isUzun <= 2 * isKirpik, `${isUzun}/${isKirpik}`);
  // B4 hafiza imzasi simetrik: remember (tam uzun ad) ↔ eslestirme (kirpik) ayni anahtar
  const ozelImza = (ad: string) => svc.buildImza(ad, 'b1');
  const ozelKind = (ad: string) => svc.buildKindImza(ad, 'b1', []);
  const imzaUzunCap = `${dolgu.slice(0, 100)} küresel vana DN50 ${dolgu}`; // cap tavandan ONCE: imza olculu kalir
  check('★ B4 hafiza imzasi kirpik adla kurulur (buildImza / buildKindImza: tam uzun ad = kirpik ad)',
    js(ozelImza(uzunAd)) === js(ozelImza(kirpik)) && js(ozelKind(uzunAd)) === js(ozelKind(kirpik)) && js(ozelImza(imzaUzunCap)) === js(ozelImza(sorguAdi(imzaUzunCap))),
    `${js(ozelImza(uzunAd))} / ${js(ozelImza(kirpik))}`);
  check('B4 karsi: tavan otesindeki olcu imzaya GIRMEZ (tam ad kirpilmasaydi dn50 tasirdi)', ozelImza(uzunAd) === null && ozelImza('küresel vana DN50') !== null, js(ozelImza(uzunAd)));

  console.log(`\n${'='.repeat(60)}\nAD UZUNLUGU HIZI (P2): ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
