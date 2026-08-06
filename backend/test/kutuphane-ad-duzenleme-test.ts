/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  KUTUPHANE: AD DUZENLEME + SATIR SILME  (`npm run test:kb-ad`)
 *
 *  KULLANICI BILDIRIMI (06.08): "kutuphanede bir verinin adini degistirip
 *  kaydet dedigimde kaydetmiyor. ilave eklediklerimi ise silemiyorum."
 *
 *  ── OLCULEN KOK NEDEN (iki KATMAN, biri digerini gizliyordu) ──────────────
 *  1. Frontend `handleSave` payload'inda `materialName` BILEREK yoktu. Gerekce
 *     dogruydu ama YANLIS ALANA uygulanmisti: "Material.name kisa surumle
 *     ezilmesin (kaynak sadakati)". Oysa `saveBrandSheets` PAYLASILAN
 *     `Material`e HIC dokunmaz — yalniz `UserLibrary` (kullanicinin KENDI
 *     kopyasi) satirini gunceller. Yani korunan sey zaten risk altinda degildi;
 *     bedeli kullanicinin adi hic degistirememesi oldu.
 *  2. Frontend duzeltilse BILE yetmezdi: sheet uretici adi
 *     `col1 = adRaw ?? materialName` sirasiyla okur (library-sheet-builder).
 *     `adRaw` doluyken yalniz `materialName` yazmak, degisikligi KULLANICININ
 *     GORMEDIGI bir alana yazmak demektir — "Kaydedildi" der, ekran degismez.
 *  ★ Ikinci katman olculmeden birinci katman duzeltilseydi bug KAPANMIS
 *    SANILIRDI. Bu dosyanin B blogu tam olarak o tuzagi kilitler.
 *
 *  ── KORUNAN SOZLESME ─────────────────────────────────────────────────────
 *  A) Kullanici bir kutuphane satirinin adini degistirdiginde, degisiklik
 *     KULLANICININ GORDUGU alana yazilir ve ekranda gorunur.
 *  B) Paylasilan katalog (`Material`) ASLA degismez — sadakat korunur.
 *  C) Ad disindaki duzenlemeler (fiyat/iskonto/birim) eskisi gibi calisir.
 *
 *  DB GEREKMEZ: sahte Prisma + saf sheet uretici.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { buildLibrarySheetRows, LibrarySheetItem } from '../src/ozellik/kutuphane/library/library-sheet-builder';
import { LibraryService } from '../src/ozellik/kutuphane/library/library.service';

let passed = 0;
const failures: string[] = [];
function check(ad: string, kosul: boolean, detay?: string) {
  if (kosul) { passed++; console.log(`  PASS: ${ad}`); }
  else { failures.push(`${ad}${detay ? ` — ${detay}` : ''}`); console.log(`  FAIL: ${ad}${detay ? ` — ${detay}` : ''}`); }
}

// ── SAHTE PRISMA: update cagrilarini YAKALAR, baska hicbir sey yapmaz ────────
type Yakalanan = { where: any; data: any };
function sahtePrisma(mevcut: any) {
  const updates: Yakalanan[] = [];
  const materialUpdates: Yakalanan[] = [];
  return {
    updates,
    materialUpdates,
    client: {
      userLibrary: {
        findFirst: async () => mevcut,
        update: async (arg: Yakalanan) => { updates.push(arg); return { ...mevcut, ...arg.data }; },
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
      },
      // Paylasilan katalog: DOKUNULURSA yakalanir (C blogu bunu olcer)
      material: {
        update: async (arg: Yakalanan) => { materialUpdates.push(arg); return {}; },
        findFirst: async () => null,
      },
      userBrandLibrary: { deleteMany: async () => ({ count: 0 }), upsert: async () => ({}), findFirst: async () => null },
      productIndex: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    } as any,
  };
}

/** saveBrandSheets'i sahte Prisma ile kosar; rebuild adimini etkisizler. */
async function kaydet(mevcut: any, dirtyRows: any[]) {
  const sahte = sahtePrisma(mevcut);
  // TerminologyService bu yolda kullanilmaz — bos nesne yeter (sahte olduğu ACIK).
  const svc = new LibraryService(sahte.client, {} as any);
  // rebuildUserBrandLibrary gercek DB ister — bu test onu DEGIL, yazma
  // kararlarini olcuyor. Etkisizlestirilir ve bu ACIKCA soylenir.
  (svc as any).rebuildUserBrandLibrary = async () => undefined;
  const sonuc = await svc.saveBrandSheets('u1', 'b1', dirtyRows);
  return { sonuc, updates: sahte.updates, materialUpdates: sahte.materialUpdates };
}

