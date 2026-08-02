# KOD HARİTASI — MetaPriceX

**v0.1 — TASLAK / ÇOĞUNLUKLA BOŞ** · 01.08.2026 · *insan katmanı (üst katman)*

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
| ✅ | doğrulandı — dosya biliniyor, ne yaptığı biliniyor | **38** |
| ◑ | kısmen — dosya biliniyor, ne yaptığı tam bilinmiyor | **17** |
| ⬜ | bakılmadı | **13** |
| | **toplam satır** | **68** |

> Sayım 02.08 (KALEM 58) `grep -c` ile ÖLÇÜLDÜ; önceki tablo (19/12/17/48) bayattı — 02.08 sabahki oturum satır eklemiş, sayacı güncellememişti.

> Bu harita **çoğunlukla boş ve bu kasıtlı.** İçindeki her dolu satır, bir raporda ya da kanıt zincirinde fiilen geçmiş bir dosyadır. **Tek bir dosya adı tahmin edilerek yazılmadı.** Boş satırları Code oturumu ADIM 0-1 tamirini yaparken dolduracak — ayrı bir proje olarak değil, tamirin yan ürünü olarak.

---

## A · GİRİŞ — dosya yükleme ve okuma

**Kullanıcı ne görür:** “Keşif dosyasını yükle” → dosya seçilir, sayfalar okunur, satırlar ekrana gelir.

**Hata bu grupta şu cümlelerle gelir:** “dosya yüklenmiyor”, “sayfalar eksik geldi”, “satırlar kaymış”, “başlık satırı malzeme gibi gelmiş”

