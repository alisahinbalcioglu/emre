# RAPOR — KL SERİSİ · P1 ÇİFTİ + KLASÖR PLANI (KL1-KL15)

**Tarih:** 03.08.2026 · **Görev:** `GOREV_Klasor_Plani_ve_P1.md` · **Sınır:** hiçbir dosya taşınmadı, tek `git mv` çalıştırılmadı, klasör yapısı değişmedi, canlıya dokunulmadı, P2/P3 kusurlarına girilmedi.

> Çıkış kodu sözleşmesi: **0 = PASS · 2 = ÖN KOŞUL YOK · diğer = FAIL.**

**DURUM ÖZETİ:** ADIM 0 ✅ · ADIM 2 ✅ · ADIM 3 ✅ · **ADIM 1 kod bitti + üç kanıt ateşlendi ama BİRLEŞTİRİLMEDİ** — KL2 gereği kullanıcının canlı kontrolü bekleniyor (aşağıda).

---

## KL1 · ADIM 0 ölçüldü (iddia değil)

| Kanıt | Değer |
|---|---|
| Commit SHA | **`fa0a01ef4880c45a585c328320a2bdbdedb8eb26`** (`fa0a01e`) |
| `git status` (commit sonrası) | **boş** — ağaç temiz |
| `git log origin/master -1` | `fa0a01e docs(faz2+kl1b): FAZ 2 cevaplari haritaya + haritanin kendi eskimesi duzeltildi` |
| CI | **run #50 · success (yeşil)** |
| Kapılar (add SONRASI) | `test:harita` PASS 300/300 · `test:regression` 27 PASS / 0 FAIL / 3 SKIP |

## KL1b · Haritanın kendi eskimesi — aynı commit'te

**(a) Başlık gerçeğe çekildi:** `v0.1 — TASLAK / ÇOĞUNLUKLA BOŞ · 01.08.2026` → **`v1.0 — SINIFLANDIRMA TAM (300/300), DERİN KATMAN KISMİ · 03.08.2026`**.

**(b) Hash alıntıları için seçim: TAZELEME DEĞİL, ÇIKARMA.** Gerekçe (tek cümle): *aynı gerçeği iki yerde tutmak iki eskiyen yer demektir — bu haritada fiilen yaşandı (`9635d43`/`6846423` iki tur boyunca yanlış durdu), o yüzden sürüm bilgisi tek kaynağa (pano + `/api/health`) bırakıldı.* Aynı kural gereği I ve A gruplarının bayat "Durum" satırları da anlık-renk taşımayan hâle çekildi.

## KL2 ★ · CANLI ÖN KONTROL — **KULLANICIDAN BEKLENİYOR**

**Soru:** canlıda `JWT_SECRET` tanımlı mı?

Kod hazır ama **birleştirilmedi** (ADIM 1 lokal commit'te duruyor, `origin/master`'a gitmedi). Bu bekleyişin somut gerekçesi ölçüldü: `docker-compose.yml:65` `JWT_SECRET: ${JWT_SECRET}` yazıyor — sunucudaki `.env`'de değişken tanımlı değilse compose konteynere **boş dize** geçirir ve yeni kod boş dizeyi de reddeder (bilinçli). Yani:

- **Tanımlıysa** → yedek değer zaten ölü koddu; tamir düşük riskli, mevcut oturumlar bozulmaz.
- **Tanımlı DEĞİLSE** → canlı şu anda kaynak kodda yazan anahtarla çalışıyor demektir: tamir daha acildir, ama deploy'dan önce sunucu `.env`'ine `JWT_SECRET` eklenmelidir; eklenmezse **backend açılmaz** ve eklendiğinde **mevcut tüm token'lar geçersiz olur** (kullanıcılar bir kez çıkış yapmış olur).

Kontrol için sunucuda (konsol-güvenli, salt-okuma):

```bash
grep -c JWT_SECRET /opt/metaprice/.env
```

