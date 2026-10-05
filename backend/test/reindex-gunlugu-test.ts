/**
 * YENIDEN INDEKSLEME GUNLUGU — "denenen / yeni" (FAZ B parti 2b, koordinator notu 05.10)
 *   npx ts-node test/reindex-gunlugu-test.ts   (npm run test:reindex-gunlugu)
 *
 * OLCULDU (04.10, canli v18 yeniden indekslemesi): gunluk "N aile ogrenildi"
 * diyordu; N sozluge SUNULAN aile sayisiydi (admin.service reindexProducts,
 * `aileler.size`). learnFamilyAliases zaten kayitli olanlari YAZMAZ ve
 * gercek sayiyi `{ ogrenilen }` olarak dondurur — donus okunmuyordu. Sozlukte
 * 30→32 (2 yeni) varken gunluk yuzlercesini "ogrenildi" sayiyordu. v19
 * yeniden indekslemesinin sonucu bu satirdan okunacak.
 *
 * KURAL: gunluk ve donus IKI sayi tasir — aileDenenen (sunulan), aileYeni
 * (gercekten yazilan). Ogrenme hatasi yeni sayisina 0 katar, isi durdurmaz.
 * DB GEREKMEZ (taklit prisma, gercek TerminologyService).
 */
import { AdminService } from '../src/ozellik/kutuphane/admin/admin.service';
import { TerminologyService } from '../src/ozellik/eslestirme/matching/terminology.service';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// Sozlukte KARSILIGI OLMAYAN adlar → self-family → ogrenme adayi (kiraci-siniri K5 fiksturu deseni)
const satir = (id: string, ad: string, sahip: string | null = null) => ({
  id, ad, kategori: null, cins: null, baglanti: null, capRaw: null, boyMm: null, birim: null, price: 10,
  currency: 'TRY', urunKodu: null, not: null, sheetName: null, sourceRow: null, sortOrder: 0,
  adSlug: 'eski', adBucket: 'eski', belirsiz: false, indexVersion: 0, ownerUserId: sahip, ownerFirmaId: null,
});

function dunya(opts: { mevcutAlias: string[]; yazimPatlar?: boolean }) {
  const yazilan: any[] = [];
  const prisma: any = {
    productIndex: {
      findMany: async () => [satir('p1', 'Zetaflex Omegatron'), satir('p2', 'Kuvarsitron Pelmax'), satir('p3', 'Zetaflex Omegatron')],
      update: async () => ({}),
    },
    terminologyAlias: {
      findMany: async ({ where }: any) => opts.mevcutAlias.filter((a) => where.alias.in.includes(a)).map((alias) => ({ alias })),
      createMany: async ({ data }: any) => { if (opts.yazimPatlar) throw new Error('db yok (test)'); yazilan.push(...data); return { count: data.length }; },
    },
    user: { findUnique: async () => null },
  };
  const admin = new AdminService(prisma, {} as any, new TerminologyService(prisma), {} as any, {} as any);
  return { admin, yazilan };
}

async function kos(opts: { mevcutAlias: string[]; yazimPatlar?: boolean }) {
  const { admin, yazilan } = dunya(opts);
  const satirlar: string[] = [];
  const realLog = console.log; const realWarn = console.warn;
  console.log = (...a: any[]) => { satirlar.push(a.join(' ')); };
  console.warn = () => {};
  try {
    const sonuc: any = await admin.reindexProducts();
    return { sonuc, yazilan, gunluk: satirlar.find((s) => s.startsWith('[Reindex]')) ?? '' };
  } finally { console.log = realLog; console.warn = realWarn; }
}

async function main() {
  // A) Iki aday aile, biri ZATEN sozlukte
  const ilk = await kos({ mevcutAlias: [] });
  const adaylar = ilk.yazilan.map((y) => y.alias).sort();
  check('A0 olcutun kendisi: fikstur iki tekil aile uretiyor (bos sozlukte ikisi de yazilir)', adaylar.length === 2, JSON.stringify(adaylar));

  const r = await kos({ mevcutAlias: [adaylar[0]] });
  check('A1 olcutun kendisi: sozlukte olan YAZILMADI (idempotens)', r.yazilan.length === 1 && r.yazilan[0].alias === adaylar[1], JSON.stringify(r.yazilan.map((y) => y.alias)));
  check('★ A2 donus: aileDenenen 2 · aileYeni 1', r.sonuc.aileDenenen === 2 && r.sonuc.aileYeni === 1, JSON.stringify(r.sonuc));
  check('★ A3 gunluk "2 aile denendi (1 yeni)"', /2 aile denendi \(1 yeni\)/.test(r.gunluk), r.gunluk);
  check('A4 gunluk eski yaniltici ibareyi tasimiyor ("aile ogrenildi")', !/aile ogrenildi/.test(r.gunluk), r.gunluk);

  // B) Hepsi zaten sozlukte → 0 yeni
  const b = await kos({ mevcutAlias: adaylar });
  check('★ B1 hepsi kayitli: "2 aile denendi (0 yeni)"', b.sonuc.aileYeni === 0 && /2 aile denendi \(0 yeni\)/.test(b.gunluk), b.gunluk);

  // C) Ogrenme patlarsa is DURMAZ, yeni = 0
  const c = await kos({ mevcutAlias: [], yazimPatlar: true });
  check('★ C1 yazim hatasi: reindex biter, aileYeni 0, guncellenen 3', c.sonuc.aileYeni === 0 && c.sonuc.aileDenenen === 2 && c.sonuc.guncellenen === 3, JSON.stringify(c.sonuc));

  console.log(`\n${'='.repeat(60)}\nREINDEX GUNLUGU: ${passed} PASS · ${failed} FAIL`);
  if (failures.length) { console.log('\nDUSENLER:'); failures.forEach((f) => console.log('  · ' + f)); }
  if (failed > 0) process.exitCode = 1;
}

bitmezseKirmizi(main());
