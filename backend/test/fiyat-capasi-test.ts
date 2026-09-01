/**
 * FIYAT CAPASI TURU — vitrin dolar / sozlesme TL  (`npm run test:fiyat-capasi`)
 *
 * DB ve AG GEREKTIRMEZ. Yuvarlama ve TL hesabi SAF fonksiyonlardir; buradan
 * dogrudan cagrilir.
 *
 * ── BU DOSYA NEDEN VAR ──────────────────────────────────────────────────
 * 29.08 kullanici karari: musteriye "$28/ay" gosterilir, karttan TL cekilir.
 * Gerekce ticari ("24 dolar" kucuk durur, "1.250 TL" buyuk durur) ama
 * teknik sonuclari var ve ikisi KARISTIRILIRSA para hatasi olur:
 *
 *   · `tutar` (TL)          → SOZLESME. Kart bundan cekilir, fatura bunu yazar.
 *   · `referansTutar` (USD) → VITRIN. Hicbir tahsilat/fatura bunu OKUMAZ.
 *
 * Iyzico abonelik plani TL kurulur; dolar yalnizca ekranda durur.
 *
 * ── OLCULEN UC SEY ──────────────────────────────────────────────────────
 *   Y  Yuvarlama ASLA ASAGI inmez (hesaplanan bedelin altina dusmek gelir
 *      kaybidir) ve "psikolojik" bicimi korur (…49 / …99).
 *   H  TL hesabi KDV DAHIL uretir — cunku iyzico planinda ayri KDV satiri
 *      yoktur ve `fatura.servisi` gelen tutari KDV DAHIL kabul edip matrahi
 *      GERIYE hesaplar. Formul ile fatura ayrisirsa KDV yanlis beyan edilir.
 *   K  Kur degisimi fiyata DOGRU yansir (capanin kaymasi bilincli).
 *
 * Cikis kodu sozlesmesi: 0 = PASS · digeri = FAIL.
 */
import { fiyatYuvarla, tlFiyatHesapla } from '../scripts/paketleri-kur';

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

