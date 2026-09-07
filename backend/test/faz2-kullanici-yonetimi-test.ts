/**
 * FAZ 2 — KULLANICI YONETIMI KABLOLAMA KAPISI  (`npm run test:faz2`)
 *
 * DB GEREKTIRMEZ. Nest metadata'si + kaynak dosyalarin gercek icerigi olculur.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Faz 2'nin uc parcasi SESSIZCE islevsiz kalabilir; ucu de "yapildi" gorunur:
 *
 *   1) YUMUSAK SILME: `deletedAt` damgalanir ama auth katmani bu alani okumazsa
 *      silinen kullanici GIRIS YAPMAYA DEVAM EDER. Ozellik ekranda calisir,
 *      gercekte hicbir sey yapmaz. (Ayni aile 28.08'de `status` ile yasandi:
 *      ban dugmesi vardi, auth katmani `status`u HIC OKUMUYORDU.)
 *   2) DENETIM KAYDI: tablo ve yazma fonksiyonu olur ama controller aktoru
 *      servise TASIMAZSA yazacak veri olmaz. 07.09 oncesi admin.controller'da
 *      `@CurrentUser` SIFIR kez geciyordu.
 *   3) KILITLENME KORUMASI: yonetici kendi rolunu dusurur ya da son admini
 *      silerse panele girecek kimse kalmaz — geri donusu ZOR.
 *
 * ── OLCUTU ONCE DOGRULA (⟨olcut⟩ bloklari) ──────────────────────────────
 * Her "X var" iddiasinin yaninda, ayni probe ile olculen ve BULUNMAMASI
 * gereken bir ornek var.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
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
/** Desen KODDA benzersiz olmali; yorumda eslesen desen kodu degistirmez. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

function main(): void {
  const sema = oku('backend/prisma/schema.prisma');
  const servis = kodu(oku('backend/src/ozellik/kutuphane/admin/admin.service.ts'));
  const kontrolcu = kodu(oku('backend/src/ozellik/kutuphane/admin/admin.controller.ts'));
  const authServis = kodu(oku('backend/src/altyapi/auth/auth.service.ts'));
  const jwt = kodu(oku('backend/src/altyapi/auth/strategies/jwt.strategy.ts'));
  const sayfa = oku('frontend/app/admin/users/page.tsx');
  const adminDuzen = kodu(oku('frontend/app/admin/layout.tsx'));

  // ── A · YUMUSAK SILME (2.3) ───────────────────────────────────────────
  console.log('\n── A · YUMUSAK SILME ──');
  check('A1 User.deletedAt semada var', /deletedAt\s+DateTime\?/.test(sema));
  check(
    'A2 deletedAt indeksli (getUsers suzgeci tam tarama olmasin)',
    /@@index\(\[deletedAt\]\)/.test(sema),
  );
  check(
    'A3 deleteUser SERT SILME yapmiyor (prisma.user.delete YOK)',
    !/prisma\.user\.delete\(/.test(servis),
    'Quote ve UserLibrary onDelete:Cascade — sert silme tum teklifleri goturur',
  );
  check(
    'A4 deleteUser deletedAt damgaliyor',
    /deletedAt:\s*new Date\(\)/.test(servis),
  );
  check(
    'A5 getUsers silinmisleri gizliyor',
    // 07.09'da sunucu tarafi suzgec eklendi: `where` artik nesne olarak
    // kuruluyor. Desen ONA gore guncellendi; kapi bu degisiklikte KIRMIZI
    // vererek dogru davrandi.
    /const where: Record<string, unknown> = \{ deletedAt: null \}/.test(servis),
    'silinmisler gizlenmezse yumusak silme EKRANDA gorunmez',
  );
  // ⭐ EN KRITIK: bu iki assert olmadan ozellik ekranda calisir, gercekte hayir.
  check(
    'A6 ⭐ silinen hesap GIRIS YAPAMAZ (auth.service login kapisi)',
    /user\.deletedAt/.test(authServis),
    'atlanirsa: silme dugmesi calisir gorunur, kullanici girmeye devam eder',
  );
  check(
    'A7 ⭐ silinen hesabin MEVCUT TOKEN`i gecersiz (jwt.strategy kapisi)',
    /user\.deletedAt/.test(jwt),
    'token omru 7 gun — tek basina giris kapisi yetmez',
  );
  check(
    'A8 ⟨olcut⟩ ban kapisi da hala yerinde (probe yeni kapiyi eskisiyle karistirmiyor)',
    /status === 'banned'/.test(authServis) && /status === 'banned'/.test(jwt),
  );

  // ── B · DENETIM KAYDI (2.5) ───────────────────────────────────────────
  console.log('\n── B · DENETIM KAYDI ──');
  check('B1 YoneticiOlayi modeli semada var', /model YoneticiOlayi\s*\{/.test(sema));
  check(
    'B2 aktor ve hedef AYRI kayitli (kim, kime)',
    /yoneticiId\s+String/.test(sema) && /hedefKullaniciId\s+String\?/.test(sema),
  );
  check(
    'B3 yonetici e-postasi KOPYALANIYOR (hedef silinse de kayit okunabilir kalsin)',
    /yoneticiEpsta\s+String/.test(sema),
  );
  check(
    'B4 ⭐ aktor kimligi controller`dan servise TASINIYOR (@CurrentUser)',
    /@CurrentUser\(\)\s+yonetici/.test(kontrolcu),
    '07.09 oncesi bu dosyada @CurrentUser SIFIR kez geciyordu — log yazacak veri yoktu',
  );
  const currentUserSayisi = (kontrolcu.match(/@CurrentUser\(\)/g) ?? []).length;
  check(
    `B5 ALTI mutasyon ucunun tamami aktor aliyor (${currentUserSayisi}/6)`,
    currentUserSayisi >= 6,
    'rol, durum, paket, silme, abonelik ekle, abonelik kaldir',
  );
  const denetimCagri = (servis.match(/this\.denetimYaz\(/g) ?? []).length;
  check(
    `B6 alti mutasyonun hepsi denetim yaziyor (${denetimCagri}/6)`,
    denetimCagri >= 6,
  );
  check(
    'B7 denetim yazimi islemi DUSURMUYOR (try/catch)',
    /catch \(e\) \{[\s\S]{0,200}?\[denetim\]/.test(servis),
    'log yazilamazsa yonetici islemi yine de tamamlanmali',
  );
  check(
    'B8 denetim kaydi OKUNABILIYOR (uc var)',
    /@Get\('denetim'\)/.test(kontrolcu) && /denetimKaydiGetir/.test(servis),
  );

  // ── C · KILITLENME KORUMASI ───────────────────────────────────────────
  console.log('\n── C · KILITLENME KORUMASI ──');
  check(
    'C1 yonetici KENDI hesabina rol/durum/silme uygulayamaz',
    /yonetici\.id === hedefId/.test(servis),
  );
  check(
    'C2 SON yonetici korunuyor (kalan admin sayimi)',
    /role: 'admin', deletedAt: null, NOT: \{ id: hedefId \}/.test(servis),
    'son admin giderse panele girecek kimse kalmaz',
  );
  check(
    'C3 koruma UC islemde de cagriliyor (rol, durum, silme)',
    (servis.match(/this\.kilitlenmeyiOnle\(/g) ?? []).length >= 3,
  );

  // ── D · GIRDI DOGRULAMASI ─────────────────────────────────────────────
  console.log('\n── D · GIRDI DOGRULAMASI ──');
  // @Body('x') tek ozellik cikardigi icin global ValidationPipe DEVREYE GIRMEZ
  // (metatype String olur). Bu yuzden dogrulama servis katmaninda ELLE.
  check(
    'D1 rol degeri dogrulaniyor',
    /\['admin', 'user'\]\.includes\(role\)/.test(servis),
  );
  check(
    'D2 durum degeri dogrulaniyor',
    /\['active', 'banned'\]\.includes\(status\)/.test(servis),
  );
  check(
    'D3 paket degeri dogrulaniyor',
    /\['core', 'pro', 'suite'\]\.includes\(tier\)/.test(servis),
  );

  // ── E · ON YUZ (2.2) ──────────────────────────────────────────────────
  console.log('\n── E · ON YUZ ──');
  check(
    'E1 ⭐ mutasyon uclari ON YUZDEN CAGRILIYOR (api.patch)',
    /api\.patch\(`\/admin\/users\/\$\{u\.id\}\/\$\{alan\}`/.test(sayfa),
    '13.08`den 07.09`a kadar bu sayfada TEK bir api.patch yoktu',
  );
  check(
    'E2 silme cagrisi bagli (api.delete)',
    /api\.delete\(`\/admin\/users\/\$\{u\.id\}`\)/.test(sayfa),
  );
  check(
    'E3 silmeden once E-POSTA yazdirarak onay',
    /promptValue\(/.test(sayfa) &&
      /toLowerCase\(\) !== u\.email\.toLowerCase\(\)/.test(sayfa),
    'yanlis yazilirsa istek GITMEMELI',
  );
  check(
    'E4 rol/paket/durum satir ici Select`e bagli',
    (sayfa.match(/onValueChange=\{\(v\) => alanDegistir\(u, '/g) ?? []).length === 3,
  );
  check(
    'E5 role/paket/durum SUZGECLERI var (2.1`in eksik parcasi)',
    /rolSuzgec/.test(sayfa) && /paketSuzgec/.test(sayfa) && /durumSuzgec/.test(sayfa),
  );
  check(
    'E6 yonetici kendi satirini degistiremiyor (niyet on yuzde de belli)',
    /const kendisi = u\.id === kendiId/.test(sayfa),
  );

  // ── F · ADMIN KAPISI (2.7) ────────────────────────────────────────────
  console.log('\n── F · ADMIN KAPISI ──');
  check(
    'F1 /admin kapisi ROL okuyor (e-posta DEGIL)',
    /user\.role !== 'admin'/.test(adminDuzen),
  );
  check(
    'F2 sabit ADMIN_EMAIL kaldirilmis',
    !/ADMIN_EMAIL/.test(adminDuzen),
    'backend rol ile karar veriyor; FE`nin e-postaya bakmasi ikinci admin acilinca kirar',
  );

  // ── G · GERCEK PAKET (yetkili kaynak) ─────────────────────────────────
  console.log('\n── G · GERCEK PAKET ──');
  const tierGuard = kodu(oku('backend/src/altyapi/auth/guards/tier.guard.ts'));
  check(
    'G1 getUsers YETKILI KAYNAGI (Abonelik -> PaketSurumu -> Paket) okuyor',
    /prisma\.abonelik\.findMany/.test(servis) && /paketSurumu/.test(servis),
    'ekran 13.08`den beri User.tier ve UserSubscription gosteriyordu; ikisi de 28.08`den beri yetkili kaynak DEGIL',
  );
  check(
    'G2 kullanici basina AYRI sorgu YOK (N+1 onlendi)',
    /firmaId: \{ in: firmaIdler \}/.test(servis),
  );
  check(
    'G3 ayrisma ISARETLENIYOR (sessiz erisim kusuru gorunur olsun)',
    /paketAyrismasi/.test(servis),
  );
  check(
    'G4 ⭐ TierGuard yetkili kaynagi DA okuyor',
    /prisma\.abonelik\.findUnique/.test(tierGuard),
    'HICBIR odeme yolu User.tier YAZMIYOR — pro alan firma /labor`da 403 alirdi',
  );
  check(
    'G5 YUKSEK olan kazaniyor (izin GENISLETIR, hicbir kullaniciyi daraltmaz)',
    /Math\.max\(tierSeviye, abonelikSeviye\)/.test(tierGuard),
    'yalniz Abonelik`e bakmak `suite` tier`li mevcut hesaplari KIRARDI',
  );
  check(
    'G6 ⟨olcut⟩ User.tier hala okunuyor (kaynagi silmedik, EKLEDIK)',
    /select: \{ tier: true, firmaId: true \}/.test(tierGuard),
  );
  check(
    'G7 on yuz gercek paketi ve ayrismayi gosteriyor',
    /gercekPaket/.test(sayfa) && /paketAyrismasi/.test(sayfa),
  );

  // ── H · AI MALIYET ATFI (2.6) ─────────────────────────────────────────
  console.log('\n── H · AI MALIYET ATFI ──');
  const aiServis = kodu(oku('backend/src/ozellik/giris/ai/ai.service.ts'));
  const aiKontrolcu = kodu(oku('backend/src/ozellik/giris/ai/ai.controller.ts'));
  check(
    'H1 AiUsageLog atif alanlari semada (nullable)',
    /userId\s+String\?/.test(sema) && /firmaId\s+String\?/.test(sema),
  );
  check(
    'H2 atif indeksli (maliyet sorgusu tam tarama olmasin)',
    /@@index\(\[userId, createdAt\]\)/.test(sema),
  );
  check(
    'H3 logUsage kimlik aliyor ve YAZIYOR',
    /kimlik\?: \{ userId\?: string \| null; firmaId\?: string \| null \}/.test(aiServis) &&
      /userId: params\.kimlik\?\.userId \?\? null/.test(aiServis),
  );
  check(
    'H4 ⭐ ceviri ucu KULLANICIYI gecirıyor (zincirin en kolay koptugu yer)',
    /@CurrentUser\(\) user/.test(aiKontrolcu) && /userId: user\?\.id/.test(aiKontrolcu),
    'controller kimligi almazsa logUsage`a gecirecek veri OLMAZ ve atif sessizce bos kalir',
  );
  check(
    'H5 havuz PDF ayiklamasi da atifli (yoneticiye yazilir)',
    /extractGlobalMaterials\(fileBuffer, \{/.test(servis),
  );
  check(
    'H6 ⟨olcut⟩ atif YAZILAMAZSA cagri DUSMUYOR (kimlik istege bagli)',
    /kimlik\?: \{/.test(aiServis),
  );

  // ── I · SUNUCU TARAFI SUZGEC (2.1) ────────────────────────────────────
  console.log('\n── I · SUNUCU TARAFI SUZGEC ──');
  const kontrolcuHam = oku('backend/src/ozellik/kutuphane/admin/admin.controller.ts');
  check(
    'I1 sorgu DTO`su var ve SINIF tipiyle @Query`ye bagli (ValidationPipe bu sekilde CALISIR)',
    /@Query\(\) sorgu: KullanicilarSorgusuDto/.test(kontrolcuHam),
  );
  check(
    'I2 suzgecler SUNUCUDA uygulaniyor',
    /where\.role = sorgu\.rol/.test(servis) && /where\.email = \{ contains/.test(servis),
  );
  check(
    'I3 sayfalama sinirli (sinirsiz take tum tabloyu bellege cekerdi)',
    /Math\.min\(Math\.max\(sorgu\?\.adet \?\? 200, 1\), 500\)/.test(servis),
  );
  check(
    'I4 ⭐ DONUS SEKLI hala DIZI (nesneye cevirmek sayfayi RENDER`da cokertirdi)',
    /return kayitlar;/.test(kontrolcuHam),
    '`users.filter is not a function` — fetch`in try/catch`i bunu yakalamaz',
  );
  check(
    'I5 toplam AYRI sayiliyor ve baslikta gonderiliyor',
    /prisma\.user\.count\(\{ where \}\)/.test(servis) &&
      /X-Toplam-Kayit/.test(kontrolcuHam),
    'kayitlar.length yalniz SAYFAYI sayar; ekran yanlis toplam gosterirdi',
  );
  check(
    'I6 on yuz suzgecleri sunucuya gonderiyor',
    /params\.arama = query\.trim\(\)/.test(sayfa) && /params\.rol = rolSuzgec/.test(sayfa),
  );

  // ── J · DENETIM EKRANI ────────────────────────────────────────────────
  console.log('\n── J · DENETIM EKRANI ──');
  const denetimSayfa = oku('frontend/app/admin/denetim/page.tsx');
  check('J1 denetim ekrani var ve ucu cagiriyor',
    /api\.get<YoneticiOlayi\[\]>\('\/admin\/denetim'/.test(denetimSayfa));
  check(
    'J2 ⭐ TAMLIK IDDIA ETMIYOR (tavana degince acikca soyluyor)',
    /tavanaDegildi/.test(denetimSayfa) && /Bu liste eksik olabilir/.test(denetimSayfa),
    'denetim ekraninda "boyle bir islem yok" yanlis sonucunun bedeli agirdir',
  );
  check(
    'J3 suzgec secenekleri VERIDEN turetiliyor (sabit liste yeni tipi gizlerdi)',
    /new Set\(olaylar\.map\(\(o\) => o\.tip\)\)/.test(denetimSayfa),
  );
  check(
    'J4 kullanicilar ekranindan tek kullanici gecmisine baglanti var',
    /admin\/denetim\?hedef=\$\{u\.id\}/.test(sayfa),
  );
  check(
    'J5 menude yer aliyor',
    /\/admin\/denetim/.test(oku('frontend/ozellik/kutuphane/admin/AdminSidebar.tsx')),
  );

  son();
}

function son(): void {
  console.log(
    `\n${'='.repeat(64)}\nFAZ 2 KULLANICI YONETIMI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
  );
  if (failed) {
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

main();
