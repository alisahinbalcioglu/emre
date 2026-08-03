/**
 * KD9 — KUR ÖLÇÜTÜNÜN KENDİSİ SINANIR  (`npm run test:kd9`)
 *
 * KG13 ("dosyadan gelen işçilikler DAHİL her değer aynı katsayıyla
 * çevrilmeli") E2E'de 31.07.2026 20:33 koşumunda KIRMIZI yandı:
 *
 *   satır21 işçilik: ₺3000  → $63.3    (test beklentisi $63.25)
 *   satır81 işçilik: ₺50000 → $1054.2  (test beklentisi $1054.14)
 *   satır87 işçilik: ₺50000 → $1054.2  (test beklentisi $1054.14)
 *
 * ── KÖK NEDEN: ÖLÇÜT SAĞLAM DEĞİLDİ (ürün değil, TEST) ──────────────────
 *
 * Eski ölçüt iki kusuru birleştiriyordu:
 *
 *  (1) DAİRESEL TAHMİNCİ. `kurAmpirik`, doğrulanacak ekran değerlerinin
 *      KENDİSİNDEN türetiliyordu: usd≥100 çiftlerinin (tl/usd) medyanı.
 *      Ekran 1 ondalığa yuvarlı olduğu için bu tahmincinin gürültüsü
 *      ≈ kur × 0,05 / usd — usd≈100 civarındaki çiftlerde ±0,024.
 *
 *  (2) ORANSAL HATAYA SABİT TOLERANS. `tolerans = 0,05·kur + 0,06` (≈2,43 TL)
 *      YALNIZCA USD hücresinin yarım gösterim adımını (0,05 USD = 2,37 TL)
 *      bütçeler. Kur tahmini δ kadar saparsa satır başına ek hata
 *      `tl · δ / kur` olur ve TL DEĞERİYLE ORANTILI BÜYÜR — hiç bütçelenmemiş.
 *
 *      ₺50.000'lik bir satırda δ = 0,0021 (yani %0,004) tüm bütçeyi yer.
 *      Yani assert, gürültüsü ~0,02 olan bir tahminciden ~0,002 hassasiyet
 *      istiyordu: bir mertebe uyumsuz. Büyük TL satırlarında YAPISAL OLARAK
 *      kırmızıdır; 30.07'de geçmesi ŞANSTI.
 *
 *  (3) "ÜÇÜ DE İŞÇİLİK" BİR BÜYÜKLÜK YAN ÜRÜNÜ. Kütüphaneden gelen malzeme
 *      birim fiyatları ~₺600 (bütçe içinde), dosyadan gelen işçilikler
 *      ₺3.000–₺50.000 (bütçe dışı). Kod düzeyinde işçiliğe özel çevrim YOK:
 *      `ExcelGrid.tsx:2172-2195` altı fiyat alanını TEK `valueFormatter`'a
 *      bağlar, `use-currency.ts:71-78` TEK `conversionRate` üretir,
 *      `Math.ceil`/`yukariYuvarla` para birimi yoluna HİÇ girmez (yalnız TL
 *      taban değerlerini üretir: pricing.ts 42/49/54/139, ExcelGrid 2382/2396,
 *      fill-down 92).
 *
 * ── YENİ ÖLÇÜT ──────────────────────────────────────────────────────────
 * Kur, doğrulanacak veriden DEĞİL bağımsız kaynaktan (backend
 * `/exchange-rates`) alınır; beklenen gösterim ÜRÜNÜN KENDİ fonksiyonuyla
 * (`frontend/lib/pricing.ts` → `paraBicim`) üretilir ve TAM EŞİTLİK aranır.
 * Tolerans YOKTUR — çünkü tahmin de yoktur.
 *
 * Bu dosya tarayıcı/DB GEREKTİRMEZ: ölçütün kendisi saf fonksiyondur.
 * Çıkış kodu sözleşmesi: 0 = PASS · 2 = ÖN KOŞUL YOK · diğer = FAIL.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { paraBicim, PARA_ONDALIK } = require('../../frontend/lib/pricing');

let pass = 0;
const fails: string[] = [];
const sina = (kod: string, ad: string, kosul: boolean, kanit: string) => {
  if (kosul) { pass++; console.log(`  ✅ ${kod} ${ad} — ${kanit}`); }
  else { fails.push(`${kod} ${ad} — ${kanit}`); console.log(`  ❌ ${kod} ${ad} — ${kanit}`); }
};

/** Ekranda görünen TR biçimli sayıyı okur — E2E'deki `tlNum` ile aynı kural. */
const trSayi = (s: string): number => parseFloat(
  String(s).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));

