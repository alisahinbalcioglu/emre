/**
 * PARA SÜTUNUNUN EN KÜÇÜK GENİŞLİĞİ — ÖLÇÜMDEN TÜRETİLİR, TAHMİN DEĞİL.
 *
 * ── KUSUR (t.4, 21.09.2026, 1920 px'te ölçüldü) ─────────────────────────────
 * Teklif detayında para hücreleri kırpılıyordu:
 *   ₺9.568.938,…   ₺12.071.66…   ₺6.856.505,…   ₺16.425.443…   ₺17.208.977…
 * Sığan tek sayı en kısası olan `₺7.366.828,10` idi. Sütun BAŞLIKLARI da
 * kesikti ("Malz. Birim …").
 *
 * ── NEDEN: SABİT PİKSEL × DEĞİŞKEN UZUNLUKTA METİN ──────────────────────────
 * Sütun genişliği şemada SABİT yazılı (`backend/.../excel-grid/standart-sema.ts`
 * `_matBirim` width 120) ve teklifle birlikte kaydedilir; içerik ise teklifin
 * büyüklüğüne göre 5 haneden 9 haneye çıkar. 120 px'lik bir sütunun metne
 * kalan yeri 90 px'tir (aşağıdaki krom hesabı) — 8 haneli bir tutar oraya
 * sığmaz. Yani kusur tek tek tekliflerde değil, VARSAYILAN GENİŞLİKTEDİR.
 *
 * ── ÖLÇÜM (gerçek Chromium, uygulamanın kendi CSS'i) ────────────────────────
 * `scratchpad/tur-gorunur/olcum/olc2.mjs` + `olc3.mjs`:
 * `ag-grid.css` + `ag-theme-alpine.css` + `fill-handle.css` gerçek tarayıcıya
 * yüklendi, ölçüm GERÇEK bir `.ag-cell` düğümü üzerinde yapıldı.
 *
 *  · YAZI TİPİ: ızgara Inter KULLANMAZ. `ag-grid.css` `[class*=ag-theme-]`
 *    kuralı `--ag-font-family`yi basar, Alpine onu sistem yığınına ayarlar
 *    (`-apple-system, …, "Segoe UI", …`) — Windows'ta Segoe UI. `layout.tsx`in
 *    Inter'i gövdede kalır, hücreye GEÇMEZ. (İlk ölçüm Inter'le yapılmıştı,
 *    çürüdü; yazı tipini varsaymak yerine `getComputedStyle` ile okundu.)
 *  · HÜCRE KROMU: `padding: 14px` (Alpine `calc(--ag-cell-horizontal-padding
 *    - 1px)`, `--ag-grid-size: 5px` ezmesiyle) + `border: 1px` → iki yanda
 *    toplam 30 px. Yani METNE KALAN = sütun genişliği − 30.
 *  · EN GENİŞ BAĞLAM: pinned GENEL TOPLAM / KÂR satırı. `getRowStyle`
 *    (ExcelGrid.tsx) oraya `fontSize: 13, fontWeight: 800` verir; hem yazı
 *    büyük hem kalın, hem de sayfanın EN BÜYÜK sayısı orada durur.
 *
 * ── MODEL BİLDİRİLEN KUSURU BİREBİR ÜRETTİ (doğrulama) ──────────────────────
 * 120 px sütun → 90 px metin alanı. Pinned 13px/800 ölçümü:
 *   `₺7.366.828,10`  = 88,86 px → SIĞAR   (görev dosyası: "sığan tek sayı")
 *   `₺9.568.938,40`  = 90,64 px → KESİLİR
 *   `₺12.071.664,50` = 95,42 px → KESİLİR
 *   `₺17.208.977,55` = 96,66 px → KESİLİR
 * Model gözlemi açıkladığı için sayıları güvenle ileri doğru kullanabiliyoruz.
 *
 * ── SEÇİLEN ÇÖZÜM: TABAN GENİŞLİK (alt sınır), sabit ezme DEĞİL ─────────────
 * Alternatifler ve neden seçilmediler:
 *   · Şemadaki 120'yi büyütmek → KAYITLI tekliflerin `columnDefs`i zaten
 *     diskte; eski teklifler düzelmezdi.
 *   · Gizleme / katlama → kullanıcı teklifi okurken tam da bu sütunlara bakar.
 *   · İçerikten ölçüp uyarlamak (satırları tarayıp en büyük tutarı bulmak) →
 *     genişlik satır verisine bağlanırdı; `columnDefs` her hücre yazımında
 *     yeniden kurulurdu (t.14 performans kökünün tam tersi).
 * Taban genişlik, kullanıcının DAHA GENİŞ yaptığı sütuna dokunmaz
 * (`Math.max`), yalnız okunamayacak kadar dar olmasını engeller.
 */

