# FAZ 0 — KÖK NEDEN RAPORU (düzeltmeden ÖNCE)

**PRD:** `PRD_Standart_Grid_Semasi_ve_Aday_Ayirt_Edicilik.md` (üst belge) · **Tarih:** 30.07.2026
**Yöntem:** Her iddia GERÇEK dosya üzerinde ölçüldü — hem parse çıktısıyla hem ÇALIŞAN uygulamada (yerel tam yığın, Playwright). Koddan okuyup varsayılan hiçbir şey yok.

**Fixture'lar (PRD §3):**

| Dosya | Yol | Not |
|---|---|---|
| YILDIZ ENTEGRE KARTEPE | `test-fixtures/e2e/YILDIZ ENTEGRE KARTEPE - Yangın Tesisatı.xlsx` | **YENİ eklendi** (kaynak: `Desktop/Y.E. Kartepe Tesisi Yangın Tesisatı (1).xlsx`), 11 sayfa |
| ŞAHİNKUL | `test-fixtures/e2e/ŞAHİNKUL KEŞİF ÖZETİ 251224 R1 - LİNTU MÜHENDİSLİK.xlsx` | zaten mevcuttu (E2E 08) |

**Ölçüm araçları (kalıcı):** `backend/test/faz0-gs7-probe.ts` (parse ölçümü) · `frontend/e2e-golden/faz0-gs7-teshis.spec.ts` (canlı uygulama ölçümü, çıktı `frontend/e2e-artifacts/faz0-gs7/`).

---

## A — GS7: Sütun tespiti ve "boş sayfa"

### A.1 Seçicinin "TRAFO SU PÜSKÜRTME SİSTEMİ" göstermesi — tespit DOĞRU, ETİKET yanıltıcı

Ölçüm (canlı, `gs7.json`): Trafo sayfasında seçici `col1` seçili, etiket **"TRAFO SU PÜSKÜRTME SİSTEMİ"**.
Dosyanın kendisine bakıldığında bunun **sebebi dosya:**

```
Trafo.Su.Püskürtme  R7:  C2="No"  C3="TRAFO SU PÜSKÜRTME SİSTEMİ"  C4="Miktar"  C5="Birim"
                         C6="BİRİM FİYAT İŞÇİLİK"  C7="TOPLAM FİYAT İŞÇİLİK"
```

R7 **gerçek başlık satırıdır** ve malzeme-adı sütununun başlığı olarak bölüm adını kullanır. Yani:

- `excel-grid.service.ts:377` → `headerValue1 = rawValues[realHeaderRow][c]`
- `excel-grid.service.ts:394-396` → `headerName = headerValue1` (fixedSchema dalı)
- Seçici etiketi `columnDefs[].headerName`'den gelir (`quotes/new/page.tsx:1517-1519`).

**Sonuç:** seçilen sütun DOĞRU (col1 = açıklamalar), yalnız etiketi bir sayfa başlığı gibi okunuyor. Aynı desen 8 sayfada: `YANGIN POMPA ODASI` · `HİDRANT SİSTEMİ` · `SPRİNKLER SİSTEMİ` · `KONVEYÖR SPRİNK SİSTEMİ` · `TOZ AMBARI SÖNDÜRME SİSTEMİ` · `POMPA ODASI SPRİNK SİSTEMİ` · `OTOMATİK KÖPÜKLÜ SÖNDÜRME SİSTEMİ` · `PASİF YANGIN DURDURUCU`.
`Pres2-3 Çelik Kule` sayfasında ise dosyada başlık HİÇ YOK → etiket `"Sütun 2"` (yer tutucu).

### A.2 "Tüm satırlar boş" — ÜRETİLDİ (kanıt: `e2e-artifacts/faz0-gs7/sayfa-03-Trafo_Su_Püskürtme.png`)

Ekran görüntüsü Trafo sayfasının GİRİŞİNİ gösteriyor ve kullanıcının şikâyeti birebir görünüyor: grid'in ilk ~13 satırı **boş**.

