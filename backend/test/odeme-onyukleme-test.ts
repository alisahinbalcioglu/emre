/**
 * ODEME ONYUKLEME + UC SOZLESMESI TURU  (`npm run test:odeme`)
 *
 * DB GEREKTIRMEZ. `PrismaClient.prototype.$connect` bir no-op ile
 * degistirilir; boylece TUM saglayicilar GERCEKTEN kurulur (kurucu govdeleri
 * kosar) ama hicbir baglanti acilmaz. Bu ayrim onemli: DI grafigini "preview"
 * modunda dogrulamak saglayicilari HIC kurmaz ve asagidaki O1 kusurunu
 * KACIRIRDI — kusur tam olarak KURUCUDA yasiyordu.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 *
 *   O1  ONYUKLEME KATILI (boot-killer). Gelen ADIM 2 paketinde
 *       `IYZICO_API_KEY`, `IYZICO_SECRET_KEY` ve `IYZICO_MERCHANT_ID`
 *       `config.getOrThrow(...)` ile SINIF KURUCUSUNDA okunuyordu
 *       (iyzico.client.ts:94-95, webhook.controller.ts:52-53). NestJS bu iki
 *       sinifi da onyuklemede kurar. Sonuc: degiskenlerden BIRI bile
 *       tanimsizsa `OdemeModule`'un AppModule'e eklenmesi TUM API'yi
 *       dusururdu — teklif, kutuphane, eslestirme, DWG dahil odemeyle hicbir
 *       ilgisi olmayan her sey. Uretimde `node dist/main` patlar, deploy.sh
 *       saglik dogrulamasindan `build_sha` alamaz ve deploy geri alinir.
 *       Yani "odeme yapilandirilmamis" hatasi "tum urun cevrimdisi" olarak
 *       tezahur ederdi.
 *       ⚠ Bu testin degeri, ortam degiskeni OLMADAN kosmasindadir. Asagida
 *       IYZICO_* degiskenleri ACIKCA SILINIR (O1-OLCUT bunu dogrular) —
 *       yoksa gelistiricinin .env'i testi yanlis sebeple yesil yapardi.
 *
 *   O2  KORUMASIZ YONETIM UCLARI. Pakette `havale.controller.ts` icindeki
 *       `@UseGuards(YoneticiGuard)` satiri YORUMDAYDI ve boyle bir guard
 *       pakette yoktu. `POST /api/yonetim/havale/:id/onayla` oturum acmis
 *       HERKESE acikti: kendi havale kaydini onaylayip aboneligini N ay
 *       uzatabilirdi (havale.servisi.odemeyiOnayla → erisimiUzat).
 *
 *   O3  SAHTE DENETIM IZI. `aktorId` / `onaylayanId` / `olusturanId` ISTEK
 *       GOVDESINDEN okunuyordu. Guard eklemek bunu TEK BASINA cozmez:
 *       govdeden gelen kimlik yazilabilir. AbonelikOlayi tablosunun tek
 *       varlik sebebi "kim yapti" sorusudur; govdeden okunan aktor o cevabi
 *       UYDURULABILIR kilar. Aktor DAIMA JWT'den (@CurrentUser) alinmali.
 *
 *   O4  SATIN ALMA YOLU YOKLUGU. Pakette `IyzicoClient.abonelikBaslat`,
 *       `formSonucu`, `kartGuncellemeSayfasi`, `abonelikIptal` ve
 *       `paketDegistir` TANIMLIYDI ama BESININ DE CAGRI YERI YOKTU (olculdu:
 *       5 metot × 0 cagri). `Abonelik.iyzicoAbonelikKodu` 8 yerde okunuyor,
 *       hicbir yerde yazilmiyordu. Yani kart ile abone OLMANIN YOLU YOKTU ve
 *       her webhook eslesmeyen abonelik koduyla gelip yutulurdu.
 *
 * ── OLCUTU ONCE DOGRULA (O-OLCUT bloklari) ──────────────────────────────
 * Her iddianin yaninda, olcum aracinin GERCEKTEN calistigini kanitlayan bir
 * blok var. "Rota bulunamadi" sonucunun bozuk probe'dan degil gercek
 * yokluktan geldigini gostermezsek, bu dosya her zaman yesil kalirdi.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL. (2 = on kosul yok; bu
 * pakette KULLANILMAZ — test DB'siz kostugu icin atlanacak durum yoktur.)
 */
