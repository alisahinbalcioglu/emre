/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ISCILIK: SATIR SILME KALICI OLMALI  (`npm run test:isc-sil`)
 *
 *  KULLANICI BILDIRIMI (06.08): "malzeme kutuphanesi icin yaptigin calismayi
 *  neden iscilik icin yapmadin? ayni seyler onun icin de gecerli! urun silme
 *  yok."  — HAKLIYDI. Malzeme ikizi duzeltilirken bu taraf unutulmustu.
 *
 *  ── KORUNAN SOZLESME ─────────────────────────────────────────────────────
 *  "Silinen kalem GERI GELMEZ."
 *
 *  Neden ayri bir kapi gerekiyor: `getPriceListSheets` satirlari
 *  `LaborPriceList.sheets` JSON'undan okur; `LaborPrice` yalniz fiyat/iskonto/
 *  birim bindirmesi yapar. Yani SADECE `laborPrice.delete` demek satiri
 *  EKRANDAN KALDIRMAZ — sayfa yenilenince satir JSON'dan yeniden gelir,
 *  sadece fiyatsiz olur. Kullanicinin gozunde bu "sildim, geri geldi"dir.
 *  Bu kapi, silmenin IKI YERDE birden olmasini zorlar.
 *
 *  ANAHTAR: `_laborPriceId` (save sirasinda satira enjekte edilir ve JSON'da
 *  saklanir). Id tasimayan eski satirlar icin AD ile geri dusulur — GET'in
 *  kullandigi eslesme anahtarinin AYNISI.
 *
 *  DB GEREKMEZ: sahte Prisma.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { LaborFirmsService } from '../src/ozellik/kutuphane/labor-firms/labor-firms.service';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay?: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
}

const LISTE_ID = 'pl1';
const SILINECEK = 'lp-2';

function sheetKur() {
  return {
    columnRoles: { nameField: 'ad', unitField: 'birim', laborUnitPriceField: 'fiyat' },
    columnDefs: [],
    rowData: [
      { _rowIdx: 0, _isHeaderRow: true, ad: 'Kalem' },
      { _rowIdx: 1, _isDataRow: true, _laborPriceId: 'lp-1', ad: 'Boru Montaji DN25' },
      { _rowIdx: 2, _isDataRow: true, _laborPriceId: 'lp-2', ad: 'Vana Montaji DN50' },
      { _rowIdx: 3, _isDataRow: true, _laborPriceId: 'lp-3', ad: 'Kelepce Montaji' },
      { _rowIdx: 4, _isDataRow: false }, // bos satir
    ],
  };
}

function sahte(sheet: any) {
  const kayit = { silinenId: null as string | null, guncellenenSheet: null as any };
  const client: any = {
    laborPrice: {
      findUnique: async () => ({
        id: SILINECEK, priceListId: LISTE_ID,
        firma: { userId: 'u1' },
        laborItem: { name: 'Vana Montaji DN50' },
      }),
      delete: async ({ where }: any) => { kayit.silinenId = where.id; return { id: where.id }; },
    },
    laborPriceList: {
      findUnique: async () => ({ sheets: sheet }),
      update: async ({ data }: any) => { kayit.guncellenenSheet = data.sheets; return {}; },
    },
  };
  return { kayit, client };
}

(async () => {
  console.log('── A) SILINEN SATIR SHEET JSON\'UNDAN DA KALKAR ──');
  {
    const sheet = sheetKur();
    const { kayit, client } = sahte(sheet);
    // MatchingService bu yolda kullanilmaz — bos nesne yeter (sahte oldugu ACIK).
    const svc = new LaborFirmsService(client, {} as any);
    await svc.deletePriceItem('u1', SILINECEK);

    check('A1 LaborPrice silindi', kayit.silinenId === SILINECEK, String(kayit.silinenId));
    check('A2 sheet JSON GUNCELLENDI', kayit.guncellenenSheet !== null,
      'guncelleme hic yapilmadi — satir yenilemede GERI GELIR');

    const kalan = kayit.guncellenenSheet?.rowData ?? [];
    const idler = kalan.filter((r: any) => r._isDataRow).map((r: any) => r._laborPriceId);
    check('A3 silinen satir JSON\'da YOK', !idler.includes(SILINECEK), JSON.stringify(idler));
    check('A4 diger veri satirlari DURUYOR', idler.includes('lp-1') && idler.includes('lp-3'), JSON.stringify(idler));
    check('A5 baslik ve bos satirlar DURUYOR',
      kalan.some((r: any) => r._isHeaderRow) && kalan.length === 4, `${kalan.length} satir`);
  }

  console.log('── B) GEREKSIZ YAZMA YOK ──');
  {
    // Sheet'te o satir zaten yoksa liste BOSUNA guncellenmemeli.
    const sheet = sheetKur();
    sheet.rowData = sheet.rowData.filter((r: any) => r._laborPriceId !== SILINECEK);
    const { kayit, client } = sahte(sheet);
    // MatchingService bu yolda kullanilmaz — bos nesne yeter (sahte oldugu ACIK).
    const svc = new LaborFirmsService(client, {} as any);
    await svc.deletePriceItem('u1', SILINECEK);
    check('B1 eslesme yoksa sheet guncellenmez', kayit.guncellenenSheet === null,
      'gereksiz yazma yapildi');
    check('B2 kalem yine de silindi', kayit.silinenId === SILINECEK);
  }

  console.log('── C) SHEET YOKSA COKMEZ ──');
  {
    const { kayit, client } = sahte(null);
    // MatchingService bu yolda kullanilmaz — bos nesne yeter (sahte oldugu ACIK).
    const svc = new LaborFirmsService(client, {} as any);
    await svc.deletePriceItem('u1', SILINECEK);
    check('C1 sheets null iken kalem silinir, hata yok', kayit.silinenId === SILINECEK);
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  const toplam = passed + failures.length;
  if (failures.length) {
    console.log(` ✗ ISCILIK SATIR SILME: ${passed}/${toplam} gecti, ${failures.length} BASARISIZ`);
    for (const f of failures) console.log(`   ✗ ${f}`);
    console.log('════════════════════════════════════════════════════════════════');
    process.exit(1);
  }
  console.log(` ✓ ISCILIK SATIR SILME: ${passed}/${toplam} kriter gecti`);
  console.log('════════════════════════════════════════════════════════════════');
})();
