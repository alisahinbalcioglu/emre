# T6 — SİLME ENVANTERİ (silmeden ÖNCE raporlanır)

**PRD:** `PRD_Standart_Grid_Semasi_ve_Aday_Ayirt_Edicilik.md` §Bölüm E (T1-T6) · **Tarih:** 30.07.2026
**Kural (T6):** "Emin olunamayan kod silinmez, 'karar bekliyor' listesine yazılır."
**Protokol:** her madde ayrı commit · her commit sonrası tam regresyon · silme öncesi 0-referans kontrolü.

Bu envanter **öneri**dir; hiçbir satır henüz silinmedi.

---

## 1. SİLİNECEK — dinamik kolon haritalama (T1/T3)

### 1a. `backend/src/modules/excel-grid/excel-grid.service.ts` (932 satır)

| Satır | Ne | Satır sayısı | Neden |
|---|---|---|---|
| 624-635 | `detectColumnRoles` içindeki **fiyat/tutar rol desenleri** (materialUnitPrice · materialTotal · laborUnitPrice · laborTotal · grandUnitPrice · grandTotal) | ~12 | GS1: dosyadan yalnız No · Ad · Miktar · Birim okunur. Fiyat rolü aranmaz. |
| 333-340 | **KG9b** merge-gizli fiyat rolü düşürme savunması | 8 | Fiyat rolü kalmayınca savunacak bir şey yok |
| 341-360 | `rolluFiyatKolonlari` + `PRICE_HEADER_RE` ikinci tarama | ~20 | Aynı sebep |
| 452-470 | `fixedSchema` rol yönlendirme bloğu (`if (!roleFields.materialUnitPriceField) … = '_matBirim'`) | 19 | Sabit şemada roller zaten sabit; yönlendirme gereksiz |
| 850-860 | "İSİM SÜTUNU FİYAT ROLÜ OLAMAZ" savunması | 11 | Fiyat rolü taraması kalkınca çakışma imkânsız |
| 907-912 | `mapRolesToFields` fiyat/tutar eşlemeleri | 6 | Aynı |
| 916-93x | `guessWidth` fiyat kolonu genişlik dalları | ~8 | Sabit şema genişlikleri kullanıcı tarafından ayarlanır (GS8) |
| **Toplam** | | **~84** | |

**Etkilenen davranış:** `columnRoles` yalnız `noField · nameField · quantityField · unitField` taşır. `ColumnRoles` arayüzünün (satır 69-81) fiyat alanları da kalkar.

### 1b. `backend/src/quotes/export-engine.ts` (715 satır)

| Satır | Ne | Satır sayısı | Neden |
|---|---|---|---|
| 97-104 | `basNorm` — TR-bilinçli başlık normalizasyonu | 8 | Yalnız başlık eşleştirici kullanıyor |
| 119 | `FiyatAnlam` tipi | 1 | Aynı |
| 124-137 | `basligaUyar` — anlamsal başlık eşleştirici (KE3/KE7) | 14 | EX1: çıktı artık müşterinin şablonuna değil, **standart 9 kolona** yazılır |
| 243-253 | `kolonBasligi` · `basligaGoreKolon` · `kullanilanKolon` | 11 | Aynı |
| 256-270 | `baslikSonDolu` · `nextCol` · `bosBaslikKolonu` (KF2 ekleme ucu) | 15 | Kolon EKLEME dalı tamamen düşer (KE16 zaten "eklenmesin" diyordu) |
| 271-307 | `kolonAta` — colN round-trip + KF2 ekleme + colOffset | 37 | Aynı |
| **Toplam** | | **~86** | |