// ═══════════════════════════════════════════════════════════════════════════
//  Y — YUVARLAMA
// ═══════════════════════════════════════════════════════════════════════════
function yuvarlama() {
  console.log('\n── Y · YUVARLAMA ──');

  // OLCUT: fonksiyon gercekten calisiyor mu?
  check('Y-OLCUT fiyatYuvarla sayi donduruyor', typeof fiyatYuvarla(1000) === 'number');

  // ⭐ EN KRITIK: ASLA ASAGI YUVARLAMA. Asagi inmek, hesaplanan bedelin
  // altinda satmak demektir — her uyede kalici gelir kaybi.
  const ornekler = [1267.2, 1612.8, 2419.2, 100.0, 1.0, 999.99, 1300.0];
  const asagiInen = ornekler.filter((h) => fiyatYuvarla(h) < h);
  check(
    'Y1 ⭐ yuvarlama ASLA asagi inmez (bedelin altina dusulmez)',
    asagiInen.length === 0,
    `asagi inenler: ${JSON.stringify(asagiInen.map((h) => [h, fiyatYuvarla(h)]))}`,
  );

  // Psikolojik bicim korunur: sonu 49 ya da 99.
  const kotuBicim = ornekler.filter((h) => {
    const y = fiyatYuvarla(h) % 100;
    return y !== 49 && y !== 99;
  });
  check(
    'Y2 sonuc …49 ya da …99 ile biter (psikolojik bicim)',
    kotuBicim.length === 0,
    `bozuk: ${JSON.stringify(kotuBicim.map((h) => [h, fiyatYuvarla(h)]))}`,
  );

  // ASIRI yuvarlama da olmamali: musteriden gereksiz fazla alinmaz.
  const asiri = ornekler.filter((h) => fiyatYuvarla(h) - h > 100);
  check(
    'Y3 yuvarlama farki 100 TL"yi asmaz (musteri gereksiz fazla odemez)',
    asiri.length === 0,
    `asiri: ${JSON.stringify(asiri.map((h) => [h, fiyatYuvarla(h)]))}`,
  );

  // Bilinen degerler — kullaniciya sunulan rakamlar.
  check('Y4 1267.20 → 1299', fiyatYuvarla(1267.2) === 1299, `${fiyatYuvarla(1267.2)}`);
  check('Y5 1612.80 → 1649', fiyatYuvarla(1612.8) === 1649, `${fiyatYuvarla(1612.8)}`);
  check('Y6 2419.20 → 2449', fiyatYuvarla(2419.2) === 2449, `${fiyatYuvarla(2419.2)}`);

  // Tam yuz basamagi: 1300 → 1349 (yukari), 1300 DEGIL.
  check(
    'Y7 tam yuz basamaginda da yukari cikar (1300 → 1349)',
    fiyatYuvarla(1300) === 1349,
    `${fiyatYuvarla(1300)}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  H — TL HESABI (KDV DAHIL)
// ═══════════════════════════════════════════════════════════════════════════
function hesap() {
  console.log('\n── H · TL HESABI ──');

  const kur = 48;
  const kdv = 20;

  const r = tlFiyatHesapla(28, kur, kdv);
  check(
    'H-OLCUT hesap iki alan donduruyor (ham + yuvarlanmis)',
    typeof r.ham === 'number' && typeof r.yuvarlanmis === 'number',
  );

  // 28 x 48 = 1344 net · x1.20 = 1612.80 brut
  check(
    'H1 ham tutar KDV DAHIL (28 x 48 x 1.20 = 1612.80)',
    Math.abs(r.ham - 1612.8) < 0.01,
    `ham=${r.ham}`,
  );

  // ⭐ FATURA ILE TUTARLILIK: fatura.servisi gelen tutari KDV DAHIL kabul
  // edip matrahi GERIYE hesaplar (matrah = tutar / 1.20). Formulumuz o
  // varsayimla ayni olmali; ayrisirsa KDV yanlis beyan edilir.
  const matrah = r.ham / (1 + kdv / 100);
  check(
    'H2 ⭐ geri hesaplanan matrah USD x kur ile AYNI (fatura ile tutarli)',
    Math.abs(matrah - 28 * kur) < 0.01,
    `matrah=${matrah.toFixed(2)} beklenen=${28 * kur}`,
  );

  // KDV orani degisirse fiyat da degismeli (sabit kodlanmamis olmali).
  const kdvsiz = tlFiyatHesapla(28, kur, 0);
  check(
    'H3 KDV orani parametreden geliyor (0 verilince brut = net)',
    Math.abs(kdvsiz.ham - 28 * kur) < 0.01,
    `ham=${kdvsiz.ham}`,
  );

  // Bes paketin uc fiyat kademesi
  check('H4 basic (22$) → 1299 TL', tlFiyatHesapla(22, kur, kdv).yuvarlanmis === 1299);
  check('H5 pro (28$) → 1649 TL', tlFiyatHesapla(28, kur, kdv).yuvarlanmis === 1649);
  check('H6 mep (42$) → 2449 TL', tlFiyatHesapla(42, kur, kdv).yuvarlanmis === 2449);
}

// ═══════════════════════════════════════════════════════════════════════════
//  K — KUR DEGISIMI
// ═══════════════════════════════════════════════════════════════════════════
function kurEtkisi() {
  console.log('\n── K · KUR DEGISIMI ──');

  const kdv = 20;
  const dusuk = tlFiyatHesapla(28, 40, kdv).yuvarlanmis;
  const yuksek = tlFiyatHesapla(28, 60, kdv).yuvarlanmis;

  check(
    'K1 kur yukselince TL fiyati da yukselir (yeni surum daha pahali)',
    yuksek > dusuk,
    `40→${dusuk} 60→${yuksek}`,
  );
  check(
    'K2 artis kurla ORANTILI (60/40 = 1.5x, +-%5 tolerans)',
    Math.abs(yuksek / dusuk - 1.5) < 0.05,
    `oran=${(yuksek / dusuk).toFixed(3)}`,
  );

  // ⚠ CAPANIN KAYMASI — bilincli davranis, kayit altina aliniyor:
  // TL sabitlendigi icin kur oynadikca eski musterinin fiili dolar
  // karsiligi DUSER. Bu bir kusur degil, kur kilidinin ta kendisi.
  const eskiTl = tlFiyatHesapla(28, 40, kdv).yuvarlanmis;
  const yeniKurdaDolar = eskiTl / (1 + kdv / 100) / 60;
  check(
    'K3 kur yukselince ESKI musterinin dolar karsiligi DUSER (kilit calisiyor)',
    yeniKurdaDolar < 28,
    `eski musteri fiilen $${yeniKurdaDolar.toFixed(2)} oduyor`,
  );
}

yuvarlama();
hesap();
kurEtkisi();

console.log(
  `\n${'='.repeat(64)}\nFIYAT CAPASI: ${passed} PASS, ${failed} FAIL\n${'='.repeat(64)}`,
);
if (failed) {
  failures.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
