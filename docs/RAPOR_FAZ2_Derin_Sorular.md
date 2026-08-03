# RAPOR — FAZ 2 · Derin Sorular (HR5 · HR5b · HR6 · HR7)

**Tarih:** 03.08.2026 · **Kaynak tanım:** `GOREV_Kod_Haritasi.md` §2 (HR5-HR7 satırları) · **Sınır:** kod DEĞİŞMEDİ, yalnız okundu; bulunan kusurlar "görüldü, dokunulmadı" listesinde.

**Yöntem dürüstlüğü:** 7 paralel okuyucu başlatıldı; 6'sı oturum limitine takıldı, yalnız HR7-backend tamamlandı. Kalan sorular sentezci tarafından hedefli grep+okumayla İNLİNE kapatıldı; HR7-backend'in üç kritik çapası (runQuery tanımı + 3 çağrı noktası) sentezcinin kendi grep'iyle ayrıca teyit edildi. Aşağıdaki her `dosya:satır` fiilen açılıp okunmuş koddan.

---

## HR5 ★ · TOPLAM KAÇ AYRI YERDE HESAPLANIYOR? — **CEVAP: 21**

**Sayım kuralı:** "hesaplanan yer" = toplam DEĞERİ üreten aritmetiğin koştuğu nokta (kopyalayan/yalnız gösteren yerler sayılmaz, ayrı listelenir). İki alt sayı: **11 çağrı tek formülden**, **10 bağımsız aritmetik**.

### 11 × TEK FORMÜL çağrısı — `hesaplaSatirToplam` (`frontend/lib/pricing.ts:53-55`)

