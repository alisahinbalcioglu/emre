/**
 * FAZ 4 — KABLOLAMA KAPISI  (`npm run test:faz4`)
 *
 * DB GEREKTIRMEZ. Sema, migration, Nest metadata'si ve kaynak dosyalarin
 * GERCEK icerigi olculur.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Bu turun degisikliklerinin cogu "eklendi mi" degil "BAGLI MI / DOGRU MU"
 * sorusuyla ayakta duruyor ve bircogu SESSIZCE olu kalabilir:
 *
 *   1) `Firma` semasina alan eklemek YETMEZ — bu depoda `vergiNo`,
 *      `vergiDairesi`, `tcKimlikNo`, `ilce`, `faturaEposta` alanlari AYLARDIR
 *      semada VAR ve fatura servisi tarafindan OKUNUYOR, ama HICBIR kod yolu
 *      YAZMIYORDU. Olcut "sema alani var mi" DEGIL "yazan bir yol var mi".
 *   2) `findAll` `include` kullanirsa Prisma SKALERLERI KISITLAMAZ: liste ucu
 *      her teklifle `sheets` ve ham `.xlsx` binary'si dondurur. `select`e
 *      gecmek bu turun en buyuk tek kazanci — ve geri donmesi cok kolay.
 *   3) `updateInfo`da `data`ya alan yazip `select`e eklememek "yazildi ama
 *      yanitta yok" durumu uretir; on yuz eski degeri gosterir.
 *   4) `@Body()` satir-ici tip literali global ValidationPipe'i SESSIZCE atlar.
 *   5) Logo ucunda multer `limits` yazilmazsa sinir SINIRSIZDIR.
 *
 * ── OLCUTU ONCE DOGRULA ─────────────────────────────────────────────────
 * Her "X var" iddiasinin yaninda BULUNMAMASI gereken bir ornek olculur
 * (O-bloklari): probe'un her seye "var" demedigini kanitlamak icin.
 *
 * Cikis kodu: 0 = PASS · digeri = FAIL.
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

const KOK = path.join(__dirname, '../..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');

/**
 * YORUMLARI SOY. Bu depoda ayni tuzaga DORT kez dusuldu: desen kodu degil,
 * kodun YANINDAKI aciklama satirini yakaliyordu — kapi kendi belgelerini
 * olcuyordu. Faz 3'te mutasyon bunu yakaladi (M13 sagkaldi).
 */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
/** JSX icindeki `{/* ... *\/}` yorumlari da soyulur. */
const jsxKodu = (s: string) => kodu(s).replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
const sqlKodu = (s: string) => s.replace(/^\s*--.*$/gm, '');