Beklenen çıktı: `1` (tanımlı) ya da `0` (tanımsız). Cevap gelmeden ADIM 1 push edilmeyecek.

## KL3 · P1-a — üç çıkış yolu da ateşlendi

**1) Sabit yedek anahtar aranıyor:**
```
git grep -n <yedek-anahtar>
→ (çıktı yok) · git grep çıkış kodu: 1  ⇒ BULUNAN SATIR SAYISI: 0
```
Not: tarama tüm repoyu kapsar. Tamirden sonra tek isabet bir raporun kusur listesindeydi; **anahtarın kendisi o belgeden de çıkarıldı** — sızmış bir sırrı raporda tekrarlamak onu yeniden yayımlamaktır.

**2) ★ ASIL ÖLÇÜT — ortam değişkeni YOKken gürültülü ölüm:**
```
komut : JWT_SECRET="" PORT=3099 node dist/main.js
GÖZLENEN ÇIKIŞ KODU: 1   (sıfır-olmayan ✅)
çıktı  :
  Error: JWT_SECRET tanimli degil — uygulama BASLATILMADI.
    Neden: token imza anahtari yalnizca ortamdan okunur; kaynak kodda
    yedek deger YOKTUR (bilincli — kalem 63).
    Cozum: ortam degiskenini tanimlayin (or. .env icinde
    JWT_SECRET="<en az 32 karakter rastgele deger>"), sonra yeniden baslatin.
    Uyari: anahtar DEGISIRSE mevcut tum token`lar gecersiz olur.
      at jwtSecret (dist/auth/jwt-secret.js:7:15)
      at Object.<anonymous> (dist/auth/auth.module.js:25:52)
```
Ölüm **bootstrap'tan önce**, modül yüklenirken gerçekleşti (yığın izi `auth.module.js` → `app.module.js`); yani yanlış yapılandırma ilk isteği beklemiyor. Sessizce varsayılana düşme yok.

**3) Ortam değişkeni VARken normal açılış:**
```
komut : JWT_SECRET="<test anahtarı>" PORT=3099 node dist/main.js
log    : [NestApplication] Nest application successfully started +226ms
         MetaPrice API running on http://localhost:3099/api
health : HTTP 200 · {"status":"ok","service":"metaprice-api","build_sha":"c471622217c9",...}
```

## KL4 · P1-a'nın sınırı dar — 4 dosya (aşılmadı)

| Dosya | Değişiklik |
|---|---|
| `backend/src/auth/jwt-secret.ts` | **YENİ** — anahtarın tek kaynağı; yoksa açıklayıcı hata fırlatır |
| `backend/src/auth/auth.module.ts` | `secret: jwtSecret()` |
| `backend/src/auth/auth.service.ts` | `secret: jwtSecret()` (imzalama) |
| `backend/src/auth/strategies/jwt.strategy.ts` | `secretOrKey: jwtSecret()` (doğrulama) |

**Değişmeyenler:** token süresi (`JWT_EXPIRES_IN ?? '7d'`), imza algoritması, payload (`sub/email/role`), login akışı, yetki kontrolü. Değişen tek şey **anahtarın kaynağı**. (`.env.example` zaten `JWT_SECRET` satırını taşıyordu — dokunulmadı. Belge maskesi ürün kodu değildir, 4'lük sayıma girmez.)

## KL5 · P1-b KIRMIZI ÖNCE mühürlendi

Test önce yazıldı (`backend/test/kl-kayit-toplami-test.ts`), tamirden ÖNCE koşuldu — **kırmızı çıktısı birebir:**

```
── KL P1-b: KAYIT TOPLAMI ↔ EKRAN TOPLAMI ──
  ❌ K1 malzeme toplami ekranla ayni (kar IKINCI KEZ uygulanmaz) — kaydedilen 384.45000000000005 · ekran 349.5 (fark 34.9500)
  ❌ K2 iscilik toplami ekranla ayni — kaydedilen 132.66000000000003 · ekran 120.6 (fark 12.0600)
  ❌ K3 satir toplami = malzeme + iscilik — kaydedilen 517.1100000000001 · beklenen 470.1
  ❌ K4 birim fiyat sisirilmez (geldigi gibi yazilir) — matBirim 116.5 (gelen 116.5) · toplamBirim 172.37
  ❌ K5 FE acikca toplam gonderdiyse korunur — kaydedilen 700 · gonderilen 1234.5
