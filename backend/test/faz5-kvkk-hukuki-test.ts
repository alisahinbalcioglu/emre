/**
 * FAZ 5 — KABLOLAMA KAPISI  (`npm run test:faz5`)
 *
 * DB GEREKTIRMEZ. Sema, migration ve kaynak dosyalarin GERCEK icerigi olculur.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * Faz 5'in maddeleri "eklendi mi" degil "DOGRU MU / BAGLI MI" sorusuyla
 * ayakta duruyor ve bircogu SESSIZCE yanlis olabilir:
 *
 *   1) Veri indirme ucuna `@GerekliYetenek(CIKTI_INDIR)` eklenirse, odemesi
 *      geciken kullanici KVKK hakkini kullanamaz — ve bu, mevcut export
 *      uclarini KOPYALAYAN birinin yapacagi EN DOGAL hatadir.
 *   2) `sozlesmeOnayi` yalniz `@IsBoolean()` ile dogrulanirsa `false` degeri
 *      de GECERLI sayilir ve sunucu onaysiz kullaniciyi kaydeder.
 *   3) Migration mevcut hesaplara onay damgasi BACKFILL EDERSE, hic
 *      verilmemis bir onay kayda gecer — ispat icin tuttugumuz alan ilk
 *      gunden yalan olur.
 *   4) Altbilgi UC duzenden yalniz ikisine mount edilirse admin ekranlarinda
 *      GORUNMEZ (rapor bu ucuncu duzeni atlamisti).
 *   5) Hukuki metin surumu backend ile on yuzde AYRISIRSA, kullanicinin
 *      onayladigi surum yanlis kaydedilir.
 *   6) Cerez seridine "Kabul et / Reddet" konursa, olmayan bir secim varmis
 *      gibi gorunur (olculdu: bu uygulamada HTTP cerezi ve izleyici YOK).
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
const varMi = (p: string) => fs.existsSync(path.join(KOK, p));

/** Yorumlari soy — kapi kendi belgelerini olcmesin (bu depoda BES kez yasandi). */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const jsxKodu = (s: string) => kodu(s).replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
const sqlKodu = (s: string) => s.replace(/^\s*--.*$/gm, '');