/** Hücrenin metne bırakmadığı yer: dolgu 14+14 + kenarlık 1+1 (ölçüldü). */
export const HUCRE_KROMU = 30;

/**
 * Glif ilerlemeleri (px) — pinned GENEL TOPLAM bağlamı: 13px / 800, Alpine'ın
 * sistem yazı yığını, `font-variant-numeric: tabular-nums` (fill-handle.css).
 *
 * ⚠ "tabular-nums yazıyor" DİYE RAKAMLARI EŞİT SAYMA — ölçüldü, çürüdü.
 * `getComputedStyle` `tabular-nums` döndürdüğü hâlde 13px/800'de basamaklar
 * EŞİT DEĞİL: '1' = 6,284 · '4' = 8,068 · diğerleri 7,789 (olc4.mjs). Sebep,
 * bu ağırlıkta kullanılan sistem yüzünün `tnum` özelliğini taşımaması.
 * Çürütücü: `₺7.366.828,10` ile `₺9.568.938,40` AYNI karakter bileşimine
 * sahip ama 88,86 ve 90,64 ölçüldü — ilkinde iki '1' var.
 * Bu yüzden model EN GENİŞ basamağı kullanır; aksi hâlde sütunu DAR keserdi.
 * (11,5px/750 ve 12,5px/750'de basamaklar gerçekten eşit — sorun yalnız 800'de.)
 */
export const GLIF = {
  /** EN GENİŞ basamak ('4', 13px/800). Model üst sınır olsun diye en dar değil. */
  rakam: 8.068,
  /** Binlik noktası ve ondalık virgül — ikisi de aynı ilerlemede ölçüldü. */
  ayrac: 4.158,
  /** ₺ / $ / € — üçü de aynı ilerleme (simge seçimi genişliği DEĞİŞTİRMEZ). */
  simge: 7.789,
  /** Eksi işareti — KÂR satırı zarar yazabilir. */
  isaret: 5.295,
} as const;

/**
 * TR biçimli bir para metninin ÜST SINIR genişliği (px), yukarıdaki bağlamda.
 * Ölçümle karşılaştırıldığında 0 ile 5,6 px arasında ÜSTTEN sapar; ALTTA
 * kalmaz — yönü önemli: eksik sayan bir model sütunu dar keserdi.
 */
export function paraMetniGenisligi(metin: string): number {
  let toplam = 0;
  for (const ch of metin) {
    if (ch === '.' || ch === ',') toplam += GLIF.ayrac;
    else if (ch === '-' || ch === '−') toplam += GLIF.isaret;
    else if (ch >= '0' && ch <= '9') toplam += GLIF.rakam;
    else toplam += GLIF.simge; // ₺ $ € ve benzeri tek simge
  }
  return toplam;
}

/**
 * `tamHane` haneli bir tutarın TAM okunabilmesi için gereken sütun genişliği.
 * Hesaba giren metin: simge + eksi + tam kısım + binlik noktaları + virgül +
 * iki kuruş hanesi. Örnek (tamHane = 9): `₺-123.456.789,00`.
 */
export function paraSutunuEnAz(tamHane: number): number {
  const hane = Math.max(1, Math.trunc(tamHane));
  const binlikAyraci = Math.ceil(hane / 3) - 1;
  const metin = GLIF.simge
    + GLIF.isaret
    + (hane + 2) * GLIF.rakam      // tam kısım + iki kuruş hanesi
    + (binlikAyraci + 1) * GLIF.ayrac; // binlik noktaları + ondalık virgül
  return Math.ceil(metin + HUCRE_KROMU);
}

/**
 * HEDEF: "9 haneli + kuruş + ₺" (görev tanımı) + KÂR satırının eksi işareti.
 * `₺-123.456.789,00` üst sınırı 114,31 px → sütun **145 px**.
 * (Aynı metnin tarayıcıda ÖLÇÜLEN genişliği 110,02 px; aradaki pay modelin
 * en geniş basamağı kullanmasından gelir ve güvenli yöndedir.)
 *
 * ⚠ BİLİNEN SINIR: 10 haneli (milyar TL) bir tutar 157 px ister; oraya
 * yetişmiyoruz. Bilerek: bugün ölçülen en büyük değer 8 haneliydi
 * (₺17.208.977,55) ve her sütunu 12 px daha büyütmek ızgarayı 60 px daha
 * kaydırır. 9 hane = 999.999.999 TL, mekanik tesisat teklifi için geniş pay.
 */