── SONUC: 0 PASS · 5 FAIL ──
ÇIKIŞ KODU: 1
```

**Sapmanın somut sayıları:** satış birim ₺116,5 · miktar 3 · kar %10 → **ekran ₺349,5, DB ₺384,45 (₺34,95 fazla)**. İşçilikte ₺120,6 yerine ₺132,66.

**⚠ Kök neden FAZ 2'de yazdığımdan AĞIR çıktı.** FAZ 2 "yuvarlamasız çarpım" demişti; kırmızı-önce ölçüm gerçeği gösterdi: **kar İKİ KEZ uygulanıyordu.** Ekranın hücresi (`materialUnitPriceField`) zaten SATIŞ fiyatıdır (kar uygulanmış — `ExcelGrid.tsx:278`), kaydet yükü onu `materialUnitPrice` + aynı yüzdeyi `materialMargin` olarak yolluyordu (`quotes/new/page.tsx:1265-1270`), backend de karı tekrar uyguluyordu (`quotes.service.ts:46-47`). Yuvarlama farkı (1e-12) bunun yanında görünmez kalıyordu. *Kırmızı-önce disiplini olmasaydı, "yuvarlamayı düzelttim" deyip asıl hatayı bırakacaktım.*

**Tamir sonrası (aynı test):** `5 PASS · 0 FAIL` · çıkış 0.

## KL6 · Yapısal ölçüt — aynı fonksiyon, aynı sonuç

**Kural belirlenmedi, tek kaynağa bağlanıldı:**
- Ana yol: **ekran neyi gösteriyorsa o kaydedilir** — FE artık `materialTotalPrice`/`laborTotalPrice` gönderiyor (DTO'ya iki opsiyonel alan eklendi), backend onu **aynen** yazar.
- Geri düşüş (eski istemci, alan yoksa): `yukariYuvarla(birim × miktar)` — FE `hesaplaSatirToplam` (`frontend/lib/pricing.ts:53`) ile **aynı kural**, yuvarlama **tek kaynaktan** (`backend/src/modules/matching/pricing.ts`).

**Kanıt — dosyada bağımsız toplam aritmetiği kaldı mı:**
```
grep -n "\* (1 +\|\* qty\|matWithMargin\|labWithMargin" backend/src/quotes/quotes.service.ts
→ tek isabet: satır 58, ESKİ KODU AÇIKLAYAN YORUM ("matUp * (1 + margin/100)")
```
Kalan aritmetikler ve neden sayılmadıkları: `:21` `satirToplami` (yalnız geri-düşüş; yuvarlaması tek kaynaktan) · `:71-72` `yukariYuvarla(a+b)` (toplama, tek kaynak) · `:77` `netPrice = matUp × (1 − discount/100)` (**toplam değil**, geriye-uyum net fiyat alanı — dokunulmadı, kapsam dar tutuldu) · `:360`, `:396` (KF7 self-check istatistiği, ürün toplamı değil).

**Constraint (dürüst kayıt):** backend `frontend/lib/pricing.ts`'i **import edemez** — `backend/Dockerfile` context'i `./backend`, frontend ağacı imaja hiç girmiyor. "Aynı fonksiyonu çağır" bu yüzden "**ekranın değerini kullan + aynı yuvarlama kaynağı**" olarak uygulandı. Bu, KL6'nın ruhunu (tek kaynak) korur, harfini (aynı fonksiyon nesnesi) teknik olarak karşılayamaz.

## KL7 · 21'in muhasebesi — bir kapı kapandı, **DOKUZ kapı duruyor**

FAZ 2 ölçümü: **21 hesap noktası = 11 tek-formül çağrısı + 10 bağımsız aritmetik.** Bu tamir bağımsız olanı **10 → 9**'a indirdi (kapanan: `quotes.service.ts:44-56`).

**KALAN 9 — tam liste:**

| # | Yer | Ne hesaplıyor |
|---|---|---|
| 1 | `frontend/components/excel-grid/ExcelGrid.tsx:2362-2393` `recalcGrand` | Satır Genel Toplamı (olay yolu) |
| 2 | `frontend/lib/pricing.ts:165-171` (`toplamlariTamamla` içi) | Aynı kuralın 2. uygulaması (içe aktarma) |
| 3 | `frontend/components/excel-grid/fill-down.ts:77-94` `genelToplamiTazele` | 3. uygulama (toplu doldurma; ⚠ epsilonsuz yuvarlama) |
| 4 | `backend/src/quotes/standart-cikti.ts:186` | 4. uygulama (çıktı satırının Genel kolonu) |
| 5 | `frontend/components/excel-grid/ExcelGrid.tsx:1942-1999` `updatePinnedBottom` | Ekran altı GENEL TOPLAM (`_ozet` hariç) |
| 6 | `backend/src/quotes/standart-cikti.ts:165-209` | Çıktı SAYFA TOPLAMI (değer olarak) |
| 7 | `backend/src/quote-formats/format-engine.ts:288-289` + `backend/src/quotes/export-engine.ts:184-197` | İCMAL toplamları (JS değeri + canlı `SUM` formülü) |
| 8 | `backend/src/quote-formats/format-engine.ts:295` + `:311-312` | KDV (değer + canlı formül) |
| 9 | `frontend/app/(protected)/quotes/page.tsx:33` | Teklif listesi: `items.reduce(finalPrice)` |

Tek tamir bu sınıfın çözümü değildir. **Not:** 9 numaralı satır artık düzeltilmiş DB değerlerini toplar — yani bu tamir onun *girdisini* iyileştirdi, kendisini kaldırmadı. **Eski kayıtlardaki şişik toplamlar DURUYOR** (görüldü, dokunulmadı — geriye dönük veri düzeltmesi ayrı karar).

## KL8-KL14 · Klasör planı

`docs/PLAN_Klasor_Duzeni.md` yazıldı (965 satır). İçindekiler ölçütlere göre:

| Ölçüt | Karşılığı |
|---|---|
| **KL8** — mevcut ağaç gösterilerek başlanır | §9'da HS8 ağacı **aynen** (üretim: `node scripts/harita-uret.mjs --agac`, çıkış 0) |
| **KL9** — taşıma haritası TAM | §11'de **300 satır**: her dosya için ya yeni yol ya `KALIYOR`. **Sayım: taşınan 240 + kalan 60 = 300 ✅** (otomatik katmandaki kod dosyası sayısıyla birebir) |
| **KL10** — "ne kırılır", yedi kalem | §6'da tablo: import yolları · tsconfig · test glob/fixture · CI workflow · Docker COPY · deploy.sh · ★ `test:harita` + `harita-uret.mjs` + haritanın kendisi. Her biri için *kırılır mı / nasıl onarılır / aynı commit'te mi* |
| **KL11** — iki düzen yan yana | §3'te katman bazlı ve özellik bazlı ayrı ayrı, kazanç+bedel tablolarıyla; karar verisi (54 dosya %20,1 · 166 dosya %61,7 · test 64 > ürün 54) yazılı; **tavsiye Seçenek C (karma)** ama **karar kullanıcının** |
| **KL12** — J donmuş blok | §5: 44 (haritada 45) DWG dosyası taşınmaz; sınırın tam olarak nerede geçtiği listelendi; **tek sızıntı** (ortak altyapı taşınınca J'nin import satırları güncellenir) ve **bedeli** (%84 düzenli / %16 düzensiz yan yana) açıkça yazıldı |
| **KL13** — uygulama sırası ve duraklar | §7: `git mv` zorunlu · 6 grup, 6 durak (K → L → H → G → M → çekirdek akış) · her commit sonrası `tsc --noEmit` temiz + `test:harita` + `test:regression` · her adımın geri alma yolu (`git revert`) |
| **KL14** — hiçbir dosya taşınmadı | ✅ `git mv` **hiç çalıştırılmadı**; bu turda taşınan dosya **0** |

**Planı yazarken çıkan ayrım (planın §4'ünde yazılı):** HS şemasında `*.module.ts` → L idi ("ne yapıyor"); taşımada modül **kardeşlerinin** grubunu devralır ("nerede yaşamalı") — yoksa her özellik iki klasöre bölünürdü. Sınıflandırma çürümedi; iki farklı sorunun iki farklı cevabı olduğu görüldü.

## KL15 · BİTTİ mi?

| Adım | Durum |
|---|---|
| ADIM 0 | ✅ BİTTİ (`fa0a01e`, CI #50 yeşil) |
| ADIM 2 (P1-b) | ✅ BİTTİ (`c471622`, CI #51 yeşil, kırmızı→yeşil ölçüldü) |
| ADIM 3 (plan) | ✅ BİTTİ (`docs/PLAN_Klasor_Duzeni.md`, 300/300 tablo) |
| ADIM 1 (P1-a) | ⏸ **KOD BİTTİ, KANITLAR ATEŞLENDİ, BİRLEŞTİRİLMEDİ** — KL2'nin cevabı bekleniyor. Durulan nokta: lokal commit; eksik olan tek şey kullanıcının canlı `JWT_SECRET` kontrolü |

---

## Bu turda GÖRÜLDÜ, DOKUNULMADI

1. **Eski tekliflerdeki şişik toplamlar** — bu tamir yalnız YENİ kayıtları düzeltir; DB'de duran çift-karlı toplamlar olduğu gibi kalır (geriye dönük düzeltme = ayrı karar, veri dokunuşu).
2. `quotes.service.ts:77` `netPrice = matUp × (1 − discount/100)` — geriye-uyum alanı; girdi zaten satış fiyatı olduğu için anlamı bulanık, ama toplam üretmediği için kapsam dışında bırakıldı.
3. FAZ 2'de listelenen P2/P3 kusurları (dashboard çift parse · `fill-down.ts:93` epsilon · `updatePinnedBottom` `toFixed(2)` · restore'da `etkinMiktar` atlanması · ölü kod adayları) — görev sınırı gereği açılmadı.
4. **Yerel PostgreSQL bu oturumda kendiliğinden kapanmıştı** (kanıt 3'ün ilk denemesi `P1001` verdi); belgeli reçeteyle yeniden başlatıldı. KD10'un "PG kararsız" kaydı hâlâ canlı bir gözlem.

## Kapılar (git add'den SONRA) ve kapanış

```
test:harita      → PASS · kod dosyası 301/301 · bekleyenler 0 (HEAD: 0)
test:regression  → 28 PASS · 0 FAIL · 3 SKIP   (yeni kapı test:kl-kayit dahil)
```
Sıra: düzenlemeler → `git add -A` → kapılar → commit. ADIM 2'de kapı **kırmızı yandı** (yeni test dosyası haritada yoktu) — haritaya satır eklenip yeşile döndü: kapının kendisi bu turda ateşlendiği görülmüş oldu.

```
Haritada değişen satır: başlık · v0.1 ÇOĞUNLUKLA BOŞ → v1.0 SINIFLANDIRMA TAM (300/300) · sürüm hash'leri haritadan ÇIKARILDI (tek kaynak: pano + /api/health)
Haritada değişen satır: H · backend/test/kl-kayit-toplami-test.ts (yeni) · KL P1-b mührü, kırmızı-önce ölçüldü
Haritada değişen satır: A ve I · bayat "Durum" satırları anlık-renk taşımayan hâle çekildi
Bekleyenler listesi: 0 -> 0 (cırcır sabit; yeni dosya doğrudan haritaya girdi)
```