**Durum:** ŞU AN KIRMIZI. Canlıda iki hatadan biri burada: başlık satırları malzeme diye içeri giriyor (“YILDIZ ENTEGRE … TEKLİFİ” 5 kez + düz “MALZEME ADI / MİKTAR” satırı). Ayrıca malzeme adı sütunu her sayfada dosya/sayfa adı olarak geldi.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ⬜ | *(bilinmiyor)* | Dosya yükleme ucu — yüklenen dosyayı alan uç nokta | Hiçbir raporda geçmedi |
| ✅ | `backend/src/modules/excel-grid/excel-grid.service.ts:250` | Excel okuyucu / sayfa ayrıştırıcı (`parseSingleSheet`) — satırların ekrana dönüştüğü yer. Merge yayılımı :271-297 (**tek fiziksel hücre N kolona kopyalanır** — ADIM 1a hatasının hammaddesi buydu). | ADIM 1a ölçümü 02.08 |
| ✅ | `backend/src/modules/excel-grid/excel-grid.service.ts:895-1005` | **Başlık SATIRI kararı** (`realHeaderRow`): sözlük kelimesi skorlaması :895-983 (ayrık-metin sayımı + band eleme + altında-sayısal-veri şartı) + kelimesiz başlık geri-düşüşü :984+ (ilk sayısal satırın hemen üstü; üç sigortalı). | ADIM 1a — AKHİSAR İCMAL canlı bulgusu; 83 sayfa önce/sonra kıyası: 3 değişim (3'ü kazanım), 80 birebir |
| ✅ | `backend/src/modules/excel-grid/excel-grid.service.ts:630-647` | **Sütun eşleme** (rol desenleri: no/name/quantity/unit/fiyatlar) + içerik-tabanlı doğrulama R-B/KG6 :697+ (başlık yanıltıcıysa VERİ otorite). | KD12(b) · TF suite · ADIM 1a |
| ✅ | `backend/src/modules/excel-grid/standart-sema.ts:251` | Başlık **ETİKET SATIRI** ayıklama (KD12a: Excel'in kendi başlık satırı veri sayılmaz, `baslikEtiketiSatiriMi`). | KD12(a), kalem 55 |

**Bu grubun cevapsız soruları:**

- Başlık satırı kararı kaç ayrı yerde veriliyor? — **CEVAPLANDI (ADIM 1a, 02.08): ÜÇ yerde.** (1) satır seçimi `excel-grid.service.ts:895-1005`, (2) etiket-satırı ayıklama `standart-sema.ts:251`, (3) seçici görünümü `frontend/lib/kaynak-kolon.ts`. Üçü ayrı katman: hangi satır başlık / hangi satır veri değil / kutuda ne yazar.
- “Malzeme adı = sayfa adı” hatası okuyucudan mı, sütun eşlemesinden mi geliyor? — **KISMEN CEVAPLANDI (02.08): iki ayrı vaka var.** (a) KARTEPE tipi: dosyanın KENDİ başlık hücresi bölüm adını taşıyor (`No | YANGIN POMPA ODASI | Miktar`) — program dosyaya sadık, hata değil (KD12b kararı). (b) AKHİSAR tipi: merge'lü ünvan bandı yanlış SATIR seçtiriyordu — okuyucu hatasıydı, ADIM 1a düzeltti (KD12 e/f mühürlü).

## B · TABLO — ekranda gördüğün grid

**Kullanıcı ne görür:** Satırların düzenlendiği, hücrelerin elle değiştirildiği, sürükle-doldur yapılan ana ekran.

**Hata bu grupta şu cümlelerle gelir:** “hücre değişmiyor”, “sürükleyince yanlış doluyor”, “aday listesi açılmıyor”

**Durum:** Bu projenin en çok kanıtı olan grubu. İki kök neden burada dosya:satır olarak bulundu.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `frontend/components/excel-grid/ExcelGrid.tsx` | Ana tablo bileşeni — ekrandaki grid | KD5 kanıt zinciri; kalem 34; GOREV_Kapatma_Turu |
| ✅ | `frontend/components/excel-grid/ExcelGrid.tsx:645` | Sürükleme tutamağı — commit 44babd1 (PU4c) bu satıra dokundu | Panel kalem 34 + KD5 |
| ✅ | `frontend/components/excel-grid/ExcelGrid.tsx:285` | Çarpma şablonu — ÇALIŞAN örnek (İşç. Toplam bunun sayesinde doluyor) | Code raporu, ADIM 0 §2 |
| ◑ | `frontend/components/excel-grid/aday-ayirt-edicilik.ts` | Aday ayırt edicilik — hangi adayın gösterileceği | GOREV_Kapatma_Turu; ne yaptığı satır düzeyinde bilinmiyor |
| ◑ | `standart-sema.ts` | Standart şema — sütun adlarının tek kaynağı (`_matBirim` burada eşleşiyor) | Panel; tam yol bilinmiyor (backend mi frontend mi?) |
| ⬜ | *(bilinmiyor)* | Sürükle-doldur mantığı | PRD_Kesin_Cozum_SurukleDoldur… var, dosya adı yok |
| ✅ | `frontend/lib/kaynak-kolon.ts` | **“Malzeme Adı sütunu” seçicisinin etiketi** — tek kaynak. Gerçek başlık varsa YALNIZ başlık; başlık yoksa (`headerName === field`) örnek değer ipucu olarak kalır. | Canlı bulgu 02.08 (kutuda `MALZEME ADI — ör: 2000 GPM…` yazıyordu) · `d14856f` |
| ✅ | `frontend/lib/kaynak-kolon.test.ts` | Yukarıdakinin mührü — İKİ aile: başlığı olan dosya (yalnız başlık) ve başlığı olmayan dosya (örnek kalır). | vitest 5 assert · eski davranış geri konunca **4'ü kırmızı** (ölçüldü) |
| ✅ | `frontend/app/(protected)/quotes/new/page.tsx:1565` | Seçiciyi çizen yer — artık kendi dizesini kurmuyor, `kaynakKolonEtiketi()` çağırıyor. | `d14856f` |

**Bu grubun cevapsız soruları:**

- `standart-sema.ts` tam yolu ne? Backend’de mi, frontend’de mi, ikisinde de kopyası var mı? — **CEVAPLANDI (HR1c, 02.08): `backend/src/modules/excel-grid/standart-sema.ts`, tek kopya.**

## C · EŞLEŞTİRME — malzeme adını kütüphaneyle eşleme

**Kullanıcı ne görür:** Yazdığın malzeme adının kütüphanedeki ürüne bağlanması; marka/varyant seçimi.

**Hata bu grupta şu cümlelerle gelir:** “yanlış ürünü buldu”, “marka gelmedi”, “aday çıkmıyor”, “siyah boru eşleşmiyor”

**Durum:** Bir davranış ÜÇ ayrı yoldan tetikleniyor (A otomatik eşleşme · B elle marka seçimi · C üçüncü yol). Bunu tesadüfen öğrendik. Haritanın en çok işe yarayacağı yer burası.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `backend/src/modules/matching/matching.service.ts:92-101` | Eşleştirme servisi — aday havuzu YALNIZ `UserLibrary(userId, brandId)`'den kurulur, global fallback YOK. `hazirlaPool` :140-203 üç durum: gerçek indeks / bayat→bellekte tazele / indekssiz→istek anında `manuelUrunIndeksle` (:158-168). `⛔ MARKA INDEKSLENMEMIS` uyarısı :197-201. | KALEM 58 keşfi 02.08 — okuma + nokta-teyit |
| ◑ | `backend/src/modules/matching/index/query-engine.ts` | Sorgu motoru — indeksten okuduğu alanlar satır düzeyinde: `belirsiz` :74 (havuz kapısı) · `adSlug` :81 (aile sert kilidi) · `sizeClass` :90 · token/çap filtreleri :354-391 · `boyTag` :397-401 · `birim` :435-443. Skorlama akışının tamamı okunmadı. | KALEM 58 keşfi 02.08 |
| ✅ | `backend/src/modules/matching/index/product-index.ts:368-374` | Ürün indeksi üretici — `buildRowKey` = sha1_16(sheetKey · adBucket · cinsNorm · baglantiNorm · capNorm · boyTag · kod); FİYATTAN ve sourceRow'dan bağımsız. `buildProductIndex` :380-454, `rebuildIndexFields` :472-481 (rowKey bilerek dışarıda). Kimlik `@@unique([priceListId, rowKey])` → aynı dosya yeniden yüklenince UPDATE, id korunur, kullanıcının iskontosu yaşar. | KALEM 58 keşfi 02.08 — okuma + nokta-teyit |
| ◑ | `backend/prisma/schema.prisma:308-355` | Veri modeli — `UserLibrary` (ekonomi kullanıcıda) ↔ `ProductIndex` :189-256 (yapı indekste): `productIndexId String?` :349, onDelete Cascade :348. `@@map` tüm şemada 0 → SQL'de tablo/kolon adları tırnaklı ve büyük-küçük duyarlı. Şemanın kalanı bu turda okunmadı. | KALEM 58 · KB1 02.08 |
| ◑ | `backend/src/modules/matching/index/types.ts:11-36` | `IndexedRow` tipi — id = UserLibrary satır id'si; ekonomi (listPrice/customPrice/discountRate/currency) kullanıcıdan, ürün yapısı indeksten. Dosyanın kalanı okunmadı. | KALEM 58 keşfi 02.08 |
| ⬜ | *(bilinmiyor)* | YOL A — otomatik marka/varyant ataması | Canlı kanıt: bugün ÇALIŞMIYOR |
| ⬜ | *(bilinmiyor)* | YOL B — elle marka seçimi | Canlı kanıt: bugün ÇALIŞIYOR (regresyon kapısı) |
| ⬜ | *(bilinmiyor)* | YOL C — üçüncü tetikleme yolu | Canlı kanıt: yarısı çalışıyor, yarısı çalışmıyor |

**Bu grubun cevapsız soruları:**

- Üç yol tek bir ortak fonksiyona mı giriyor, yoksa üç ayrı kopya mı var?
- Eşleştirme kuralları kaç dosyada yazılı? (3 PRD var, kod tarafı bilinmiyor.)
- Legacy `productIndexId=NULL` satırı sonradan indekse bağlayan bir yol var mı? — **CEVAPLANDI (KALEM 58, 02.08): YOK.** Kütüphaneye yazan tek dosya `library.service.ts`; dört oluşturma yolundan ikisi bağlar (manuel marka :196-201 · indeksten aktarım :443-444), ikisi NULL doğurur (POST /library :75-87 · legacy import :351-360); güncelleme yolları `productIndexId`'ye hiç dokunmaz; `importFromIndex` mevcutları YALNIZ `productIndexId` ile eşlediği için (:437-439) NULL'ları göremez — liste indekslendikten sonra tekrar aktarım, bağ kurmak yerine KOPYA satır yaratır.

## D · FİYAT — birim fiyat, iskonto, para birimi

**Kullanıcı ne görür:** Eşleşen ürünün fiyatının gelmesi; iskonto uygulanması; USD/EUR → TL çevrimi.

**Hata bu grupta şu cümlelerle gelir:** “fiyat gelmedi”, “iskonto işlemedi”, “dolar kuru yanlış”, “fiyat biçimi bozuk”

**Durum:** Birim fiyatlar CANLIDA GELİYOR (PANOVA ekran görüntüsü, 01.08). Sorun fiyatın gelmesinde değil, gelen fiyatın toplama girmemesinde — bkz. grup E.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ⬜ | *(bilinmiyor)* | Fiyat listesi içe aktarma | Duzeltme_Talebi_Fiyat_Listesi_Ice_Aktarimi |
| ⬜ | *(bilinmiyor)* | İskonto doldurma | PRD_Kutuphaneme_Aktarim_ve_Iskonto_Doldurma |
| ⬜ | *(bilinmiyor)* | Para birimi çevrimi (USD/EUR) | Duzeltme_Talebi_Export500_OD_Cevrim_ParaBirimi — canlıda ölçülemedi, dosyada döviz satırı var mıydı bilinmiyor |
| ⬜ | *(bilinmiyor)* | Fiyat biçimi (binlik/ondalık ayracı) | Duzeltme_Talebi_Fiyat_Bicimi_Belirsizligi |
| ◑ | `backend/src/modules/matching/pricing.ts:28-31` | `hesaplaNetFiyat(listeFiyat, iskontoYüzde)` = yukarıYuvarla(liste × (1 − iskonto/100)). İskonto 0 → net = liste. Yalnız bu fonksiyon okundu. | KALEM 58 keşfi 02.08 |
| ◑ | `backend/src/modules/matching/index/outcome-mapper.ts:49-54` | Eşleşme fiyatının hesaplandığı yer — `netFiyat`: taban = customPrice varsa o, yoksa toTry(listPrice ?? ürün.price, para birimi); net = hesaplaNetFiyat(taban, iskonto). Yalnız bu blok okundu. | KALEM 58 keşfi 02.08 |

**Bu grubun cevapsız soruları:**

- Şahinkul dosyasında USD/EUR satırı var mıydı? (Yoksa 15b kontrolü hiçbir şey ölçmedi.)

## E · TOPLAM — satır toplamı ve genel toplam

**Kullanıcı ne görür:** Miktar × birim fiyat = satır toplamı; satır toplamları = genel toplam.

**Hata bu grupta şu cümlelerle gelir:** “toplam ₺0 çıkıyor”, “fiyatlar geldi ama toplam gelmedi”, “genel toplam boş”

**Durum:** ŞU AN KIRMIZI — canlıdaki iki hatadan ikincisi. PANOVA’da birim fiyatlar geldi, malzeme toplamı ve genel toplam boş kaldı. ŞAHİNKUL’da fiyatlar genel toplama girmedi. ₺2.300.000,0 birim fiyatın üstünde GENEL TOPLAM ₺0,0 görüldü.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `standart-sema.ts:191-195` | Malzeme toplamı — ÇARPMA EKSİK. ADIM 0’ın hedefi. | Code raporu ADIM 0 §2; şablon ExcelGrid.tsx:285 |
| ✅ | `backend/test/standart-sema-test.ts` | 62.043.700 testi — TEK dosyanın toplamını doğruluyor, toplam özelliğini değil. Silinmeyecek, yanına ikincisi konacak. | GOREV_Kapatma_Turu; kalem 38 |
| ⬜ | *(bilinmiyor)* | İşçilik toplamı — ÇALIŞIYOR. Neden çalıştığı hâlâ yazılı değil. | Code raporu: “İşç. Toplam doluyor” — ama hangi dosyada olduğu söylenmedi |
| ⬜ | *(bilinmiyor)* | Genel toplam — satır toplamlarını toplayan yer | Canlı 01.08: boş geliyor |

**Bu grubun cevapsız soruları:**

- ★ TOPLAM KAÇ AYRI YERDE HESAPLANIYOR? — Bu sorunun cevabı yok. 62.043.700 dersinin tamamı bu cevabın eksikliğinden çıktı. Haritanın 1 numaralı görevi.
- İşçilik toplamı neden çalışıyor da malzeme toplamı çalışmıyor? İkisi aynı kodu mu kullanıyor?

## F · ÇIKTI — teklif dosyası üretimi

**Kullanıcı ne görür:** “Teklifi indir” → Excel/PDF dosyası iner.

**Hata bu grupta şu cümlelerle gelir:** “çıktıda kolon fazla”, “veri kayboldu”, “iki kere indirince bozuluyor”, “çap sembolü bozuk”

**Durum:** Çıktının YAPISI yeşil, ama yapının doğru olması içinin dolu olduğu anlamına gelmiyor: boş bir toplam sütunu da doğru yapıda çıkar.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ◑ | `standart-cikti.ts` | Çıktı yazıcısı — TEK yazıcı, ama assert’i yok (KF7) | GOREV_Kapatma_Turu: “tek yazıcı ama assert yok” |
| ⬜ | *(bilinmiyor)* | PDF üretimi | Mimari_Karar_Dis_Motor_Teklif_Ciktisi — Aspose/Carbone kararı ⏸ beklemede |
| ✅ | `teklif_ciktisi_mockup.html` | ÜRÜNDE DEĞİL — benim çalışma dosyam, referans mockup | 13.833 bayt, 20.07 |

**Bu grubun cevapsız soruları:**

- Çıktıdaki toplam sütunu, ekrandaki toplamı mı yazıyor, kendi hesabını mı yapıyor? (İkincisiyse toplam en az iki yerde hesaplanıyor demektir — bkz. grup E’nin ★ sorusu.)

## G · KÜTÜPHANE ve YÖNETİM

**Kullanıcı ne görür:** Kendi malzeme/işçilik kütüphaneni kurma, liste ekleme, fiyat listesi yükleme, yönetim ekranları.

**Hata bu grupta şu cümlelerle gelir:** “listeye eklenmiyor”, “kaydetmiyor”, “kütüphaneye aktarılmadı”

**Durum:** Bu grupta canlı doğrulama yapılmadı.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ◑ | `/api/admin/stats` | Yönetim istatistikleri ucu | Panel; ne döndürdüğü bilinmiyor |
| ◑ | `/api/quotes/` | Teklif ucu | Panel; ne döndürdüğü bilinmiyor |
| ✅ | `backend/src/library/library.service.ts` | Kütüphaneye (UserLibrary) yazan TEK dosya (grep + okuma ile teyit). Dört oluşturma yolu: `create` :63-88 (POST /library — productIndexId NULL doğar) · `createManualBrand` :105-239 (indeks kurup bağlar :196-201) · `importPriceList` legacy dalı :285-408 (NULL doğar :351-360) · `importFromIndex` :427-518 (bağlar :443-444; mevcutları YALNIZ productIndexId ile eşler :437-439). Güncelleme yolları productIndexId'ye dokunmaz. | KALEM 58 keşfi 02.08 — okuma + nokta-teyit |
| ◑ | `backend/src/library/library.controller.ts:40-74` | Kütüphane HTTP girişleri: POST /library · /library/manual-brand · /library/import-price-list. Satır oluşturan başka uç yok. Dosyanın kalanı okunmadı. | KALEM 58 keşfi 02.08 |
| ✅ | `backend/src/library/dto/create-library-item.dto.ts` | Manuel tek-satır ekleme DTO'su (tamamı okundu): `listPrice` alanı VAR ama service kullanmıyor; `productIndexId` alanı YOK. | KALEM 58 keşfi 02.08 |
| ◑ | `backend/src/admin/admin.service.ts` | İçe aktarım/indeks bölümleri satır düzeyinde: `commitImportCore` :743-802 → `saveBulkMaterials` :856-1130 (çift yazım: MaterialPrice + ProductIndex upsert(priceListId_rowKey) :1068-1072 · `removed` sayacı = MaterialPrice deleteMany :917-918 · bayat indeks satırı bilerek SİLİNMEZ :1085-1095) · `reindexProducts` :1379-1438 (yalnız ProductIndex'i tazeler, UserLibrary'ye hiç dokunmaz). Dosyanın kalanı (stats, kullanıcı yönetimi) okunmadı. | KALEM 58 keşfi 02.08 — okuma + nokta-teyit |
| ◑ | `backend/src/admin/admin.controller.ts:92-200` | Yönetim uçları haritası: reindex-products :95-98 · import-excel/commit (marka + fiyat listesi) · materials/save-bulk · save-from-sheets (legacy). Dosyanın kalanı okunmadı. | KALEM 58 keşfi 02.08 |
| ⬜ | *(bilinmiyor)* | Etiketleme motoru | PRD_Kutuphane_Etiketleme_Motoru |

## H · TESTLER — neyin doğru olduğunu İDDİA EDEN kod

**Kullanıcı ne görür:** Kullanıcı görmez. Ama bu projede en çok yanıltan katman burası oldu.

**Hata bu grupta şu cümlelerle gelir:** “testler yeşil ama üründe hata var”

**Durum:** KURAL: yeşil bir takım 🟡’dır, 🟢 değil. 🟢 için emre’nin canlı testi gerekir. Bu projedeki BEŞ gerçek ürün hatasının BEŞİ de bu katmanın dışında bulundu.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `e2e-golden/helpers.ts:139` | Popup kabı arayıcı — DOM’un ŞEKLİNE bakıyordu, iki farklı durumu tek değere eziyordu. DÜZELTİLDİ (KD5). Projenin en iyi kanıt zinciri. | Panel kalem 50 + KD5 |
| ✅ | `e2e-golden/sahinkul-golden.spec.ts:239` | Eski kırmızı — çözüldü | GOREV_Kapanis_Devam_2 |
| ✅ | `e2e-golden/sahinkul-golden.spec.ts:394` | KG13 — HÂLÂ KIRMIZI. C-D maskesi kalkınca ortaya çıktı. Regresyon değil, yeni görünen eski hata. | Panel kalem 51 |
| ✅ | `golden.spec.ts:161` | 17a’nın repodaki TEK izi — ve o da bir YORUM SATIRI. Yorum kod değildir. | Panel satır 17 |
| ◑ | `bolum-f-kabul.spec.ts` | Bölüm F kabul testi — bir oturumda 0 koşum | GOREV_Kapatma_Turu |
| ◑ | `frontend/components/excel-grid/aday-ayirt-edicilik.test.ts` | Aday ayırt edicilik testi | GOREV_Kapatma_Turu |
| ✅ | `regression-all.ts` | SUITES listesi — package.json’daki her test:* burada olmalı (PK1) | GOREV_Sirada |
| ✅ | `backend/test/matching-regression.ts` | `test:regression:db` — ÇAYIROVA (id :27 hardcoded) gerçek-DB uçtan uca eşleştirme: 10 vaka, 9'unda beklenen netPrice. Ön koşul kapısı :158-172 (ProductIndex=0 → çıkış 2 SKIP). AÇIK SORU :153-157 kapatılmadı: istek-anında-indeksle geri-düşüşü 116 satırı indeksliyor ama 0 eşleşme veriyor. | KALEM 58 keşfi 02.08 — okuma + nokta-teyit |
| ✅ | `backend/test/pk9-sessiz-indeks-test.ts` | PK9 sözleşmesi — "geri-düşüş tek başına yeter mi? CEVAP: HAYIR": indekssiz satır warn kanalından, markanın tamamı indekssizse INDEKSLENMEMIS uyarısı (mock prisma, DB istemez). | KALEM 58 keşfi 02.08 |
| ✅ | `package.json` | 13 bilinen test scripti: test:tam · test:regression · test:e2e-golden · test:of · test:library · test:ke · test:admin-import · test:perf · test:kb · test:gs · test:ex · test:export · test:sahte | Belgelerden sayıldı — repoda kaç tane olduğu doğrulanmadı |
| ✅ | `scripts/harita-uret.mjs` | Haritanın **otomatik alt katmanını** üretir (`git ls-files` → dosya+satır, import bağlılıkları, uç noktalar, gerçek `test:*` listesi). Yorum içermez. `--agac` kipi dizin ağacı basar. | HR1 · komut çıkışı 0: 295 kod dosyası · 59.651 satır · 124 uç · 33 test:* |
| ✅ | `scripts/harita-denetle.mjs` | **Harita denetim kapısı** (`npm run test:harita`). Kod dosyası ne haritada ne bekleyenlerde ise, bekleyenler uzadıysa ya da bekleyenlerde artık var olmayan dosya varsa **çıkış 1**. | HR3-RET: sahte dosyayla **çıkış 1**, silinince **çıkış 0** — ret yolu ateşlendiği görüldü |
| ✅ | `harita-kapsam-disi.txt` | Kapsam tanımı — hangi uzantı kod sayılır, hangi yol dışarıda. Betiğin **içine gömülmedi**: bu bir iddiadır, görünür durmalı. Her desen gerekçeli. | HR1 · `## 5 · Kapsam disi` tablosu |
| ✅ | `harita-bekleyenler.txt` | Haritada karşılığı olmayan dosyaların **borç listesi**. HR4 cırcırı: yalnız kısalır. | HR4 kasten tetiklendi: 283→284 yapılınca **çıkış 1**, geri alınınca **çıkış 0** |

**Bu grubun cevapsız soruları:**

- ~~package.json’da gerçekten 13 test scripti mi var, daha fazla mı?~~ **CEVAPLANDI (HR1b, 02.08.2026): 33.** Fark +20 (+23 / −3). Belgede olup repoda olmayan: `test:ke` · `test:kb` · `test:sahte`. Sayı belgeden değil, artık `package.json`’dan üretiliyor (`KOD_HARITASI_OTOMATIK.md` §4).

## I · DERLEME ve CANLIYA ÇIKIŞ

**Kullanıcı ne görür:** Kullanıcı görmez — ama görmediği için bu projede beş tur kaybedildi.

**Hata bu grupta şu cümlelerle gelir:** “deploy ettim ama değişmedi”, “canlıdaki sürüm eski”

**Durum:** ŞU AN AÇIK: depodaki sürüm (9635d43) canlıdakinin (6846423) ÖNÜNDE. Bugün canlıda yapılan her test ESKİ yapıyı ölçüyor.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `scripts/deploy.sh` | Dağıtım betiği. Tekrar-deneme yolu ateşlendi (502 → deneme 1/10 → DOĞRULANDI). RET yolu (çıkış kodu 1) HİÇ ateşlenmedi — KD8 açık. Ateşlendiği görülmemiş kapı, kapı değildir. | Panel kalem 53 + KD8 |
| ✅ | `backup.sh` | Yedekleme — sunucudaki kopyası eski bir commit’teydi | Panel |
| ✅ | `scripts/kb5-olcu.sh` | KALEM 58 salt-okuma ölçüm betiği (deploy.sh deseni: özel karakterler dosyada durur, konsola düz satır yazılır). Dört sayıyı tek sorguda döner; BEGIN READ ONLY + ROLLBACK; bağlantı yolu = backup servisinin her gün çalışan yolu (backup.sh:7 ikizi). Çıkış: 0 = ölçüm · 2 = ön koşul yok · diğer = hata. | KALEM 58 · KB2-KB4 02.08 — yerelde 0 ve 2 yolları ateşlendi |
| ✅ | `docker-compose.yml` | Tek sunucu yığını: caddy + frontend + backend + dwg-engine + db (postgres:16, :16-29) + backup (:113-126, günlük pg_dump). DB kimlikleri .env'den (:20-22, :119-122); backend DATABASE_URL :64. | KALEM 58 · KB1 02.08 |
| ✅ | `setup_env.sh` | Ortam kurulumu — izlenmeyen dosya olarak duruyor (?? setup_env.sh) | CANLI_DOGRULAMA_LISTESI |
| ✅ | `nest-cli.json:6` | Giriş dosyası ayarı — tsconfig.json:17 ile çelişince MODULE_NOT_FOUND üretti. Düzeltildi, ama TEKRARINI ENGELLEYEN HİÇBİR ŞEY YOK. | Panel kalem 47 + PK12b |
| ✅ | `backend/tsconfig.json:17` | Yukarıdakinin çelişen tarafı | Panel kalem 47 |
| ◑ | `tsconfig.build.json` | Derleme ayarı | GOREV_Kapanis_Devam |
| ◑ | `regression.yml` | CI iş akışı — ama fixture’lar repoda yok (.gitignore:51 `*.xlsx`), yani CI senin makinende yeşil olanı ölçemiyor. **Tam yolu bilinmiyor** — belgelerde hep yalnız dosya adı geçti, klasörü hiç yazılmadı. | Panel kalem 36 + PK4 (yol doğrulanmadı) |
| ✅ | `.gitignore:51` | `*.xlsx` — CI fixture deliğinin sebebi | Panel kalem 36 |
| ✅ | `/api/health` | build_sha döndürür — canlıdaki sürümün tek doğrudan kanıtı | Panel kalem 40, kapandı |

**Bu grubun cevapsız soruları:**

- nest-cli.json ↔ tsconfig.json çelişkisinin tekrarını engelleyen bir test var mı? (Bilinen cevap: yok.)

---

## Ürün kodu OLMAYAN dosyalar

Karıştırılmasın diye ayrı duruyor.

| Dosya | Ne | Nereden |
|---|---|---|
| `dogrula.py` | Fiyat listesi dönüşüm doğrulaması — BENİM betiğim, üründe değil | DEVIR_Fiyat_Listesi_Donusum_Talimati |
| `teklif_ciktisi_mockup.html` | Teklif çıktısı mockup — BENİM dosyam, üründe değil | çalışma dizininde doğrudan görüldü, 13.833 bayt, 20.07 |
| `Mekanik_Malzeme_AD_CINS_Sozlugu.xlsx` | Malzeme sözlüğü — veri, kod değil | 13.07 |

---

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
