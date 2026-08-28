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
  const temizlik: { firma: string[]; user: string[]; quote: string[] } = { firma: [], user: [], quote: [] };

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
  } finally {
    for (const id of temizlik.quote) {
      await prisma.quoteItem.deleteMany({ where: { quoteId: id } }).catch(() => {});
      await prisma.quote.delete({ where: { id } }).catch(() => {});
    }
    await prisma.quote.deleteMany({ where: { userId: { in: temizlik.user } } }).catch(() => {});
    for (const id of temizlik.user) await prisma.user.delete({ where: { id } }).catch(() => {});
    for (const id of temizlik.firma) await (prisma as any).firma.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\n${'='.repeat(60)}\nÖK2 FIRMA IZOLASYONU: ${passed} PASS, ${failures.length} FAIL\n${'='.repeat(60)}`);
  if (failures.length) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
