# FAZ 0 — KÖK NEDEN RAPORU (düzeltme yapılmadan önce)

**Tarih:** 29.07.2026 · **PRD:** `PRD_Kesin_Cozum_SurukleDoldur_KolonHaritasi_OncedenFiyatliVeri.md`
**Yöntem:** Her iddia gerçek ŞAHİNKUL dosyası üzerinde ölçülerek doğrulandı; hiçbiri koddan okuyup varsayılmadı.

**Fixture durumu:** ŞAHİNKUL orijinali `test-fixtures/e2e/` altında zaten mevcuttu (E2E setinin
10 dosyasından biri — 08-sahinkul). Bilinen-yanlış çıktı `test-fixtures/regression/SAHINKUL-bilinen-yanlis-cikti.xlsx`
olarak üretildi (aşağıdaki B kanıtı bu dosyadan).

---

## A — Sürükleme neden marka atayıp fiyat atamıyor?

### PRD'nin üç hipotezi de ÇÜRÜDÜ

| Hipotez | Sonuç | Kanıt |
|---|---|---|
| (a) Hedef satırların malzeme adı yok, grup başlığından miras ALMIYOR | ❌ **Çürük** | `buildMaterialContextFromRows` GALVANİZ grubunda doğru sorgu üretiyor: `_rowIdx=108 "¾""` → **"GALVANİZ ÇELİK BORU ¾""**; 109→`"GALVANİZ ÇELİK BORU 1""`; 110→`"GALVANİZ ÇELİK BORU 1¼""`. Araya giren iki açıklama satırı ("2" ve altı Dişli bağlantı", "2½" ve üstü borular yivli…") H4 ölçü-kuralıyla doğru atlanıyor. |
| (b) Unicode kesirler çap ayrıştırıcıdan geçmiyor | ❌ **Çürük** | `extractSizeInfo`: `½"`→{inch, 0.5, `1/2"`} · `¾"`→{inch, 0.75, `3/4"`} · `1¼"`→{inch, 1.25, `1 1/4"`} · `1½"`→1.5 · `2½"`→2.5. Hepsi doğru. |
| (c) Drag yolu eşleştirme motorunu hiç çağırmıyor, yalnız marka kopyalıyor | ❌ **Çürük** | Geçici teşhis logu (`ExcelGrid.tsx` fill döngüsü, koşum sonrası geri alındı): **78 hedef satır motora gitti**, `catch` yakalanan hata **0**, boş-ad nedeniyle atlanan **0**. `onBrandChange` her hedef için çağrılıyor ve kaynak fiyat kopyalanmıyor (K17 tasarımı yerinde). |

### GERÇEK KÖK NEDEN: sonuç işareti yazılamıyor — `_matStatus` bir grid kolonu değil

`ExcelGrid.tsx` fill döngüsünde ve elle seçim yolunda, eşleşme bulunamadığında satır şöyle işaretleniyor:

```
node.setDataValue('_matStatus', matchResult?.notProduct ? 'urun_degil' : 'yok');   // fill dalı
node.setDataValue('_matStatus', result?.notProduct ? 'urun_degil' : 'yok');        // elle seçim dalı
```

Ancak `_matStatus` **`columnDefs` içinde tanımlı değil**. Backend'in ürettiği kolon listesi
(`excel-grid.service.ts` fixedSchema bloğu) yalnız şunları içerir:

```
col0…col4 (dosyanın kendi kolonları) · _malzKar · _marka · _matBirim · _matToplam
· _iscKar · _firma · _labBirim · _labToplam · _toplam
```

AG-Grid'de `setDataValue(colKey, …)` **tanımsız kolon için sessizce hiçbir şey yapmaz**.
Dolayısıyla işaret ne veriye yazılıyor, ne hücre stiline yansıyor (`ExcelGrid.tsx` cellStyle'ı
`params.data._matStatus === 'yok' | 'belirsiz'` okuyor — hiç dolmadığı için hiç tetiklenmiyor),
ne de kayda giriyor.

Kodun kendisi bu tuzağı başka bir alanda **biliyor**: `_matVariantTags` için
`node.data._matVariantTags = …` (doğrudan atama) kullanılıyor ve yorumda *"Grid kolonu yok →
doğrudan data'ya yazılır"* deniyor. Aynı disiplin `_matStatus`'a uygulanmamış.

