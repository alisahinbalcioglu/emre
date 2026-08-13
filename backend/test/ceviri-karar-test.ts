/**
 * CEVIRI BASARISIZLIK KARARI + HATA MESAJI (13.08).
 *
 * ★ BU DOSYANIN ASIL ISI: "sessiz basari"yi bir daha uretmemek.
 *
 * 13.08 canli olcumu: Claude API anahtari GECERSIZDI, ceviri parcalarinin
 * DORDU DE 401 aldi — ama servis her hatayi yutup `{harita:{}, cevrilen:0}`
 * ile 200 donuyordu. Frontend bunu "Ceviri tamamlandi" olarak gosterdi, dil
 * dugmesi "Turkceye Don"e gecti ve ekranda TEK BIR HUCRE bile degismedi.
 * Kullanici ozelligin calistigini sandi; hatayi yalnizca sunucu loglarindan
 * gorebildik.
 *
 * Karar burada saf haliyle durur ve asagidaki kriterlerle muhurlenir.
 * Kosum:  npm run test:ceviri
 *
 * ⚠ BIR ASSERT TEK KRITERE (proje kurali).
 */
import { ceviriBasarisizMi, ceviriHataMesaji } from '../src/ozellik/giris/ai/ceviri.service';

let gecen = 0;
let kalan = 0;

function ol(baslik: string, gercek: unknown, beklenen: unknown): void {
  const ok = JSON.stringify(gercek) === JSON.stringify(beklenen);
  if (ok) {
    gecen++;
    console.log(`  ✓ ${baslik}`);
  } else {
    kalan++;
    console.error(`  ✗ ${baslik}\n      beklenen: ${JSON.stringify(beklenen)}\n      gercek  : ${JSON.stringify(gercek)}`);
  }
}

console.log('\n=== ceviriBasarisizMi ===');

// ⚠ ASIL VAKA — 13.08'de canlida yasanan tam durum.
ol(
  'TUM parcalar patladi ve onbellek bos → BASARISIZ',
  ceviriBasarisizMi({ toplamParca: 4, basarisizParca: 4, onbellekten: 0 }),
  true,
);

ol(
  'tum parcalar patladi ama ONBELLEKTEN sonuc geldi → basarisiz DEGIL (elde gercek ceviri var)',
  ceviriBasarisizMi({ toplamParca: 2, basarisizParca: 2, onbellekten: 7 }),
  false,
);

// ⚠ Bu kriter `basarisizParca === toplamParca` esitligini olcer: `>=` ya da
// `> 0` yazilsaydi TEK parca hatasi tum cagriyi oldururdu ve gecen parcalarin
// cevirisi kullaniciya HIC ulasmazdi.
ol(
  'parcalarin BIRI patladi, digeri gecti → basarisiz DEGIL (kismi sonuc korunur)',
  ceviriBasarisizMi({ toplamParca: 2, basarisizParca: 1, onbellekten: 0 }),
  false,
);

ol(
  'hicbir parca patlamadi → basarisiz DEGIL',
  ceviriBasarisizMi({ toplamParca: 3, basarisizParca: 0, onbellekten: 0 }),
  false,
);

// ⚠ `toplamParca > 0` kapisi: hepsi onbellekten karsilandiginda API'ye HIC
// gidilmez (0 parca). `0 === 0` dogru oldugu icin bu kapi olmasa "hicbir parca
// patlamadi" durumu BASARISIZLIK sayilirdi — yani en ucuz ve en saglikli yol
// hata verirdi.
ol(
  'API`ye HIC gidilmedi (0 parca) → basarisiz DEGIL',
  ceviriBasarisizMi({ toplamParca: 0, basarisizParca: 0, onbellekten: 0 }),
  false,
);

console.log('\n=== ceviriHataMesaji ===');