const MEVCUT = {
  id: 'li1', userId: 'u1', brandId: 'b1',
  materialName: 'Somunlu Kelepçe', adRaw: 'Somunlu Kelepçe', listPrice: 8.4, discountRate: 0, unit: 'adet',
};

(async () => {
  console.log('── A) AD DEGISIKLIGI KULLANICININ GORDUGU ALANA YAZILIR ──');
  {
    const { updates } = await kaydet(MEVCUT, [
      { libraryItemId: 'li1', materialName: 'Somunlu Kelepçe M8', listPrice: 8.4 },
    ]);
    const d = updates[0]?.data ?? {};
    check('A1 update cagrildi', updates.length === 1, `${updates.length} update`);
    check('A2 materialName yazildi', d.materialName === 'Somunlu Kelepçe M8', JSON.stringify(d.materialName));
    // ★ ASIL KRITER: ekranin OKUDUGU alan da guncellenmeli.
    check('A3 adRaw da yazildi (ekranin okudugu alan)', d.adRaw === 'Somunlu Kelepçe M8', JSON.stringify(d.adRaw));
  }
  {
    // Ad GONDERILMEDIYSE ada dokunulmaz (fiyat-only duzenleme).
    const { updates } = await kaydet(MEVCUT, [{ libraryItemId: 'li1', listPrice: 9.9 }]);
    const d = updates[0]?.data ?? {};
    check('A4 ad gonderilmediyse adRaw/materialName DOKUNULMAZ',
      d.adRaw === undefined && d.materialName === undefined, JSON.stringify(d));
    check('A5 fiyat yine yaziliyor', d.listPrice === 9.9, JSON.stringify(d.listPrice));
  }
  {
    // Anlamsiz ad (tek harf) mevcut adi SILMEMELI — var olan koruma.
    const { updates } = await kaydet(MEVCUT, [{ libraryItemId: 'li1', materialName: 'x' }]);
    const d = updates[0]?.data ?? {};
    check('A6 iki harften kisa ad YOK SAYILIR',
      d.materialName === undefined && d.adRaw === undefined, JSON.stringify(d));
  }

  console.log('── B) TUZAK KILIDI: adRaw doluyken yalniz materialName YETMEZ ──');
  {
    // Bu blok bir DAVRANISI degil, bir GERCEGI kilitler: ekran adRaw'i onceler.
    // Biri ileride "materialName yeter" diye adRaw yazimini kaldirirsa burasi
    // kizarir ve bug SESSIZCE geri gelmez.
    const item: LibrarySheetItem = {
      id: 'li1', materialName: 'YENI AD', adRaw: 'ESKI AD', listPrice: 8.4, kategori: 'Kelepçeler',
    };
    const s = buildLibrarySheetRows([item]);
    const satir = s.rowData.find((r: any) => r._isDataRow) as any;
    check('B1 sheet uretici adRaw\'i ONCELER (bu yuzden ikisi de yazilmali)',
      satir?.col1 === 'ESKI AD', `col1=${satir?.col1}`);
    const s2 = buildLibrarySheetRows([{ ...item, adRaw: 'YENI AD' }]);
    const satir2 = s2.rowData.find((r: any) => r._isDataRow) as any;
    check('B2 ikisi de guncellenince ekranda YENI ad gorunur',
      satir2?.col1 === 'YENI AD', `col1=${satir2?.col1}`);
  }

  console.log('── C) PAYLASILAN KATALOG SADAKATI ──');
  {
    const { materialUpdates } = await kaydet(MEVCUT, [
      { libraryItemId: 'li1', materialName: 'Kullanicinin Kendi Adi' },
    ]);
    check('C1 paylasilan Material HIC guncellenmedi (kaynak sadakati)',
      materialUpdates.length === 0, `${materialUpdates.length} material update`);
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════════');
  const toplam = passed + failures.length;
  if (failures.length) {
    console.log(` ✗ KUTUPHANE AD DUZENLEME: ${passed}/${toplam} gecti, ${failures.length} BASARISIZ`);
    for (const f of failures) console.log(`   ✗ ${f}`);
    console.log('════════════════════════════════════════════════════════════════');
    process.exit(1);
  }
  console.log(` ✓ KUTUPHANE AD DUZENLEME: ${passed}/${toplam} kriter gecti`);
  console.log('════════════════════════════════════════════════════════════════');
})();