/** ESKİ ÖLÇÜT — spec 379-394'ün birebir kopyası (kıyas için). */
function eskiOlcut(ciftler: { tl: number; usd: number }[]) {
  const buyukler = ciftler.filter((c) => c.usd >= 100).map((c) => c.tl / c.usd).sort((a, b) => a - b);
  const kurAmpirik = buyukler.length ? buyukler[Math.floor(buyukler.length / 2)] : NaN;
  const tolerans = 0.05 * kurAmpirik + 0.06;
  return { kurAmpirik, tolerans, sapanlar: ciftler.filter((c) => Math.abs(c.tl - c.usd * kurAmpirik) > tolerans) };
}

/** YENİ ÖLÇÜT — kur DIŞARIDAN gelir, beklenen ÜRÜNÜN formülüyle üretilir.
 *
 *  `hane`: gözlemin KAYDEDİLDİĞİ ondalık. Varsayılan, ürünün güncel
 *  `PARA_ONDALIK` değeridir — canlı ölçüm hep onu kullanır. Tarihsel
 *  fixture'lar (GERÇEK) kendi dönemlerinin hanesini geçer. Beklenen değer
 *  HER İKİ durumda da ÜRÜNÜN `paraBicim` fonksiyonundan gelir; test kendi
 *  yuvarlama modelini KURMAZ (KD9'un kök nedeni tam olarak buydu). */
function yeniOlcut(ciftler: { tl: number; ekran: string }[], usdTry: number, hane?: number) {
  const carpan = 1 / usdTry;                       // use-currency.ts:74 ile AYNI sıra
  return ciftler
    .map((c) => ({ ...c, beklenen: paraBicim(c.tl, carpan, hane) }))
    .filter((c) => c.ekran !== c.beklenen);
}

console.log('── KD9: KUR ÖLÇÜTÜNÜN KENDİSİ ──\n');

// ══ GERÇEK KAYITLI VERİ (artefakt 2026-07-31T20-33-09-f048ead) ═══════════
// E2E koşumundan BİREBİR alınmış üç çift. Uydurulmuş değil.
//
// ⚠ BU KAYIT 1 ONDALIK DÖNEMİNE AİTTİR. P2-1b (03.08) `PARA_ONDALIK`ı 2'ye
// çekti; ürün bugün "63,25" gösterir, aşağıdaki "63,3" değil. Kayıt
// GÜNCELLENMEDİ ve güncellenmemeli: doğrulanacak üründen gözlem türetmek
// dairesel ölçüt olurdu (bu dosyanın kendi dersi). Bunun yerine kaydın
// dönemi açıkça sabitlendi — aşağıdaki bloklar `ONDALIK_KAYIT` geçer.
// Beklenen değer yine ürünün `paraBicim`inden gelir, yalnız hane kaydın.
//
// YAPILACAK: bir sonraki golden E2E koşumunda 2 ondalıklı TAZE kayıt alınıp
// bu fixture'ın yanına ikinci bir dönem olarak eklenmeli.
const ONDALIK_KAYIT = 1;
const GERCEK = [
  { tl: 3000, ekran: '63,3' },
  { tl: 50000, ekran: '1.054,2' },
  { tl: 50000, ekran: '1.054,2' },
];

