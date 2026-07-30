# FAZ 3 — KABUL RAPORU (PRD Kesin Çözüm · Bölüm D + Rapor Formatı §2-§4)

**Tarih:** 30.07.2026 · **PRD:** `PRD_Kesin_Cozum_SurukleDoldur_KolonHaritasi_OncedenFiyatliVeri.md`
**Önceki fazlar:** FAZ 0 kök neden → `FAZ0_KOK_NEDEN_RAPORU.md` · FAZ 1-2 düzeltmeler → `ba2fab6`, `d3402cd`, `48d1698`, `fb3f209`, `1e1aa85`, `8ca1bbf`

Bu rapor yalnız **kanıtlı** satır içerir. Kanıt sütunu boş satır = yapılmamış sayılır (PRD kuralı).

---

## 1. Bu fazda eklenenler

| Ne | Nerede | Neden |
|---|---|---|
| **Bölüm D uçtan uca senaryosu** | `frontend/e2e-golden/sahinkul-golden.spec.ts` | 10 dosyalık altın yol koşumunun **11. testi**; gerçek tarayıcı + gerçek yığın + gerçek ŞAHİNKUL dosyası |
| **C11 = KE21 "fazladan kolon yok"** | `frontend/e2e-golden/verify.mjs` | 28-29.07 koşumu C1-C10'u yeşil verdi; hiçbir kriter kolon SAYISINA bakmıyordu, ŞAHİNKUL çıktısındaki M/N kolonları görünmedi |
| Kolon kimliği çözümü (başlıktan) | `sahinkul-golden.spec.ts` · `helpers.ts` | Bölüm B/C sonrası fiyat kolonları dosyanın KENDİ kolonları (`col6…col11`); `_matBirim` sabitleyen ölçüm bu dosyada hiçbir hücre bulamıyor |
| Popup'ta **tercih deseni** | `helpers.ts → resolvePopupIfAny(…, tercih?)` | Kör "ilk aday" politikası kaynak satıra grup başlığıyla ilgisiz ürün atıyordu; senaryo artık kullanıcı gibi `/galvaniz/i` seçiyor (10 dosyalık koşumun davranışı DEĞİŞMEDİ — desen verilmezse yine ilk aday) |
| Detay sayfası marka etiketi | `app/(protected)/quotes/[id]/page.tsx` | §5 — gerçek ürün hatası |

---

## 2. Kriter tablosu — SD1-SD10 · KE15-KE21 · KG9-KG13

Kısaltmalar: **B** = birim test · **E** = uçtan uca (Bölüm D, gerçek tarayıcı) · **K** = kod/diff kanıtı.

### BÖLÜM A — Sürükle-Doldur (SD1-SD10)