| Grid satırı | İçerik | Neden boş görünüyor |
|---|---|---|
| 1 | (boş) | dosyanın R1'i |
| 2 | "YILDIZ ENTEGRE KARTEPE YANGIN TESİSATI TEKLİFİ" | R2-R6 merge'li afiş — tek bant, kalan hücreler boş |
| 3-6 | (boş) | afişin merge ile gizlenen satırları |
| 7 | `No · TRAFO SU PÜSKÜRTME SİSTEMİ · Miktar · Birim` | **başlık satırı grid'e VERİ satırı gibi çizilmiş** (başlık zaten kolon başlığında da var → çift) |
| 8 | (boş) | ayraç |
| 9+ | `1 · Su Sprayi Püskürtme Memesi … · 420 · ad.` | ilk gerçek malzeme |

Yani sayfa "boş açılmıyor"; **ilk ekranda görünen her şey boş** — kullanıcı verinin olmadığını sanıyor. Ek olarak aynı görüntü iki PRD maddesini daha kanıtlıyor:

- **GS5 ihlali:** nitelik/devam satırları (`Türü : Açık (Open`, `Montaj Biçimi : …`, `Bağlantı : ½" NPT`, `Onay : FM Onaylı`) tam satır olarak çiziliyor; Marka/fiyat hücreleri boş ve AÇIK — fiyatsız malzeme satırı gibi duruyor (kilitli-boş olmalı).
- **GS9 ihlali:** No + Malzeme Adı sola sabitlenmediği için sağa kaydırıldığında hangi satırda olunduğu kayboluyor; `İşç. Birim Fiyat` ekranın sağında kesiliyor.

### A.2b Yükleme anında hiçbir sayfa "veri yok" durumunda DEĞİL

Canlı ölçüm (10 sekme, `gs7.json`): hiçbir sayfa boş gelmedi.

| Sayfa | görünür satır | dolu satır |
|---|---|---|
| Yangın.Pompa.Odası | 35 | 32 |
| Hidrant.Sistemi | 35 | 31 |
| Pres2-3 Çelik Kule | 17 | 16 |
| **Trafo.Su.Püskürtme** | **35** | **32** |
| Sprinkler.Sistemi | 35 | 33 |
| Konveyör.Sprink | 35 | 32 |
| Toz.Ambarı | 35 | 31 |
| Pompa.Odası.Sprink | 20 | 16 |
| Otomatik.Köpüklü | 35 | 32 |
| Yangın.Durdurucu | 16 | 12 |

Seçiciyi başka sütuna çevirme de grid'i boşaltmadı (`[GS6] seçici "No" (col0) → görünür satır=35, dolu=32`).
→ Yani sorun "veri gelmemesi" değil, **A.2'deki gibi ilk ekranın afiş/boş/çift-başlık satırlarıyla dolu olması**. GS6'nın "seçici değişince grid anında yeniden doldurulur" şartı ayrıca gerekli: `handleNameFieldChange` (`quotes/new/page.tsx:654-669`) yalnız `columnRoles.nameField`'i değiştiriyor; satır sınıflandırması (`_isDataRow`) sunucuda ESKİ ad sütununa göre hesaplanmış durumda kalıyor — yeniden sınıflandırma YOK.

### A.3 GERÇEK boş/kayıp sayfa: **İcmal** — dosyada var, uygulamada YOK

Dosyada içerik dolu:

```
İcmal R11: C2="S.N"  C3="AÇIKLAMA"  C5="İŞÇİLİK TOPLAM"
İcmal R12: 1 · Yangın Pompası               · 270.850
İcmal R13: 2 · Hidrant Sistemi              · 8.303.150
İcmal R14: 3 · Pres2-3 Çelik Kule Yangın D. · 1.153.500
… (9 bölüm satırı)
```

Parse çıktısı: `İcmal → isEmpty=true, data=0, adDolu=0` · canlı: **sekme sayısı 10** (dosyada 11 sayfa) → İcmal sekmesi HİÇ görünmüyor.

**Kök neden (dosya:satır):** `backend/src/modules/excel-grid/excel-grid.service.ts:543`

```ts
if (r > effHeaderEndRow && nameVal && (unitVal || hasQty) && !isMergedSection) row._isDataRow = true;
```