// ── A: GERÇEK KUR ARALIĞI — gözlenen gösterimler tek bir kuru İMA EDER ──
// "1 ondalığa yuvarlama" altında ekranda X görünmesi için gereken aralık.
{
  const araliklar = GERCEK.map(({ tl, ekran }) => {
    const u = trSayi(ekran);
    return { alt: tl / (u + 0.05), ust: tl / (u - 0.05) };   // (alt, üst]
  });
  const alt = Math.max(...araliklar.map((a) => a.alt));
  const ust = Math.min(...araliklar.map((a) => a.ust));
  sina('A1', 'gözlenen üç gösterim TEK bir kurla açıklanabiliyor',
    alt < ust,
    `gerçek kur ∈ (${alt.toFixed(4)}, ${ust.toFixed(4)}] — kesişim BOŞ OLSAYDI ürün gerçekten iki farklı kur kullanıyor olurdu`);

  // Testin kendi tahmini bu aralığın DIŞINDA — yani hata tahmincide.
  sina('A2', 'eski tahminci (kurAmpirik=47,4321) gerçek kur aralığının DIŞINDA',
    !(47.4321 > alt && 47.4321 <= ust),
    `47,4321 ∉ (${alt.toFixed(4)}, ${ust.toFixed(4)}] · sapma ≈ ${(47.4321 - ust).toFixed(4)} (%${(100 * (47.4321 - ust) / ust).toFixed(4)})`);
}

// ── B: TOLERANS BÜTÇESİ ORANSAL HATAYI KAPSAMIYOR ───────────────────────
//
// ⚠ İLK YAZIMDA DAHA GÜÇLÜ BİR İDDİA KURULMUŞTU ("eski ölçüt kusursuz veriyi
// HER ZAMAN reddeder") ve ÖLÇÜM ONU ÇÜRÜTTÜ: 6 değerlik örneklemde medyan
// tahminci gerçek kura isabet edince hiçbir şey sapmadı. Doğru iddia daha
// dar: tahminci δ kadar SAPTIĞINDA, ölçüt kusursuz veriyi belirli bir TL
// eşiğinin ÜSTÜNDE reddetmek ZORUNDADIR — çünkü δ'nın satır başına katkısı
// `tl·δ/kur` olup TL ile büyür, tolerans ise SABİTTİR.
//
// Burada δ TAHMİN EDİLMEZ, ENJEKTE EDİLİR: böylece sonuç örneklem şansına
// değil, ölçütün matematiğine bağlıdır.
{
  const kur = 47.429;                                  // A1 aralığının içi
  const carpan = 1 / kur;
  const DELTA = 0.003;                                 // A2'de ölçülen mertebe
  const kurAmpirik = kur + DELTA;
  const tolerans = 0.05 * kurAmpirik + 0.06;
  const tlDegerleri = [600, 830, 3000, 4000, 12500, 50000];

  // Ürünün ÜRETECEĞİ gösterimler — yani TANIMI GEREĞİ doğru, tek kurlu veri.
  const ciftler = tlDegerleri.map((tl) => ({ tl, usd: trSayi(paraBicim(tl, carpan)) }));
  const sapanlar = ciftler.filter((c) => Math.abs(c.tl - c.usd * kurAmpirik) > tolerans);

  sina('B1', 'tahminci δ=0,003 saptığında ESKİ ölçüt KUSURSUZ veriyi reddediyor',
    sapanlar.length > 0,
    `kur=${kur} · kurAmpirik=${kurAmpirik.toFixed(4)} · tolerans=${tolerans.toFixed(2)}TL · sapan=${sapanlar.length}/${ciftler.length}: ${sapanlar.map((c) => `₺${c.tl}`).join(', ') || '-'}`);

  // ⚠ İKİNCİ ÇÜRÜTME: "sapanlar hep en büyükler" de FAZLA GÜÇLÜ çıktı —
  // ölçüldü, ₺4.000 geçerken ₺3.000 saptı. Sebep: satır başına sapma
  // `|tl·δ/kur + q·kur|` ve `q` (o değerin kuantizasyon artığı) İŞARETLİ;
  // bazen δ'yı götürür. Yani TEK bir eşik yok, İKİ eşik ve arada ŞANS BANDI var.
  //
  //   KESİN GEÇER : tl·δ/kur + 0,05·kur < tolerans
  //   KESİN KALIR : tl·δ/kur − 0,05·kur > tolerans
  //   ARADA       : kuantizasyonun işaretine bağlı — yani YAZI TURA
  const kesinGecer = (tolerans - 0.05 * kurAmpirik) * kur / DELTA;
  const kesinKalir = (tolerans + 0.05 * kurAmpirik) * kur / DELTA;
  const bandda = (tl: number) => tl > kesinGecer && tl < kesinKalir;

  sina('B2', '"üçü de işçilik" bir BÜYÜKLÜK yan ürünü — malzeme güvenli bantta, işçilik şans bandında',
    kesinGecer < kesinKalir && !bandda(600) && !bandda(830) && bandda(3000) && bandda(4000) && bandda(50000),
    `kesin geçer ≤ ₺${kesinGecer.toFixed(0)} · şans bandı ₺${kesinGecer.toFixed(0)}–₺${kesinKalir.toFixed(0)} · kesin kalır ≥ ₺${kesinKalir.toFixed(0)}`
    + ` | kütüphane malzemesi ₺600·₺830 GÜVENLİ, dosya işçiliği ₺3.000·₺4.000·₺50.000 ŞANS BANDINDA`
    + ` — ölçütün verdiği karar satırın TİPİNE değil BÜYÜKLÜĞÜNE ve kuantizasyon şansına bağlı`);

  // Bütçenin kendisi: toleransın TAMAMI kuantizasyona gidiyor, δ'ya SIFIR pay.
  const kuantizasyonPayi = 0.05 * kurAmpirik;
  sina('B3', 'toleransın tamamı USD kuantizasyonuna gidiyor, kur hatasına pay YOK',
    kuantizasyonPayi / tolerans > 0.97,
    `kuantizasyon ${kuantizasyonPayi.toFixed(2)}TL / tolerans ${tolerans.toFixed(2)}TL = %${(100 * kuantizasyonPayi / tolerans).toFixed(1)} · ₺50.000'de δ katkısı ${(50000 * DELTA / kur).toFixed(2)}TL, bütçe dışı`);
}

