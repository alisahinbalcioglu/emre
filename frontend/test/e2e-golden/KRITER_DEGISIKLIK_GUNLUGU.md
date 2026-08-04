# verify.mjs — KRİTER DEĞİŞİKLİK GÜNLÜĞÜ (PK5)

**Neden bu dosya var:** 31.07.2026'da `verify.mjs` matrisi **33 FAIL → 0 FAIL**'e düştü.
Bu düşüşün bir kısmı gerçek düzeltmeden, bir kısmı ise **kriterlerin yeniden tanımlanmasından** geldi.
Yeniden tanım hiçbir yerde yazılı değildi. Üç ay sonra bu tabloya bakan biri haklı olarak
*"test mi düzeldi, hedef mi düşürüldü?"* diye sorar — cevabı burada, tek tek.

**Kök sebep tek cümle:** `d0597ea` ile mimari değişti. Çıktı artık **müşterinin dosyasına yazılmıyor**;
sıfırdan üretilen **9 kolonluk standart dosya**. "Müşterinin düzenini birebir koru" diye ölçen her
kriter, ölçtüğü şey ortadan kalktığı için otomatik kırmızı veriyordu. Kriter yanlıştı, ürün değil.

---

## Değişen dört kriter

| Kriter | ESKİ metin | YENİ metin | Değişme gerekçesi | Commit |
|---|---|---|---|---|
| **C3** | *"satır hesap + genel toplam (bağımsız yeniden hesap, payload'dan)"* — payload'daki **tüm** satırlar toplanır, ekrandaki GENEL TOPLAM ile karşılaştırılır. | Aynı ölçüt + **veri satırı filtresi**: yalnız veri satırları toplanır, **özet/İcmal satırları hariç**. Ayrıca dosyadan gelen (bizim hesaplamadığımız) fiyat çifti `dosyadanSapan` olarak ayrılır, hata sayılmaz. | Özet sayfası/satırı toplama **ikinci kez** giriyordu (aynı sınıf hata: YILDIZ 62.043.700 → 124.087.400). Filtre, backend `GS14c` testiyle **aynı** kuralı uygular; iki taraf artık aynı şeyi sayıyor. Ölçüt gevşemedi, **hizalandı**. | `20ca87f` (+ `985c0e1` sayı ayrıştırma) |
| **C5** | *"fiyatlı.xlsx müşteri düzenini **birebir** korur"* — hücre hücre orijinalle karşılaştırma; metin + merge + formül korunumu. | *"**VERİ KORUNUMU** — hiçbir malzeme satırı ve fiyat değeri düşmez"* — ad + fiyat değerleri çıktıda var mı, **rol üzerinden** okunarak sınanır. | Çıktı artık müşterinin dosyası değil (`d0597ea`). "Düzen birebir" ölçüsü ölçtüğü nesneyi kaybetti. Yeni ölçüt kullanıcının asıl derdini ölçer: **veri kaybı yasak**. Eski ölçüm **silinmedi**, `C5b` olarak N/A'ya alındı — fark görünür kalsın, kapı olmasın. | `7abc262` (+ `985c0e1`) |
| **C8** | Export'un yazma mantığı payload'dan **taklit edilir**, beklenen hücre sayısı hesaplanır, self-check özetiyle karşılaştırılır. | **Artefaktın kendisinden sayım**: üretilen dosyadaki gerçek dolu hücreler sayılır, özetle karşılaştırılır. | Taklit **eski** `export-engine`'in kuralına göreydi; standart yazıcı (`standart-cikti.ts`) başka sayıyor → 11 artefaktın hiçbirinde tutmuyordu. Taklidi düzeltmek yerine **taklidi kaldırdık**: gerçeği saymak, sayma kuralını iki yerde tekrarlamaktan **daha güçlü** (yazıcı değişirse test kendiliğinden doğru kalır). | `7abc262` |
| **C11** | *"şablon dışına kolon eklenmiş mi"* — çıktı orijinal şablonla karşılaştırılır; `KE16` (anlamsal eşleşme varken ekleme yasak) / `KF2` (eşleşme yoksa meşru) / `KE8` (verisiz kolon asla) ayrımı yapılır. | *"her **VERİ** sayfası **tam olarak 9** standart kolondur; **10. kolonda tek bir dolu hücre bile olamaz**"* — kaynak: `standart-cikti.ts → STANDART_CIKTI_KOLONLARI`. | Standart çıktıda **şablon yok**. Ölçüt doğrudan kullanıcının cümlesi oldu: *"çıktı aynen bu şekilde olacak, ilave sütun yok."* Bu **daha sert** bir şart: eski hali "şablona göre fazlalık" ararken, yenisi mutlak bir üst sınır koyuyor. Eski ölçüm `C11b` olarak N/A'ya alındı. | `7abc262` (+ `386e77f` KE21) |

---

## Yeniden tanım GÜÇLENDİRDİ mi, GEVŞETTİ mi?

| Kriter | Yön | Gerekçe |
|---|---|---|
| C3 | **hizalama** (aynı sertlik) | Aynı şeyi ölçüyor, çift sayımı bırakıyor. Uygulamanın kendi kuralıyla tek kaynak. |
| C5 | **odak değişimi** | "Düzen" (artık yok) yerine "veri kaybı" (asıl şikâyet). Karşılaştırılabilir değil; eskisi geçersizdi. |
| C8 | **güçlendi** | Taklit → gerçek artefakt sayımı. Sayma kuralı tek yerde kalıyor. |
| C11 | **güçlendi** | Göreli sınır (şablona göre) → mutlak sınır (tam 9 kolon). |

---

## ⚠ Bu değişikliğin BEDELİ — kaybolan kanıtlar

Eski ölçümler `C5b` ve `C11b` olarak korundu ama **`set(..., null, ...)` yani N/A**'ya alındı: çıktı
üretirler, **PASS/FAIL vermezler**. Sonuç: aşağıdaki kriter etiketlerinin `verify.mjs`'te artık
**canlı assert'i yok** — yalnız N/A blokta adı geçiyor (31.07 ADIM 0c taraması):

| Kriter | Nerede geçiyor | Durum |
|---|---|---|
| `KE16` | `verify.mjs:759` — **C11b** bloğu içinde | ❌ canlı assert YOK (N/A) |
| `KG2` | `verify.mjs:556` — **C5b** bloğu içinde (`kanitlar.push`, assert değil) | ❌ canlı assert YOK (N/A) |
| `KF1` | `verify.mjs:551` — **C5b** yorumu | ⚠ *adıyla* assert yok; ama **C5** (`verify.mjs:486-490`) veri kaybını sınıyor — etiketsiz karşılık var |

Bu, kriterlerin *yanlış* olduğu anlamına gelmez; **kanıtsız** olduğu anlamına gelir.
Panoda `KE16` ve `KG2` "koştu°" ile işaretliyse o işaret **düzeltilmelidir**.

---

## Kural

Bir kriter yeniden tanımlanacaksa:
1. Eski metin bu tabloya **aynen** yazılır (silinmez).
2. Gerekçe, ölçülen **nesnenin** neden değiştiğini anlatır ("test kırmızıydı" gerekçe değildir).
3. Yön kolonu doldurulur: güçlendi · hizalandı · odak değişti · **gevşedi**.
4. Eski ölçüm mümkünse N/A olarak yaşatılır — ama N/A'ya düşen her kriter etiketi bu belgenin
   "kaybolan kanıtlar" tablosuna yazılır.

İlgili: `KAPSAM_DEVRI.md` (test silinirken kapsam devri) · kural: *bir assert birden fazla kritere sayılamaz.*
