# RAPOR — HARİTA DERİN KATMAN TAMAMLANDI (HD turu)

**Tarih:** 03.08.2026 · **Kullanıcının yönü:** *"kod haritasının tam olarak çıkarılması, klasörleme sonra ve ayrı görev"* · **Sınır:** kod DEĞİŞMEDİ, yalnız okundu; hiçbir dosya taşınmadı.

---

## 1 · Öncesi ve sonrası

| | Önce (03.08 sabah) | Sonra |
|---|---|---|
| Sığ katman (her dosya ne yapar) | 300/300 ✅ | 300/300 ✅ (değişmedi) |
| Derin katman ✅ doğrulandı | 52 | **75** |
| Derin katman ◑ kısmi | 18 | **0** |
| Derin katman ⬜ bakılmadı | 7 | **1** — o da *yokluk kaydı* |
| Cevapsız soru | 3 | **0** |

**Tek kalan ⬜ bir eksik değil, bir bulgudur:** `tsconfig.build.json` **repoda hiç yok** (ne diskte ne geçmişte). Harita bu satırı belgeden belgeye taşımış; artık "arandı, bulunamadı" olarak duruyor. Uydurulmadı, silinmedi.

**Yöntem:** 7 paralel derin okuyucu, 26 kalem; her kalem için okunan satır aralığı + karar veren semboller kayıtlı. 25 kalem KAPANDI, 1 kalem (etiketleme motoru) **kod tarafı tam** ama PRD belgesi repoda olmadığı için okuyucu KISMEN dedi — haritaya kod tarafı ✅, belge yokluğu şerh olarak girdi.

## 2 · ★ Üç sorunun cevabı

**★ Eşleştirme kuralları kaç dosyada yazılı? — 13.**
`ad-cins-sozlugu.ts` (sözlük verisi) · `ad-resolver.ts` (en-uzun-desen) · `conversion.ts` (çap denklik tabloları) · `normalizer.ts` (regex çıkarım aileleri) · `shared-tag-matcher.ts` (etiket kümeleri) · `tag-generator.ts` (v1 metin etiketleyici) · `terminology.service.ts` (alias/öğrenme) · `index/line-parser.ts` · `index/vocab.ts` · `index/product-index.ts` (v2 indeksleyici) · `index/query-engine.ts` (sert filtre zinciri) · `index/outcome-mapper.ts` (çıkış sözleşmesi) · `matching.service.ts` (havuz + hafıza).
**Sonucu:** bir kuralın davranışını değiştirmek genelde **2-3 dosyaya birden** dokunmayı gerektirir (yeni aile = sözlük + shared-tag kümesi + `INDEX_VERSION` artışı).

**Şahinkul dosyasında USD/EUR satırı var mıydı? — HAYIR.** İki fixture da (594 satır, 6 sayfa) baştan sona TL; şemada PARA BİRİMİ kolonu hiç açılmamış. **Sorunun kendi şüphesi doğru çıktı: 15b kontrolü döviz yolunu hiç ölçmemiş.** Döviz çevrimi bugün yalnız birim testleri + KD9 kur ölçütüyle korunuyor; gerçek dosyalı kanıtı yok.

**nest-cli.json ↔ tsconfig.json çelişkisini engelleyen test var mı? — DOĞRUDAN YOK.** `backend/test/`'in 39 girdisi tarandı. Var olan tek koruma **nedeni değil sonucu** ölçüyor: `derleme-kapisi.js:41-65` (postbuild) `dist`'teki `.js` sayısı + `dist/main.js` varlığı + %80 oranı, ihlalde çıkış 3. İki boşluk: (a) çelişki *dolu ama yanlış* bir `dist` üretirse yakalanmaz; (b) kapı yalnız `npm run build`'de ateşlenir, **CI'da koşmaz**.

## 3 · Bu turda çıkan YENİ kusurlar (görüldü, dokunulmadı)

1. **Fiyat biçimi çelişiyor:** merkezi `paraBicim` **1 ondalık** ("3.019,2"), diğer 8+ yerel biçimleyici ve Excel `numFmt`'ları **2 ondalık** ("3.019,20") → aynı değer gridde ve çıktıda farklı yazılıyor.
2. **`saveMaterialsFromSheets` (`admin.service.ts:1134-1319`) ProductIndex YAZMIYOR** — yalnız `materialPrice.upsert`. Bu yoldan yüklenen marka indekssiz kalır (KALEM 58'in "MARKA INDEKSLENMEMIS" ailesiyle aynı sınıf).
3. **Ölü beşinci çevrim noktası:** `admin.service.ts:873, 942-944` — `exchangeRate` doluysa fiyatı **DB'ye çevrilmiş** yazar; bu, "içe aktarımda çevrim yok" kuralının tam tersi. Ucu var (`admin.controller.ts:196,199`), frontend'te çağıran yok.
4. **Haritanın kendi sırası yanlıştı:** `query-engine` filtre sırasında çap, cins ve bağlantıdan **sonra** çalışıyor; harita tersini yazıyordu. Kodun kendi yorum numaraları (`2./3./4.`) da yürütme sırasını yansıtmıyor.
5. **Sürükle-doldur'un "izole modül" vaadi yarım:** `fill-down.ts` yalnız `_marka`/`_firma` dallarını kapsıyor; kar% ve iskonto yayılması hâlâ `ExcelGrid.tsx:1857-1891` içinde satır içi. Ayrıca aynı tabloda **iki farklı ondalık kuralı** (`toFixed(2)` vs `toFixed(1)`).
6. `useFillHandle.tsx:143` satır yüksekliği **28 sabit yazılı**, gerçek değer `ExcelGrid.tsx:2647`'de — ikisi ayrışırsa hedef satır hesabı sessizce kayar. Ayrıca hook sayfa genelinde `querySelector` yapıyor (ikinci bir grid olursa yanlış grid'i ölçer).
7. `FillHandleIndicator` **null dönen ölü bileşen** ama hâlâ 3 yerde çağrılıyor (`ExcelGrid.tsx:863, 1105, 2103`).
8. **Yerelde ölçülemeyen yol:** `xlsx-to-pdf` Windows'ta `soffice` bulunmadığı için her zaman 404'e düşüyor; bu yolun bozuk olup olmadığı **yalnız sunucuda** anlaşılır.
9. `PRD_Kutuphane_Etiketleme_Motoru` belgesi **repoda yok** (kod tarafı tam haritalandı).

## 4 · Düzelen yanlış kayıtlar

- `regression.yml` satırındaki *"fixture'lar repoda yok, CI ölçemiyor"* notu **artık geçersiz** — PK3 turunda 20 fixture repoya alındı; CI fiilen `npm run test:regression` koşuyor.
- `aday-ayirt-edicilik.ts` başlığındaki *"bu dosya kırmızı tabandır, iki hata bilerek yeniden üretilir"* yorumu **kodla çelişiyor**: gövde düzeltilmiş hâli içeriyor (alt satır taraması :79, ad kesilmiyor :133). Yorum eskimiş.
- **Teklif PDF'i yok** — harita "PDF üretimi ⬜" diyordu; gerçek: teklif PDF'i 24.07'de kullanıcı kararıyla kaldırılmış, yaşayan tek kullanım format kartının **indirilemez** iç önizlemesi.

## 5 · Kapılar

Sıra: düzenlemeler → `git add -A` → `test:harita` → `test:regression` → commit.
