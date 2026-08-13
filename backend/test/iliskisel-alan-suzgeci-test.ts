/**
 * TEKLIF KAYDI — ILISKISEL ALAN SUZGECI (brandId + laborFirmaId)
 *
 * NEDEN VAR: `QuoteItem.brandId` ve `laborFirmaId` istemciden SERBEST STRING
 * olarak gelir. Kayitli `sheets.rowData` eski bir marka ID'sini AYLARCA
 * tasiyabildigi icin silinmis ID gercek bir senaryodur ve dogrudan Prisma'ya
 * verilirse P2003 (foreign key) -> HTTP 500 uretir. Ayrica iscilik firmasi
 * KULLANICIYA AITTIR; baska hesabin firmasina bagli kalem izolasyonu deler.
 *
 * SEMA ASIMETRISI (bilerek):
 *   Brand      -> GLOBAL katalog (schema.prisma: userId YOK) => yalniz VARLIK
 *   LaborFirm  -> kullaniciya ait (userId var)               => VARLIK + SAHIPLIK
 *
 * SOZLESME (bu test neyi muhurler):
 *   S1 · gecerli marka ID'si YAZILIR
 *   S2 · olmayan/silinmis marka ID'si null olur (kayit BLOKLANMAZ)
 *   S3 · kullanicinin KENDI firmasi YAZILIR
 *   S4 · BASKA kullanicinin firmasi null olur (izolasyon)
 *   S5 · olmayan/silinmis firma null olur
 *   S6 · hicbir ID gonderilmediginde dogrulama sorgusu HIC KOSMAZ (bos IN
 *        sorgusu atilmasin — mevcut test yalnizca bu kisa-devre sayesinde
 *        ayakta kaliyordu, yani mekanizmaya hic dokunmuyordu)
 *   S7 · dusen her iliski LOG'a yazilir (sessiz kayip yasak) ve baskasinin
 *        firmasi ile silinmis firma AYRI mesajlarla ayrilir — biri istismar/
 *        bug sinyali, digeri siradan bayat veri
 *
 * ⚠ Kayit BILEREK BLOKLANMAZ (BadRequestException ATILMAZ): logout
 * sessionStorage'i temizlemedigi icin hesap degistiren kullanicinin taslagi
 * eski firma ID'si tasiyabilir; sert 400 teklifin TAMAMINI kaydedilemez
 * yapardi — kopan bir iliskiden kotu.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · diger = FAIL.
 * DB GEREKTIRMEZ: prisma sahte.
 */
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';

/** Sahte CeviriService — bu testler dil gecmez, sheetleriCevir erken doner;
 *  onbellekHaritasi HIC cagrilmaz. Constructor 13.08'de 3 parametreye cikti;
 *  tsc test/ dizinini KAPSAMADIGI icin kirigi ancak regresyon yakaladi. */
const sahteCeviri = { onbellekHaritasi: async () => ({}) };
let pass = 0;
const fails: string[] = [];
const sina = (kod: string, ad: string, kosul: boolean, kanit: string) => {
  if (kosul) { pass++; console.log(`  ✅ ${kod} ${ad} — ${kanit}`); }
  else { fails.push(`${kod} ${ad} — ${kanit}`); console.log(`  ❌ ${kod} ${ad} — ${kanit}`); }
};

const BENIM = 'user-ben';
const BASKASI = 'user-baskasi';
const MARKA_VAR = 'brand-cayirova';
const MARKA_YOK = 'brand-silinmis';
const FIRMA_BENIM = 'firm-yasin';
const FIRMA_BASKASI = 'firm-rakip';
const FIRMA_YOK = 'firm-silinmis';

/** Sahte prisma: gercek veritabani yerine bilinen kayitlari dondurur. */
function sahtePrisma() {
  const cagrilar = { brandFindMany: 0, laborFirmFindMany: 0 };
  let yakalanan: any[] = [];
  const prisma: any = {
    brand: {
      findMany: async ({ where }: any) => {
        cagrilar.brandFindMany++;
        const istenen: string[] = where?.id?.in ?? [];
        return istenen.filter((id) => id === MARKA_VAR).map((id) => ({ id }));
      },
    },
    laborFirm: {
      findMany: async ({ where }: any) => {
        cagrilar.laborFirmFindMany++;
        const istenen: string[] = where?.id?.in ?? [];
        const kayitlar = [
          { id: FIRMA_BENIM, userId: BENIM },
          { id: FIRMA_BASKASI, userId: BASKASI },
        ];
        return kayitlar.filter((k) => istenen.includes(k.id));
      },
    },
    quote: {
      create: async (arg: any) => {
        yakalanan = arg?.data?.items?.create ?? [];
        return { id: 'q1', items: [] };
      },
    },
  };
  return { prisma, cagrilar, sonuc: () => yakalanan };
}

