/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  KUTUPHANE LISTE SEKMELERI + ISCILIK HAYALET LISTE  (`npm run test:kb-liste`)
 *
 *  KULLANICI BILDIRIMI (07.08, ekran goruntulu): "iscilik kutuphanemde mevcut
 *  klasorde yeni klasor aciyorum, kaydedilmiyor, tasarim uygun degil, sutunlar
 *  kayboluyor. malzeme kutuphanesinde de ayni sekilde 2. sayfa secenegi getir
 *  ve iscilikteki gibi sorunlar yasanmasin."
 *
 *  ── OLCULEN KOK NEDENLER (iscilik) ─────────────────────────────────────────
 *  1. `saveBulkPrices` 'new' yolunda listeyi kalemler DOGRULANMADAN ONCE
 *     olusturuyordu → tum satirlar gecersizse (fiyatsiz) geriye SIFIR kalemli,
 *     sheet'siz HAYALET liste kaliyordu; FE "Kaydedildi 0 kalem" diyordu.
 *  2. Sheet'siz liste sentetik 4 JENERIK kolona dusuyordu → "sutunlar kayboldu".
 *
 *  ── KORUNAN SOZLESME (IKI AILE — genel cozum kaniti) ───────────────────────
 *  A) ISCILIK: 'new' + 0 gecerli kalem → liste OLUSMAZ, hata firlar.
 *  B) ISCILIK: sentetik sheet SABIT 8-KOLON formattir (InlineFirmEntry ikizi).
 *  C) KUTUPHANE: addRowsToBrandList 'new' + 0 gecerli satir → liste OLUSMAZ.
 *  D) KUTUPHANE: gecerli satirlar hedef listeye libraryListId ile baglanir.
 *  E) KUTUPHANE: lazy goc — NULL satirlar varsayilan listeye, idempotent.
 *  F) KUTUPHANE: BOS listenin sheet'i TAM kolon setiyle doner (satirsiz).
 *
 *  DB GEREKMEZ: sahte Prisma + gercek servis siniflari.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { BadRequestException } from '@nestjs/common';
import { LaborFirmsService } from '../src/ozellik/kutuphane/labor-firms/labor-firms.service';
import { LibraryService } from '../src/ozellik/kutuphane/library/library.service';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay?: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
}

