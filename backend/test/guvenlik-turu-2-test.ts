/**
 * GUVENLIK TURU 2 — G1-G6  (`npm run test:guvenlik2`)
 *
 * DB GEREKTIRMEZ. Dekorator metadata'si, sahte Prisma casusu ve saf
 * fonksiyon cagrilariyla olculur; gercek veriye DOKUNULMAZ.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * 28.08 denetim turunda ADIM 2 DISINDA alti kusur bulundu. Hepsi kod
 * OKUNARAK dogrulandi (grep sonucuna guvenilmedi); bu dosya onlari OLCUYE
 * cevirir ki duzeltmeleri sessizce geri alinmasin.
 *
 *   G1  BANLI KULLANICI GIRIS YAPABILIYORDU. `UserStatus { active, banned }`
 *       semada vardi ve admin PATCH /admin/users/:id/status ile banliyordu,
 *       ama `status` alanini TUM auth katmaninda hicbir yer OKUMUYORDU.
 *       Yani "ban" dugmesi calisiyor gorunup HICBIR SEY yapmiyordu.
 *       IKI kapi gerekir: giris (login) ve MEVCUT TOKEN (jwt.strategy) —
 *       token omru 7 gun oldugu icin yalniz girisi kapatmak banlanan
 *       kullaniciya bir hafta daha calisma izni verirdi.
 *
 *   G2  DWG CAPRAZ-TENANT SIZINTI. Dosyalar Python cache'inde `file_id` ile
 *       durur; sahipligi soyleyen KAYIT YOKTU ve yedi ucun hicbiri
 *       kullaniciyi parametre olarak bile ALMIYORDU (firma suzgeci yapisal
 *       olarak imkansizdi). fileId'yi bilen herhangi bir oturumlu kullanici
 *       BASKA firmanin cizim GEOMETRISINI okuyabiliyordu.
 *
 *   G3  ISCILIK KATALOGU HERKESE ACIKTI. LaborItem KURESEL bir katalogdur
 *       (sahiplik kolonu YOK, isGlobal @default(true)) ve LaborPrice ona
 *       CASCADE bagli. LaborController'da yalniz @RequireTier('pro') vardi:
 *       pro/suite olan HERHANGI bir kullanici DELETE /labor/:id ile kuresel
 *       bir kalemi silip TUM firmalarin o kaleme bagli fiyatlarini
 *       goturebiliyordu. Capraz-tenant VERI IMHASI.
 *
 *   G4  KIMLIK ASIMETRISI. quotes.controller icinde POST /quotes
 *       `kimlikCoz(user)` kullanirken kardesi POST /quotes/upload-excel
 *       ham `user.id` kullaniyordu — yani firmasiz bir hesap /quotes'ta 403
 *       alirken upload-excel'i sorunsuz kosuyordu.
 *
 *   G5  CIPLAK firmaId. brands.controller `user?.firmaId` ile opsiyonel
 *       zincir kullaniyordu; firmasiz hesapta ifade `undefined` olur ve
 *       Prisma'da `where: { firmaId: undefined }` kosulu SESSIZCE DUSER →
 *       capraz-tenant okuma. kimlikCoz'un tum varlik sebebi (firmasizi
 *       GURULTUYLE durdurmak) burada devre disiydi.
 *
 *   G6  BOOTSTRAP HESAP DEVRALMA. /bootstrap/make-admin govdede
 *       `newPassword` kabul edip HERHANGI bir hesabin parolasini
 *       sifirliyordu; ustelik uc, sir ortamda durdugu SURECE aciktı ve
 *       kapanmasi "env'i silmeyi hatirlama"ya baglanmisti.
 *
 * ── OLCUTU ONCE DOGRULA ─────────────────────────────────────────────────
 * Her blokta olcum aracinin calistigini kanitlayan bir O-satiri var.
 * "Metadata yok" sonucunun bozuk probe'dan degil gercek yokluktan geldigini
 * gostermezsek bu dosya her zaman yesil kalirdi.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROLES_KEY } from '../src/altyapi/auth/decorators/roles.decorator';
import { LaborController } from '../src/ozellik/kutuphane/labor/labor.controller';
import { QuotesController } from '../src/ozellik/teklif/quotes/quotes.controller';
import { BrandsController } from '../src/ozellik/kutuphane/brands/brands.controller';
import { DwgEngineController } from '../src/modules/dwg-engine/dwg-engine.controller';
import { DwgSahiplikServisi } from '../src/modules/dwg-engine/dwg-sahiplik.servisi';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(ad: string, kosul: boolean, detay = ''): void {
  if (kosul) {
    passed++;
    console.log(`  ✓ ${ad}`);
  } else {
    failed++;
    failures.push(`${ad}${detay ? ` — ${detay}` : ''}`);
    console.log(`  ✗ ${ad}${detay ? ` — ${detay}` : ''}`);
  }
}

const SRC = path.join(__dirname, '../src');
const oku = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
/** Yorum satirlarini atar — iddiayi YORUMDAN degil KODDAN olcmek icin. */
const kodu = (metin: string) =>
  metin
    .split(/\r?\n/)
    .filter((s) => {
      const t = s.trim();
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    })
    .join('\n');

