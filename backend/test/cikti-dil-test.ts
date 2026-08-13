/**
 * CIKTI DILI — BASLIK VE BIRIM SOZLUGU (13.08).
 *
 * ★ Kullanicinin canli Excel ciktisinda gordugu eksik: satir adlari Ingilizce
 * cevrildi ama KOLON BASLIKLARI ("Malzeme Adı", "Genel Toplam") ve BIRIM
 * kisaltmalari ("mt", "ad") Turkce kaldi. Musteriye giden dosya yari Turkce
 * yari Ingilizce goruntu veriyordu.
 *
 * Bu metinler AI'ya GITMEZ: basliklari bu kod uretir, birimler kapali bir
 * kumedir. Sabit eslesme hem bedavadir hem KARARLIDIR (model "Miktar"i bir
 * teklifte "Quantity", digerinde "Amount" cevirmez).
 *
 * Kosum:  npm run test:cikti-dil
 * ⚠ BIR ASSERT TEK KRITERE.
 */
import { birimCevir, ciktiMetni, STANDART_KOLONLAR_EN } from '../src/ozellik/teklif/quotes/cikti-dil';
import { STANDART_CIKTI_KOLONLARI } from '../src/ozellik/teklif/quotes/standart-cikti';

let gecen = 0;
let kalan = 0;

function ol(baslik: string, gercek: unknown, beklenen: unknown): void {
  if (JSON.stringify(gercek) === JSON.stringify(beklenen)) {
    gecen++;
    console.log(`  ✓ ${baslik}`);
  } else {
    kalan++;
    console.error(`  ✗ ${baslik}\n      beklenen: ${JSON.stringify(beklenen)}\n      gercek  : ${JSON.stringify(gercek)}`);
  }
}

console.log('\n=== KOLON HIZALAMASI ===');

/**
 * ⚠ EN KRITIK KRITER: Ingilizce baslik dizisi Turkce ile AYNI UZUNLUKTA
 * olmali. Sira/uzunluk kayarsa basliklar SUTUNLARLA ESLESMEZ — "Quantity"
 * sutununda fiyat, "Unit" sutununda miktar gorunur. Kimse basliklara bakip
 * "kaymis" demez; dosya DOGRU gorunur ve YANLIS okunur.
 */
ol(
  'EN baslik sayisi TR ile AYNI (sutun kaymasi imkansiz)',
  STANDART_KOLONLAR_EN.length,
  STANDART_CIKTI_KOLONLARI.length,
);

ol('4. kolon Birim → Unit (sira korunur)', STANDART_KOLONLAR_EN[3], 'Unit');
ol('son kolon Genel Toplam → Grand Total', STANDART_KOLONLAR_EN[8], 'Grand Total');

console.log('\n=== BIRIM SOZLUGU ===');

// Kullanicinin canli ciktisinda gecen dort birim — payda acikca bunlar.
ol('mt → m', birimCevir('mt', 'en'), 'm');
ol('ad → pcs', birimCevir('ad', 'en'), 'pcs');
ol('set → set (degismez ama TANINIR)', birimCevir('set', 'en'), 'set');
ol("m'2 → m² (kesif dosyalarindaki bozuk yazim)", birimCevir("m'2", 'en'), 'm²');

// ⚠ Buyuk/kucuk harf: kesif dosyalarinda "METRE", "ADET" hep BUYUK yazili.
ol('METRE → m (buyuk harf)', birimCevir('METRE', 'en'), 'm');
ol('ADET → pcs (buyuk harf)', birimCevir('ADET', 'en'), 'pcs');

// ⚠ TURKCE KUCULTME: locale'siz `toLowerCase()` "İ" harfini "i̇" (birlesik
// nokta) yapar ve eslesme SESSIZCE kacar. Bu projede daha once yasandi.
ol('ÇİFT → pair (Turkce I sorunu)', birimCevir('ÇİFT', 'en'), 'pair');
ol('TAKIM → set (noktasiz I)', birimCevir('TAKIM', 'en'), 'set');

// ⚠ BILINMEYEN BIRIM UYDURULMAZ: yanlis bir Ingilizce karsilik, cevrilmemis
// birakmaktan DAHA kotudur — musteri okur, yanlis anlar, kimse fark etmez.
ol('bilinmeyen birim OLDUGU GIBI kalir', birimCevir('vrs', 'en'), 'vrs');
ol('bos birim bos kalir', birimCevir('', 'en'), '');

// ⚠ Dil 'en' DEGILSE hicbir sey degismez — Turkce cikti eski davranisini
// birebir korur (varsayilan yol REGRESYONA ugramaz).
ol('dil verilmezse mt AYNEN kalir', birimCevir('mt', undefined), 'mt');
ol('dil=tr ise ADET aynen kalir', birimCevir('ADET', 'tr'), 'ADET');

console.log('\n=== SABIT METINLER ===');
ol('Genel Toplam → Grand Total', ciktiMetni('Genel Toplam', 'en'), 'Grand Total');
ol('sozlukte olmayan metin degismez', ciktiMetni('Proje Adı', 'en'), 'Proje Adı');
ol('dil=tr ise metin degismez', ciktiMetni('Genel Toplam', 'tr'), 'Genel Toplam');

console.log(`\n${kalan === 0 ? '✅' : '❌'} cikti dili testi: ${gecen} gecti, ${kalan} kaldi\n`);
process.exit(kalan === 0 ? 0 : 1);