// ── C: YENİ ÖLÇÜT GEÇERLİ VERİYİ KABUL EDİYOR ───────────────────────────
{
  // A1'in verdiği aralıktan bir kur seç ve gerçek gözlemleri sına.
  const araliklar = GERCEK.map(({ tl, ekran }) => {
    const u = trSayi(ekran); return { alt: tl / (u + 0.05), ust: tl / (u - 0.05) };
  });
  const kur = (Math.max(...araliklar.map((a) => a.alt)) + Math.min(...araliklar.map((a) => a.ust))) / 2;
  const sapan = yeniOlcut(GERCEK, kur, ONDALIK_KAYIT);   // kayıt 1 ondalık dönemi
  sina('C1', 'YENİ ölçüt gerçek E2E gözlemlerini KABUL ediyor',
    sapan.length === 0,
    `kur=${kur.toFixed(4)} · ${GERCEK.length} çiftin hepsi birebir · sapan=${sapan.length} · kayıt ${ONDALIK_KAYIT} ondalık`);
}

// ── D: YENİ ÖLÇÜTÜN DİŞLERİ VAR — karışık kuru YAKALIYOR ────────────────
// (aksi halde "hep yeşil" bir assert yazmış olurduk)
{
  const kur = 47.429, carpan = 1 / kur;
  const temiz = [600, 3000, 50000].map((tl) => ({ tl, ekran: paraBicim(tl, carpan) }));

  // AİLE 1 — tek satır BAŞKA kurla çevrilmiş (ör. bayat kur 46,90)
  const bayat = temiz.map((c, i) => i === 2 ? { ...c, ekran: paraBicim(c.tl, 1 / 46.90) } : c);
  sina('D1', 'tek satır BAYAT kurla çevrilmişse yakalanıyor',
    yeniOlcut(bayat, kur).length === 1, `sapan=${JSON.stringify(yeniOlcut(bayat, kur).map((x) => x.tl))}`);

  // AİLE 2 — çevrim HİÇ uygulanmamış (TL değeri USD sanılıyor)
  const cevrilmemis = temiz.map((c, i) => i === 1 ? { ...c, ekran: paraBicim(c.tl, 1) } : c);
  sina('D2', 'çevrimi HİÇ uygulanmamış satır yakalanıyor',
    yeniOlcut(cevrilmemis, kur).length === 1, `sapan=${JSON.stringify(yeniOlcut(cevrilmemis, kur).map((x) => x.tl))}`);

  // AİLE 3 — yuvarlama YUKARI yapılmış (ceil) — ürün halfExpand kullanır
  // ⚠ Hane sayisi URUNUN sabitinden gelir (P2-1b'de 1→2 oldu). Sabit "1"
  // yazilirsa bu aile, YUVARLAMA YONUNU degil HANE SAYISI farkini olcmeye
  // baslar ve dogru sebeple yesil olmaktan cikar.
  const kAdim = 10 ** PARA_ONDALIK;
  const ceilli = temiz.map((c) => {
    const ham = c.tl * carpan;
    return { ...c, ekran: (Math.ceil(ham * kAdim) / kAdim).toLocaleString('tr-TR',
      { minimumFractionDigits: PARA_ONDALIK, maximumFractionDigits: PARA_ONDALIK }) };
  });
  const ceilSapan = yeniOlcut(ceilli, kur);
  sina('D3', 'YUKARI yuvarlamaya kayış yakalanıyor (halfExpand sözleşmesi)',
    ceilSapan.length > 0, `sapan=${ceilSapan.length}/${temiz.length}: ${ceilSapan.map((x) => `₺${x.tl} ekran ${x.ekran} ≠ beklenen ${x.beklenen}`).join(' · ')}`);
}