function rolleriOku(hedef: any): string[] | undefined {
  return Reflect.getMetadata(ROLES_KEY, hedef);
}
function guardAdlari(sinif: any): string[] {
  return (Reflect.getMetadata('__guards__', sinif) ?? []).map(
    (g: any) => g?.name ?? String(g),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
async function g1_banliKullanici() {
  console.log('\n── G1 · BANLI KULLANICI ──');
  const authKodu = kodu(oku('altyapi/auth/auth.service.ts'));
  const stratejiKodu = kodu(oku('altyapi/auth/strategies/jwt.strategy.ts'));

  // OLCUT: dosyalar gercekten okundu mu?
  check(
    'G1-OLCUT kaynak okundu (auth.service icinde login var)',
    authKodu.includes('async login('),
    `uzunluk=${authKodu.length}`,
  );

  check(
    'G1-a GIRIS yolu banned kontrolu yapiyor',
    /status\s*===\s*'banned'/.test(authKodu),
    'auth.service icinde banned karsilastirmasi yok',
  );
  check(
    'G1-b MEVCUT TOKEN de reddediliyor (jwt.strategy) — 7 gunluk pencere kapali',
    /status\s*===\s*'banned'/.test(stratejiKodu),
    'jwt.strategy icinde banned karsilastirmasi yok',
  );
  // Strateji kullaniciyi zaten cekiyordu; ek sorgu MALIYETI olmamali.
  check(
    'G1-c strateji ek DB sorgusu EKLEMEDI (mevcut findUnique yeterli)',
    (stratejiKodu.match(/findUnique|findFirst/g) ?? []).length === 1,
    `sorgu adedi=${(stratejiKodu.match(/findUnique|findFirst/g) ?? []).length}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
async function g2_dwgSahiplik() {
  console.log('\n── G2 · DWG CAPRAZ-TENANT ──');

  const p = DwgEngineController.prototype as any;
  // OLCUT: sinif gercekten yuklendi mi?
  check(
    'G2-OLCUT DwgEngineController yuklendi (getGeometry metodu var)',
    typeof p.getGeometry === 'function',
  );

  const ctrlKodu = kodu(oku('modules/dwg-engine/dwg-engine.controller.ts'));

  // TUKETICI uclar sahipligi DOGRULAMALI
  for (const metot of ['getGeometry', 'getUploadStatus', 'parseDwg']) {
    const govde = String(p[metot] ?? '');
    check(
      `G2-a ${metot} sahiplik dogruluyor (sahiplik.dogrula cagrisi)`,
      govde.includes('dogrula'),
      'govdede dogrula cagrisi yok',
    );
  }
  // URETICI uclar sahipligi YAZMALI
  for (const metot of ['listLayers', 'uploadAsync']) {
    const govde = String(p[metot] ?? '');
    check(
      `G2-b ${metot} sahiplik yaziyor (sahiplik.kaydet cagrisi)`,
      govde.includes('kaydet'),
      'govdede kaydet cagrisi yok',
    );
  }
  check(
    'G2-c controller kimligi COZUYOR (kimlikCoz) — firmasiz hesap 403',
    ctrlKodu.includes('kimlikCoz'),
  );

  // ── Davranis: baska firmanin dosyasi 403 ─────────────────────────────
  const sahteKayit: any = { fileId: 'F1', firmaId: 'FIRMA-A' };
  const sahtePrisma: any = {
    dwgDosya: {
      findUnique: async ({ where }: any) =>
        where.fileId === 'F1' ? sahteKayit : null,
      upsert: async () => sahteKayit,
    },
  };
  const servis = new DwgSahiplikServisi(sahtePrisma);

  // OLCUT: kendi firmasi GECMELI (kapi her seye 403 demiyor)
  let kendiHata: any = null;
  try {
    await servis.dogrula('F1', 'FIRMA-A');
  } catch (e) {
    kendiHata = e;
  }
  check('G2-OLCUT kendi firmasinin dosyasi GECIYOR', kendiHata === null,
    String(kendiHata?.message ?? ''));

  let capraHata: any = null;
  try {
    await servis.dogrula('F1', 'FIRMA-B');
  } catch (e) {
    capraHata = e;
  }
  check(
    'G2-d BASKA firmanin dosyasi 403 (capraz-tenant okuma durdu)',
    capraHata?.getStatus?.() === 403,
    `durum=${capraHata?.getStatus?.() ?? 'hata yok'}`,
  );

  // Kaydi olmayan (bu degisiklikten onceki) dosya: BILINCLI aciklik.
  let eskiHata: any = null;
  try {
    await servis.dogrula('BILINMEYEN', 'FIRMA-B');
  } catch (e) {
    eskiHata = e;
  }
  check(
    'G2-e kaydi OLMAYAN eski dosya gecer (bilincli aciklik — deploy calisan ekrani kirmasin)',
    eskiHata === null,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
function g3_iscilikKatalogu() {
  console.log('\n── G3 · ISCILIK KATALOGU ──');
  const p = LaborController.prototype as any;

  // OLCUT: okuma ucu bugun admin ISTEMEMELI (kapi fazla genis olmasin)
  check(
    'G3-OLCUT okuma ucu (findAll) admin ISTEMIYOR — kapi dar tutuldu',
    rolleriOku(p.findAll) === undefined,
    `roles=${JSON.stringify(rolleriOku(p.findAll))}`,
  );

  for (const metot of ['create', 'update', 'remove']) {
    check(
      `G3-a YAZMA ucu admin istiyor: ${metot}`,
      JSON.stringify(rolleriOku(p[metot])) === JSON.stringify(['admin']),
      `roles=${JSON.stringify(rolleriOku(p[metot]))}`,
    );
  }
  check(
    'G3-b RolesGuard sinifa bagli (dekorator tek basina zorlamaz)',
    guardAdlari(LaborController).includes('RolesGuard'),
    `guards=${JSON.stringify(guardAdlari(LaborController))}`,
  );
  // ★KALKAN: tier kapisi KALMALI — admin kapisi onun yerine gecmez.
  check(
    'G3-★KALKAN TierGuard hala bagli (iscilik kutuphanesi pro ozelligi)',
    guardAdlari(LaborController).includes('TierGuard'),
    `guards=${JSON.stringify(guardAdlari(LaborController))}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
function g4_g5_kimlik() {
  console.log('\n── G4/G5 · KIMLIK COZUMU ──');
  const quotesKodu = kodu(oku('ozellik/teklif/quotes/quotes.controller.ts'));
  const brandsKodu = kodu(oku('ozellik/kutuphane/brands/brands.controller.ts'));

  // OLCUT
  check(
    'G4-OLCUT quotes.controller okundu (parseExcel var)',
    quotesKodu.includes('parseExcel'),
  );

  check(
    'G4 upload-excel ham user.id KULLANMIYOR (kardesleriyle ayni kimlik yolu)',
    !/parseExcel\(\s*user\.id/.test(quotesKodu),
    'parseExcel(user.id ...) hala var',
  );
  check(
    'G4 upload-excel kimlikCoz uzerinden gidiyor (firmasiz hesap 403)',
    /parseExcel\(\s*kimlikCoz\(/.test(quotesKodu),
  );

  check(
    'G5 brands ciplak user?.firmaId KULLANMIYOR (sessiz kosul dusmesi kapandi)',
    !/user\?\.firmaId/.test(brandsKodu),
    'user?.firmaId hala var',
  );
  check(
    'G5 brands kimlikCoz kullaniyor',
    brandsKodu.includes('kimlikCoz('),
  );

  // ★KALKAN: kardes uclar bozulmadi
  check(
    'G4-★KALKAN POST /quotes hala kimlikCoz kullaniyor',
    /create\(kimlikCoz\(user\)/.test(quotesKodu),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
function g6_bootstrap() {
  console.log('\n── G6 · BOOTSTRAP ──');
  const bsKodu = kodu(oku('bootstrap.controller.ts'));

  check(
    'G6-OLCUT bootstrap.controller okundu (makeAdmin var)',
    bsKodu.includes('makeAdmin'),
  );

  check(
    'G6-a newPassword SOZLESMEDEN kaldirildi (hesap devralma yolu kapandi)',
    !bsKodu.includes('newPassword'),
    'newPassword hala kodda',
  );
  check(
    'G6-b parola HASH"lenmiyor (sifirlama yetenegi tamamen yok)',
    !bsKodu.includes('bcrypt.hash'),
    'bcrypt.hash hala kodda',
  );
  check(
    'G6-c admin VARSA uc kendini kapatiyor (guvenlik insan hatirlamasina bagli degil)',
    /role:\s*'admin'\s*\}\s*\}\)/.test(bsKodu) && bsKodu.includes('count('),
    'admin sayimi bulunamadi',
  );
  check(
    'G6-d status:"active" YAZILMIYOR (ban dolanma yolu kapandi)',
    !/status:\s*'active'/.test(bsKodu),
    "status: 'active' hala kodda",
  );
}

async function main() {
  await g1_banliKullanici();
  await g2_dwgSahiplik();
  g3_iscilikKatalogu();
  g4_g5_kimlik();
  g6_bootstrap();

  console.log(
    `\n${'='.repeat(64)}\nGUVENLIK TURU 2 (G1-G6): ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
  );
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
