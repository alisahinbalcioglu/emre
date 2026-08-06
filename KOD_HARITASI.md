# KOD HARİTASI — MetaPriceX

**v1.0 — SINIFLANDIRMA TAM (300/300), DERİN KATMAN KISMİ** · 03.08.2026 · *insan katmanı (üst katman)*

> **Sürüm/ortam bilgisi bu belgede TUTULMAZ** (KL1b kararı). Depo ve canlı sürüm hash'leri iki yerde durursa ikisi de eskir; bu haritada bir kez fiilen eskidiler (01.08'in `9635d43`/`6846423` alıntıları iki tur boyunca yanlış durdu). Tek kaynak: **AÇIK KONULAR PANOSU** (güncel hash'ler orada) + `/api/health` (canlının kendi cevabı). Harita neyin NEREDE olduğunu söyler, neyin NE ZAMAN deploy edildiğini değil.

> Bu belge **elle yazılır**. Altındaki otomatik katman (`KOD_HARITASI_OTOMATIK.md`) koddan üretilir ve yalan söyleyemez. Bu belge ise eskiyebilir — o yüzden bir teste bağlıdır (`npm run test:harita`). Harita eskirse test kırmızı olur.

---

## Bu harita neden var

Bir yenilik ya da hata geldiğinde **nereye bakılacağı** sorusunun cevabını kısaltmak için. Hatayı çözmez, hatayı çözecek kişiyi doğru yerden başlatır.

Bu projede eksikliğinin bedeli dört kez ödendi:

1. Kalem 54’te bir adımın tamamı *“toplam nerede hesaplanıyor”* sorusunu aramakla geçti.
2. *“Toplam kaç ayrı yerde hesaplanıyor?”* sorusunun cevabı **hâlâ yok** — grup E’nin ★ sorusu.
3. `62.043.700` dersi tam olarak bu boşluktan doğdu: tek dosyada doğrulanan toplam, hesabın doğru olduğunun kanıtı sanıldı. Kaç yerde hesaplandığı bilinmiyordu.
4. Bir davranışın **üç ayrı yoldan** tetiklendiği tesadüfen öğrenildi. *“Bir davranış kaç yoldan tetikleniyorsa o kadar assert ister”* kuralına uymanın şartı, kaç yol olduğunu görebilmektir. Harita o kuralın ön koşuludur.

---

## Üç kural

**1 · Boşluk “yok” demek değil, “bakılmadı” demektir.** Haritada ⬜ gördüğün yer, orada kod olmadığı anlamına gelmez; oraya kimsenin bakmadığı anlamına gelir. Panodaki boşluk kuralının aynısı.

**2 · Haritadaki her satır bir İDDİADIR.** *“Toplam şurada hesaplanıyor”* cümlesi, panodaki herhangi bir ölçüt kadar kanıt ister. Kanıtsız satır, kanıtlı satırla aynı görünmez: her satırın yanında **kanıtın nereden geldiği** yazılıdır.

**3 · Harita elle güncel tutulmaz, teste bağlanır.** Bu projede bir sayının iki yerde yazılıp ayrışması **dört kez** oldu. Beşincisi harita olmasın diye: otomatik katmanda görünüp bu belgede karşılığı olmayan dosya, `test:harita`’yı kırmızı yapar. Bekleme listesi (`harita-bekleyenler.txt`) **yalnız kısalır, uzamaz.**

---

## Şu anki dolgunluk

| İşaret | Anlamı | Adet |
|---|---|---|
| ✅ | doğrulandı — dosya biliniyor, ne yaptığı biliniyor | **75** |
| ◑ | kısmen — dosya biliniyor, ne yaptığı tam bilinmiyor | **0** |
| ⬜ | bakılmadı | **1** |
| | **toplam satır** | **76** |

> Sayım 03.08 (HARİTA TAM turu) `grep -c` ile ÖLÇÜLDÜ. Tek ⬜ satırı bir **yokluk kaydıdır**: `tsconfig.build.json` repoda hiç yok (belgeden belgeye kopyalanmış hayalet) — "bakılmadı" değil, "arandı, bulunamadı".
>
> **İki katman ayrı:** bu tablo **derin katmanı** (davranış, `dosya:satır`, kanıt zinciri) sayar. **Sığ katman** ayrıca ve tam: aşağıdaki *TAM SINIFLANDIRMA* bölümünde repodaki **300 kod dosyasının 300'ü** tek cümleyle sınıflandırılmış durumda (`test:harita` bunu her koşumda doğrular).

> Bu harita **çoğunlukla boş ve bu kasıtlı.** İçindeki her dolu satır, bir raporda ya da kanıt zincirinde fiilen geçmiş bir dosyadır. **Tek bir dosya adı tahmin edilerek yazılmadı.** Boş satırları Code oturumu ADIM 0-1 tamirini yaparken dolduracak — ayrı bir proje olarak değil, tamirin yan ürünü olarak.

---

## A · GİRİŞ — dosya yükleme ve okuma

**Kullanıcı ne görür:** “Keşif dosyasını yükle” → dosya seçilir, sayfalar okunur, satırlar ekrana gelir.

**Hata bu grupta şu cümlelerle gelir:** “dosya yüklenmiyor”, “sayfalar eksik geldi”, “satırlar kaymış”, “başlık satırı malzeme gibi gelmiş”

**Durum:** Tamir edildi (ADIM 1a, 02.08 — merge bandı unvanı başlık sanılıyordu; kullanıcı canlıda doğruladı). Eski hâli: "başlık satırları malzeme diye içeri giriyor, malzeme adı sütunu sayfa adı olarak geliyor." **Durum satırları bu haritada bir kez eskidi (KL1b dersi); anlık renk panoda tutulur, burada yalnız hangi dosyanın ne yaptığı yazar.**

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `backend/src/ozellik/giris/excel-grid/excel-grid.controller.ts:12-21` | **Ana Excel yükleme ucu** `POST /excel-grid/prepare` (sabit şema; 15MB, memoryStorage). Çağıranlar: `quotes/new/page.tsx:758` (ana akış) · `:1504` (ikinci çağrı) · `dashboard/page.tsx:76`. | FAZ 2 · HR6 03.08 |
| ✅ | `backend/src/ozellik/giris/excel-engine/excel-engine.controller.ts:14-19` | **PARALEL ikinci Excel ucu** `POST /excel-engine/analyze` — tek çağıranı `dashboard/page.tsx:73`; dashboard AYNI dosyayı `Promise.all` ile İKİ uca birden gönderir (`:72-79`) → her dashboard yüklemesi çift parse. | FAZ 2 · HR6 — "görüldü, dokunulmadı" |
| ✅ | `backend/src/ozellik/giris/ai/ai.controller.ts:14-24` | PDF yükleme ucu `POST /ai/analyze` (Pro paket şartı, 10MB) → LLM içerik çıkarımı. | FAZ 2 · HR6; HS4 okuma |
| ✅ | *(admin içe aktarım uçları)* | Excel'i alan admin uçları: `/admin/brands/:id/import-excel/preview+commit` · `/admin/price-lists/:id/import-excel/*` · `/admin/materials/save-bulk` · `/admin/brands/:id/save-from-sheets` (`admin.controller.ts:92-200`). DWG yüklemesi J grubunun malıdır (`dwg-engine.controller` + python `/upload`), A envanterine girmez. | FAZ 2 · HR6; G/J satırları |
| ✅ | `backend/src/ozellik/giris/excel-grid/excel-grid.service.ts:250` | Excel okuyucu / sayfa ayrıştırıcı (`parseSingleSheet`) — satırların ekrana dönüştüğü yer. Merge yayılımı :271-297 (**tek fiziksel hücre N kolona kopyalanır** — ADIM 1a hatasının hammaddesi buydu). | ADIM 1a ölçümü 02.08 |
| ✅ | `backend/src/ozellik/giris/excel-grid/excel-grid.service.ts:895-1005` | **Başlık SATIRI kararı** (`realHeaderRow`): sözlük kelimesi skorlaması :895-983 (ayrık-metin sayımı + band eleme + altında-sayısal-veri şartı) + kelimesiz başlık geri-düşüşü :984+ (ilk sayısal satırın hemen üstü; üç sigortalı). | ADIM 1a — AKHİSAR İCMAL canlı bulgusu; 83 sayfa önce/sonra kıyası: 3 değişim (3'ü kazanım), 80 birebir |
| ✅ | `backend/src/ozellik/giris/excel-grid/excel-grid.service.ts:630-647` | **Sütun eşleme** (rol desenleri: no/name/quantity/unit/fiyatlar) + içerik-tabanlı doğrulama R-B/KG6 :697+ (başlık yanıltıcıysa VERİ otorite). | KD12(b) · TF suite · ADIM 1a |
| ✅ | `backend/src/ozellik/giris/excel-grid/standart-sema.ts:251` | Başlık **ETİKET SATIRI** ayıklama (KD12a: Excel'in kendi başlık satırı veri sayılmaz, `baslikEtiketiSatiriMi`). | KD12(a), kalem 55 |

**Bu grubun cevapsız soruları:**

- Başlık satırı kararı kaç ayrı yerde veriliyor? — **CEVAPLANDI (ADIM 1a, 02.08): ÜÇ yerde.** (1) satır seçimi `excel-grid.service.ts:895-1005`, (2) etiket-satırı ayıklama `standart-sema.ts:251`, (3) seçici görünümü `frontend/ozellik/giris/kaynak-kolon.ts`. Üçü ayrı katman: hangi satır başlık / hangi satır veri değil / kutuda ne yazar.
- “Malzeme adı = sayfa adı” hatası okuyucudan mı, sütun eşlemesinden mi geliyor? — **KISMEN CEVAPLANDI (02.08): iki ayrı vaka var.** (a) KARTEPE tipi: dosyanın KENDİ başlık hücresi bölüm adını taşıyor (`No | YANGIN POMPA ODASI | Miktar`) — program dosyaya sadık, hata değil (KD12b kararı). (b) AKHİSAR tipi: merge'lü ünvan bandı yanlış SATIR seçtiriyordu — okuyucu hatasıydı, ADIM 1a düzeltti (KD12 e/f mühürlü).

## B · TABLO — ekranda gördüğün grid

**Kullanıcı ne görür:** Satırların düzenlendiği, hücrelerin elle değiştirildiği, sürükle-doldur yapılan ana ekran.

**Hata bu grupta şu cümlelerle gelir:** “hücre değişmiyor”, “sürükleyince yanlış doluyor”, “aday listesi açılmıyor”

**Durum:** Bu projenin en çok kanıtı olan grubu. İki kök neden burada dosya:satır olarak bulundu.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx` | Ana tablo bileşeni — ekrandaki grid | KD5 kanıt zinciri; kalem 34; GOREV_Kapatma_Turu |
| ✅ | `frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx:645` | Sürükleme tutamağı — commit 44babd1 (PU4c) bu satıra dokundu | Panel kalem 34 + KD5 |
| ✅ | `frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx:285` | Çarpma şablonu — ÇALIŞAN örnek (İşç. Toplam bunun sayesinde doluyor) | Code raporu, ADIM 0 §2 |
| ✅ | `frontend/ozellik/tablo/excel-grid/aday-ayirt-edicilik.ts:18-174` | **Adı yanıltıcı: hangi adayın gösterileceğine karar VERMEZ** (hepsi gösterilir) — her adayın yanına konacak *ayırt edici metni* hesaplar. Adları ` · `/`\|`/2+ boşlukla bileşenlere ayırır; TÜM adaylarda geçen bileşen elenir, kalan fark etiket olur. Çağıranlar: `ExcelGrid.tsx:205`/`:214` (popup genişliği) · `:685` (aday etiketleri) · `:1192` (nitelik bağlamı). | HARİTA TAM turu 03.08 |
| ✅ | `backend/src/ozellik/giris/excel-grid/standart-sema.ts:19-330` | Sabit 13 kolonluk şemaya dönüştürücü — dosyadan yalnız 4 alan taşınır (No · Malzeme Adı · Miktar · Birim), dosyanın MARKA sütunu tamamen atılır, fiyat rolleri bağlıysa hücre değerleri sabit alanlara kopyalanır. Çağıran: `excel-grid.service.ts:218` (`fixedSchema ? standartlastir(parsed) : parsed`). | HARİTA TAM turu 03.08 |
| ✅ | `frontend/ozellik/tablo/excel-grid/useFillHandle.tsx:88-270` → `ExcelGrid.tsx:1750-1913` → `fill-down.ts:141-275` | **Sürükle-doldur ÜÇ katman:** (1) JEST — hücrenin alt 10px'inden sürükleme/çift tık, iş kuralı bilmez, yalnız hedef satırları bildirir; (2) YÖNLENDİRİCİ `handleFillComplete` — alana göre 6 dal; (3) MANTIK `fill-down.ts` — `_marka`/`_firma` dallarını koşar (her satır kendi çapıyla motora yeniden sorulur, hiçbir satır sessiz kalmaz) **+ kar% aritmetiği `karYayilimi`** (P2-1a, 03.08: eskiden `ExcelGrid.tsx` içinde satır içiydi ve mühürlü formülleri HİÇ çağırmıyordu — ham çarpım + `toFixed(2)`; net 3.019,2 · kar %10 · miktar 3'te aynı sütuna 9.963,36 yazıyordu, doğrusu 9.963,6). **İskonto dalı hâlâ satır içi** (`applyDiscountBulk`). AG-Grid'in kendi fill özelliği KULLANILMIYOR (grep: 0). | HARİTA TAM turu 03.08 · P2-1a 03.08 (`kar-yayilimi.test.ts` kapısı) |
| ✅ | `frontend/ozellik/giris/kaynak-kolon.ts` | **“Malzeme Adı sütunu” seçicisinin etiketi** — tek kaynak. Gerçek başlık varsa YALNIZ başlık; başlık yoksa (`headerName === field`) örnek değer ipucu olarak kalır. | Canlı bulgu 02.08 (kutuda `MALZEME ADI — ör: 2000 GPM…` yazıyordu) · `d14856f` |
| ✅ | `frontend/lib/kaynak-kolon.test.ts` | Yukarıdakinin mührü — İKİ aile: başlığı olan dosya (yalnız başlık) ve başlığı olmayan dosya (örnek kalır). | vitest 5 assert · eski davranış geri konunca **4'ü kırmızı** (ölçüldü) |
| ✅ | `frontend/app/(protected)/quotes/new/page.tsx:1565` | Seçiciyi çizen yer — artık kendi dizesini kurmuyor, `kaynakKolonEtiketi()` çağırıyor. | `d14856f` |

**Bu grubun cevapsız soruları:**

- `standart-sema.ts` tam yolu ne? Backend’de mi, frontend’de mi, ikisinde de kopyası var mı? — **CEVAPLANDI (HR1c, 02.08): `backend/src/ozellik/giris/excel-grid/standart-sema.ts`, tek kopya.**

## C · EŞLEŞTİRME — malzeme adını kütüphaneyle eşleme

**Kullanıcı ne görür:** Yazdığın malzeme adının kütüphanedeki ürüne bağlanması; marka/varyant seçimi.

**Hata bu grupta şu cümlelerle gelir:** “yanlış ürünü buldu”, “marka gelmedi”, “aday çıkmıyor”, “siyah boru eşleşmiyor”

**Durum:** Bir davranış ÜÇ ayrı yoldan tetikleniyor (A otomatik eşleşme · B elle marka seçimi · C üçüncü yol). Bunu tesadüfen öğrendik. Haritanın en çok işe yarayacağı yer burası.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `backend/src/ozellik/eslestirme/matching/matching.service.ts:92-101` | Eşleştirme servisi — aday havuzu YALNIZ `UserLibrary(userId, brandId)`'den kurulur, global fallback YOK. `hazirlaPool` :140-203 üç durum: gerçek indeks / bayat→bellekte tazele / indekssiz→istek anında `manuelUrunIndeksle` (:158-168). `⛔ MARKA INDEKSLENMEMIS` uyarısı :197-201. | KALEM 58 keşfi 02.08 — okuma + nokta-teyit |
| ✅ | `backend/src/ozellik/eslestirme/matching/index/query-engine.ts:59-597` | **Skor YOK — sert filtre zinciri, üç sonuç (single/ask/none).** Gerçek yürütme sırası: ürün-değil :61 → sözlüğün tükettiği kelimeler ayıklanır :66-68 → `belirsiz` elenir :74 → **aile/adSlug sert kilit** → sizeClass → **cins :280 → bağlantı :310 → ÇAP :331** → boy → birim. Yardımcılar: `ayrisanKolon:38-49` · `resolveLineClass:30-35` · `birimKanonik:604-611` · `urunVariantTags:618-631`. ⚠ **Haritanın önceki sırası YANLIŞTI** (çapı cins/bağlantıdan önce gösteriyordu); yorumlardaki "2./3./4." numaraları da yürütme sırasını yansıtmıyor. | HARİTA TAM turu 03.08 — tam okundu |
| ✅ | `backend/src/ozellik/eslestirme/matching/index/product-index.ts:368-374` | Ürün indeksi üretici — `buildRowKey` = sha1_16(sheetKey · adBucket · cinsNorm · baglantiNorm · capNorm · boyTag · kod); FİYATTAN ve sourceRow'dan bağımsız. `buildProductIndex` :380-454, `rebuildIndexFields` :472-481 (rowKey bilerek dışarıda). Kimlik `@@unique([priceListId, rowKey])` → aynı dosya yeniden yüklenince UPDATE, id korunur, kullanıcının iskontosu yaşar. | KALEM 58 keşfi 02.08 — okuma + nokta-teyit |
| ✅ | `backend/prisma/schema.prisma` | **Tüm modeller haritalandı:** `User:37-51` · `EslesmeHafizasi:57-68` · `TerminologyAlias:74-98` · `BrandMaterialType:102-116` · `UserBrandLibrary:120-132` · `UserSubscription:134-147` · `Brand:149-160` · `PriceList` · `Material/MaterialPrice:258-306` · `ProductIndex:189-256` · `UserLibrary:308-355` · `Quote:357-396` (çok sayfalı grid ham durumu + orijinal dosya binary'si + teklif no/rev + kayıt anındaki kur) · `QuoteItem` · `Labor*` · `QuoteFormat/QuoteExport`. Kritik: `@@map` şemada **0** (SQL adları tırnaklı, büyük-küçük duyarlı) · Quote→user Cascade, formatId SetNull. | HARİTA TAM turu 03.08 |
| ✅ | `backend/src/ozellik/eslestirme/matching/index/types.ts:43-154` | Motorun **iç sözleşmesi** (dış tip başka dosyada): `LineQuery:43-69` (ham metin + ürün-değil bayrağı + **sert kilit aile slug'ı**; null = aile çözülemedi → her zaman soru) · `FamilyVocab:72-76` · `RoutedTokens:79-90` · `AskColumn:95` · `NoneReason:97-104` · `QueryOutcome:111-129` · `QueryOpts`. | HARİTA TAM turu 03.08 |
| ✅ | `frontend/app/(protected)/quotes/new/page.tsx:1067` | **YOL A — otomatik toplu eşleştirme:** sayfadaki tüm adlar tek `POST /matching/bulk-match` çağrısıyla (SemanticCache MISS akışı). | FAZ 2 · HR7 03.08 |
| ✅ | `frontend/app/(protected)/quotes/new/page.tsx:1817` | **YOL B — elle marka seçimi (tek satır):** `onBrandChange` → tek adlı `bulk-match` (variantTags + birim ipucuyla); ExcelGrid marka dropdown'ı buradan geçer, fiyat yazımı `ExcelGrid.tsx:278`. | FAZ 2 · HR7 |
| ✅ | `frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx:1791-1795` → `fill-down.ts:197` | **YOL C — toplu doldurma (sürükle/grup):** `fillDown(motor=onBrandChange)` — motoru YOL B'nin fonksiyonudur; satır satır aynı uca gider. Dördüncü tetik: teklif geri yüklemede yeniden eşleşme (`quotes/new:525`). | FAZ 2 · HR7 |

**Bu grubun cevapsız soruları:**

- Üç yol tek bir ortak fonksiyona mı giriyor, yoksa üç ayrı kopya mı var? — **CEVAPLANDI (FAZ 2 · HR7, 03.08): TEK ORTAK ÇEKİRDEK, kopya yok.** Üç yol da `POST /matching/bulk-match` → `bulkMatch` (`matching.service.ts:74`) → `matchV2` (:300) → **`runQuery` (`query-engine.ts:59`)**. `runQuery`'nin backend'deki TÜM çağrıları: `matching.service.ts:390` (ana) · `:453` (marka alternatifleri) · `:639` (işçilik alternatifleri) — grep+okumayla sayıldı. İşçilik de aynı çekirdek: `labor-matching.service.ts:30-55` yalnız sahiplik kontrolü yapıp `bulkMatchLabor` (:508) üzerinden AYNI `matchV2`'ye iner. Hafıza (`EslesmeHafizasi`) kısa devre DEĞİL: `hafizaOnSecim` (:741-828) yalnız multi sonuçta, motorun kendi aday listesi İÇİNDE ön-seçim yapar; yazımı `remember` (:859-889, çağıran `ExcelGrid.tsx:492`). Frontend'te de B ve C aynı fonksiyonu (`onBrandChange`) paylaşır.
- ★ Eşleştirme kuralları kaç dosyada yazılı? — **CEVAPLANDI (HARİTA TAM turu, 03.08): 13 DOSYA.** `ad-cins-sozlugu.ts:20-115` (sözlük verisi) · `ad-resolver.ts:12-46` (en-uzun-desen çözümü) · `conversion.ts:42-394` (çap denklik tabloları) · `normalizer.ts:52-657` (regex çıkarım aileleri — çap/yüzey/bağlantı/PN/vana…) · `shared-tag-matcher.ts:18-163` (etiket kümeleri + gösterim) · `tag-generator.ts:38-160` (v1 serbest-metin etiketleyici) · `terminology.service.ts` (alias/öğrenme) · `index/line-parser.ts` · `index/vocab.ts` · `index/product-index.ts:380-454` (v2 kolon-tabanlı indeksleyici) · `index/query-engine.ts:59-597` (sert filtre zinciri) · `index/outcome-mapper.ts` (fiyat/aday sözleşmesi) · `matching.service.ts` (havuz + hafıza). **Sonucu:** bir kuralın davranışını değiştirmek genelde **2-3 dosyaya birden** dokunmayı gerektirir (ör. yeni aile = sözlük + shared-tag kümesi + `INDEX_VERSION` artışı).
- Legacy `productIndexId=NULL` satırı sonradan indekse bağlayan bir yol var mı? — **CEVAPLANDI (KALEM 58, 02.08): YOK.** Kütüphaneye yazan tek dosya `library.service.ts`; dört oluşturma yolundan ikisi bağlar (manuel marka :196-201 · indeksten aktarım :443-444), ikisi NULL doğurur (POST /library :75-87 · legacy import :351-360); güncelleme yolları `productIndexId`'ye hiç dokunmaz; `importFromIndex` mevcutları YALNIZ `productIndexId` ile eşlediği için (:437-439) NULL'ları göremez — liste indekslendikten sonra tekrar aktarım, bağ kurmak yerine KOPYA satır yaratır.

## D · FİYAT — birim fiyat, iskonto, para birimi

**Kullanıcı ne görür:** Eşleşen ürünün fiyatının gelmesi; iskonto uygulanması; USD/EUR → TL çevrimi.

**Hata bu grupta şu cümlelerle gelir:** “fiyat gelmedi”, “iskonto işlemedi”, “dolar kuru yanlış”, “fiyat biçimi bozuk”

**Durum:** Birim fiyatlar CANLIDA GELİYOR (PANOVA ekran görüntüsü, 01.08). Sorun fiyatın gelmesinde değil, gelen fiyatın toplama girmemesinde — bkz. grup E.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `admin.controller.ts:126-200` → `admin.service.ts:489-1130` + `utils/import-fidelity.ts:22-305` | **Fiyat listesi içe aktarma — İKİ FAZLI:** önce dosya bellekte ayrıştırılır ve **hiçbir şey yazılmaz** (önizleme: kolon haritası + TR sayı ayrıştırma + para birimi etiketi + sapma işareti + "nokta binlik mi ondalık mı" tek sorusu); admin onaylayınca yazılır (liste bulunur/açılır, eski kalemler silinip baştan yazılır; her satır Material → MaterialPrice → ProductIndex zincirine gider). ⚠ **KUSUR:** ikinci yol `saveMaterialsFromSheets` (`:1134-1319`) yalnız `materialPrice.upsert` yapıyor, **ProductIndex YAZMIYOR** → o yoldan gelen marka indekssiz kalır. | HARİTA TAM turu 03.08 |
| ✅ | `library.controller.ts:52-98` → `library.service.ts:241-277, 592-644` | **İskonto DÖRT ayrı uçtan yazılır:** tek satır · marka bazlı toplu · seçili kimlik listesine toplu (sürükle-doldur) · grid'in kirli satırlarını kaydeden yol (bu sonuncusu oranı 0-100'e sıkıştırır). **Net fiyat DB'ye HİÇ yazılmaz** — her gösterimde tek formülden üretilir (`liste × (1 − oran/100)`, yukarı 1 hane). | HARİTA TAM turu 03.08 |
| ✅ | `exchange-rates.service.ts:39-134` · `matching.service.ts:57-68,116` · `outcome-mapper.ts:49-54` · `use-currency.ts` | **Çevrim DÖRT ayrı yerde, her biri farklı aşamada:** (1) içe aktarımda çevrim **YOK** (para birimi yalnız etiket, fiyat kaynak biriminde saklanır) · (2) **TABAN:** eşleştirme anında dövizli satırlar TCMB kuruyla TL'ye çevrilir (kur istek başına en fazla bir kez, yalnız dövizli satır varsa) · (3) **GÖSTERİM:** ekranın seçtiği birimde, yalnız görüntü · (4) çıktı/persist. ✅ **BEŞİNCİ NOKTA KALDIRILDI (P2-3, 03.08):** `admin.service.saveBulkMaterials` ve **ikizi** `labor-firms.service.saveBulkPrices` `exchangeRate` parametresi alıp fiyatı **DB'ye çevrilmiş** yazıyordu (kuralın tam tersi; para birimi orijinal etiketiyle kaldığı için teklif anında `buildTryConverter` bir kez daha çarpıyordu = **çift çevrim**). Hiçbir canlı çağıran değer geçmiyordu → çalışma zamanı davranışı değişmedi, kaldırılan bir **tuzaktı**. Çevrim artık yalnız yukarıdaki dört noktada. | HARİTA TAM turu 03.08 · P2-3 03.08 |
| ✅ | `frontend/ozellik/fiyat/pricing.ts:81-86` (merkezi) + 8 yerel biçimleyici | **Tek biçimleyici YOK — en az ÜÇ aile ve ÇELİŞİYORLAR:** merkezi `paraBicim` **1 ondalık** ("3.019,2"), diğer tüm FE biçimleyicileri ve Excel `numFmt`'ları **2 ondalık** ("3.019,20") → aynı değer gridde ve çıktıda farklı yazılır. TL sembolü ve binlik ayracı da ekseninde ayrışıyor. | HARİTA TAM turu 03.08 — "görüldü, dokunulmadı" |
| ✅ | `backend/src/ozellik/fiyat/matching/pricing.ts:1-36` | Fiyat çekirdeğinin **BE yarısı** (tamamı 36 satır): `yukariYuvarla` (1 ondalık, 1e-9 epsilonla ikili artık taşması engellenir, −0 normalize) · `clamp` · `hesaplaNetFiyat`. **Satış (kar) ve satır toplamı BURADA YOK** (22.07 kararı) — dışarıya yalnız yuvarlama yardımcısı ödünç verilir (çağıranlar: `outcome-mapper:15,53` · `matching.service:22,470,652` · `quotes.service:21` KL P1-b sonrası). | HARİTA TAM turu 03.08 |
| ✅ | `backend/src/ozellik/fiyat/matching/index/outcome-mapper.ts:1-254` | **Motorun tek çıkış kapısı:** iç sonucu dış sözleşmeye çevirir ve *"fiyat yalnız tek-eşleşme/oto-varyant dalından çıkar"* kuralını **yapısal olarak** dayatır — diğer tüm dallar sıfır fiyatla döner. Aday listesinde her adaya: görünür ad (boy ekli), net/liste/iskonto üçlüsü, sorulan kolona göre etiket, varyant kimliği, nitelik uyarısı. | HARİTA TAM turu 03.08 |

**Bu grubun cevapsız soruları:**

- Şahinkul dosyasında USD/EUR satırı var mıydı? — **CEVAPLANDI (HARİTA TAM turu, 03.08): HAYIR.** İki dosya da (`test-fixtures/e2e/FIRMA-A KEŞİF ÖZETİ…xlsx` 6 sayfa/594 satır + `test-fixtures/regression/SAHINKUL-bilinen-yanlis-cikti.xlsx`) **baştan sona TL**; şemada PARA BİRİMİ kolonu hiç açılmamış, para birimi yalnız sayfa sonu toplam başlığında metin olarak beyan ediliyor. **Yani sorunun kendi şüphesi doğruydu: 15b kontrolü döviz yolunu hiç ölçmemiş.** Döviz çevrimi bugün yalnız birim testleri ve KD9 kur ölçütüyle korunuyor — gerçek dosyalı kanıtı yok.

## E · TOPLAM — satır toplamı ve genel toplam

**Kullanıcı ne görür:** Miktar × birim fiyat = satır toplamı; satır toplamları = genel toplam.

**Hata bu grupta şu cümlelerle gelir:** “toplam ₺0 çıkıyor”, “fiyatlar geldi ama toplam gelmedi”, “genel toplam boş”

**Durum:** Tamir edildi (kalem 54 KD11, 01-02.08: içe aktarma tamamlaması + toplu doldurma geneli); "ŞU AN KIRMIZI" tarihe karıştı. FAZ 2 (03.08) ★ soruyu ölçtü — aşağıda.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `frontend/ozellik/fiyat/pricing.ts:53-55` | **TEK FORMÜL** `hesaplaSatirToplam(satış, miktar)` — satır toplamının tek kaynağı; 11 çağrı noktası (★ listesinde). `toplamlariTamamla` :129-176 içe aktarmada boş toplamları bu formülle doldurur (Yol A tamiri; çağıran `quotes/new/page.tsx:350`). | FAZ 2 · HR5 03.08 — tüm çağrılar grep+okumayla sayıldı |
| ✅ | `standart-sema.ts:227-229` | Malzeme/işçilik toplam sütunlarını dosyadan YALNIZ KOPYALAR (hesap yok — bilinçli: müşterinin verisi üstündür); eksikler `toplamlariTamamla` ile içe aktarmada tamamlanır. | FAZ 2 · HR5; KD11 kök neden belgesi |
| ✅ | `frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx:2362-2393` | `recalcGrand` — satır düzeyi Genel Toplam (matTop+labTop) 1/4: hücre değişim olaylarında. Diğer üç uygulama: `pricing.ts:165-171` (içe aktarma) · `fill-down.ts:77-94` (toplu doldurma; ⚠ inline yuvarlama epsilonsuz) · `standart-cikti.ts:186` (çıktı satırı). | FAZ 2 · HR5 |
| ✅ | `frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx:1942-1999` | `updatePinnedBottom` — ekranın altındaki GENEL TOPLAM satırı: tüm veri satırlarının mat/lab/genel toplamı; `_ozet` satırları HARİÇ (62.043.700 dersinin kuralı burada yaşıyor). | FAZ 2 · HR5 |
| ✅ | `backend/src/ozellik/teklif/quotes/quotes.service.ts:44-56` | ⚠ KAYIT yolu toplamları — TEK FORMÜLÜ KULLANMAZ: `matUp×(1+margin)×qty` yuvarlamasız; DB'deki QuoteItem toplamları ekrandan sapabilir. Liste sayfası `quotes/page.tsx:33` bu DB değerlerini toplar. | FAZ 2 · HR5 — "görüldü, dokunulmadı" |
| ✅ | `backend/test/standart-sema-test.ts` | 62.043.700 testi — TEK dosyanın toplamını doğruluyor, toplam özelliğini değil. Silinmeyecek, yanına ikincisi konacak. | GOREV_Kapatma_Turu; kalem 38 |

**Bu grubun cevapsız soruları:**

- ★ TOPLAM KAÇ AYRI YERDE HESAPLANIYOR? — **CEVAPLANDI (FAZ 2 · HR5, 03.08): 21 ayrı yerde.** 11'i tek formülün (`pricing.ts:53`) çağrıları: `ExcelGrid.tsx` :278 · :941 · :2408 · :2430 · :2449 · :2460 · :2476 · :2488, `fill-down.ts:225`, `pricing.ts:155+160`, `quotes/new:534`. 10'u bağımsız aritmetik: `recalcGrand:2362` · `pricing.ts:165-171` · `genelToplamiTazele fill-down:77-94` · `standart-cikti.ts:186` (satır geneli) · `updatePinnedBottom:1942` · `standart-cikti.ts:165-209` (sayfa toplamı, DEĞER) · `format-engine.ts:288-289` (İCMAL değerleri) + `export-engine.ts:184-197` (İCMAL canlı SUM formülleri) · `format-engine.ts:295+311` (KDV değer+formül) · `quotes.service.ts:44-56` (kayıt, yuvarlamasız) · `quotes/page.tsx:33` (liste). Test/öz-denetim tarafı ayrı: `verify.mjs`, `kd11`, `standart-sema-test`, `export-engine:321-324`, `quotes.service:343`. Tam kanıt: `docs/RAPOR_FAZ2_Derin_Sorular.md`.
- İşçilik toplamı neden çalışıyor da malzeme toplamı çalışmıyor? — **CEVAPLANDI (FAZ 2 · HR5b): bugün İKİSİ DE AYNI kodu kullanıyor** (simetrik çiftler: :278/:941 · :2408/:2430 · :2449/:2460 · :2476/:2488 · `pricing.ts:155/:160`). 01.08'deki "işçilik çalışıyor" görüntüsü hesap değil KOPYAydı (dosyada İşç. Toplam sütunu vardı — `standart-sema:229`); malzeme sütunu olmayan dosyalarda çarpma hiç yoktu. Tamir iki tarafı da tek formüle bağladı; dosyadan gelen dolu hücreye bugün de dokunulmaz.

## F · ÇIKTI — teklif dosyası üretimi

**Kullanıcı ne görür:** “Teklifi indir” → Excel/PDF dosyası iner.

**Hata bu grupta şu cümlelerle gelir:** “çıktıda kolon fazla”, “veri kayboldu”, “iki kere indirince bozuluyor”, “çap sembolü bozuk”

**Durum:** Çıktının YAPISI yeşil, ama yapının doğru olması içinin dolu olduğu anlamına gelmiyor: boş bir toplam sütunu da doğru yapıda çıkar.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `backend/src/ozellik/teklif/quotes/standart-cikti.ts:1-288` | Müşterinin şablonuna yazmak yerine **sıfırdan sabit 9 kolonluk tablo üreten TEK yazıcı**: sayfayı workbook'a döker, sayfa toplamlarını üst fonksiyona bildirir; üst fonksiyon tüm sayfaları dolaşıp sonuna genel-toplam sayfası + görünür self-check özeti ekler. Özet sayfaların satırları yazılır ama teklif geneline **girmez**. Çağıranlar: `quotes.service.ts:390` (export-priced) · `export-engine.ts:332`. | HARİTA TAM turu 03.08 |
| ✅ | `backend/src/ozellik/cikti/utils/xlsx-to-pdf.ts:18-45` | **Teklif PDF'i ÜRETMİYOR** (o özellik 24.07'de kullanıcı kararıyla kaldırıldı; `quotes.controller.ts:38-40,106-108` silinen rotaları not ediyor). Yaşayan tek kullanım: yüklenmiş teklif **FORMATI** dosyasını headless LibreOffice ile PDF'e çevirip **ekranda önizleme** (`quote-formats.service.ts:142-146` → `controller:53-62` → `quote-formats/page.tsx:151`); inline gösterilir, **indirilemez**. Her çağrı kendi geçici LibreOffice profilini kullanır, 60sn timeout, kurulu değilse `null` → uç 404 → arayüz sessizce hücre görünümüne düşer. ⚠ Windows yerelde `soffice` yok → bu yol yerelde **hiç ölçülemez**, yalnız sunucuda anlaşılır. | HARİTA TAM turu 03.08 |
| ✅ | `teklif_ciktisi_mockup.html` | ÜRÜNDE DEĞİL — benim çalışma dosyam, referans mockup | 13.833 bayt, 20.07 |

**Bu grubun cevapsız soruları:**

- Çıktıdaki toplam sütunu, ekrandaki toplamı mı yazıyor, kendi hesabını mı yapıyor? — **CEVAPLANDI (FAZ 2 · HR5, 03.08): KENDİ HESABINI YAPIYOR.** Satır geneli çıktıda yeniden toplanır (`standart-cikti.ts:186` matTot+labTot); sayfa altı SAYFA TOPLAMI değer olarak yazılır (`:165-209`, EX3/EX4: formül değil DEĞER); İCMAL ise CANLI formül taşır (`export-engine.ts:184-197` SUM parçaları + `format-engine.ts:311` KDV formülü, T7 sözleşmesi `export-engine.ts:32`) — yani indirilen dosya Excel'de kendi kendini yeniden hesaplar. ★ sayısındaki 21'in 5'i bu çıktı katmanındadır.

## G · KÜTÜPHANE ve YÖNETİM

**Kullanıcı ne görür:** Kendi malzeme/işçilik kütüphaneni kurma, liste ekleme, fiyat listesi yükleme, yönetim ekranları.

**Hata bu grupta şu cümlelerle gelir:** “listeye eklenmiyor”, “kaydetmiyor”, “kütüphaneye aktarılmadı”

**Durum:** Bu grupta canlı doğrulama yapılmadı.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `GET /api/admin/stats` — `admin.controller.ts:13-23` → `admin.service.ts:191-302` | Admin rolüne kilitli **tek çağrıyla panonun tüm sayıları**: beş ham sayaç · önceki aya göre yüzde değişimler · bu ay teklif oluşturan ayrık kullanıcı oranı · son 30 günün günlük teklif serisi (boş günler sıfırla doldurulmuş) · kütüphanede kullanılan markaların disiplin dağılımı · kütüphaneye en çok aktarılan ilk beş marka. Tüketici: `frontend/ozellik/kutuphane/admin-stats.ts` + `app/admin/stats/page.tsx`. | HARİTA TAM turu 03.08 |
| ✅ | `/api/quotes/*` — `quotes.controller.ts:1-144` | **On uç:** dosya ön-ayrıştırma · oluşturma · listeleme · detay · silme · kapak bilgisi yaması · **iki ayrı çıktı yolu** (teklif formatına basar → **rev artar + arşivlenir**; standart fiyatlı Excel → rev artmaz, arşivlenmez) · revizyon arşivi. Davranış: `quotes.service.ts:30-421`. | HARİTA TAM turu 03.08 |
| ✅ | `backend/src/ozellik/kutuphane/library/library.service.ts` | Kütüphaneye (UserLibrary) yazan TEK dosya (grep + okuma ile teyit). Dört oluşturma yolu: `create` :63-88 (POST /library — productIndexId NULL doğar) · `createManualBrand` :105-239 (indeks kurup bağlar :196-201) · `importPriceList` legacy dalı :285-408 (NULL doğar :351-360) · `importFromIndex` :427-518 (bağlar :443-444; mevcutları YALNIZ productIndexId ile eşler :437-439). Güncelleme yolları productIndexId'ye dokunmaz. | KALEM 58 keşfi 02.08 — okuma + nokta-teyit |
| ✅ | `backend/src/ozellik/kutuphane/library/library.controller.ts:1-109` | **13 uç, tek denetleyici**; sınıf düzeyinde JWT mührü (`:15-16`) ve her metot kullanıcı kimliğini `@CurrentUser()`'dan alıp servise **ilk argüman** geçirir — yani kullanıcı izolasyonu uç düzeyinde değil, **servis imzasında** taşınır. Denetleyicide iş mantığı yok; karşılıkları `library.service.ts:23-644`. | HARİTA TAM turu 03.08 |
| ✅ | `backend/src/ozellik/kutuphane/library/dto/create-library-item.dto.ts` | Manuel tek-satır ekleme DTO'su (tamamı okundu): `listPrice` alanı VAR ama service kullanmıyor; `productIndexId` alanı YOK. | KALEM 58 keşfi 02.08 |
| ✅ | `backend/src/ozellik/kutuphane/admin/admin.service.ts` | **Dört bölüm, dosyada şeritlerle ayrılmış:** `USERS :100-187` (8 fonksiyon: listeleme + rol/durum/tier güncelleme, önce varlık doğrulaması) · `STATS :189-302` · `AI TASKS/HEALTH :304-421` · `SETTINGS :423-448`. İçe aktarım/indeks: `commitImportCore :743-802` → `saveBulkMaterials :856-1130` (çift yazım MaterialPrice + ProductIndex upsert :1068-1072 · `removed` = MaterialPrice deleteMany :917-918 · bayat indeks bilerek SİLİNMEZ :1085-1095) · `reindexProducts :1379-1438` · ⚠ `saveMaterialsFromSheets :1134-1319` **ProductIndex yazmaz** (kusur). | KALEM 58 + HARİTA TAM turu 03.08 |
| ✅ | `backend/src/ozellik/kutuphane/admin/admin.controller.ts:13-200` | **Admin uçlarının tamamı:** `stats :13-23` · kullanıcı yönetimi (liste/rol/durum/tier) · AI görevleri+sağlık · ayarlar · içe aktarım hattı `:126-200` (marka ve fiyat listesi için `import-excel/preview`+`commit` · `materials/save-bulk` · legacy `save-from-sheets` · `reindex-products :95-98`). Tümü `admin.service.ts`'in dört bölümüne karşılık gelir. | HARİTA TAM turu 03.08 |
| ✅ | `tag-generator.ts:38-160` (v1) + `index/product-index.ts:380-454` (v2) | **İKİ etiketleyici, ikisi de canlı.** **v1 — serbest metinden:** müşterinin yapılandırılmamış satırından regex + sözlükle çap/yüzey/bağlantı/cins/et kalınlığı/standart/PN/ekipman nitelikleri çıkarır; regex aileyi çözemezse sözlüğe düşer (en uzun desen kazanır), o da çözemezse vana yuvası etiketi varsa vanaya terfi eder (somun/cıvata/vida/rakor korumasıyla), boru olup cins yoksa varsayılan çelik. **v2 — kolondan:** kütüphane ürününü **metinden tahmin ETMEZ**, 11 kolondan okur; çap denkliklerini (DN65 ≡ 2½") yazma anında bir kez hesaplar; ad çözülemezse ürünün kendi adını aile kimliği yapar. **Canlı eşleştirmenin okuduğu kaynak v2'dir**; v1 artık yalnız hafıza parmak izi + içe aktarım önizlemesi üretir. Yardımcılar: `ad-resolver.ts:12-47` · `ad-cins-sozlugu.ts` · `shared-tag-matcher.ts:18-164` (kümeler+gösterim, motor DEĞİL) · `utils/etiket-display.ts:39-69` (3-Etiket gösterimi). ⚠ `PRD_Kutuphane_Etiketleme_Motoru` **belgesi repoda YOK** (arandı) — kod tarafı tam, belge tarafı yok. | HARİTA TAM turu 03.08 |

## H · TESTLER — neyin doğru olduğunu İDDİA EDEN kod

**Kullanıcı ne görür:** Kullanıcı görmez. Ama bu projede en çok yanıltan katman burası oldu.

**Hata bu grupta şu cümlelerle gelir:** “testler yeşil ama üründe hata var”

**Durum:** KURAL: yeşil bir takım 🟡’dır, 🟢 değil. 🟢 için emre’nin canlı testi gerekir. Bu projedeki BEŞ gerçek ürün hatasının BEŞİ de bu katmanın dışında bulundu.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `e2e-golden/helpers.ts:139` | Popup kabı arayıcı — DOM’un ŞEKLİNE bakıyordu, iki farklı durumu tek değere eziyordu. DÜZELTİLDİ (KD5). Projenin en iyi kanıt zinciri. | Panel kalem 50 + KD5 |
| ✅ | `frontend/test/e2e-golden/firma-a-golden.spec.ts` | Eski kırmızı (`:239`) — çözüldü. ⚠ **Dosya ADI DEĞİŞTİ:** `sahinkul-golden.spec.ts` → `firma-a-golden.spec.ts`, `5d3c30b` (fixture anonimleştirme). Harita eski adı taşımaya devam ediyordu; **haritanın ters-yön kapısı 03.08'de bunu ilk koşumunda yakaladı.** Eski `:239` satır numarası artık boş satıra düşüyor — yeniden adlandırmayla numaralar kaydı, o yüzden satır referansı kaldırıldı. | GOREV_Kapanis_Devam_2 · ters-yön kapısı 03.08 |
| ✅ | `frontend/test/e2e-golden/firma-a-golden.spec.ts:362-422` | KG13 — USD/işçilik tek kur ölçütü. Panel "hâlâ kırmızı" diyor; **bu turda KOŞULMADI, doğrulanmadı.** Eski harita bunu `:394` diye gösteriyordu, o satır bugün bir yorum parçası. | Panel kalem 51 · konum 03.08'de düzeltildi |
| ✅ | `frontend/test/e2e-golden/golden.spec.ts:161` | 17a’nın repodaki TEK izi — ve o da bir YORUM SATIRI. Yorum kod değildir. | Panel satır 17 |
| ✅ | `frontend/test/e2e-golden/bolum-f-kabul.spec.ts:1-194` | Tek uçtan uca senaryo: gerçek tarayıcıda **11 sayfalık** gerçek dosya yüklenir → her sekmede sabit 13 kolon doğrulanır → dosyadan gelen fiyatların ekrana düştüğü ölçülür → bir hücreye kar% girilip toplamın **anında** değiştiği görülür → her sayfada iki toplam kolonu taranır → teklif kaydedilip yeniden açılır. Koşum: `run.mjs` + `playwright.golden.config.ts` (sunucu + fixture ister). | HARİTA TAM turu 03.08 |
| ✅ | `frontend/ozellik/tablo/excel-grid/aday-ayirt-edicilik.test.ts:1-177` | **3 sözleşme kümesi · 16 test · 29 assert:** (1) nitelik bağlamı — çap kendi satırında değil ALTINDAKİ nitelik satırlarındaysa sorguya girmeli (basınç/bağlantı da toplanır, toplama bir sonda durur); (2) ayırt edici metin seçimi; (3) veri sorunu işaretleri. Mühürlediği kod: `aday-ayirt-edicilik.ts:74-91, 113-138, 145-174`. | HARİTA TAM turu 03.08 |
| ✅ | `backend/test/regression-all.ts` | SUITES listesi — package.json’daki her test:* burada olmalı (PK1) | GOREV_Sirada |
| ✅ | `backend/test/matching-regression.ts` | `test:regression:db` — ÇAYIROVA (id :27 hardcoded) gerçek-DB uçtan uca eşleştirme: 10 vaka, 9'unda beklenen netPrice. Ön koşul kapısı :158-172 (ProductIndex=0 → çıkış 2 SKIP). AÇIK SORU :153-157 kapatılmadı: istek-anında-indeksle geri-düşüşü 116 satırı indeksliyor ama 0 eşleşme veriyor. | KALEM 58 keşfi 02.08 — okuma + nokta-teyit |
| ✅ | `backend/test/kl-kayit-toplami-test.ts` | **KL P1-b mührü** — kaydedilen toplamın ekrandakiyle aynı olduğunu 5 assert'le sınar (K1 malzeme · K2 işçilik · K3 satır · K4 birim şişmez · K5 FE toplamı korunur). Sahte prisma, DB istemez. Kırmızı-önce ölçüldü: tamir öncesi **0 PASS · 5 FAIL** (kar %10'da ₺34,95 fazla). | KL · ADIM 2, 03.08 |
| ✅ | `backend/test/pk9-sessiz-indeks-test.ts` | PK9 sözleşmesi — "geri-düşüş tek başına yeter mi? CEVAP: HAYIR": indekssiz satır warn kanalından, markanın tamamı indekssizse INDEKSLENMEMIS uyarısı (mock prisma, DB istemez). | KALEM 58 keşfi 02.08 |
| ✅ | `package.json` | 13 bilinen test scripti: test:tam · test:regression · test:e2e-golden · test:of · test:library · test:ke · test:admin-import · test:perf · test:kb · test:gs · test:ex · test:export · test:sahte | Belgelerden sayıldı — repoda kaç tane olduğu doğrulanmadı |
| ✅ | `scripts/harita-uret.mjs` | Haritanın **otomatik alt katmanını** üretir (`git ls-files` → dosya+satır, import bağlılıkları, uç noktalar, gerçek `test:*` listesi). Yorum içermez. `--agac` kipi dizin ağacı basar. | HR1 · komut çıkışı 0: 295 kod dosyası · 59.651 satır · 124 uç · 33 test:* |
| ✅ | `scripts/harita-denetle.mjs` | **Harita denetim kapısı** (`npm run test:harita`). Kod dosyası ne haritada ne bekleyenlerde ise, bekleyenler uzadıysa ya da bekleyenlerde artık var olmayan dosya varsa **çıkış 1**. | HR3-RET: sahte dosyayla **çıkış 1**, silinince **çıkış 0** — ret yolu ateşlendiği görüldü |
| ✅ | `scripts/klasor-denetle.mjs` | **Klasör↔grup disiplin kapısı** (`npm run test:klasor`, ADIM 6 · 04.08). `test:harita` dosyanın haritada ANILDIĞINI denetler, DOĞRU KLASÖRDE olduğunu denetlemez — 155 dosya taşındıktan sonra kapısız düzen bir turluktur. İki kural: **(1) ALAN KÖKÜ** — her kod dosyası ilan edilmiş bir kökün altında (04.08 akşamı **330/330**, 39 kökten oluşan KAPALI liste; `ozellik/` ve `components/` toptan değil ALT ALAN ilan edilir, yoksa `ozellik/yeni-alan/` sessizce geçerdi); **(2) GRUP↔YOL** — haritanın TAM SINIFLANDIRMA bölümünde X grubunda yazan dosya X'in yolunda (04.08 akşamı **262 ölçülür**; 31'i `frontend/app/**` çerçeve bağlı olduğu için atlanır, 37 dosya tabloda yok). Ayrıca hayalet istisna, istisna çırçırı ve çift sınıflandırma reddedilir. Çıkış: 0 · 1 = RET · 2 = ön koşul yok/ölçüt boşa düştü. | ADIM 6 — dört yol ateşlendi: KURAL 1 (BE+FE ayrı), KURAL 2 (G→fiyat, C→kütüphane), ölçüt bozulması **çıkış 2**, çırçır ayrı depoda 1→2 **çıkış 1** |
| ✅ | `klasor-duzeni.txt` | Klasör disiplininin **iddia metni** — alan kökleri, grup↔yol eşlemesi, çerçeve bağlı önek (`frontend/app/`) ve 10 gerekçeli istisna. Betiğin içine gömülmedi: `harita-kapsam-disi.txt` ile aynı gerekçe. İstisnaların 8'i `docs/RAPOR_Klasor_Tasima_2026-08-04.md` §6'daki bilinçli sapmalara birebir oturuyor. | ADIM 6 · 04.08 — ölçümle türetildi, tahminle değil |
| ✅ | `harita-kapsam-disi.txt` | Kapsam tanımı — hangi uzantı kod sayılır, hangi yol dışarıda. Betiğin **içine gömülmedi**: bu bir iddiadır, görünür durmalı. Her desen gerekçeli. | HR1 · `## 5 · Kapsam disi` tablosu |
| ✅ | `harita-bekleyenler.txt` | Haritada karşılığı olmayan dosyaların **borç listesi**. HR4 cırcırı: yalnız kısalır. | HR4 kasten tetiklendi: 283→284 yapılınca **çıkış 1**, geri alınınca **çıkış 0** |

**Bu grubun cevapsız soruları:**

- ~~package.json’da gerçekten 13 test scripti mi var, daha fazla mı?~~ **CEVAPLANDI (HR1b, 02.08.2026): 33.** Fark +20 (+23 / −3). Belgede olup repoda olmayan: `test:ke` · `test:kb` · `test:sahte`. Sayı belgeden değil, artık `package.json`’dan üretiliyor (`KOD_HARITASI_OTOMATIK.md` §4).

## I · DERLEME ve CANLIYA ÇIKIŞ

**Kullanıcı ne görür:** Kullanıcı görmez — ama görmediği için bu projede beş tur kaybedildi.

**Hata bu grupta şu cümlelerle gelir:** “deploy ettim ama değişmedi”, “canlıdaki sürüm eski”

**Durum:** Makasın açık/kapalı olduğu bu belgede YAZMAZ — hash alıntıları burada iki tur boyunca eskidi (KL1b). Güncel depo/canlı sürümü için: panonun başlığı + `/api/health` (canlının kendi cevabı) + `/surum.json` (FE). Bu grubun işi *makasın hangi dosyalarla ölçüldüğüdür*, makasın anlık değeri değil.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `scripts/deploy.sh` | Dağıtım betiği. Tekrar-deneme yolu ateşlendi (502 → deneme 1/10 → DOĞRULANDI). RET yolu (çıkış kodu 1) HİÇ ateşlenmedi — KD8 açık. Ateşlendiği görülmemiş kapı, kapı değildir. | Panel kalem 53 + KD8 |
| ✅ | `scripts/backup.sh` | Yedekleme — sunucudaki kopyası eski bir commit’teydi | Panel |
| ✅ | `scripts/jwt-secret-kur.sh` | Sunucu `.env`'ine rastgele JWT imza anahtarı ekler (48 karakter, openssl/urandom); **zaten varsa dokunmaz** (idempotent — mevcut anahtarı değiştirmek tüm oturumları boşuna kapatırdı); `.env`'i zaman damgalı yedekler, anahtarı ekrana yazmaz. deploy.sh deseni: özel karakterler dosyada, konsola düz satır. | KL · ADIM 1 ön koşulu, 03.08 — üç yolu da yerelde ateşlendi (2 · 0 · idempotent 0) |
| ✅ | `scripts/fk-dogrula.sh` | `UserLibrary` üzerindeki her FK'nin **ON DELETE** kuralını DB'nin kendi kataloğundan (`pg_constraint`) okur — şemada ne yazdığı değil, veritabanında fiilen ne olduğu (bu projede `prisma/migrations` DRIFT ETMİŞ, şema `db push` ile yönetiliyor, migration kanıt sayılmaz). B-1 düzeltmesinin canlıya gerçekten indiğini doğrular: `productIndexId` → SET NULL bekleniyor, CASCADE görürse `db push` tutmamıştır. deploy.sh deseni: özel karakterler dosyada durur, konsola düz satır yazılır. Çıkış: 0 = koruma yerinde · 1 = CASCADE (push tutmamış) · 2 = kısıt bulunamadı/ölçüt şüpheli | B-1 · 04.08 — konsol `"` `(` `)` `?` `_` yazamadığı için üç ölçüm üst üste bozuldu, ölçüm betiğe taşındı |
| ✅ | `scripts/kb5-olcu.sh` | KALEM 58 salt-okuma ölçüm betiği (deploy.sh deseni: özel karakterler dosyada durur, konsola düz satır yazılır). Dört sayıyı tek sorguda döner; BEGIN READ ONLY + ROLLBACK; bağlantı yolu = backup servisinin her gün çalışan yolu (backup.sh:7 ikizi). Çıkış: 0 = ölçüm · 2 = ön koşul yok · diğer = hata. | KALEM 58 · KB2-KB4 02.08 — yerelde 0 ve 2 yolları ateşlendi |
| ✅ | `scripts/s45-olcu.sh` | S4+S5 salt-okuma ölçüm betiği (kb5-olcu.sh deseni). **Dürüstlük notu betiğin içinde**: S4/S5'in gerçek kazancı yerel veride ÖLÇÜLEMEZ (kategori kaynaklı aile 25/2010 = %1,2 ve hiçbiri 'boru' değil; PVC/PP ürün yok) — fixture davranışı kanıtlar, BÜYÜKLÜĞÜ yalnız canlı ölçer. Beş kırılım: aileZayif sayısı + PAYDA · zayıf ailelerin dağılımı · frenin fiilen kestiği küme (aileZayif ∧ çapsız) · malzeme etiketi dağılımı · sözlükteki `kinds` doluluğu. Ön koşul kapısı: yeni iki kolon yoksa AÇIKÇA söyler ve durur ("0 çıktı" ile "ölçülemedi" karışmasın). BEGIN READ ONLY + ROLLBACK. İkinci mod `dokum`: yerel PostgreSQL'den ürün dökümü üretir (`backend/test/s45-olcum.ts` onu okur). Çıkış: 0 = ölçüm · 2 = ön koşul yok | S4+S5 · 06.08 — yerelde `dokum` ve `docker yok` yolları ateşlendi |
| ✅ | `scripts/geri-yukle.sh` | **Veritabanı geri yükleme betiği** (04.08). Anlatım: `docs/GERI_YUKLEME.md`. Betik olmak ZORUNDA: geri yüklemenin kalbi `gzip -dc ... \| psql ...` borusudur ve Hetzner konsolu `\|` yazamaz — prosedürün en kritik komutu elle yazılamaz. Yedi adım, her biri durabilir: (1) yedeğin gzip bütünlüğü + **dump SONU işareti** — yarım yedekle iş başlamaz; (2) mevcut sayıları gösterip elle `EVET` ister; (3) **can simidi** — geri yüklemeden önce mevcut durumun DOĞRULANMIŞ yedeği, alınamazsa hiç başlanmaz; (4) backend/frontend durur; (5) DB yeniden oluşur (önce `pg_terminate_backend`, yoksa DROP takılır); (6) `ON_ERROR_STOP=1` ile yükleme — hata olursa can simidinin adını yazar; (7) sayılarla doğrular, servisleri başlatır. Çıkış: 0 · 1 = yükleme başarısız · 2 = ön koşul yok/onay verilmedi · 3 = trap. | 04.08 — **dokuz yol** ateşlendi: docker yok · liste kipi · dosya yok · bozuk gzip · yarım dump · onay verilmedi · can simidi alınamadı · yükleme hatası · tam başarılı yol. ⚠ Gerçek konteynerle uçtan uca KOŞMADI (yerelde docker yok) |
| ✅ | `scripts/kalem59-olcu.sh` | **KALEM 59 canlı ölçüm betiği** (salt-okuma). Ölçüt `admin.service.ts:1023-1030`'dan çıkarıldı, uydurulmadı: `sourcePriceListId` dolu + `productIndexId` NULL — yani "bugün herhangi bir fiyat listesi yeniden yüklenirse öksüz kalacak satırların tamamı". Koda **tek ekleme** var, işaretli: kod yalnız `discountRate` sayar, betik `customPrice`'ı da ayrı sütunda sayar (ikisi de geri üretilemez kullanıcı verisi). **PAYDA ve KIRILIM zorunlu**: toplam satır · listeye bağlı satır · öksüz · öksüzlerden iskontolu/özel fiyatlı/ikisinin birleşimi · KULLANICI ve MARKA kırılımı. "Öksüz 0" tek başına kanıt sayılmaz — payda boşsa betik yeşil demez. Çıkış: 0 = ölçüm yapıldı · 2 = ön koşul yok/ölçüt boşa düştü · diğer = hata. | KALEM 59 · 04.08 — yerelde **beş yol** ateşlendi: gerçek ölçüm (117/59, çıkış 0) · öksüz 0 + payda dolu (çıkış 0) · tablo boş (2) · listeye bağlı 0 (2) · bağlantı yok (2) |
| ✅ | `docker-compose.yml` | Tek sunucu yığını: caddy + frontend + backend + dwg-engine + db (postgres:16, :16-29) + backup (:113-126, günlük pg_dump). DB kimlikleri .env'den (:20-22, :119-122); backend DATABASE_URL :64. | KALEM 58 · KB1 02.08 |
| ✅ | `setup_env.sh` | Ortam kurulumu — izlenmeyen dosya olarak duruyor (?? setup_env.sh) | CANLI_DOGRULAMA_LISTESI |
| ✅ | `nest-cli.json:6` | Giriş dosyası ayarı — tsconfig.json:17 ile çelişince MODULE_NOT_FOUND üretti. Düzeltildi, ama TEKRARINI ENGELLEYEN HİÇBİR ŞEY YOK. | Panel kalem 47 + PK12b |
| ✅ | `backend/tsconfig.json:17` | Yukarıdakinin çelişen tarafı | Panel kalem 47 |
| ⬜ | ~~`tsconfig.build.json`~~ | **REPODA YOK** — ne diskte ne de geçmişte (arandı). Derleyici zinciri tek yapılandırmayla çalışıyor: `backend/tsconfig.json:1-37` + `nest-cli.json:1-8` + `package.json:6` (`nest build`). Bu satır haritanın kendi hayaletiydi; belgeden belgeye kopyalanmış. | HARİTA TAM turu 03.08 — bulunamadı, uydurulmadı |
| ✅ | `.github/workflows/regression.yml:1-37` | **CI artık TEK iş.** Tetik: master'a push VE master'a PR. ubuntu-latest + node 20 + npm önbelleği. Sunucu işi: checkout → `npm ci --legacy-peer-deps` → `npx prisma generate` → `npx tsc --noEmit` → **`npm run test:regression`**. ⚠ Haritanın eski notu ("fixture'lar repoda yok, CI ölçemiyor") **ARTIK GEÇERSİZ** — PK3 turunda 20 fixture repoya alındı; CI fiilen ölçüyor. ⚠ İkinci iş `keep-alive.yml` 04.08.2026'da **SİLİNDİ**: Render free-tier uyku sorununu çözmek için vardı, oysa dağıtım Hetzner'da `docker compose` ile yapılıyor (`scripts/deploy.sh`) ve DWG motoru compose servisi olarak `http://dwg-engine:10000` adresinde koşuyor — ping'lediği iki `onrender.com` adresi hizmet yolunda değildi. | HARİTA TAM turu 03.08 · keep-alive notu 04.08 |
| ✅ | `.gitignore:51` | `*.xlsx` — CI fixture deliğinin sebebi | Panel kalem 36 |
| ✅ | `/api/health` | build_sha döndürür — canlıdaki sürümün tek doğrudan kanıtı | Panel kalem 40, kapandı |

**Bu grubun cevapsız soruları:**

- nest-cli.json ↔ tsconfig.json çelişkisinin tekrarını engelleyen bir test var mı? — **CEVAPLANDI (HARİTA TAM turu, 03.08): DOĞRUDAN koruma YOK** (`backend/test/`'in 39 girdisi tarandı). İki yapılandırmanın tutarlılığını (giriş dosyası · kaynak kökü · çıktı dizini) karşılaştıran hiçbir kapı yok. Var olan tek koruma **nedeni değil SONUCU** ölçüyor: `backend/scripts/derleme-kapisi.js:41-65` (postbuild kancası, `package.json:48`) derleme sonrası `dist`'teki `.js` sayısını, `dist/main.js` varlığını ve `.js/.ts` oranının %80 eşiğini kontrol edip ihlalde **çıkış 3** verir. İki boşluk: (a) çelişki *dolu ama yanlış* bir `dist` üretirse yakalanmaz; (b) kapı yalnız `npm run build` koşunca ateşlenir — **CI'da koşmuyor** (CI `tsc --noEmit` + `test:regression` koşar). `tam-zincir.ts:53-67` aynı kapıyı ön koşul olarak çağırır ama o zincir regresyon paketinin içinde değil.

---

## Ürün kodu OLMAYAN dosyalar

Karıştırılmasın diye ayrı duruyor.

| Dosya | Ne | Nereden |
|---|---|---|
| `dogrula.py` | Fiyat listesi dönüşüm doğrulaması — BENİM betiğim, üründe değil | DEVIR_Fiyat_Listesi_Donusum_Talimati |
| `teklif_ciktisi_mockup.html` | Teklif çıktısı mockup — BENİM dosyam, üründe değil | çalışma dizininde doğrudan görüldü, 13.833 bayt, 20.07 |
| `Mekanik_Malzeme_AD_CINS_Sozlugu.xlsx` | Malzeme sözlüğü — veri, kod değil | 13.07 |

---

---

## TAM SINIFLANDIRMA — sığ katman (HS turu, 03.08.2026)

> **Ne bu:** HS1-HS12 turunun çıktısı — bekleyenler listesindeki **269 dosyanın TAMAMI okunarak** tek satırla sınıflandırıldı, liste sıfırlandı (269 → 0). Buradaki satırlar SIĞ iddialardır ("bu dosya ne işi yapıyor, hangi alanın malı"); üstteki grup bölümleri kanıt zincirli DERİN katmandır. Her satırın okunan aralığı + karar veren sembolleri `docs/RAPOR_HS_Harita_Siniflandirma.md`'de kayıtlıdır. Şema HS3'te donduruldu (A-M); adından tahminle yazılmış TEK satır yoktur.
>
> **HS3'te ilan edilen dört yeni grup:**
> **J · DWG-METRAJ** — ikinci ürün hattı: DWG/DXF yükleme-dönüşüm (Python motoru), çizim görüntüleme, tıkla-etiketle çap atama, boru segmentasyon/topoloji, metraj ve Excel'e metraj ihracı.
> **K · ORTAK UI, KABUK ve İSTEMCİ** — uygulama geneli arayüz primitifleri (ui/*), genel hook'lar, merkezi HTTP+auth istemcisi, layout/navigasyon, kabuk sayfaları (login/register/profil/dashboard), context'ler.
> **L · ÇEKİRDEK BACKEND ALTYAPISI** — auth guard/strategy/decorator/DTO, Prisma bağlantı katmanı, NestJS modül kablolaması (`*.module.ts`, `app.module`, `main.ts`), yetki/rol/tier kapıları.
> **M · TEKLİF YAŞAM DÖNGÜSÜ** — teklifin kaydı/listelenmesi/detayı; üretim hattı (A-F) teklifi KURAR, M kurulanı SAKLAR ve yeniden açar.
>
> **E (TOPLAM) bu listede boş** — dürüst boşluk: toplam hesabı, zaten derin katmanda kayıtlı `standart-sema.ts:191-195`'te yaşıyor; bekleyenler evreninde E'ye düşen dosya çıkmadı.

### A · GİRİŞ — 7 dosya

| Dosya | Ne yapıyor |
|---|---|
| `backend/src/ozellik/giris/ai/ai.controller.ts` | Pro paket sartiyla PDF dosyasi alip AI icerik cikarimina (analyze) yonlendiren endpoint |
| `backend/src/ozellik/giris/ai/ai.service.ts` | PDF/Excel içeriğinden LLM'lerle malzeme satırları ve sütun rolleri çıkarır |
| `backend/src/ozellik/giris/excel-engine/excel-engine.controller.ts` | Yuklenen Excel dosyasini JWT korumali tek uc uzerinden analiz servisine iletir |
| `backend/src/ozellik/giris/excel-engine/excel-engine.service.ts` | Excel'i okuyup Gemini ile header satiri ve kolon rollerini tespit eder, satirlari objeye cevirir |
| `backend/src/ozellik/giris/excel-grid/excel-grid.controller.ts` | Yuklenen Excel'i sabit-sema grid verisine hazirlayan tek POST ucunu sunar |
| `backend/src/ozellik/giris/excel-grid/excel-grid.service.ts` | Yüklenen xlsx'i sayfa sayfa ayrıştırıp kolon rollerini içerikten tespit eder |
| `backend/src/ozellik/giris/excel-grid/sheet-discipline.ts` | Sayfa adi ve ornek satir metninden mekanik/elektrik disiplinini anahtar kelime skoruyla tahmin eder |

### B · TABLO — 11 dosya

| Dosya | Ne yapıyor |
|---|---|
| `frontend/app/(protected)/quotes/new/error.tsx` | Teklif olusturma rotasinda yakalanan hatayi mesaj ve stack ile gosterir, tekrar dene sunar |
| `frontend/app/(protected)/quotes/new/page.tsx` | Teklif oluşturma akışının tamamını tek sayfada yürüten orkestratör (çok gruba dokunur, evi B) |
| `frontend/ozellik/tablo/excel-grid/CustomDropdown.tsx` | Grid hucrelerinde marka/firma secimi icin aranabilir, portal'la cizilen ozel acilir liste |
| `frontend/ozellik/tablo/excel-grid/fill-down.ts` | Surukle-doldur hedeflerini eslestirme motoruyla tek tek sorgular; fiyat/durum yazar, toplamlari tazeler, geri-alma anligi uretir |
| `frontend/ozellik/tablo/excel-grid/SheetTabs.tsx` | Alt sayfa sekmeleri: aktif sayfa secimi, disiplin (mekanik/elektrik) toggle'i ve eslesme sayaci rozetleri |
| `frontend/ozellik/tablo/excel-grid/types.ts` | Grid kolon tanımı, satır meta alanları, kolon rolleri, aday/marka tipleri |
| `frontend/ozellik/tablo/excel-grid/oneri-cekince.ts` | Oneri kutusunun kesinlik/onay karari (saf) — aday cekince tasiyorsa kutu "var" demez, "onaylayin" der; gerekce metni buradan uretilir. Iki cizim yeri de bu tek kaynaktan okur |
| `frontend/ozellik/tablo/excel-grid/useFillHandle.tsx` | AG-Grid Community icin DOM-seviyesi doldurma tutamaci: alt kenardan surukleme, canli sayac rozeti, cift-tik aile doldurma |
| `frontend/ozellik/tablo/quotes/ColumnManagerPanel.tsx` | Sutun gizle/goster paneli: kilitli sutun korumasi, kat isaretleme (MIK toplami) ve kalici sutun kaldirma |
| `frontend/ozellik/tablo/disiplin.ts` | Sekme adindan mekanik/elektrik disiplinini tahmin eden hafif fallback; tespit yoksa null |
| `frontend/ozellik/tablo/merge-multisheet.ts` | Yeni yuklenen Excel'i mevcut grid durumuyla satir/sheet bazinda birlestirir; kullanici girdilerini ve ozel sutunlari korur |
| `frontend/ozellik/tablo/parse-material-text.ts` | "Ø110 PVC BORU" gibi metni regex desenleriyle cap ve cins olarak ayirir, gerekirse geri birlestirir |

### C · EŞLEŞTİRME — 19 dosya

| Dosya | Ne yapıyor |
|---|---|
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.controller.ts` | Iscilik kalemleri icin toplu esleme, secim hafizasi, reindex ve admin backfill uclarini sunar |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.service.ts` | Firma sahipligini dogrulayip iscilik eslemeyi ortak eslesme motoruna delege eder |
| `backend/src/ozellik/eslestirme/matching/ad-cins-sozlugu.ts` | Malzeme ailesi slug'lari, es anlamli desenler ve cins yuvalarini iceren seed sozluk verisi |
| `backend/src/ozellik/eslestirme/matching/ad-resolver.ts` | Normalize metinde en uzun sozluk desenini bulup malzeme ailesi slug'ini cozer |
| `backend/src/ozellik/eslestirme/matching/conversion.ts` | Çelik/plastik borularda DN-inç-mm çap eşdeğerlerini tablolarla çevirir |
| `backend/src/ozellik/eslestirme/matching/index/line-parser.ts` | Serbest teklif satiri metnini aile, cap/boy, birim sinyali ve yonlendirilmis token sorgusuna cevirir |
| `backend/src/ozellik/eslestirme/matching/index/vocab.ts` | Aile+marka indeksindeki urun token'larindan ad/cins/baglanti kelime dagarcigi kurar |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | Malzeme toplu esleme, secim hafizasi, indeks sagligi ve terminoloji alias CRUD uclarini sunar |
| `backend/src/ozellik/eslestirme/matching/normalizer.ts` | Türkçe/unicode metni normalleştirir; satırdan çap, yüzey, bağlantı, PN etiketleri çıkarır |
| `backend/src/ozellik/eslestirme/matching/shared-tag-matcher.ts` | Yuzey/cins/baglanti/tip tag kumeleri, etiket gorunum adlari ve nitelik-tag yardimcilarini saglar |
| `backend/src/ozellik/eslestirme/matching/tag-generator.ts` | Malzeme adindan regex/lookup ile cap, yuzey, cins, baglanti, standart ve nitelik tag'leri uretir |
| `backend/src/ozellik/eslestirme/matching/terminology.service.ts` | Takma adları malzeme ailesine çevirir; kullanıcı alias'larını öğrenip saklar |
| `backend/src/ozellik/eslestirme/matching/types.ts` | Esleme sonucu, aday, marka alternatifi ve tag'lenmis malzeme arayuz tanimlarini tasir |
| `backend/src/ozellik/eslestirme/utils/build-material-context.ts` | Grid satirlarindan ust grup basligini bulup tam malzeme adini kurar; cap tutarsizliginda guvenli tarafta sadece satir adini doner |
| `backend/src/ozellik/eslestirme/utils/etiket-display.ts` | Serbest metinden AD/CINS/CAP etiket gosterimlerini eslestirme motoru tag'leriyle turetir; admin AD duzeltmesini dogrular |
| `frontend/lib/indeks-sagligi.ts` | `GET /matching/index-health` sayilarindan hangi indeks rozetinin cizilecegine karar verir (saf fonksiyon): bayat = eski surumlu indeks (yavas), indekssiz = urun indeksine HIC bagli olmayan satir (sonuc urun tablosu kalitesinde degil). Cizen yer `quotes/new/page.tsx:1614` |
| `frontend/lib/silme-onay-metni.ts` | Silme onayinda gosterilecek baslik/aciklamayi uretir (saf fonksiyon). Backend `etki` alanina gore IKI AYRI metin: marka → "SİLİNECEK … geri getirilemez", fiyat listesi → "SİLİNMEZ … bağı kopar … korunur". Etki hesaplanamazsa sayi UYDURMAZ, "hesaplanamadı" yazar ve `bilgilendirilmisOnay: false` doner — sayfalar o durumda onay parametresi gondermez, backend 409'u ikinci savunma olarak devreye girer. Cagiran yerler `admin/brands/page.tsx` (marka + liste) ve `materials/[brandId]/page.tsx` (liste) |
| `frontend/lib/silme-etkisi-getir.ts` | Silme etkisi ucunu cagiran ince sarmal; hata/bicimsiz yanitta `null` doner (sayim bir KOLAYLIK, silmenin on kosulu degil — asil koruma backend'in 409'u). Saf metin fonksiyonu ag bagimliligindan uzak kalsin diye ayri dosya |
| `frontend/ozellik/tablo/excel-grid/build-material-context.ts` | Eslestirme sorgusu icin satirin olcu ifadesi tasiyip tasimadigini ve baslik baglami gerekip gerekmedigini belirler |

### D · FİYAT — 5 dosya

| Dosya | Ne yapıyor |
|---|---|
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.controller.ts` | Canli kuru guard'siz public GET ucu olarak sunar |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.service.ts` | TCMB XML'den USD/EUR kuru ceker; er-api fallback, 1 saatlik cache, thundering-herd korumasi |
| `frontend/ozellik/tablo/excel-grid/discount-utils.ts` | Iskonto yuzdesini 0-100'e sabitler, TR bicimli/%'li girisi ve cok satirli Excel yapistirmasini sayiya cevirir |
| `frontend/ozellik/fiyat/use-currency.ts` | TRY bazli fiyatlari canli TCMB kuruyla USD/EUR'a ceviren ve bicimleyen para birimi hook'u |
| `frontend/ozellik/fiyat/pricing.ts` | Iskonto→net, kar→satis, yukari-1-hane yuvarlama, para birimi gosterim bicimi ve etkin miktar kurallarinin tek kaynagi |

### E · TOPLAM — bu turda satır düşmedi

### F · ÇIKTI — 7 dosya

| Dosya | Ne yapıyor |
|---|---|
| `backend/src/ozellik/cikti/quote-formats/format-engine.ts` | Kullanici teklif sablonunda {{yer_tutucu}} tarar, ornek format uretir ve sayfayi grid verisine cevirir |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | Teklif format sablonlarinin yukleme, listeleme, onizleme (xlsx/pdf), guncelleme ve silme uclarini sunar |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.service.ts` | Kullanicinin teklif sablonlarini yukler/tarar/onizler; varsayilan secimi, PDF onizleme ve ornek dosya uretir |
| `backend/src/ozellik/teklif/quotes/export-engine.ts` | Format workbook'unu taban alip fiyatlanmis liste sayfalarini yerlestirerek profesyonel Excel ciktisi kurar; birim bicimi ve self-check uygular |
| `backend/src/ozellik/cikti/utils/xlsx-to-pdf.ts` | Excel'i LibreOffice headless ile birebir baski gorunumlu PDF'e cevirir; soffice yoksa/timeout'ta null doner |
| `frontend/app/(protected)/quote-formats/page.tsx` | Kalici teklif format sablonlarini yukleme, yer tutucu tarama onizlemesi, varsayilan yapma ve silme yonetimi |
| `frontend/ozellik/cikti/export-download.ts` | Iki export ucunu cagirip blob'u dosya olarak indirtir; self-check ozet/uyari toast'larini gosterir |

### G · KÜTÜPHANE ve YÖNETİM — 43 dosya

| Dosya | Ne yapıyor |
|---|---|
| `backend/src/bootstrap.controller.ts` | BOOTSTRAP_SECRET env aktifken mevcut kullaniciyi tek seferlik admin/suite'e yukselten endpoint |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | Marka listeleme/arama, fiyat listesi malzemeleri ve admin'e ozel marka CRUD uclarini sunar |
| `backend/src/ozellik/kutuphane/brands/brands.service.ts` | Marka CRUD, fiyat listesi/havuz malzemesi listeleme ve global malzeme arama saglar. `markaSilmeEtkisi` silme ONCESI kutuphane kaybini sayar (`etki: 'satir-silinir'` — burada satirlar GERCEKTEN olur); `remove` ayni sayimi kullanip ekonomi tasiyan satir varsa onaysiz silmeyi 409 ile durdurur |
| `backend/src/ozellik/kutuphane/silme-etkisi.ts` | Iki silme yolunun ORTAK semasi + `etki` ayrimi: marka silme satirlari OLDURUR (`satir-silinir`), fiyat listesi silme B'den sonra yalniz BAGI KOPARIR (`bag-kopar`, satir ve iskonto yasar). "Ekonomi tasiyan satir" tanimi (`EKONOMI_TASIYAN`) burada TEK yerde durur — sayim ucu, 409 mesaji ve ekran metni ayrisamasin diye |
| `backend/src/ozellik/kutuphane/brands/dto/create-brand.dto.ts` | Marka olusturma/guncelleme girdisini dogrular (ad, logo, disiplin) |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | Iscilik firmasi CRUD, fiyat listesi/kalem toplu kayit, sheet saklama ve Excel parse uclari |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.service.ts` | Kullanıcının işçilik firmalarını ve fiyat listelerini sahiplik kontrolüyle yönetir |
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | Genel iscilik kalemi CRUD uclarini Pro tier kosuluyla sunar |
| `backend/src/ozellik/kutuphane/labor/labor.service.ts` | Iscilik kalemi CRUD'u yapar; ada gore iscilik esleme yardimcisi da icerir |
| `backend/src/ozellik/kutuphane/library/dto/bulk-discount.dto.ts` | Marka bazli toplu iskonto orani girdisini dogrular (0-100) |
| `backend/src/ozellik/kutuphane/library/dto/bulk-update-items.dto.ts` | Secili kutuphane kalemlerine toplu iskonto uygulama girdisini dogrular |
| `backend/src/ozellik/kutuphane/library/dto/create-manual-brand.dto.ts` | Elle marka olusturma satirlarini 11-kolon ProductIndex semasiyla dogrular (1-5000 satir) |
| `backend/src/ozellik/kutuphane/library/dto/import-price-list.dto.ts` | Fiyat listesini kullanici kutuphanesine aktarma istegini dogrular (marka+liste id) |
| `backend/src/ozellik/kutuphane/library/dto/update-library-item.dto.ts` | Kutuphane kalemi guncelleme alanlarini (fiyat, iskonto, spec, kategori) dogrular |
| `backend/src/ozellik/kutuphane/library/library-sheet-builder.ts` | Kutuphane kalemlerinden kategori-bantli sentetik grid sheet JSON'u (kolon+satir) uretir |
| `backend/src/ozellik/kutuphane/materials/dto/create-material-price.dto.ts` | Havuza malzeme-marka fiyat kaydi ekleme girdisini dogrular |
| `backend/src/ozellik/kutuphane/materials/dto/create-material.dto.ts` | Malzeme olusturma isteginde ad alaninin bos olmayan string olmasini dogrular |
| `backend/src/ozellik/kutuphane/materials/materials.controller.ts` | Admin-korumali malzeme havuzu CRUD ve marka bazli fiyat atama/silme HTTP uclari |
| `backend/src/ozellik/kutuphane/materials/materials.service.ts` | Prisma ile malzeme CRUD ve marka bazli fiyat upsert/silme islemleri |
| `backend/src/ozellik/kutuphane/utils/import-fidelity.ts` | Admin fiyat listesi ice aktarimi icin TR sayi/para birimi ayristirma, bicim cikarimi, aykiri fiyat isaretleme, kategori yuruyusu ve kolon haritalama saglar |
| `frontend/app/(protected)/labor-firms/[firmaId]/page.tsx` | Iscilik firmasinin fiyat listelerini grid ile goruntuleme, duzenleme, yeni liste ekleme ve kaydetme sayfasi |
| `frontend/app/(protected)/labor-firms/page.tsx` | Iscilik firmalarini disiplin filtresiyle listeler; olusturma ve silme sunar |
| `frontend/app/(protected)/labor/page.tsx` | Disiplin bazli iscilik kalemleri kutuphanesinde dialog'lu CRUD yonetimi |
| `frontend/app/(protected)/library/brand/[brandId]/page.tsx` | Kutuphane markasinin sayfa verisini grid'de duzenleme, yeni malzeme satiri girisi ve kaydetme |
| `frontend/app/(protected)/library/electrical-brands/page.tsx` | Elektrik kutuphane markalarini listeler; manuel malzeme ekleme ve PDF'ten AI cikarimla toplu aktarim sunar |
| `frontend/app/(protected)/library/equipment/page.tsx` | DWG akisinda secilecek ekipman/sarf kayitlarini serbest spec alanlariyla yoneten kutuphane ekrani |
| `frontend/app/(protected)/library/mechanical-brands/page.tsx` | Mekanik kutuphane markalarini listeler; manuel marka modali ve PDF'ten cikarimla aktarim sunar |
| `frontend/app/(protected)/library/page.tsx` | Kullanici kutuphanesi ana ekrani; kalem ekleme/duzenleme, iskonto ve net fiyat gosterimi |
| `frontend/app/(protected)/materials/[brandId]/page.tsx` | Marka fiyat listelerini gösterir, kütüphaneye aktarır, admin Excel düzenleyici açar |
| `frontend/app/(protected)/materials/electrical/page.tsx` | Elektrik malzeme havuzu marka listesi; admin icin marka ekleme/silme |
| `frontend/app/(protected)/materials/mechanical/page.tsx` | Mekanik malzeme havuzu marka listesi; admin icin marka ekleme/silme |
| `frontend/app/(protected)/materials/page.tsx` | Havuz ara kart sayfasini atlayip dogrudan mekanik havuza yonlendiren redirect stub'u |
| `frontend/app/admin/brands/page.tsx` | Global havuz CRUD'u: marka/liste/malzeme + iki fazlı Excel içe aktarım önizlemesi |
| `frontend/app/admin/layout.tsx` | Admin rotalarini e-posta tabanli guard ile korur, sidebar'li sayfa iskeleti saglar |
| `frontend/app/admin/page.tsx` | Admin kok rotasini ilk modul olan kullanicilar sayfasina yonlendirir |
| `frontend/app/admin/stats/page.tsx` | Platform KPI kartlari ve Recharts grafikleriyle admin kullanim ozetini gosterir |
| `frontend/app/admin/users/page.tsx` | Kayitli kullanicilari rol/paket/abonelik rozetleriyle listeler, istemci tarafi arama sunar |
| `frontend/ozellik/kutuphane/admin/AdminSidebar.tsx` | Admin modulleri arasi gezinme, cikis ve uygulamaya donus aksiyonlarini sunar; 'yakinda' rozetli pasif ogeler icerir |
| `frontend/ozellik/kutuphane/library/InlineFirmEntry.tsx` | Iscilik firmasi icin sabit 8-kolon fiyat giris grid'i; save-bulk ile yeni liste olarak kaydeder |
| `frontend/ozellik/kutuphane/library/ManualBrandModal.tsx` | Elle marka olusturma / mevcut markaya malzeme ekleme modali; bos sabit-sema grid'ini library/manual-brand'e kaydeder |
| `frontend/ozellik/kutuphane/admin-stats.ts` | Admin istatistik sayfasinin servis katmani: /admin/stats yanitini KPI/trend/dagilim sekline donusturur |
| `frontend/ozellik/kutuphane/hata-metni.ts` | K1 — sunucunun yazdigi hata mesajini kullaniciya ulastiran saf fonksiyon: `response.data.message` metinse AYNEN doner, DIZI ise (Nest ValidationPipe) " · " ile birlestirir, bos/boslukluysa ya da baska tipteyse varsayilana duser. Kusur `materials/{mechanical,electrical}/page.tsx` ciplak `catch { ... 'Marka silinirken hata olustu.' }` idi: backend 409'unun gercek rakamlari ve "nasil onaylanir" bilgisi ekrana HIC ulasmiyordu |
| `frontend/ozellik/kutuphane/oksuz-kutuphane-uyarisi.ts` | K2 — backend `saveBulkMaterials` → `oksuzKutuphaneSatiri` sayimindan admin'e gosterilecek uyariyi uretir (saf fonksiyon). Sayim yok/0 ise uyari YOK (bos korku yasagi), iskontolu satir varsa kullanicinin elle girdigi emek anilir, yoksa iskonto cumlesi HIC kurulmaz. Onarim VAAT ETMEZ — backend geriye donuk baglamayi guvenli anahtar olmadigi icin bilerek yapmiyor. Cizen yer `admin/brands/page.tsx` `commitImport()` |

### H · TESTLER — 83 dosya

| Dosya | Ne yapıyor |
|---|---|
| `backend/src/modules/dwg-engine/python/tests/__init__.py` | Test dizinini Python paketi yapan bos isaret dosyasi |
| `backend/src/modules/dwg-engine/python/tests/test_block_to_line_split.py` | INSERT noktalarinin boruyu segmentlere bolmesini blok adi/layer'dan bagimsiz dogrular |
| `backend/src/modules/dwg-engine/python/tests/test_pipe_segments.py` | Segment uzunluk dogrulugunu (10x hata hipotezi) duz cizgi, T-junction ve polyline ile test eder |
| `backend/src/modules/dwg-engine/python/tests/test_scale_normalization.py` | Kullanici birim seciminin (mm/cm/m) metraja deterministik uygulanmasini entegrasyon duzeyinde test eder |
| `backend/src/modules/dwg-engine/scale-param.test.ts` | Birim parametresi cozumlemesinin varsayilan/gecersiz/gecerli durumlarini node assert ile dogrular |
| `backend/test/admin-import-test.ts` | Fiyat listesi ice aktarim yardimcilarinin (TR sayi, kategori yuruyusu, kolon/etiket tespiti) DB'siz kabul testlerini kosar |
| `backend/test/audit-canli-kosum.ts` | Gercek servisler ve yerel DB ile eslestirme/import akisinin canli kanit dokumunu ureten denetim kosumu |
| `backend/test/audit-real-excel.ts` | Gercek teklif Excel'inde satir-cozucunun aile/cap cozum oranlarini stdout'a raporlayan tanilama araci |
| `backend/test/build-sha-kablolama-test.ts` | BUILD_SHA'nin Dockerfile/compose/deploy scripti/health zincirinde kablolu oldugunu dosya iceriklerini regex'leyerek dogrular |
| `backend/test/contract-test.ts` | Eslestirme motorunun dis yuzey sozlesmesini (alan/tip/tasinan deger sekli) donduran, davranis degil sekil test eden suite |
| `backend/test/conversion-test.ts` | Cap cevrim motorunun PRD kabul senaryolarini (DN-inc, PPR mm, belirsizlik) kosar; bilinen aciklari ayri sinifta izler |
| `backend/test/excel-grid-test.ts` | Kesif Excel'inin grid'e ayristirilmasini (merge'li ad sutunu, bolum basligi eleme, fiyat sutunu sizmasi) bellekte kurulan fixture'larla test eder |
| `backend/test/export-format-test.ts` | Format tarama (yer tutucu/richText) ve export motorunun T1-T15 kabul senaryolarini bellekte kurulan workbook'larla kosar |
| `backend/test/export-live-sim-test.ts` | Gercek QuotesService.exportXlsx'i sahte Prisma ile kosup uretilen Excel'i hucre hucre denetler |
| `backend/test/faz0-gs7-probe.ts` | Ad-sutunu tespit hatasini gercek fixture'lar uzerinde kolon profiliyle olcen tani probu |
| `backend/test/fixture-anonim.ts` | Musteri kimliklerini xlsx sharedStrings ve dosya adlarinda takma adlarla degistiren anonimlestirme araci |
| `backend/test/fixture-dogrula.ts` | Anonimlestirmenin kimlik dizeleri disinda hicbir byte'i degistirmedigini ZIP ve parse katmaninda kanitlar |
| `backend/test/gercek-dosya-test.ts` | Bes sorunlu gercek musteri Excel'inin prepare'dan dogru rol ve satir sayisiyla gectigini sinar |
| `backend/test/gs6b-teshis.ts` | Ad-sutunu secici bug'unun veri mi render borusu mu kaynakli oldugunu ayirt eden teshis scripti |
| `backend/test/index-engine-test.ts` | İndeksli motorun K1-K7 kabulünü gerçek indeksleyiciyle DB'siz doğrular |
| `backend/test/fallback-ad-kilidi-test.ts` | Bağsız (productIndexId=NULL) kütüphane satırlarında `manuelUrunIndeksle` fallback'inin DÜZ METİN yolunu sınar. Soyma döngüsü yalnız adın SONUNDAN soyduğu için "… Et 2.5mm" ile biten adlarda cins/bağlantı kelimeleri AD token'ı kalır; sorgudaki aynı kelime AD kısıtı sayılıp var olan çapı eler. Havuz gerçek ÇAYIROVA satırlarından, DB istemez |
| `backend/test/kd11-toplam-yollari-test.ts` | Uc fiyat-giris yolunda malzeme ve genel toplam hesabini alti ayri assert'le sinar |
| `backend/test/kd12-baslik-satiri-test.ts` | Unvan/baslik satirlarinin veri satiri sanilmadigini ve metinden sayi turetilmedigini sinar |
| `backend/test/kd9-kur-olcutu-test.ts` | Kur cevrim olcutunun kendisini sinar: dairesel tahminci yerine urun formuluyle tam esitlik |
| `backend/test/kl-liste-ekleme-test.ts` | Gercek PG uzerinde iscilik ve kutuphane grid kayitlarinin round-trip sadakatini dogrular |
| `backend/test/labor-matching-test.ts` | Iscilik eslestirmenin malzemeyle ayni motoru (matchV2/runQuery) kullandigini sahte Prisma'yla sinar |
| `backend/test/labor-sheet-test.ts` | Iscilik 8-sutun sabit sheet'in kayitta korunup DB overlay'iyle geri dondugunu dogrular |
| `backend/test/library-transfer-test.ts` | Kutuphane sheet kurucusunun gruplama, siralama ve alan sadakatini DB'siz birim testiyle sinar |
| `backend/test/manifest-kapisi.ts` | Her test scriptinin regresyon SUITES listesinde veya gerekceli istisnada oldugunu zorlayan kapi |
| `backend/test/matching-unit-test.ts` | bulkMatch akışını fake Prisma + gerçek seed'lerle uçtan uca DB'siz test eder |
| `backend/test/oneri-kutusu-cekince-test.ts` | S2+S3 kilidi — capraz-marka/firma ONERI KUTUSU. (S3) Kanit gucu yetmeyen aday onerilmez: `capsiz-dusum` (satir capli, adayin capi yok) ve `ad-gevsetildi` (ad daraltmasi gevsetildi) kapilarindan gecen tek aday oneri kutusuna GIRMEZ — ana ekranda I6 zaten fiyat yazdirmiyordu. (S2) Mesru kalan cekinceli aday (yalniz `bilinmeyen-kelime`) DONER ama `uyariNot` + `bilinmeyen` cekincesini tasir. Iki aile: `findAlternativesV2` (malzeme) + `findLaborAlternativesV2` (iscilik). Bos-kume kapilari: her fixture havuzunun KENDI markasinda aday urettigi ayrica assert edilir, boylece "0 alternatif" ile "0 aday" karismaz. `M4` daraltmanin mesru oneriyi (PP KURESEL → KALDE) dusurmedigini olcer |
| `backend/test/s45-olcum.ts` | S4+S5 OLCUM ARACI — ASSERT YOK, yalniz sayim. Gercek urun havuzunu (yerel `ProductIndex` dokumu) gercek kesif dosyalarindan (uretim ayristiricisiyla) cikarilan satirlarla sorgular ve `single/multi(ask)/none` kirilimini basar. Iki karsilastirma: (1) REINDEX ONCESI (kayit bayat surumde, istek aninda yeniden uretilir) vs SONRASI — ayni cikmali, ayrilirsa bayat-indeks tamiri eksik demektir · (2) eski kod vs yeni kod, S4/S5 gecici kapatilip TEKRAR kosularak (uretim kodunda calisma-aninda kapatma anahtari BILEREK YOK). Dokum yoksa sessizce gecmez, gerekcesini yazip exit 2 verir |
| `backend/test/s45-malzeme-aile-test.ts` | S4+S5 kilidi — MALZEME KATMANI + AILE ZAYIFLIGI. (S5) Sozluk "pis su = PVC|HDPE" bilgisini `TerminologyAlias.kinds` icinde ZATEN tasiyordu ama motora HIC ulasmiyordu: `matching.service` kinds'i yalniz siyah|galvaniz suzgecinden geciriyordu ve `SizeClass` (steel|plastic|unknown) PVC ile PP'yi AYIRT EDEMIYORDU. Yeni `ProductIndex.malzemeler` etiketiyle beklenen malzeme ONE, cakisan SONA siralanir — SERT ELEME YOK (etiketsiz urun ortada kalir); cakisan TEK aday kalirsa fiyat otomatik yazilmaz (`malzeme-celiskisi` kapisi). (S4) Aile ADdan cozulemeyip KATEGORIDEN cozuldugunde `aileZayif` yazilir ve o kayda uc tahmin yolu kapanir: capsiz istisnasi, ad-gevsetme, capraz-marka onerisi. (S7) Plastik cevrim rozetindeki sabit "(PPR-mm)" ibaresi notrlesir, SAYILAR degismez. Iki aile: S5'te pis su + hidrant, S4'te boru + vana. Karsit kontroller GUCLU ailede eski davranisin AYNEN durdugunu olcer (fren her seyi kesmiyor). Bos-kume kapilari: sozluk alanlarinin dolu oldugu ve bugunku yolun GERCEKTEN aday urettigi ayrica assert edilir |
| `backend/test/onceden-fiyatli-test.ts` | Dosyada onceden girilmis fiyatlarin ice aktarimda sabit sema hucrelerine geldigini dogrular |
| `backend/test/pano18-para-birimi-test.ts` | USD/TL secimiyle iki export yolunun da cevrilmis deger, para bicimi ve kur notu urettigini sinar |
| `backend/test/perf-profil.ts` | Ice aktarim, eslestirme ve export surelerini gercek fixture ve sentetik 1500-kalem havuzla olcer |
| `backend/test/pk3-kimlik-haritasi-test.ts` | Anonimlestirme kimlik haritasinin sinir ve kapsam kurallarini saf fonksiyon assert'leriyle sinar |
| `backend/test/pk3-repo-kapsama-test.ts` | Diskteki tum xlsx fixture'larin git tarafindan izlendigini dogrulayan kapsama kapisi |
| `backend/test/product-index-test.ts` | Urun indeksleyicinin kolon koruma, aile cozumu ve Turkce token kurallarini DB'siz sinar |
| `backend/test/spec-regression-test.ts` | Eslestirme motorunun yasanmis gercek vakalarini R1-R14 degismezleriyle sahte Prisma uzerinden dogrular |
| `backend/test/standart-cikti-test.ts` | 9 kolonlu standart Excel ciktisinin EX1-EX8 kabul kriterlerini gercek fixture dosyayla dogrular |
| `backend/test/kalem59-oksuz-kutuphane-test.ts` | Fiyat listesi yeniden yüklenince öksüz kalan kütüphane satırlarının RAPORLANDIĞINI sınar. Tetikleyici "yeniden yükleme" değil, iki yükleme arasında **adlandırmanın değişmesi** (birleşik ad → ayrışık kolonlar); farklı ad = farklı Material = farklı materialId = eski satır öksüz. Onarım YAPILMAZ (güvenli anahtar yok), yalnız görünür kılınır (DB gerektirir) |
| `backend/test/p2-2-sheets-indeks-test.ts` | `saveMaterialsFromSheets` ProductIndex yazar + rowKey upsert kimligi korur + **indekslenme sonrasi 2. kutuphane aktariminda MUKERRER satir yasagi** (DB gerektirir) |
| `backend/test/b1-kutuphane-cascade-test.ts` | ProductIndex silinince kullanicinin kutuphane satirinin (discountRate/customPrice ile) CASCADE ile UCTUGUNU olcer. Ayni tabloda `sourcePriceListId` SET NULL (koruyucu) ile `productIndexId` CASCADE (oldurucu) celisir — schema.prisma:334 vs :348. **ARTIK YESIL** — kusur ayni gun duzeltildi; kirmiziya donerse bu bir REGRESYONDUR |
| `backend/test/d1-marka-silme-capraz-tenant-test.ts` | Marka silinince `brands.service.ts:154`'teki elle `deleteMany({ where: { brandId } })`'in **TUM kullanicilarin** kutuphane satirlarini (iskonto/ozel fiyat dahil) goturdugunu olcer — filtrede `userId` YOK (capraz-tenant) ve ekonomi ayrimi YOK. DB'nin canli `UserLibrary_brandId_fkey` RESTRICT korumasi bilerek asiliyor (D0 assert'i P2003 ile kanitlar). L1/L2 kalkanlari test markasi temizliginin bozulmamasini korur. **ARTIK YESIL** — kusur ayni gun duzeltildi; kirmiziya donerse bu bir REGRESYONDUR |
| `backend/test/a1-silme-etkisi-test.ts` | Silme ONCESI sayim uclarini ve fiyat listesi yolundaki 409 on kontrolunu dogrular (DB gerektirir). A0 canli DB'de OLCER: fiyat listesi silinince kutuphane satiri yasar, iskonto durur, yalniz bag kopar — ucun `bag-kopar` adi ve ekran metni bu olcume dayanir, FK geri Cascade'e donerse once A0 kizarir. Iki bag yolu da (sourcePriceListId + productIndexId) sayilir; U assertleri uclarin GET ve admin-only oldugunu metadata'dan kanitlar |
| `backend/test/guvenlik-uclari-test.ts` | Uç güvenliği sözleşmesi (K1/K2/K4), DB'siz. K1: `matching.controller.ts`'in `backfill-tags` + `generate-tags` uçları yorumlarında "Admin:" dediği hâlde RolesGuard/@Roles taşımıyor — RolesGuard'ın FİİLEN okuduğu `getAllAndOverride([metot, sınıf])` ile ölçülür; ★KALKAN assertleri aynı sınıftaki ALTI normal-kullanıcı ucunun admin İSTEMEDİĞİNİ korur (sınıf düzeyine @Roles konursa kırılır). K2: gerçek `TierGuard` + sahte ExecutionContext ile ölçer — `LaborController` @RequireTier'i SINIF düzeyinde tuttuğu ve guard yalnız `getHandler()` okuduğu için CORE kullanıcı BEŞ uçtan da geçiyor. K4: `?onaylandi=true` bayrağının HTTP katmanından servise doğru çevrildiğini sahte servisle, iki ayrı controller ailesinde ölçer. O ölçüt kontrol vakaları her iddianın yanında sağlam bir örneği aynı ölçüme sokar. **ARTIK YEŞİL** (41/0); kırmızıya dönerse bu bir REGRESYONDUR. ⚠ **K3 04.08.2026'da KALDIRILDI** — ölçtüğü `DELETE /api/materials/:materialId/price/:brandId` ucu ölüydü (FE/BE/test/docs/scripts genelinde çağıran yok, kontrol vakasıyla aramanın kör olmadığı kanıtlandı) ve kullanıcı onayıyla silindi; controller metodu + servis metodu + K3 bloğu birlikte gitti (50→41 assert). Uç geri eklenirse K3 de geri gelmelidir |
| `backend/test/imza-ekseni-test.ts` | Öğrenme hafızasının ANAHTARINI (`matching.service.ts` `buildImza`) sınar, DB'siz. `buildImza` etiketlerden yalnız ölçü + materialType + `KIND_TAGS` süzer; `shared-tag-matcher.ts`'teki `SURFACE_TAGS` (siyah/galvaniz/kırmızı/boyalı) ve `CONNECTION_TAGS` (dişli/kaynaklı/flanş/pres/düz-uçlu/yivli) tanımlı olduğu hâlde imzaya HİÇ girmez → yüzeyi, bağlantısı ve akışkanı farklı sorgular tek kayda düşer ve birinde verilen karar ötekine "önceki tercihiniz" diye gösterilir. A-R1 yüzey · A-R2 bağlantı · A-R3 akışkan ekseni (üç bağımsız aile) · E-R1 ölçüsü çözülemeyen satır da anahtar üretiyor · C-R1a/b ön-seçim metni onaylatıcı konuşuyor ve sayacı satıra aitmiş gibi gösteriyor. Ö1-Ö10 ölçüt kapıları etiket kümesinin BOŞ OLMADIĞINI ve ölçütün kör olmadığını ayrı ayrı kanıtlar (boş küme olsaydı tüm "eşittir" iddiaları yalancı yeşil olurdu); L1-L3 ★ regresyon kilitleri `buildKindImza`'nın kasıtlı genişliğini, determinizmi ve aşırı daraltma yasağını korur. `private` metotlar çalışma zamanında `(svc as any)` ile okunur — üretim kodunda görünürlük değişikliği YAPILMADI. **ARTIK YEŞİL** (28/0) — kırmızı-önce turunun altı kusuru aynı gün düzeltildi: imza artık `marka\|ölçü\|tip\|cins\|yüzey\|bağlantı` üretir (etiketler sıralı), ölçü çözülemezse imza ÜRETİLMEZ (`null`) ve `remember` tam imzayı YAZMAZ (cins tercihi yazma yolu korunur), ön-seçim metni "onaylayın" demeyi bırakıp sayacın ANAHTARA ait olduğunu söyler. ⚠ İmza formatı değiştiği için eski tam-imza kayıtları eşleşmez olur — BİLİNÇLİ (emsali: Faz 2b HEADER_HINTS), kayıtlar SİLİNMEDİ. Kırmızıya dönerse bu bir REGRESYONDUR |
| `backend/test/tam-zincir.ts` | Backend regresyon, frontend vitest ve Playwright E2E'yi derleme kapisiyla tek komutta kosan zincir kosucusu |
| `frontend/app/dev/grid-test/page.tsx` | ExcelGrid'i auth'suz ve API'siz, mock eslestirmeyle calistiran gelistirme/e2e dogrulama harness'i |
| `frontend/components/dwg-metraj/unit-detection.test.ts` | Birim-metre donusum sabitlerini ve fallback davranislarini vitest ile dogrular |
| `frontend/components/dwg-workspace/equipment-popup-mod.test.ts` | Ekipman popup'inin acilis sekmesi kurali (P2-6): manuel kayit manuel sekmede acilir, yeni isaretleme kutuphane modunda kalir |
| `frontend/components/dwg-viewer/segment-length.test.ts` | Hover uzunluk cozumlemenin scale=0 bug reprosu dahil davranislarini vitest ile dogrular |
| `frontend/ozellik/tablo/excel-grid/build-material-context.test.ts` | Olcu ifadesi tespiti ve yetim-satir kararinin H4/C3 birim testleri |
| `frontend/ozellik/tablo/excel-grid/discount-utils.test.ts` | Iskonto ayristirma/sabitleme ve Excel kolon yapistirma yardimcilarinin birim testleri |
| `frontend/ozellik/tablo/excel-grid/fill-down.test.ts` | Surukle-doldur modulunun SD1-SD10 sozlesme kabul testleri (sessiz-bos yasak, kaynak fiyat kopyalanmaz) |
| `frontend/ozellik/tablo/excel-grid/grup-iskonto-girisi.test.ts` | S1 kilidi — grup bandindaki iskonto sorusu isletim sistemi kutusu ("site says") ile DEGIL uygulama ici kutucukla sorulur. Iki GENEL eksende olcer: (1) `promptGroupDiscount` govdesi native diyalog cagirmaz, uygulama ici `promptValue`'yu `input` alaniyla cagirir; (2) CIRCIR — frontend genelinde kalan native diyalog sayisi 3'u gecemez (bugunku bakiye: `ExcelGrid.tsx` yeni sutun adi sorusu + iki uyari, kullanicinin karari geregi yerinde). Satir numarasi olcut DEGIL (kod kayinca sessizce baska seyi olcerdi). Bos-kume kapilari: kaynaklar dolu mu, govde ayristirildi mi, dedektor en az bir cagri buluyor mu |
| `frontend/ozellik/tablo/excel-grid/oneri-cekince.test.ts` | S2 (FE) kilidi — oneri kutusu KESINLIK IDDIA ETMEZ. Iki katman olculur: (1) saf karar (`oneri-cekince.ts`) cekinceli adayi kesin saymaz, basligi onay tonuna dondurur; (2) KABLOLAMA — `ExcelGrid.tsx`'teki HER alternatif kutusu (malzeme + iscilik) o karari kullanir ve cekince metnini EKRANA BASAR. Olcut satir numarasi DEGIL, yapisal blok tarama. Bos-kume kapilari: blok bulundu mu, sayisi 2 mi. D1 olcutu bir gecici-kapatma turunda yalanci yesil verdi (fonksiyon kenarlik renginde de cagriliyordu) → JSX cocugu arayacak sekilde sertlestirildi |
| `frontend/ozellik/tablo/excel-grid/kar-yayilimi.test.ts` | Kar% surukle-doldur MUHURLU formulu kullanir kapisi (P2-1a): ham carpim ve 2 ondalik sizarsa kirmizi yanar |
| `frontend/test/e2e-golden/artefakt-dizini.cjs` | Her E2E koşumuna damgalı artefakt dizini açar, latest işaretçisini günceller |
| `frontend/test/e2e-golden/faz0-gs7-teshis.spec.ts` | Assert'siz olcum araci: gercek dosya yuklenip her sekmenin baslik/satir doluluk kaniti toplanir |
| `frontend/test/e2e-golden/firma-a-golden.spec.ts` | Altin senaryo E2E: yukle, surukle-doldur, USD cevrim, kaydet/yeniden ac, export akisini tarayicida sinar |
| `frontend/test/e2e-golden/global-setup.mjs` | Kosum oncesi hazirlik: surum kapisi, dev JWT uretimi, yigin saglik kontrolu, eski test tekliflerinin temizligi |
| `frontend/test/e2e-golden/gs-kalicilik.spec.ts` | Grid E2E testleri: kolon sola sabitleme, genislik kaliciligi ve ad-sutunu secicisinin davranisi |
| `frontend/test/e2e-golden/pu4-popup-genislik.spec.ts` | Aday popup'inin boyutlandirma, render sonrasi genislik korunumu ve tasima davranisini tarayicida sinar |
| `frontend/test/e2e-golden/run.mjs` | Altin yol orkestratoru: surum kapisi + Playwright kosumu + verify'i damgali artefakt dizinine baglar |
| `frontend/test/e2e-golden/sayi-ayristirma.mjs` | Dogrulama araclari icin iki sinif sayi cozumleyici: insan yazimi TR metin ve makine degeri |
| `frontend/test/e2e-golden/surum-kapisi.cjs` | Kosum oncesi uc surumu (agac HEAD, FE build, BE build) karsilastirip uyumsuzsa testi reddeder |
| `frontend/test/e2e-golden/verify.mjs` | E2E artefaktlarını bağımsız yeniden hesaplayıp C1-C11 PASS/FAIL matrisi üretir |
| `frontend/test/e2e/grid.spec.ts` | Mock harness uzerinde grid E2E: popup nesne baglama, surukle-doldur, Ctrl+Z, ag hatasi senaryolari |
| `frontend/lib/gs6b-golge-kurali.test.ts` | Kaynak-seviyesi vitest kilidi: satir listesi yazan fonksiyonun golge kaynagi da tazeledigini dogrular |
| `frontend/lib/indeks-sagligi.test.ts` | Indeks sagligi rozet kararini kilitler — T1 bagsizlik (`indekssiz`) rozeti GORUNMELI (fix oncesi KIRMIZI olculdu), T2 mevcut `bayat` rozeti regresyon kalkani, T3 ikisi de 0'ken hicbir rozet yok, T4 IKI AILE ayni anda cizilir (genellik), T5 veri gelmeden rozet yok |
| `frontend/lib/silme-onay-metni.test.ts` | Onay metninin YANLIS SEY VAAT ETMEMESINI kilitler: fiyat listesi yolunda kutuphane cumlesinde "SİLİNECEK" gecemez (B'den sonra satir olmuyor), marka yolunda gecmeli. Ayrica sifir etkide kutuphaneden bahsedilmez, ekonomi yokken "geri getirilemez" cikmaz, uc cagrilamayinca sayi uydurulmaz. Ayrica `bilgilendirilmisOnay` bayragini kilitler: uc cagrilamayinca false (sayfalar `?onaylandi=true` gondermez, backend 409'u devreye girer), etkilenen satir 0 olsa bile olcum yapildiysa true. Bos-kume kapisi fixture kirilimini UC AYRI assert ile kanitlar |
| `frontend/ozellik/kutuphane/hata-metni.test.ts` | K1 kilidi — sunucu mesajinin yutulmadigini dogrular: gercek 409 metni birebir doner ve varsayilan cumle KULLANILMAZ (eski davranisin muhuru), dizi mesaj birlestirilir ("[object" sizmaz), bos/tipsiz mesajda varsayilana duser. Ayrica kaynak-seviyesi kilit: mekanik ve elektrik havuz sayfalarinin (IKI AILE) silme akisinda ciplak `catch {` YOK, `hataMetni(` cagriliyor, `?onaylandi=true` gonderiliyor ve metin ortak `silmeOnayMetni`den geliyor. Genellik olcumu: elektrik sayfasi bozulunca YALNIZ elektrik ailesi kirmizi, mekanik yesil kalir |
| `frontend/ozellik/kutuphane/oksuz-kutuphane-uyarisi.test.ts` | K2 kilidi — oksuz kalan kutuphane satiri uyarisini dogrular: sayim yok/0/bicimsiz ise uyari uretilmez, ISKONTOLU ailede satir ve iskonto sayilari metne duser ve "otomatik" onarim vaat edilmez, ISKONTOSUZ ailede iskonto kelimesi HIC gecmez (IKI AILE = genellik). Kaynak-seviyesi kilit: `admin/brands/page.tsx` `commitImport()` govdesi `data.oksuzKutuphaneSatiri` alanini gercekten okuyor (yorumda gecen ada degil, `data.` onekli cagriya bakilir) |
| `frontend/ortak/hooks/onay-secenekleri.test.ts` | K3 kilidi — GENEL kural: `ortak/hooks/use-confirm.ts` `ConfirmOptions` icinde ilan edilen HER secenegi tek renderer `ortak/ui/confirm-dialog.tsx` `opts.<ad>` olarak okumak zorunda. Olu `tone` secenegini yakalayip kaldirtti; genellik olcumunde uydurma yeni bir olu secenek de kirmiziya dusuruldu. Bos-kume kapisi: arayuz ayristirmasi bos donerse dongu hic assert uretmeden yesil gorunurdu, o yuzden secenek sayisi ve `description` varligi ayrica assert edilir. S1 (06.08) ile kural IC ICE gecen secenege de uygulandi: `ConfirmInput` alanlari renderer'da `input?.<ad>` olarak okunmak zorunda — alt alanlar ayri arayuze tasindiginda denetimsiz kalacaklardi |
| `frontend/lib/merge-multisheet.test.ts` | Excel yeniden yuklemede kullanici emeginin (kar, marka, fiyat, ozel sutun, sheet) korundugunu dogrulayan vitest suiti |
| `frontend/lib/parse-material-text.test.ts` | Birlesik malzeme metninin cap+cins ayrimini ve geri birlestirmeyi 17+ ornekle dogrulayan vitest suiti |
| `frontend/lib/popup-secici-sozlesmesi.test.ts` | E2E harness ile UI'nin aday popup'i data-testid sozlesmesiyle bulmasini kaynak taramasiyla kilitleyen vitest testi |
| `frontend/lib/pricing.test.ts` | Fiyat cekirdeginin spec orneklerini, float epsilon davranisini ve etkinMiktar kuralini dogrulayan vitest suiti |
| `frontend/lib/sayi-ayristirma.test.ts` | E2E dogrulayicisinin num/numHam sayi ayristirmasini ve verify.mjs'te yasak num() kullanimini kaynak taramasiyla kilitler |
| `frontend/ortak/lib/api-401-kapsami.test.ts` | 401 interceptor'unun UCU sordugunu kilitler: `/auth/login` 401'i oturumu SILMEZ ve yonlendirmez (A1/A2), `/auth/me` 401'i SILER ve yonlendirir (B1/B2 regresyon kalkani). Ayri bir "OLCUT SINAMASI" blogu istegin gercekten adapter'a ulastigini kanitlar — bu repoda jsdom yok, ortam 'node', aksi halde `typeof window === 'undefined'` yuzunden A1/A2 hicbir sey olcmeden yesil donerdi |
| `frontend/playwright.config.ts` | Mock harness e2e kosumu icin 3010 portunda dev sunucu kaldiran Playwright yapilandirmasi |
| `frontend/playwright.golden.config.ts` | Altin-yol e2e'yi mevcut tam yigina baglayan, artefakt damgali, tek-worker Playwright yapilandirmasi |
| `frontend/vitest.config.ts` | Vitest'in Playwright'a ait e2e dizinlerini toplamamasi icin exclude listesi tanimlar |

### I · DERLEME ve CANLIYA ÇIKIŞ — 9 dosya

| Dosya | Ne yapıyor |
|---|---|
| `backend/scripts/derleme-kapisi.js` | Build sonrasi dist icindeki .js sayisini sayarak bos/eksik derlemeyi yakalayip cikis 3 verir |
| `backend/scripts/surum-yaz.js` | Prebuild aninda git sha ve kirlilik bilgisini surum.generated.ts olarak koda gomer |
| `backend/src/health.controller.ts` | Derleme aninda gomulen surum damgasiyla canli calisan kodun kimligini raporlar |
| `backend/src/modules/dwg-engine/python/deploy-to-cloudrun.sh` | Python motorunu gcloud ile Google Cloud Run'a dagitir; token ve env kontrolleriyle |
| `backend/src/surum.ts` | Derleme aninda gomulen commit hash'ini okuyup BUILD_SHA olarak verir; yoksa 'local' isaretler ve surum kapisi reddeder |
| `frontend/next.config.js` | API URL env'i, xlsx external paketi, production'da console.log sokme ve Cloudflare Pages dev adapteri ayarlar |
| `frontend/postcss.config.js` | Tailwind ve autoprefixer eklentilerini CSS derleme hattina baglar |
| `frontend/scripts/surum-yaz.js` | Derleme aninda git sha + kirli-agac damgasini public/surum.json'a gomer; canli surum dogrulama kapisi bunu okur |
| `frontend/tailwind.config.ts` | shadcn/ui CSS degiskenli renk paleti, radius olcekleri ve accordion animasyonlarini tanimlar |

### J · DWG-METRAJ — 45 dosya

| Dosya | Ne yapıyor |
|---|---|
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | DWG/DXF yukleme, layer listesi, metraj parse, async upload/status ve geometri HTTP uclari |
| `backend/src/modules/dwg-engine/dwg-engine.service.ts` | Python DWG motoruna cold-start toleransli, token korumali HTTP proxy; retry ve hata cevirisi |
| `backend/src/modules/dwg-engine/python/converter.py` | LibreDWG ile DWG'yi DXF'e cevirir, header normalize eder, ezdxf ile butunluk dogrular |
| `backend/src/modules/dwg-engine/python/geometry.py` | DXF çizim öğelerini viewer'ın çizebileceği koordinat listesine çevirir |
| `backend/src/modules/dwg-engine/python/graph.py` | Boru cizgilerinden Union-Find ile ag grafi kurar; tee/uc/sprinkler noktalarini tespit eder |
| `backend/src/modules/dwg-engine/python/main.py` | DWG yükleme, DXF dönüşümü, layer/metraj/geometri servislerini HTTP'den sunan FastAPI uygulaması |
| `backend/src/modules/dwg-engine/python/models.py` | Metraj sonuclarinin Pydantic semalarini tanimlar: layer listesi, segment, dal noktasi, toplam |
| `backend/src/modules/dwg-engine/python/parse_worker.py` | Metraj analizini izole subprocess'te kosar; stdin JSON alir, stdout'a sanitize JSON yazar |
| `backend/src/modules/dwg-engine/python/pipe_segments.py` | Boru çizgilerini kesişim/T-noktası/sprinkler konumlarından bölüp işaretlenebilir hat parçaları üretir |
| `backend/src/modules/dwg-engine/python/topology.py` | Boru grafinda kolinear zincirleri dallara gruplar, layer bazli uzunluk metraji ve dal noktalari cikarir |
| `backend/src/modules/dwg-engine/python/upload_worker.py` | DWG-DXF donusumu, tek ezdxf parse ve geometri cache yazimini izole subprocess'te yapar |
| `backend/src/modules/dwg-engine/scale-param.ts` | Kullanicinin sectigi birimi Python motoruna gidecek carpana cevirir; gecersizde mm varsayar |
| `frontend/app/(protected)/dwg-workspace/page.tsx` | DWG analiz akisini lazy yukleyen bagimsiz route; onaylanan metraji sessionStorage ile teklif sayfasina aktarir |
| `frontend/components/dwg-diameter-engine/DiameterLegendPanel.tsx` | Hesaplanan cap gruplarini renk kupu, uzunluk ve segment sayisiyla listeler; tiklamayla cizimde segment gezdirir |
| `frontend/components/dwg-diameter-engine/index.ts` | Modulun disa acilan yuzeyini toplar (iki hook, legend paneli, tip export'lari) |
| `frontend/components/dwg-diameter-engine/types.ts` | Cap-legend tiplerini tanimlar ve layer'lardan canonical cap bazli legend girdilerini turetir |
| `frontend/components/dwg-diameter-engine/useLayerCalc.ts` | Tek layer için backend'e metraj isteği atar; SAF geometri+uzunluk sonucunu (çapsız segmentler) callback ile parent'a verir — HS6 denetiminde netleştirildi |
| `frontend/components/dwg-diameter-engine/useOriginalColorState.ts` | Cap-bazli dinamik renkler ile orijinal layer renkleri arasindaki render bayragini yonetir |
| `frontend/components/dwg-metraj/constants.ts` | Atanmamis cap sentinel'lerini merkezi tanimlar ve display label'a cevirir |
| `frontend/components/dwg-metraj/diameter-colors.ts` | Cap string'ini nominal mm'e cevirip 12'lik palete renk atar; cap metnini kanonik forma indirger |
| `frontend/components/dwg-metraj/DiameterEditPopup.tsx` | Boru segmentine tiklaninca acilan popup ile standart/ozel cap secimi ve kanonik kaydetme |
| `frontend/components/dwg-metraj/DwgUploader.tsx` | DWG/DXF yukleme, async upload + status polling, session restore ve birim secimiyle workspace acar |
| `frontend/components/dwg-metraj/index.ts` | Modulun disa acilan yuzeyini toplar (uploader, editor, popup, tipler, renk yardimcilari) |
| `frontend/components/dwg-metraj/MetrajEditor.tsx` | Cikarilan metraji hat tipine gore gruplu duzenlenebilir tabloda sunar; Excel indirme ve onaylama |
| `frontend/components/dwg-metraj/types.ts` | Boru segmenti, çap, layer agregesi, ekipman ve metraj sonucu veri tipleri |
| `frontend/components/dwg-metraj/unit-detection.ts` | Kullanicinin sectigi cizim birimini deterministik olarak metreye cevirir; tahmin yapmaz |
| `frontend/components/dwg-tagging/BucketPanel.tsx` | Cap kalemi (bucket) ekleme/secme paneli; aktif kalemi capsiz segmentlere toplu uygulatir |
| `frontend/components/dwg-tagging/index.ts` | Manuel etiketleme modulunun disa acilan yuzeyini toplar (panel, store, tip) |
| `frontend/components/dwg-tagging/useTaggingStore.ts` | Cap kalemi listesi ve aktif kalem secimini localStorage-persist'li Zustand store'da tutar |
| `frontend/components/dwg-viewer/aci-colors.ts` | AutoCAD renk indeksini (ACI) CSS hex'e cevirir; bilinmeyenlere HSL hash dagitir |
| `frontend/components/dwg-viewer/DxfCanvasViewer.tsx` | Çizim geometrisini Canvas2D'de çizer; pan/zoom, hit-test, silgi, çap-renkli vurgu |
| `frontend/components/dwg-viewer/index.ts` | Viewer modulunun disa acilan yuzeyini toplar (canvas viewer, geometri tipleri, viewport hook) |
| `frontend/components/dwg-viewer/segment-length.ts` | Hover tooltip uzunlugunu cozer: edge'de backend metre degerine guvenir, line'da ham koordinat x scale |
| `frontend/components/dwg-viewer/types.ts` | Backend geometry endpoint'inden gelen cizim varliklarinin (line/insert/text/circle/arc) ve viewport'un tiplerini tanimlar |
| `frontend/components/dwg-viewer/useViewport.ts` | Canvas zoom/pan state'ini yonetir: wheel zoom, drag-vs-click ayrimi, fitKey basina tek otomatik fit (kamera kilidi) |
| `frontend/components/dwg-workspace/DwgProjectWorkspace.tsx` | Layer seçip tıkla-etiketle çap atayan, ekipman işaretleyen, metrajı onaylatan akışı yönetir |
| `frontend/components/dwg-workspace/equipment-popup-mod.ts` | Popup'in ACILIS SEKMESI kurali (saf fonksiyon `ilkMod`) — `libraryItemId` dolu ise kutuphane, manuel kayitta manuel, yeni isaretlemede varsayilan kutuphane. `.tsx` icinde satir ici yasarken test goremiyordu (vitest JSX ayristirmiyor) |
| `frontend/components/dwg-workspace/EquipmentDetailPopup.tsx` | INSERT ekipmanina kutuphane listesinden veya manuel girisle ad/birim/fiyat atayan popup |
| `frontend/components/dwg-workspace/index.ts` | Modulun disa acilan yuzeyini toplar (workspace bileseni, tipler, state hook re-export) |
| `frontend/components/dwg-workspace/LayerInfoSidebar.tsx` | Secili boru layer'i icin segmentlere ayirma (/parse) ve hesaplamayi tamamlama aksiyonlarini sunar |
| `frontend/components/dwg-workspace/LayerVisibilityPanel.tsx` | Layer listesinde gorunurluk/soluklastirma/sprinkler isaretleme ve secim+cap popup tetikleme |
| `frontend/components/dwg-workspace/MetrajSummaryPanel.tsx` | Hesaplanmis layer metrajlarini cap dagilimiyla ve ekipman gruplarini listeleyip tek tek onaylatan panel |
| `frontend/components/dwg-workspace/types.ts` | DWG calisma alaninin tip sozlesmeleri: layer konfig/hesap sonucu, isaretli ekipman, genel state |
| `frontend/components/dwg-workspace/useWorkspaceState.ts` | Layer secim/onay, cap atama+1-hop komsu yayilimi ve ekipman state'ini localStorage'a (icerik-hash anahtarli) kalici tutar |
| `frontend/lib/metraj-excel.ts` | DWG metraj sonuclarini coklu-sheet XLSX dosyasina yazip indirtir; sheet adi sanitize/benzersizlestirme yapar |

### K · ORTAK UI, KABUK ve İSTEMCİ — 27 dosya

| Dosya | Ne yapıyor |
|---|---|
| `frontend/app/(protected)/dashboard/page.tsx` | Karsilama/istatistik kabuk sayfasi; Excel ve DWG hizli yuklemeyle teklif akisini baslatip quotes/new'e yonlendirir |
| `frontend/app/(protected)/layout.tsx` | Korumali alan kabugu: sidebar/breadcrumb, canli TCMB kur widget'i ve kullanici dropdown'u ile sarmalar |
| `frontend/app/(protected)/profile/page.tsx` | Kullanici profili, abonelik/tier ve yetkinlik bilgilerini gosterir; oturum kapatma sunar |
| `frontend/app/layout.tsx` | Kok HTML iskeletini kurar; font, global toaster ve onay dialog kokunu baglar |
| `frontend/app/login/page.tsx` | E-posta/sifreyle giris yapar, token ve kullaniciyi localStorage'a yazip dashboard'a yonlendirir |
| `frontend/app/page.tsx` | Token varligina gore kullaniciyi dashboard'a ya da giris sayfasina yonlendirir |
| `frontend/app/register/page.tsx` | Yeni hesap olusturur, donen token'i saklayip dashboard'a yonlendirir |
| `frontend/ortak/kabuk/components/dashboard/QuickAccess.tsx` | Dashboard'da malzeme havuzu ve kutuphaneye hizli gecis kartlari sunar |
| `frontend/ortak/kabuk/components/dashboard/QuickStart.tsx` | Excel ve DWG dosyalarini surukle-birak/tiklama ile alir; DWG icin birim secim dialogu acar |
| `frontend/ortak/kabuk/components/layout/Breadcrumb.tsx` | URL path parcalarindan Turkce etiketli gezinme kirintisi uretir, admin/materials icin ozel etiket |
| `frontend/ortak/kabuk/components/layout/Sidebar.tsx` | Sabit sol gezinme cubugu: ana sayfalar, daralt/genislet, kullanici tier rozeti ve profil linki |
| `frontend/ortak/ui/badge.tsx` | shadcn rozet primitifi; rol/tier/durum icin 8 renk varyanti (cva) |
| `frontend/ortak/ui/button.tsx` | Varyant/boyut seçenekli genel tıklama bileşeni |
| `frontend/ortak/ui/card.tsx` | Başlık/içerik/alt bölümlü kutu düzeni parçaları |
| `frontend/ortak/ui/confirm-dialog.tsx` | use-confirm singleton'ini dinleyip tiklama noktasinda klavye destekli onay karti acan tekil renderer; `opts.input` verildiyse ayni kart bir DEGER KUTUSU cizer (S1) — gorsel dil ExcelGrid iskonto arac cubugundan alindi |
| `frontend/ortak/ui/dialog.tsx` | Radix tabanli modal pencere primitifleri: overlay, icerik, baslik, aciklama, kapatma dugmesi |
| `frontend/ortak/ui/input.tsx` | Ref iletimli standart metin giriş kutusu |
| `frontend/ortak/ui/label.tsx` | Form alanlarına erişilebilir etiket bağlayan sarmalayıcı |
| `frontend/ortak/ui/select.tsx` | Radix tabanli acilir secim kutusu primitifleri: tetik, liste, oge, kaydirma dugmeleri |
| `frontend/ortak/ui/table.tsx` | Bagimliliksiz shadcn HTML tablo primitifleri; admin panel veri tablolari icin stillenmis |
| `frontend/ortak/ui/toast.tsx` | Radix tabanli bildirim balonu primitifleri: viewport, varyantlar (default/destructive), kapatma, aksiyon |
| `frontend/ortak/ui/toaster.tsx` | useToast kuyrugundaki bildirimleri ToastProvider icinde ekrana basan render bileseni |
| `frontend/ortak/contexts/CapabilitiesContext.tsx` | /auth/me'den kullanici disiplin/yetenek bayraklarini cekip saglayan React context ve yardimci sorgular |
| `frontend/ortak/hooks/use-confirm.ts` | Tıklanan noktada açılan Promise tabanlı onay popover'ı; `promptValue()` ayni karti `window.prompt` yerine gecen deger sorusuna cevirir (onayla → metin, vazgec → null) |
| `frontend/ortak/hooks/use-toast.ts` | Bildirim mesajlarının yaşam döngüsünü yöneten reducer |
| `frontend/ortak/lib/api.ts` | JWT ekleyen merkezi HTTP istemcisi. 401'de oturumu temizleyip girişe yönlendirir — **ancak yalnız korumalı uçlar için**: `/auth/login` ve `/auth/register` 401'i "yanlış şifre" demektir, "oturum düştü" değil; o 401 çağırana reject edilir ki giriş formu kendi hatasını gösterebilsin (04.08). `/auth/me` listede DEĞİLDİR, oradan gelen 401 gerçek oturum düşmesidir |
| `frontend/ortak/lib/utils.ts` | Tailwind sınıf birleştirme (cn) + sayı biçimleme yardımcıları |

### L · ÇEKİRDEK BACKEND ALTYAPISI — 32 dosya

| Dosya | Ne yapıyor |
|---|---|
| `backend/src/ozellik/kutuphane/admin/admin.module.ts` | Admin controller/servisini Prisma, AI, ExcelGrid ve Matching modulleriyle kablolar |
| `backend/src/ozellik/giris/ai/ai.module.ts` | AI controller ve servisini Prisma ile kablolar, servisi disa acar |
| `backend/src/app.module.ts` | Tum backend modullerini kok modulde toplar, health ve bootstrap controller'larini baglar |
| `backend/src/altyapi/auth/auth.controller.ts` | Kayit, giris ve mevcut kullanici bilgisi (me) HTTP uclarini sunar |
| `backend/src/altyapi/auth/auth.module.ts` | JWT ve Passport'u yapilandirip auth servis/strategy/controller'i kablolar |
| `backend/src/altyapi/auth/auth.service.ts` | bcrypt ile kayit/giris dogrulamasi yapar, JWT imzalar, me icin yetenek+abonelik dondurur |
| `backend/src/altyapi/auth/capabilities.helper.ts` | Aktif aboneliklerden disiplin bazli malzeme/iscilik/dwg yetki matrisini union mantigiyla turetir |
| `backend/src/altyapi/auth/decorators/current-user.decorator.ts` | Istekten request.user nesnesini parametre olarak cikaran dekorator |
| `backend/src/altyapi/auth/decorators/roles.decorator.ts` | Rol listesini metadata olarak isaretleyen dekorator tanimi |
| `backend/src/altyapi/auth/dto/login.dto.ts` | Giris istegi icin email ve sifre alan dogrulamasi |
| `backend/src/altyapi/auth/dto/register.dto.ts` | Kayit istegi icin email ve minimum 6 karakter sifre dogrulamasi |
| `backend/src/altyapi/auth/jwt-secret.ts` | Token imza anahtarını ortamdan okur; **yedek değer yoktur** — tanımsızsa uygulama açılışta (modül yüklenirken) açıklayıcı hatayla ölür (KL P1-a, kalem 63) |
| `backend/src/altyapi/auth/guards/jwt-auth.guard.ts` | JWT stratejisini endpoint koruması olarak devreye sokan guard |
| `backend/src/altyapi/auth/guards/roles.guard.ts` | Metadata'daki rol listesi ile istekteki kullanici rolunu karsilastiran kapi |
| `backend/src/altyapi/auth/guards/tier.guard.ts` | Kullanicinin paket seviyesini DB'den okuyup endpoint'in gerektirdigi minimum seviyeyle karsilastirir |
| `backend/src/altyapi/auth/strategies/jwt.strategy.ts` | Bearer token'i dogrulayip payload'daki kullaniciyi DB'den yukleyerek request.user'a koyar |
| `backend/src/ozellik/kutuphane/brands/brands.module.ts` | Marka servis ve controller'ini kablolar, servisi disa acar |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.module.ts` | Kur servis/controller kablolamasi; servisi baska modullere disa acar |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.module.ts` | Iscilik firmalari modulunu kablolar; ExcelGrid ve Matching modullerini iceri alir |
| `backend/src/ozellik/kutuphane/labor/labor.module.ts` | Iscilik kalemi servis/controller kablolamasi; Prisma modulunu alir, servisi disa acar |
| `backend/src/ozellik/kutuphane/library/library.module.ts` | Kutuphane servis/controller kablolamasi; Matching modulunu iceri alir |
| `backend/src/main.ts` | Uygulamayi ayaga kaldirir: 500mb body limiti, CORS beyaz listesi+regex, global validation, api prefix |
| `backend/src/ozellik/kutuphane/materials/materials.module.ts` | Malzeme servis ve controller'ini NestJS modul sistemine kablolar |
| `backend/src/modules/dwg-engine/dwg-engine.module.ts` | DWG motoru servis ve controller'ini NestJS modul sistemine kablolar |
| `backend/src/ozellik/giris/excel-engine/excel-engine.module.ts` | Analiz servis ve controller'ini Prisma ile kablolayan NestJS modul tanimi |
| `backend/src/ozellik/giris/excel-grid/excel-grid.module.ts` | Grid hazirlama servis/controller'ini Prisma ile kablolayan NestJS modul tanimi |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.module.ts` | Iscilik esleme katmanini MatchingModule motoruna baglayan NestJS modul tanimi |
| `backend/src/ozellik/eslestirme/matching/matching.module.ts` | Esleme ve terminoloji servislerini Prisma ve kur modulune baglayan NestJS modul tanimi |
| `backend/src/altyapi/db/prisma.module.ts` | DB erişim servisini tüm uygulamaya global sağlayan modül tanımı |
| `backend/src/altyapi/db/prisma.service.ts` | PrismaClient'ı yaşam döngüsüne bağlayıp bağlantıyı açan-kapatan sarmalayıcı |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.module.ts` | Format servis ve controller'ini NestJS'e kablolar, servisi disa acar |
| `backend/src/ozellik/teklif/quotes/quotes.module.ts` | Quotes servis/controller'i AI, Prisma ve kur modulleriyle NestJS'e kablolar |

### M · TEKLİF YAŞAM DÖNGÜSÜ — 8 dosya

| Dosya | Ne yapıyor |
|---|---|
| `backend/src/ozellik/teklif/quotes/dto/create-quote.dto.ts` | Teklif olusturma isteginin kalem alanlarini, sheet yukunu ve orijinal dosya base64'unu dogrular |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | Teklif CRUD, Excel parse ve export/arsiv rotalarini JWT korumali HTTP uclarina baglar; export hatalarini 500'e dusurmeden sarar |
| `backend/src/ozellik/teklif/quotes/quotes.service.ts` | Teklif kaydi/listeleme/silme/kismi bilgi guncelleme yapar; format cozumleyip export motorunu cagirir ve revizyon arsivler |
| `frontend/app/(protected)/quotes/[id]/page.tsx` | Kayitli teklifi grid'le goruntuler, para birimi secimini teklife kalici yazar, cikti indirme baslatir |
| `frontend/app/(protected)/quotes/page.tsx` | Kullanicinin tekliflerini tabloda listeler; toplami hesaplar, detaya goturur, onayla siler |
| `frontend/ozellik/teklif/dashboard/RecentQuotes.tsx` | Son 3 teklifi tutar/tarih ozetiyle listeler, detay ve tum liste baglantilari verir |
| `frontend/ortak/types/index.ts` | Teklif sayfalarinin kullandigi cekirdek alan tipleri: kullanici, marka, malzeme, kutuphane kalemi, teklif ve kalemi |
| `frontend/ortak/types/quotes.ts` | Teklif olusturma sayfasinin tipleri: yukleme modu, para birimi, iscilik firmasi, aday eslesme, duzenlenebilir satir, kur |

### BELİRSİZ — bu turda satır düşmedi

## Otomatik katman (alt katman)

`KOD_HARITASI_OTOMATIK.md` — koddan üretilir, elle dokunulmaz. İçeriği:

1. `git ls-files` çıktısı: repodaki **her** izlenen dosya (uydurma yok, eksik yok).
2. Her dosyanın satır sayısı.
3. Hangi dosya hangisini import ediyor.
4. Uç noktalar (route/controller) listesi.
5. `package.json`’daki `test:*` scriptlerinin **gerçek** listesi.

Bu katman hiçbir zaman yorum içermez. Yorum üst katmanın işidir.

---

## Bakım kuralı

Bundan sonra **her görev dosyası** şu satırla biter:

> **Haritada değişen satır:** `<grup harfi>` · `<dosya:satır>` · `<yeni açıklama>` — ya da *“değişmedi”*.

Değişiklikle harita **aynı commit’te** güncellenir. Kodun dışında duran harita güncellenmez; kodun yanında duran harita güncellenir. Bu belgenin repoda, kodun yanında durmasının tek sebebi budur.
