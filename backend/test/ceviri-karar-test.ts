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

ol(
  'bilinmeyen durum ham mesaji TASIR (teshis kaybolmaz)',
  ceviriHataMesaji(undefined, 'socket hang up').includes('socket hang up'),
  true,
);

console.log(`\n${kalan === 0 ? '✅' : '❌'} ceviri karar testi: ${gecen} gecti, ${kalan} kaldi\n`);
process.exit(kalan === 0 ? 0 : 1);
