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
import { ceviriHataMesaji } from '../src/ozellik/giris/ai/ceviri.service';
import { cevrilemeyenMetinler } from '../src/ozellik/giris/ai/ceviri-kurali';

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

/** Prototipsiz harita — servisin kurduğu şekil. */
function harita(g: Record<string, string>): Record<string, string> {
  return Object.assign(Object.create(null), g);
}

// REVİZE K-T7 (Emre 15.09): çeviri HEPSİ YA DA HİÇBİRİ. 13.08'deki
// "hiçbir parça geçmedi mi" kararı (`ceviriBasarisizMi`) yerini tek soruya
// bıraktı: haritada KENDİ alanı olmayan metin var mı. Varsa çeviri
// tamamlanmamıştır — kotadan düşmez, harita istemciye DÖNMEZ (422).
console.log('\n=== cevrilemeyenMetinler ===');

// ⚠ ASIL VAKA — 13.08'de canlida yasanan tam durum: tum parcalar 401,
// onbellek bos, servis bos harita donuyordu ve ekran "tamamlandi" diyordu.
ol(
  'BOS harita + dolu metin listesi → HEPSI cevrilemedi (sessiz basari yasagi)',
  cevrilemeyenMetinler(['PVC BORU', 'ÇELİK BORU'], harita({})),
  ['PVC BORU', 'ÇELİK BORU'],
);

// ⚠ 14.09'daki KISMI kuralin tersi: tek metin bile eksikse sonuc bos DEGIL.
ol(
  'metinlerin BIRI eksik → yalniz o metin doner (tamamlanmamis cevirinin kaniti)',
  cevrilemeyenMetinler(['PVC BORU', 'ÇELİK BORU'], harita({ 'PVC BORU': 'PVC PIPE' })),
  ['ÇELİK BORU'],
);

ol(
  'tum metinler haritada → eksik YOK (ceviri tamam)',
  cevrilemeyenMetinler(['PVC BORU', 'ÇELİK BORU'], harita({ 'PVC BORU': 'PVC PIPE', 'ÇELİK BORU': 'STEEL PIPE' })),
  [],
);

// ⚠ Kaynakla AYNI donen ceviri (marka/kod) basarisizlik DEGILDIR: "GEBERIT"
// cevirisi "GEBERIT"tir. Esitligi eksik saymak markali her teklifi kalici
// olarak cevrilemez yapardi.
ol(
  'kaynakla aynı dönen çeviri (GEBERIT → GEBERIT) eksik SAYILMAZ',
  cevrilemeyenMetinler(['GEBERIT'], harita({ GEBERIT: 'GEBERIT' })),
  [],
);

// ⚠ Prototip anahtari: duz nesnede "constructor" haritada VAR sanilirdi ve
// cevrilmemis metin tamam gorunurdu.
ol(
  'prototip anahtarı ("constructor") haritada VAR sayılmaz',
  cevrilemeyenMetinler(['constructor', 'toString'], {}),
  ['constructor', 'toString'],
);

ol(
  'metin listesi boş → eksik yok (çevrilecek bir şey yoktu)',
  cevrilemeyenMetinler([], harita({})),
  [],
);

ol(
  'ilk görülme sırası korunur, tekrar eden ve boş metin tek/hiç sayılır',
  cevrilemeyenMetinler(['B', ' A ', 'B', '', 'A'], harita({})),
  ['B', 'A'],
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
