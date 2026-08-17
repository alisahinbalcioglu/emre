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
//
// ASAMA A — KUTUPHANE: Liste --(iskonto%)--> Net (alis). Cevrim YOK.
// ASAMA B — TEKLIF:    Net (teklif birimine cevrilmis) --(kar%)--> Satis.
//                      Satis × Miktar = Satir Toplami.
// ALTIN KURAL: fiyat ASLA uretilmez; eslesme yoksa hucre bos + isaretli.
// ============================================================

// NOT: goreli yol ZORUNLU — vitest.config.ts'te '@/' alias'i tanimli degil.
import { sayiAlani } from './sayi-alani';

// ============================================================
// ADIM 8 (Kar Analizi onkosul turu, 06.08) — ONDALIK TEK KURAL (kalem 67)
//
// Iki soru, TEK yerde cevaplanir; baska dosya kendi kararini VEREMEZ:
//
//  1) YUVARLAMA NEREDE? → YALNIZ SATIRDA. `yukariYuvarla` ile, YUKARI,
//     ONDALIK hane. TOPLAMDA IKINCI YUVARLAMA YASAK — toplamlar yuvarlanmis
//     satir degerlerinin kurus-tam toplamidir (bkz. sayfaToplamlari).
//     Gerekce: ₺49M'lik teklifte satir/toplam yuvarlama farki kurus degil
//     BINLERDIR; iki kez yuvarlayan yol o farki uretir.
//
//  2) KAC HANE? → KATMANA GORE, ikisi de buradaki sabitten:
//     · HESAP/DEGER katmani: ONDALIK = 1 (hucreye yazilan deger).
//     · GOSTERIM katmani: PARA_ONDALIK = 2 (paraBicim; backend Excel
//       numFmt'leri de ayni karari uygular: '#,##0.00' — export-engine
//       BIRIM_FMT + standart-cikti fmt).
//     Kalem 67'nin "bicimde 1, bicimlendiricilerde 2" gerilimi KATMAN
//     farkidir ve bilinclidir: deger 1 hane tasinir, para 2 hane gosterilir.
// ============================================================

/** Yuvarlama: YUKARI, virgulden sonra TEK hane. */
export const ONDALIK = 1;

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Yukari yuvarlama (1 hane). Float epsilonu: 1.1*10=11.000000000000002
 *  gibi ikili artiklarin degeri bir ust dilime tasimasini onler.
 *
 *  ⚠ EPSILON ORANTILI OLMAK ZORUNDA (canli bulgu 03.08).
 *  Eskiden SABIT `1e-9` idi. Bir double'in ulp'u |y| × 2^-52 oldugu icin
 *  `y = x*k` yaklasik 4,5 milyonu asinca ulp 1e-9'u GECER ve sabit epsilon
 *  hicbir sey yapmaz. Olculen vaka: 12200 × ₺152,30 → ham carpim float'ta
 *  1858060.0000000002, ceil onu ₺1.858.060,10'a cikariyordu; dogrusu
 *  ₺1.858.060,00. `Math.ceil` oldugu icin sapma HER ZAMAN yukari — yani
 *  musteriye sistematik olarak FAZLA yaziliyordu. ~₺450.000 ustu
 *  toplamlarda goruluyordu; birim fiyat mertebesinde hic gorunmuyordu.
 *
 *  Bu, projenin KD9 turunda ogrendigi dersin ta kendisi: SABIT TOLERANS
 *  ORANTILI HATAYI KAPSAMAZ. Ders olcut tarafinda ogrenilmis, urunun
 *  yuvarlamasinda ayni kusur duruyormus.
 *
 *  `EPSILON * 4` ~4 ulp'luk pay birakir; para mertebesinde 1e-8 TL zaten
 *  anlamsiz oldugu icin gercek yukari yuvarlamayi bozmaz (kapi:
 *  pricing.test.ts "buyuk mertebede GERCEK yukari yuvarlama hala calisir").
 *
 *  Backend esi `backend/src/modules/matching/pricing.ts` — IKISI BIRLIKTE
 *  guncellenir. */