import 'reflect-metadata';

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

// ── ORTAM: iyzico degiskenleri ACIKCA SILINIR ─────────────────────────────
// O1'in tamami buna dayanir. Gelistiricinin .env'i yuklu olsaydi test
// "yapilandirilmis" yoldan gecer ve onyukleme katilini HIC olcmezdi.
const IYZICO_ANAHTARLARI = [
  'IYZICO_API_KEY',
  'IYZICO_SECRET_KEY',
  'IYZICO_MERCHANT_ID',
  'IYZICO_TABAN_URL',
  'UYGULAMA_URL',
];
for (const a of IYZICO_ANAHTARLARI) delete process.env[a];
// Prisma istemcisi kurulurken URL ister; baglanti ACILMAYACAK (asagida
// $connect no-op'lanir) ama degiskenin var olmasi gerekir.
process.env.DATABASE_URL ??= 'postgresql://olcum:olcum@localhost:5432/olcum';
// JWT_SECRET BILEREK tanimlanir — silinmez.
// Bu, O1'in aynasi olan KASITLI bir tasarim: `jwt-secret.ts` anahtar yoksa
// ONYUKLEMEDE patlar (kalem 63) ve bu DOGRUDUR — JWT butun urunun cekirdek
// bagimliligidir, o olmadan hicbir uc anlamli calismaz. iyzico anahtarlari
// ise YALNIZCA odeme alt sisteminin bagimliligidir; onlarin yoklugunda
// teklif/kutuphane/eslestirme calismaya devam etmelidir. O1'in olctugu ayrim
// tam olarak budur — "her eksik degisken onyuklemeyi dusurmeli" degil,
// "CEKIRDEK eksikse dussun, EKLENTI eksikse kendi ucu 503 donsun".
process.env.JWT_SECRET ??=
  'olcum-icin-sabit-en-az-otuziki-karakterlik-anahtar';