const kalem = (ek: Record<string, any>) => ({
  materialName: 'Test boru', unit: 'm', quantity: 1,
  materialUnitPrice: 100, laborUnitPrice: 50, ...ek,
});

async function main() {
  console.log('── TEKLIF KAYDI: ILISKISEL ALAN SUZGECI ──\n');
  const fakeFx: any = { getRates: async () => ({ usdTry: 40, eurTry: 45 }) };

  // ── S1-S5: gecerli / gecersiz / baskasinin ───────────────────────────
  {
    const { prisma, sonuc } = sahtePrisma();
    const service = new QuotesService(prisma, fakeFx, sahteCeviri as any);
    const uyarilar: string[] = [];
    const eskiWarn = console.warn;
    console.warn = (...a: any[]) => { uyarilar.push(a.join(' ')); };
    try {
      await service.create(BENIM, {
        title: 'T', items: [
          kalem({ brandId: MARKA_VAR, laborFirmaId: FIRMA_BENIM }),
          kalem({ brandId: MARKA_YOK, laborFirmaId: FIRMA_BASKASI }),
          kalem({ laborFirmaId: FIRMA_YOK }),
        ],
      } as any);
    } finally { console.warn = eskiWarn; }

    const k = sonuc();
    sina('S1', 'gecerli marka YAZILIR',
      k[0].brandId === MARKA_VAR, `brandId=${k[0].brandId}`);
    sina('S2', 'olmayan marka null olur (kayit bloklanmaz)',
      k[1].brandId === null && k.length === 3, `brandId=${k[1].brandId}, kalem=${k.length}`);
    sina('S3', 'KENDI firmam YAZILIR',
      k[0].laborFirmaId === FIRMA_BENIM, `laborFirmaId=${k[0].laborFirmaId}`);
    sina('S4', 'BASKA kullanicinin firmasi null olur (izolasyon)',
      k[1].laborFirmaId === null, `laborFirmaId=${k[1].laborFirmaId}`);
    sina('S5', 'olmayan firma null olur',
      k[2].laborFirmaId === null, `laborFirmaId=${k[2].laborFirmaId}`);

    // S7 — sessiz kayip yasak: uc dusme de AYRI mesajla loglanir
    const marka = uyarilar.some((u) => u.includes('marka') && u.includes(MARKA_YOK));
    const baska = uyarilar.some((u) => u.includes('BASKA') && u.includes(FIRMA_BASKASI));
    const silin = uyarilar.some((u) => u.includes('silinmis') && u.includes(FIRMA_YOK));
    sina('S7a', 'dusen marka loglanir', marka, `uyari=${uyarilar.length}`);
    sina('S7b', 'BASKA hesabin firmasi AYRI loglanir (istismar/bug sinyali)', baska, `uyari=${uyarilar.length}`);
    sina('S7c', 'silinmis firma AYRI loglanir', silin, `uyari=${uyarilar.length}`);
  }

  // ── S6: ID yoksa dogrulama sorgusu KOSMAZ ────────────────────────────
  {
    const { prisma, cagrilar, sonuc } = sahtePrisma();
    const service = new QuotesService(prisma, fakeFx, sahteCeviri as any);
    await service.create(BENIM, { title: 'T', items: [kalem({})] } as any);
    sina('S6', 'ID gonderilmezse dogrulama sorgusu HIC kosmaz',
      cagrilar.brandFindMany === 0 && cagrilar.laborFirmFindMany === 0,
      `brand=${cagrilar.brandFindMany}, laborFirm=${cagrilar.laborFirmFindMany}`);
    sina('S6b', 'ID yokken alanlar null yazilir',
      sonuc()[0].brandId === null && sonuc()[0].laborFirmaId === null,
      `brandId=${sonuc()[0].brandId}, laborFirmaId=${sonuc()[0].laborFirmaId}`);
  }

  console.log(`\n${pass} PASS, ${fails.length} FAIL`);
  if (fails.length) { fails.forEach((f) => console.log(`  ❌ ${f}`)); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error('HATA:', e); process.exit(1); });
