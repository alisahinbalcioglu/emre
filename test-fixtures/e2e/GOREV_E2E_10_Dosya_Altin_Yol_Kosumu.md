# GÖREV — 10 Dosyalık Uçtan Uca (E2E) Altın Yol Koşumu: Yükle → Fiyatla → İndir → Doğrula → Düzelt

**Tarih:** 28.07.2026 · **Araç:** Playwright (mevcut e2e altyapısı) — tarayıcı gerçekten sürülür; API kısayolu YASAK (kullanıcının yaşadığı yol test edilir).
**Amaç:** Gerçek kullanıcı akışının 10 farklı gerçek dosyayla uçtan uca kanıtlanması; bulunan her hatanın düzeltilip TÜM setin yeniden koşulması. Bu koşum tek seferlik değil — kalıcı `test:e2e-golden` paketi olarak repoya girer (arınma Faz 1'in altın yol ayağı).

---

## 0. Hazırlık

1. **Ortam:** localhost (tam yerel yığın) — üretim verisi kirletilmez, deploy makasından etkilenmez. (Prod'da koşulacaksa: ayrı test hesabı + koşum sonrası oluşturulan teklifler silinir.)
2. **Dosyalar:** `test-fixtures/e2e/` altına 10 gerçek dosya — mevcut 5 fixture (LINTU, Aksa İŞÇİLİK, YANGIN TESİSATI, 2×DEMONTAJ) + kullanıcının vereceği 5 yeni dosya (çeşitlilik: fiyatlı/fiyatsız, xlsm/xlsx, başlıklı/başlıksız, Ø'lü, çok sekmeli).
3. **Kütüphane durumu:** Test hesabında gerçek marka kütüphaneleri (Çayırova, KALDE, DUYAR…) ve en az bir işçilik firması + bir teklif formatı yüklü olmalı.

## 1. Fiyatlama Politikası (deterministik — her koşumda aynı sonuç)

- Marka kolonunda dosyada marka yazıyorsa o marka; yoksa malzeme ailesine göre sabit politika: borular=ÇAYIROVA, PPR/PVC=KALDE, vanalar=DUYAR (yoksa ilk uyumlu marka).
- **Seçim popup'ı açılırsa ilk aday seçilir** ve hangi satırda popup çıktığı rapora yazılır (popup sayısı da bir metriktir — tek eşleşme olması gereken yerde popup çıkması bulgudur).
- Grup başına bir satır elle seçilir, kalanı **sürükle-doldur/oto-atama** ile doldurulur (K13-K19 gerçek akışta test edilmiş olur).
- İşçilik: her sayfada işçilik firması seçilir (disiplin otomatik olmalı — 17a).
- Bir teklif USD görünümüne çevrilip kaydedilir (18 testi için).

## 2. Her Dosya İçin Koşum Adımları

Giriş yap → Yeni Teklif → dosyayı yükle → (varsa) içe aktarım soruları: kolon onayı/mevcut fiyat protokolü kaydet → fiyatlama politikasını uygula → toplamların ekranda oluştuğunu gör → kaydet → yeniden aç (kalıcılık) → **Fiyatlandırılmış Excel** indir → **Teklif Formatında** indir → indirilen İKİ dosyayı programatik doğrula (Bölüm 3) → sonuçları tabloya işle.

## 3. Kontrol Listesi (her dosya × her madde; "kontrol ettim" kanıtsız KABUL EDİLMEZ)

| # | Kontrol |
|---|---|
| C1 | Yükleme hatasız; satır/sekme sayısı dosyayla tutarlı; console'da hata yok |
| C2 | Eşleştirme: politika uygulanabildi; yanlış-aile adayı sıfır; popup çıkan satırlar listelendi |
| C3 | Grid hesap: her fiyatlı satırda toplam = miktar × birim fiyat; GENEL TOPLAM doğru (bağımsız yeniden hesapla karşılaştır) |
| C4 | Kalıcılık: kaydet + yeniden aç → tüm seçimler/fiyatlar/para birimi aynen |
| C5 | Fiyatlandırılmış Excel: müşteri düzeni birebir (satır sırası/merge/stil); grid'de dolu her değer dosyada, doğru kolonda; fazladan kolon yok; miktarlar sayısal; formül hataları (#DEĞER! vb.) yazım öncesine göre artmamış |
| C6 | Teklif Formatında: kapak+icmal dolu; liste sayfaları enjekte; icmal toplamı = ekran genel toplam |
| C7 | Para birimi: ekranda seçili birim neyse dosyada o (USD teklifinde $ + kur notu) |
| C8 | Self-check özeti göründü ve doğru ("n/n değer aktarıldı" ya da uyarı) |
| C9 | İkinci kez indirme çalışıyor (art arda 2 export) |
| C10 | Süreler: yükleme/açılış/export süreleri kaydedilir (performans taban çizgisi) |

## 4. Düzeltme Döngüsü (frenli)

1. Her başarısız kontrol için: kök neden (dosya:satır) → düzelt → **10 dosyanın TAMAMI baştan koşulur** (yalnız düzelen dosya değil) + tam regresyon paketi.
2. **Frenler:** Test/kontrol gevşetilemez; spec değişikliği yapılamaz (çelişki görülürse kullanıcıya sorulur); her düzeltme ayrı commit; UI'da davranış değişikliği gerekiyorsa önce kullanıcı onayı.
3. Döngü, 10 dosya × C1-C9 tamamı yeşil olana kadar sürer.

## 5. Çıktı

1. **Sonuç matrisi:** 10 dosya × C1-C10 (geçti/kaldı/uygulanamaz + kanıt: ekran görüntüsü/dosya yolu/diff özeti). İndirilen 20 dosya `e2e-artifacts/` altında kullanıcının incelemesine hazır.
2. Bulunan ve düzeltilen hataların listesi (commit'lerle).
3. Popup çıkan satırlar + süre tablosu (taban çizgisi).
4. **Kalıcılaştırma:** koşum `npm run test:e2e-golden` olarak script'lenir; 10 dosya fixture'da kalır; CI'a bağlanması önerisiyle rapor kapanır.