İcmal'de **birim sütunu da miktar sütunu da yok** (yalnız S.N · AÇIKLAMA · İŞÇİLİK TOPLAM) → `unitVal=''`, `hasQty=false` → hiçbir satır data sayılmıyor → `isEmpty=true` (satır 579) → frontend `sheets.filter(s => !s.isEmpty)` ile sekmeyi düşürüyor.

→ **GS2** ("şema her sayfada aynı") ve **GS13** ("sekmeler dosyadaki sayfa adlarıyla birebir") ihlali. Sabit şemaya geçince bu satırlar No + Malzeme Adı ile grid'e gelmeli; miktar/birim boş kalır.

### A.4 Dosya kolonlarının grid'e sızması (GS1 / T3) — CANLI KANIT

`gs7.json` başlık dökümünden:

| Sayfa | Grid'de görünen DOSYA kolonu |
|---|---|
| Pres2-3 Çelik Kule | `col4="BİRİM FİYAT İŞÇİLİK"` |
| Pompa.Odası.Sprink | `col5="BİRİM FİYAT İŞÇİLİK"` |
| Yangın.Durdurucu | `col5="BİRİM FİYAT MALZEME"` |

PRD'nin 2. ekran görüntüsündeki şikâyet birebir doğrulandı.

### A.5 Şema sayfadan sayfaya DEĞİŞİYOR (GS2/GS3 ihlali) — CANLI KANIT

Sistem kolonları sayfaya göre eksiliyor:

| Sayfa | Eksik sistem kolonları |
|---|---|
| Pres2-3 Çelik Kule | `_labToplam`, `_toplam` (İşç. Toplam + **Genel Toplam YOK**) |
| Pompa.Odası.Sprink | `_labToplam`, `_toplam` |
| Yangın.Durdurucu | `_matToplam`, `_toplam` |

Sebep: `excel-grid.service.ts:430-436` — sistem kolonu YALNIZ dosyada o rol yoksa ekleniyor (`if (!dosyada('materialTotal')) …`). Dosyada rol "varmış gibi" görününce sistem kolonu hiç eklenmiyor. Pano #1/#29 ("Genel Toplam bazı sayfalarda yok") bu satırdan geliyor.

### A.6 Rol ataması yanlış (aynı kök: dinamik haritalama)

| Sayfa | Yanlış rol | Gerçek içerik |
|---|---|---|
| Pres2-3 Çelik Kule | `grandTotal=col3` | col3 = **Birim** (metin: "Ad.", "m") |
| Pompa.Odası.Sprink | `grandTotal=col3`, `quantity=col6` | col3 = **Miktar** |
| Yangın.Durdurucu | `grandTotal=col3`, `materialTotal=col5` | col3 = **Miktar** |

Yani dosyanın MİKTAR sütunu üç sayfada "genel toplam" rolüne bağlanmış. Sabit şema (GS1) bu sınıfı kökten kaldırır.

---

## B — PU1: Aday listesinde ayırt edicilik yok

### B.1 Çap sert filtresi neden uygulanmadı — çap satırda DEĞİL, ALTINDAKİ nitelik satırında

Kanıt dosyası satırı (`Yangın.Pompa.Odası`):

```
R47:  No=5 | "Yükselen Milli Vana (OS&Y Valve)" | Miktar=2 | Adet | 6000 | 12000     ← MALZEME SATIRI
R48:       | "Çap : DN 250"                                                          ← nitelik (çap BURADA)
R49:       | "Vana Türü : Yükselen Milli Sürgülü"
R50:       | "Bağlantı Türü : Flanşlı"
R51:       | "Basınç Sınıfı : 175 psi"
R53:       | "Malzeme : - Vana Gövdesi : Dökme Demir"
```

Ayrıştırılan üçlü (malzeme, çap, cins) = **("Yükselen Milli Vana (OS&Y Valve)", ÇAP YOK, cins yok)**.

**Kök neden (dosya:satır):** `frontend/components/excel-grid/ExcelGrid.tsx:1040`

```ts
for (let i = rowIdx - 1; i >= 0; i--) {   // ← YALNIZ YUKARI bakar
```