function main(): void {
  // ── A. SEMA + MIGRATION ────────────────────────────────────────────────
  console.log('\n── A · ONAY KAYITLARI (sema + goc) ──');
  const sema = kodu(oku('backend/prisma/schema.prisma'));
  const userBlok = sema.slice(sema.indexOf('model User {'), sema.indexOf('model EslesmeHafizasi'));
  check('A1 sozlesmeOnayiAt TARIH (boolean degil)', /sozlesmeOnayiAt\s+DateTime\?/.test(userBlok));
  check('A2 sozlesmeSurumu var (hangi metne onay verildigi)', /sozlesmeSurumu\s+String\?/.test(userBlok));
  check('A3 ticariIletiOnayiAt AYRI alan', /ticariIletiOnayiAt\s+DateTime\?/.test(userBlok));
  check('A4 kapatilanEposta var (adres kilitli kalmasin)', /kapatilanEposta\s+String\?/.test(userBlok));

  const mig = sqlKodu(oku('backend/prisma/migrations/20260909140000_faz5_onay_ve_hesap_kapatma/migration.sql'));
  check('A5 dort kolon ekleniyor',
    /"sozlesmeOnayiAt"/.test(mig) && /"sozlesmeSurumu"/.test(mig)
    && /"ticariIletiOnayiAt"/.test(mig) && /"kapatilanEposta"/.test(mig));
  // ⭐ EN ONEMLI DURUSTLUK IDDIASI: hic verilmemis onay kayda GECMEMELI.
  check('A6 onay alanlarina BACKFILL YOK (uydurma onay yazilmiyor)',
    !/UPDATE\s+"User"\s+SET\s+"sozlesmeOnayiAt"/i.test(mig)
    && !/UPDATE\s+"User"\s+SET\s+"ticariIletiOnayiAt"/i.test(mig));
  check('A-O1 OLCUT: migration DROP/DELETE ICERMIYOR', !/DROP TABLE|DELETE FROM/i.test(mig));

  // ── B. KAYIT ONAYI ─────────────────────────────────────────────────────
  console.log('\n── B · KAYIT ONAYI (sunucu tarafi kapi) ──');
  const regDto = kodu(oku('backend/src/altyapi/auth/dto/register.dto.ts'));
  // ⚠ `@IsBoolean()` TEK BASINA YETMEZ: `false` da gecerli bir boolean'dir.
  check('B1 sozlesmeOnayi @Equals(true) ile ZORUNLU (IsBoolean tek basina yetmez)',
    /@Equals\(true/.test(regDto));
  check('B2 ticariIletiOnayi AYRI ve @IsOptional', /@IsOptional\(\)[\s\S]{0,80}ticariIletiOnayi/.test(regDto));
  const authSrv = kodu(oku('backend/src/altyapi/auth/auth.service.ts'));
  check('B3 register onay ZAMANINI yaziyor', /sozlesmeOnayiAt:\s*simdi/.test(authSrv));
  check('B4 register onaylanan SURUMU yaziyor', /sozlesmeSurumu:\s*HUKUKI_METIN_SURUMU/.test(authSrv));
  // ⚠ Varsayilan `true` OLAMAZ — gonderilmediyse izin VERILMEMISTIR.
  check('B5 ticari ileti izni yalniz ACIKCA true ise damgalanir',
    /ticariIletiOnayiAt:\s*dto\.ticariIletiOnayi === true \? simdi : null/.test(authSrv));
  const kayitSayfa = jsxKodu(oku('frontend/app/register/page.tsx'));
  check('B6 kayit ekraninda IKI AYRI kutu var',
    /sozlesmeOnayi/.test(kayitSayfa) && /ticariIletiOnayi/.test(kayitSayfa));
  check('B7 ticari ileti kutusu ONCEDEN ISARETSIZ (useState(false))',
    /const \[ticariIletiOnayi, setTicariIletiOnayi\] = useState\(false\)/.test(kayitSayfa));
  check('B8 onaylar istege KONULUYOR (yoksa kutu suslemedir)',
    /sozlesmeOnayi,[\s\S]{0,60}ticariIletiOnayi,/.test(kayitSayfa));

  // ── C. KVKK UCLARI ─────────────────────────────────────────────────────
  console.log('\n── C · KVKK m.11 UCLARI ──');
  const hesap = kodu(oku('backend/src/altyapi/auth/hesap.servisi.ts'));
  const authCtrl = kodu(oku('backend/src/altyapi/auth/auth.controller.ts'));
  check('C1 veri indirme ucu bagli', /@Get\('hesabim\/verilerim'\)/.test(authCtrl));
  check('C2 hesap kapatma ucu bagli', /@Post\('hesabimi-kapat'\)/.test(authCtrl));
  // ⭐⭐ BU TURUN EN ONEMLI ASSERT'I: mevcut export uclarini kopyalayan biri
  // `@GerekliYetenek(CIKTI_INDIR)` de kopyalar ve KVKK hakkini odeme
  // kapisinin arkasina koyar.
  const kvkkBlok = authCtrl.slice(authCtrl.indexOf("hesabim/verilerim") - 400);
  check('C3 KVKK uclarinda @GerekliYetenek YOK (odeme kapisi arkasinda degil)',
    !/@GerekliYetenek/.test(kvkkBlok));
  check('C4 kapatma PAROLA dogruluyor (calinmis token yetmez)',
    /bcrypt\.compare\(parola/.test(hesap));
  check('C5 SON YONETICI korumasi var (panel erisilemez kalmasin)',
    /role: 'admin', deletedAt: null, NOT: \{ id: userId \}/.test(hesap));
  // ⚠ Olculdu: silme ile abonelik BAGLI DEGIL — kart cekilmeye devam ederdi.
  check('C6 kapatma ABONELIGI de iptal ediyor', /satinAlma\.iptalEt\(/.test(hesap));
  check('C7 kapatma mevcut TOKEN`i da olduruyor', /passwordChangedAt:\s*simdi/.test(hesap));
  // ⚠ Olculdu: `email` @unique — adres serbest birakilmazsa kullanici geri donemez.
  check('C8 e-posta anonimlestirilip ORIJINALI saklaniyor',
    /kapatilanEposta:\s*user\.email/.test(hesap) && /email:\s*`kapali-\$\{user\.id\}@/.test(hesap));
  check('C9 admin silme servisi CAGRILMIYOR (o servis self-silmeyi YASAKLIYOR)',
    !/adminService|AdminService/.test(hesap));
  // ⚠ DURUSTLUK: "verileriniz silindi" DENMEMELI — silinmiyor.
  check('C10 yanit "silindi" DEMIYOR (deletedAt imha degildir)',
    !/verileriniz silindi|veriniz silindi/i.test(hesap));
  check('C11 veri indirme ikili dosyalari SAYIYOR (sessizce atlamiyor)',
    /ikiliVeriler/.test(hesap));

  // ── D. HUKUKI SAYFALAR ─────────────────────────────────────────────────
  console.log('\n── D · HUKUKI SAYFALAR ve ALTBILGI ──');
  for (const yol of ['gizlilik', 'kullanim-kosullari', 'cerez-politikasi', 'mesafeli-satis']) {
    check(`D1 /${yol} rotasi VAR`, varMi(`frontend/app/${yol}/page.tsx`));
  }
  const metinler = oku('frontend/ozellik/hukuki/metinler.ts');
  const metinlerKod = kodu(metinler);
  check('D2 dort metin de tanimli',
    ['GIZLILIK', 'KULLANIM_KOSULLARI', 'CEREZ_POLITIKASI', 'MESAFELI_SATIS']
      .every((d) => new RegExp(`export const ${d}: HukukiMetin`).test(metinlerKod)));
  // ⭐ Metnin EN ONEMLI cumlesi: yuklenen dosya icerigi AI saglayicisina gidiyor.
  check('D3 gizlilik metni ANTHROPIC/ABD aktarimini SOYLUYOR',
    /Anthropic/.test(metinler) && /Amerika Birleşik Devletleri/.test(metinler));
  check('D4 metin "hesap kapatma imha DEGIL" ayrimini yapiyor',
    /imha/i.test(metinler));
  check('D5 iyzico betik enjeksiyonu ADIYLA aniliyor', /iyzico/i.test(metinler));
  check('D6 satici bilgileri YER TUTUCU (uydurma unvan/adres YOK)',
    /\[FİRMA UNVANI\]/.test(metinler) && /dolduruldu: false/.test(metinlerKod));
  // ⚠ Iki paket ayri derlenir; surumler AYRISIRSA yanlis onay kaydedilir.
  const beSurum = (oku('backend/src/altyapi/auth/hukuki-surum.ts').match(/'([\d-]+)'/) ?? [])[1];
  const feSurum = (metinler.match(/HUKUKI_METIN_SURUMU = '([\d-]+)'/) ?? [])[1];
  check('D7 metin surumu backend ve on yuzde AYNI', Boolean(beSurum) && beSurum === feSurum,
    `backend=${beSurum} onyuz=${feSurum}`);
  check('D8 taslak durumu ACIKCA isaretli (onaylanmamis metin oyle gorunmesin)',
    /HUKUKI_METIN_DURUMU[^\n]*=\s*'taslak'/.test(metinlerKod));
  const sayfaKabuk = jsxKodu(oku('frontend/ozellik/hukuki/HukukiSayfa.tsx'));
  check('D9 taslak seridi kabukta (dort sayfada birden)',
    /HUKUKI_METIN_DURUMU === 'taslak'/.test(sayfaKabuk));

  const altbilgi = jsxKodu(oku('frontend/ortak/kabuk/components/layout/Altbilgi.tsx'));
  check('D10 altbilgi baglantilari LISTEDEN turuyor (elle senkron degil)',
    /HUKUKI_SAYFALAR\.map/.test(altbilgi));
  check('D11 satici bilgisi doldurulmadikca GOSTERILMIYOR', /SATICI\.dolduruldu &&/.test(altbilgi));
  // ⭐ UC DUZEN — rapor ucuncusunu (admin) atlamisti.
  for (const [ad, yol] of [
    ['kok', 'frontend/app/page.tsx'],
    ['korumali', 'frontend/app/(protected)/layout.tsx'],
    ['admin', 'frontend/app/admin/layout.tsx'],
  ] as const) {
    check(`D12 altbilgi ${ad} duzenine mount EDILDI`, /<Altbilgi/.test(jsxKodu(oku(yol))));
  }

  // ── E. DEPOLAMA SERIDI ─────────────────────────────────────────────────
  console.log('\n── E · DEPOLAMA BILGILENDIRMESI ──');
  const serit = oku('frontend/ortak/kabuk/components/layout/DepolamaSeridi.tsx');
  const seritKod = jsxKodu(serit);
  check('E1 serit kok duzene mount edildi', /<DepolamaSeridi/.test(jsxKodu(oku('frontend/app/layout.tsx'))));
  // ⚠ Olculdu: HTTP cerezi ve izleyici YOK — "Reddet" secenegi olmayan bir
  // secim varmis gibi gosterirdi.
  check('E2 "Reddet" dugmesi YOK (olmayan secim vaat edilmiyor)',
    !/Reddet|Tümünü Kabul/i.test(seritKod));
  check('E3 metin cerez KULLANILMADIGINI soyluyor', /çerez kullanmıyoruz/i.test(serit));
  check('E4 cerez politikasina baglanti var', /\/cerez-politikasi/.test(seritKod));
  check('E5 depolama erisilemezse serit GOSTERILMIYOR (kapatilamaz serit olmasin)',
    /catch\s*\{/.test(seritKod));

  // ── F. E-POSTA CEVAP VAADI ─────────────────────────────────────────────
  console.log('\n── F · E-POSTA CEVAP VAADI (canli kusur onarimi) ──');
  const eposta = oku('backend/src/ozellik/odeme/eposta/eposta.servisi.ts');
  const epostaKod = kodu(eposta);
  check('F1 replyTo yalniz TANIMLIYSA gonderiliyor',
    /\.\.\.\(this\.cevapAdresi \? \{ replyTo: this\.cevapAdresi \} : \{\}\)/.test(epostaKod));
  check('F2 cevap vaadi KOSULLU (adres yoksa vaat YOK)',
    /cevapVaadi\(\)/.test(epostaKod) && /yanıtlar ulaşmaz/.test(eposta));
  // ⚠ IKIZ: HTML ve duz metin govdesi AYNI yardimciyi kullanmali.
  check('F3 IKI GOVDE de ayni yardimciyi kullaniyor (HTML + duz metin)',
    (epostaKod.match(/this\.cevapVaadi\(\)/g) ?? []).length >= 2);
  const compose = oku('docker-compose.yml');
  // ⚠ OLCUT DUZELTMESI: duz `/MAIL_REPLY_TO:/g` deseni `${MAIL_REPLY_TO:-}`
  // icindeki ikinci gecisi de sayiyordu ve kapi YANLIS kirmizi yaniyordu.
  // Sayilmasi gereken YAML ANAHTARI, yani satir basindaki bicim.
  check('F4 MAIL_REPLY_TO compose`ta YAML anahtari olarak TEK KEZ (yinelenen anahtar compose`u kirar)',
    (compose.match(/^\s*MAIL_REPLY_TO:/gm) ?? []).length === 1);
  check('F5 MAIL_REPLY_TO .env.example`da belgeli', /MAIL_REPLY_TO=/.test(oku('.env.example')));

  // ── G. PROFIL EKRANI ───────────────────────────────────────────────────
  console.log('\n── G · PROFILDE KVKK HAKLARI ──');
  const profil = jsxKodu(oku('frontend/app/(protected)/profile/page.tsx'));
  check('G1 veri indirme dugmesi var', /verileriIndir/.test(profil) && /hesabim\/verilerim/.test(profil));
  check('G2 hesap kapatma parola ISTIYOR', /hesabimi-kapat/.test(profil) && /kapatmaParola/.test(profil));
  check('G3 kapatma sonrasi yerel oturum TEMIZLENIYOR',
    /removeItem\('token'\)[\s\S]{0,120}removeItem\('user'\)/.test(profil));
  // ⚠ OLCUT DUZELTMESI: assert HAM metinde ariyordu ve yasakladigi cumleyi
  // kendi JSX YORUMUNDA buluyordu — kapi kendi belgesini olcuyordu.
  // Bu depoda ayni tuzagin ALTINCI ornegi; yorumlar SOYULARAK aranir.
  check('G4 ekran "silinir" DEMIYOR — yorum DEGIL kod (imha vaat edilmiyor)',
    !/verileriniz silinir|tamamen silinir/i.test(profil));

  // ── SONUC ──────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(64));
  console.log(`FAZ 5: ${passed} PASS, ${failed} FAIL`);
  console.log('='.repeat(64));
  if (failed > 0) {
    console.log('\nBASARISIZ:');
    failures.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
}

main();
