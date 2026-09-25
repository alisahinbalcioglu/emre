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
import { InternalServerErrorException } from '@nestjs/common';
import { AdminService } from '../src/ozellik/kutuphane/admin/admin.service';
import { kullanimiOlc } from '../src/ozellik/giris/ai/ai-maliyet';
import { bitmezseKirmizi } from './yardimci/bitmezse-kirmizi';

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

async function main(): Promise<void> {
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
  // ── FAZ 7 F1b (R1/E-1 · R1-D7): VERI DESENI TEK SAF FONKSIYONDA ────────
  // ESKI ANLAM: `deletedAt: new Date()` satiri `admin.service.ts` icinde
  // araniyordu ve TEK alan olcuyordu.
  // YENI ANLAM: yonetici silmesi hesap kapatmanin IKIZIDIR — desen
  // `uyelik-kurallari.ts` `kapatmaVerisi`ndedir (deletedAt +
  // passwordChangedAt + kapatilanEposta + anonim e-posta) ve servis onu
  // CAGIRIR. Eski hâl ikiz DEGILDI: e-posta serbest kalmiyordu ve mevcut
  // token 7 gun daha calisiyordu.
  const kapatmaKural = kodu(oku('backend/src/ozellik/firma/uyelik-kurallari.ts'));
  check(
    'A4 deleteUser kapatma veri desenini uyguluyor (kapatmaVerisi cagrisi)',
    /kapatmaVerisi\(/.test(servis) && /deletedAt:\s*simdi/.test(kapatmaKural),
  );
  // ⚠ 21.09 (plan 5.8 · K1) ANLAM DEGISTI: e-posta ARTIK HER kapatmada
  // anonimlesmiyor. Yonetici silmesinde adres 30 gun HESAPTA KALIR (musteri
  // geri donebilsin); anonimlestirme YALNIZ `ekiptenCikarildi` dalinda.
  // Kapi bu yuzden iki sey birden olcer: yonetici yolunun NEDENI dogru mu,
  // ve anonimlestirme o dala BAGLI mi.
  check(
    'A4b ⭐ yonetici silmesi hesap kapatmanin IKIZI (token olur + neden `yonetici`)',
    /passwordChangedAt:\s*simdi/.test(kapatmaKural) &&
      /kapatilanEposta:\s*user\.email/.test(kapatmaKural) &&
      /kapatmaVerisi\(user, simdi, 'yonetici'\)/.test(servis),
    'ikiz degilse: silinen kisi 7 gun daha calisir ve imha sayaci hic baslamaz',
  );
  check(
    'A4b-2 ⭐ adres anonimlestirmesi YALNIZ `ekiptenCikarildi` daline bagli (K1)',
    /neden === 'ekiptenCikarildi'[\s\S]{0,140}kapali-\$\{user\.id\}@/.test(kapatmaKural) &&
      // Kosulsuz bir `email:` satiri KALMAMALI — kalirsa geri donus yolu kapanir.
      !/^\s*email:\s*`kapali-/m.test(kapatmaKural),
    'kosulsuz anonimlestirme geri donen musteriyi kendi adresinden kilitler',
  );
  check(
    'A4c ⭐ tek kullanicili firmada ABONELIK de iptal ediliyor (E-1)',
    /satinAlma\.iptalEt\(\s*user\.firmaId,\s*yonetici\.id,\s*'yonetici silme'\s*\)/.test(servis),
    'atlanirsa: firma kapanir ama kart cekilmeye devam eder',
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
  // FAZ 7 F1b: kapi `oturum.servisi.ts` `hesapKapisi`na tasindi; iki dosya
  // birden okunur (biri digerini kaybederse kizarir).
  const oturumServis = kodu(oku('backend/src/altyapi/auth/oturum.servisi.ts'));
  check(
    'A6 ⭐ silinen hesap GIRIS YAPAMAZ (hesapKapisi + auth.service cagrisi)',
    /user\.deletedAt/.test(oturumServis) && /hesapKapisi\(/.test(authServis),
    'atlanirsa: silme dugmesi calisir gorunur, kullanici girmeye devam eder',
  );
  check(
    'A7 ⭐ silinen hesabin MEVCUT TOKEN`i gecersiz (jwt.strategy kapisi)',
    /user\.deletedAt/.test(jwt),
    'token omru 7 gun — tek basina giris kapisi yetmez',
  );
  check(
    'A8 ⟨olcut⟩ ban kapisi da hala yerinde (probe yeni kapiyi eskisiyle karistirmiyor)',
    /status === 'banned'/.test(oturumServis) && /status === 'banned'/.test(jwt),
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
    // 24.09 (A2): "abonelik ekle/kaldir" uclari KALDIRILDI (erisim vermiyorlardi).
    'rol, durum, paket, firma rolu, MFA sifirlama, silme',
  );
  // Paket ucunun GOVDESI: imzadan bir sonraki `  async ` tanimina kadar.
  // Regex yerine dilim: `[^)]*` cok satirli imzada yanlis yerde biterdi.
  const paketUcuBasi = servis.indexOf('async updateUserTier(');
  const paketUcuSonraki = servis.indexOf('\n  async ', paketUcuBasi + 1);
  const paketUcuGovdesi = paketUcuBasi < 0
    ? ''
    : servis.slice(paketUcuBasi, paketUcuSonraki < 0 ? servis.length : paketUcuSonraki);
  const denetimCagri = (servis.match(/this\.denetimliMutasyon\(/g) ?? []).length;
  // 17.09.2026 (2.12): paket ucu ARTIK MUTASYON DEGIL - hicbir sey yazmiyor,
  // gerekceli 400 doner. Beklenti 6'da birakilsaydi kapi surekli kirmizi
  // kalirdi; 5'e dusurulurken paket ucunun YAZMADIGI ayrica olculur (B6b) -
  // yoksa "bes" beklentisi bir unutmayi da gizlerdi.
  // 24.09.2026 (A2): "abonelik ekle/kaldir" (eski kisi-basi tablo) KALDIRILDI;
  // yerlerine F1b/F2b'nin firma rolu ve MFA sifirlama mutasyonlari zaten
  // vardi. Bugunku BES: rol, durum, firma rolu, MFA sifirlama, silme.
  check(
    `B6 BES mutasyonun hepsi denetimli sarmalayicidan geciyor (${denetimCagri}/5)`,
    denetimCagri >= 5,
  );
  check(
    'B6b * paket ucu hic yazmiyor (updateUserTier`da prisma cagrisi YOK)',
    paketUcuGovdesi.includes('PAKET_ABONELIKTEN')
      && !/this\.prisma|denetimliMutasyon|\.update\(/.test(paketUcuGovdesi),
    `govde=${paketUcuGovdesi.slice(0, 200)}`,
  );
  // 10.09.2026'ya kadar B7 tam tersini olcuyordu: "hatayi YUTAN catch var mi".
  // O davranis kusurun kendisiydi (tablo uretimde 0 satir, ekran "yazilir"
  // diyordu). Artik mutasyon ile denetim satiri ayni transaction'da olmali.
  check(
    'B7 denetim satiri mutasyonla AYNI transaction icinde yaziliyor',
    /\$transaction\(async \(tx\)[\s\S]{0,400}?this\.denetimYaz\(tx/.test(servis),
    'denetimYaz transaction istemcisiyle cagrilmiyor',
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
  // 17.09.2026 (Faz 7 - 2.12) ANLAM DEGISTI. ESKI: "paket ucu gecersiz degeri
  // reddediyor mu" (`['core','pro','suite'].includes(tier)`). YENI: uc ARTIK
  // HIC PAKET YAZMIYOR - seviye yalniz abonelikten gelir; elle paket dagitmak
  // seviyeyi satin almadan koparan tek yoldu. Uc silinmedi (acik kalmis eski
  // panel sekmesi 404 yerine gerekce gorsun) ama gerekceli 400 doner. Deger
  // dogrulamasi ARANMAZ; bulunursa eski govde geri gelmis demektir.
  check(
    'D3 * paket ucu PAKET_ABONELIKTEN ile reddediyor (2.12)',
    /kod: 'PAKET_ABONELIKTEN'/.test(servis)
      && !/\['core', 'pro', 'suite'\]\.includes\(tier\)/.test(servis),
    'uc hala elle paket yaziyor - seviye abonelikten kopuk kalir',
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
  // 17.09.2026 (2.12): paket acilir listesi SALT-OKUNUR ROZETE dondu (uc de
  // reddediyor). Satir ici Select sayisi 3 -> 2; rozetin GERCEKTEN orada
  // oldugu ve eski Select'in geri gelmedigi ayrica olculur.
  // 17.09.2026 (Faz 7 F1b): UCUNCU Select geri geldi ama BASKA bir eksende —
  // `firma-rol`. Gerekce: `deleteUser` son sahipte 400 `SON_SAHIP` doner ve o
  // kapinin bir CIKISI olmali (yonetici baskasini sahip yapabilmeli).
  // Beklenti SAYIYLA degil ADLA kilitlendi: sayi tek basina "hangi uc alan"
  // sorusunu cevaplamiyordu ve `tier` geri gelse de 3 olurdu.
  const satirIciAlanlar = (sayfa.match(/alanDegistir\(u, '([a-z-]+)'/g) ?? [])
    .map((m) => m.replace(/.*'([a-z-]+)'.*/, '$1'))
    .filter((a, i, h) => h.indexOf(a) === i)
    .sort();
  check(
    'E4 satir ici Select`ler TAM OLARAK rol + durum + firma-rol (paket YOK)',
    JSON.stringify(satirIciAlanlar) === JSON.stringify(['firma-rol', 'role', 'status']),
    JSON.stringify(satirIciAlanlar),
  );
  check(
    'E4b * paket satir ici DEGISTIRILEMIYOR, rozet olarak gosteriliyor',
    !/alanDegistir\(u, 'tier'/.test(sayfa) && /seviyeAdi\(u\.tier\)/.test(sayfa),
    'acilir liste geri geldi - yonetici paket dagitmaya devam eder',
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
  const seviyeKaynak = kodu(oku('backend/src/altyapi/auth/seviye.ts'));
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
  // 17.09.2026 (2.12): abonelik sorgusu `altyapi/auth/seviye.ts`e tasindi
  // (ayni sorguyu auth.service de kullaniyor). Kapi artik IKI dosyayi birden
  // okur: guard tek kaynagi cagiriyor mu, o kaynak abonelige mi bakiyor.
  // 21.09.2026 (2.13): fonksiyon adi `firmaPaketSeviyesi` -> `firmaPaketDurumu`
  // oldu (artik yalniz seviyeyi degil erisim durumunu da doner). KURAL AYNI:
  // guard TEK kaynagi cagirir, o kaynak abonelige bakar. Desen ADA degil
  // KURALA baglandi ki bir sonraki yeniden adlandirma kapiyi kirmasin.
  check(
    'G4 * TierGuard seviyeyi YETKILI kaynaktan aliyor (tek cagri, abonelikten)',
    /firmaPaket(Seviyesi|Durumu)\(this\.prisma, user\.firmaId\)/.test(tierGuard)
      && /prisma\.abonelik\.findUnique/.test(seviyeKaynak),
    'HICBIR odeme yolu User.tier YAZMIYOR - pro alan firma /labor`da 403 alirdi',
  );
  // ⭐ 2.13: KARAR erisime bagli seviyeden verilmeli. Ham `paketSeviyesi`
  // karsilastirmaya girerse iptal edilmis abonelik yine kapiyi acar.
  // ⚠ ILK YAZIMIM YANLISTI ve olcum duzeltti: `!/\.paketSeviyesi/` diye genel
  // bir yasak koymustum, oysa guard onu MESAJDA kullaniyor ("Pro aboneliginiz
  // su anda etkin degil") — musteriye HANGI paketin etkisiz oldugunu soylemek
  // dogru davranis. Yasaklanacak sey alanin varligi degil, KARARA girmesi.
  check(
    'G4c * seviye KARSILASTIRMASI `etkinSeviye` ile yapiliyor — 2.13',
    /seviyeSirasi\(paket\.etkinSeviye\)/.test(tierGuard)
      && !/seviyeSirasi\(paket\.paketSeviyesi\)/.test(tierGuard),
    'iptal edilmis abonelik yine kapidan gecer',
  );
  check(
    'G4b * firmasiz hesapta abonelik sorgusu HIC ATILMIYOR',
    /if \(!firmaId\) return/.test(seviyeKaynak),
    'where: { firmaId: undefined } kosulu SESSIZCE duser - ilk abonelik donerdi',
  );
  // 17.09.2026 (Faz 7 - 2.12) G5 ve G6'NIN ANLAMI TERSINE DONDU.
  // ESKI G5: "YUKSEK olan kazaniyor" (`Math.max(tierSeviye, abonelikSeviye)`).
  // ESKI G6: "User.tier hala okunuyor" (`select: { tier: true, firmaId: true }`).
  // O ikisi 07.09'da bilerek yazilmisti: pro satin alan firma `User.tier: core`
  // kaldigi icin 403 aliyordu ve `Math.max` erisimi GENISLETIYORDU. Ama ayni
  // kural ters yonde de aciyordu: `User.tier`i hicbir odeme yolu yazmiyor,
  // yalniz yonetici paneli ELLE degistiriyordu - abonelik iptal edilse,
  // dusurulse ya da hic olmasa bile elle verilmis tier kapiyi acik tutuyordu.
  // YENI kural: seviye YALNIZ abonelikten (`altyapi/auth/seviye.ts`).
  check(
    'G5 * Math.max YOK - iki kaynak birlestirilmiyor (2.12)',
    !/Math\.max\(/.test(tierGuard),
    'iki kaynakli hal geri geldi: elle verilen User.tier yine kapi aciyor',
  );
  check(
    'G6 * TierGuard User.tier OKUMUYOR (yalniz firmaId)',
    /select: \{ firmaId: true \}/.test(tierGuard) && !/tier: true/.test(tierGuard),
    'tier yeniden okunuyor - yetki kaynagi ikiye ayrilmis demektir',
  );
  check(
    'G6b * seviye tek kaynaktan turuyor (firmaPaket* + seviyeSirasi)',
    /firmaPaket(Seviyesi|Durumu)\(/.test(tierGuard) && /seviyeSirasi\(/.test(tierGuard),
  );
  check(
    'G6c * ret mesajinda buyuk harfli CORE/PRO YOK (musteriye gorunen ad)',
    !/toUpperCase\(\)/.test(tierGuard) && /seviyeGorunenAd\(/.test(tierGuard),
    'musteri "CORE" diye bir sey satin almadi - paketin adi Basic',
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
  // Faz 6.2 (14.09): ceviri ucu artik `{quoteId}` alir ve kimligi servise
  // verir; servis ayni kimligi `cevir` → `logUsage`a tasir. Zincir iki halkada
  // olculur — biri koparsa atif yine sessizce bos kalir.
  // 23.09.2026 (Ekip & Izinler): kimlik `teklifKimligiCoz`dan gelir — o da
  // ONCE `kimlikCoz(user)`u yayar (userId + firmaId aynen tasinir), ustune
  // teklif kapsamini ekler. `ekip-izinleri-test.ts` S10 bunu ayrica olcer.
  check(
    'H4 ⭐ ceviri ucu KULLANICIYI gecirıyor (zincirin en kolay koptugu yer)',
    /translate\(@CurrentUser\(\) user/.test(aiKontrolcu) &&
      /teklifiCevir\(teklifKimligiCoz\(user\)/.test(aiKontrolcu) &&
      /teklifKimligiCoz[\s\S]{0,200}\.\.\.kimlikCoz\(user\)/.test(oku('backend/src/altyapi/auth/kimlik.ts')),
    'controller kimligi almazsa logUsage`a gecirecek veri OLMAZ ve atif sessizce bos kalir',
  );
  {
    const ceviriServis = kodu(oku('backend/src/ozellik/giris/ai/ceviri.service.ts'));
    check(
      'H4b ⭐ ceviri servisi kimligi cevir → logUsage zincirine tasiyor',
      /this\.cevir\(r\.icerik\.metinler, hedefDil, k\)/.test(ceviriServis) &&
        /logUsage\(\{\s*kimlik,/.test(ceviriServis),
      'servis kimligi cevir`e vermezse AI kullanim kaydinda kullanici/firma bos yazilir',
    );
  }
  check(
    'H5 havuz PDF ayiklamasi da atifli (yoneticiye yazilir)',
    /extractGlobalMaterials\(fileBuffer, \{/.test(servis),
  );
  check(
    'H6 ⟨olcut⟩ atif YAZILAMAZSA cagri DUSMUYOR (kimlik istege bagli)',
    /kimlik\?: \{/.test(aiServis),
  );
  // Fiyat DAVRANISLA olculur, tablo metniyle degil (14.09): Sonnet 5 $2/$10.
  // 13.09 olcum turu: $3/$15 yazan eski deger paneli 1,5 kat sisiriyordu.
  {
    const bin = kullanimiOlc({ input_tokens: 1000, output_tokens: 1000 }, 'claude-sonnet-5', 'claude');
    check('H7 ★ Sonnet 5 fiyati $2/$10 — 1K girdi + 1K cikti = $0,012', bin.estimatedCost === 0.012, `${bin.estimatedCost}`);
    const onbellek = kullanimiOlc({ cache_read_input_tokens: 10000, cache_creation_input_tokens: 1000 }, 'claude-sonnet-5', 'claude');
    check('H8 onbellek okuma 0,1x · yazma 1,25x Sonnet 5 girdi fiyatindan ($0,002 + $0,0025)', onbellek.estimatedCost === 0.0045, `${onbellek.estimatedCost}`);
    const bilinmeyen = kullanimiOlc({ input_tokens: 1000, output_tokens: 1000 }, 'claude-yeni-model', 'claude');
    check('H9 ⟨olcut⟩ taninmayan Claude modeli en pahali kademeden sayilir ($0,030)', bilinmeyen.estimatedCost === 0.03, `${bilinmeyen.estimatedCost}`);
  }

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

  await davranis();
  son();
}

/**
 * K — DAVRANIS. Sahte veritabaniyla, denetim yazimi KASTEN bozulur.
 *
 * Kaynak regex'i mekanizmanin VARLIGINI olcer; bu blok SONUCUNU olcer:
 * yazim patlayinca islem gercekten 200 donmuyor mu, loga dusuyor mu, geri
 * aliniyor mu. DB gerektirmez (sahte $transaction geri almayi kaydeder).
 */
async function davranis(): Promise<void> {
  console.log('\n── K · DAVRANIS (denetim yazimi KASTEN bozuk) ──');

  // 17.09.2026: bu blok `updateUserTier` uzerinden olcuyordu; o uc 2.12 ile
  // ARTIK PRISMA CAGIRMIYOR (gerekceli 400 firlatir). Olculen sey ucun kendisi
  // degil `denetimliMutasyon` sarmalayicisidir; ayni sarmalayiciyi kullanan
  // `updateUserStatus`a gecildi ('active' secildi: 'banned' kilitlenme
  // kontrolunu tetikler ve sahte Prisma'da olmayan sorgulari calistirirdi).
  const hedef = {
    id: 'hedef-1', email: 'hedef@ornek.test',
    role: 'user', status: 'active', tier: 'core', deletedAt: null,
  };
  const yonetici = { id: 'yonetici-1', email: 'yonetici@ornek.test' };

  const kur = (denetimBozuk: boolean) => {
    const iz = {
      txMutasyon: 0, disMutasyon: 0,
      txDenetim: 0, disDenetim: 0,
      geriAlindi: false,
      loglar: [] as string[],
    };
    const tx = {
      user: { update: async () => { iz.txMutasyon++; return { id: hedef.id }; } },
      yoneticiOlayi: {
        create: async () => {
          if (denetimBozuk) throw new Error('KASITLI-BOZUK-DENETIM');
          iz.txDenetim++;
          return {};
        },
      },
    };
    const prisma = {
      user: {
        findUnique: async () => hedef,
        update: async () => { iz.disMutasyon++; return { id: hedef.id }; },
      },
      yoneticiOlayi: { create: async () => { iz.disDenetim++; return {}; } },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => {
        try {
          return await fn(tx);
        } catch (e) {
          iz.geriAlindi = true;
          throw e;
        }
      },
    };
    // FAZ 7 F1b: dorduncu bagimlilik `SatinAlmaServisi` (E-1).
    const servis = new AdminService(prisma as any, {} as any, {} as any, { iptalEt: async () => undefined } as any, { gonder: async () => undefined } as any);
    (servis as any).logger = {
      error: (m: unknown) => iz.loglar.push(String(m)),
      warn: () => undefined,
      log: () => undefined,
    };
    return { servis, iz };
  };

  // OLCUT: arac saglam yolda calisiyor mu? Calismiyorsa asagidaki K
  // assert'leri yanlis sebeple kirmizi ya da yesil olur.
  {
    const { servis, iz } = kur(false);
    const sonuc = await servis
      .updateUserStatus(yonetici, hedef.id, 'active')
      .then(() => 'basarili', (e: unknown) => e);
    check('K-OLCUT1 saglam yolda islem BASARILI', sonuc === 'basarili', `sonuc=${String(sonuc)}`);
    check(
      'K-OLCUT2 saglam yolda denetim satiri transaction ile YAZILDI',
      iz.txDenetim === 1 && iz.disDenetim === 0,
      `tx=${iz.txDenetim} dis=${iz.disDenetim}`,
    );
  }

  const { servis, iz } = kur(true);
  const hata: any = await servis
    .updateUserStatus(yonetici, hedef.id, 'active')
    .then(() => null, (e: unknown) => e);

  check(
    'K1 denetim yazilamayinca islem BASARILI DONMUYOR',
    hata !== null,
    'islem sessizce basarili dondu — 10.09 oncesi kusur geri geldi',
  );
  check(
    'K2 yoneticiye "islem uygulanmadi" hatasi donuyor (InternalServerErrorException)',
    hata instanceof InternalServerErrorException,
    `hata=${hata?.constructor?.name}`,
  );
  check(
    'K3 hata DENETIM-YAZILAMADI etiketiyle loglandi (nobetcinin saydigi dize)',
    iz.loglar.some((l) => l.includes('DENETIM-YAZILAMADI')),
    `loglar=${JSON.stringify(iz.loglar)}`,
  );
  check(
    'K4 transaction GERI ALINDI (hata transaction icinden firlatildi)',
    iz.geriAlindi,
    'hata transaction disinda firlatildi ya da yutuldu',
  );
  check(
    'K5 mutasyon transaction ICINDE yapildi (disaridaki user.update cagrilmadi)',
    iz.txMutasyon === 1 && iz.disMutasyon === 0,
    `tx=${iz.txMutasyon} dis=${iz.disMutasyon}`,
  );
  check(
    'K6 log satirina e-posta DUSMEDI (id yaziliyor)',
    !iz.loglar.some((l) => l.includes('@ornek.test')),
    `loglar=${JSON.stringify(iz.loglar)}`,
  );
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

bitmezseKirmizi(main().catch((e) => {
  console.error('KAPI COKTU:', e);
  process.exit(1);
}));
