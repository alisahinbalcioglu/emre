/**
 * YONETICI GIRISINDE E-POSTA KODU — KAPI · `npm run test:eposta-kodu`
 * (23.09.2026, Emre karari)
 *
 * DB GEREKTIRMEZ · AG GEREKTIRMEZ · SMTP GEREKTIRMEZ.
 *
 * ── BU TUR NEDEN VAR ─────────────────────────────────────────────────────
 * Emre yonetici hesabinda TOTP kurulumunu tamamlayamadi ("bu yontemle giris
 * yapamiyorum ve cok zor geldi") ve yontemin degismesini istedi. Yonetici
 * hesabinda iki adimli giris ZORUNLU, yani atlanabilir bir ekran degildi:
 * kurulum bitmeden yoneticiye giris YOK.
 *
 * ⚠⚠ BU BIR GUVENLIK GERILEMESIDIR VE BILEREK YAPILMISTIR. 21.09'da e-posta
 * OTP degerlendirilip REDDEDILMISTI; gerekce 23.09'da Emre'ye yeniden
 * soylendi: parola sifirlama ayni posta kutusundan yapiliyor ve MFA'yi
 * temizlemiyor, yani kutuyu ele geciren kisi yonetici hesabini TAMAMEN alir.
 * Emre karari tekrarladi. Bu dosya o karari YARGILAMAZ; kararin DOGRU
 * UYGULANDIGINI olcer.
 *
 * ── BEŞ BLOK ─────────────────────────────────────────────────────────────
 *   K · Kod uretimi/ozeti/karsilastirmasi (saf)
 *   S · Sure ve yeniden gonderim kisiti (saf)
 *   D · Dallanma: yonetici e-postaya gider, BASKASI GITMEZ
 *   B · Baglanti: uc, kisit ve tek-kullanimlik yazimi kaynakta GERCEKTEN var
 *   G · Gizlilik: kod ne yanitta ne konu satirinda ne de duz olarak DB'de
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  EPOSTA_KODU_GECERLILIK_SN,
  EPOSTA_KODU_HANE,
  EPOSTA_KODU_YENIDEN_GONDERIM_SN,
  epostaKoduOzetle,
  epostaKoduSuresiDoldu,
  epostaKoduTutuyorMu,
  epostaKoduUret,
  yenidenGonderilebilirMi,
} from '../src/altyapi/auth/mfa/eposta-kodu';
import { girisKarariSaf } from '../src/altyapi/auth/mfa/mfa-karari';
import { mfaGirisKoduEpostasi } from '../src/altyapi/auth/mfa/mfa-epostalari';

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

const KOK = join(__dirname, '..', '..');
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');
/** Yorumlari atar: kapi YORUMU degil KODU olcsun. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const kullanici = (role: string, o: Record<string, unknown> = {}) =>
  ({ role, mfaAcikAt: null, mfaKaynagi: null, ...o }) as any;

function main(): void {
  // ── K · KOD URETIMI VE KARSILASTIRMA ───────────────────────────────────
  console.log('\n── K · kod uretimi ve karsilastirma ──');

  const kodlar = Array.from({ length: 200 }, () => epostaKoduUret());
  check(
    `K0-OLCUT ${kodlar.length} kod uretildi (bos kume her assert'i yesil yapardi)`,
    kodlar.length === 200,
  );
  check(
    `K1 hepsi TAM ${EPOSTA_KODU_HANE} hane (bastaki sifirlar korunuyor)`,
    kodlar.every((k) => /^[0-9]+$/.test(k) && k.length === EPOSTA_KODU_HANE),
    kodlar.filter((k) => k.length !== EPOSTA_KODU_HANE).slice(0, 3).join(','),
  );
  check(
    'K2 ⭐ kodlar TAHMIN EDILEBILIR DEGIL (200 uretimde en az 150 farkli)',
    new Set(kodlar).size >= 150,
    `farkli=${new Set(kodlar).size}`,
  );

  const ozet = epostaKoduOzetle('123456', 'u1');
  check('K3 ozet duz kodu ICERMEZ', !ozet.includes('123456'), ozet.slice(0, 16));
  check(
    'K4 ⭐ AYNI kod BASKA kullanicida BASKA ozet (tuz kisiye bagli)',
    epostaKoduOzetle('123456', 'u1') !== epostaKoduOzetle('123456', 'u2'),
  );
  check('K5 dogru kod tutuyor', epostaKoduTutuyorMu('123456', 'u1', ozet));
  check('K6 yanlis kod TUTMUYOR', !epostaKoduTutuyorMu('123457', 'u1', ozet));
  check(
    'K7 ⭐ baska kullanicinin ozetiyle TUTMUYOR (ozet kopyalanamaz)',
    !epostaKoduTutuyorMu('123456', 'u2', ozet),
  );
  check('K8 ozet BOSSA tutmuyor (firlatmiyor)', !epostaKoduTutuyorMu('123456', 'u1', null));
  check('K9 ozet BOZUKSA tutmuyor (firlatmiyor)', !epostaKoduTutuyorMu('123456', 'u1', '!!!'));

  // ── S · SURE VE YENIDEN GONDERIM ───────────────────────────────────────
  console.log('\n── S · sure ve yeniden gonderim ──');

  const t0 = new Date('2026-09-23T10:00:00.000Z');
  const sonra = (sn: number) => new Date(t0.getTime() + sn * 1000);
  check(
    `S1 ${EPOSTA_KODU_GECERLILIK_SN / 60} dk gecerlilik: 1 sn once GECERLI`,
    !epostaKoduSuresiDoldu(t0, sonra(EPOSTA_KODU_GECERLILIK_SN - 1)),
  );
  check(
    'S2 ⭐ 1 sn SONRA gecersiz (sinir dogru yonde)',
    epostaKoduSuresiDoldu(t0, sonra(EPOSTA_KODU_GECERLILIK_SN + 1)),
  );
  check('S3 ⭐ damga YOKSA "doldu" sayilir (suresi hic dolmayan kod olmaz)',
    epostaKoduSuresiDoldu(null, t0));
  check('S4 GELECEGE damgali kod da gecersiz (saat kaymasi)',
    epostaKoduSuresiDoldu(sonra(60), t0));

  check('S5 ilk gonderim serbest', yenidenGonderilebilirMi(null, t0).olur);
  const kisit = yenidenGonderilebilirMi(t0, sonra(10));
  check(
    `S6 ⭐ ${EPOSTA_KODU_YENIDEN_GONDERIM_SN} sn dolmadan YENIDEN GONDERILMEZ`,
    !kisit.olur && kisit.kalanSn === EPOSTA_KODU_YENIDEN_GONDERIM_SN - 10,
    JSON.stringify(kisit),
  );
  check(
    'S7 kisit dolunca serbest',
    yenidenGonderilebilirMi(t0, sonra(EPOSTA_KODU_YENIDEN_GONDERIM_SN)).olur,
  );
  check(
    'S8 ⭐ SURE ve KISIT AYRI: kod olmus olsa da kisit surebilir',
    epostaKoduSuresiDoldu(t0, sonra(EPOSTA_KODU_GECERLILIK_SN + 5)) &&
      !yenidenGonderilebilirMi(sonra(EPOSTA_KODU_GECERLILIK_SN + 5), sonra(EPOSTA_KODU_GECERLILIK_SN + 10)).olur,
  );

  // ── D · DALLANMA ───────────────────────────────────────────────────────
  console.log('\n── D · giris dallanmasi ──');

  const yonetici = girisKarariSaf({ user: kullanici('admin'), firma: null, yol: 'parola' });
  check('D1 ⭐⭐ YONETICI e-posta koduna gider (Emre 23.09 karari)',
    yonetici.tip === 'mfa-eposta', JSON.stringify(yonetici));
  check(
    'D2 ⭐ TOTP`si ACIK yonetici de e-postaya gider (yoneticide TEK yontem)',
    girisKarariSaf({
      user: kullanici('admin', { mfaAcikAt: new Date(), mfaKaynagi: 'kisisel' }),
      firma: null,
      yol: 'parola',
    }).tip === 'mfa-eposta',
  );
  check(
    'D3 ⭐⭐ SIRADAN kullanici e-postaya GITMEZ (kural yoneticiye ozel)',
    girisKarariSaf({ user: kullanici('user'), firma: null, yol: 'parola' }).tip === 'oturum',
  );
  check(
    'D4 ⭐⭐ TOTP`si acik SIRADAN kullanici HALA uygulama kodu (kimse kirilmadi)',
    girisKarariSaf({
      user: kullanici('user', { mfaAcikAt: new Date() }),
      firma: null,
      yol: 'parola',
    }).tip === 'mfa',
  );
  check(
    'D5 ⭐ FIRMA zorunlulugu HALA kurulum istiyor (e-postaya kaymadi)',
    girisKarariSaf({ user: kullanici('user'), firma: { mfaZorunlu: true } as any, yol: 'parola' })
      .tip === 'mfa-kurulum',
  );
  check(
    'D6 ⭐⭐ KURUMSAL girisle gelen yoneticiye kod SORULMAZ (15.09 karari bozulmadi)',
    girisKarariSaf({ user: kullanici('admin'), firma: null, yol: 'kurumsal' }).tip === 'oturum',
  );

  // ── B · BAGLANTI (mekanizma var, baglanti yok) ──────────────────────────
  console.log('\n── B · baglanti ──');

  const servis = kodu(oku('backend/src/altyapi/auth/mfa/mfa.servisi.ts'));
  const denetleyici = kodu(oku('backend/src/altyapi/auth/mfa/mfa.controller.ts'));
  const oturumSrv = kodu(oku('backend/src/altyapi/auth/oturum.servisi.ts'));

  check('B1 ⭐ gonderme ucu VAR', /@Post\('eposta\/gonder'\)/.test(denetleyici));
  check('B2 ⭐ uc servisi CAGIRIYOR', /this\.mfa\.epostaKoduGonder\(/.test(denetleyici));
  /**
   * ⚠ TIP BILDIRIMI DEGIL, DONEN DEGER — mutasyonla bulundu (23.09).
   * Assert once dosyada `yontemler: ['eposta']` ariyordu ve AYNI ibare
   * `GirisKarariYaniti` TIPINDE de geciyor; donus degerini
   * `['kod','kurtarma']`ya ceviren mutant, tip satiri yerinde durdugu icin
   * hayatta kaliyordu. Olcut artik `mfa-eposta` DALININ GOVDESINE bakiyor.
   */
  check(
    'B3 ⭐⭐ `mfa-eposta` DALI `yontemler: [.eposta.]` doner (tip satiri degil)',
    /if \(tip === 'mfa-eposta'\) \{[\s\S]{0,400}?yontemler: \['eposta'\]/.test(oturumSrv),
  );
  /**
   * ⚠ IKIZ ESLIGI — mutasyonla bulundu (23.09). Once yalniz YORUMDA "bu
   * eslik kapida olculur" yaziyordu ve assert YAZILMAMISTI: `epostaYontemiMi`
   * `'user'` dondurulunce kapi yesil kaliyordu. Yorum kanit degildir.
   * Iki kural da `role === 'admin'` demeli; ayrisirsa yonetici dogru kodu
   * girer ve REDDEDILIR (dallanma e-postaya yollar, dogrulama TOTP bekler).
   */
  check(
    'B3b ⭐⭐ IKIZ: `epostaYontemiMi` de `role === admin` diyor (dallanmayla AYNI)',
    /private epostaYontemiMi\([^)]*\)[^{]*\{\s*return user\.role === 'admin';/.test(servis),
  );
  check(
    'B4 ⭐⭐ dogrulama E-POSTA DALINI `mfaAcikAt` denetiminden ONCE yapiyor',
    servis.indexOf('epostaYontemiMi(user)') > -1 &&
      servis.indexOf('epostaYontemiMi(user)') < servis.indexOf('if (!user.mfaAcikAt)'),
    `dal=${servis.indexOf('epostaYontemiMi(user)')} denetim=${servis.indexOf('if (!user.mfaAcikAt)')}`,
  );
  check(
    'B5 ⭐ KILIT/SAYAC ikizlenmedi: e-posta yolu da `rezerveEt` kullaniyor',
    /epostaKodunuDogrula[\s\S]{0,1400}this\.rezerveEt\(user\)/.test(servis),
  );
  check(
    'B6 ⭐⭐ TEK KULLANIMLIK yarisa dayanikli (`updateMany` + ozet kosulu)',
    /updateMany\(\{[\s\S]{0,200}mfaEpostaKoduOzeti: user\.mfaEpostaKoduOzeti/.test(servis),
  );
  /**
   * ⚠ SIRA YETMEZ — mutasyonla bulundu (23.09). Assert once yalniz
   * `indexOf(gonderKritik) < indexOf(yazim)` diyordu; gonderimi OLU DALA
   * alan mutant (`if (false) try { ... }`) sirayi BOZMADIGI icin hayatta
   * kaliyordu. Kod gonderilmeden yazilsaydi, posta gitmeyen kullanici
   * elinde OLMAYAN bir kodla kilitlenirdi.
   * Olcut artik BLOGUN KENDISINE bakiyor: gonderim kosulsuz bir `try`
   * icinde ve yazimdan once.
   */
  check(
    'B7 ⭐⭐ posta GONDERILEMEZSE kod YAZILMAZ (gonderim KOSULSUZ ve yazimdan ONCE)',
    /\n    try \{\n      await this\.eposta\.gonderKritik\(/.test(servis) &&
      servis.indexOf('gonderKritik') < servis.indexOf('mfaEpostaKoduOzeti: epostaKoduOzetle'),
  );
  check(
    'B8 ⭐⭐ `gonder` DEGIL `gonderKritik` (SMTP yoksa sessiz donmesin)',
    /this\.eposta\.gonderKritik\(/.test(servis) &&
      !/this\.eposta\.gonder\(\s*mfaGirisKoduEpostasi/.test(servis),
  );

  // ── G · GIZLILIK ───────────────────────────────────────────────────────
  console.log('\n── G · gizlilik ──');

  const posta = mfaGirisKoduEpostasi('a@b.test', '424242', 10);
  check('G1 ⭐⭐ kod KONU satirinda YOK (kilitli ekran bildiriminde gorunur)',
    !posta.konu.includes('424242'), posta.konu);
  check('G2 kod govdede VAR (yoksa posta ise yaramaz)',
    posta.paragraflar.some((p) => p.includes('424242')));
  check(
    'G3 ⭐ yanit kodu DONMUYOR (donseydi kutuya erisimi olmayan da girerdi)',
    !/return \{ gonderildi: true[^}]*kod/.test(servis),
  );
  check(
    'G4 ⭐ kod DB`ye DUZ yazilmiyor (yalniz ozet)',
    /mfaEpostaKoduOzeti: epostaKoduOzetle\(kod, user\.id\)/.test(servis) &&
      !/mfaEpostaKoduOzeti: kod\b/.test(servis),
  );
  check(
    'G5 ⭐ semada alan adi "Ozeti" (duz kod saklandigi izlenimi vermesin)',
    /mfaEpostaKoduOzeti\s+String\?/.test(oku('backend/prisma/schema.prisma')),
  );

  console.log(
    `\n================================================================\n` +
      `YONETICI E-POSTA KODU: ${passed} PASS, ${failed} FAIL\n` +
      `================================================================`,
  );
  if (failed > 0) {
    console.log('\nBASARISIZ:');
    for (const f of failures) console.log(`  · ${f}`);
    process.exitCode = 1;
  }
}

main();