| # | Durum | Kanıt |
|---|---|---|
| SD1 tek modül/tek motor | ✅ | **K** `frontend/components/excel-grid/fill-down.ts` (izole modül; işçilik dalı aynı modülü `dal:'iscilik'` ile sürer) · ExcelGrid.tsx'teki 149 satırlık inline blok SİLİNDİ (`d3402cd`, ExcelGrid −126/+71) · **B** `fill-down.test.ts` "SD1 tek motor: 6 hedef, 6 motor çağrısı" |
| SD2 atomik satır sonucu | ✅ | **B** SD2 (2 fiyat + 2 aday + 2 yok, sessiz boş 0) · SD2b (motor exception → `hata` işareti) · SD2c (boş ad → `ad-yok`) · **E** Bölüm D: 6/6 hedef hem fiyat hem rozet taşıyor (`rozet=otomatik-varyant`), **sessiz boş 0** (`senaryo.json → SD.faz_A_surukleme`) |
| SD3 kaynak fiyat kopyalanmaz | ✅ | **B** SD3 (52,4 hiçbir hedefe yazılmadı; 6 satır 6 farklı fiyat) · **E** 6 hedef 6 FARKLI fiyat (₺96,1 · ₺141,1 · ₺182,0 · ₺208,4 · ₺291,2 · ₺372,8) — hepsi kütüphanedeki kendi çapının galvaniz fiyatı; kaynak ₺80,5 hiçbirine kopyalanmadı |
| SD4 miras + çap ayrıştırma | ✅ | **K** FAZ 0 ölçümü: `buildMaterialContextFromRows` → "GALVANİZ ÇELİK BORU ¾"…", `extractSizeInfo` ½ ¾ 1¼ 1½ 2½ hepsi doğru (`FAZ0_KOK_NEDEN_RAPORU.md` §A) |
| SD5 ŞAHİNKUL kabulü | ✅ | **B** SD5 (tutar = miktar × birim) · **E** sürükleme TEK ADIMDA 6/6 fiyatladı: ¾"→₺54.296,5 (565 mt) · 1"→₺19.754,0 (140 mt) · 1¼"→₺41.860,0 (230 mt); GENEL TOPLAM malzeme ₺0,0 → **₺137.352,7** |
| SD6 eylemli işaret | ✅ | **K** `48d1698` · **B** SD6, SD6b · **E** tooltip birebir yakalandı: *"Seçilen varyant bu çapta kütüphanede yok — elle seçin. · 2 aday var — marka menüsünü açıp seçin"*; rozetten popup açılıp 6 satırın 6'sı fiyatlandı |
| SD7 Ctrl+Z tek adım | ⚠️ **B** | **B** SD7 "geri-alma anlığı tek pakette döner". **E kapsamı YOK** — Bölüm D senaryosu Ctrl+Z sınamıyor (PRD Bölüm D adımlarında yok). Dürüst boşluk. |
| SD8 oto-atama anahtarı | ✅ | **B** SD8 "veri satırı olmayan hedefler atlanır ama sayımda görünür" |
| SD9 E2E kalıcı pakette | ✅ | **K** `frontend/e2e-golden/sahinkul-golden.spec.ts` → `npm run test:e2e-golden` artık **11 test** koşuyor |
| SD10 kapsam ≥%90 + duyarlılık | ✅ | **B** v8 coverage `fill-down.ts`: **stmts %97,67 · lines %98,64 · funcs %100** (branch %71,79) · SD10 "çap değişince fiyat DEĞİŞİYOR" |

### BÖLÜM B — İki katmanlı başlık (KE15-KE21)

| # | Durum | Kanıt |
|---|---|---|
| KE15 iki katmanlı başlık çözümü | ✅ | **B** `test:kb` KE15 (MALZEME.BİRİM_FİYAT = G) · KE15b (MALZEME.TUTAR = H) · KE15c |
| KE16 eşleşme varken kolon eklenmez | ✅ | **B** `test:kb` KE16 (M+ başlıkları boş) · **E** C11 (aşağıda) |
| KE17 harita persist + iki export aynı | ✅ | **K** tek yazıcı `writePricesToWorkbook` (KF7) — her iki indirme de `buildExportWorkbook` üzerinden · **B** `test:ke` KF7 "teklif-format yolu: eklenen kolon + değerler kopyada, eksikDeger=0" |
| KE18 sistem şablona formül icat etmez | ✅ | **B** `test:kb` KE18 (`=E108*M108` yasağı: eklenen kolona referanslı formül YOK) |
| KE19 "Onarıldı" yasak | ✅ | **B** `test:kb` KE19 (bağımsız round-trip okuma) · **E** her koşumda 3 xlsx exceljs ile yeniden okunuyor (C5/C9/C11 bu okumaya dayanır) |
| KE20 kök neden dökümü | ✅ | **K** `FAZ0_KOK_NEDEN_RAPORU.md` §B · **B** KE20/20b/20c (`basligaUyar` sözleşmesi; "YALNIZ MALZEME → matUnit OLMAZ") |
| KE21 fazladan kolon yok (4 dosya) | ✅ | **B** `test:kb` KE21/KE21b (gerçek ŞAHİNKUL) · **E** yeni **C11** kriteri 11 artefaktın hepsinde koşuyor (§4) |

### BÖLÜM C — Önceden girilmiş fiyatlar (KG9-KG13)