`buildMaterialContextDetailed` (ExcelGrid.tsx:1020-1089) sorgu bağlamını kurarken **yalnız ÜST satırlardaki başlığı** arar; satırın ALTINDAKİ nitelik satırları (çap · basınç sınıfı · bağlantı türü · gövde malzemesi) bağlama HİÇ katılmaz. Bu dosyada çap tam da orada durduğu için sorguya çap girmiyor → **sert çap filtresinin filtreleyecek verisi yok** → ürünün tüm çapları aday kalıyor.

PRD'nin hipotezi doğrulandı: *"çap ayrıştırılabilseydi popup ya hiç açılmaz ya tek aday kalırdı."*

### B.2 Adayların birebir aynı görünmesi — 60 karakterde kesim

Kütüphanedeki gerçek ürün adları (yerel DUYAR kütüphanesi, 20 kayıt) çapı **adın SONUNA** koyuyor:

```
"Sürgülü vana (OS&Y yükselen milli) · 175 psi · elastomer sitli · flanşlı · DN80"    (79 karakter)
"Sürgülü vana (OS&Y yükselen milli) · 175 psi · elastomer sitli · flanşlı · DN100"   (80 karakter)
"Sürgülü vana (OS&Y yükselen milli) · 300 psi · elastomer sitli · flanşlı · DN65"    (79 karakter)
```

Popup ise adı **60 karakterde kesiyor** — `frontend/components/excel-grid/ExcelGrid.tsx:568`:

```tsx
<div style={{ fontWeight: 600 }}>{c.preferred && '✓ '}{c.materialName.slice(0, 60)}</div>
```

60 karakterlik kesim sonucu (ölçülmüş):

```
"Sürgülü vana (OS&Y yükselen milli) · 175 psi · elastomer sit"      ← DN80
"Sürgülü vana (OS&Y yükselen milli) · 175 psi · elastomer sit"      ← DN100
"Sürgülü vana (OS&Y yükselen milli) · 300 psi · elastomer sit"      ← DN65
```

**Ayırt edici alan (DN) tam da kesilen kısımda.** Kullanıcının gördüğü "beş satır birebir aynı, yalnız fiyat farklı" tablosunun mekanizması budur.

Ek olarak popup **genişletilemiyor** — `ExcelGrid.tsx:525-527`: `maxWidth: 400, maxHeight: 320, overflowY: 'auto'` (sabit; PU4 ihlali).

### B.3 Özet — PU1/PU2 iki AYRI hata (PRD'nin dediği gibi)

| Katman | Hata | Dosya:satır |
|---|---|---|
| Veri | Satırın çapı, ALTINDAKİ nitelik satırında; sorgu bağlamına alınmıyor | `ExcelGrid.tsx:1040` (yalnız yukarı tarama) |
| Sunum | Aday adı 60 karakterde kesiliyor; ayırt edici alan (DN) görünmüyor | `ExcelGrid.tsx:568` (stage2) · `:617` (stage1 label) |
| Sunum | Popup sabit genişlik/yükseklik, büyütülemiyor | `ExcelGrid.tsx:525-527` |

---

## C — Bu rapordan çıkan düzeltme sırası

1. **GS1/GS2/GS13** — sabit şema + her sayfa aynı 13 kolon + tüm sekmeler (İcmal dahil). A.3/A.4/A.5/A.6'daki dört hata sınıfı da bununla kapanır.
2. **PU1** — nitelik satırlarındaki niteliklerin (çap/basınç/bağlantı/gövde) ait olduğu malzeme satırının sorgu bağlamına katılması.
3. **PU2/PU3/PU4** — aday satırı: ayırt edici alan önde, ad kesilmez, popup genişletilebilir.

**Açık soru KAPANDI:** kullanıcı dosyayı teyit etti; "tüm satırlar boş" görüntüsü A.2'de birebir üretildi (ilk ~13 grid satırı afiş/boş/çift-başlık). Kabul testi buna göre yazılıyor: *ilk N görünür satırın en az biri gerçek malzeme olmalı; afiş ve çift başlık grid'e veri satırı olarak girmemeli.*