### Ölçüm (ŞAHİNKUL, gerçek tarayıcı koşumu)

Marka atanmış 141 satırın dağılımı:

| Sonuç | Adet |
|---|---|
| ✅ fiyat yazıldı | 10 |
| ⚠️ eylemli işaret (yok / belirsiz / ürün değil) | **0** |
| ❌ **sessiz boş** (marka var, fiyat yok, işaret yok) | **131** |

Örnekler: `HAVALANDIRMA#12 "Vasp:400 m³/h Hcd:200 pa"`, `HAVALANDIRMA#28 "Galvaniz Sactan, En geniş…"`.
Bu, SD2'nin yasakladığı durumun ta kendisi ve kullanıcının bildirdiği semptomla birebir örtüşüyor
("6 satırın hepsine marka atandı, fiyat/tutar boş, hiçbir uyarı yok").

**Not:** Sürüklemenin çalıştığı durumlar da var — `Ø50 mm.`→₺291,2 ve `Ø100 mm.`→₺701,8 farklı
fiyat aldı, yani K17 (kaynak fiyat kopyalanmaz) doğru işliyor. Sorun eşleşme bulunamayan satırın
**sessiz** kalması.

---

## B — Şablonda MALZEME→BİRİM FİYAT (G) dururken değer neden M/N'ye yazıldı?

### PRD'nin hipotezi DOĞRULANDI: iki katmanlı başlık okunamıyor

ŞAHİNKUL "SIHHİ" sayfasının başlığı iki satır + yatay merge:

```
R3:  B..F tekil  | G3:H3 "MALZEME" (merge) | I3:J3 "İŞÇİLİK" (merge) | K3:L3 "TOPLAM" (merge)
R4:  B..F tekil  | G4 "BİRİM FİYAT" H4 "TUTAR" | I4 "BİRİM FİYAT" J4 "TUTAR" | K4 "BİRİM FİYAT" L4 "TUTAR"
```

**Zincir:**

1. `export-engine.ts:241` — `kolonBasligi(c)` yalnız `_isHeaderRow` işaretli satırları birleştirir.
   ŞAHİNKUL'da alt başlık satırı R4 `_isHeaderRow=false` olduğu için G kolonunun başlığı
   **"MALZEME"** olarak kalır (üstüne R1/R2'deki "ŞAHİNKUL FABRİKA / Sıhhi Tesisat / Keşif Özeti"
   gürültüsü de eklenir).
2. `export-engine.ts:124` — `basligaUyar(hn,'matUnit')` şartı `malz && birimFiyat`; `birimFiyat`
   için başlıkta hem "bir" hem "fiyat" gerekiyor. Ölçüm:

   | Başlık metni | Anlam | Sonuç |
   |---|---|---|
   | `MALZEME` (bugünkü davranış) | matUnit | ❌ false |
   | `İŞÇİLİK` | labUnit | ❌ false |
   | `TOPLAM` | grandTot | ✅ true (tek satırda anlam tam) |
   | `MALZEME BİRİM FİYAT` (üst+alt birlikte) | matUnit | ✅ true |
   | `İŞÇİLİK BİRİM FİYAT` | labUnit | ✅ true |

   Yani **anlamsal eşleştirici doğru; ona verilen başlık metni eksik.**
