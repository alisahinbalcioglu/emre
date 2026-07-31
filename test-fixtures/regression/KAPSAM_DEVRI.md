# KAPSAM DEVRİ — eski test → yeni test → hangi kriter

**Amaç:** ölü kod silinirken **canlı kriterin kanıtı** da silinmesin.
**Kural:** bir test paketi silinecekse, kapsadığı her kriter için bu tabloya
"yeni kanıt" satırı yazılmadan silme yapılmaz. Satırı boş kalan kriter
**kanıtsız** sayılır ve silme protokolü ihlal edilmiş olur.

**Tarih:** 31.07.2026 (Kapatma Turu ADIM 4) · **Sebep:** `d0597ea` (T1/T3/T4)
temizliğinde `test:ke` (`export-kolon-esleme-test.ts`, 531 satır) ve `test:kb`
(`iki-katmanli-baslik-test.ts`, 235 satır) paketleri, şablona yazan eski motorla
(`writePricesToWorkbook` + `basNorm`/`basligaUyar`/`kolonAta`/`bosBaslikKolonu`,
369 satır) birlikte silindi.

---

## 1. Devri yapılmış kriterler (silme sırasında düşünülmüş)

| Kriter | Eski kanıt (silindi) | Yeni kanıt | Durum |
|---|---|---|---|
| **KE15** iki katmanlı başlık çözümü | `test:kb` KE15/15b/15c | `test:gs` → *"MF2 dosyanın İŞÇİLİK başlığı altındaki fiyatlar İşç. Birim Fiyat'a geldi"* (ŞAHİNKUL, 85 satır) | ✅ |
| **KE18** sistem şablona formül icat etmez | `test:kb` KE18 | `test:ex` → *"EX4 veri satırlarında sistem-icadı formül yok (hesaplanmış değer)"* | ✅ |
| **KE19** "Onarıldı" yasak | `test:kb` KE19 | `test:ex` → *"EX5 üretilen dosya bağımsız round-trip ile okunur (yapı sağlam)"* + gerçek ŞAHİNKUL varyantı | ✅ |
| **KF1-KF7** veri kaybı yasağı | `test:ke` KF bloğu | `test:ex` → *"EX1b kâr oranı ve marka/firma çıktıda HİÇBİR yerde yok"* + *"MF6/GERÇEK dosyanın işçilik fiyatları çıktıda korundu"* | ✅ (KF7 hariç — aşağıya bak) |

## 2. Kanıtsız kalmış kriterler — 31.07'de geri kondu

Bu üçü silme sırasında **atlandı**; yerlerine hiçbir şey gelmemişti.

| Kriter | Eski kanıt (silindi) | Yeni kanıt (31.07 eklendi) | Kırmızı kanıtı |
|---|---|---|---|
| **KE17** harita persist · iki export aynı | `test:ke` **KF7 assert'i** — kendi assert'i YOKTU | `test:ex` → *"KE17 aynı teklif iki kez dışa aktarılınca BİREBİR aynı (harita persist)"* — ikinci üretim girdinin derin kopyasıyla koşar (yazıcı girdiyi mutasyona uğratırsa da yakalanır) | Yazıcıya zaman damgalı hücre eklendi → `İLK FARK: SIHHİ!R900 1:1785488162018` |
| **KE20** kök neden dökümü · belirsiz başlık | `test:kb` KE20/20b/20c (`basligaUyar` sözleşmesi) | `test:gs` → *"KE20 yalnız 'MALZEME' yazan başlık malzeme BİRİM FİYAT rolü doğurmaz"* + **KE20b** (aynısı işçilik için) | Rol `col4`e bağlandı → 5 satır sızdı (`_matBirim="123.45"`) |
| **KF7** tek doldurma motoru | `test:ke` KF7 — **KE17 ile AYNI assert** | `test:ex` → *"KF7 tek doldurma motoru — TÜM veri sayfaları aynı başlık+genişlik imzası"* + **KF7b** (imza = standart 9 kolon) | Bir sayfaya farklı kolon genişliği verildi → `farklı imza=2` |

### Neden bu üçü sessizce düştü?

**KE17 ile KF7 tek bir assert'i paylaşıyordu.** KE17'nin hiçbir zaman kendi
kanıtı olmamış; KF7'nin assert'i "ikisini birden kapsıyor" sayılmıştı. Tek
assert silinince **iki kriter aynı anda** kanıtsız kaldı ve tabloda bu tek bir
satır kaybı gibi göründü.

**Bu yüzden yeni kural:** bir assert **birden fazla kritere sayılamaz.** Her
kriterin kendi adıyla, kendi assert'i olur. Yukarıdaki tabloda KE17 ve KF7
artık ayrı ayrı yazılıdır.

---

## 2b. ADIM 5'te ilk kez test kazanan kriterler (31.07)

| Kriter | Yeni kanıt | Kırmızı kanıtı |
|---|---|---|
| **SD4** miras + çap ayrıştırma | `test:conversion` — unicode kesirler (¼ ½ ¾ ⅛ ⅜ ⅝ ⅞) · bileşik (1¼" · 1 1/4" · 2½") · DN · Ø/mm | — (yeni kapsam) · ⚠ `1-1/4"` → 0,25 **bilinen açık** |
| **KF6** self-check eksik=0 | `test:ex` — girdideki her fiyat çıktıda + özet sayıyı taşır | labToplam sıfırlandı → "eksik=2" |
| **GS14c** tek hesap modülü | `test:ex` — grid toplamı = çıktı toplamı (ŞAHİNKUL 14.124.619,00) | labToplam sıfırlandı → "grid=14124619 · çıktı=0" |
| **GS14b** rol/şema tutarlılığı | `test:gs` — 9 rol 13 kolonluk şemada var | statik sözleşme |
| **GS8** kolon genişliği kalıcılığı | `gs-kalicilik.spec.ts` GS8b — sürükle → kaydet → aç → aynı (380→530→530) | — |
| **GS9** sola sabitleme | `gs-kalicilik.spec.ts` — `pinned-left` + sağa kaydırınca kalır | — |
| **GS6a** seçici var + veri görünür | `gs-kalicilik.spec.ts` | — |
| **GS6b** seçici değişince grid dolar | `gs-kalicilik.spec.ts` **`test.fail()`** | KARŞILANMIYOR — bilinen açık |

**Silinen ölçüm:** ilk GS14 denemesi ("çıktı rollerinde colN yok") **totolojiydi** —
`standartlastir` rolleri her koşulda sabitliyor, rol bilerek `col4`e bağlandığında
test yine yeşil kaldı. Duyarsız test kanıt değildir; silindi.

## 3. Hâlâ tek kaynağa bağlı kriterler (dikkat)

| Kriter | Tek kanıt | Risk |
|---|---|---|
| KE16 · KE21 | `verify.mjs` C11 | `verify.mjs` çökerse (31.07'de C6'da çöktü) matris hiç üretilmez → dört kriter birden kanıtsız kalır |
| KG2 · KF1 | `verify.mjs` C5/C11 | aynı |

`verify.mjs` C3 · C5 · C8 · C11 kriterleri **müşterinin orijinal düzenini**
ölçüyor; oysa `d0597ea` ile fiyatlı çıktı artık müşteri şablonuna yazılmıyor,
sıfırdan 9 kolonluk standart workbook üretiliyor. Bu dört kriterin yeni
mimariye göre yeniden tanımlanması **açık karardır** — "yeşile çevirmek için"
tek başına yeniden yazılmadı, çünkü gerçek veri kaybını maskeleme riski var.
