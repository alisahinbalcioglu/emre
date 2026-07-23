/**
 * ISCILIK SABIT-FORMAT SHEET — KABUL TESTI (kullanici karari 22.07)
 *   npx ts-node test/labor-sheet-test.ts   (npm run test:labor-sheet)
 *
 * GERCEK yerel DB kullanir (PrismaClient) — gecici test firmasi olusturur,
 * assert eder, SILER. PG ayakta olmali (test:regression/library ile ayni sinif).
 *
 * Kaynak vaka: kullanici "yeni klasor actigimizda belirledigimiz sekilde ancak
 * kaydettiginde kayboluyor" — InlineFirmEntry 8-sutun girer, save-bulk sutun
 * yapisini atiyordu → getPriceListSheets sentetik 4-sutun donuyordu.
 */
import { PrismaClient } from '@prisma/client';
import { LaborFirmsService } from '../src/labor-firms/labor-firms.service';
import { MatchingService } from '../src/modules/matching/matching.service';
import { TerminologyService } from '../src/modules/matching/terminology.service';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const FIRM_COLUMNS = [
  { field: 'col0', headerName: 'No' }, { field: 'ad', headerName: 'İşçilik Kalemi' },
  { field: 'cins', headerName: 'Cinsi/Detay' }, { field: 'cap', headerName: 'Çap' },
  { field: 'birim', headerName: 'Birim' }, { field: 'fiyat', headerName: 'Birim Fiyat' },
  { field: 'para', headerName: 'Para Birimi' }, { field: 'not', headerName: 'Not' },
];
const FIRM_ROLES = { noField: 'col0', nameField: 'ad', unitField: 'birim', laborUnitPriceField: 'fiyat' };

async function main() {
  const prisma = new PrismaClient();
  const terminology = new TerminologyService(prisma as any);
  const fakeFx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }) } as any;
  const matching = new MatchingService(prisma as any, terminology, fakeFx);
  const svc = new LaborFirmsService(prisma as any, matching);

  const user = await prisma.user.findFirst({ where: { role: 'user' }, select: { id: true } });
  if (!user) throw new Error('Test kullanicisi yok');

  let firmaId = '';
  try {
    const firma = await svc.create(user.id, { name: `__SHEET_TEST_${Date.now()}`, discipline: 'mechanical' });
    firmaId = firma.id;

    // ── save-bulk + HAM 8-sutun sheet (InlineFirmEntry akisi) ──────────
    const sheet = {
      columnDefs: FIRM_COLUMNS,
      columnRoles: FIRM_ROLES,
      headerEndRow: 0,
      rowData: [
        { _rowIdx: 0, _isHeaderRow: true, col0: 'No', ad: 'İşçilik Kalemi', cins: 'Cinsi/Detay', cap: 'Çap', birim: 'Birim', fiyat: 'Birim Fiyat', para: 'Para Birimi', not: 'Not' },
        { _rowIdx: 1, _isDataRow: true, _laborName: 'Dikişli Siyah Çelik Boru Kaynaklı DN25', col0: '1', ad: 'Dikişli Siyah Çelik Boru', cins: 'Kaynaklı', cap: 'DN25', birim: 'metre', fiyat: '270', para: 'TRY', not: 'proje notu' },
      ],
    };
    await svc.saveBulkPrices(user.id, firmaId, 'new', [
      { laborName: 'Dikişli Siyah Çelik Boru Kaynaklı DN25', unit: 'metre', unitPrice: 270, currency: 'TRY', discountRate: 10 },
    ], undefined, sheet as any);

    const lists = await svc.getFirmaPriceLists(user.id, firmaId);
    const listId = lists.priceLists[0].id;

    // ── S1: kayit sonrasi 8-sutun KORUNUR (sentetik degil) ─────────────
    const r1: any = await svc.getPriceListSheets(user.id, listId);
    const s1 = r1.sheet;
    check('S1 sheet sentetik DEGIL (ham grid saklandi)', s1.synthetic === false, `synthetic=${s1.synthetic}`);
    check('S1 sutun sayisi 8 (Cinsi/Çap/Para/Not dahil)', s1.columnDefs.length === 8, `${s1.columnDefs.length}`);
    const d1 = s1.rowData.find((r: any) => r._isDataRow);
    check('S1 Cinsi korunur', d1?.cins === 'Kaynaklı', JSON.stringify(d1?.cins));
    check('S1 Çap korunur', d1?.cap === 'DN25', JSON.stringify(d1?.cap));
    check('S1 Para Birimi korunur', d1?.para === 'TRY', JSON.stringify(d1?.para));
    check('S1 Not korunur', d1?.not === 'proje notu', JSON.stringify(d1?.not));
    check('S1 birim DB overlay', d1?.birim === 'metre', JSON.stringify(d1?.birim));
    check('S1 fiyat DB overlay', Number(d1?.fiyat) === 270, JSON.stringify(d1?.fiyat));
    check('S1 iskonto DB overlay', d1?._laborDiscountRate === 10, JSON.stringify(d1?._laborDiscountRate));
    check('S1 _laborPriceId inject', !!d1?._laborPriceId, JSON.stringify(d1?._laborPriceId));

    // ── S2: sheet-DOLU listeye inline yeni kalem (sheet YOK) sona eklenir ─
    await svc.saveBulkPrices(user.id, firmaId, listId, [
      { laborName: 'Kelebek Vana DN150', unit: 'adet', unitPrice: 3000 },
    ]);
    const r2: any = await svc.getPriceListSheets(user.id, listId);
    const dr2 = r2.sheet.rowData.filter((r: any) => r._isDataRow);
    check('S2 inline eklenen kalem render\'da GORUNUR (ucuncu gecis)', dr2.length === 2, `${dr2.length} satir`);
    check('S2 yeni kalem adi dogru', dr2.some((r: any) => String(r.ad).includes('Kelebek Vana')), JSON.stringify(dr2.map((r: any) => r.ad)));
    check('S2 mevcut kalem Cinsi hala korunur', dr2.some((r: any) => r.cins === 'Kaynaklı'), JSON.stringify(dr2.map((r: any) => r.cins)));
  } finally {
    if (firmaId) await prisma.laborFirm.delete({ where: { id: firmaId } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`ISCILIK SABIT-FORMAT SHEET: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