**⚠ Bu silme, ürün davranışını değiştirir:** "Fiyatlandırılmış Excel" artık **müşterinin kendi dosyası değil**, 9 kolonlu standart dosya olur (PRD Bölüm C / pano #26).
**KULLANICI ONAYI ALINDI (30.07.2026):** *"evet onay veriyorum"* — fiyatlı çıktı standart 9 kolon; müşterinin şablonuna yazma bırakılıyor. KE16 · KE17 · KE21 kriterleri de bu yüzden düşer (üst belge uyarı kutusu).

### 1c. `frontend/components/excel-grid/ExcelGrid.tsx` (2540 satır)

| Satır | Ne | Karar |
|---|---|---|
| 654-669 (`quotes/new/page.tsx`) | `handleNameFieldChange` — yalnız `nameField` değiştiriyor, satırları YENİDEN SINIFLANDIRMIYOR | **YENİDEN YAZILACAK** (GS6), silinmeyecek |
| 514-670 (157 satır) | Aday popup'ı (stage1/stage2 · 60 karakter kesim · sabit 400px) | **YENİDEN YAZILACAK** (PU2/PU3/PU4), silinmeyecek |
| 1020-1089 | `buildMaterialContextDetailed` — yalnız YUKARI tarama | **GENİŞLETİLECEK** (PU1: alttaki nitelik satırları), silinmeyecek |

---

## 2. SİLİNECEK/TAŞINACAK — testler (T4)

| Dosya | Satır | Karar |
|---|---|---|
| `backend/test/export-kolon-esleme-test.ts` (`test:ke`) | 531 | KE1-KE14 şablona-yazma varsayımına dayanıyor → **standart yazıcı testleriyle değiştirilecek** |
| `backend/test/iki-katmanli-baslik-test.ts` (`test:kb`) | 235 | KE16/KE17/KE21 **düşer**; KE15 (MF2 için) · KE18 · KE19 · KE20 **kalır** → dosya küçültülür |
| `backend/test/onceden-fiyatli-test.ts` (`test:of`) | 165 | KG9-KG13 → **MF1-MF6'ya taşınır** (aynı dosyada yeniden adlandırma) |
| `frontend/e2e-golden/verify.mjs` C11 (KE21) | ~60 | **Düşer** — fazladan kolon kavramı standart çıktıda yok |
| `backend/test/export-format-test.ts` · `export-live-sim-test.ts` | 405 + 379 | **KARAR BEKLİYOR** (aşağıda) |

---

## 2b. KULLANICI KARARLARI (30.07.2026)

| Konu | Karar |
|---|---|
| **Özet sayfası (İcmal)** | Grid'de **görünür**, okunur/düzenlenebilir; "özet sayfa" işaretlenir → **teklif geneli toplamına ve fiyat eşleştirmesine GİRMEZ**. (Aksi halde YILDIZ'da 62.043.700 → 124.087.400 olurdu.) |
| **Dosyanın MARKA sütunu** | **Tamamen atılır** — GS1 harfiyen. YILDIZ'daki `Reliable, Tyco, Victaulic` · `AGF, Giacomini` · `HİLTİ / FISCHER` metinleri grid'e de sorguya da girmez. |
| **Eski kayıtlı teklifler** | **Açılışta dönüştürülür** (fiyatlar sabit hücrelere taşınır); kaydedince yeni şemayla yazılır. Toplu DB migration YOK. |
| **Fiyatlı çıktı** | Standart 9 kolon; müşterinin şablonuna yazma bırakılıyor (önceki onay). |

---

## 3. KARAR BEKLİYOR (silinmiyor — kullanıcı/ölçüm gerekiyor)

| # | Kod | Neden emin değilim |
|---|---|---|
| K1 | `export-format-test.ts` + `export-live-sim-test.ts` (784 satır) | "Teklif Formatında Aktar" (EX8) kullanıcının kendi format dosyasını kullanmaya DEVAM ediyor; bu testlerin hangi kısmı şablon-yazıcısına, hangisi format motoruna ait — satır satır ayrıştırılmadı |
| K2 | `writePricesToWorkbook` (export-engine.ts:190-…) tamamı | EX8 "liste sayfalarına enjekte edilen tablo standart 9 kolondur" diyor. Enjeksiyon hâlâ bir workbook'a yazma; fonksiyonun ne kadarının kalacağı standart yazıcı yazılınca netleşir |
| K3 | `colOffset` altyapısı (excel-grid.service.ts + export-engine.ts) | Standart çıktıda gereksiz; ama İÇE AKTARIMDA (MF1/MF2 fiyat okuma) hâlâ gerekli olabilir |
| K4 | KE15 iki katmanlı başlık çözücü (excel-grid.service.ts:384-402) | Üst belge "yalnız içe aktarımda yaşar (MF2)" diyor → **silinmez**, kapsamı daraltılır. Daraltmanın sınırı MF2 testi yazılınca belli olur |
| K5 | `frontend/components/excel-grid/build-material-context.ts` ↔ `backend/src/utils/build-material-context.ts` **iki kopya** | T2 "mükerrer yollar teke iner" diyor; hangisinin canlıda kullanıldığı ölçülmeli (FE kopyası ExcelGrid'den, BE kopyası nereden?) |

---

## 4. Ölçüm notu

Yukarıdaki satır aralıkları `386e77f` (origin/master) üzerinde ölçülmüştür. Silme sırasında satır numaraları kayacağı için her commit öncesi yeniden doğrulanacak; envanterin ölçütü **fonksiyon/blok adı**dır, satır numarası yalnız yardımcıdır.
