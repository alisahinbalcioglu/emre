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
 *   G6  BOOTSTRAP UCU KALDIRILDI (10.09.2026). 28.08'de iki yetki
 *       daraltilmisti (parola sifirlama cikarildi, admin varsa uc kendini
 *       kapatiyordu) ama rota DURUYORDU: kimlik dogrulamasi olmayan bir POST,
 *       yalnizca BOOTSTRAP_SECRET tanimsiz oldugu icin reddediyordu. Guvenlik
 *       bir ortam degiskeninin YOKLUGUNA baglanamaz. Uc tamamen silindi;
 *       G6 artik VARLIGI degil YOKLUGU olcuyor ve rota geri acilirsa kirmizi
 *       doner (yalniz o dosyaya degil, src'nin tamamina bakar).
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

  // ── FAZ 7 F1b: KAPI `oturum.servisi.ts`e TASINDI ────────────────────────
  // ESKI ANLAM: metin `auth.service.ts` icinde araniyordu.
  // YENI ANLAM: kural `oturum.servisi.ts` `hesapKapisi`ndadir ve
  // `auth.service.ts` onu CAGIRIR. Iki dosya birden okunur — biri digerini
  // kaybederse kizarir. Gerekce: token veren yol sayisi artiyor (davet
  // kabul F1b, MFA F2b, kurumsal giris F3b); her yol kendi kapisini
  // yazarsa biri mutlaka unutur.
  const oturumKodu = kodu(oku('altyapi/auth/oturum.servisi.ts'));
  check(
    'G1-a GIRIS yolu banned kontrolu yapiyor (hesapKapisi + cagri)',
    /status\s*===\s*'banned'/.test(oturumKodu) && /hesapKapisi\(/.test(authKodu),
    `oturum.servisi banned=${/status\s*===\s*'banned'/.test(oturumKodu)} auth.service cagri=${/hesapKapisi\(/.test(authKodu)}`,
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
  // 23.09.2026 (Ekip & Izinler): POST /quotes kimligi `teklifKimligiCoz`dan
  // alir; o ONCE `kimlikCoz(user)`u yayar — firmasiz hesap yine GURULTULU
  // durur (kalkanin korudugu sey). Iki halka birlikte olculur.
  check(
    'G4-★KALKAN POST /quotes hala kimlikCoz kullaniyor (teklifKimligiCoz → kimlikCoz)',
    /create\(teklifKimligiCoz\(user\)/.test(quotesKodu) &&
      /teklifKimligiCoz[\s\S]{0,200}\.\.\.kimlikCoz\(user\)/.test(
        fs.readFileSync(path.join(__dirname, '../src/altyapi/auth/kimlik.ts'), 'utf8')),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
/**
 * `backend/src` altindaki tum .ts dosyalarini gezer.
 *
 * ⚠ Tek bir dosyayi okumak YETMEZ: G6'nin korudugu sey "su dosya boyle" degil,
 * "bu ROTA hicbir yerde geri acilmadi". Silinen bir uc, baska bir klasorde
 * yeniden dogabilir; kapi buna kor kalmamali.
 */
function srcDosyalari(dizin: string = SRC, biriktir: string[] = []): string[] {
  for (const giris of fs.readdirSync(dizin, { withFileTypes: true })) {
    const tam = path.join(dizin, giris.name);
    if (giris.isDirectory()) srcDosyalari(tam, biriktir);
    else if (giris.name.endsWith('.ts')) biriktir.push(tam);
  }
  return biriktir;
}

function g6_bootstrap() {
  console.log('\n── G6 · BOOTSTRAP UCU KALDIRILDI ──');

  // ⚠ IKI AYRI OKUYUCU var (oku/kodu ve srcDosyalari); ikisinin de CALISTIGI
  // ayri ayri kanitlanmali. Kanitlanmazsa asagidaki YOKLUK assert'leri, yol
  // yanlis olsa BILE yesil kalir — bos kumede her sey dogrudur.
  const src = srcDosyalari();
  check(
    'G6-OLCUT1 src taramasi calisiyor (app.module.ts bulundu)',
    src.some((y) => y.endsWith('app.module.ts')),
    `taranan=${src.length}`,
  );

  const modulKodu = kodu(oku('app.module.ts'));
  check(
    'G6-OLCUT2 app.module okundu (HealthController kayitli)',
    modulKodu.includes('HealthController'),
    `uzunluk=${modulKodu.length}`,
  );

  check(
    'G6-a bootstrap.controller.ts DOSYASI YOK',
    !fs.existsSync(path.join(SRC, 'bootstrap.controller.ts')),
    'dosya hala duruyor',
  );
  check(
    'G6-b kok modul BootstrapController KAYDETMIYOR',
    !modulKodu.includes('BootstrapController'),
    'app.module hala kaydediyor',
  );
  check(
    'G6-c src altinda "bootstrap" onekli DENETLEYICI yok (uc geri acilmadi)',
    !src.some((y) => /@Controller\(\s*['"]bootstrap/.test(kodu(fs.readFileSync(y, 'utf8')))),
    'bir denetleyici bootstrap onekini geri acmis',
  );
  check(
    'G6-d BOOTSTRAP_SECRET src altinda HIC OKUNMUYOR',
    !src.some((y) => kodu(fs.readFileSync(y, 'utf8')).includes('BOOTSTRAP_SECRET')),
    'BOOTSTRAP_SECRET hala okunuyor',
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
