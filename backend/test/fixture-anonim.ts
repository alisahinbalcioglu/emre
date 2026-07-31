/**
 * PK3 — FIXTURE ANONIMLESTIRME  (`npm run fixture:anonim [-- --yaz]`)
 *
 * Kullanicinin karari: gercek musteri dosyalarini `git add -f` ile KOYMUYORUZ;
 * anonimlestirip koyuyoruz. Cok kiracili bir SaaS'ta musteri kimliginin git
 * gecmisine KALICI girmesi kabul edilemez.
 *
 * ⚠ YONTEM — NEDEN ExcelJS ILE YENIDEN YAZMIYORUZ:
 * ExcelJS ile oku→yaz turu dosyayi BYTE BAZINDA yeniden uretir; paylasilan
 * formuller, stiller, merge'ler ve "Onarildi" uyarisi sinifinda bozulmalar
 * bu projede DEFALARCA yasandi (KH11 export 500, EX5 "Onarildi"). PK3 ise
 * "sayfa yapisi, baslik metinleri, kolon duzeni, birimler ve TUM sayilar
 * birebir korunur" diyor. Bu yuzden dosya bir ZIP olarak acilir ve YALNIZCA
 * metin havuzu (`xl/sharedStrings.xml`) icindeki KIMLIK dizeleri degistirilir.
 * Diger her byte oldugu gibi kalir: sayilar sharedStrings'te DEGILDIR
 * (sayilar sheet XML'inde `<v>` olarak durur) → sayilara DOKUNULMAZ.
 *
 * KURAL: anonimlestirme YALNIZ kimlik alanlarina dokunur. PANOVA'nin "BİRİM"
 * basligi altinda miktar tutmasi gibi BOZUKLUKLAR testin ta kendisidir —
 * onlar korunur, "duzeltilmez".
 */
import * as fs from 'fs';
import * as path from 'path';

const KOK = path.resolve(__dirname, '../../test-fixtures/e2e');

/** Gercek ad → takma ad. Uzunluk/bicim onemli degil; sharedStrings uzunluk
 *  bilgisi tasimaz (XML metin dugumu). Buyuk/kucuk harf varyantlari da
 *  eslenir cunku dosyalarda hem "ŞAHİNKUL" hem "Şahinkul" geciyor. */
const KIMLIK_HARITASI: Record<string, string> = {
  'ŞAHİNKUL': 'FIRMA-A',
  'ŞAHINKUL': 'FIRMA-A',
  'LİNTU MÜHENDİSLİK': 'FIRMA-B MÜHENDİSLİK',
  'LİNTU': 'FIRMA-B',
  'LINTU': 'FIRMA-B',
  'YILDIZ ENTEGRE': 'FIRMA-C ENTEGRE',
  'PANOVA': 'FIRMA-D',
  'Bahçeçicler': 'FIRMA-E',
  'BAHÇEÇİCLER': 'FIRMA-E',
  'Aksa Enerji': 'FIRMA-F Enerji',
  'AKSA ENERJİ': 'FIRMA-F ENERJİ',
  'Aksa': 'FIRMA-F',
  'AKSA': 'FIRMA-F',
  'Skychem': 'FIRMA-G',
  'SKYCHEM': 'FIRMA-G',
  'Yorel': 'FIRMA-H',
  'YOREL': 'FIRMA-H',
  'yorel': 'FIRMA-H',
  'Demirtaş': 'SAHA-1',
  'DEMİRTAŞ': 'SAHA-1',
  'Göynük': 'SAHA-2',
  'GÖYNÜK': 'SAHA-2',
  'Kartepe': 'SAHA-3',
  'KARTEPE': 'SAHA-3',
  'Beykoz': 'SAHA-4',
  'BEYKOZ': 'SAHA-4',
  'Akçadağ': 'SAHA-5',
  'AKÇADAĞ': 'SAHA-5',
};

/** XML metin dugumunde guvenli degistirme: & < > kacislari korunur. */
function kimlikleriDegistir(xml: string): { cikti: string; sayac: Record<string, number> } {
  const sayac: Record<string, number> = {};
  let cikti = xml;
  // Uzun anahtarlar once — "LİNTU MÜHENDİSLİK" once, sonra "LİNTU".
  for (const ad of Object.keys(KIMLIK_HARITASI).sort((a, b) => b.length - a.length)) {
    const desen = new RegExp(ad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const n = (cikti.match(desen) ?? []).length;
    if (n) { sayac[ad] = n; cikti = cikti.replace(desen, KIMLIK_HARITASI[ad]); }
  }
  return { cikti, sayac };
}

async function main() {
  const yaz = process.argv.includes('--yaz');
  const JSZip = require('jszip');

  if (!fs.existsSync(KOK)) { console.log('ON KOSUL YOK — test-fixtures/e2e yok'); process.exit(2); }
  const dosyalar = fs.readdirSync(KOK).filter((f) => /\.(xlsx|xlsm)$/i.test(f));
  console.log(`── PK3 FIXTURE ANONIMLESTIRME ${yaz ? '(YAZMA)' : '(KURU KOSUM — yazmaz)'} ──`);
  console.log(`   ${dosyalar.length} dosya · kaynak: test-fixtures/e2e\n`);

  let toplamDegisiklik = 0;
  for (const d of dosyalar) {
    const tam = path.join(KOK, d);
    const zip = await JSZip.loadAsync(fs.readFileSync(tam));
    const ss = zip.file('xl/sharedStrings.xml');
    if (!ss) { console.log(`  ⚠ ${d}: sharedStrings.xml yok (tum metin inline) — elle bakilmali`); continue; }
    const xml: string = await ss.async('string');
    const { cikti, sayac } = kimlikleriDegistir(xml);
    const adet = Object.values(sayac).reduce((a, b) => a + b, 0);
    toplamDegisiklik += adet;

    // Dosya ADI da kimlik tasir
    let yeniAd = d;
    for (const ad of Object.keys(KIMLIK_HARITASI).sort((a, b) => b.length - a.length)) {
      yeniAd = yeniAd.split(ad).join(KIMLIK_HARITASI[ad]);
    }

    console.log(`  ${adet > 0 ? '✏' : '·'} ${d}`);
    if (adet) console.log(`      ${adet} kimlik gecisi: ${Object.entries(sayac).map(([k, v]) => `${k}×${v}`).join(', ')}`);
    if (yeniAd !== d) console.log(`      dosya adi → ${yeniAd}`);

    if (yaz && adet > 0) {
      zip.file('xl/sharedStrings.xml', cikti);
      // ZIP yeniden kurulur ama SADECE bu girdi degisti; diger girdiler
      // JSZip'in tuttugu ham veriden aynen yazilir.
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      fs.writeFileSync(path.join(KOK, yeniAd), buf);
      if (yeniAd !== d) fs.unlinkSync(tam);
    }
  }

  console.log(`\n  TOPLAM ${toplamDegisiklik} kimlik gecisi bulundu.`);
  if (!yaz) {
    console.log('\n  Kuru kosum — hicbir dosya degismedi.');
    console.log('  Yazmak icin: npm run fixture:anonim -- --yaz');
    console.log('  SONRA ZORUNLU: npm run fixture:dogrula  (parse farki 0 olmali)');
    console.log('  SONRA ZORUNLU: golden.spec.ts CASES + verify.mjs slug adlarini guncelle.');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
