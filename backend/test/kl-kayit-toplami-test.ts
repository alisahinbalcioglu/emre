/**
 * KL · P1-b — KAYDEDILEN TOPLAM EKRANDAKINDEN SAPIYOR (pano kalem 64)
 *
 * NEDEN P1: ekran hatasi geciciDIR (sayfa yenilenince duzelir); DB'ye yazilan
 * yanlis toplam KALICIDIR — teklif listesi (quotes/page.tsx:33) ve teklif
 * detayi o degeri okur.
 *
 * ⚠ KOK NEDEN, FAZ 2'de yazdigimdan AGIR cikti. FAZ 2 "yuvarlamasiz carpim"
 * demisti; olcunce gorulduki asil kusur CIFT KAR:
 *   · Ekran hucresi `materialUnitPriceField` = SATIS fiyati (kar ZATEN
 *     uygulanmis + yukari yuvarlanmis) — ExcelGrid.tsx:278 `finalPrice`.
 *   · Kaydet payload'i o hucreyi `materialUnitPrice` olarak, kar yuzdesini de
 *     `materialMargin` olarak yolluyor (quotes/new/page.tsx:1265-1270).
 *   · Backend ise onu NET sanip kari BIR KEZ DAHA uyguluyor
 *     (quotes.service.ts:46-47) → kar %10 ise DB'ye %10 FAZLA toplam yazilir.
 * Yuvarlama farki (1e-12 mertebesi) bu hatanin yanINDA gorunmez kalir.
 *
 * SOZLESME (bu test neyi muhurler):
 *   K1 · malzeme toplami: kaydedilen = ekranin hucresindeki (satis × miktar,
 *        pricing.ts:53 kurali) — kar IKINCI KEZ uygulanmaz.
 *   K2 · iscilik toplami: ayni kural (simetri — HR5b).
 *   K3 · satir toplami (totalPrice) = malzeme + iscilik.
 *   K4 · birim fiyat DB'ye geldigi gibi yazilir (satis birim), sisirilmez.
 *   K5 · FE toplami ACIKCA gonderdiyse (materialTotalPrice) o deger AYNEN
 *        korunur — ekran tek kaynaktir, backend onu yeniden turetmez.
 *
 * ⚠ Yuvarlama KURALI bu testte BELIRLENMEZ. Beklenen deger, urunun kendi tek
 * kaynagindan (`backend/src/modules/matching/pricing.ts` yukariYuvarla — FE
 * ikizi pricing.ts:32 ile ayni) uretilir. Kural degisirse test degil urun
 * degisir; ikisi ayrisamaz.
 *
 * Cikis kodu sozlesmesi: 0 = PASS · 2 = ON KOSUL YOK · diger = FAIL.
 * DB GEREKTIRMEZ: prisma sahte, yalniz create cagrisinin ITEMS'i okunur.
 */
import { QuotesService } from '../src/ozellik/teklif/quotes/quotes.service';
import { yukariYuvarla } from '../src/modules/matching/pricing';

let pass = 0;
const fails: string[] = [];
const sina = (kod: string, ad: string, kosul: boolean, kanit: string) => {
  if (kosul) { pass++; console.log(`  ✅ ${kod} ${ad} — ${kanit}`); }
  else { fails.push(`${kod} ${ad} — ${kanit}`); console.log(`  ❌ ${kod} ${ad} — ${kanit}`); }
};

/** Ekranin hucresine yazdigi deger (ExcelGrid.tsx:278 → pricing.ts:53). */
const ekranSatirToplami = (satisBirim: number, miktar: number) => yukariYuvarla(satisBirim * miktar);