export function yukariYuvarla(x: number, hane = ONDALIK): number {
  const k = 10 ** hane;
  const y = x * k;
  const eps = Math.max(1e-9, Math.abs(y) * Number.EPSILON * 4);
  const r = Math.ceil(y - eps) / k;
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

// ══ PARA BIRIMI GOSTERIMI — TEK KAYNAK (KD9, 02.08.2026) ═══════════════════
//
// Bu ifade ExcelGrid.tsx icinde IKI KEZ kopyalanmisti (fiyat kolonlari ve
// kutuphanenin "Net Fiyat" kolonu). Kopya olmasi tek basina sorun degildi;
// SORUN, E2E testinin bu ifadeyi HIC bilmemesiydi: test gordugu sayilardan
// kuru GERI CIKARIP kendi modeliyle karsilastiriyordu (bkz. KD9 kok neden).
// Artik urun de test de AYNI fonksiyonu cagirir; ikisi ayrisamaz.
//
// ⚠ `v / kur` DEGIL `v * conversionRate`: urun kodu carpani `1 / tryPerUsd`
// olarak ONCE hesaplar (use-currency.ts). Bolme ile carpma son bit'te
// ayrisabilir ve TAM ESITLIK arayan bir assert'i bosuna kirmiziya cevirir.
// Beklenen degeri ureten testin de AYNI islem sirasini kullanmasi sarttir.

/**
 * Gosterim ondaligi (para hucreleri) — "3.019,25".
 *
 * P2-1b (kullanici karari 03.08): 1 → 2. Eski SPEC 1 haneydi ama urunun
 * GERI KALANI hic uymuyordu: 15 ayri dosya kendi bicimleyicisinde 2 hane
 * kullaniyor ve MUSTERIYE GIDEN Excel de 2 hane (`standart-cikti.ts:69`
 * numFmt). Fark sondaki sifir da degildi: `standart-sema.ts:226` dosyadan
 * gelen fiyatlari YUVARLAMADAN kopyaladigi icin taban deger 2+ haneli
 * olabiliyor; ekran onu 1 haneye yuvarlayip gosterirken cikti ayni tabani
 * 2 haneyle yaziyordu → ayni deger iki yerde FARKLI RAKAM.
 *
 * ⚠ `ONDALIK` (yukarida, hesap yuvarlamasi) DEGISMEDI — o hala 1 hane,
 * YUKARI. Bu sabit yalniz GOSTERIMI belirler, uretilen parasal degeri DEGIL.
 */
export const PARA_ONDALIK = 2;

/**
 * TRY tabanli degeri gecerli para biriminde gosterim METNINE cevirir
 * (sembolsuz, TR locale, PARA_ONDALIK hane).
 *
 * YUVARLAMA: `Intl` varsayilani `halfExpand` (yariyi sifirdan uzaga) —
 * YUKARI yuvarlama DEGILDIR. `yukariYuvarla` bu yola GIRMEZ; o yalniz TL
 * taban degerlerini (net/satis/satir toplami/genel toplam) uretir.
 *
 * `hane` YALNIZ tarihsel kayitlar icindir (bkz. kd9-kur-olcutu-test.ts:
 * GERCEK fixture'i 1 ondalik doneminde kaydedilmis gercek ekran metnidir).
 * Urun kodu bu parametreyi GECMEZ — varsayilan PARA_ONDALIK'tir. Amac,
 * testin kendi yuvarlama modelini kurmasini onlemek: tek uygulama, tek yer.
 */
export function paraBicim(vTRY: number, conversionRate: number, hane: number = PARA_ONDALIK): string {
  return (vTRY * conversionRate).toLocaleString('tr-TR', {
    minimumFractionDigits: hane,
    maximumFractionDigits: hane,
  });
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

// ============================================================
// ADIM 7 (Kar Analizi onkosul turu, 06.08) — TEK SAYFA-TOPLAM FONKSIYONU
//
// Kalem 65'in cozumu: sayfa toplamini ureten yerler kendi aritmetigini
// yapiyordu (updatePinnedBottom `+= parseFloat`, legacy tablo `reduce`...).
// Bu fonksiyon o hesabin TEK sahibidir ve KAR SATIRI (ADIM 10) buna biner:
// kar icin 22. bir aritmetik yeri ACILMAZ — kar burada, maliyet ile satisin
// FARKI olarak dogar.
//
// ── MODEL (kullanicinin tanimi, genisletilemez) ──────────────────────────
//  · Hucre SATIS tasir (Z3 muhru). Kar %0 iken satis = maliyet.
//  · MALIYET = satis@%0 — yani `hesaplaSatisBirimFiyat(net, 0)`. Bu birebir
//    kullanicinin cumlesi: "kar marji yuzde sifir girildiginde maliyet olur".
//  · KAR = satis toplami − maliyet toplami. Ikinci bir yuzde HESAPLANMAZ.
//  · BOS FIYAT ≠ SIFIR KAR: o tarafta ne birim ne toplam yazan satir
//    "fiyatlanmamis" SAYILIR (sayaci doner), kara 0 diye GIRMEZ.
//
// ── SATIR KURALLARI ──────────────────────────────────────────────────────
//  satis  : toplam hucresi NEYSE o (dosyadan gelen toplam ustundur — mevcut
//           updatePinnedBottom davranisi korunur, KE21).
//  maliyet: kar == 0        → satis (model geregi esit; dosya toplamlari dahil)
//           kar > 0, net var → hesaplaSatirToplam(satis@0 = yuvarla(net), miktar)
//           kar > 0, net yok → net' = birim/(1+kar/100) (grid konvansiyonu —
//                              ExcelGrid manuel-fiyat yolu ayni turetmeyi yapar)
//  _ozet satirlari TOPLAMA GIRMEZ (30.07 kullanici karari: Icmal cift sayardi).
// ============================================================

export interface SayfaToplamOzeti {
  /** Satis toplamlari — bugunku GENEL TOPLAM satirinin uc hucresi */
  matToplam: number;
  labToplam: number;
  genelToplam: number;
  /** Maliyet toplamlari (satis@%0 kuraliyla) */
  matMaliyet: number;
  labMaliyet: number;
  /** KAR = satis − maliyet (ADIM 10'un uc hucresi) */
  matKar: number;
  labKar: number;
  toplamKar: number;
  /** Fiyatlanmamis satir sayaclari (bos fiyat ≠ sifir kar — KE29) */
  matFiyatli: number;
  matFiyatsiz: number;
  labFiyatli: number;
  labFiyatsiz: number;
}

export function sayfaToplamlari(
  satirlar: Record<string, any>[],
  roller: Record<string, string | undefined>,
): SayfaToplamOzeti {
  const { materialUnitPriceField: mBirim, materialTotalField: mTop,
    laborUnitPriceField: lBirim, laborTotalField: lTop,
    quantityField: mikA, unitField: brmA } = roller;
  const sayi = (v: unknown) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const bos = (v: unknown) => String(v ?? '').trim() === '';

  // ── KURUS-TAMSAYI BIRIKTIRME (kapinin ilk kosumunda yakalandi) ──────────
  // Ham float toplama SIRAYA DUYARLIDIR (IEEE754 birlesme ozelligi yok):
  // sayfalarin ayri toplamlarinin toplami ile birlesik listenin toplami
  // ~1e-10 sapiyordu → "sayfalarin kari = Icmal'in kari, kurusu kurusuna"
  // esitligi (KE30) tutmuyordu. Para kurus-tamsayi olarak biriktirilir
  // (satir degerleri zaten 1 hane yuvarlanmis — kurus tamsayidir), boylece
  // toplama SIRADAN BAGIMSIZ ve esitlikler KESIN olur. Gate gevsetilmedi.
  const K = (v: number) => Math.round(v * 100); // TL → kurus tamsayi
  let matToplamK = 0, labToplamK = 0, matMaliyetK = 0, labMaliyetK = 0;
  const o: SayfaToplamOzeti = {
    matToplam: 0, labToplam: 0, genelToplam: 0,
    matMaliyet: 0, labMaliyet: 0,
    matKar: 0, labKar: 0, toplamKar: 0,
    matFiyatli: 0, matFiyatsiz: 0, labFiyatli: 0, labFiyatsiz: 0,
  };

  for (const r of satirlar) {
    if (!r?._isDataRow) continue;
    if (r._ozet) continue; // Icmal ozet satiri — cift sayim yasagi
    const miktar = etkinMiktar(r, mikA, brmA);

    // Tek taraf (malzeme/iscilik) icin ortak kural — iki kez cagrilir.
    const taraf = (
      birimAlan: string | undefined, topAlan: string | undefined,
      karAlan: '_malzKar' | '_iscKar', netAlan: '_matNetPrice' | '_labNetPrice',
    ): { satis: number; maliyet: number; fiyatli: boolean } | null => {
      if (!birimAlan && !topAlan) return null; // sutun hic yok — sayilmaz
      const birimBos = !birimAlan || bos(r[birimAlan]);
      const topBos = !topAlan || bos(r[topAlan]);
      if (birimBos && topBos) return { satis: 0, maliyet: 0, fiyatli: false };

      const satis = !topBos ? sayi(r[topAlan!])
        : hesaplaSatirToplam(sayi(r[birimAlan!]), miktar);
      // KÂR HÜCRESİ: ekranın/kaydın kullandığı SÜZGECİN AYNISI. Yerel `sayi`
      // negatifi geçirir; aşağıdaki `kar <= 0` dalı negatifi zaten sıfır gibi
      // ele aldığı için sonuç DEĞİŞMEZ — ama ölçüt tek yerden okunmalı ki
      // ekran/kayıt/kâr analizi üç ayrı sayı üretemesin.
      const kar = sayiAlani(r[karAlan]);
      let maliyet: number;
      if (kar <= 0) {
        maliyet = satis; // %0 → satis = maliyet (dosya toplamlari dahil)
      } else {
        const netSakli = typeof r[netAlan] === 'number' && r[netAlan] > 0 ? r[netAlan] : 0;
        const net = netSakli > 0 ? netSakli
          : sayi(birimAlan ? r[birimAlan] : 0) / (1 + kar / 100);
        maliyet = hesaplaSatirToplam(hesaplaSatisBirimFiyat(net, 0), miktar);
      }
      return { satis, maliyet, fiyatli: true };
    };

    const m = taraf(mBirim, mTop, '_malzKar', '_matNetPrice');
    if (m) {
      if (m.fiyatli) { o.matFiyatli++; matToplamK += K(m.satis); matMaliyetK += K(m.maliyet); }
      else o.matFiyatsiz++;
    }
    const l = taraf(lBirim, lTop, '_iscKar', '_labNetPrice');
    if (l) {
      if (l.fiyatli) { o.labFiyatli++; labToplamK += K(l.satis); labMaliyetK += K(l.maliyet); }
      else o.labFiyatsiz++;
    }
  }

  o.matToplam = matToplamK / 100;
  o.labToplam = labToplamK / 100;
  o.matKar = (matToplamK - matMaliyetK) / 100;
  o.labKar = (labToplamK - labMaliyetK) / 100;
  o.matMaliyet = matMaliyetK / 100;
  o.labMaliyet = labMaliyetK / 100;
  // TANIM GEREGI esitlik (KE26): toplam kar, YAYINLANAN iki kalemin toplami
  // OLARAK tanimlanir — ayri bir formulden degil. Boylece
  // `toplamKar === matKar + labKar` JS'te BIT DUZEYINDE dogrudur (ayni ifade).
  // (Kurus-tamsayidan tek seferde bolmek son bitte ayrisabilirdi: 1/100+2/100
  // !== 3/100 — IEEE754.)
  o.toplamKar = o.matKar + o.labKar;
  o.genelToplam = o.matToplam + o.labToplam;
  return o;
}

/**
 * MALIYETI GERIYE TURET — hucrede SATIS var, o an gecerli olan kar biliniyor.
 *
 * NEDEN GEREKLI (06.08 canli hata): teklif gridinde kar yuzdesi degistiginde
 * motor "net"i `_matNetPrice` alanindan okur. O alan bir GRID KOLONU DEGIL ve
 * AG-Grid `setDataValue` kolon yoksa veriye DOKUNMADAN `false` doner — yani
 * alan hep 0 kaliyordu (bugune kadar KAYDEDILMIS her teklifte de 0). Kod bu
 * durumda hucreyi "net" sanip okuyordu; oysa hucre SATIS tasir:
 *     net 1558,5 · kar %20 → hucre 1870,2
 *     kar %0     → hesaplaSatisBirimFiyat(1870,2, 0) = 1870,2  → DEGISMIYOR
 *     kar %30    → 1870,2 × 1,3 = 2431,3  (dogrusu 2026,1 — ₺405,20 fazla)
 * Kullanicinin "0 yapinca net fiyata donmuyor" dedigi sey bu hatanin
 * carpan=1 ozel halidir; hata her kar degisiminde BILESIK carpiyordu.
 *
 * ⚠ Bu, mühürlü modelin ZATEN yazili kurali: `sayfaToplamlari` icindeki
 * "kar > 0, net yok → net' = birim/(1+kar/100)" satiri ve ExcelGrid'in
 * manuel-fiyat dali AYNI turetmeyi yapar. Burada tek yere alindi.
 *
 * @param hucreSatis  hucrede YAZAN deger (satis birim fiyati)
 * @param oncekiKar   o deger yazilirken gecerli olan kar yuzdesi
 */
export function maliyetiGeriTuret(hucreSatis: number, oncekiKar: number): number {
  const s = Number(hucreSatis);
  if (!Number.isFinite(s) || s <= 0) return 0;
  const k = Number(oncekiKar);
  if (!Number.isFinite(k) || k <= 0) return s; // kar yoktu → hucre zaten maliyet
  return s / (1 + k / 100);
}

// ============================================================
// ADIM 10 (Kar Analizi, 06.08) — KAR SATIRI URETICI
//
// Kullanicinin 05.08 istegi, birebir: "asagida toplam fiyatlarin altina bir
// satir daha acilsin — malzeme toplamin altinda malzeme kar, iscilik
// toplamin altinda iscilik kar, genel toplamin altinda toplam kar."
//
// UC HUCRE, BIR TANE FAZLA DEGIL. Kurallar (hepsi kullanicinin modelinden):
//  · Kar, sayfaToplamlari'nin maliyet−satis FARKIDIR — burada HESAP YOK,
//    yalnizca yerlesim (kalem 65'in hastaligi 22. yere tasinmaz, KE27).
//  · YUZDE YAZILMAZ (KE28): deger alanlarinda sayi durur, '%' uretilmez.
//  · BOS FIYAT ≠ SIFIR KAR (KE29): o tarafta HIC fiyatli satir yoksa deger
//    `null` doner — gosterim katmani '—' basar, ₺0,00 BASMAZ. Kismi
//    fiyatliysa tutar doner ve `fiyatsiz` sayaci yaninda tasinir.
//  · Bu satir PINNED'dir (_isPinnedTotal): rowData'ya GIRMEZ → kayda ve
//    musteriye giden ciktiya YAPISAL olarak tasinamaz (KE31'in FE yarisi).
// ============================================================

export interface KarSatiriBilgi {
  matYok: boolean;
  labYok: boolean;
  matFiyatsiz: number;
  labFiyatsiz: number;
  /** KAR YUZDELERI (17.08) — yalniz GOSTERIM icin; `null` = gosterilmez. */
  matYuzde: number | null;
  labYuzde: number | null;
  genelYuzde: number | null;
}

/**
 * KAR YUZDESI — kar / MALIYET (17.08 kullanici tanimi).
 *
 * Kullanicinin cumlesi birebir: "maliyet 100 TL (kar yuzdesi %0 iken), kar
 * 20 TL ise kar %20'dir." Yani payda SATIS degil MALIYET'tir. Bu ayrim
 * onemli: ayni rakamlar satisa bolunseydi 20/120 = %16,7 cikardi ve
 * kullanicinin kar marji anlayisiyla celisirdi.
 *
 * ⚠ KE28 ILE CELISMEZ: o kural DEGER (tutar) hucrelerine yuzde basilmasini
 * yasaklar — "deger alanlarinda sayi durur". Bu yuzde tutar hucresine degil,
 * ZATEN YUZDE OLAN "Kar %" kolonuna yazilir.
 *
 * ⚠ IKINCI BIR KAR HESABI DEGILDIR: kar yine `sayfaToplamlari`nin
 * maliyet−satis farkidir (KE27). Burada yalnizca o farkin maliyete ORANI
 * turetilir; hicbir tutar bu fonksiyondan etkilenmez.
 *
 * `null` donen durumlar ve SEBEPLERI:
 *  · kar null      → o tarafta hic fiyatli satir yok (KE29) — oran anlamsiz.
 *  · maliyet <= 0  → SIFIRA BOLME. Ayrica maliyeti sifir olan bir kalemin
 *                    kar orani tanimsizdir (%∞ yazmak yanlis guven verirdi).
 */
export function karYuzdesi(kar: number | null, maliyet: number): number | null {
  if (kar === null || !Number.isFinite(kar)) return null;
  if (!Number.isFinite(maliyet) || maliyet <= 0) return null;
  return Math.round((kar / maliyet) * 1000) / 10; // 1 ondalik
}

export function karSatiri(
  ozet: SayfaToplamOzeti,
  roller: Record<string, string | undefined>,
  nameField?: string,
): Record<string, any> {
  const { materialTotalField: mTop, laborTotalField: lTop,
    grandTotalField: genel, grandUnitPriceField: genelBirim } = roller;
  const row: Record<string, any> = {
    _rowIdx: -2,
    _isDataRow: false,
    _isHeaderRow: false,
    _isPinnedTotal: true,
    _isKarRow: true,
  };
  const matYok = ozet.matFiyatli === 0;
  const labYok = ozet.labFiyatli === 0;
  const bilgi: KarSatiriBilgi = {
    matYok,
    labYok,
    matFiyatsiz: ozet.matFiyatsiz,
    labFiyatsiz: ozet.labFiyatsiz,
    // Yuzdeler tutarla AYNI kosula bagli: tutar `null` ise oran da yok.
    matYuzde: matYok ? null : karYuzdesi(ozet.matKar, ozet.matMaliyet),
    labYuzde: labYok ? null : karYuzdesi(ozet.labKar, ozet.labMaliyet),
    genelYuzde: matYok && labYok
      ? null
      : karYuzdesi(ozet.toplamKar, ozet.matMaliyet + ozet.labMaliyet),
  };
  row._karBilgi = bilgi;
  if (nameField) row[nameField] = 'KÂR';
  if (mTop) row[mTop] = bilgi.matYok ? null : ozet.matKar;
  if (lTop) row[lTop] = bilgi.labYok ? null : ozet.labKar;
  // Toplam Kar: GENEL TOPLAM satiri hangi kolona yaziyorsa ayni kolona
  // (grandTotal, yoksa grandUnitPrice geri dususu — updatePinnedBottom kurali).
  const genelAlan = genel ?? genelBirim;
  if (genelAlan) row[genelAlan] = bilgi.matYok && bilgi.labYok ? null : ozet.toplamKar;
  return row;
}
