// ============================================================
// MetaPrice — Fiyat Atama Kurallari (fiyatlandirma cekirdegi)
// Kaynak: kullanici spec'i 2026-07-08. Backend esi:
// backend/src/modules/matching/pricing.ts — AYNI kurallar, ikisini birlikte guncelle.
//
// SÖZLEŞME — Z3: GRID HESAPLARI (ARINMA Faz 1, 27.07.2026)
// Çıktı DEĞİŞMEZLERİ:
//  1. Satış = net × (1+kar%), YUKARI 1 hane; Satır toplamı = satış × miktar;
//     GENEL TOPLAM = malzeme+işçilik toplamlarının toplamı.
//  2. MİKTAR = satırdaki SAF-sayı hücre (etkinMiktar): quantityField sayı
//     değilse unitField'daki sayı miktar kabul edilir — backend
//     writePricesToWorkbook ile AYNI kural (app ↔ çıktı aynı değeri görür).
//  3. Para birimi yalnız GÖRÜNTÜLEME çevirisidir (taban TRY, canlı TCMB);
//     kütüphane fiyatları orijinal biriminde kalır.
//  Mühür: pricing.test.ts (FE vitest) + backend test:ke KG bloğu.
// ============================================================
//
// ASAMA A — KUTUPHANE: Liste --(iskonto%)--> Net (alis). Cevrim YOK.
// ASAMA B — TEKLIF:    Net (teklif birimine cevrilmis) --(kar%)--> Satis.
//                      Satis × Miktar = Satir Toplami.
// ALTIN KURAL: fiyat ASLA uretilmez; eslesme yoksa hucre bos + isaretli.

/** Yuvarlama: YUKARI, virgulden sonra TEK hane. */
export const ONDALIK = 1;

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Yukari yuvarlama (1 hane). Float epsilonu: 1.1*10=11.000000000000002
 *  gibi ikili artiklarin degeri bir ust dilime tasimasini onler. */
export function yukariYuvarla(x: number, hane = ONDALIK): number {
  const k = 10 ** hane;
  const r = Math.ceil(x * k - 1e-9) / k;
  return r === 0 ? 0 : r; // -0 normalize (epsilon sifiri eksiye itebilir)
}

/** ASAMA A: Liste fiyatina TEK iskonto → NET (alis). Listenin biriminde.
 *  hesaplaNetFiyat(3354.64, 10) === 3019.2 ; iskonto 0 → net = liste. */
export function hesaplaNetFiyat(listeFiyat: number, iskontoYuzde: number): number {
  const oran = clamp(iskontoYuzde, 0, 100) / 100;
  return yukariYuvarla(listeFiyat * (1 - oran));
}

/** ASAMA B: Net (teklif biriminde) + kar% → SATIS birim.
 *  Kar 0 → satis = net (1 haneye yukari). Cevrim yapmaz. */
export function hesaplaSatisBirimFiyat(netTeklifParaBirimi: number, karYuzde: number): number {
  const oran = Math.max(0, karYuzde) / 100;
  return yukariYuvarla(netTeklifParaBirimi * (1 + oran));
}

/** Satir toplami = satis birim × miktar. */
export function hesaplaSatirToplam(satisBirimFiyat: number, miktar: number): number {
  return yukariYuvarla(satisBirimFiyat * miktar);
}

/** UY2 (EMO AYVAZ 27.07): ETKIN MIKTAR — MİKTAR/BİRİM basliklari TERS
 *  persist edilmis tekliflerde quantityField hucresi metin ('mt') kalir,
 *  gercek sayi unitField'dadir. SAF sayi ise miktar odur; degilse birim
 *  hucresindeki saf sayi miktar kabul edilir (backend writePrices ile
 *  AYNI kural — app toplami ve cikti ayni degeri gorur). */
export function etkinMiktar(
  row: Record<string, any>,
  quantityField?: string,
  unitField?: string,
): number {
  const oku = (f?: string): number => {
    if (!f) return NaN;
    const s = String(row[f] ?? '').trim();
    if (!/^-?[0-9.,]+$/.test(s)) return NaN;
    const n = parseFloat(s.replace(',', '.'));
    return isNaN(n) ? NaN : n;
  };
  const q = oku(quantityField);
  if (!isNaN(q)) return q;
  const u = oku(unitField);
  return !isNaN(u) ? u : 0;
}