async function main() {
  console.log('── KL P1-b: KAYIT TOPLAMI ↔ EKRAN TOPLAMI ──\n');

  // Sahte prisma: yalnizca quote.create'e giden ITEMS'i yakalar.
  let yakalanan: any[] = [];
  const fakePrisma: any = {
    quote: {
      create: async (arg: any) => {
        yakalanan = arg?.data?.items?.create ?? [];
        return { id: 'test', items: [] };
      },
    },
  };
  const fakeFx: any = { getRates: async () => ({ usdTry: 40, eurTry: 45 }) };
  const service = new QuotesService(fakePrisma, fakeFx);

  // ── VAKA: PANOVA benzeri — kar %10, ekranda satis 116,5 · miktar 3 ──────
  // Ekran zinciri: net 105,86 → satis = yukariYuvarla(105,86 × 1,10) = 116,5
  //                → hucre toplami = yukariYuvarla(116,5 × 3) = 349,5
  // Kaydet payload'i ekranin SATIS fiyatini yollar (quotes/new:1265-1270).
  const SATIS_MALZ = 116.5;
  const SATIS_ISC = 40.2;
  const MIKTAR = 3;
  const KAR = 10; // ekranda ZATEN uygulanmis kar yuzdesi

  await service.create('kullanici-1', {
    title: 'KL P1-b vakasi',
    items: [{
      materialName: 'Su ve Yangın Tesisat Borusu 1" DN25',
      unit: 'mt',
      quantity: MIKTAR,
      materialUnitPrice: SATIS_MALZ,
      laborUnitPrice: SATIS_ISC,
      materialMargin: KAR,
      laborMargin: KAR,
    }],
  } as any);

  if (yakalanan.length !== 1) {
    console.error(`ON KOSUL YOK — create() items yakalanamadi (${yakalanan.length} kayit).`);
    process.exit(2);
  }
  const it = yakalanan[0];

  const beklenenMalz = ekranSatirToplami(SATIS_MALZ, MIKTAR);  // 349.5
  const beklenenIsc = ekranSatirToplami(SATIS_ISC, MIKTAR);    // 120.6
  const beklenenSatir = yukariYuvarla(beklenenMalz + beklenenIsc);

  sina('K1', 'malzeme toplami ekranla ayni (kar IKINCI KEZ uygulanmaz)',
    Math.abs(it.materialTotalPrice - beklenenMalz) < 1e-9,
    `kaydedilen ${it.materialTotalPrice} · ekran ${beklenenMalz} (fark ${(it.materialTotalPrice - beklenenMalz).toFixed(4)})`);

  sina('K2', 'iscilik toplami ekranla ayni',
    Math.abs(it.laborTotalPrice - beklenenIsc) < 1e-9,
    `kaydedilen ${it.laborTotalPrice} · ekran ${beklenenIsc} (fark ${(it.laborTotalPrice - beklenenIsc).toFixed(4)})`);

  sina('K3', 'satir toplami = malzeme + iscilik',
    Math.abs(it.totalPrice - beklenenSatir) < 1e-9,
    `kaydedilen ${it.totalPrice} · beklenen ${beklenenSatir}`);

  sina('K4', 'birim fiyat sisirilmez (geldigi gibi yazilir)',
    Math.abs(it.materialUnitPrice - SATIS_MALZ) < 1e-9
      && Math.abs(it.totalUnitPrice - yukariYuvarla(SATIS_MALZ + SATIS_ISC)) < 1e-9,
    `matBirim ${it.materialUnitPrice} (gelen ${SATIS_MALZ}) · toplamBirim ${it.totalUnitPrice}`);

  // ── K5: FE toplami ACIKCA gonderirse AYNEN korunur ──────────────────────
  // Ekran tek kaynaktir: dosyadan gelen/elle duzeltilmis toplam backend'te
  // yeniden turetilmez (KG9 dersi: musterinin verisi ustundur).
  yakalanan = [];
  const FE_TOPLAM = 1234.5; // ekranin hucresinde duran, carpimla ortusmeyen deger
  await service.create('kullanici-1', {
    title: 'KL P1-b · FE toplami',
    items: [{
      materialName: 'Elle duzeltilmis toplam',
      quantity: 7,
      materialUnitPrice: 100,
      materialMargin: 0,
      materialTotalPrice: FE_TOPLAM,
    }],
  } as any);
  const it2 = yakalanan[0] ?? {};
  sina('K5', 'FE acikca toplam gonderdiyse korunur',
    Math.abs((it2.materialTotalPrice ?? -1) - FE_TOPLAM) < 1e-9,
    `kaydedilen ${it2.materialTotalPrice} · gonderilen ${FE_TOPLAM}`);

  console.log(`\n── SONUC: ${pass} PASS · ${fails.length} FAIL ──`);
  if (fails.length) {
    console.log('\nKIRMIZI:');
    fails.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
  console.log('KL P1-b: kaydedilen toplam ekrandakiyle AYNI.');
  process.exit(0);
}

main().catch((e) => { console.error('BEKLENMEDIK HATA:', e); process.exit(3); });