ol(
  '401 → kullaniciya ANAHTARI nereden gunelleyecegini soyler',
  ceviriHataMesaji(401, 'invalid x-api-key').includes('GECERSIZ'),
  true,
);

ol(
  '403 de anahtar hatasi olarak okunur',
  ceviriHataMesaji(403, 'forbidden').includes('GECERSIZ'),
  true,
);

ol(
  '429 istek siniri olarak ayrilir (anahtar hatasi DEGIL)',
  ceviriHataMesaji(429, 'rate limit').includes('429'),
  true,
);

// ⚠ 429 mesaji anahtar mesajiyla KARISMAMALI: kullaniciyi calisan bir anahtari
// degistirmeye yonlendirmek gercek sorunu gizlerdi.
ol(
  '429 mesaji anahtar degistirmeye YONLENDIRMEZ',
  ceviriHataMesaji(429, 'rate limit').includes('GECERSIZ'),
  false,
);

// ⚠ 13.08 canli vakasi: 9.142 satirlik teklifte ceviri 529 `overloaded_error`
// aldi. Bu, saglayicinin sunuculari asiri yuklu demektir — anahtar, kota ve
// kod ile ILGISI YOKTUR. Genel dala dusup "servis yanit vermedi" demek,
// kullaniciyi CALISAN anahtarini kurcalamaya iterdi.
ol(
  '529 asiri yogunluk olarak taninir',
  ceviriHataMesaji(529, 'Overloaded').includes('asiri yogun'),
  true,
);

ol(
  '529 kullaniciya "sizde sorun YOK" der (anahtar kurcalamaya itmez)',
  ceviriHataMesaji(529, 'Overloaded').includes('sorun YOK'),
  true,
);

ol(
  '529 mesaji anahtar degistirmeye YONLENDIRMEZ',
  ceviriHataMesaji(529, 'Overloaded').includes('GECERSIZ'),
  false,
);

// 500/502/503 ayni ailedendir — yalniz 529'u tanimak digerlerini disarida
// birakirdi ve ayni gecici durum farkli mesaj uretirdi.
ol(
  '503 de gecici sunucu hatasi ailesinden sayilir',
  ceviriHataMesaji(503, 'Service Unavailable').includes('asiri yogun'),
  true,
);

// ⚠ 500 SINIRIN TA KENDISI: kriter yalniz 503/529 ile yazilsaydi `>= 500`
// sessizce `> 500`e kayabilir ve gercek "Internal Server Error" genel dala
// duserdi. Sinir degeri acikca olculur.
ol(
  '500 tam sinir — gecici sunucu hatasi sayilir',
  ceviriHataMesaji(500, 'Internal Server Error').includes('asiri yogun'),
  true,
);

// ⚠ 499 sinirin ALT komsusu: `>= 500` yerine `>= 499` ya da `>= 400`
// yazilsaydi istemci hatalari "bekleyin, gecicidir" diye gosterilirdi.
ol(
  '499 gecici sayilmaz (sinirin alt komsusu)',
  ceviriHataMesaji(499, 'Client Closed Request').includes('asiri yogun'),
  false,
);

// ⚠ 4xx SUNUCU hatasi DEGILDIR: ust sinir 600 degil de acik birakilsaydi ya da
// alt sinir 400'e cekilseydi, gercek istek hatalari "bekleyin, gecicidir"
// diye gosterilir ve kullanici sonsuza kadar beklerdi.
ol(
  '404 gecici yogunluk sayilmaz',
  ceviriHataMesaji(404, 'not found').includes('asiri yogun'),
  false,
);

ol(
  'bilinmeyen durum ham mesaji TASIR (teshis kaybolmaz)',
  ceviriHataMesaji(undefined, 'socket hang up').includes('socket hang up'),
  true,
);

console.log(`\n${kalan === 0 ? '✅' : '❌'} ceviri karar testi: ${gecen} gecti, ${kalan} kaldi\n`);
process.exit(kalan === 0 ? 0 : 1);