| # | Durum | Kanıt |
|---|---|---|
| KG9 tüm dolu fiyatlar içe alınır | ✅ | **B** `test:of` KG9 · KG9b (merge-gizli kolon rol taşıyamaz, `8ca1bbf`) · KG9b-2 · KG9b-3 |
| KG10 ŞAHİNKUL kabulü | ✅ | **B** `test:of` KG10/10b/10c · **E** yüklemede **85 satırda** dosyanın işçilik birim fiyatı görünür (₺4.000 · ₺830 · ₺3.000 …), GENEL TOPLAM **₺3.730.534,0** dosyadan gelen değerlerle hesaplandı |
| KG11 revize serbest + kaynak rozeti | ✅ | **B** `test:of` KG11 ("dosyadan" rozeti) · **E** Faz B'de dosyadan gelen satırların üzerine kütüphane fiyatı yazıldı (açık kullanıcı eylemi) |
| KG12 kayıpsız gidiş-dönüş | ✅ | **E** C5 (grid'de dolu her değer çıktıda, düzen birebir) + C11 (fazladan kolon yok) — §4 matrisi |
| KG13 para birimi karışımı yasak | ✅ | **B** `test:of` KG13 · **E** USD görünümünde 48 çift ölçüldü, **sapma 0**: ampirik kur 47,4127 ≡ etiket ₺47,41 (TCMB 30.07.2026); dosyadan gelen işçilikler (₺4.000→$84,4) ve kütüphaneden gelen malzemeler (₺600→$12,7) AYNI katsayıyla |

---

## 3. Silinen eski kod envanteri

| Silinen | Nerede | Yerine ne geldi |
|---|---|---|
| **149 satırlık inline doldurma bloğu** (`_marka` ve `_firma` için birbirinden bağımsız evrilmiş İKİ dal; K19 geri-alma yalnız marka dalındaydı) | `ExcelGrid.tsx` (`d3402cd`: −126 / +71 satır) | `fill-down.ts` — tek modül, tek motor, SD2 sözleşmesi çalışma-zamanı assert'iyle kilitli |
| `setDataValue('_matStatus', …)` ile işaretleme (AG-Grid kolonu olmadığı için **sessizce yok sayılıyordu** — FAZ 0 §A kök nedeni) | `ExcelGrid.tsx` fill + elle seçim dalları | modülün `yaz()` yardımcısı: önce `node.data`, kolon varsa `setDataValue`, sonra `refreshCells({force:true})` |
| `} catch {}` — motor hatalarını yutan sessiz blok | `ExcelGrid.tsx` fill döngüsü | `durum='hata'` + `_matSebep` (SD2b birim testiyle kilitli) |
| **`dropCols`** — dosyanın kendi fiyat kolonlarını grid'den ATAN dal + sistem kolonlarını (`_matBirim`, `_matToplam`, `_labBirim`, `_labToplam`, `_toplam`) rol olarak DAYATAN atama | `excel-grid.service.ts` (`ba2fab6`) | dosyanın fiyat kolonları rolde kalır (`col5…col8`); sistem alanı yalnız GERÇEKTEN kolon yoksa (KG9b: görünür hedef yoksa) devreye girer |
| `fieldToCol` kolon çevriminde ofsetsiz `idx+1` | `export-engine.ts` (`ba2fab6`) | `idx + 1 + colOffset` — ŞAHİNKUL'da A boş olduğu için tüm fiyatlar BİR KOLON SOLA kayıyordu |

**Mükerrer yol taraması (FAZ 0 §C'nin devamı):** doldurmanın `_marka`/`_firma` iki dalı tek modüle indirildi (`d3402cd`); export tarafında tek yazıcı (`writePricesToWorkbook`) zaten yürürlükteydi ve iki indirme yolu da onu çağırıyor (KF7). Kalan bilinen mükerrerlik: `build-material-context` FE+BE iki kopya — bu turda DOKUNULMADI, Arınma backlog'unda.

---

## 4. Koşum — önce KIRMIZI / sonra YEŞİL

### 4a. C11 (KE21) — fix ÖNCESİ artefaktlar üzerinde KIRMIZI

Kanıt dosyası: `frontend/e2e-artifacts/golden/report-C11-KIRMIZI-fix-oncesi.md`
(28-29.07 koşumunun çıktıları; kolon ölçütü o gün YOKTU, matris C1-C10 yeşildi → `report-2807-C1-C10.md`)

| Dosya | C11 | Kanıt |
|---|---|---|
| 02-bahcecicler | ✗ | `Sayfa1!G/H` eklendi — şablonda **E "Malz.B.F.( USD )"** ve **F "Malz.T.F."** zaten bu anlamda |
| 03-bursa-demirtas | ✗ | `İnşai işler BİNA!N`, `SAHA!N`, `Mekanik!N` eklendi — şablonda **H "Malzeme Br. Fiyat"** var (18 değer) |
| 06-skychem | ✗ | `TEKLİF(YSS)!I` eklendi — şablonda **E "MALZEME BİRİM"** var |
| **08-sahinkul** | ✗ | `YANGIN!M/N` + `VRV-VRF!M/N` eklendi — şablonda **G/H** (iki katmanlı: R3 "MALZEME" + R4 "BİRİM FİYAT") zaten bu anlamda → **PRD'nin kanıt vakası** |
| 05-hangar · 10-yangin | ✓ | Ekleme var ama **meşru (KF2)**: şablonda malzeme fiyat başlığı gerçekten yok (Hangar yalnız "İŞÇİLİK BİRİM FİYAT" taşıyor) |
| 01 · 04 · 07 · 09 | ✓ | Şablon dışına kolon eklenmedi |

**Ölçüt bağımsızdır:** doğrulayıcı backend'in `basligaUyar`'ını ÇAĞIRMAZ (çağırsaydı kontrol totoloji olurdu); kolonun üst üste yığılmış başlık metnini kendi düzenli ifadeleriyle yorumlar.

**Ölçümde düşülen tuzak (kayda geçer):** ilk sürüm başlık bandını `headerEndRow+1` ile sınırlıyordu → ŞAHİNKUL'un **R4 alt başlığı** okunmuyordu, iki katmanlı başlık "MALZEME"de kesiliyor ve ihlal **"meşru ekleme"** sanılıyordu (yani kontrol sessizce yalan söylüyordu). Band en az 12 satıra çıkarıldı; ŞAHİNKUL kırmızıya döndü.

### 4b. Bölüm D senaryosu — YEŞİL (gerçek tarayıcı, yerel tam yığın)

`npx playwright test -c playwright.golden.config.ts sahinkul-golden` → **1 passed (33,0s)**
Artefaktlar: `frontend/e2e-artifacts/golden/11-sahinkul-altin-senaryo/` (senaryo.json · 4 ekran görüntüsü · 3 xlsx · save/saved payload)

| Adım (PRD Bölüm D) | Sonuç | Kanıt |
|---|---|---|
| 1. Yükle → işçilikler görünür | ✅ | 85 satırda dosyanın işçilik birim fiyatı (₺4.000 · ₺830 · ₺3.000 · ₺450 …); GENEL TOPLAM ₺3.730.534,0 |
| 2. ½"→2½" sürükle | ✅ | **Tek adımda 6/6**: kaynak ½" ₺80,5 (Galvanizli Dişli Manşonlu) → ¾"=₺96,1 · 1"=₺141,1 · 1¼"=₺182,0 · 1½"=₺208,4 · 2"=₺291,2 · 2½"=₺372,8 — hepsi kütüphanedeki KENDİ galvaniz fiyatı, kaynak kopyalanmadı; tutar=miktar×birim (¾"→₺54.296,5); GENEL TOPLAM malzeme ₺0 → **₺137.352,7**; sürükleme sırasında HİÇ popup açılmadı (tek popup kaynak satırdaydı) |
| 3. Kaydet → yeniden aç | ✅ (1 bug düzeltildi) | Fiyatlar ve marka kimliği geri geldi; **marka ETİKETİ gelmiyordu** → §5 |
| 4. USD | ✅ | 48 çift, sapma 0; ampirik kur 47,4127 ≡ etiket ₺47,41 (TCMB 30.07.2026); dosyadan gelen işçilik (₺4.000→$84,4) ile kütüphane malzemesi (₺600→$12,7) AYNI katsayı |
| 5-6. İki export + ikinci indirme | ✅ | fiyatli.xlsx · teklif.xlsx · fiyatli-2.xlsx üretildi (C5/C6/C9/C11 doğrulayıcıda) |

**İlk koşumun yanıltıcı sonucu ve düzeltilmesi (kayda geçer):** E2E'nin kör "popup'ta ilk adayı seç" politikası, kaynak ½" satırına grup başlığıyla İLGİSİZ bir ürün atıyordu ("Basınçlı Boru Siyah Düz Uçlu" — bu aile ¾"–2½" arasında kütüphanede yok). Sonuç: sürükleme her hedefte SD6 işareti bırakıyordu (tooltip birebir: *"Seçilen varyant bu çapta kütüphanede yok — elle seçin. · 2 aday var — marka menüsünü açıp seçin"*) ve ölçüm "sürükleme tek adımda fiyatlamıyor" gibi okunuyordu — **ürün hatası değil, ölçüm hatasıydı**.

Düzeltme: `resolvePopupIfAny` bir **tercih deseni** alıyor; senaryo satırın kendi bilgisine (grup başlığı "GALVANİZ ÇELİK BORU") uyan `/galvaniz/i` varyantını seçiyor — yani gerçek kullanıcının yaptığını. Yerel kütüphanede "Su ve Yangın Tesisat Borusu" ailesi her çapta 5 varyant taşıyor (Galvanizli Dişli Manşonlu / Galvanizli Düz Uçlu / Siyah Dişli / Siyah Düz / Kırmızı Boyalı) ve ½"–6" arası eksiksiz; galvaniz seçilince her çapta TEK aday kalıyor ve sürükleme tek adımda fiyatlıyor. **Ders:** E2E'nin seçim politikası senaryonun ölçtüğü şeyi belirler; kör "ilk aday" politikası ürünü haksız yere suçlayabilir.

### 4c. Tam 11 dosyalık koşum — KOŞULMADI (kullanıcı kararı)

Koşum başlatıldı, **kullanıcı isteğiyle 4. testte durduruldu**; testleri kullanıcı kendisi yapacak.
Koşan üç dosya YEŞİL:

| Test | Süre |
|---|---|
| 01-beykoz-okul | 41,8 s ✅ |
| 02-bahcecicler-mobilya | 58,1 s ✅ |
| 03-bursa-demirtas (6 sayfa · 1694 satır) | 10,2 dk ✅ |
| 11-sahinkul-altin-senaryo (ayrı koşum) | 33,0 s ✅ |

11 satırlık C1-C11 matrisi bu raporda YOK. Alınması gerektiğinde:

```
npm run test:e2e-golden
```

(yerel yığın ayakta olmalı: PG + BE 3001 + FE 3005, `frontend/.env.local` → `http://localhost:3001/api`)

---

## 4d. Açık gözlemler (bu turda DOKUNULMADI)

- **Aday sayısı iki bağlamda farklı okunuyor:** SD6 tooltip'i *"2 aday var — marka menüsünü açıp seçin"* diyor (`_matAdaySayisi` = sürükleme sorgusunun VARYANT KISITLI aday sayısı, `fill-down.ts:213`), menü açılınca kısıtsız liste 10 aday gösteriyor. İkisi de kendi bağlamında doğru ama kullanıcıya tutarsız görünebilir. Sürükleme artık tek adımda fiyatladığı için bu yol seyrek; not olarak bırakıldı.
- **SD7 (Ctrl+Z) uçtan uca sınanmıyor** — yalnız birim testte (`fill-down.test.ts` SD7). PRD Bölüm D adımlarında yok.

---

## 5. Bu koşumun bulduğu GERÇEK ürün hatası

**Kaydedilen teklif yeniden açılınca marka seçimi görünmüyor.**

- **Semptom:** fiyatı yazılmış her satırda "Marka sec..." — kullanıcı için "seçimlerim gitmiş".
- **Kök neden:** `/quotes/[id]` (detay) sayfası `ExcelGrid`'e `brands={[]}` veriyordu. Kayıtta `_marka` yalnız marka KİMLİĞİ (`3ba57a23-…`); etiket `brandOptions.find(o => o.value === _marka)?.label` ile çözülüyor, liste boş olunca placeholder düşüyor. Veri kaybı YOK (payload ↔ saved-quote karşılaştırması: kimlik birebir korunmuş).
- **Düzeltme:** detay sayfası markaları Düzenle ekranıyla AYNI kaynaktan çekiyor (`/library/brands` — Kütüphanem izolasyonu).
- **Regresyon kilidi:** Bölüm D senaryosu artık etiketin çözülmesini bekliyor ve `çayırova` görmezse KIRMIZI (`C4: yeniden açılışta marka SEÇİMİ de görünmeli`).

---