function main(): void {
  const sema = kodu(oku('backend/prisma/schema.prisma'));
  const semaHam = oku('backend/prisma/schema.prisma');

  // ── A. SEMA ────────────────────────────────────────────────────────────
  console.log('\n── A · SEMA (gercekten eksik olan alanlar) ──');
  const firmaBlok = sema.slice(sema.indexOf('model Firma {'), sema.indexOf('enum FirmaRol'));
  check('A1 Firma.telefon eklendi', /\btelefon\s+String\?/.test(firmaBlok));
  check('A2 Firma.logoBytes Bytes?', /\blogoBytes\s+Bytes\?/.test(firmaBlok));
  check('A3 Firma.logoMime String?', /\blogoMime\s+String\?/.test(firmaBlok));
  // O-OLCUT: probe her seye "var" demiyor — olmayan bir alan bulunmamali.
  check('A-O1 OLCUT: Firma.faksNumarasi YOK (probe her seye var demiyor)',
    !/\bfaksNumarasi\b/.test(firmaBlok));

  const userBlok = sema.slice(sema.indexOf('model User {'), sema.indexOf('model EslesmeHafizasi'));
  check('A4 User.ad/soyad/telefon (3 alan)',
    /\bad\s+String\?/.test(userBlok) && /\bsoyad\s+String\?/.test(userBlok) && /\btelefon\s+String\?/.test(userBlok));
  // ⚠ `unvan` User'a EKLENMEMELI: `Firma.unvan` zaten resmi firma unvani.
  check('A5 User.unvan EKLENMEDI (Firma.unvan ile ayni adi iki anlamda kullanmamak)',
    !/^\s*unvan\s+String/m.test(userBlok));

  const quoteBlok = sema.slice(sema.indexOf('model Quote {'), sema.indexOf('enum TeklifDurumu'));
  check('A6 Quote.durum TeklifDurumu', /\bdurum\s+TeklifDurumu\b/.test(quoteBlok));
  check('A7 Quote.durum varsayilani HAZIRLANIYOR', /@default\(HAZIRLANIYOR\)/.test(quoteBlok));
  check('A8 Quote.updatedAt @updatedAt', /\bupdatedAt\s+DateTime\s+.*@updatedAt/.test(quoteBlok));
  check('A9 dogru bilesik indeks [firmaId, createdAt]', /@@index\(\[firmaId,\s*createdAt\]\)/.test(quoteBlok));
  check('A10 eski [userId] indeksi KORUNDU (kullanici-bazli yollar hala var)',
    /@@index\(\[userId\]\)/.test(quoteBlok));
  // ⚠ Ingilizce IKIZ sutunlar ACILMAMALI — `customerName` sutunu eklenirse
  // olu okuma canlanir ve ayni bilgi icin iki kismi dolu kaynak olusur.
  check('A11 IKIZ sutun YOK (customerName/projectName semaya EKLENMEDI)',
    !/\bcustomerName\b/.test(sema) && !/\bprojectName\b/.test(sema));

  const enumBlok = sema.slice(sema.indexOf('enum TeklifDurumu'));
  check('A12 TeklifDurumu 4 deger', ['HAZIRLANIYOR', 'GONDERILDI', 'KAZANILDI', 'KAYBEDILDI']
    .every((d) => enumBlok.includes(d)));
  // ⚠ `taslak` bu depoda sessionStorage'daki YARIM DUZENLEME demek.
  check('A13 enum degeri TASLAK YOK (kelime carpismasi onlendi)',
    !/\bTASLAK\b/.test(enumBlok.slice(0, enumBlok.indexOf('}'))));
  check('A14 sema yorumu carpismayi ACIKLIYOR (sonraki tur yeniden kesfetmesin)',
    /taslak/i.test(semaHam.slice(semaHam.indexOf('durum           TeklifDurumu') - 700,
      semaHam.indexOf('durum           TeklifDurumu') + 50)));

  // ── B. MIGRATION ───────────────────────────────────────────────────────
  console.log('\n── B · MIGRATION (mevcut veriye ne oluyor) ──');
  const mig = sqlKodu(oku('backend/prisma/migrations/20260909100000_faz4_firma_teklif_alanlari/migration.sql'));
  check('B1 Firma 3 kolon', /ADD COLUMN\s+"telefon"/.test(mig) && /"logoBytes" BYTEA/.test(mig) && /"logoMime" TEXT/.test(mig));
  check('B2 User 3 kolon', /ALTER TABLE "User"[\s\S]*?"ad" TEXT[\s\S]*?"soyad" TEXT[\s\S]*?"telefon" TEXT/.test(mig));
  check('B3 enum tipi olusturuluyor', /CREATE TYPE "TeklifDurumu"/.test(mig));
  check('B4 durum NOT NULL DEFAULT', /"durum" "TeklifDurumu" NOT NULL DEFAULT/.test(mig));
  // ⭐ EN ONEMLI GOC IDDIASI: eski teklifler "az once guncellendi" gibi
  // GORUNMEMELI. now() yazilsaydi liste siralamasi YALAN soylerdi.
  check('B5 updatedAt mevcut satirlarda createdAt ile dolduruluyor (now() DEGIL)',
    /UPDATE "Quote" SET "updatedAt" = "createdAt"/.test(mig));
  check('B6 updatedAt sonradan NOT NULL yapiliyor', /ALTER COLUMN "updatedAt" SET NOT NULL/.test(mig));
  check('B7 yeni indeks olusturuluyor', /CREATE INDEX "Quote_firmaId_createdAt_idx"/.test(mig));
  check('B-O1 OLCUT: migration DROP TABLE ICERMIYOR', !/DROP TABLE/i.test(mig));
  check('B-O2 OLCUT: yeni Company tablosu ACILMADI', !/CREATE TABLE "Company"/i.test(mig));

  // ── C. FIRMA MODULU (yeni yol) ─────────────────────────────────────────
  console.log('\n── C · FIRMA YOLU (sema degil YOL boslugu) ──');
  const fServis = kodu(oku('backend/src/ozellik/firma/firma.servisi.ts'));
  const fCtrl = kodu(oku('backend/src/ozellik/firma/firma.controller.ts'));
  const appMod = kodu(oku('backend/src/app.module.ts'));
  check('C1 FirmaModule app.module`a KAYITLI (yoksa uclar HIC yasamaz)',
    /FirmaModule/.test(appMod) && /imports:\s*\[[\s\S]*?FirmaModule/.test(appMod));
  check('C2 firma servisi vergiNo/vergiDairesi/tcKimlikNo YAZIYOR (asil bosluk buydu)',
    /vergiNo/.test(fServis) && /vergiDairesi/.test(fServis) && /tcKimlikNo/.test(fServis));
  check('C3 PATCH ucu var', /guncelle\s*\(/.test(fServis) && /@Patch\(\)/.test(fCtrl));
  check('C4 JwtAuthGuard bagli', /@UseGuards\(JwtAuthGuard\)/.test(fCtrl));
  // ⚠ BILINCLI YOKLUK: odemesi geciken firma ODEYEBILMEK icin fatura
  // bilgisini duzeltebilmeli. Bu assert o karari KILITLER.
  check('C5 @GerekliYetenek BILEREK YOK (odeme kapisi arkasina alinmadi)',
    !/@GerekliYetenek/.test(fCtrl));
  check('C6 logo yuklemede multer `limits` VAR (varsayilan SINIRSIZDIR)',
    /limits:\s*\{\s*fileSize/.test(fCtrl));
  check('C7 SVG kabul EDILMIYOR (script tasiyabilir)',
    !/image\/svg/.test(fServis.slice(fServis.indexOf('IZINLI_LOGO_TURLERI'), fServis.indexOf('IZINLI_LOGO_TURLERI') + 200)));
  check('C8 PNG/JPEG/WEBP izinli', /image\/png/.test(fServis) && /image\/jpeg/.test(fServis) && /image\/webp/.test(fServis));
  check('C9 magic number dogrulamasi VAR (MIME beyani istemcinin sozudur)',
    /imzaUyuyor/.test(fServis) && /0x89/.test(fServis));
  // ⭐ `firmaRol`un TUM DEPODAKI ILK OKUYUCUSU.
  // ⚠ MUTASYON DUZELTMESI (M12 sagkalmisti): "kelime dosyada geciyor mu"
  // YETERSIZ bir olcuttu. `select`ten dusurulunce `u.firmaRol` undefined olur,
  // kapi HERKESI reddeder ve firma duzenleme tamamen kilitlenir — ama eski
  // assert bunu goremiyordu cunku kelime karsilastirma satirinda hala geciyor.
  check('C10 firmaRol `select` ile GERCEKTEN cekiliyor (once yazilip sifir kez okunuyordu)',
    /select:\s*\{\s*firmaRol:\s*true/.test(fServis) && /firmaRol\s*!==\s*'sahip'/.test(fServis));
  check('C11 logo ikili verisi JSON alan listesinde YOK (base64 tasimasin)',
    !/logoBytes:\s*true/.test(fServis.slice(fServis.indexOf('FIRMA_ALANLARI'), fServis.indexOf('} as const'))));
  check('C12 DTO gercek bir SINIF (satir-ici literal ValidationPipe`i atlar)',
    /export class FirmaGuncelleDto/.test(kodu(oku('backend/src/ozellik/firma/dto/firma-guncelle.dto.ts'))));

  // ── D. AUTH /me + profil ───────────────────────────────────────────────
  console.log('\n── D · /auth/me FIRMA TASIYOR ──');
  const authSrv = kodu(oku('backend/src/altyapi/auth/auth.service.ts'));
  const authCtrl = kodu(oku('backend/src/altyapi/auth/auth.controller.ts'));
  check('D1 /auth/me firma iliskisini seciyor (once yalniz firmaId donuyordu)',
    /firma:\s*\{\s*select:/.test(authSrv));
  check('D2 me() logoBytes DONDURMUYOR (base64 tasimasin)',
    !/logoBytes:\s*true/.test(authSrv));
  check('D3 PATCH /auth/profil bagli', /@Patch\('profil'\)/.test(authCtrl));
  check('D4 profil ucu DTO SINIFI kullaniyor', /ProfilGuncelleDto/.test(authCtrl));
  check('D5 profil DTO`sunda email YOK (hesap devralma yolu acilmasin)',
    !/\bemail\b/.test(kodu(oku('backend/src/altyapi/auth/dto/profil-guncelle.dto.ts'))));

  // ── E. TEKLIF LISTESI (en buyuk kazanc) ────────────────────────────────
  console.log('\n── E · LISTE UCU: include -> select ──');
  const qSrv = kodu(oku('backend/src/ozellik/teklif/quotes/quotes.service.ts'));
  const qCtrl = kodu(oku('backend/src/ozellik/teklif/quotes/quotes.controller.ts'));
  const findAll = qSrv.slice(qSrv.indexOf('async findAll'), qSrv.indexOf('async findOne'));
  check('E1 findAll `select` kullaniyor', /select:\s*\{/.test(findAll));
  // ⭐ Prisma'da `include` SKALERLERI KISITLAMAZ — geri donmesi cok kolay.
  check('E2 findAll `include` KULLANMIYOR (skalerleri kisitlamaz)', !/include:\s*\{/.test(findAll));
  check('E3 sheets/originalFile liste yanitinda YOK',
    !/\bsheets:\s*true/.test(findAll) && !/originalFile/.test(findAll));
  check('E4 tuketicinin okudugu alanlar VAR (title/createdAt/_count/items.finalPrice)',
    /title:\s*true/.test(findAll) && /createdAt:\s*true/.test(findAll)
    && /_count:/.test(findAll) && /finalPrice:\s*true/.test(findAll));
  check('E5 durum + quoteNo + musteri listede donuyor',
    /durum:\s*true/.test(findAll) && /quoteNo:\s*true/.test(findAll) && /musteri:\s*true/.test(findAll));
  check('E6 sunucu tarafi suzgec (durum + arama) uygulaniyor',
    /where\.durum\s*=/.test(findAll) && /where\.OR\s*=\s*\[/.test(findAll));
  check('E7 @Query SINIF tipiyle (ValidationPipe devreye girsin)',
    /@Query\(\)\s*sorgu:\s*TekliflerSorgusuDto/.test(qCtrl));
  check('E8 donus sekli DIZI + X-Toplam-Kayit basligi (nesneye cevrilmedi)',
    /setHeader\('X-Toplam-Kayit'/.test(qCtrl) && /return kayitlar;/.test(qCtrl));
  check('E-O1 OLCUT: controller `{ veri, toplam }` DONDURMUYOR',
    !/return\s*\{\s*veri/.test(qCtrl));

  // ── F. updateInfo + olu kod ────────────────────────────────────────────
  console.log('\n── F · DURUM YAZIMI ve OLU KOD ──');
  const updateInfo = qSrv.slice(qSrv.indexOf('async updateInfo'), qSrv.indexOf('async updateInfo') + 3000);
  check('F1 durum beyaz listeyle yaziliyor (satir-ici literal ValidationPipe`i atlar)',
    /'HAZIRLANIYOR',\s*'GONDERILDI',\s*'KAZANILDI',\s*'KAYBEDILDI'\]\.includes/.test(updateInfo));
  // ⚠ data'ya yazip select'e eklememek "yazildi ama yanitta yok" uretir.
  check('F2 durum `select`e de EKLENDI', /select:\s*\{[^}]*durum:\s*true/.test(updateInfo));
  // ⭐ OLU KOD: semada olmayan alanlari okuyordu, `as any` tsc'yi susturmustu.
  check('F3 olu customerName/projectName okumasi KALDIRILDI',
    !/customerName/.test(qSrv) && !/projectName/.test(qSrv));
  check('F4 baslik artik musteri/proje okuyor',
    /\[quote\.title,\s*quote\.musteri,\s*quote\.proje\]/.test(qSrv));

  // ── G. SATIN ALMA: telefon artik atilmiyor ─────────────────────────────
  console.log('\n── G · SATIN ALMA TELEFONU SAKLIYOR ──');
  const satin = kodu(oku('backend/src/ozellik/odeme/abonelik/satinalma.servisi.ts'));
  check('G1 telefon Firma`ya yaziliyor', /telefon:\s*firma\?\.telefon\s*\?\?\s*p\.musteri\.telefon/.test(satin));
  // ⚠ `??` KORUNMALI: kullanicinin profilden girdigi deger EZILMEMELI.
  check('G2 mevcut telefon `select`te okunuyor (yoksa `??` her seferinde ezerdi)',
    /select:\s*\{[\s\S]{0,200}telefon:\s*true/.test(satin));
  check('G3 telefonuNormalize DB yazimina UYGULANMIYOR (o bicim iyzico icin)',
    !/telefon:\s*telefonuNormalize/.test(satin));

  // ── H. ON YUZ ──────────────────────────────────────────────────────────
  console.log('\n── H · ON YUZ ──');
  const durumMod = kodu(oku('frontend/ozellik/teklif/durum.ts'));
  check('H1 durum etiketleri TEK KAYNAKTA', /export const TEKLIF_DURUMLARI/.test(durumMod)
    && /export function teklifDurumGorunumu/.test(durumMod));
  const liste = jsxKodu(oku('frontend/app/(protected)/quotes/page.tsx'));
  check('H2 liste durum modulunu KULLANIYOR (kendi etiketini uydurmuyor)',
    /teklifDurumGorunumu/.test(liste) && /from '@\/ozellik\/teklif\/durum'/.test(liste));
  check('H3 suzgec SUNUCUYA gidiyor', /params\.durum\s*=/.test(liste) && /params\.arama\s*=/.test(liste));
  check('H4 X-Toplam-Kayit okunuyor', /x-toplam-kayit/.test(liste));
  check('H5 bos-durum metni SUZGEC ile HIC TEKLIF YOK durumunu AYIRIYOR',
    /Bu süzgece uyan teklif yok/.test(oku('frontend/app/(protected)/quotes/page.tsx')));
  const recent = jsxKodu(oku('frontend/ozellik/teklif/dashboard/RecentQuotes.tsx'));
  check('H6 RecentQuotes `adet` gonderiyor (olu `limit` kaldirildi)',
    /adet:\s*3/.test(recent) && !/limit:\s*3/.test(recent));
  check('H7 olmayan `totalAmount` alani KULLANILMIYOR', !/totalAmount/.test(recent));
  check('H8 toplam kalemlerden hesaplaniyor', /finalPrice/.test(recent));
  const detay = oku('frontend/app/(protected)/quotes/[id]/page.tsx');
  // ⚠ E2E golden spec'leri bu yer tutucuyu ariyor; metni degistirmek onlari
  // ikinci kez kirardi.
  // ⚠ MUTASYON DUZELTMESI (M18 sagkalmisti): olcut HAM metinde ariyordu ve
  // yer tutucuyu KODDA degil, kodun yanindaki JSX YORUMUNDA buluyordu —
  // kapi kendi belgelerini olcuyordu. Bu depoda ayni tuzagin BESINCI ornegi.
  check('H9 detayda kapak kutulari VAR ve E2E yer tutucusuyla AYNI (yorum DEGIL kod)',
    jsxKodu(detay).includes('Müşteri (kapak için)'));
  check('H10 detayda durum secici var', /TEKLIF_DURUMLARI/.test(jsxKodu(detay)));
  check('H11 kapak kaydetme PATCH :id/info kullaniyor', /\/info`/.test(jsxKodu(detay)));
  const profil = oku('frontend/app/(protected)/profile/page.tsx');
  const profilKod = jsxKodu(profil);
  check('H12 profil KISI formu var', /kisiKaydet/.test(profilKod) && /auth\/profil/.test(profilKod));
  check('H13 profil FIRMA formu var', /firmaKaydet/.test(profilKod) && /'\/firma'/.test(profilKod));
  check('H14 profil logo yukleme/silme var', /logoYukle/.test(profilKod) && /logoSil/.test(profilKod));
  check('H15 logo onbellek kirici surum parametresi var (yoksa yeni logo eski gorunur)',
    /logoSurum/.test(profilKod));
  check('H16 firma formu sahip DISI kullaniciya kapali', /sahipMi/.test(profilKod));

  // ── SONUC ──────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(64));
  console.log(`FAZ 4: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(64));
  if (failed > 0) {
    console.log('\nBASARISIZ:');
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

main();
