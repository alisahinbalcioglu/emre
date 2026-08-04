/**
 * GUVENLIK UCLARI — K1/K2/K3 KIRMIZI KANIT TURU  (`npm run test:guvenlik`)
 *
 * DB GEREKTIRMEZ. Uc kusurun HEPSI ya dekorator metadata'si ya sahte
 * ExecutionContext ya sahte Prisma casusu ile olculur; gercek veriye
 * DOKUNULMAZ. Bu yuzden pakette `db: true` DEGILDIR — her kosumda calisir.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Uc iddia kod okumasiyla bulundu; bu dosya onlari OLCUYE cevirir. Yazildigi
 * gun UCU DE KIRMIZI olmak zorundadir — duzeltme AYRI istir, burada YOKTUR.
 *
 *   K1  POST /api/matching/backfill-tags · yorumu "Admin:" diyor, kod
 *       ZORLAMIYOR. Sinifta yalniz JwtAuthGuard var (matching.controller.ts:6-7),
 *       metotta hicbir sey yok (:75-78). Govde `material.findMany()` + sinirsiz
 *       dongude `material.update()` — KURESEL Material tablosu, sahiplik kolonu
 *       yok. Herhangi bir kimlikli kullanici tum katalogu yeniden yazabilir.
 *       Ayni kusur ikinci uctadir: generate-tags (:81-84), yorumu da "Admin:".
 *
 *   K2  TierGuard yalniz `context.getHandler()` okuyor (tier.guard.ts:19), oysa
 *       RolesGuard `getAllAndOverride([getHandler(), getClass()])` kullaniyor
 *       (roles.guard.ts:10-13). LaborController @RequireTier'i SINIF duzeyine
 *       koydugu icin (labor.controller.ts:11) metadata bulunamiyor ve guard
 *       :20'de sessizce `return true` diyor. LaborItem KURESEL katalog
 *       (schema.prisma:493-506, sahiplik kolonu yok) ve LaborPrice CASCADE
 *       (:574) → core paketli bir kullanici DELETE /api/labor/:id ile TUM
 *       firmalarin iscilik fiyatlarini goturebilir.
 *
 *   K3  ⚠ RAPORUN "UC KORUMASIZ" IDDIASI YANLIS CIKTI — olculdu:
 *       materials.controller.ts:55-57 zaten RolesGuard + @Roles('admin')
 *       tasiyor. GERCEK kusur SERVISTE: materials.service.ts:66-70
 *       `deleteMany({ where: { materialId, brandId } })` — (a) varlik kontrolu
 *       YOK (kardes `remove`/`update` findUnique + NotFoundException yapiyor),
 *       (b) `priceListId` filtresi YOK, oysa MaterialPrice.priceListId opsiyonel
 *       (schema.prisma:280-281) → o marka+malzeme icin TUM listelerdeki fiyat
 *       gider, (c) YAZMA ile SILME ayni kumeyi hedeflemiyor: setPrice (:48-63)
 *       yalniz `priceListId: null` satirini upsert ediyor, deletePrice hepsini
 *       siliyor. FE'de cagiran BULUNAMADI (olu uc) → davranis testi degil
 *       SOZLESME testi yazildi: uc ya dogru kapsamla korunur ya kaldirilir.
 *       SILME ONERISI UYGULANMADI — kullanici karari.
 *
 * ── OLCUTU ONCE DOGRULA (O bloklari) ────────────────────────────────────
 * Her kusurun yaninda, AYNI olcume tabi tutulan SAGLAM bir ornek var. Amac:
 * "null geldi" sonucunun bozuk probe'dan degil GERCEK YOKLUKTAN geldigini
 * kanitlamak. O bloklari BUGUN YESIL olmak zorunda; kirmiziyalarsa once
 * olcutun kendisi bozuktur, urun degil.
 *
 * ── ★ KALKAN assertleri ─────────────────────────────────────────────────
 * K1'in en kolay ama YANLIS duzeltmesi sinif duzeyine @Roles('admin') koymak;
 * bu, ayni controller'daki ALTI normal-kullanici ucunu birden kirar. KALKAN
 * assertleri bugun YESIL ve oyle KALMALI — kirilirlarsa duzeltme fazla genis
 * demektir.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { MatchingController } from '../src/ozellik/eslestirme/matching/matching.controller';
import { LaborMatchingController } from '../src/ozellik/eslestirme/labor-matching/labor-matching.controller';
import { ROLES_KEY } from '../src/altyapi/auth/decorators/roles.decorator';

import { LaborController } from '../src/ozellik/kutuphane/labor/labor.controller';
import { AiController } from '../src/ozellik/giris/ai/ai.controller';
import { TierGuard, TIER_KEY } from '../src/altyapi/auth/guards/tier.guard';

import { MaterialsController } from '../src/ozellik/kutuphane/materials/materials.controller';
import { MaterialsService } from '../src/ozellik/kutuphane/materials/materials.service';

// K4 — onay bayraginin HTTP→servis kablolamasi (sahte servisle, DB'siz)
import { BrandsController } from '../src/ozellik/kutuphane/brands/brands.controller';
import { AdminController } from '../src/ozellik/kutuphane/admin/admin.controller';

let passed = 0; let failed = 0; const failures: string[] = [];
const check = (ad: string, kosul: boolean, kanit?: string) => {
  if (kosul) { passed++; console.log(`PASS: ${ad}`); } else {
    failed++; failures.push(`${ad}${kanit ? ` — ${kanit}` : ''}`);
    console.log(`FAIL: ${ad}${kanit ? ` — ${kanit}` : ''}`);
  }
};

const reflector = new Reflector();

/** RolesGuard'in FIILEN okudugu sey: metot + sinif, metot ezer (roles.guard.ts:10-13). */
const rolleriOku = (handler: any, cls: any): string[] | null =>
  reflector.getAllAndOverride<string[]>(ROLES_KEY, [handler, cls]) ?? null;