export const PARA_SUTUN_EN_AZ = paraSutunuEnAz(9);

/**
 * Para sütununun uygulanacak genişliği. Kullanıcının kaydettiği (ya da
 * şemadan gelen) değer tabandan genişse AYNEN korunur.
 *
 * ⚠ Başlık tabanı burada DEĞİL — aşağıdaki `baslikSutunuEnAz` genel kuraldır
 * ve para olmayan sütunlara da uygulanır (bkz. `sutunGenisligi`). Eski sürümde
 * burada "Malz. Birim Fiyat"a göre elle yazılmış bir sabit duruyordu; o sabit
 * yalnız PARA sütunlarını koruyordu ve `Malz. Kar %` 5 px kırpılmaya devam
 * ediyordu (1920 px'te ölçüldü).
 */
export function paraSutunGenisligi(istenen: number | null | undefined): number {
  const g = typeof istenen === 'number' && Number.isFinite(istenen) ? istenen : 0;
  return Math.max(g, PARA_SUTUN_EN_AZ);
}

// ════════════════════════════════════════════════════════════════════════════
//  BAŞLIK GENİŞLİĞİ — "sütun kendi başlığından dar kalmasın"
// ════════════════════════════════════════════════════════════════════════════
/**
 * ── KUSUR (1920 px'te gerçek AG Grid ile ölçüldü, 21.09.2026) ───────────────
 * `Malz. Kar %` başlığı kırpılıyordu: sütun 90 px, başlık iç kutusu 60 px,
 * içerik **65 px** → 5 px kesik. `İşç. Kar %` aynı 90 px'te sığıyor, çünkü
 * "İşç." kısa. Yani kusur tek sütunda görünen ama GENEL olan bir eksiklikti:
 * sütun genişliği içeriğe bakıyordu, KENDİ BAŞLIĞINA bakmıyordu.
 *
 * ⚠ ÖLÇÜT NOTU: taşmayı `innerText`te `…` arayarak ölçme — CSS
 * `text-overflow: ellipsis` METNİ DEĞİŞTİRMEZ, yalnız çizimi keser; üç nokta
 * aramak YANLIŞ NEGATİF verir. Ölçüt `scrollWidth - clientWidth`tir.
 *
 * ── ÖLÇÜM ───────────────────────────────────────────────────────────────────
 * `scratchpad/tur-gorunur/olcum/olc5-baslik.mjs`: gerçek `.ag-header-cell`
 * kaskadı kuruldu (11,5px / 750 / `letter-spacing: 0.01em` — fill-handle.css)
 * ve her karakterin ilerlemesi ölçüldü. Başlık kromu **30 px**
 * (`padding: 15px` iki yanda, kenarlık 0) — iki bağımsız ölçüm aynı sayıyı
 * verdi (90 px sütun → 60 px iç kutu).
 *
 * ⚠ BOŞLUK TUZAĞI (iki kez düştüm): `' '.repeat(20)` HTML'de DARALTILIR ve
 * boşluk 0,0000 px ölçülür; `white-space: pre` de CSS'teki `nowrap !important`e
 * yenildi. Ölçüm deseni bu yüzden karakteri HARFLERİN ARASINA koyar
 * (`('a'+ch).repeat(20)` − `'a'.repeat(20)`), böylece art arda boşluk oluşmaz.
 * Yanlış boşluk değeriyle model `Malz. Kar %`i 6,6 px eksik sayıyordu.
 */
export const BASLIK_KROMU = 30;