3. Eşleşme bulunamayınca `export-engine.ts:289` KF2 dalı devreye giriyor ("eşleşen kolon yok ama
   dolu veri var → sağ uca kolon ekle") ve M/N kolonları açılıyor.

### Bilinen-yanlış çıktıdan kanıt (`test-fixtures/regression/SAHINKUL-bilinen-yanlis-cikti.xlsx`)

```
G108 (MALZEME BİRİM FİYAT — şablonun kendi kolonu): null      ← BOŞ BIRAKILDI
H108 (MALZEME TUTAR):                               null      ← BOŞ BIRAKILDI
M3 başlık = "Malz. Birim Fiyat"   M108 = 52.4                 ← EKLENEN KOLON
N3 başlık = "Malz. Toplam"        N108 = {formula: "E108*M108", result: 314.4}
```

`N108 = =E108*M108` — kullanıcının ekran görüntüsündeki formül çubuğuyla **birebir aynı**
(KE18 ihlali: sistem şablona, eklediği kolona referanslı formül yazıyor).

### İkinci katman: import tarafı da rolleri Excel kolonlarına bağlamıyor

`excel-grid.controller.ts:20` teklif akışını daima `fixedSchema: true` ile çağırır.
`excel-grid.service.ts:292` bu modda dosyanın fiyat/tutar kolonlarını `dropCols`'a alıp
**grid'den çıkarır**, `:387` ise rolleri sistem alanlarına yönlendirir:

```
roleFields.materialUnitPriceField = '_matBirim';   // Excel kolonu değil
roleFields.laborUnitPriceField    = '_labBirim';
```

Ölçülen sonuç (ŞAHİNKUL/SIHHİ):
```
columnRoles = { noField: col0, nameField: col1, brandField: col2, quantityField: col3,
                unitField: col4, materialUnitPriceField: "_matBirim", … }
```
Dosyanın G…L kolonları **hiçbir role bağlı değil ve columnDefs'te yok**. Veri `rowData` içinde
duruyor (`col7 = "832"`) ama görüntülenecek kolonu olmadığı için ekranda yok.

**Bu, C bölümünün (KG9) de kök nedeni:** önceden girilmiş işçilik fiyatları (832 / 550–960)
kullanıcıya gösterilmiyor çünkü taşıyıcı kolonlar bilinçli olarak atılıyor.

---

## C — Önceki turlar neden tutmadı?

### 1. Düzeltmeler yanlış katmana yapıldı

KE8-KE11, KF1-KF7, KG1-KG8 turlarının tamamı **export-engine** tarafını iyileştirdi
(kolon ekleme uçları, self-check, hayalet temizliği, stale toplam). Ama export'a giden
**rol haritası import'ta bozuluyor**: fiyat kolonları atılıp roller sistem alanlarına
yönlendirildiği için, export ne kadar akıllı olursa olsun "eşleşen kolon yok" dalına düşmek
zorunda. Kök neden import'ta olduğu sürece export yamaları semptomu erteliyor.

### 2. Aynı işi yapan ikinci yollar mevcut (Arınma Faz 2 "tek motor" maddesi bu görevde öne çekilmeli)

| Mükerrer | Konum | Not |
|---|---|---|
| Malzeme bağlamı kurma | `frontend/components/excel-grid/ExcelGrid.tsx` (`buildMaterialContextDetailed`) **ve** `backend/src/utils/build-material-context.ts` (`buildMaterialContextFromRows`) | Backend dosyasının başında *"Kept in sync with frontend…"* yazıyor — elle senkron tutulan iki kopya. |
| Satır alanı yazma yöntemi | `node.setDataValue('_matStatus', …)` (etkisiz, kolon yok) **vs** `node.data._matVariantTags = …` (doğrudan, çalışıyor) | Aynı dosyada iki farklı yöntem; hangisinin geçerli olduğu kolon tanımına bağlı ve bu bilgi tek yerde toplanmamış. |
| Doldurma mantığı | `ExcelGrid.tsx` içinde `_marka` dalı ve `_firma` dalı ayrı ayrı yazılmış (~90 + ~80 satır, benzer akış) | SD1'in istediği "tek modül" yok; iki dal birbirinden bağımsız evrilmiş (K19 geri-alma önce yalnız marka dalında vardı, firma dalına sonradan eklenmiş). |

### 3. Doğrulama boşluğu (kendi işimin eksiği)

28.07'deki 10 dosyalık E2E koşumu ŞAHİNKUL'u "10/10 yeşil" raporladı. C5 kontrolü **fazladan
kolon eklenmesini hiç sınamıyordu** (yalnız "orijinal hücreler değişti mi" ve "fazladan sayfa"
bakıyordu). Bu yüzden M/N eklemesi ve `=E108*M108` formülü testten kaçtı. KE21 kriteri
("fazladan kolon yok") bu turda testle kapatılacak.

---

## Sonraki adım (PRD sırası gereği)

FAZ 1: SD/KE/KG testleri + Bölüm D senaryosu **düzeltme yapılmadan** yazılacak ve KIRMIZI
koştuğu çıktıyla kanıtlanacak. Düzeltme ancak ondan sonra başlar.
