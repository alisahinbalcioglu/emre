/**
 * PK9 — INDEKS YOKSA SISTEM YUKSEK SESLE SOYLER  (`npm run test:pk9`)
 *
 * ACIK SORU (pano kalem 43): "motorun 'istek aninda indeksle' geri-dusus yolu
 * TEK BASINA yetmeli mi?"  CEVAP: HAYIR.
 *
 * Bu projede fallback yasagi ve I7 (sessiz bos yasagi) var. Eksik indeksi
 * SESSIZCE telafi eden bir geri-dusus, tam da yasagin hedefindeki davranistir:
 * sistem yanlis/eksik cevabi DOGRUYMUS GIBI verir, kimse fark etmez.
 * `test:regression:db` SKIP'inin sebebi tam buydu — CAYIROVA'nin 116 fiyat
 * satiri vardi ama ProductIndex'te 0 satiri; motor sessizce manuel yola dustu.
 *
 * KRITER: geri-dusus yolu KALABILIR, ama SESSIZ KALAMAZ.
 *   PK9a — TEK TEK indekssiz satir → UYARI (console.warn), duz log DEGIL.
 *   PK9b — MARKANIN TAMAMI indekssiz → ayrica MARKA duzeyinde yuksek ses.
 * (Bir assert birden fazla kritere sayilamaz: ikisi ayri assert.)
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService, ALIAS_SEEDS } from '../src/ozellik/eslestirme/matching/terminology.service';

let passed = 0; const failures: string[] = [];
const check = (ad: string, kosul: boolean, detay?: string) => {
  if (kosul) { passed++; console.log(`  ✅ ${ad}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  ❌ FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
};

/** Indekssiz kutuphane satiri: productIndexId YOK → hazirlaPool yol-3. */
const indekssizSatir = (name: string, price: number) => ({
  id: `lib-${name}`, material: null, materialName: name,
  customPrice: null, listPrice: price, discountRate: 0,
});

function fakePrisma(brandName: string, libRows: any[]): any {
  return {
    userLibrary: { findMany: async (a: any) => (a?.where?.brandId && typeof a.where.brandId === 'object' && 'not' in a.where.brandId ? [] : libRows) },
    brand: { findUnique: async () => ({ name: brandName }) },
    eslesmeHafizasi: { findUnique: async () => null, upsert: async () => undefined },
    terminologyAlias: { findMany: async () => ALIAS_SEEDS.map((s, i) => ({ id: `a${i}`, userId: null, active: true, ...s })) },
  };
}
function makeService(brandName: string, libRows: any[]): MatchingService {
  const prisma = fakePrisma(brandName, libRows);
  const fakeFx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }) } as any;
  return new MatchingService(prisma, new TerminologyService(prisma), fakeFx);
}

/** Konsolu yakala — hangi KANALDAN konustugu kriterin ta kendisi. */
async function konusmaYakala(fn: () => Promise<any>) {
  const kanal = { log: [] as string[], warn: [] as string[], error: [] as string[] };
  const y = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...a: any[]) => { kanal.log.push(a.join(' ')); };
  console.warn = (...a: any[]) => { kanal.warn.push(a.join(' ')); };
  console.error = (...a: any[]) => { kanal.error.push(a.join(' ')); };
  try { await fn(); } finally { console.log = y.log; console.warn = y.warn; console.error = y.error; }
  return kanal;
}

async function main() {
  console.log('── PK9: INDEKS YOKSA YUKSEK SES ──');

  // ── PK9a: indekssiz satirlar UYARI kanalindan duyurulur ────────────────
  {
    const lib = [
      indekssizSatir('Su ve Yangın Tesisat Borusu 1" DN25 - Siyah Dişli Manşonlu', 130),
      indekssizSatir('Su ve Yangın Tesisat Borusu 2" DN50 - Siyah Dişli Manşonlu', 220),
    ];
    const svc = makeService('ÇAYIROVA', lib);
    const k = await konusmaYakala(() => svc.bulkMatch('u1', 'brand-1', ['DN 25 çelik boru']));
    const hepsi = [...k.warn, ...k.error].join('\n');
    check('PK9a — indekssiz satır UYARI kanalından duyurulur (warn/error)',
      /indekssiz/i.test(hepsi),
      `warn=${k.warn.length} error=${k.error.length} log=${k.log.length}; `
      + `duz log'da geciyor mu: ${/indekssiz/i.test(k.log.join('\n'))}`);
  }

  // ── PK9b: MARKANIN TAMAMI indekssizse marka duzeyinde yuksek ses ───────
  {
    const lib = [
      indekssizSatir('Pirinç Küresel Vana 3/4"', 95),
      indekssizSatir('Pirinç Küresel Vana 1"', 120),
      indekssizSatir('Pirinç Küresel Vana 1 1/4"', 150),
    ];
    const svc = makeService('ÇAYIROVA', lib);
    const k = await konusmaYakala(() => svc.bulkMatch('u1', 'brand-1', ['Küresel vana 1"']));
    const hepsi = [...k.warn, ...k.error].join('\n');
    check('PK9b — markanın TAMAMI indekssizse marka düzeyinde uyarı verilir',
      /INDEKSLENMEMIS|İNDEKSLENMEMİŞ/i.test(hepsi),
      `yakalanan uyarilar: ${JSON.stringify([...k.warn, ...k.error].slice(0, 2))}`);
  }

  console.log(`\nSONUC: ${passed} PASS, ${failures.length} FAIL`);
  if (failures.length) { failures.forEach((f) => console.log('  • ' + f)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