/** Ölçülen karakter ilerlemeleri (px) — başlık bağlamı 11,5px / 750 / 0.01em. */
export const BASLIK_GLIF: Readonly<Record<string, number>> = {
  '0': 6.7297, '1': 6.7297, '2': 6.7297, '3': 6.7297, '4': 6.7297,
  '5': 6.7297, '6': 6.7297, '7': 6.7297, '8': 6.7297, '9': 6.7297,
  A: 8.2008, B: 7.4883, C: 7.2914, D: 8.5945, E: 6.2359, F: 5.7703, G: 8.2906,
  H: 8.9258, I: 3.7594, J: 5.1297, K: 7.5781, L: 5.9945, M: 11.1211, N: 9.2008,
  O: 8.8359, P: 6.9070, Q: 8.8359, R: 7.6227, S: 6.5617, T: 5.9250, U: 8.4313,
  V: 6.9641, W: 11.2336, X: 7.6508, Y: 6.1133, Z: 7.0953,
  'Ç': 7.2914, 'Ğ': 8.2906, 'İ': 3.7594, 'Ö': 8.8297, 'Ş': 6.5617, 'Ü': 8.4313,
  a: 6.3031, b: 7.1398, c: 5.6352, d: 7.2352, e: 6.3367, f: 4.5234, g: 7.2352,
  h: 7.0391, i: 3.3836, j: 3.3836, k: 6.5445, l: 3.3836, m: 10.6492, n: 7.0727,
  o: 7.0391, p: 7.1398, q: 7.2352, r: 4.6914, s: 5.1742, t: 4.5906, u: 7.0727,
  v: 6.1828, w: 9.2852, x: 6.4664, y: 6.3031, z: 5.6234,
  'ç': 5.6352, 'ğ': 7.2352, 'ı': 3.3836, 'ö': 7.0328, 'ş': 5.1742, 'ü': 7.0727,
  ' ': 3.1234, '.': 3.2320, ',': 3.2320, '%': 10.0875, '/': 5.2141,
  '(': 4.3602, ')': 4.3602, '-': 4.7648, '+': 8.2461, ':': 3.2320,
  '&': 9.8859, '"': 5.7867, "'": 3.4844, '#': 6.9266, '*': 5.3484,
};

/** Tabloda olmayan karakter için yedek: ÖLÇÜLEN EN GENİŞ glif ('W'). */
export const BASLIK_BILINMEYEN_GLIF = 11.2336;

/**
 * KERNING PAYI (px/karakter). Doğrusal toplam bitişik harf çiftlerinin
 * kerningini göremez ve ölçümün ALTINDA kalır — 19 gerçek başlıkta en büyük
 * sapma 0,71 px (17 karakter) = 0,042 px/karakter. Pay bunun iki katı:
 * modelin sütunu DAR kesmesi imkânsız olsun. (Payı 0 yapan bir mutasyon
 * "Malz. Birim Fiyat"ı 1 px dar keser — testle kilitli.)
 */
export const BASLIK_KERNING_PAYI = 0.08;

/**
 * TAVAN. Eski (30.07 öncesi) tekliflerin `columnDefs`i dosyadan gelen uzun
 * başlıklar taşıyabiliyor ("BİRİM FİYAT İŞÇİLİK (TL)" gibi — standart şema
 * belgesi bu sızıntıyı anlatıyor). Böyle bir başlık için sütunu sınırsız
 * genişletmek düzeni bozar; başlığın kırpılması, tablonun bozulmasından iyidir.
 */
export const BASLIK_EN_COK = 200;

/** Başlık metninin ÜST SINIR genişliği (px), başlık bağlamında. */
export function baslikMetniGenisligi(metin: string): number {
  let toplam = 0;
  let adet = 0;
  for (const ch of metin) {
    toplam += BASLIK_GLIF[ch] ?? BASLIK_BILINMEYEN_GLIF;
    adet += 1;
  }
  return toplam + adet * BASLIK_KERNING_PAYI;
}

/** Başlığın TAM okunması için gereken en küçük sütun genişliği (px). */
export function baslikSutunuEnAz(baslik: string | null | undefined): number {
  const s = typeof baslik === 'string' ? baslik.trim() : '';
  if (s === '') return 0;
  return Math.min(BASLIK_EN_COK, Math.ceil(baslikMetniGenisligi(s) + BASLIK_KROMU));
}

/**
 * SÜTUN GENİŞLİĞİ — TEK GİRİŞ NOKTASI (ızgaranın çağırdığı fonksiyon).
 *
 * Üç şeyin en büyüğü:
 *   1. `istenen` — kullanıcının kaydettiği ya da şemadan gelen genişlik
 *      (kullanıcı genişlettiyse ASLA daraltılmaz),
 *   2. para sütunuysa `PARA_SUTUN_EN_AZ` (9 hane + kuruş + simge + eksi),
 *   3. başlığın kendi gerektirdiği genişlik — HER sütun için.
 */
export function sutunGenisligi(
  istenen: number | null | undefined,
  baslik: string | null | undefined,
  paraMi: boolean,
): number {
  const g = typeof istenen === 'number' && Number.isFinite(istenen) ? istenen : 0;
  return Math.max(g, paraMi ? PARA_SUTUN_EN_AZ : 0, baslikSutunuEnAz(baslik));
}
