# DURUM RAPORU — 02-03.08.2026 · Beş Tur Kapanışı

**Canlı sürüm:** `ebca28576e8e` (03.08 18:39, sunucunun kendi cevabı) · **`origin/master`:** `3257820` · **CI:** #50-#54 yeşil
**Bu oturumda kapanan pano kalemleri:** 58 (kütüphane bağlantısı) · 63 (JWT anahtarı) · 64 (kayıt toplamı)

---

## 1 · BEŞ TUR — ne yapıldı

### TUR 1 · KALEM 58 — Kütüphane bağlantı ölçüsü (KB1-KB9) ✅
Salt-okuma ölçüm betiği yazıldı, canlıda koşuldu: **bağsız satır 0 · bağsız kullanıcı 0 · kısmi 0 · toplam kullanıcı 2**. Mühürlü karar tablosu gereği **backfill turu hiç açılmadı**.
**Çürüyen hipotez:** *"canlıdaki her motor-öncesi kullanıcıyı vurur"* → yanlış; 116-NULL vakası yalnız yerel geliştirme verisiymiş. Ölçmeden tamire girilseydi, canlıda var olmayan bir sorun için kod yazılacaktı.

### TUR 2 · HS — Harita sınıflandırma, tam tur (HS1-HS12) ✅
**269 → 0**: repodaki **300 kod dosyasının 300'ü** haritada. Dört yeni grup ilan edilip şema donduruldu: **J** DWG-metraj · **K** ortak UI/kabuk · **L** çekirdek backend · **M** teklif yaşam döngüsü.
Tabakalı 15 dosyalık çürütme denetimi: **14/15 tuttu**, 1 düzeltildi. Denetim kendi süreç kusurumu da yakaladı (5 etiketi prompt'a özetleyerek geçirmiştim).

### TUR 3 · FAZ 2 — Derin sorular (HR5/HR5b/HR6/HR7) ✅
- ★ **Toplam 21 ayrı yerde hesaplanıyor** — 11'i tek formülün çağrısı, 10'u bağımsız aritmetik.
- İşçilik toplamı = malzeme toplamı **aynı kod** (eski fark veri tesadüfüymüş).
- Excel'i alan **2 kullanıcı ucu + 1 PDF ucu**; dashboard aynı dosyayı **iki uca birden** gönderiyor.
- Marka/varyant **üç yolu tek çekirdeğe** iniyor (`runQuery`); kopya yok.

### TUR 4 · KL — P1 çifti + klasör planı ✅
**P1-b (çift kar):** kırmızı-önce test yazıldı ve gerçek kök ortaya çıktı — FAZ 2 "yuvarlamasız çarpım" demişti, ölçüm **karın iki kez uygulandığını** gösterdi: kar %10'da ekranda ₺349,5 iken **DB'ye ₺384,45** yazılıyordu. Backend artık kar hesabı yapmıyor; ekranın değerini yazıyor. Kalıcı kapı: `test:kl-kayit` (5 assert).
**P1-a (JWT):** sabit yedek anahtar üç dosyadan kaldırıldı, `JWT_SECRET` zorunlu. Üç kanıt ateşlendi (grep 0 · env yokken çıkış 1 + açıklayıcı hata · env varken HTTP 200).
**Klasör planı:** `docs/PLAN_Klasor_Duzeni.md` — 965 satır, **300 dosyanın tam taşıma haritası** (240 taşınan + 60 kalan), 7 kalemlik "ne kırılır", üç düzen seçeneği, 6 duraklı uygulama sırası. **Uygulanmadı, yazıldı.**

### TUR 5 · HD — Haritanın derin katmanı ✅
Senin yönünle (*"önce harita tam, klasörleme ayrı görev"*) 28 açık kalem kapatıldı.

| | Önce | Sonra |
|---|---|---|
| Derin katman ✅ | 52 | **75** |
| Derin katman ◑ kısmi | 18 | **0** |
| Derin katman ⬜ bakılmadı | 7 | **1** (yokluk kaydı) |
| Cevapsız soru | 3 | **0** |

★ **Eşleştirme kuralları 13 dosyada** · Şahinkul fixture'ında **USD/EUR yok** (döviz yolu hiç ölçülmemiş) · nest-cli↔tsconfig testi **yok**.

---

## 2 · CANLIYA ÇIKAN İKİ GERÇEK DÜZELTME

| Ne | Etki |
|---|---|
| **Teklif kaydındaki çift kar** | Artık DB'ye yazılan toplam, ekranda gördüğün toplamla **aynı**. Teklif listesindeki tutarlar da düzelir. |
| **JWT yedek anahtarı** | Kaynak kodda yazan tahmin edilebilir anahtar öldü; imza yalnız ortamdan okunuyor. Anahtar değişmediği için **kimse çıkış yapmadı**. |

Deploy doğrulandı: `build_sha = ebca28576e8e`, `COPY . .` cache'ten gelmedi (eski-kod tuzağı yok). Backend'in açılması, JWT ölçümünün bağımsız üçüncü kanıtı oldu.

---

## 3 · KALAN İŞLER

### 🔵 Sıradaki büyük iş
**KLASÖRLEME** — senin dediğin gibi ayrı görev. Ön koşulu (harita tam) artık karşılandı; plan hazır ve rafta bekliyor. Görev dosyasını verdiğinde uygulanır.

### 🔴 Kusur listesi — düzeltilmedi, yalnız kayıtta
| Öncelik | Kusur | Yer |
|---|---|---|
| **P2** | **Fiyat biçimi çelişiyor:** grid 1 ondalık, çıktı/diğer ekranlar 2 ondalık → aynı değer iki yerde farklı yazılıyor | `pricing.ts:81-86` + 8 yerel biçimleyici |
| **P2** | **`saveMaterialsFromSheets` ProductIndex yazmıyor** → o yoldan yüklenen marka indekssiz kalır (KALEM 58'in aynı ailesi) | `admin.service.ts:1134-1319` |
| **P2** | Ölü beşinci çevrim noktası: fiyatı DB'ye çevrilmiş yazar (kuralın tersi), çağıranı yok | `admin.service.ts:873, 942-944` |
| **P2** | Dashboard aynı dosyayı iki uca birden gönderiyor (çift parse) | `dashboard/page.tsx:72-79` |
| **P2** | Restore'da miktar `etkinMiktar` yerine düz parse (UY2 ihlali adayı) | `quotes/new:533` |
| **P2** | Etkisiz ternary (iki kol da aynı) — muhtemel kusur | `EquipmentDetailPopup.tsx:51` |
| **P3** | `fill-down` "izole modül" vaadi yarım + aynı tabloda iki ondalık kuralı · `rowHeight 28` iki yerde sabit · `FillHandleIndicator` ölü ama 3 yerde çağrılı | excel-grid |
| **P3** | 7 ölü kod adayı · 800+ satır 14 dosya · elle senkron ikiz kopyalar | çeşitli |
| **P3** | Eski tekliflerdeki şişik toplamlar DB'de duruyor (geriye dönük düzeltme = ayrı karar) | veri |

### 🟡 Açık ürün soruları
- **Yol-3 açık sorusu:** eşleştirme geri-düşüşü 116 satırı indeksleyip 0 eşleşme veriyor — canlı baskısı yok ama cevapsız.
- **Döviz yolunun gerçek dosyalı kanıtı yok** (fixture'larda USD/EUR satırı yokmuş) — bu bir test boşluğu.
- `test:regression:db` yereldeki kırmızısı artık veri durumu, ürün boşluğu değil.
- Backend `/admin/ai-*` uçları UI'sız (ölü uç şüphesi) · `PRD_Kutuphane_Etiketleme_Motoru` belgesi repoda yok.

### ⚪ Senin kararını bekleyenler
- AKHİSAR golden CASES'e eklensin mi (11. dosya)?
- Git geçmişindeki kimlik temizliği (şimdilik bırakıldı).

---

## 4 · BU OTURUMUN İKİ KAZASI (dürüst kayıt)

1. **Kabuğa metin gömme:** raporu güncellemek için markdown'ı bir kabuk komutuna gömdüm; ters tırnaklar komut olarak çalıştı ve `deploy.sh` yerelde koştu — `docker` bulunmadığı için durdu, **canlıya bir şey gitmedi**. Kural kalıcılaştı: belge metni Write/Edit ile yazılır.
2. **Konsol-güvensiz komut:** sana `_` içeren bir `grep` verdim; Hetzner konsolu alt çizgi yazamadığı için ölçüm `0` döndü ve bir tur boyunca yanlış senaryo kurdum. Kuralı biliyordum, kendi betiklerimde tarıyordum — sana verdiğim satıra uygulamamıştım. Kural kalıcılaştı: **konsola giden her satır taranır.**

Her iki ders de hafızaya yazıldı; ikisi de gerçek zarar vermeden yakalandı ama ikisi de şans eseriydi.

---

## 5 · ÖNERİM (sıra)

1. **Klasörleme görevini ver** — harita taze ve tamken yapılması en kolay an; plan hazır.
2. Ya da önce **iki P2'yi kapat**: fiyat biçimi tekleştirme + `saveMaterialsFromSheets` indeks yazımı. İkisi de dar, kırmızı-önce mühürlenebilir, ikisi de kullanıcıya görünen sonuç üretir.
3. Döviz yolu için **gerçek dövizli bir fixture** eklemek — bugün o yolun dosyalı kanıtı hiç yok.
