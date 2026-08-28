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

/** Bir controller metodunda ilan edilmis yetenekleri okur. */
function ucYetenekleri(sinif: any, metot: string): Yetenek[] {
  return Reflect.getMetadata(YETENEK_KEY, sinif.prototype[metot]) ?? [];
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
      `W4 ★KALKAN ${ad} yetenek dekoratoru TASIMIYOR (kisitli modda goruntuleme acik)`,
      ucYetenekleri(QuotesController, metot).length === 0,
      `okunan=${JSON.stringify(ucYetenekleri(QuotesController, metot))}`,
    );
  }
}

kararMatrisi();
kablolama();

console.log(
  `\n${'='.repeat(64)}\nERISIM KAPISI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
);
if (failed) {
  failures.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