async function main() {
  // ── $connect NO-OP ──────────────────────────────────────────────────
  // Saglayicilar GERCEKTEN kurulsun (kurucular kossun) ama DB'ye gidilmesin.
  const { PrismaClient } = await import('@prisma/client');
  (PrismaClient.prototype as any).$connect = async () => undefined;
  (PrismaClient.prototype as any).$disconnect = async () => undefined;

  // ── O1-OLCUT: degiskenler gercekten YOK ────────────────────────────
  check(
    'O1-OLCUT IYZICO_* ortam degiskenleri bu kosumda TANIMSIZ',
    IYZICO_ANAHTARLARI.every((a) => process.env[a] === undefined),
    `tanimli=${JSON.stringify(IYZICO_ANAHTARLARI.filter((a) => process.env[a] !== undefined))}`,
  );

  const { odemeYapilandirildiMi, odemeAyari } = await import(
    '../src/ozellik/odeme/yapilandirma'
  );
  const { ConfigService } = await import('@nestjs/config');
  const bosConfig = new ConfigService({});

  check(
    'O1-OLCUT yapilandirma eksik olarak RAPORLANIYOR',
    odemeYapilandirildiMi(bosConfig) === false,
  );

  // ── O1: uygulama iyzico degiskenleri OLMADAN ONYUKLENIR ─────────────
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');

  let app: any = null;
  let onyuklemeHatasi: unknown = null;
  try {
    // ⚠ `abortOnError: false` ZORUNLU. Varsayilan (true) hâlinde Nest
    // onyukleme hatasini KENDI yakalar, gunluge basar ve sureci dogrudan
    // sonlandirir — asagidaki try/catch'e HIC ulasmaz. Olculdu: O1
    // mutasyonunda (kurucuya getOrThrow geri konuldu) surec cikis kodu 1
    // ile oluyordu ama HANGI assertin kirildigi yazilmiyordu; test "kirmizi
    // ama sessiz" oluyordu. false ile hata firlatilir, biz yakalariz ve
    // sebep okunabilir bicimde basilir.
    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    // ⚠ URETIMI BIREBIR YANSIT: kuresel onek `main.ts:65`'te uygulanir,
    // AppModule'de DEGIL. Burada cagrilmazsa rotalar oneksiz toplanir ve
    // W1 asserti YANLIS SEBEPLE kirmizi olur (olculdu: ilk kosumda tam
    // olarak bu oldu — O-OLCUT blogu yakaladi). Onek testin kendi
    // varsayimi degil, uretim davranisinin kopyasidir.
    app.setGlobalPrefix('api');
    await app.init();
  } catch (e) {
    onyuklemeHatasi = e;
  }

  check(
    'O1 iyzico degiskenleri YOKKEN uygulama ONYUKLENIR (boot-killer kapandi)',
    onyuklemeHatasi === null,
    onyuklemeHatasi instanceof Error
      ? onyuklemeHatasi.message.slice(0, 300)
      : String(onyuklemeHatasi ?? ''),
  );

  if (!app) {
    console.log(
      `\n${'='.repeat(64)}\nODEME ONYUKLEME: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
    );
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }

  // ── O1-b: eksik degisken KULLANIM aninda 503 firlatir (sessiz degil) ─
  // Onyuklemenin gecmesi, hatanin YUTULDUGU anlamina gelmemeli. Hatanin
  // ZAMANI ve KAPSAMI degisti; VARLIGI degil.
  let kullanimHatasi: any = null;
  try {
    odemeAyari(bosConfig, 'IYZICO_API_KEY');
  } catch (e) {
    kullanimHatasi = e;
  }
  check(
    'O1-b eksik degisken KULLANIM aninda hata firlatir (sessizce gecmez)',
    kullanimHatasi !== null,
  );
  check(
    'O1-b hata 503 ServiceUnavailable (500 degil — yapilandirma sorunu)',
    kullanimHatasi?.getStatus?.() === 503,
    `durum=${kullanimHatasi?.getStatus?.()}`,
  );
  check(
    'O1-b hata mesaji EKSIK DEGISKENIN ADINI soyler',
    String(kullanimHatasi?.message ?? '').includes('IYZICO_API_KEY'),
    `mesaj=${String(kullanimHatasi?.message ?? '').slice(0, 120)}`,
  );

  // ── Rota envanteri ──────────────────────────────────────────────────
  const sunucu = app.getHttpAdapter().getInstance();
  const rotalar: string[] = [];
  const yigin = sunucu?._router?.stack ?? [];
  for (const k of yigin) {
    if (k.route?.path) {
      for (const m of Object.keys(k.route.methods ?? {})) {
        rotalar.push(`${m.toUpperCase()} ${k.route.path}`);
      }
    }
  }

  // O-OLCUT: rota toplayici GERCEKTEN calisiyor mu? Bilinen, ADIM 2 ile
  // ilgisi olmayan bir uc gorunmuyorsa probe bozuktur, urun degil.
  check(
    'O-OLCUT rota toplayici calisiyor (bilinen /api/auth/login goruluyor)',
    rotalar.some((r) => r.includes('/api/auth/login')),
    `toplam rota=${rotalar.length}`,
  );

  // ── O4: satin alma yolu GERCEKTEN acildi mi ─────────────────────────
  const beklenen = [
    'GET /api/abonelik/paketler',
    'GET /api/abonelik/durum',
    'POST /api/abonelik/basla',
    'POST /api/abonelik/donus',
    'POST /api/abonelik/kart-guncelle',
    'POST /api/abonelik/iptal',
  ];
  for (const b of beklenen) {
    check(`O4 uc kayitli: ${b}`, rotalar.includes(b));
  }

  // ── Webhook ucu: KURESEL ONEK dahil dogru yolda mi ──────────────────
  // OKUBENI.md panele `/webhook/iyzico/abonelik` yazilmasini soyluyor, ama
  // main.ts `setGlobalPrefix('api')` diyor. Gercek yol /api/... — panele
  // yanlis adres girilirse iyzico 404 alir ve ~45 dk sonra olayi KALICI
  // olarak birakir. Bu assert dogru adresi belgeler.
  check(
    'W1 webhook ucu KURESEL ONEK ile /api/webhook/iyzico/abonelik',
    rotalar.includes('POST /api/webhook/iyzico/abonelik'),
    `abonelik webhook rotalari=${JSON.stringify(rotalar.filter((r) => r.includes('webhook')))}`,
  );

  // ── O2: havale uclari ADMIN korumali ────────────────────────────────
  const { HavaleController } = await import(
    '../src/ozellik/odeme/havale/havale.controller'
  );
  const { ROLES_KEY } = await import(
    '../src/altyapi/auth/decorators/roles.decorator'
  );

  const sinifRolleri = Reflect.getMetadata(ROLES_KEY, HavaleController);
  check(
    'O2 HavaleController SINIF duzeyinde admin rolu istiyor',
    JSON.stringify(sinifRolleri) === JSON.stringify(['admin']),
    `roles=${JSON.stringify(sinifRolleri)}`,
  );

  const sinifGuardlari = (
    Reflect.getMetadata('__guards__', HavaleController) ?? []
  ).map((g: any) => g?.name ?? String(g));
  check(
    'O2 HavaleController JwtAuthGuard tasiyor',
    sinifGuardlari.includes('JwtAuthGuard'),
    `guards=${JSON.stringify(sinifGuardlari)}`,
  );
  check(
    'O2 HavaleController RolesGuard tasiyor (rol metadata"si zorlansin)',
    sinifGuardlari.includes('RolesGuard'),
    `guards=${JSON.stringify(sinifGuardlari)}`,
  );

  // ── O3: aktor JWT'den mi geliyor? ───────────────────────────────────
  // ROUTE_ARGS metadata'si her parametrenin KAYNAGINI tasir. CurrentUser
  // bir createParamDecorator'dur ve 'custom' turu olarak kaydedilir.
  // Onaylama ucunda BOYLE bir parametre YOKSA aktor govdeden geliyordur.
  const argsMeta =
    Reflect.getMetadata(
      '__routeArguments__',
      HavaleController,
      'onayla',
    ) ?? {};
  const argAnahtarlari = Object.keys(argsMeta);
  // Nest'te ozel (custom) param dekoratorleri anahtarinda ':' tasir.
  const ozelParamVar = argAnahtarlari.some((k) => k.includes(':'));
  check(
    'O3 onayla() ozel param dekoratoru (@CurrentUser) kullaniyor',
    ozelParamVar,
    `argAnahtarlari=${JSON.stringify(argAnahtarlari)}`,
  );

  // O3-KALKAN: onaylayanId govdeden ALINMAMALI. Govde tipini calisma
  // zamaninda goremeyiz; bunun yerine KAYNAK METNI olcuyoruz — govde
  // sozlesmesinde bu adlar GECMEMELI.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const kaynak = fs.readFileSync(
    path.join(__dirname, '../src/ozellik/odeme/havale/havale.controller.ts'),
    'utf8',
  );
  // Yorum satirlari haric govde: 'onaylayanId:' bir @Body tipinde gecmemeli.
  const kodSatirlari = kaynak
    .split(/\r?\n/)
    .filter((s) => !s.trim().startsWith('*') && !s.trim().startsWith('//'));
  const govdeAlanlari = kodSatirlari.join('\n');
  check(
    'O3-KALKAN onaylayanId @Body sozlesmesinde GECMIYOR',
    !/g:\s*\{[^}]*onaylayanId/s.test(govdeAlanlari),
    'govde tipinde onaylayanId bulundu',
  );
  check(
    'O3-KALKAN aktorId @Body sozlesmesinde GECMIYOR',
    !/g:\s*\{[^}]*aktorId/s.test(govdeAlanlari),
    'govde tipinde aktorId bulundu',
  );
  check(
    'O3-KALKAN olusturanId @Body sozlesmesinde GECMIYOR',
    !/g:\s*\{[^}]*olusturanId/s.test(govdeAlanlari),
    'govde tipinde olusturanId bulundu',
  );

  // ── Abonelik ucu erisim kapisi TASIMAMALI (kilitlenme onlemi) ───────
  // Askidaki firma odeme yapabilmeli; buraya erisim kapisi konursa musteri
  // odeyemez ve askidan cikamaz.
  const { AbonelikController } = await import(
    '../src/ozellik/odeme/abonelik/abonelik.controller'
  );
  const abGuardlari = (
    Reflect.getMetadata('__guards__', AbonelikController) ?? []
  ).map((g: any) => g?.name ?? String(g));
  check(
    'A1 AbonelikController JwtAuthGuard tasiyor (kimlik sart)',
    abGuardlari.includes('JwtAuthGuard'),
    `guards=${JSON.stringify(abGuardlari)}`,
  );
  check(
    'A1 AbonelikController ErisimGuard TASIMIYOR (askidaki firma odeyebilsin)',
    !abGuardlari.some((g: string) => /Erisim/i.test(g)),
    `guards=${JSON.stringify(abGuardlari)}`,
  );

  await app.close();

  console.log(
    `\n${'='.repeat(64)}\nODEME ONYUKLEME: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
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
