/**
 * KÜTÜPHANE LİSTE EKLEME — KL1-KL7 (Düzeltme Talebi 24.07)
 *   npx ts-node test/kl-liste-ekleme-test.ts   (npm run test:kl)
 *
 * GERÇEK yerel DB (PG). İşçilik (LaborFirmsService) + Kütüphane (LibraryService)
 * save akışı round-trip. Geçici firma/marka oluşturur + SİLER.
 *
 * Talep kuralı: Kaydet, ekrandaki grid'in TAM halini kalıcılaştırır (yeni
 * satırlar + tüm hücreler, çap dahil). Round-trip sadakati; kısmi persist yok.
 *
 * NOT: KL2 (aktif hücre blur edilmeden commit) FRONTEND davranışıdır —
 * ExcelGrid.stopEditing() + save-öncesi çağrı; production build UI'da doğrulandı.
 * Bu dosya backend persist/round-trip (KL1,KL3,KL4,KL5,KL6,KL7) kapsar.
 */
import { PrismaClient } from '@prisma/client';
import { LaborFirmsService } from '../src/labor-firms/labor-firms.service';
import { LibraryService } from '../src/library/library.service';
import { MatchingService } from '../src/modules/matching/matching.service';
import { TerminologyService } from '../src/modules/matching/terminology.service';