/** Nest'in etkin guard kumesi: sinif duzeyi + metot duzeyi birlesimi. */
const guardAdlari = (handler: any, cls: any): string[] => [
  ...((Reflect.getMetadata('__guards__', cls) ?? []) as any[]),
  ...((Reflect.getMetadata('__guards__', handler) ?? []) as any[]),
].map((g: any) => g?.name ?? String(g));

// ══════════════════════════════════════════════════════════════════════════
// K1 — POST /api/matching/backfill-tags YETKI ACIGI
// ══════════════════════════════════════════════════════════════════════════
function k1() {
  console.log('\n── K1: matching admin uclari korumasiz ───────────────────');
  const mProto: any = MatchingController.prototype;
  const lmProto: any = LaborMatchingController.prototype;

  // ── FIXTURE DOLU MU (bos-kume yalanci yesil kapisi) ────────────────────
  // Metot adi yanlis yazilirsa `undefined` uzerinden okunan metadata da null
  // doner ve testi "kusur var" sanirim. Once metotlarin GERCEKTEN var oldugunu
  // kanitla.
  check('K1-F1 KAPI: MatchingController.backfillTags bir fonksiyon',
    typeof mProto.backfillTags === 'function', `tip=${typeof mProto.backfillTags}`);
  check('K1-F2 KAPI: MatchingController.generateTags bir fonksiyon',
    typeof mProto.generateTags === 'function', `tip=${typeof mProto.generateTags}`);

  // ── O1 OLCUT KONTROL VAKASI ───────────────────────────────────────────
  // AYNI iki okuma, DOGRU yazilmis kardes uca uygulanir: labor-matching
  // controller'i da sinifta yalniz JwtAuthGuard tutar ama admin korumasini
  // METOT duzeyine koyar (labor-matching.controller.ts:43-45). Burasi YESIL
  // ise, K1'deki null'lar bozuk probe degil GERCEK YOKLUKTUR.
  check('O1 KAPI: LaborMatchingController.backfillTags bir fonksiyon',
    typeof lmProto.backfillTags === 'function', `tip=${typeof lmProto.backfillTags}`);
  check('O1-a OLCUT: ayni okuma saglam ucta rol goruyor (roles=[admin])',
    JSON.stringify(rolleriOku(lmProto.backfillTags, LaborMatchingController)) === JSON.stringify(['admin']),
    `roles=${JSON.stringify(rolleriOku(lmProto.backfillTags, LaborMatchingController))}`);
  check('O1-b OLCUT: ayni okuma saglam ucta RolesGuard goruyor',
    guardAdlari(lmProto.backfillTags, LaborMatchingController).includes('RolesGuard'),
    `guards=${JSON.stringify(guardAdlari(lmProto.backfillTags, LaborMatchingController))}`);

  // ── IDDIA (bugun KIRMIZI) ─────────────────────────────────────────────
  check("K1-a ⭐ backfill-tags admin rolu ISTEMELI (roles=['admin'])",
    JSON.stringify(rolleriOku(mProto.backfillTags, MatchingController)) === JSON.stringify(['admin']),
    `roles=${JSON.stringify(rolleriOku(mProto.backfillTags, MatchingController))}`);
  check('K1-b ⭐ backfill-tags ucuna RolesGuard bagli OLMALI',
    guardAdlari(mProto.backfillTags, MatchingController).includes('RolesGuard'),
    `guards=${JSON.stringify(guardAdlari(mProto.backfillTags, MatchingController))}`);
  check("K1-c ⭐ generate-tags admin rolu ISTEMELI (yorumu :80 'Admin:' diyor)",
    JSON.stringify(rolleriOku(mProto.generateTags, MatchingController)) === JSON.stringify(['admin']),
    `roles=${JSON.stringify(rolleriOku(mProto.generateTags, MatchingController))}`);
  check('K1-d ⭐ generate-tags ucuna RolesGuard bagli OLMALI',
    guardAdlari(mProto.generateTags, MatchingController).includes('RolesGuard'),
    `guards=${JSON.stringify(guardAdlari(mProto.generateTags, MatchingController))}`);

  // ── ★ KALKAN: normal kullanici uclari admin ISTEMEMELI ────────────────
  // Sinif duzeyine @Roles('admin') konursa bu ALTISI birden kirilir. Her uc
  // icin AYRI assert — biri kirilirsa hangisi oldugu gorunsun.
  const normalUclar: Array<[string, string]> = [
    ['bulkMatch', 'POST /matching/bulk-match · quotes/new/page.tsx:526,1070,1845'],
    ['remember', 'POST /matching/remember · ExcelGrid.tsx:492'],
    ['indexHealth', 'GET /matching/index-health · quotes/new/page.tsx:409'],
    ['listAliases', 'GET /matching/aliases · terminology.listAliases(userId) kullanici-kapsamli'],
    ['saveAlias', 'POST /matching/aliases · ExcelGrid.tsx:515'],
    ['deleteAlias', 'DELETE /matching/aliases/:id · deactivateAlias(userId,id) kullanici-kapsamli'],
  ];
  check('K1-F3 KAPI: alti normal ucun HEPSI fonksiyon (fixture dolu)',
    normalUclar.length === 6 && normalUclar.every(([ad]) => typeof mProto[ad] === 'function'),
    `tipler=${normalUclar.map(([ad]) => `${ad}:${typeof mProto[ad]}`).join(', ')}`);
  for (const [ad, nerede] of normalUclar) {
    check(`K1-KALKAN ${ad} admin rolu ISTEMEMELI — ${nerede}`,
      rolleriOku(mProto[ad], MatchingController) === null,
      `roles=${JSON.stringify(rolleriOku(mProto[ad], MatchingController))}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// K2 — TierGuard SINIF-DUZEYI @RequireTier'i GORMUYOR
// ══════════════════════════════════════════════════════════════════════════
/**
 * NEDEN DAVRANIS TESTI (metadata sekli degil): iddia "metadata yok" degil,
 * "guard yetkisiz kullaniciyi GECIRIYOR". Metadata'nin yoklugu ara sonuc;
 * kullaniciyi vuran sey guard'in `true` donmesidir. Bu yuzden gercek TierGuard
 * gercek Reflector ile kurulur, yalniz Prisma sahtelenir (tier sabiti) ve
 * ExecutionContext taklit edilir. Duzeltme ister guard'i getAllAndOverride'a
 * cevirsin, ister dekoratoru metot duzeyine tasisin — bu test IKISINDE DE
 * yesile doner, yani belirli bir uygulamaya degil SOZLESMEYE bagli.
 */
const sahteCtx = (handler: any, cls: any, user: any): any => ({
  getHandler: () => handler,
  getClass: () => cls,
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
});
const sahtePrisma = (tier: string): any => ({
  user: { findUnique: async () => ({ tier }) },
});

async function gecerMi(handler: any, cls: any, tier: string): Promise<{ gecti: boolean; not: string }> {
  const guard = new TierGuard(new Reflector(), sahtePrisma(tier));
  try {
    const r = await guard.canActivate(sahteCtx(handler, cls, { id: 'u-test', sub: 'u-test' }));
    return { gecti: r === true, not: `canActivate=${JSON.stringify(r)}` };
  } catch (e: any) {
    return { gecti: false, not: `${e?.constructor?.name}: ${e?.message}` };
  }
}

async function k2() {
  console.log('\n── K2: TierGuard sinif-duzeyi sapmasi ────────────────────');
  const lProto: any = LaborController.prototype;
  const aProto: any = AiController.prototype;

  // ── FIXTURE DOLU MU ───────────────────────────────────────────────────
  check("K2-F1 KAPI: LaborController SINIFINDA @RequireTier('pro') VAR",
    JSON.stringify(Reflect.getMetadata(TIER_KEY, LaborController)) === JSON.stringify(['pro']),
    `sinif tier=${JSON.stringify(Reflect.getMetadata(TIER_KEY, LaborController) ?? null)}`);
  const laborUclar = ['findAll', 'findOne', 'create', 'update', 'remove'];
  check('K2-F2 KAPI: bes labor ucunun HEPSI fonksiyon (fixture dolu)',
    laborUclar.length === 5 && laborUclar.every((u) => typeof lProto[u] === 'function'),
    `tipler=${laborUclar.map((u) => `${u}:${typeof lProto[u]}`).join(', ')}`);
  check('K2-F3 KAPI: LaborController etkin guard listesinde TierGuard var',
    guardAdlari(lProto.remove, LaborController).includes('TierGuard'),
    `guards=${JSON.stringify(guardAdlari(lProto.remove, LaborController))}`);

  // ── O2/O3 OLCUT KONTROL VAKALARI ──────────────────────────────────────
  // AiController @RequireTier'i METOT duzeyine koyar (ai.controller.ts:15) —
  // yani guard'in okudugu yere. Bu iki assert kosumun kendisini sinar:
  //  O2 → duzenek RED uretebiliyor mu (yetersiz paket gercekten engelleniyor)
  //  O3 → duzenek her seye RED demiyor mu (yeterli paket geciyor)
  // Ikisi de yesil olmadan K2 assertlerinin "gecti" sonucu anlamsizdir.
  const o2 = await gecerMi(aProto.analyze, AiController, 'core');
  check('O2 OLCUT: metot-duzeyi tier ile CORE kullanici ENGELLENIYOR',
    o2.gecti === false, o2.not);
  const o3 = await gecerMi(aProto.analyze, AiController, 'pro');
  check('O3 OLCUT: metot-duzeyi tier ile PRO kullanici GECIYOR',
    o3.gecti === true, o3.not);

  // ── IDDIA (bugun KIRMIZI) ─────────────────────────────────────────────
  // Her uc icin AYRI assert: rapor yalniz DELETE'i sayiyordu, oysa okuma
  // uclari da acik (paket/gelir sizintisi boyutu).
  for (const uc of laborUclar) {
    const r = await gecerMi(lProto[uc], LaborController, 'core');
    check(`K2-${uc} ⭐ CORE kullanici /labor ${uc} ucunda ENGELLENMELI (sinif tier'i 'pro')`,
      r.gecti === false, r.not);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// K3 — materials deletePrice: varlik kontrolu ve kapsam SOZLESMESI
// ══════════════════════════════════════════════════════════════════════════
/**
 * NEDEN SAHTE PRISMA (DB fixture degil): uc OLU (FE/BE/test genelinde cagiran
 * yok), yani "gercek davranisi" gozlemleyecek bir kullanici yolu yok. Olculen
 * sey servisin DB'ye NE SORDUGU — bu sozlesmedir ve DB'siz, gercek veriye
 * dokunmadan, deterministik olcelir.
 */
type Cagri = { yol: string; arg: any };
function casusPrisma(secenek: { materialVar: boolean; silinen: number }) {
  const cagrilar: Cagri[] = [];
  const kaydet = (yol: string, don: (arg: any) => any) => async (arg: any) => {
    cagrilar.push({ yol, arg });
    return don(arg);
  };
  const prisma: any = {
    material: {
      findUnique: kaydet('material.findUnique', () => (secenek.materialVar ? { id: 'm1', name: 'X' } : null)),
      findMany: kaydet('material.findMany', () => []),
      create: kaydet('material.create', () => ({ id: 'm1' })),
      update: kaydet('material.update', () => ({ id: 'm1' })),
      delete: kaydet('material.delete', () => ({ id: 'm1' })),
    },
    materialPrice: {
      findUnique: kaydet('materialPrice.findUnique', () => null),
      findFirst: kaydet('materialPrice.findFirst', () => null),
      findMany: kaydet('materialPrice.findMany', () => []),
      count: kaydet('materialPrice.count', () => 0),
      upsert: kaydet('materialPrice.upsert', () => ({ id: 'mp1' })),
      deleteMany: kaydet('materialPrice.deleteMany', () => ({ count: secenek.silinen })),
      delete: kaydet('materialPrice.delete', () => ({ id: 'mp1' })),
    },
  };
  return { prisma, cagrilar };
}

/** Ic ice `where` nesnesindeki TUM anahtarlari toplar (materialId_brandId_priceListId gibi bilesik anahtarlar dahil). */
function anahtarlar(nesne: any, biriktir: Set<string> = new Set()): Set<string> {
  if (!nesne || typeof nesne !== 'object') return biriktir;
  for (const k of Object.keys(nesne)) {
    biriktir.add(k);
    anahtarlar(nesne[k], biriktir);
  }
  return biriktir;
}

async function k3() {
  console.log('\n── K3: materials deletePrice sozlesmesi ──────────────────');
  const sProto: any = MaterialsService.prototype;
  const cProto: any = MaterialsController.prototype;

  // ── FIXTURE DOLU MU ───────────────────────────────────────────────────
  check('K3-F1 KAPI: MaterialsService.deletePrice bir fonksiyon',
    typeof sProto.deletePrice === 'function', `tip=${typeof sProto.deletePrice}`);
  check('K3-F2 KAPI: MaterialsService.setPrice bir fonksiyon (karsilastirma esi)',
    typeof sProto.setPrice === 'function', `tip=${typeof sProto.setPrice}`);

  // ── ★ KALKAN: uc BUGUN admin-korumali — raporun "korumasiz" iddiasi YANLIS
  // Sozlesmenin ilk yarisi: uc DURUYORSA korunmus DURMALI. Bugun yesil;
  // koruma sokulurse burasi kizarir.
  check("K3-KALKAN-a deletePrice ucu admin rolu ISTIYOR (bugun YESIL)",
    JSON.stringify(rolleriOku(cProto.deletePrice, MaterialsController)) === JSON.stringify(['admin']),
    `roles=${JSON.stringify(rolleriOku(cProto.deletePrice, MaterialsController))}`);
  check('K3-KALKAN-b deletePrice ucuna RolesGuard bagli (bugun YESIL)',
    guardAdlari(cProto.deletePrice, MaterialsController).includes('RolesGuard'),
    `guards=${JSON.stringify(guardAdlari(cProto.deletePrice, MaterialsController))}`);

  // ── O4 OLCUT KONTROL VAKASI: casus, NotFoundException'i gorebiliyor mu ─
  // Kardes metot `remove` (materials.service.ts:42-46) varlik kontrolu YAPAR.
  // Ayni casusla ayni cagri sekli kullanilir; buradan atma gelmezse duzenek
  // bozuktur ve K3-a'nin "atmadi" sonucu anlamsiz olur.
  {
    const { prisma } = casusPrisma({ materialVar: false, silinen: 0 });
    const svc = new MaterialsService(prisma);
    let hata: any = null;
    try { await svc.remove('yok'); } catch (e) { hata = e; }
    check('O4 OLCUT: kardes remove() olmayan kayitta NotFoundException atiyor',
      hata instanceof NotFoundException, `hata=${hata?.constructor?.name ?? 'yok'}`);
  }

  // ── O5 OLCUT KONTROL VAKASI: casus, priceListId kapsamini gorebiliyor mu ─
  // setPrice upsert'inde priceListId ACIKCA var (materials.service.ts:50-55).
  // Burasi yesilse, K3-b'deki "priceListId yok" sonucu GERCEK YOKLUKTUR.
  let yazmaAnahtarlari: string[] = [];
  {
    const { prisma, cagrilar } = casusPrisma({ materialVar: true, silinen: 0 });
    const svc = new MaterialsService(prisma);
    await svc.setPrice({ materialId: 'm1', brandId: 'b1', price: 10 } as any);
    const upsert = cagrilar.find((c) => c.yol === 'materialPrice.upsert');
    yazmaAnahtarlari = [...anahtarlar(upsert?.arg?.where)].filter((k) => ['materialId', 'brandId', 'priceListId'].includes(k)).sort();
    check('O5 OLCUT: ayni olcum setPrice yazma kapsaminda priceListId GORUYOR',
      yazmaAnahtarlari.includes('priceListId'),
      `yazma where anahtarlari=${JSON.stringify(yazmaAnahtarlari)}`);
  }

  // ── IDDIA (bugun KIRMIZI) ─────────────────────────────────────────────
  let silmeAnahtarlari: string[] = [];
  {
    const { prisma, cagrilar } = casusPrisma({ materialVar: false, silinen: 0 });
    const svc = new MaterialsService(prisma);
    let hata: any = null;
    let sonuc: any = null;
    try { sonuc = await svc.deletePrice('yok-m', 'yok-b'); } catch (e) { hata = e; }

    check('K3-a ⭐ deletePrice olmayan kayitta NotFoundException ATMALI (kardes remove/update gibi)',
      hata instanceof NotFoundException,
      `hata=${hata?.constructor?.name ?? 'yok'} · donen=${JSON.stringify(sonuc)}`);

    const dm = cagrilar.find((c) => c.yol === 'materialPrice.deleteMany');
    silmeAnahtarlari = [...anahtarlar(dm?.arg?.where)].filter((k) => ['materialId', 'brandId', 'priceListId'].includes(k)).sort();
    check('K3-b ⭐ silme kapsami priceListId TASIMALI (yoksa TUM listelerdeki fiyat gider)',
      silmeAnahtarlari.includes('priceListId'),
      `silme where anahtarlari=${JSON.stringify(silmeAnahtarlari)} · cagrilar=${JSON.stringify(cagrilar.map((c) => c.yol))}`);
  }

  check('K3-c ⭐ ASIMETRI: yazma ve silme AYNI anahtar kumesini hedeflemeli',
    JSON.stringify(yazmaAnahtarlari) === JSON.stringify(silmeAnahtarlari),
    `yazma=${JSON.stringify(yazmaAnahtarlari)} · silme=${JSON.stringify(silmeAnahtarlari)}`);
}

// ══════════════════════════════════════════════════════════════════════════
// K4 — ?onaylandi=true HTTP KATMANINDAN SERVISE GECIYOR MU (KALICI KILIT, L4)
// ══════════════════════════════════════════════════════════════════════════
/**
 * NEDEN BURADA (yeni dosya acilmadi): olculen sey bir UC SOZLESMESIDIR —
 * "HTTP katmani, kullanici ekonomisini koruyan onay bayragini servise
 * DOGRU cevirir". Bu dosya zaten uc sozlesmelerinin (rol/tier/kapsam) evi ve
 * DB'siz kosuyor; K4 de DB'siz. Yeni suite acmak package.json + SUITES +
 * KOD_HARITASI ucgenini gereksiz yere buyuturdu.
 *
 * KAPANAN DELIK: `test:d1` ve `test:a1` onay sozlesmesini olcer ama SERVISI
 * DOGRUDAN cagirir (`svc.remove(id, { kutuphaneSilmeOnayi: true })`). Ikisi de
 * DB ister, yani yerelde SKIP olur. Controller'daki
 *     remove(id, @Query('onaylandi') onaylandi?: string)
 *       → service.remove(id, { kutuphaneSilmeOnayi: onaylandi === 'true' })
 * satiri bugune dek YALNIZ Read ile dogrulanmisti. `onaylandi === 'true'`
 * karsilastirmasi sessizce silinse (ornegin `{ kutuphaneSilmeOnayi: !!onaylandi }`
 * olsa) `?onaylandi=false` bile ONAY sayilirdi ve HICBIR test kizarmazdi.
 *
 * TAM HTTP e2e GEREKMEZ (gerekce): olculen donusum controller METODUNUN
 * govdesindedir. Nest'in @Query cozumleyicisi framework'un kendi sozlesmesidir
 * — onu test etmek Nest'i test etmek olur. Metodu dogrudan cagirmak, olcmek
 * istedigimiz TEK satiri izole eder ve testi ayaga kaldirma maliyeti olmadan
 * her kosumda calistirir.
 *
 * IKI AILE (genellik): ayni desen IKI ayri controller'da yasiyor —
 * brands.controller.ts:65-67 (marka silme) ve admin.controller.ts:116-118
 * (fiyat listesi silme). Ikisi de ayri ayri olculur; tek ailede olculen bir
 * kural "ornege ozel" olabilirdi.
 */
async function k4() {
  console.log('\n── K4: ?onaylandi=true kablolamasi ───────────────────────');

  /** Servisi tamamen sahteleyip metoda GECEN argumanlari kaydeder. */
  function casusServis() {
    const cagrilar: Array<{ metot: string; args: any[] }> = [];
    const yakala = (metot: string) => async (...args: any[]) => {
      cagrilar.push({ metot, args });
      return { ok: true };
    };
    return { cagrilar, yakala };
  }

  /** Controller'i sahte servisle kurup remove/deletePriceList cagirir; gecen opts'u doner. */
  async function gecenOpts(
    hangi: 'brand' | 'priceList',
    onaylandi: string | undefined,
  ): Promise<{ opts: any; args: any[]; adet: number }> {
    const { cagrilar, yakala } = casusServis();
    if (hangi === 'brand') {
      const svc: any = { remove: yakala('remove') };
      const c = new BrandsController(svc);
      await (c as any).remove('marka-1', onaylandi);
    } else {
      const svc: any = { deletePriceList: yakala('deletePriceList') };
      // 2. bagimlilik (ExcelGridService) bu uc icin kullanilmaz — bos sahte yeter.
      const c = new AdminController(svc, {} as any);
      await (c as any).deletePriceList('liste-1', onaylandi);
    }
    const son = cagrilar[cagrilar.length - 1];
    return { opts: son?.args?.[1], args: son?.args ?? [], adet: cagrilar.length };
  }

  // ── FIXTURE / OLCUT KAPILARI ──────────────────────────────────────────
  check('K4-F1 KAPI: BrandsController.remove bir fonksiyon',
    typeof (BrandsController.prototype as any).remove === 'function',
    `tip=${typeof (BrandsController.prototype as any).remove}`);
  check('K4-F2 KAPI: AdminController.deletePriceList bir fonksiyon',
    typeof (AdminController.prototype as any).deletePriceList === 'function',
    `tip=${typeof (AdminController.prototype as any).deletePriceList}`);

  const bOnayli = await gecenOpts('brand', 'true');
  // O6: casus GERCEKTEN kaydediyor mu? Kaydetmiyorsa asagidaki tum `opts`
  // okumalari undefined doner ve testi "kablolama yok" sanardim.
  check('K4-O6 OLCUT: casus servis cagrisini kaydetti (tam 1 cagri)',
    bOnayli.adet === 1, `adet=${bOnayli.adet}`);
  check('K4-O7 OLCUT: servise IKI arguman gecti (id + opts) — opts DUSMEDI',
    bOnayli.args.length === 2, `args=${JSON.stringify(bOnayli.args)}`);
  check('K4-O8 OLCUT: id degismeden geciyor',
    bOnayli.args[0] === 'marka-1', `id=${JSON.stringify(bOnayli.args[0])}`);

  // ── AILE 1: brands.controller.ts:65-67 ────────────────────────────────
  check("K4-a MARKA: ?onaylandi=true → kutuphaneSilmeOnayi === true",
    bOnayli.opts?.kutuphaneSilmeOnayi === true,
    `opts=${JSON.stringify(bOnayli.opts)}`);

  const bParametresiz = await gecenOpts('brand', undefined);
  check('K4-b MARKA: parametre YOKken onay VERILMEZ (!== true)',
    bParametresiz.opts?.kutuphaneSilmeOnayi !== true,
    `opts=${JSON.stringify(bParametresiz.opts)}`);

  const bFalse = await gecenOpts('brand', 'false');
  check('K4-c MARKA: ?onaylandi=false onay SAYILMAZ (!== true)',
    bFalse.opts?.kutuphaneSilmeOnayi !== true,
    `opts=${JSON.stringify(bFalse.opts)}`);

  // FAIL-CLOSED: karsilastirma 'true' string'ine BIREBIR bagli. Beklenmeyen
  // bir deger onay uretmemeli — supheli girdi KORUMA yonunde yorumlanir.
  const bBuyuk = await gecenOpts('brand', 'TRUE');
  check('K4-d MARKA: beklenmeyen deger ("TRUE") onay SAYILMAZ (fail-closed)',
    bBuyuk.opts?.kutuphaneSilmeOnayi !== true,
    `opts=${JSON.stringify(bBuyuk.opts)}`);

  // ── AILE 2: admin.controller.ts:116-118 (ayni desen, ayri uc) ─────────
  const aOnayli = await gecenOpts('priceList', 'true');
  check('K4-O9 OLCUT: fiyat listesi ucunda da servise IKI arguman gecti',
    aOnayli.args.length === 2, `args=${JSON.stringify(aOnayli.args)}`);
  check("K4-e LISTE: ?onaylandi=true → kutuphaneSilmeOnayi === true",
    aOnayli.opts?.kutuphaneSilmeOnayi === true,
    `opts=${JSON.stringify(aOnayli.opts)}`);

  const aParametresiz = await gecenOpts('priceList', undefined);
  check('K4-f LISTE: parametre YOKken onay VERILMEZ (!== true)',
    aParametresiz.opts?.kutuphaneSilmeOnayi !== true,
    `opts=${JSON.stringify(aParametresiz.opts)}`);

  const aFalse = await gecenOpts('priceList', 'false');
  check('K4-g LISTE: ?onaylandi=false onay SAYILMAZ (!== true)',
    aFalse.opts?.kutuphaneSilmeOnayi !== true,
    `opts=${JSON.stringify(aFalse.opts)}`);

  // ── ★ KALKAN: silme uclari admin-korumali KALMALI ─────────────────────
  // Onay bayragi ancak uc admin'e kapaliysa anlamlidir.
  check("K4-KALKAN-a marka silme ucu admin rolu ISTIYOR",
    JSON.stringify(rolleriOku((BrandsController.prototype as any).remove, BrandsController)) === JSON.stringify(['admin']),
    `roles=${JSON.stringify(rolleriOku((BrandsController.prototype as any).remove, BrandsController))}`);
  check('K4-KALKAN-b marka silme ucuna RolesGuard bagli',
    guardAdlari((BrandsController.prototype as any).remove, BrandsController).includes('RolesGuard'),
    `guards=${JSON.stringify(guardAdlari((BrandsController.prototype as any).remove, BrandsController))}`);
}

async function main() {
  k1();
  await k2();
  await k3();
  await k4();
  console.log(`\n${'='.repeat(64)}\nGUVENLIK UCLARI (K1/K2/K3): ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`);
  if (failed) { failures.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
