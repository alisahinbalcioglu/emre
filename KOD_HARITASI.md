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
| ✅ | doğrulandı — dosya biliniyor, ne yaptığı biliniyor | **19** |
| ◑ | kısmen — dosya biliniyor, ne yaptığı tam bilinmiyor | **12** |
| ⬜ | bakılmadı | **17** |
| | **toplam satır** | **48** |

> Bu harita **çoğunlukla boş ve bu kasıtlı.** İçindeki her dolu satır, bir raporda ya da kanıt zincirinde fiilen geçmiş bir dosyadır. **Tek bir dosya adı tahmin edilerek yazılmadı.** Boş satırları Code oturumu ADIM 0-1 tamirini yaparken dolduracak — ayrı bir proje olarak değil, tamirin yan ürünü olarak.

---

## A · GİRİŞ — dosya yükleme ve okuma

**Kullanıcı ne görür:** “Keşif dosyasını yükle” → dosya seçilir, sayfalar okunur, satırlar ekrana gelir.

**Hata bu grupta şu cümlelerle gelir:** “dosya yüklenmiyor”, “sayfalar eksik geldi”, “satırlar kaymış”, “başlık satırı malzeme gibi gelmiş”

**Durum:** ŞU AN KIRMIZI. Canlıda iki hatadan biri burada: başlık satırları malzeme diye içeri giriyor (“YILDIZ ENTEGRE … TEKLİFİ” 5 kez + düz “MALZEME ADI / MİKTAR” satırı). Ayrıca malzeme adı sütunu her sayfada dosya/sayfa adı olarak geldi.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ⬜ | *(bilinmiyor)* | Dosya yükleme ucu — yüklenen dosyayı alan uç nokta | Hiçbir raporda geçmedi |
| ⬜ | *(bilinmiyor)* | Excel okuyucu / sayfa ayrıştırıcı — satırların ekrana dönüştüğü yer | ADIM 1 (kalem 55) bu dosyayı bulmakla başlayacak |
| ⬜ | *(bilinmiyor)* | Başlık satırı ayıklama — hangi satır veri, hangisi başlık kararı | Canlı test 01.08: başlık satırları ayıklanmamış |
| ⬜ | *(bilinmiyor)* | Sütun eşleme — dosyadaki sütunun hangi alana gittiği | Duzeltme_Talebi_Teklif_Ciktisi_Kolon_Esleme_Kaymasi (geçmiş), canlı 01.08 (yeni) |

**Bu grubun cevapsız soruları:**

- Başlık satırı kararı kaç ayrı yerde veriliyor? (Yükleme mi, grid mi, çıktı mı?)
- “Malzeme adı = sayfa adı” hatası okuyucudan mı, sütun eşlemesinden mi geliyor?

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

**Bu grubun cevapsız soruları:**

- `standart-sema.ts` tam yolu ne? Backend’de mi, frontend’de mi, ikisinde de kopyası var mı?

## C · EŞLEŞTİRME — malzeme adını kütüphaneyle eşleme

**Kullanıcı ne görür:** Yazdığın malzeme adının kütüphanedeki ürüne bağlanması; marka/varyant seçimi.

**Hata bu grupta şu cümlelerle gelir:** “yanlış ürünü buldu”, “marka gelmedi”, “aday çıkmıyor”, “siyah boru eşleşmiyor”

**Durum:** Bir davranış ÜÇ ayrı yoldan tetikleniyor (A otomatik eşleşme · B elle marka seçimi · C üçüncü yol). Bunu tesadüfen öğrendik. Haritanın en çok işe yarayacağı yer burası.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ◑ | `matching.service` | Eşleştirme servisi — PRD’de adı geçiyor, dosya yolu yok | PRD_Mekanik_Iscilik_Kutuphanesi_ve_Eslestirme |
| ◑ | `query-engine` | Sorgu motoru — PRD’de adı geçiyor, dosya yolu yok | Aynı PRD |
| ◑ | `ProductIndex` | Ürün indeksi — PRD’de adı geçiyor, dosya yolu yok | Aynı PRD |
| ⬜ | *(bilinmiyor)* | YOL A — otomatik marka/varyant ataması | Canlı kanıt: bugün ÇALIŞMIYOR |
| ⬜ | *(bilinmiyor)* | YOL B — elle marka seçimi | Canlı kanıt: bugün ÇALIŞIYOR (regresyon kapısı) |
| ⬜ | *(bilinmiyor)* | YOL C — üçüncü tetikleme yolu | Canlı kanıt: yarısı çalışıyor, yarısı çalışmıyor |

**Bu grubun cevapsız soruları:**

- Üç yol tek bir ortak fonksiyona mı giriyor, yoksa üç ayrı kopya mı var?
- Eşleştirme kuralları kaç dosyada yazılı? (3 PRD var, kod tarafı bilinmiyor.)

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
| ⬜ | *(bilinmiyor)* | Kütüphaneye liste ekleme / kaydetme | Duzeltme_Talebi_Kutuphane_Liste_Ekleme_Kaydetme |
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
| ✅ | `package.json` | 13 bilinen test scripti: test:tam · test:regression · test:e2e-golden · test:of · test:library · test:ke · test:admin-import · test:perf · test:kb · test:gs · test:ex · test:export · test:sahte | Belgelerden sayıldı — repoda kaç tane olduğu doğrulanmadı |

**Bu grubun cevapsız soruları:**

- package.json’da gerçekten 13 test scripti mi var, daha fazla mı? (Sayı belgelerden çıkarıldı, koddan değil.)

## I · DERLEME ve CANLIYA ÇIKIŞ

**Kullanıcı ne görür:** Kullanıcı görmez — ama görmediği için bu projede beş tur kaybedildi.

**Hata bu grupta şu cümlelerle gelir:** “deploy ettim ama değişmedi”, “canlıdaki sürüm eski”

**Durum:** ŞU AN AÇIK: depodaki sürüm (9635d43) canlıdakinin (6846423) ÖNÜNDE. Bugün canlıda yapılan her test ESKİ yapıyı ölçüyor.

| | Dosya / uç | Ne çalıştırıyor | Kanıt nereden |
|---|---|---|---|
| ✅ | `scripts/deploy.sh` | Dağıtım betiği. Tekrar-deneme yolu ateşlendi (502 → deneme 1/10 → DOĞRULANDI). RET yolu (çıkış kodu 1) HİÇ ateşlenmedi — KD8 açık. Ateşlendiği görülmemiş kapı, kapı değildir. | Panel kalem 53 + KD8 |
| ✅ | `backup.sh` | Yedekleme — sunucudaki kopyası eski bir commit’teydi | Panel |
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
