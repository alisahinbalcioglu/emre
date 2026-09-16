/**
 * ERISIM KAPISI TURU  (`npm run test:erisim`)
 *
 * DB GEREKTIRMEZ. Karar matrisi SAF fonksiyonla (`yetenekKararla`), uc
 * kablolamasi ise dekorator metadata'siyla olculur. Sahte Prisma bile
 * gerekmez — `karar()` cagirilmaz, karar nesnesi ELDE kurulur.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * ADIM 2'nin urun sozu tek cumledir: "veriyi gostermeye devam et, DEGER
 * URETMEYI durdur." Bu cumlenin iki ayri yerde dogru olmasi gerekir:
 *
 *   1. KARAR: hangi durumda hangi yetenek acik? (erisim.servisi.ts)
 *   2. KABLOLAMA: o karar GERCEKTEN uclara bagli mi? (erisim.guard.ts +
 *      controller dekoratorleri)
 *
 * Ikisi ayri ayri dogru olup BIRLIKTE yanlis olabilir: karar mukemmel
 * yazilip hicbir uca baglanmazsa kisitli mod HICBIR SEY yapmaz. Bu depoda
 * bunun ONCEDENI VAR: `getUserCapabilities` motoru dogru yazilmisti ama
 * TEK tuketicisi /auth/me yanitiydi — hicbir guard, hicbir controller onu
 * okumuyordu (olculdu). Yani yetenek matrisi aylarca SUS PAYI olarak durdu.
 * K* bloklari o hatanin tekrarini engeller.
 *
 * ── EN KRITIK ASSERT: KILITLENME YASAGI ─────────────────────────────────
 * `ABONELIK_YONET` HER durumda acik KALMALIDIR. Kapanirsa askidaki firma
 * odeme sayfasina giremez, odeyemez ve askidan CIKAMAZ — musteri urunun
 * disinda kilitli kalir ve bunu duzeltmenin tek yolu elle DB mudahalesidir.
 * L1 blogu bunu yedi durumun YEDISINDE de sinar.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import 'reflect-metadata';
import { AbonelikDurumu } from '@prisma/client';
import {
  ErisimKarari,
  ErisimServisi,
  Yetenek,
} from '../src/ozellik/odeme/abonelik/erisim.servisi';
import { YETENEK_KEY } from '../src/ozellik/odeme/abonelik/erisim.guard';
import { QuotesController } from '../src/ozellik/teklif/quotes/quotes.controller';
import { QuoteFormatsController } from '../src/ozellik/cikti/quote-formats/quote-formats.controller';
import { DwgEngineController } from '../src/modules/dwg-engine/dwg-engine.controller';
import { AbonelikController } from '../src/ozellik/odeme/abonelik/abonelik.controller';
import { LaborController } from '../src/ozellik/kutuphane/labor/labor.controller';
import { AiController } from '../src/ozellik/giris/ai/ai.controller';
import { CeviriDuzeltmeController } from '../src/ozellik/giris/ai/ceviri-duzeltme.controller';

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

// `yetenekKararla` saf bir metottur (prisma'ya dokunmaz) — servisi bos
// bagimlilikla kurmak guvenlidir ve niyeti acik eder.
const servis = new ErisimServisi(null as any);

function karar(p: Partial<ErisimKarari>): ErisimKarari {
  return {
    erisimVar: true,
    saltOkunur: false,
    durum: AbonelikDurumu.AKTIF,
    uyari: null,
    kalanGun: null,
    paketKodu: 'pro-mep',
    kullaniciHakki: 5,
    dwgAktif: true,
    ...p,
  };
}

/** Bir controller metodunda ilan edilmis yetenekleri okur (YALNIZ metot). */
function ucYetenekleri(sinif: any, metot: string): Yetenek[] {
  return Reflect.getMetadata(YETENEK_KEY, sinif.prototype[metot]) ?? [];
}

/** SINIF duzeyinde ilan edilmis yetenekler. */
function sinifYetenekleri(sinif: any): Yetenek[] {
  return Reflect.getMetadata(YETENEK_KEY, sinif) ?? [];
}