/**
 * KD11 — İÇE AKTARMADA EKSİK TOPLAMLARI TAMAMLA (pano kalem 54, Yol A).
 *
 * KÖK NEDEN: `backend/.../standart-sema.ts:191-195` dosyadaki toplam
 * sütununu YALNIZ KOPYALAR. Dosyada "Malz. Toplam" sütunu yoksa hücre boş
 * kalır ve içe aktarma hattında onu dolduracak ÇARPMA HİÇ YOKTUR.
 * PANOVA'da ölçüldü: 56 satırda `_matBirim=2300000`, `_matToplam=""`.
 *
 * "İşç. Toplam neden çalışıyor?" — çalışmıyor, KOPYALANIYOR: o dosyalarda
 * "İşç. Toplam" sütunu var. Kanıt: ŞAHİNKUL SIHHİ'de birim dolu 85, toplam
 * dolu 90 — beş satırda birim yokken toplam var.
 *
 * ⚠ YENİ ÇARPMA İCAT EDİLMEZ: `hesaplaSatirToplam` (yukarıda) tek formüldür;
 * ekranın bütün yolları onu çağırır. Burada da o çağrılır.
 *
 * ⚠ DOSYADAN GELEN DEĞERE DOKUNULMAZ: hücre zaten doluysa olduğu gibi kalır.
 * Dosyanın kendi toplamı, bizim hesabımızdan üstündür (müşterinin verisi).
 */
export function toplamlariTamamla(
  satirlar: Record<string, any>[],
  roller: Record<string, string | undefined>,
): number {
  const { materialUnitPriceField: mBirim, materialTotalField: mTop,
    laborUnitPriceField: lBirim, laborTotalField: lTop,
    grandTotalField: genel, quantityField: mikA, unitField: brmA } = roller;
  const sayi = (v: unknown) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const bos = (v: unknown) => String(v ?? '').trim() === '';
  let dokunulan = 0;

  for (const r of satirlar) {
    if (!r?._isDataRow) continue;
    const miktar = etkinMiktar(r, mikA, brmA);

    // ⚠ MIKTAR 0 ISE HUCRE BOS BIRAKILMAZ, "0.0" YAZILIR.
    // Bu benim kararim degil; proje bunu zaten karara baglamis:
    // ExcelGrid.tsx:2396 → "Miktar 0 ise grand total 0 gosterilir (bos degil,
    // kullanici 'bos degil sifir' dedi)". PANOVA'da bir satir tam boyle:
    // `2'' 30 Metre Kaucuk Hortumlu Yangin Dolabi` · miktar=0 · birim fiyat 8250.
    // Ilk yazdigim `miktar > 0` kosulu o satiri bos birakiyordu — mevcut
    // kurala aykiriydi, kaldirildi. Olcut: BIRIM FIYAT var mi.
    if (mTop && mBirim && bos(r[mTop]) && sayi(r[mBirim]) > 0) {
      r[mTop] = hesaplaSatirToplam(sayi(r[mBirim]), miktar).toFixed(1);
      dokunulan++;
    }
    // İşç. Toplam — aynı kural (dosyada sütun yoksa burası da boştur)
    if (lTop && lBirim && bos(r[lTop]) && sayi(r[lBirim]) > 0) {
      r[lTop] = hesaplaSatirToplam(sayi(r[lBirim]), miktar).toFixed(1);
      dokunulan++;
    }
    // Genel Toplam — recalcGrand (ExcelGrid.tsx:2386-2397) ile AYNI kural.
    // Bileşenlerden EN AZ BİRİ yazılıysa genel toplam da yazılır (0 olsa bile).
    if (genel && bos(r[genel])) {
      const matVar = !!mTop && !bos(r[mTop]);
      const labVar = !!lTop && !bos(r[lTop]);
      if (matVar || labVar) {
        const t = sayi(mTop ? r[mTop] : 0) + sayi(lTop ? r[lTop] : 0);
        r[genel] = yukariYuvarla(t).toFixed(1);
        dokunulan++;
      }
    }
  }
  return dokunulan;
}