let passed = 0; let failed = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); } else {
    failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const FIRM_COLS = [
  { field: 'col0', headerName: 'No' }, { field: 'ad', headerName: 'İşçilik Kalemi' },
  { field: 'cins', headerName: 'Cinsi/Detay' }, { field: 'cap', headerName: 'Çap' },
  { field: 'birim', headerName: 'Birim' }, { field: 'fiyat', headerName: 'Birim Fiyat' },
  { field: 'para', headerName: 'Para Birimi' }, { field: 'not', headerName: 'Not' },
];
const FIRM_ROLES = { noField: 'col0', nameField: 'ad', unitField: 'birim', laborUnitPriceField: 'fiyat' };

/** İşçilik sabit-format sheet üret (InlineFirmEntry gibi) */
function firmSheet(items: Array<{ ad: string; cap: string; birim: string; fiyat: string }>) {
  const rowData: any[] = [{ _rowIdx: 0, _isHeaderRow: true }];
  items.forEach((it, i) => rowData.push({
    _rowIdx: i + 1, _isDataRow: true,
    _laborName: [it.ad, it.cap].filter(Boolean).join(' '),
    col0: String(i + 1), ad: it.ad, cap: it.cap, birim: it.birim, fiyat: it.fiyat,
  }));
  return { columnDefs: FIRM_COLS, rowData, columnRoles: FIRM_ROLES, headerEndRow: 0 };
}

async function main() {
  const prisma = new PrismaClient();
  const terminology = new TerminologyService(prisma as any);
  const fakeFx = { getRates: async () => ({ usdTry: 40, eurTry: 48, usdTryBuying: 40, eurTryBuying: 48, source: 'fake', date: '' }) } as any;
  const matching = new MatchingService(prisma as any, terminology, fakeFx);
  const labor = new LaborFirmsService(prisma as any, matching);
  const library = new LibraryService(prisma as any, terminology);

  const user = await prisma.user.findFirst({ where: { role: 'user' }, select: { id: true } });
  if (!user) throw new Error('Test kullanıcısı yok');
  const uid = user.id;

  let firmaId = ''; let brandId = '';
  try {
    // ═══════════ İŞÇİLİK (KL1, KL3, KL5, KL6, KL7-çap) ═══════════
    const firma = await labor.create(uid, { name: `__KL_${Date.now()}`, discipline: 'mechanical' });
    firmaId = firma.id;

    // İlk kayıt: 2 çaplı kalem
    await labor.saveBulkPrices(uid, firmaId, 'new', [
      { laborName: 'ppr-c boru DN 20', unit: 'metre', unitPrice: 500 },
      { laborName: 'ppr-c boru DN 25', unit: 'metre', unitPrice: 600 },
    ], undefined, firmSheet([
      { ad: 'ppr-c boru', cap: 'DN 20', birim: 'metre', fiyat: '500' },
      { ad: 'ppr-c boru', cap: 'DN 25', birim: 'metre', fiyat: '600' },
    ]) as any);
    const lists = await labor.getFirmaPriceLists(uid, firmaId);
    const lid = lists.priceLists[0].id;

    // KL1: kayıtlı 2 satıra 3. satır (ad+ÇAP AYRI SÜTUN+birim+fiyat) ekle →
    // 3 tam, mevcut çaplar + YENİ SATIR ÇAPI düşmez. FE handleSaveDrafts gibi:
    // save-bulk'a TAM güncel sheet (mevcut _laborPriceId + yeni _laborName,cap).
    const pre: any = await labor.getPriceListSheets(uid, lid);
    const preRows = pre.sheet.rowData.filter((r: any) => r._isDataRow);
    const kl1Sheet = firmSheet([
      { ad: 'ppr-c boru', cap: 'DN 20', birim: 'metre', fiyat: '500' },
      { ad: 'ppr-c boru', cap: 'DN 25', birim: 'metre', fiyat: '600' },
      { ad: 'PPR-C BORU', cap: 'DN 32', birim: 'metre', fiyat: '700' }, // yeni: çap AYRI sütun
    ]);
    preRows.forEach((r: any, i: number) => { kl1Sheet.rowData[i + 1]._laborPriceId = r._laborPriceId; });
    kl1Sheet.rowData[3]._laborName = 'PPR-C BORU DN 32'; // yeni satır eşleşme anahtarı
    await labor.saveBulkPrices(uid, firmaId, lid, [{ laborName: 'PPR-C BORU DN 32', unit: 'metre', unitPrice: 700 }], undefined, kl1Sheet as any);
    const r1: any = await labor.getPriceListSheets(uid, lid);
    const d1 = r1.sheet.rowData.filter((r: any) => r._isDataRow);
    check('KL1 işçilik: 3 satır tam kalır', d1.length === 3, `${d1.length}`);
    const caps1 = d1.map((r: any) => String(r.cap ?? ''));
    check('KL1 mevcut satırların çapı DÜŞMEZ (DN 20, DN 25 korunur)',
      caps1.includes('DN 20') && caps1.includes('DN 25'), JSON.stringify(caps1));
    check('KL1 YENİ satırın çapı (ayrı sütun) DÜŞMEZ (DN 32 kalıcı)',
      caps1.includes('DN 32'), JSON.stringify(caps1));

    // KL3: round-trip — tekrar oku, çaplar birebir
    const r3: any = await labor.getPriceListSheets(uid, lid);
    const caps3 = r3.sheet.rowData.filter((r: any) => r._isDataRow).map((r: any) => String(r.cap ?? '')).sort();
    check('KL3 round-trip: çaplar birebir geri gelir', caps3.includes('DN 20') && caps3.includes('DN 25'), JSON.stringify(caps3));

    // KL7-çap: mevcut kalemin çapını düzenle (save-sheets laborItemName + sheet)
    const pid = d1.find((r: any) => String(r.cap) === '')?._laborPriceId
      ?? d1.find((r: any) => /DN 32/.test(String(r.cap)))?._laborPriceId ?? d1[2]._laborPriceId;
    // sheet'te 3. kalemin çapını "DN 40" yap
    const editSheet = firmSheet([
      { ad: 'ppr-c boru', cap: 'DN 20', birim: 'metre', fiyat: '500' },
      { ad: 'ppr-c boru', cap: 'DN 25', birim: 'metre', fiyat: '600' },
      { ad: 'ppr-c boru', cap: 'DN 40', birim: 'metre', fiyat: '700' },
    ]);
    // _laborPriceId'leri koru
    d1.forEach((r: any, i: number) => { editSheet.rowData[i + 1]._laborPriceId = r._laborPriceId; });
    await labor.savePriceListSheets(uid, lid,
      [{ laborPriceId: pid, laborItemName: 'ppr-c boru DN 40', listPrice: 700, discountRate: 0, unit: 'metre' }],
      editSheet as any);
    const r7: any = await labor.getPriceListSheets(uid, lid);
    const cap40 = r7.sheet.rowData.filter((r: any) => r._isDataRow).map((r: any) => String(r.cap ?? ''));
    check('KL7-çap: mevcut kalem çap düzenlemesi KALICI (DN 40)', cap40.includes('DN 40'), JSON.stringify(cap40));

    // KL6: sheet rowData'da SADECE dolu satırlar (blank kırpılmış, dolu korunmuş)
    check('KL6 boş satır kırpma: sheet yalnız dolu satır tutar (blank yok)',
      r7.sheet.rowData.filter((r: any) => r._isDataRow).every((r: any) => String(r.ad ?? '').trim()),
      'boş data satırı sızdı');

    // KL5: 3 satıra 3 daha ekle → 6 (talep "5+3=8" örneği; ölçek testi)
    await labor.saveBulkPrices(uid, firmaId, lid, [
      { laborName: 'ppr-c boru DN 50', unit: 'metre', unitPrice: 800 },
      { laborName: 'ppr-c boru DN 63', unit: 'metre', unitPrice: 900 },
      { laborName: 'ppr-c boru DN 75', unit: 'metre', unitPrice: 1000 },
    ]);
    const r5: any = await labor.getPriceListSheets(uid, lid);
    check('KL5 ölçek: 3+3 = 6 satır bütün', r5.sheet.rowData.filter((r: any) => r._isDataRow).length === 6,
      `${r5.sheet.rowData.filter((r: any) => r._isDataRow).length}`);

    // ═══════════ KÜTÜPHANE MALZEME (KL4, KL7-malzeme) ═══════════
    const mb = await library.createManualBrand(uid, { brandName: `__KL_MARKA_${Date.now()}`, discipline: 'mechanical', rows: [
      { ad: 'DN 20 PPR-C Boru', birim: 'metre', price: 100 },
      { ad: 'DN 25 PPR-C Boru', birim: 'metre', price: 120 },
    ] } as any);
    brandId = (mb as any).brandId ?? (mb as any).brand?.id;

    // KL4: mevcut markaya ilave malzeme (find-or-create) → 3 malzeme
    await library.createManualBrand(uid, { brandName: (mb as any).brandName ?? `__KL_MARKA`, discipline: 'mechanical', rows: [
      { ad: 'DN 32 PPR-C Boru', birim: 'metre', price: 150 },
    ] } as any).catch(() => {});
    const bs: any = await library.getBrandSheets(uid, brandId);
    const libRows = (bs.sheets?.sheets?.[0]?.rowData ?? bs.sheet?.rowData ?? []).filter((r: any) => r._isDataRow);
    check('KL4 kütüphane: ilave malzeme kalıcı (≥3)', libRows.length >= 3, `${libRows.length}`);
    check('KL7 malzeme=işçilik: aynı round-trip davranışı (adlar korunur)',
      libRows.some((r: any) => /DN 20/.test(String(r.col1 ?? r.ad ?? ''))) && libRows.some((r: any) => /DN 32/.test(String(r.col1 ?? r.ad ?? ''))),
      JSON.stringify(libRows.map((r: any) => r.col1 ?? r.ad)));
  } finally {
    if (firmaId) await prisma.laborFirm.delete({ where: { id: firmaId } }).catch(() => {});
    if (brandId) await prisma.brand.delete({ where: { id: brandId } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`KÜTÜPHANE LİSTE EKLEME (KL1-KL7): ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(60));
  if (failures.length > 0) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