| # | Yer | Tetik |
|---|---|---|
| 1 | `ExcelGrid.tsx:278` | Marka dropdown fiyat yazımı (`writePriceToNode` — otomatik + elle + öneri) |
| 2 | `ExcelGrid.tsx:941` | Firma dropdown işçilik yazımı (`writeLaborPrice`) |
| 3 | `ExcelGrid.tsx:2408` | Malzeme kar% değişimi |
| 4 | `ExcelGrid.tsx:2430` | İşçilik kar% değişimi |
| 5 | `ExcelGrid.tsx:2449` | Miktar değişimi → malzeme toplam |
| 6 | `ExcelGrid.tsx:2460` | Miktar değişimi → işçilik toplam |
| 7 | `ExcelGrid.tsx:2476` | Malzeme birim fiyat elle girildi |
| 8 | `ExcelGrid.tsx:2488` | İşçilik birim fiyat elle girildi (etkinMiktar'lı — okundu) |
| 9 | `fill-down.ts:225` | Toplu doldurma (Yol C) |
| 10 | `pricing.ts:155` + `:160` | `toplamlariTamamla` — içe aktarmada boş toplamlar (Yol A; çağıran `quotes/new:350`) |
| 11 | `quotes/new/page.tsx:534` | Teklif geri yükleme re-match (⚠ miktar `etkinMiktar` değil düz `parseFloat` — kusur listesinde) |

### 10 × BAĞIMSIZ aritmetik

| # | Yer | Ne hesaplıyor |
|---|---|---|
| 12 | `ExcelGrid.tsx:2362-2393` `recalcGrand` | Satır Genel Toplamı = matTop+labTop (olay yolu) |
| 13 | `pricing.ts:165-171` | Aynı kuralın İKİNCİ uygulaması (içe aktarma yolu — olay nesnesi yok) |
| 14 | `fill-down.ts:77-94` `genelToplamiTazele` | Aynı kuralın ÜÇÜNCÜ uygulaması (doldurma yolu; ⚠ `Math.ceil((mat+lab)*10)/10` inline — `yukariYuvarla`'daki `-1e-9` epsilonu YOK) |
| 15 | `standart-cikti.ts:186` | Aynı kuralın DÖRDÜNCÜ uygulaması — çıktı satırının Genel kolonu yeniden hesaplanır |
| 16 | `ExcelGrid.tsx:1942-1999` `updatePinnedBottom` | Ekran altı GENEL TOPLAM (tüm satırların mat/lab/genel toplamı; `_ozet` HARİÇ — 62.043.700 kuralı; ⚠ `toFixed(2)`, hücreler 1 hane) |
| 17 | `standart-cikti.ts:165-209` | Çıktı SAYFA TOPLAMI (akümülatör + DEĞER olarak yazım — EX3/EX4) |
| 18 | `format-engine.ts:288-289` + `export-engine.ts:184-197` | İCMAL malzeme/işçilik toplamları: JS değerleri + CANLI `SUM('sayfa'!X:X)` formülleri (T5/T7) |
| 19 | `format-engine.ts:295` + `:311-312` | KDV: `araDeger×0.20` değeri + `(araFormul)*oran` canlı formülü; GENEL_TOPLAM KDV'li/siz |
| 20 | `quotes.service.ts:44-56` | ⚠ KAYIT yolu: `matUp×(1+margin)×qty` — TEK FORMÜLÜ KULLANMAZ, YUVARLAMASIZ; DB'deki QuoteItem toplamları |
| 21 | `quotes/page.tsx:33` | Teklif liste sayfası: `items.reduce(finalPrice)` — DB değerlerinden teklif toplamı |

**Kopyalayan/gösteren (sayılmadı):** `standart-sema.ts:227-229` (dosyadan kopya — bilinçli, müşteri verisi üstün) · `RecentQuotes.tsx:63` (`totalAmount` gösterimi) · `quotes/[id]` (toplam hesaplamıyor — grep boş).
**Test/öz-denetim tarafı (ürün sayısına girmez):** `verify.mjs` C1-C11 bağımsız yeniden hesap · `kd11-toplam-yollari-test.ts` · `standart-sema-test.ts` · `export-engine.ts:321-324` + `quotes.service.ts:343` (KF7 self-check toplamları).
**Alan dışı (fiyat değil):** DWG uzunluk toplamları (`useLayerCalc:69`, `MetrajEditor:90`, `DwgProjectWorkspace:618`) · sayaç reduce'ları · AI maliyet toplamı (`admin.service.ts:330`).

## HR5b · İşçilik toplamı neden çalışıyor? — **AYNI KOD**

01.08 tespiti (KD11 başlığı): "çalışmıyor, KOPYALANIYOR" — dosyada `İşç. Toplam` sütunu VARDI (ŞAHİNKUL: birim dolu 85, toplam dolu 90). Bugünkü kod: kopya davranışı sütun varsa DURUYOR (`standart-sema:229` + `toplamlariTamamla` yalnız BOŞ hücreyi doldurur); sütun yoksa işçilik de malzeme de **AYNI tek formülle** hesaplanır. Simetri birebir: `:278/:941` · `:2408/:2430` · `:2449/:2460` · `:2476/:2488` · `pricing.ts:155/:160`. **Hüküm: aynı kod — ayrım tarihsel bir veri tesadüfüydü** (işçilikli dosyalarda toplam sütunu vardı, malzemelilerde yoktu).

## HR6 · Dosya yükleme uçları — Excel'i alan **2 kullanıcı ucu (+1 PDF) + 4 admin ucu**

| Uç | Tanım | Çağıranlar |
|---|---|---|
| `POST /excel-grid/prepare` (`excel-grid.controller.ts:12-21`) | ANA hat: sabit şema, 15MB | `quotes/new:758` · `quotes/new:1504` · `dashboard:76` |
| `POST /excel-engine/analyze` (`excel-engine.controller.ts:14-19`) | PARALEL ikinci hat | yalnız `dashboard:73` |
| `POST /ai/analyze` (`ai.controller.ts:14-24`) | PDF → LLM çıkarımı (Pro, 10MB) | AI akışı |
| Admin: `import-excel/preview+commit` ×2 · `materials/save-bulk` · `save-from-sheets` (`admin.controller.ts:92-200`) | Havuz içe aktarımı | `admin/brands` + `materials/[brandId]` |

**Bulgu:** `dashboard/page.tsx:72-79` AYNI dosyayı `Promise.all` ile İKİ uca birden gönderiyor — her dashboard yüklemesi çift parse (kusur listesinde). DWG yüklemesi J alanının malı (A envanterine alınmadı, not düşüldü).

## HR7 · Marka/varyant üç yolu — **TEK ORTAK ÇEKİRDEK, kopya yok**

| Yol | Frontend | Backend zinciri |
|---|---|---|
| A · otomatik toplu | `quotes/new:1067` (tüm adlar tek istekte) | `POST /matching/bulk-match` → `bulkMatch` (`matching.service.ts:74`) → `matchV2` (:300) → **`runQuery` (`query-engine.ts:59`)** |
| B · elle seçim | `quotes/new:1817` (`onBrandChange`, tek ad + variantTags + birim) → yazım `ExcelGrid:278` | aynı zincir |
| C · toplu doldurma | `ExcelGrid:1791-1795` `fillDown(motor=onBrandChange)` → `fill-down:197` | aynı zincir (satır satır) |

`runQuery`'nin backend'deki TÜM çağrıları: `matching.service.ts:390` (ana) · `:453` (M3 marka alternatifleri) · `:639` (L5 işçilik alternatifleri) — **sentezcinin kendi grep'iyle teyitli**. İşçilik ayrı motor DEĞİL: `labor-matching.service.ts:30-55` sahiplik kontrolü + delegasyon → `bulkMatchLabor` (:508) → AYNI `matchV2`. Hafıza kısa devre DEĞİL: `hafizaOnSecim` (:741-828) yalnız multi sonuçta, motorun aday listesi İÇİNDE ön-seçim; otomatik yazım yalnız tek aday + geçmiş seçim örtüşünce (variantMissing/akışkan guard'larıyla). Dördüncü tetik (restore, `quotes/new:525`) da aynı uca gider. **Frontend'te B ve C aynı fonksiyonu paylaşır** — üç yolun ayrıştığı tek şey tetikleyici kullanıcı eylemidir.

---

## Bu turda GÖRÜLDÜ, DOKUNULMADI (yeni kusurlar)

1. **`quotes.service.ts:44-56` — kayıt yolu tek formül dışı ve yuvarlamasız:** ekran 1-hane yukarı yuvarlarken DB'ye ham çarpım yazılır; liste sayfası (`quotes/page.tsx:33`) bu ham değerleri toplar → ekran toplamı ile liste/DB toplamı sapabilir. (★ tablosunun en riskli satırı.)
2. **`quotes/new:533` — restore yolunda miktar `etkinMiktar` değil düz `parseFloat(quantityField)`:** MİKTAR/BİRİM başlıkları ters persist edilmiş teklifte (UY2 vakası) geri yükleme yanlış toplam yazabilir.
3. **`fill-down.ts:93` — inline yuvarlama epsilonsuz:** `Math.ceil((mat+lab)*10)/10`, `yukariYuvarla`'daki `-1e-9` koruması yok → ikili artık sınırında 0.1 yukarı sapma ihtimali.
4. **`updatePinnedBottom` `toFixed(2)`** (`ExcelGrid:1984-1996`) — hücreler 1 hane, alt toplam 2 hane (kozmetik tutarsızlık).
5. **`dashboard:72-79` — aynı dosya iki uca birden** (excel-engine + excel-grid): çift parse maliyeti; excel-engine hattının tek tüketicisi bu.

## Kapılar (git add'den SONRA) + HR8 kapanış

Koşum sırası ve sonuçlar commit öncesi bu raporun altına işlendi:

```
Haritada değişen satır: E · pricing.ts:53 + 5 satır · ★ CEVAPLANDI: toplam 21 ayrı yerde (11 tek-formül çağrısı + 10 bağımsız); HR5b CEVAPLANDI: işçilik=malzeme AYNI kod
Haritada değişen satır: F · soru CEVAPLANDI: çıktı kendi hesabını yapıyor (satır geneli + sayfa toplamı DEĞER + İCMAL canlı SUM + KDV formülü)
Haritada değişen satır: A · excel-grid.controller.ts:12-21 + excel-engine.controller.ts:14-19 + ai.controller.ts:14-24 + admin uçları · yükleme envanteri TAMAM (dashboard çift-gönderim bulgusuyla)
Haritada değişen satır: C · YOL A/B/C dosya:satır'landı (quotes/new:1067 · :1817 · ExcelGrid:1791→fill-down:197) · "tek fonksiyon mu" CEVAPLANDI: runQuery:59 tek çekirdek
Bekleyenler listesi: 0 -> 0 (cırcır sabit)
```

**Kapı sonuçları (bu commit'te):** sıra: tüm düzenlemeler → `git add -A` → `test:harita` **PASS** (300/300, bekleyenler 0/0) → `test:regression` **27 PASS · 0 FAIL · 3 SKIP** → rapor bu bloğu aldı → **yeniden `git add`** → commit. Son adımdaki yeniden-add bilinçli: HS turunda HS11/HS12 bölümleri add'den SONRA yazılıp stage'lenmeden commit'lenmişti (`d57dd35` raporu o 22 satırdan yoksundu; bu commit taşıyor). Ders güncellendi: *kapılar add-sonrası koşulur VE add-sonrası her düzenleme yeniden add ister — commit'ten hemen önce `git status` temiz-stage kontrolü zorunlu.*