// ── E: YENİ ÖLÇÜT KUR DEĞERİNE DUYARSIZ — kırılgan değil ────────────────
// Eski ölçüt 30.07'de (47,4127) geçip 31.07'de (47,4321) kalmıştı.
{
  const kurlar = [40, 43.5, 47.4127, 47.4321, 52.75, 61.03];
  const tlDegerleri = [600, 830, 3000, 4000, 12500, 50000, 123456.7];
  const kirilan: string[] = [];
  const eskiKirilan: string[] = [];
  for (const kur of kurlar) {
    const carpan = 1 / kur;
    // E1 — YENİ ölçüt BUGÜNKÜ gösterim hanesiyle sınanır (canlı davranış).
    const ekranlar = tlDegerleri.map((tl) => ({ tl, ekran: paraBicim(tl, carpan) }));
    if (yeniOlcut(ekranlar, kur).length) kirilan.push(String(kur));
    // E2 — ESKİ ölçütün kırılganlığı 1 ONDALIK kuantizasyonundan doğuyordu
    // (±0,05 USD × kur ≈ 2,4TL > tolerans). 2 haneye geçilince kuantizasyon
    // ±0,005'e düşer ve eski ölçüt artık kırılmaz — bu bir test arızası
    // DEĞİL, gerçek bir bulgu. Tarihsel gerekçeyi korumak için bu assert
    // kaydın kendi dönemiyle ölçülür; yoksa "eski ölçüt neden değişti"
    // kanıtı sessizce yok olurdu.
    const ekranlarKayit = tlDegerleri.map((tl) => ({ tl, ekran: paraBicim(tl, carpan, ONDALIK_KAYIT) }));
    const r = eskiOlcut(ekranlarKayit.map((c) => ({ tl: c.tl, usd: trSayi(c.ekran) })));
    if (r.sapanlar.length) eskiKirilan.push(`${kur}(${r.sapanlar.length})`);
  }
  sina('E1', 'YENİ ölçüt kur değerine duyarsız (6 farklı kur × 7 değer)',
    kirilan.length === 0, kirilan.length ? `kırıldığı kurlar: ${kirilan.join(', ')}` : `${kurlar.length}×${tlDegerleri.length} = ${kurlar.length * tlDegerleri.length} çiftin hepsi geçti`);

  sina('E2', 'ESKİ ölçüt aynı veride kura göre KIRILGAN (yalancı kırmızı üretiyor)',
    eskiKirilan.length > 0,
    eskiKirilan.length ? `kırıldığı kurlar: ${eskiKirilan.join(', ')} — aynı veri, yalnız kur değişti` : 'hiç kırılmadı');
}

console.log(`\nSONUC: ${pass} PASS, ${fails.length} FAIL`);
if (fails.length) { fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