(async () => {
  // ═══ A) ISCILIK: 'new' + 0 gecerli kalem → liste OLUSMAZ ═══════════════════
  console.log('── A) iscilik: once dogrula, sonra liste olustur ──');
  {
    const created: any[] = [];
    const sahte: any = {
      laborFirm: { findUnique: async () => ({ id: 'f1', userId: 'u1', firmaId: 'u1', name: 'Yasin Usta', discipline: 'mechanical' }) },
      laborPriceList: {
        findFirst: async () => null,
        create: async (arg: any) => { created.push(arg); return { id: 'pl-yeni', ...arg.data }; },
        findUnique: async () => null,
      },
      laborPrice: { findMany: async () => [] },
    };
    const svc = new LaborFirmsService(sahte, {} as any);
    let hata: any = null;
    try {
      // Kullanicinin yasadigi birebir durum: adlar dolu, fiyatlar bos (0).
      await svc.saveBulkPrices({ userId: 'u1', firmaId: 'u1' }, 'f1', 'new', [
        { laborName: 'PPR-C Boru 20 mm', unit: 'metre', unitPrice: 0 },
        { laborName: 'PPR-C Boru DN25', unit: 'metre', unitPrice: 0 },
      ]);
    } catch (e) { hata = e; }
    check('A1 hata firlatildi (sessiz "0 kalem" YOK)', hata instanceof BadRequestException, String(hata));
    check('A2 HAYALET LISTE OLUSMADI', created.length === 0, `${created.length} create cagrisi`);
  }
  {
    // MEVCUT listeye ekleme yolunda davranis DEGISMEDI: hata yerine imported:0
    // doner (FE o yolda kendi "Birim Fiyat yok" uyarisini verir).
    const sahte: any = {
      laborFirm: { findUnique: async () => ({ id: 'f1', userId: 'u1', firmaId: 'u1', name: 'Yasin Usta', discipline: 'mechanical' }) },
      laborPriceList: {
        findFirst: async () => null,
        create: async () => { throw new Error('mevcut liste yolunda create OLMAMALI'); },
        findUnique: async () => ({ id: 'pl1', name: 'Liste', firmaId: 'f1' }),
      },
      laborPrice: { findMany: async () => [] },
    };
    const svc = new LaborFirmsService(sahte, {} as any);
    const sonuc = await svc.saveBulkPrices({ userId: 'u1', firmaId: 'u1' }, 'f1', 'pl1', [
      { laborName: 'PPR-C Boru 20 mm', unit: 'metre', unitPrice: 0 },
    ]);
    check('A3 mevcut listede imported:0 + skipped:1 doner', sonuc.imported === 0 && sonuc.skipped === 1, JSON.stringify(sonuc));
  }

  // ═══ B) ISCILIK: sentetik sheet SABIT 8-KOLON ══════════════════════════════
  console.log('── B) iscilik: sentetik sheet 8-kolon sabit format ──');
  {
    const sahte: any = {
      laborPriceList: {
        findUnique: async () => ({
          id: 'pl1', name: 'Yasin Usta - 06.08.2026', firmaId: 'f1',
          firma: { id: 'f1', userId: 'u1', firmaId: 'u1', discipline: 'mechanical' },
          sheets: null,
        }),
      },
      laborPrice: {
        findMany: async () => [
          { id: 'p1', unitPrice: 500, unit: 'metre', discountRate: 0, currency: 'TRY', laborItem: { name: 'PPR-C Boru 20 mm' } },
        ],
      },
    };
    const svc = new LaborFirmsService(sahte, {} as any);
    const { sheet } = await (svc as any).buildSyntheticLaborSheet('pl1');
    const fields = (sheet.columnDefs as any[]).map((c) => c.field);
    check('B1 8 kolon var (cins/cap/para/not dahil)',
      ['col0', 'ad', 'cins', 'cap', 'birim', 'fiyat', 'para', 'not'].every((f) => fields.includes(f)),
      fields.join(','));
    check('B2 nameField=ad (FE sabit-format yolu acilir)', sheet.columnRoles.nameField === 'ad', sheet.columnRoles.nameField);
    check('B3 kayitli kalem ad/birim/fiyat tasir',
      sheet.rowData[1]?.ad === 'PPR-C Boru 20 mm' && sheet.rowData[1]?.birim === 'metre' && sheet.rowData[1]?.fiyat === 500,
      JSON.stringify(sheet.rowData[1]));
    check('B4 header satiri tum kolon basliklarini tasir',
      sheet.rowData[0]?._isHeaderRow === true && sheet.rowData[0]?.cins === 'Cinsi/Detay' && sheet.rowData[0]?.para === 'Para Birimi',
      JSON.stringify(sheet.rowData[0]));
    check('B5 synthetic bayragi korunur', sheet.synthetic === true);
  }

  // ═══ C+D) KUTUPHANE: addRowsToBrandList ════════════════════════════════════
  console.log('── C) kutuphane: once dogrula, sonra liste olustur ──');
  const kutuphaneSahte = () => {
    const libListCreates: any[] = [];
    const userLibCreates: any[] = [];
    const client: any = {
      brand: { findUnique: async () => ({ id: 'b1', name: 'kirke', discipline: 'mechanical' }) },
      userLibrary: {
        count: async () => 15,
        aggregate: async () => ({ _max: { sortOrder: 4 } }),
        create: async (arg: any) => { userLibCreates.push(arg.data); return { id: `ul${userLibCreates.length}` }; },
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
        deleteMany: async () => ({ count: 0 }),
      },
      libraryList: {
        findFirst: async () => null,
        create: async (arg: any) => { libListCreates.push(arg); return { id: 'll-yeni', ...arg.data }; },
        findMany: async () => [],
        delete: async () => ({}),
      },
      priceList: { create: async (arg: any) => ({ id: 'pl-havuz', ...arg.data }) },
      productIndex: { create: async (arg: any) => ({ id: `pi-${Math.floor(userLibCreates.length)}`, ...arg.data }) },
      userBrandLibrary: { deleteMany: async () => ({ count: 0 }), upsert: async () => ({}) },
    };
    return { client, libListCreates, userLibCreates };
  };
  {
    const { client, libListCreates } = kutuphaneSahte();
    const svc = new LibraryService(client, { learnFamilyAliases: async () => undefined } as any);
    (svc as any).rebuildUserBrandLibrary = async () => undefined;
    let hata: any = null;
    try {
      await svc.addRowsToBrandList({ userId: 'u1', firmaId: 'f1' } as any, 'b1', { listId: 'new', rows: [{ ad: '' } as any, { ad: '   ' } as any] });
    } catch (e) { hata = e; }
    check('C1 bos satirlarla hata firlar', hata instanceof BadRequestException, String(hata));
    check('C2 HAYALET LISTE OLUSMADI (iscilik dersinin ikizi)', libListCreates.length === 0, `${libListCreates.length} create`);
  }
  {
    const { client, libListCreates, userLibCreates } = kutuphaneSahte();
    const svc = new LibraryService(client, { learnFamilyAliases: async () => undefined } as any);
    (svc as any).rebuildUserBrandLibrary = async () => undefined;
    const sonuc = await svc.addRowsToBrandList({ userId: 'u1', firmaId: 'f1' } as any, 'b1', {
      listId: 'new',
      rows: [
        { ad: 'PPR-C Boru', cap: 'DN 25', birim: 'metre', price: 50 } as any,
        { ad: 'PPR-C Boru', cap: 'DN 32', birim: 'metre', price: 60 } as any,
      ],
    });
    check('D1 yeni liste olustu ve 2 satir eklendi', libListCreates.length === 1 && sonuc.created === 2, JSON.stringify(sonuc));
    check('D2 satirlar listeye baglandi (libraryListId)',
      userLibCreates.length === 2 && userLibCreates.every((d) => d.libraryListId === 'll-yeni'),
      JSON.stringify(userLibCreates.map((d) => d.libraryListId)));
    check('D3 sira mevcut listenin SONUNDAN devam eder (sortBase=max+1)',
      userLibCreates[0]?.sortOrder === 5 && userLibCreates[1]?.sortOrder === 6,
      JSON.stringify(userLibCreates.map((d) => d.sortOrder)));
  }

  // ═══ E) KUTUPHANE: lazy goc (NULL satirlar → varsayilan liste) ═════════════
  console.log('── E) kutuphane: lazy goc idempotent ──');
  {
    const creates: any[] = [];
    const updateManys: any[] = [];
    let nullSayisi = 3; // ilk cagri: 3 sahipsiz satir; gocten sonra 0
    const client: any = {
      userLibrary: {
        count: async () => nullSayisi,
        updateMany: async (arg: any) => { updateManys.push(arg); nullSayisi = 0; return { count: 3 }; },
      },
      libraryList: {
        findFirst: async () => (creates.length ? { id: 'll-def', ...creates[0].data } : null),
        create: async (arg: any) => { creates.push(arg); return { id: 'll-def', ...arg.data }; },
        findMany: async () => [{ id: 'll-def', name: 'Fiyat Listesi', uploadedAt: '2026-08-07', _count: { items: 3 } }],
      },
    };
    const svc = new LibraryService(client, {} as any);
    const ilk = await svc.getBrandLists({ userId: 'u1', firmaId: 'f1' } as any, 'b1');
    check('E1 varsayilan liste olustu (Fiyat Listesi)', creates.length === 1 && creates[0].data.name === 'Fiyat Listesi', JSON.stringify(creates));
    check('E2 NULL satirlar varsayilana baglandi',
      updateManys.length === 1 && updateManys[0].data.libraryListId === 'll-def' && updateManys[0].where.libraryListId === null,
      JSON.stringify(updateManys));
    check('E3 liste donuyor', ilk.lists.length === 1 && ilk.lists[0]._count.items === 3);
    // Ikinci cagri: sahipsiz kalmadi → goc TEKRAR calismaz (idempotent)
    await svc.getBrandLists({ userId: 'u1', firmaId: 'f1' } as any, 'b1');
    check('E4 idempotent (ikinci cagri yeni create/updateMany uretmez)',
      creates.length === 1 && updateManys.length === 1,
      `${creates.length} create, ${updateManys.length} updateMany`);
  }

  // ═══ F) KUTUPHANE: BOS liste sheet'i TAM kolon setiyle doner ═══════════════
  console.log('── F) kutuphane: bos liste = satirsiz ama TAM kolonlu sheet ──');
  {
    const client: any = {
      libraryList: { findFirst: async () => ({ id: 'll2', name: 'kirke - 07.08.2026', userId: 'u1', brandId: 'b1' }) },
      userLibrary: { findMany: async () => [], count: async () => 15 },
    };
    const svc = new LibraryService(client, {} as any);
    const sonuc = await svc.getBrandSheets({ userId: 'u1', firmaId: 'f1' } as any, 'b1', 'll2');
    const sheet = (sonuc as any).sheets.sheets[0];
    const fields = (sheet.columnDefs as any[]).map((c) => c.field);
    check('F1 bos liste sheet DONDURUR (throw yok)', !!sheet);
    check('F2 kolon seti TAM (iscilik "kolonlar kayboldu" dersi)',
      ['col0', 'col1', 'col_cins', 'col_baglanti', 'col_cap', 'col_boy', 'col_kod', 'col_not', 'col2', 'col3'].every((f) => fields.includes(f)),
      fields.join(','));
    check('F3 satir yok', Array.isArray(sheet.rowData) && sheet.rowData.length === 0, `${sheet.rowData?.length}`);
    check('F4 sheet adi liste adi', sheet.name === 'kirke - 07.08.2026', sheet.name);
  }

  console.log(`\nSONUC: ${passed} PASS / ${failures.length} FAIL`);
  if (failures.length > 0) {
    console.log('KIRMIZILAR:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
})();
