/**
 * ÖK2 — FIRMA IZOLASYONU (ADIM 1, 28.08.2026)
 *   npx ts-node test/firma-izolasyon-test.ts   (npm run test:firma)
 *
 * GERCEK DB gerektirir (PG). Gecici 2 firma + 3 kullanici + teklif olusturur,
 * sonunda HEPSINI siler.
 *
 * ── NEDEN BU TEST VAR ────────────────────────────────────────────────────
 * GOREV_Odeme_Altyapisi_1.md ADIM 1'in kabul olcutu (OK2):
 *   "Ayni firmadan iki kullanici AYNI teklif listesini gorur;
 *    baska firma HICBIRINI gormez."
 * Teklif suzgecleri 28.08'de `userId` yerine `firmaId` okumaya gecti. O
 * degisiklik bugun GORUNMEZ (her firmada tek kullanici var) — yani hicbir
 * mevcut test kirilmadan yanlis yazilabilirdi. Bu dosya, davet akisi gelmeden
 * ONCE o davranisi olcer: iki uyeli firma ELLE kurulur.
 *
 * ── EN KRITIK KAPI: FIRMASIZ KIMLIK ──────────────────────────────────────
 * Prisma'da `where: { firmaId: undefined }` kosulu SESSIZCE DUSURUR — firmasiz
 * bir hesap butun firmalarin tekliflerini gorurdu. `firmaId: null` ise henuz
 * atanmamis TUM satirlari doner. Ikisi de sessiz felaket; `kimlikCoz` bu yuzden
 * GURULTULU durur (403). I3/I4 bunu olcer.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { kimlikCoz } from '../src/altyapi/auth/kimlik';
import { QuoteFormatsService } from '../src/ozellik/cikti/quote-formats/quote-formats.service';
import { LibraryService } from '../src/ozellik/kutuphane/library/library.service';
import { MatchingService } from '../src/ozellik/eslestirme/matching/matching.service';
import { TerminologyService } from '../src/ozellik/eslestirme/matching/terminology.service';

const prisma = new PrismaClient();
const fakeFx: any = { getRates: async () => ({ usdTry: 40, eurTry: 45 }) };
const sahteCeviri: any = { onbellekHaritasi: async () => ({}) };

let passed = 0;
const failures: string[] = [];
const sina = (kod: string, ad: string, kosul: boolean, kanit: string) => {
  if (kosul) { passed++; console.log(`  ✅ ${kod} ${ad} — ${kanit}`); }
  else { failures.push(`${kod} ${ad} — ${kanit}`); console.log(`  ❌ ${kod} ${ad} — ${kanit}`); }
};

const damga = `izolasyon-${Date.now()}`;
const kalem = () => ({
  materialName: 'Test boru', unit: 'm', quantity: 1,
  materialUnitPrice: 100, laborUnitPrice: 50,
});

async function main() {
  console.log('── ÖK2: FIRMA IZOLASYONU ──\n');

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('ON KOSUL YOK — DB erisilemiyor (PG_REGRESSION=1 + DATABASE_URL gerekir)');
    process.exit(2);
  }

  const svc = new QuotesService(prisma as any, fakeFx, sahteCeviri);
  const temizlik: { firma: string[]; user: string[]; quote: string[]; format: string[]; marka: string[] } =
    { firma: [], user: [], quote: [], format: [], marka: [] };

  try {
    // ── KURULUM: F1 (iki uyeli) + F2 (tek uyeli) ───────────────────────
    const f1 = await (prisma as any).firma.create({ data: { ad: `${damga}-F1` } });
    const f2 = await (prisma as any).firma.create({ data: { ad: `${damga}-F2` } });
    temizlik.firma.push(f1.id, f2.id);

    const u1 = await prisma.user.create({ data: { email: `${damga}-u1@t.com`, password: 'x', firmaId: f1.id, firmaRol: 'sahip' } as any });
    const u2 = await prisma.user.create({ data: { email: `${damga}-u2@t.com`, password: 'x', firmaId: f1.id, firmaRol: 'uye' } as any });
    const u3 = await prisma.user.create({ data: { email: `${damga}-u3@t.com`, password: 'x', firmaId: f2.id, firmaRol: 'sahip' } as any });
    temizlik.user.push(u1.id, u2.id, u3.id);

    const K1 = kimlikCoz({ id: u1.id, firmaId: f1.id });   // F1 sahibi
    const K2 = kimlikCoz({ id: u2.id, firmaId: f1.id });   // F1 uyesi (DAVET EDILEN)
    const K3 = kimlikCoz({ id: u3.id, firmaId: f2.id });   // BASKA firma

    // ── U1 bir teklif kaydeder ─────────────────────────────────────────
    const teklif: any = await svc.create(K1, { title: `${damga}-teklif`, items: [kalem()] } as any);
    temizlik.quote.push(teklif.id);

    const kayit = await prisma.quote.findUnique({ where: { id: teklif.id } });
    sina('I0', 'yeni teklif FIRMA kimligini tasir (yoksa hic gorunmez)',
      (kayit as any)?.firmaId === f1.id, `firmaId=${(kayit as any)?.firmaId?.slice(0, 8)} beklenen=${f1.id.slice(0, 8)}`);
    sina('I0b', 'yeni teklif YAZARI da tasir', kayit?.userId === u1.id, `userId=${kayit?.userId?.slice(0, 8)}`);

    // ── I1: AYNI firmanin DIGER uyesi ayni teklifi GORUR ───────────────
    const listeU2 = await svc.findAll(K2);
    sina('I1 ⭐', 'ayni firmanin diger uyesi teklifi GORUR (OK2)',
      listeU2.some((q: any) => q.id === teklif.id), `u2 listesi=${listeU2.length} kayit`);

    const detayU2: any = await svc.findOne(K2, teklif.id);
    sina('I1b', 'ayni firmanin uyesi teklifi ACABILIR', detayU2?.id === teklif.id, `id=${detayU2?.id === teklif.id}`);

    // ── I2: BASKA firma HICBIRINI gormez ───────────────────────────────
    const listeU3 = await svc.findAll(K3);
    sina('I2 ⭐', 'baska firma teklifi GORMEZ (OK2)',
      !listeU3.some((q: any) => q.id === teklif.id), `u3 listesi=${listeU3.length} kayit`);

    let acabildi = true;
    try { await svc.findOne(K3, teklif.id); } catch { acabildi = false; }
    sina('I2b', 'baska firma teklifi ACAMAZ (404)', !acabildi, `acabildi=${acabildi}`);

    let silebildi = true;
    try { await svc.remove(K3, teklif.id); } catch { silebildi = false; }
    const halaVar = await prisma.quote.findUnique({ where: { id: teklif.id } });
    sina('I2c ⭐', 'baska firma teklifi SILEMEZ ve teklif YERINDE durur',
      !silebildi && !!halaVar, `silebildi=${silebildi}, kayit=${!!halaVar}`);

    // ── I2d: baska firma REVIZE edemez (guncelleme yolu ayri suzgec) ───
    let revizeEdebildi = true;
    try { await svc.create(K3, { title: 'ele gecirme', items: [kalem()] } as any, teklif.id); }
    catch { revizeEdebildi = false; }
    const baslikSonra = await prisma.quote.findUnique({ where: { id: teklif.id }, select: { title: true } });
    sina('I2d ⭐', 'baska firma teklifi REVIZE edemez (baslik degismedi)',
      !revizeEdebildi && baslikSonra?.title === `${damga}-teklif`, `revize=${revizeEdebildi}, baslik=${baslikSonra?.title}`);

    // ── I2e: AYNI firmanin uyesi revize EDEBILIR ───────────────────────
    await svc.create(K2, { title: `${damga}-revize`, items: [kalem()] } as any, teklif.id);
    const baslikRevize = await prisma.quote.findUnique({ where: { id: teklif.id }, select: { title: true } });
    sina('I2e ⭐', 'ayni firmanin uyesi teklifi REVIZE edebilir',
      baslikRevize?.title === `${damga}-revize`, `baslik=${baslikRevize?.title}`);

    // ── I3/I4: FIRMASIZ kimlik gecemez ─────────────────────────────────
    let firmasizGecti = true;
    try { kimlikCoz({ id: u1.id, firmaId: null }); } catch { firmasizGecti = false; }
    sina('I3 ⭐', 'firmaId NULL kimlik REDDEDILIR (sessiz capraz-tenant sizinti yok)',
      !firmasizGecti, `gecti=${firmasizGecti}`);

    let tanimsizGecti = true;
    try { kimlikCoz({ id: u1.id }); } catch { tanimsizGecti = false; }
    sina('I4 ⭐', 'firmaId TANIMSIZ kimlik REDDEDILIR (Prisma undefined kosulu DUSURUR)',
      !tanimsizGecti, `gecti=${tanimsizGecti}`);

    // ── I5: teklif no sayaci FIRMA basina sayar ────────────────────────
    // (Ayni firmanin iki uyesi ortak numara dizisini paylasmali.)
    const sayacF1 = await prisma.quote.count({ where: { firmaId: f1.id, quoteNo: { not: null } } as any });
    const sayacF2 = await prisma.quote.count({ where: { firmaId: f2.id, quoteNo: { not: null } } as any });
    sina('I5', 'teklif no sayaci firma bazli sorgulanabilir',
      Number.isInteger(sayacF1) && Number.isInteger(sayacF2), `F1=${sayacF1}, F2=${sayacF2}`);

    // ── F1-F4: TEKLIF FORMATI da firmaya ait (28.08 ikinci dilim) ──────
    // Format kisiye kalsaydi, uyenin actigi firma teklifi SAHIBININ
    // formatiyla basilamazdi — teklif firmanin, sablonu kisinin olurdu.
    const fmtSvc = new QuoteFormatsService(prisma as any);
    const ornek = await fmtSvc.sample();
    const fmt: any = await fmtSvc.upload(K1, ornek.buffer, 'test-format.xlsx', `${damga}-format`);
    temizlik.format.push(fmt.id);

    const fmtKayit = await (prisma as any).quoteFormat.findUnique({ where: { id: fmt.id } });
    sina('F1', 'yuklenen format FIRMA kimligini tasir',
      fmtKayit?.firmaId === f1.id, `firmaId=${fmtKayit?.firmaId?.slice(0, 8)}`);

    const fmtListeU2 = await fmtSvc.list(K2);
    sina('F2 ⭐', 'ayni firmanin uyesi formati GORUR',
      fmtListeU2.some((x: any) => x.id === fmt.id), `u2 format listesi=${fmtListeU2.length}`);

    const fmtListeU3 = await fmtSvc.list(K3);
    sina('F3 ⭐', 'baska firma formati GORMEZ',
      !fmtListeU3.some((x: any) => x.id === fmt.id), `u3 format listesi=${fmtListeU3.length}`);

    let fmtSilebildi = true;
    try { await fmtSvc.remove(K3, fmt.id); } catch { fmtSilebildi = false; }
    const fmtHalaVar = await (prisma as any).quoteFormat.findUnique({ where: { id: fmt.id } });
    sina('F4 ⭐', 'baska firma formati SILEMEZ ve format yerinde durur',
      !fmtSilebildi && !!fmtHalaVar, `silebildi=${fmtSilebildi}, kayit=${!!fmtHalaVar}`);

    // ── F5 ⭐ — MUTASYONUN ACIGA CIKARDIGI KAPI (28.08).
    //    F2-F4 yalnizca "baska firma goremez"i olcuyordu; sahiplik kontrolu
    //    KISIYE bakacak sekilde bozuldugunda ucu de YESIL kaldi (baska firma
    //    zaten baska kisi). Ayirt eden vaka: AYNI firma, FARKLI kisi.
    let uyeDokunabildi = true;
    try { await fmtSvc.preview(K2, fmt.id); } catch { uyeDokunabildi = false; }
    sina('F5 ⭐', 'ayni firmanin BASKA uyesi formati acabilir (sahiplik kisi degil FIRMA)',
      uyeDokunabildi, `uye erisebildi=${uyeDokunabildi}`);

    let uyeAdDegistirebildi = true;
    try { await fmtSvc.update(K2, fmt.id, { name: `${damga}-uye-yeniad` }); } catch { uyeAdDegistirebildi = false; }
    const fmtAd = await (prisma as any).quoteFormat.findUnique({ where: { id: fmt.id }, select: { name: true } });
    sina('F5b ⭐', 'ayni firmanin BASKA uyesi formati duzenleyebilir',
      uyeAdDegistirebildi && fmtAd?.name === `${damga}-uye-yeniad`, `ad=${fmtAd?.name}`);

    // ── L1-L4: KUTUPHANE de firmaya ait (28.08 ucuncu dilim) ───────────
    const libSvc = new LibraryService(prisma as any, { learnFamilyAliases: async () => undefined } as any);
    await libSvc.createManualBrand(K1, {
      brandName: `${damga}-marka`, discipline: 'mechanical',
      rows: [{ ad: 'Test Borusu', price: 100 }],
    } as any);
    const marka = await prisma.brand.findFirst({ where: { name: `${damga}-marka` } });
    if (marka) temizlik.marka.push(marka.id);

    const kutupU2 = await libSvc.findAll(K2);
    sina('L1 ⭐', 'ayni firmanin uyesi kutuphane satirini GORUR',
      kutupU2.some((r: any) => r.brandId === marka?.id), `u2 kutuphane=${kutupU2.length} satir`);

    const kutupU3 = await libSvc.findAll(K3);
    sina('L2 ⭐', 'baska firma kutuphane satirini GORMEZ',
      !kutupU3.some((r: any) => r.brandId === marka?.id), `u3 kutuphane=${kutupU3.length} satir`);

    const kisiselListe = await prisma.priceList.findFirst({ where: { brandId: marka?.id ?? '' } });
    sina('L3 ⭐', 'kutuphane akisinin actigi liste FIRMA sahipligi tasir',
      (kisiselListe as any)?.ownerFirmaId === f1.id,
      `ownerFirmaId=${(kisiselListe as any)?.ownerFirmaId?.slice(0, 8)} ownerUserId=${(kisiselListe as any)?.ownerUserId?.slice(0, 8)}`);

    let yabanciAktarabildi = true;
    try {
      await libSvc.importPriceList(K3, { brandId: marka?.id ?? '', priceListId: kisiselListe?.id ?? '' } as any);
    } catch { yabanciAktarabildi = false; }
    sina('L4 ⭐', 'baska firma bu kisisel listeyi kendi kutuphanesine AKTARAMAZ',
      !yabanciAktarabildi, `aktarabildi=${yabanciAktarabildi}`);

    // ⚠ try/catch SART: servis bos sonucta NotFound FIRLATIR; yakalanmazsa
    //    test COKER ve kapi kirmizi yanmak yerine yigin izi basar (bir
    //    mutasyon tam boyle kacmisti).
    let sheetsU2: any = null;
    try { sheetsU2 = await libSvc.getBrandSheets(K2, marka?.id ?? ''); } catch { sheetsU2 = null; }
    sina('L5 ⭐', 'ayni firmanin uyesi marka sayfalarini ACABILIR',
      !!sheetsU2 && !!sheetsU2.sheets, `sheets=${!!sheetsU2?.sheets}`);

    // ── L6 ⭐ — AYIRT EDICI VAKA (format diliminde ogrenilen ders).
    //    L4 "baska firma aktaramaz" der ama baska firma zaten baska KISI;
    //    sahiplik kapisi yanlislikla kisiye baglansa da L4 yesil kalirdi.
    //    Ayirt eden: AYNI firma, FARKLI kisi — o da aktarabilmeli.
    let uyeAktarabildi = true;
    try {
      await libSvc.importPriceList(K2, { brandId: marka?.id ?? '', priceListId: kisiselListe?.id ?? '' } as any);
    } catch { uyeAktarabildi = false; }
    sina('L6 ⭐', 'ayni firmanin BASKA uyesi kisisel listeyi aktarabilir (sahiplik FIRMA)',
      uyeAktarabildi, `aktarabildi=${uyeAktarabildi}`);

    // ── H/T: YAZMA TARAFI KOPRUSU (28.08) ──────────────────────────────
    // Eslestirme motorunun OKUMALARI hala kisi bazli. Ama yazdigi satirlar
    // firmaId tasimazsa, okuma firmaya dondugu gun o gune kadar ogrenilen
    // HER SEY gorunmez olur. Backfill tek atimlikti; bu kapilar yeni
    // satirlarin firmayi isaretledigini olcer.
    const terminoloji = new TerminologyService(prisma as any);
    const matchSvc = new MatchingService(prisma as any, terminoloji, fakeFx);

    await matchSvc.remember(u1.id, marka?.id ?? '', 'ÇEKVALF DN 50', 'Yaylı Çekvalf DN50');
    const hafizaSatirlari = await (prisma as any).eslesmeHafizasi.findMany({ where: { userId: u1.id } });
    sina('H1 ⭐', 'ogrenilen eslesme hafizasi FIRMA kimligini yazar',
      hafizaSatirlari.length > 0 && hafizaSatirlari.every((r: any) => r.firmaId === f1.id),
      `satir=${hafizaSatirlari.length}, firmaId dolu=${hafizaSatirlari.filter((r: any) => r.firmaId === f1.id).length}`);

    // H2 — IYILESME: firmaId'si BOS eski bir satir, yeniden teyit edilince duzelmeli.
    if (hafizaSatirlari.length > 0) {
      await (prisma as any).eslesmeHafizasi.update({
        where: { id: hafizaSatirlari[0].id }, data: { firmaId: null },
      });
      await matchSvc.remember(u1.id, marka?.id ?? '', 'ÇEKVALF DN 50', 'Yaylı Çekvalf DN50');
      const iyilesen = await (prisma as any).eslesmeHafizasi.findUnique({ where: { id: hafizaSatirlari[0].id } });
      sina('H2 ⭐', 'firmaId BOS eski satir, yeniden teyitte KENDILIGINDEN iyilesir',
        iyilesen?.firmaId === f1.id, `firmaId=${iyilesen?.firmaId?.slice(0, 8) ?? 'null'}`);
    }

    await terminoloji.saveUserAlias(u1.id, { alias: `${damga}-alias`, canonical: 'test_kanon' } as any);
    const aliasSatiri = await (prisma as any).terminologyAlias.findFirst({ where: { alias: `${damga}-alias` } });
    sina('T1 ⭐', 'kullanicinin sozluk kaydi FIRMA kimligini yazar',
      aliasSatiri?.firmaId === f1.id, `firmaId=${aliasSatiri?.firmaId?.slice(0, 8) ?? 'null'}`);

    // T4 ⭐ — H2'nin IKIZI. T1 yalniz CREATE dalini olcer; UPDATE dali sessizce
    //    geride kalabilir (nitekim kalmisti). Ayni alias yeniden kaydedilince
    //    firmaId'si BOS eski kayit da iyilesmeli.
    if (aliasSatiri) {
      await (prisma as any).terminologyAlias.update({
        where: { id: aliasSatiri.id }, data: { firmaId: null },
      });
      await terminoloji.saveUserAlias(u1.id, { alias: `${damga}-alias`, canonical: 'test_kanon_2' } as any);
      const iyilesenAlias = await (prisma as any).terminologyAlias.findUnique({ where: { id: aliasSatiri.id } });
      sina('T4 ⭐', 'firmaId BOS alias, yeniden kaydedilince KENDILIGINDEN iyilesir (update dali)',
        iyilesenAlias?.firmaId === f1.id, `firmaId=${iyilesenAlias?.firmaId?.slice(0, 8) ?? 'null'}`);
    }

    // T2 — GLOBAL SEED yolu: userId null ise firmaId de NULL KALMALI.
    //      (TerminologyAlias'ta null = 'sistem geneli', kimlik degil.)
    await terminoloji.learnFamilyAliases([{ adBucket: `${damga}-global`, canonical: 'kanon' }], null);
    const globalSatir = await (prisma as any).terminologyAlias.findFirst({ where: { alias: `${damga}-global` } });
    sina('T2 ⭐', 'GLOBAL seed yolu firmaId YAZMAZ (null = sistem geneli, kimlik degil)',
      !!globalSatir && globalSatir.firmaId === null && globalSatir.userId === null,
      `userId=${globalSatir?.userId ?? 'null'} firmaId=${globalSatir?.firmaId ?? 'null'}`);

    // T3 — KISI yolu: library akisi terminolojiyi kullanicinin adina ogrenir.
    await terminoloji.learnFamilyAliases([{ adBucket: `${damga}-kisi`, canonical: 'kanon' }], u1.id);
    const kisiSatir = await (prisma as any).terminologyAlias.findFirst({ where: { alias: `${damga}-kisi` } });
    sina('T3 ⭐', 'ogrenilen aile alias\'i FIRMA kimligini yazar',
      kisiSatir?.firmaId === f1.id, `firmaId=${kisiSatir?.firmaId?.slice(0, 8) ?? 'null'}`);
  } finally {
    for (const id of temizlik.quote) {
      await prisma.quoteItem.deleteMany({ where: { quoteId: id } }).catch(() => {});
      await prisma.quote.delete({ where: { id } }).catch(() => {});
    }
    await prisma.quote.deleteMany({ where: { userId: { in: temizlik.user } } }).catch(() => {});
    for (const id of temizlik.format) await (prisma as any).quoteFormat.delete({ where: { id } }).catch(() => {});
    await (prisma as any).quoteFormat.deleteMany({ where: { userId: { in: temizlik.user } } }).catch(() => {});
    for (const id of temizlik.user) await prisma.user.delete({ where: { id } }).catch(() => {});
    await (prisma as any).eslesmeHafizasi.deleteMany({ where: { userId: { in: temizlik.user } } }).catch(() => {});
    await (prisma as any).terminologyAlias.deleteMany({ where: { alias: { startsWith: damga } } }).catch(() => {});
    for (const id of temizlik.marka) {
      await prisma.userLibrary.deleteMany({ where: { brandId: id } }).catch(() => {});
      await (prisma as any).productIndex.deleteMany({ where: { brandId: id } }).catch(() => {});
      await prisma.userBrandLibrary.deleteMany({ where: { brandId: id } }).catch(() => {});
      await (prisma as any).libraryList.deleteMany({ where: { brandId: id } }).catch(() => {});
      await prisma.priceList.deleteMany({ where: { brandId: id } }).catch(() => {});
      await prisma.brand.delete({ where: { id } }).catch(() => {});
    }
    for (const id of temizlik.firma) await (prisma as any).firma.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\n${'='.repeat(60)}\nÖK2 FIRMA IZOLASYONU: ${passed} PASS, ${failures.length} FAIL\n${'='.repeat(60)}`);
  if (failures.length) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