/**
 * ETKIN yetenek — ErisimGuard'in GORDUGU sey.
 *
 * ⚠ Guard `getAllAndOverride(YETENEK_KEY, [getHandler(), getClass()])` okur,
 * yani SINIF duzeyindeki dekorator de baglayicidir. Yalniz metoda bakan bir
 * assert, sinifa konan bir yetenegi GORMEZ ve "yetenek tasimiyor" diye yesil
 * kalir — mutasyonla olculdu (M7 hayatta kalmisti). Kalkan assert'leri bunu
 * kullanmali, ucYetenekleri'ni DEGIL.
 */
function etkinYetenekler(sinif: any, metot: string): Yetenek[] {
  const m = ucYetenekleri(sinif, metot);
  return m.length > 0 ? m : sinifYetenekleri(sinif);
}

function guardAdlari(sinif: any): string[] {
  return (Reflect.getMetadata('__guards__', sinif) ?? []).map(
    (g: any) => g?.name ?? String(g),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  K — KARAR MATRISI
// ═══════════════════════════════════════════════════════════════════════════
function kararMatrisi() {
  console.log('\n── K · KARAR MATRISI ──');

  // ÖLÇÜT: aracin kendisi calisiyor mu? Tam erisimde HER SEY acik olmali.
  const tam = karar({});
  check(
    'K-OLCUT tam erisimde teklif olusturma ACIK (olcut bozuk degil)',
    servis.yetenekKararla(tam, Yetenek.TEKLIF_OLUSTUR),
  );
  check(
    'K-OLCUT tam erisimde cikti indirme ACIK',
    servis.yetenekKararla(tam, Yetenek.CIKTI_INDIR),
  );

  // ── KISITLI (salt okunur) ────────────────────────────────────────────
  // Urun sozu: veriyi GOSTER, deger URETME.
  const kisitli = karar({
    durum: AbonelikDurumu.KISITLI,
    erisimVar: true,
    saltOkunur: true,
  });
  check(
    'K1 KISITLI: teklifleri GORUNTULEME acik (veri rehin alinmaz)',
    servis.yetenekKararla(kisitli, Yetenek.TEKLIF_GORUNTULE),
  );
  check(
    'K1 KISITLI: kutuphaneyi GORUNTULEME acik',
    servis.yetenekKararla(kisitli, Yetenek.KUTUPHANE_GORUNTULE),
  );
  check(
    'K2 KISITLI: yeni teklif olusturma KAPALI',
    !servis.yetenekKararla(kisitli, Yetenek.TEKLIF_OLUSTUR),
  );
  check(
    'K2 KISITLI: CIKTI INDIRME KAPALI (asil deger burada)',
    !servis.yetenekKararla(kisitli, Yetenek.CIKTI_INDIR),
  );
  check(
    'K2 KISITLI: Excel yukleme KAPALI',
    !servis.yetenekKararla(kisitli, Yetenek.EXCEL_YUKLE),
  );
  check(
    'K2 KISITLI: DWG yukleme KAPALI',
    !servis.yetenekKararla(kisitli, Yetenek.DWG_YUKLE),
  );
  check(
    'K2 KISITLI: teklif DUZENLEME KAPALI',
    !servis.yetenekKararla(kisitli, Yetenek.TEKLIF_DUZENLE),
  );

  // ── ASKIDA ───────────────────────────────────────────────────────────
  const askida = karar({
    durum: AbonelikDurumu.ASKIDA,
    erisimVar: false,
    saltOkunur: false,
  });
  check(
    'K3 ASKIDA: goruntuleme bile KAPALI',
    !servis.yetenekKararla(askida, Yetenek.TEKLIF_GORUNTULE),
  );
  check(
    'K3 ASKIDA: cikti indirme KAPALI',
    !servis.yetenekKararla(askida, Yetenek.CIKTI_INDIR),
  );

  // ── ODEME_BEKLIYOR: tolerans — erisim TAM ────────────────────────────
  // Bilincli urun karari: ilk gecikmede musteriyi cezalandirmiyoruz.
  const tolerans = karar({
    durum: AbonelikDurumu.ODEME_BEKLIYOR,
    erisimVar: true,
    saltOkunur: false,
  });
  check(
    'K4 ODEME_BEKLIYOR: erisim TAM (tolerans suresi — uyari var, kisit yok)',
    servis.yetenekKararla(tolerans, Yetenek.TEKLIF_OLUSTUR) &&
      servis.yetenekKararla(tolerans, Yetenek.CIKTI_INDIR),
  );

  // ── dwgAktif: pakete bagli anahtar ───────────────────────────────────
  const dwgsiz = karar({ dwgAktif: false });
  check(
    'K5 dwgAktif=false: DWG yukleme KAPALI (tam erisimde bile)',
    !servis.yetenekKararla(dwgsiz, Yetenek.DWG_YUKLE),
  );
  check(
    'K5 dwgAktif=false: teklif olusturma ACIK KALIR (dar kapatma)',
    servis.yetenekKararla(dwgsiz, Yetenek.TEKLIF_OLUSTUR),
  );

  // ── L1 KILITLENME YASAGI ─────────────────────────────────────────────
  // Bu blok kirilirsa musteri odeyemez hale gelir. Bkz. dosya basligi.
  const tumDurumlar: AbonelikDurumu[] = [
    AbonelikDurumu.DENEME,
    AbonelikDurumu.AKTIF,
    AbonelikDurumu.ODEME_BEKLIYOR,
    AbonelikDurumu.KISITLI,
    AbonelikDurumu.ASKIDA,
    AbonelikDurumu.IPTAL,
    AbonelikDurumu.SONA_ERDI,
  ];
  const kapali = tumDurumlar.filter(
    (d) =>
      !servis.yetenekKararla(
        karar({ durum: d, erisimVar: false, saltOkunur: true }),
        Yetenek.ABONELIK_YONET,
      ),
  );
  check(
    'L1 KILITLENME YASAGI: ABONELIK_YONET 7 durumun 7"sinde de ACIK',
    kapali.length === 0,
    `kapali durumlar=${JSON.stringify(kapali)}`,
  );

  // ── L2 ★KALKAN: para harcayan uc KISITLI modda ACILMASIN ──────────────
  // AI_ANALIZ her cagride Anthropic/OpenRouter'a gercek para harciyor.
  // KISITLI_MODDA_ACIK kumesine eklenirse odemesi duran firmaya masraf
  // uretmeye devam ederiz — kapatilmak istenen gelir hatasinin ta kendisi.
  check(
    'L2 ★KALKAN KISITLI: AI_ANALIZ KAPALI (para harcayan uc salt-okunur modda acilmaz)',
    !servis.yetenekKararla(
      karar({ durum: AbonelikDurumu.KISITLI, erisimVar: true, saltOkunur: true }),
      Yetenek.AI_ANALIZ,
    ),
  );
  check(
    'L2 ★KALKAN SURESI DOLMUS: iscilik katalogu KAPALI (gorevin kabul olcutu)',
    !servis.yetenekKararla(
      karar({ durum: AbonelikDurumu.SONA_ERDI, erisimVar: false }),
      Yetenek.KUTUPHANE_GORUNTULE,
    ),
  );
  check(
    'L2 ★KALKAN SURESI DOLMUS: AI_ANALIZ KAPALI',
    !servis.yetenekKararla(
      karar({ durum: AbonelikDurumu.SONA_ERDI, erisimVar: false }),
      Yetenek.AI_ANALIZ,
    ),
  );
  // Faz 6.8 (14.09): ceviri de her cagride gercek para harciyor.
  check(
    'L2 ★KALKAN KISITLI: CEVIRI KAPALI (para harcayan uc salt-okunur modda acilmaz)',
    !servis.yetenekKararla(
      karar({ durum: AbonelikDurumu.KISITLI, erisimVar: true, saltOkunur: true }),
      Yetenek.CEVIRI,
    ),
  );
  check(
    'L2 ★KALKAN SURESI DOLMUS: CEVIRI KAPALI',
    !servis.yetenekKararla(
      karar({ durum: AbonelikDurumu.SONA_ERDI, erisimVar: false }),
      Yetenek.CEVIRI,
    ),
  );
  check(
    'L2 AKTIF: CEVIRI ACIK (kapi aboneligi yuruyen firmayi kesmez)',
    servis.yetenekKararla(karar({ durum: AbonelikDurumu.AKTIF, erisimVar: true }), Yetenek.CEVIRI),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  W — KABLOLAMA: karar GERCEKTEN uclara bagli mi
// ═══════════════════════════════════════════════════════════════════════════
function kablolama() {
  console.log('\n── W · UC KABLOLAMASI ──');

  // ÖLÇÜT: metadata okuyucu calisiyor mu? Bilinen bir uc yetenek TASIMALI.
  check(
    'W-OLCUT metadata okuyucu calisiyor (quotes.create yetenek tasiyor)',
    ucYetenekleri(QuotesController, 'create').length > 0,
    `okunan=${JSON.stringify(ucYetenekleri(QuotesController, 'create'))}`,
  );

  const beklenen: Array<[string, any, string, Yetenek]> = [
    ['POST /quotes', QuotesController, 'create', Yetenek.TEKLIF_OLUSTUR],
    ['PUT /quotes/:id', QuotesController, 'update', Yetenek.TEKLIF_DUZENLE],
    ['POST /quotes/upload-excel', QuotesController, 'parseExcel', Yetenek.EXCEL_YUKLE],
    ['POST /quotes/:id/export', QuotesController, 'exportXlsx', Yetenek.CIKTI_INDIR],
    ['GET /quotes/:id/export-priced', QuotesController, 'exportPriced', Yetenek.CIKTI_INDIR],
    ['GET /quotes/:id/exports/:rev', QuotesController, 'downloadExport', Yetenek.CIKTI_INDIR],
    ['GET /quote-formats/:id/preview', QuoteFormatsController, 'preview', Yetenek.CIKTI_INDIR],
    ['GET /quote-formats/:id/preview-pdf', QuoteFormatsController, 'previewPdf', Yetenek.CIKTI_INDIR],
    ['POST /dwg-engine/layers', DwgEngineController, 'listLayers', Yetenek.DWG_YUKLE],
    ['POST /dwg-engine/parse', DwgEngineController, 'parseDwg', Yetenek.DWG_YUKLE],
    ['POST /dwg-engine/upload', DwgEngineController, 'uploadAsync', Yetenek.DWG_YUKLE],
    // 10.09.2026 — abonelik SAGLIGI bu iki alana hic baglanmamisti:
    // suresi dolmus bir firma iscilik katalogunu okumaya ve PDF analizi
    // calistirmaya (GERCEK para harcayan uc) devam ediyordu.
    ['GET /labor', LaborController, 'findAll', Yetenek.KUTUPHANE_GORUNTULE],
    ['GET /labor/:id', LaborController, 'findOne', Yetenek.KUTUPHANE_GORUNTULE],
    ['POST /ai/analyze', AiController, 'analyze', Yetenek.AI_ANALIZ],
    // Faz 6.8 (14.09): ceviri ve onizlemesi aboneligi yuruyen firmaya acik.
    ['POST /ai/translate', AiController, 'translate', Yetenek.CEVIRI],
    ['GET /ai/translate/onizleme', AiController, 'translateOnizleme', Yetenek.CEVIRI],
    // Faz 6.9 (16.09): firma çeviri sözlüğüne YAZAN uçlar aboneliği yürüyen firmaya açık.
    ['PUT /ai/translate/duzeltmeler', CeviriDuzeltmeController, 'kaydet', Yetenek.CEVIRI],
    ['DELETE /ai/translate/duzeltmeler/:id', CeviriDuzeltmeController, 'kaldir', Yetenek.CEVIRI],
  ];

  for (const [ad, sinif, metot, yetenek] of beklenen) {
    const varMi = typeof sinif.prototype[metot] === 'function';
    if (!varMi) {
      // Metot adi degismisse assert YANLIS SEBEPLE kirmizi olurdu; ayirt et.
      check(`W-OLCUT ${ad} metodu (${metot}) sinifta VAR`, false, 'metot bulunamadi');
      continue;
    }
    check(
      `W1 ${ad} → ${yetenek}`,
      ucYetenekleri(sinif, metot).includes(yetenek),
      `okunan=${JSON.stringify(ucYetenekleri(sinif, metot))}`,
    );
  }

  // ── W2: guard SINIFA bagli mi (dekorator tek basina bir sey yapmaz) ──
  for (const [ad, sinif] of [
    ['QuotesController', QuotesController],
    ['QuoteFormatsController', QuoteFormatsController],
    ['DwgEngineController', DwgEngineController],
    ['LaborController', LaborController],
    ['AiController', AiController],
    ['CeviriDuzeltmeController', CeviriDuzeltmeController],
  ] as Array<[string, any]>) {
    check(
      `W2 ${ad} ErisimGuard tasiyor (dekorator tek basina kapatmaz)`,
      guardAdlari(sinif).includes('ErisimGuard'),
      `guards=${JSON.stringify(guardAdlari(sinif))}`,
    );
  }

  // ── W3 ★KALKAN: abonelik ucu KAPILI OLMAMALI ────────────────────────
  // En kolay ama YANLIS "tutarlilik" duzeltmesi ErisimGuard'i her
  // controller'a koymaktir. Abonelik ucuna konursa askidaki firma odeme
  // sayfasina giremez → kilitlenme. Bu assert bugun YESIL ve OYLE KALMALI.
  check(
    'W3 ★KALKAN AbonelikController ErisimGuard TASIMIYOR (kilitlenme onlemi)',
    !guardAdlari(AbonelikController).includes('ErisimGuard'),
    `guards=${JSON.stringify(guardAdlari(AbonelikController))}`,
  );

  // ── W4 ★KALKAN: okuma uclari kisitli modda ACIK kalmali ─────────────
  // Kisitli mod "veriyi goster" diyor. Listeleme/goruntuleme uclarina
  // yetenek dekoratoru KONULMAMALI (konulursa veri rehin alinir).
  for (const [ad, metot] of [
    ['GET /quotes', 'findAll'],
    ['GET /quotes/:id', 'findOne'],
  ] as Array<[string, string]>) {
    if (typeof (QuotesController.prototype as any)[metot] !== 'function') {
      check(`W-OLCUT ${ad} metodu (${metot}) VAR`, false, 'metot bulunamadi');
      continue;
    }
    check(
      `W4 ★KALKAN ${ad} ETKIN yetenek TASIMIYOR (kisitli modda goruntuleme acik)`,
      etkinYetenekler(QuotesController, metot).length === 0,
      `etkin=${JSON.stringify(etkinYetenekler(QuotesController, metot))} sinif=${JSON.stringify(sinifYetenekleri(QuotesController))}`,
    );
  }
  // Faz 6.11 (15.09, K-T8): odemesi durmus firma DAHA ONCE ODEDIGI ceviriyi
  // gorebilmeli — bakmak yeni ceviri degildir. "Tutarlilik" icin bu uca
  // CEVIRI yetenegi konursa kisitli firma odedigi Ingilizceyi kaybeder.
  if (typeof (AiController.prototype as any).translateGoruntule !== 'function') {
    check('W-OLCUT GET /ai/translate/goruntule metodu (translateGoruntule) VAR', false, 'metot bulunamadi');
  } else {
    check(
      'W4 ★KALKAN GET /ai/translate/goruntule ETKIN yetenek TASIMIYOR (odenmis ceviri kisitli modda gorunur)',
      etkinYetenekler(AiController, 'translateGoruntule').length === 0,
      `etkin=${JSON.stringify(etkinYetenekler(AiController, 'translateGoruntule'))} sinif=${JSON.stringify(sinifYetenekleri(AiController))}`,
    );
  }

  // Faz 6.9 (16.09): firmanin KENDI ceviri sozlugunu okumak kisitli modda da
  // acik — veri rehin alinmaz (yazma uclari W1'de CEVIRI ister).
  if (typeof (CeviriDuzeltmeController.prototype as any).listele !== 'function') {
    check('W-OLCUT GET /ai/translate/duzeltmeler metodu (listele) VAR', false, 'metot bulunamadi');
  } else {
    check(
      'W4 ★KALKAN GET /ai/translate/duzeltmeler ETKIN yetenek TASIMIYOR (firmanin kendi sozlugu kisitli modda gorunur)',
      etkinYetenekler(CeviriDuzeltmeController, 'listele').length === 0,
      `etkin=${JSON.stringify(etkinYetenekler(CeviriDuzeltmeController, 'listele'))} sinif=${JSON.stringify(sinifYetenekleri(CeviriDuzeltmeController))}`,
    );
  }

  // ── W5 ★KALKAN: iscilik YAZMA uclari yetenek TASIMAMALI ─────────────
  // LaborItem KURESEL bir katalog (`isGlobal` varsayilan true) ama platform
  // yoneticisi de bir firmaya bagli. Bu uclara yetenek verilirse yonetici
  // KENDI firmasinin abonelik sagligina baglanir ve miras satirlarinin
  // erisimSonu geldiginde (2027-09-01) kuresel katalogdan kilitlenir.
  // Sinif duzeyine @GerekliYetenek koymak tam bu hatayi uretir.
  for (const metot of ['create', 'update', 'remove'] as const) {
    if (typeof (LaborController.prototype as any)[metot] !== 'function') {
      check(`W-OLCUT LaborController.${metot} VAR`, false, 'metot bulunamadi');
      continue;
    }
    check(
      `W5 ★KALKAN POST/PUT/DELETE /labor (${metot}) ETKIN yetenek TASIMIYOR (admin kendi katalogundan kilitlenmesin)`,
      etkinYetenekler(LaborController, metot).length === 0,
      `etkin=${JSON.stringify(etkinYetenekler(LaborController, metot))} sinif=${JSON.stringify(sinifYetenekleri(LaborController))}`,
    );
  }

  // ── W6 ★KALKAN: ceviri duzeltme ucu yalniz YONETICIYE acik ───────────
  // 10.09'daki W6 "ceviri uclari yetenek TASIMIYOR" diyordu: kota Faz 6.2'nin
  // konusuydu ve kapi bilerek bekletilmisti. 14.09'da kapi takildi (W beklenen
  // listesinde CEVIRI). `translate/correct` ise GLOBAL Translation onbellegine
  // `kaynak='manual'` yaziyor — her firmanin disa aktarimini etkiler ve on
  // yuzde cagirani YOK. Giris yapmis herkese acik kalmasi onbellek zehirleme
  // yoluydu; artik yalniz admin rolu. Abonelik kapisi bilerek YOK: yonetici
  // aracidir, admin'in kendi aboneligine baglanmamali.
  if (typeof (AiController.prototype as any).translateCorrect !== 'function') {
    check('W-OLCUT AiController.translateCorrect VAR', false, 'metot bulunamadi');
  } else {
    const roller = Reflect.getMetadata('roles', (AiController.prototype as any).translateCorrect) ?? [];
    const guardlar = ((Reflect.getMetadata('__guards__', (AiController.prototype as any).translateCorrect) ?? []) as any[]).map((g) => g?.name);
    check('W6 ★KALKAN /ai/translate/correct yalniz admin rolu', JSON.stringify(roller) === '["admin"]', `roller=${JSON.stringify(roller)}`);
    check('W6 ★KALKAN /ai/translate/correct RolesGuard TASIYOR (rol metadata\'si olu kalmaz)', guardlar.includes('RolesGuard'), `guardlar=${JSON.stringify(guardlar)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  P — ON YUZ ↔ SUNUCU ESLIGI
// ═══════════════════════════════════════════════════════════════════════════
/**
 * On yuz de ayni karari veriyor (frontend/ozellik/odeme/erisim-durumu.ts):
 * dugmeleri ona gore gizliyor. Iki kume AYRISIRSA kullanici ACIK GORUNEN
 * bir dugmeye basar ve 403 yer — yani kisitli mod, duzeltmeye calistigi
 * seyden daha kotu bir deneyim uretir.
 *
 * Kopya mantik kacinilmaz (sunucu kapiyi tutar, on yuz bosuna tiklatmaz),
 * ama AYRISMASI kacinilmaz DEGIL. Bu blok iki dosyayi karsilastirir.
 * ⚠ On yuz tarafinda ayrica kendi vitest paketi var; buradaki kapi
 * ESLIGI olcer, davranisi degil.
 */
function iscilikEkrani() {
  console.log('\n── P3 · ISCILIK EKRANI KISITLAMAYI BOS KATALOG SANMIYOR ──');
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const sayfa = fs
    .readFileSync(path.join(__dirname, '../../frontend/app/(protected)/labor/page.tsx'), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  check('P3-OLCUT iscilik sayfasi okundu (/labor istegi var)', sayfa.includes('/labor?discipline='));
  check(
    'P3a 403 ABONELIK_KISITLI ayri ele aliniyor (genel hata toast`ina dusmuyor)',
    /status === 403 && veri\?\.kod === 'ABONELIK_KISITLI'/.test(sayfa),
  );
  const kisitliDal = sayfa.indexOf(') : kisitli ? (');
  const bosDal = sayfa.indexOf(') : items.length === 0 ? (');
  check(
    'P3b kisitlama dali BOS KATALOG dalindan ONCE (kisitli firma "henuz eklenmemis" gormez)',
    kisitliDal !== -1 && bosDal !== -1 && kisitliDal < bosDal,
    `kisitli=${kisitliDal} bos=${bosDal}`,
  );
}

function onYuzEsligi() {
  console.log('\n── P · ON YUZ ↔ SUNUCU ESLIGI ──');
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');

  const feYol = path.join(
    __dirname,
    '../../frontend/ozellik/odeme/erisim-durumu.ts',
  );

  if (!fs.existsSync(feYol)) {
    // ON KOSUL: dosya yoksa bu blok olcum YAPAMAZ. Sessizce yesil
    // gecmek yalanci guven olurdu — gurultuyle kirmizi.
    check('P-OLCUT on yuz erisim dosyasi bulundu', false, `aranan=${feYol}`);
    return;
  }
  const fe = fs.readFileSync(feYol, 'utf8');

  // On yuzdeki KISITLI_MODDA_ACIK kumesini metinden cikar.
  const blok = fe.match(
    /KISITLI_MODDA_ACIK[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/,
  )?.[1];
  check(
    'P-OLCUT on yuzdeki KISITLI_MODDA_ACIK kumesi okunabildi',
    !!blok,
    'desen bulunamadi — on yuz dosyasinin bicimi degismis olabilir',
  );
  if (!blok) return;

  const feKume = new Set(
    [...blok.matchAll(/Yetenek\.([A-Z_]+)/g)].map((m) => m[1]),
  );

  // Sunucu tarafi: ayni kumeyi DAVRANISTAN turet (sabit listeyi
  // kopyalamak, olcmek degil kendini tekrar etmek olurdu).
  const kisitli = karar({
    durum: AbonelikDurumu.KISITLI,
    erisimVar: true,
    saltOkunur: true,
  });
  const beKume = new Set(
    (Object.keys(Yetenek) as Array<keyof typeof Yetenek>).filter((ad) =>
      servis.yetenekKararla(kisitli, Yetenek[ad]),
    ),
  );

  check(
    'P-OLCUT sunucu kumesi bos degil (olcut bozuk degil)',
    beKume.size > 0,
    `be=${JSON.stringify([...beKume])}`,
  );

  const fazla = [...feKume].filter((x) => !beKume.has(x as any));
  const eksik = [...beKume].filter((x) => !feKume.has(x));

  check(
    'P1 on yuz SUNUCUDA KAPALI olan bir yetenegi ACIK gostermiyor',
    fazla.length === 0,
    `on yuzde fazla: ${JSON.stringify(fazla)} — kullanici tiklar ve 403 yer`,
  );
  check(
    'P2 on yuz SUNUCUDA ACIK olan bir yetenegi gereksiz KAPATMIYOR',
    eksik.length === 0,
    `on yuzde eksik: ${JSON.stringify(eksik)} — calisan ozellik gizlenir`,
  );
}

kararMatrisi();
kablolama();
onYuzEsligi();
iscilikEkrani();

console.log(
  `\n${'='.repeat(64)}\nERISIM KAPISI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
);
if (failed) {
  failures.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
