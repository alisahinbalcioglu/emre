# PLAN — KLASÖR DÜZENİ (uygulanmadı, yazıldı)

**Tarih:** 03.08.2026 · **Seri:** KL (ADIM 3) · **Durum:** ⏸ ONAY BEKLİYOR — **bu turda hiçbir dosya taşınmadı, tek `git mv` çalıştırılmadı.**

> **Bu belge bir tekliftir, karar değildir.** İki düzen yan yana, kazancı ve bedeliyle sunulur; tavsiye yazılıdır ama **seçim kullanıcınındır.** Onaylanmadan uygulama başlamaz.

---

## ⚠ TAZELEME — 03.08.2026, uygulama turu (BU BÖLÜM ÖNCELİKLİDİR)

**Onay alındı:** Düzen **C (karma)** · donmuş blok sınırı **YOL düzeyinde**.
Aşağıdaki gövde 03.08 sabahındaki **300 dosyalık** fotoğrafa göre yazıldı ve iki noktada eskidi. Çelişki halinde **bu bölüm geçerlidir**; gövde tarihsel kayıt olarak korunuyor.

### (1) Repo 300 değil **307** dosya — 7 dosya plandan sonra eklendi

| Dosya | Geldiği commit | Karar |
|---|---|---|
| `backend/src/auth/jwt-secret.ts` | `b6266b7` | **TAŞINIR** → `backend/src/altyapi/auth/` |
| `backend/test/kl-kayit-toplami-test.ts` | `c471622` | **TAŞINIR** → `backend/test/birim/` |
| `backend/test/p2-2-sheets-indeks-test.ts` | `2c69ecb` | **TAŞINIR** → `backend/test/birim/` |
| `frontend/components/excel-grid/kar-yayilimi.test.ts` | `2c69ecb` | **TAŞINIR** → `frontend/test/birim/` |
| `frontend/components/dwg-workspace/equipment-popup-mod.ts` | `2c69ecb` | **KALIYOR** (J, donmuş blok) |
| `frontend/components/dwg-workspace/equipment-popup-mod.test.ts` | `2c69ecb` | **KALIYOR** (sınır kararı, aşağıda) |
| `scripts/jwt-secret-kur.sh` | `0163bb6` | **KALIYOR** (kök `scripts/`) |

### (2) ★ Donmuş blok sınırı YOL düzeyinde — 8 dosya taşıma listesinden ÇIKARILDI

Gövdedeki §11 tablosu, grup etiketi J olan 45 dosyanın 45'ini de "kalıyor" gösteriyor — **ama bu ölçüm yalancı yeşildi.** §5'in çizdiği sınırın *içinde* olup H/I etiketi yüzünden taşınan 8 dosya vardı. §5 *"python/tests/** dokunulmaz"* derken §11 tam o dosyaları taşıyordu; iki bölüm birbirini yalanlıyordu.

**Kullanıcı kararı: sınır YOL düzeyinde uygulanır, sekizi de KALIR.**

1. `backend/src/modules/dwg-engine/python/deploy-to-cloudrun.sh`
2-5. `backend/src/modules/dwg-engine/python/tests/` altındaki 4 Python testi
6. `backend/src/modules/dwg-engine/scale-param.test.ts`
7. `frontend/components/dwg-metraj/unit-detection.test.ts`
8. `frontend/components/dwg-viewer/segment-length.test.ts`

*Gerekçe:* kullanıcının sözü (*"şu an DWG'yi karıştırmayalım"*) harfiyen tutulur; ayrıca DWG Python imajının `docker-compose` derleme bağlamı kendi `tests/` klasörünü kaybetmez. Bedeli açık: bu dokuz dosya yeni test düzenine girmez, DWG turunda taşınır.

### (3) Geçerli sayılar

| | Gövde (eski) | **Geçerli** |
|---|---|---|
| Taşınan | 240 | **206** |
| Kalıyor | 60 | **101** |
| **Toplam** | 300 | **307** |

206 = 240 + 4 (yeni taşınan) − 8 (donmuş blok, madde 2) − 30 (`frontend/app/`, madde 6) · 101 = 60 + 3 + 8 + 30.
`KOD_HARITASI.md` J başlığı da **44 → 45** düzeltildi (tablo baştan beri 45 satırdı, başlık güncellenmemişti).

### (4) Gövdedeki §6 "yedi kırılma kalemi" EKSİK — beş kalem eklendi

Ölçüldü, gövdeye güvenilmedi:

| Ek kalem | Durum |
|---|---|
| **`nest-cli.json`** (görevin özellikle sorduğu) | Listede **yoktu**. Ölçüldü: `assets`/glob anahtarı yok, `sourceRoot: src` korunuyor → **kırılmaz**. Ama bu "ölçülmüş" değil "şansa denk gelmiş"ti; artık yazılı. |
| **Alias'lı import metinleri** | 66 dosyada **277 adet** `@/...`. Gövde kalem 1'i yalnız *göreli* import diye tarif ediyor. Taşımanın en hacimli işi sayılmamıştı. |
| **`package.json` script gövdeleri** | 35+ script sabit `test/<dosya>.ts` yolu taşıyor; plan o dosyaları `test/birim/` altına taşıyor. Hiçbir kalem üstlenmiyordu. |
| **`docker-compose.yml` + `.dockerignore`** | Doğrudan kaynak yolu taşıyorlar (`.../dwg-engine/python`). Gövde yalnız Dockerfile'a bakmış. Bugün donmuş bloğu işaret ettikleri için güvenli. |
| ★ **Doğrulama makamı yanlış yazılmış** | Gövde *"doğrulayan makam tip denetleyicidir"* diyor. `backend/tsconfig.json` `test` dizinini **exclude** ediyor — `tsc`, taşınan test dosyalarını **görmez**. Test tarafının tek gerçek kapısı `test:regression` koşumudur. |

### (6) ★★ `frontend/app/` ALTINDAKİ 30 DOSYA TAŞIMA LİSTESİNDEN ÇIKARILDI

**Gövdenin §11 tablosu, kendi §-ağacı ve kendi uyarısıyla çelişiyordu.** Gövde satır 712 açıkça şöyle diyor:

> ⚠ `frontend/app/` Next.js App Router zorunluluğudur: rota ağacı klasör adından türer, **taşınamaz.** Sayfa dosyaları yerinde kalır.

Ağaç şeması da `app/ (… KALIYOR)` yazıyor. Buna rağmen §11 tablosu **30 dosyayı** `frontend/app/` altından çıkarıyordu — altı gruba yayılmış: **K 7 · G 17 · F 1 · M 2 · B 2 · H 1**.

**Bu uygulanırsa ürün tamamen çöker.** Next.js App Router rotaları klasör yolundan türetir; `frontend/app/` ortadan kalkınca uygulamanın **hiçbir rotası kalmaz** — `layout.tsx`, `login/page.tsx`, `dashboard/page.tsx` dahil. Ölçüldü: `next.config.js` içinde app-dizinini geçersiz kılan bir ayar **yok** (`distDir`/`pageExtensions`/`src` yönlendirmesi), ve `frontend/src/` dizini de **yok** — yani `app/` frontend kökünde kalmak zorunda.

**Karar: otuzu da KALIYOR.** Bu bir tercih değil, çerçeve zorunluluğu; tek güvenli seçenek bu. Gövdenin kendi cümlesi zaten yol gösteriyor: *"sayfa dosyaları yerinde kalır; **içlerindeki mantık** özellik klasörlerine çekilebilir — ama bu bir REFAKTÖR işidir, taşıma turunun konusu değildir (ayrı kalem)."*

⚠ **Bu, gövdenin ÜÇÜNCÜ aynı sınıf hatasıdır:** §11 tablosu düz metinle çelişiyor (önceki ikisi: J sınırı ve 240/60 sayıları). Tabloyu üreten adım ile metni yazan adım birbirini denetlememiş. **Kalan gruplara geçmeden önce her grubun listesi, gövdenin kendi kısıtlarına karşı ayrıca okunacak** — tablo tek başına yetkili sayılmayacak.

**Güncellenen sayılar:** taşınan **236 → 206** · kalıyor **71 → 101** · toplam **307**.
DURAK 1 (K grubu) **27 → 20 dosya**.

### (7) ★★ KALAN BEŞ DURAK YENİDEN TASARLANDI (04.08 · DURAK 1 sonrası)

DURAK 1 (K, 20 dosya) `8516350` ile kapandı. Öncesinde yapılan altı gruplu denetim **60 ihlal** buldu; bu bölüm o ihlalleri kapatan revize tasarımdır. **Çelişki halinde §11 tablosu değil BU bölüm geçerlidir.**

#### 7.1 · Üç sert engel — bunlar taşınamaz, tablo yanılıyordu

| Dosya | Tablonun hedefi | Neden imkânsız |
|---|---|---|
| `backend/src/main.ts` | `src/altyapi/cekirdek/` | Çıktı `dist/main.js` olmak zorunda: Dockerfile `CMD`, `start:prod`, `derleme-kapisi.js` üçü de o yola bağlı |
| `backend/src/health.controller.ts` | `backend/scripts/` | `src` dışına `.ts` çıkamaz → **TS6059, backend hiç derlenmez** |
| `backend/src/surum.ts` | `backend/scripts/` | Aynı ihlal + `surum-yaz.js` kardeşini sabit `src/` altına üretiyor |

Ayrıca **kalıyor**: `app.module.ts` (20 göreli modül kablosu taşıyor; taşınırsa her durakta yeniden düzenlenir, kazanç sıfır) · `bootstrap.controller.ts` · `backend/prisma/schema.prisma` (Prisma CLI varsayılan yolu; Dockerfile + render.yaml ona bağlı).

#### 7.2 · ★ H GRUBU (testler) TAŞINMIYOR — kararın gerekçesi

Plan H'yi 3. durağa koymuş, *"ürün koduna dokunmaz, kırılsa üretim etkilenmez"* demişti. Denetim tersini ölçtü: **en çok bağlı grup, 29 ihlal.**

**`backend/test/` altındaki 39 `.ts` dosyasının tamamı YERİNDE KALIR.** Gerekçe tek cümlede: *kazanç sıfır, bedel en yüksek.* Plan onları `test/birim/` altına alıyor ama `test/e2e/` **boş doğuyor** (backend'de e2e testi yok) — net etki yalnız bir seviye derinlik. Buna karşılık kırılanlar: `backend/package.json`'da **~35 script gövdesi** (`ts-node test/<dosya>.ts`) · `manifest-kapisi.ts`/`tam-zincir.ts`/`build-sha-kablolama-test.ts`'in kök-türetme mantığı · `__dirname` göreli fixture kökleri · `test/fixtures/` yolunu metin olarak taşıyan iki denetim.

Bu tek karar 29 ihlalin çoğunu siler. **Taşınan tek şey: 15 frontend e2e dosyası** → `frontend/test/e2e/`.

Ayrıca kalır: `frontend/lib/*.test.ts` (7) ve `frontend/components/excel-grid/*.test.ts` (5) — bunlar kaynağının **kardeşi** ve onu `./` ile çağırıyor; taşınmaları sonraki durakların işini çoğaltır.

#### 7.3 · Revize durak sırası — 5 durak, 9-13 commit

| Durak | Grup | Dosya | Commit | Not |
|---|---|---|---|---|
| **2** | L · altyapı **+ I** | 15 + 2 | **2** | 2a: `src/prisma/` → `altyapi/db/` (donmuş bloğa hiç dokunmaz) · 2b: `src/auth/` → `altyapi/auth/` (alt klasörler **düzleştirilmez**). I grubu ayrı durak açmaz, L'nin içine girer |
| **3** | M · teklif | 7 | **1** | Küçük; revize ritmi büyük duraklardan önce bir kez daha sınar |
| **4** | G · kütüphane | 34 | **2** | 4a backend (~25) · 4b frontend (~9). İki tarafın kapıları farklı |
| **5** | A-F · çekirdek | 63 | **3-4** | 5a backend eşleştirme (en yoğun bağımlılık: `terminology.service` 19 tüketici) önce |
| **6** | H · yalnız FE e2e | 15 | **1** | Geri kalan H taşınmıyor (7.2) |

**Sıra değişti:** H, 3. sıradan sona alındı ve neredeyse tamamen boşaltıldı.

#### 7.4 · Donmuş bloğa dokunan tek satır — bilerek en sona

`dwg-engine.controller.ts:7` → `../../auth/guards/jwt-auth.guard`. Auth taşınınca bu **tek satır** değişir; dosya yerinden oynamaz, sınır yol düzeyinde korunur. Bu yüzden DURAK 2 ikiye bölündü: prisma önce gider, donmuş bloğa dokunan auth adımı **sona** kalır — ters giderse geri alınacak commit en üstte olur.

"Guard kalsın, auth taşınsın" reddedildi: auth'u ikiye böler, *"auth nerede yaşıyor"* sorusunun iki cevabı olur. Ya hepsi ya hiçbiri.

#### 7.5 · Tabloda bulunan iki hedef daha yanlış

- `backend/src/quotes/standart-cikti.ts` → tablo `src/ozellik/toplam/` diyor; **§10 hedef ağacında `toplam` diye bir dizin YOK.** `cikti` olarak düzeltilecek.
- `jwt-secret.ts` tabloda hiç yok ama üç L dosyası onu **kardeş** olarak import ediyor; auth ile birlikte taşınırsa o üç satırın hiçbiri değişmez.

#### 7.6 · DURAK 1'den kalıcılaşan üç kural

1. **Dizin bazlı import değiştirme yasak** — dosya bazlı tam eşleme. (`lib/`'in 17 dosyasından 2'si taşındı; toplu değiştirme `@/lib/pricing`'i bozardı.)
2. **Tailwind `content` glob'u** — `./ortak/**` ve `./ozellik/**` eklendi. Bu kalem G · M · B gruplarında da vardı, artık peşin çözülü.
3. **Sessiz kırılma "build yeşil" ile kapatılmaz** — taşınan dosyalara özgü bir sınıfın üretilen CSS'te olduğu ayrıca ölçülür. DURAK 1'de 322 sınıf denetlendi.

#### 7.7 · `tsc`'nin göremediği üç sınıf — elle doğrulanacak

- `backend/tsconfig.json` `test` dizinini **exclude** ediyor → test kırılmasını `tsc` görmez, tek kapı `test:regression`
- `admin.service.ts` ve `labor-firms.service.ts` gövde içi **dinamik `require()`** kullanıyor (7 çağrı) — tip denetimi bunları denetlemez
- `backend/test/**` içindeki `../src/...` belirteçleri (9 satır) aynı sebeple görünmez

### (5) 7. kalem (harita kapısı) TERS yönde çıktı — ve düzeltildi

Gövde *"taşıma haritayı geçersizleştirir, `test:harita` KIRMIZI yanar"* diyordu. ADIM 1c'de kasten ateşlendi: kapı **YEŞİL** dedi. Sebep, kapının çıplak-dosya-adı geri düşüşüydü; kapsam içi 306 dosyanın **257'sinin (%84)** adı tek olduğu için taşımanın %84'ü denetimsizdi. Kapı `b3ebf74` ile sağlamlaştırıldı (çıplak-ad kaldırıldı + ters yön eklendi) ve kırmızısı ateşlendi. **Taşıma bu kapı olmadan başlamamalıydı.**

## 1 · Neden şimdi yapılabilir

Klasör düzeni tartışması iki turdur erteleniyordu, çünkü ön şartı yoktu: *"hangi dosya nereye gider"* sorusu, **her dosyanın ne yaptığı bilinmeden** cevaplanamaz. O ön şart HS turunda kapandı — 300 kod dosyasının **300'ü** haritada, 269'u okunarak sınıflandırıldı, taksonomi (A-M) donduruldu. Bu plan o sınıflandırmanın üstüne kurulur; başka hiçbir girdisi yok.

## 2 · KARAR VERİSİ — düzeni sayılar seçtirir

HS sınıflandırmasının ölçtüğü dağılım (269 sınıflandırılmış dosya üzerinden):

| Küme | Dosya | Oran |
|---|---|---|
| **Çekirdek fiyatlama akışı** (A giriş · B tablo · C eşleştirme · D fiyat · E toplam · F çıktı) | **54** | **%20,1** |
| H testler | 64 | %23,8 |
| J DWG-metraj (ikinci ürün hattı) | 44 | %16,4 |
| K ortak UI/kabuk/istemci | 27 | %10,0 |
| L çekirdek backend altyapısı | 31 | %11,5 |
| G kütüphane ve yönetim | 40 | %14,9 |
| M teklif yaşam döngüsü | 8 | %3,0 |
| I derleme/deploy | 9 | %3,3 |

**Üç sayı düzeni belirliyor:**
1. **H+J+K+L = 166 dosya (%61,7) ürün akışının DIŞINDA.** Saf özellik bazlı bir bölme bunları kapsamaz.
2. **Testler (64) > ürün akışı (54).** Test yerleşimi, ürün yerleşimi kadar önemli bir karardır — sonradan düşünülecek bir ayrıntı değil.
3. Çekirdek akış yalnız **54 dosya**. Özellik klasörleri bu 54'ü güzelce toplar; kalan 215 dosya yine katman gibi durur.

**Sonuç: karma bir düzen kaçınılmaz.** Bu plan bunu gizlemiyor — saf özellik bazlı düzen bu kod tabanında mümkün değil.

## 3 · İKİ DÜZEN, YAN YANA

### Seçenek A — Katman bazlı (bugünkü düzenin derli toplu hâli)

```
backend/src/{admin,ai,auth,brands,library,quotes,modules/...}
frontend/{app,components,hooks,lib,contexts}
```

| Kazanç | Bedel |
|---|---|
| Taşıma maliyeti ~sıfır; bugünkü düzen zaten bu | Haritanın çözdüğü sorunu çözmez: "toplam nerede hesaplanıyor" sorusu 5 klasöre dağılmış cevabı sürdürür |
| NestJS/Next.js topluluk kalıplarına birebir uyar; yeni gelen tanıdık bulur | Bir özelliği değiştirmek 4-6 klasöre dokunmayı gerektirir (bu projede fiilen yaşandı: başlık kararı 3 ayrı katmanda) |
| Docker/CI/tsconfig yolları değişmez | 2729 satırlık `ExcelGrid.tsx` gibi dev dosyalar "components" altında görünmez kalır |

### Seçenek B — Özellik bazlı (saf)

```
src/ozellik/{giris,tablo,eslestirme,fiyat,toplam,cikti,kutuphane,teklif}/...
```

| Kazanç | Bedel |
|---|---|
| Bir özelliğin tamamı tek klasörde: "fiyat nerede" sorusu tek cevap | **Yalnız 54 dosyayı (%20,1) kapsar** — kalan 215 için yine bir yer bulmak gerekir |
| Harita ile klasör aynı dili konuşur (A-M ↔ klasör adı) | Backend/frontend ayrımını yok saymak imkânsız: iki ayrı derleme, iki ayrı Docker context, iki ayrı `tsconfig` |
| Yeni özellik eklemek = yeni klasör | Testler ve altyapı için yapay "diğer" klasörleri doğar |

### ★ TAVSİYE — Seçenek C: KARMA (katman dışta, özellik içte)

**Katman iskeleti korunur** (backend/frontend ayrımı teknik zorunluluk), **katmanın içinde özellik klasörleri** açılır:

```
backend/src/ozellik/{giris,eslestirme,fiyat,cikti,kutuphane,teklif}/…
backend/src/altyapi/{auth,db,cekirdek}/…
frontend/ozellik/{giris,tablo,eslestirme,fiyat,cikti,kutuphane,teklif}/…
frontend/ortak/{ui,hooks,lib,contexts,kabuk}/…
{backend,frontend}/test/{birim,e2e}/…
```

**Neden bu:** 54 dosyalık çekirdek akış özellik klasörlerine oturur (asıl kazanç orada), 166 dosyalık akış-dışı küme kendi dürüst adını alır (`altyapi`, `ortak`, `test`), backend/frontend ayrımı bozulmaz (Docker/tsconfig sağlam kalır). **Karar senin** — A veya B seçilirse bu plandaki taşıma haritası yeniden üretilir (üretici betik deterministik, girdi haritanın kendisi).

## 4 · YERLEŞİM ≠ SINIFLANDIRMA (plan yazılırken çıkan ayrım)

HS şemasında `*.module.ts` → **L** idi ("ne yapıyor": kablolama). Taşıma sorusu farklıdır ("nerede yaşamalı"): NestJS modülü **kardeş controller/service'iyle aynı klasörde** durmalı, yoksa her özellik iki yere bölünür. Bu planda modül dosyası **kardeşlerinin grubunu devralır** (istisna: `app.module.ts`, `prisma.module.ts`, `auth.module.ts` → altyapı). Bu, sınıflandırmayı çürütmez; iki farklı sorunun iki farklı cevabı olduğunu gösterir ve planda açıkça yazılıdır.

## 5 · J GRUBU — KASITLI DONMUŞ BLOK (KL12)

**44 DWG dosyası taşınmaz.** Bu bir eksik değil, **sınırı çizilmiş karar** (kullanıcı: *"şu an DWG'yi karıştırmayalım"*).

**Sınır tam olarak nerede geçiyor:**
- `backend/src/modules/dwg-engine/**` (TS sarmalayıcı + `python/**` motor + `python/tests/**`) — dokunulmaz
- `frontend/components/{dwg-viewer,dwg-workspace,dwg-metraj,dwg-diameter-engine,dwg-tagging}/**` — dokunulmaz
- `frontend/app/(protected)/dwg-workspace/page.tsx` · `frontend/lib/metraj-excel.ts` — dokunulmaz
- Sınırın DIŞI: DWG'yi çağıran ortak altyapı (`lib/api.ts`, `ui/*`) taşınır — **DWG kodu bu dosyaların yolunu import ediyorsa import düzeltmesi J dosyalarına da dokunur.** Bu, "donmuş blok" kararının tek sızıntısıdır ve planlıdır: J dosyalarının İÇERİĞİ değişmez, yalnız import satırları güncellenir.

**Bedeli (yazılı):** düzenlenmiş %84 ile düzenlenmemiş %16 yan yana yaşayacak. `frontend/ozellik/…` ve `frontend/components/dwg-*` aynı ağaçta duracak; yeni gelen "neden bazıları böyle?" diye soracak. Bu bedel bilerek kabul ediliyor — alternatifi, karar verilmemiş bir alanı taşımaktı.

## 6 · NE KIRILIR — yedi kalem, tek tek (KL10)

| # | Ne | Kırılır mı? | Nasıl onarılır | Aynı commit'te mi? |
|---|---|---|---|---|
| 1 | **Kaynak import yolları** | **EVET, kesin.** Göreli import (`../../lib/pricing`) taşımayla bozulur | `git mv` sonrası IDE/`tsc` hataları yol gösterir; toplu düzeltme `tsc --noEmit` temizlenene kadar | **EVET — zorunlu.** İmport bozukken commit atılmaz |
| 2 | **tsconfig path/alias** | **KISMEN.** `@/*` → `frontend/*` alias'ı kök değişmedikçe çalışır; `backend/tsconfig.json` `rootDir`/`include` yolları kontrol edilmeli | Alias tablosunu yeni klasörlere göre genişlet (`@ozellik/*`, `@ortak/*`) — opsiyonel ama önerilir | **EVET** |
| 3 | **Test glob'ları ve fixture yolları** | **EVET.** `vitest.config.ts` include kalıpları + testlerin `path.resolve(__dirname, '../../test-fixtures/…')` çağrıları taşımayla kayar | Glob'ları yeni test kökine çevir; fixture yolları `test-fixtures/` taşınmadığı için yalnız `__dirname` derinliği kadar değişir | **EVET** |
| 4 | **CI workflow yolları** | **EVET.** `.github/workflows/regression.yml` `working-directory: backend` ve script adlarına bakar | Script adları değişmiyorsa yalnız yol önekleri; `npm run test:regression` tek giriş noktası olduğu için etki dar | **EVET** |
| 5 | **Docker COPY yolları** | **KISMEN.** `backend/Dockerfile` context'i `./backend`, `COPY . .` yapıyor → içerideki yeniden düzen **etkilemez**. Ama `prisma/` ve `scripts/` özel COPY satırları varsa kontrol edilmeli | Dockerfile'daki her açık yolu yeni yapıya çevir; build'i yerel dene | **EVET** |
| 6 | **`deploy.sh` yolları** | **HAYIR (bugünkü hâliyle).** Betik `cd /opt/metaprice` + `docker compose` çalıştırıyor, kaynak dosya yolu içermiyor | — (yine de taşıma sonrası bir kez okunmalı) | Gerekmez |
| 7 | ★ **`test:harita` kapısı + `scripts/harita-uret.mjs` + `KOD_HARITASI.md`** | **EVET — ve en sinsisi.** Üçü de dosya YOLUNA bakar. `harita-uret.mjs` `git ls-files`'tan üretir (kendini günceller), ama **`KOD_HARITASI.md` elle yazılmış yolları taşır** → taşıma haritanın kendisini geçersizleştirir, kapı kırmızıya döner | Haritadaki her `dosya:satır` alıntısı yeni yola çevrilir (taşınan 240 dosyanın haritada geçen her satırı). Otomatik katman kendini üretir; elle katman elle güncellenir | **EVET — ZORUNLU.** Harita ve taşıma aynı commit'te gitmezse CI kırmızı yanar |

**7 numaranın altı çizili sonucu:** her taşıma commit'i, o commit'te taşınan dosyaların harita satırlarını da taşımak zorundadır. Bu, taşımayı "grup grup" yapmanın en güçlü gerekçesidir — tek dev commit'te 240 dosyanın harita satırını birlikte düzeltmek pratikte imkânsızdır.

## 7 · UYGULAMA SIRASI (KL13)

**Araç:** `git mv` — kopyala-sil DEĞİL. Geçmiş korunur, `git log --follow` çalışır, kod incelemesi taşımayı yeniden yazım gibi göstermez.

**Doğrulayan makam göz değil, tip denetleyicidir:** her commit sonrası `npx tsc --noEmit` (backend + frontend) **temiz** olmak zorunda; ayrıca `npm run test:harita` PASS ve `npm run test:regression` yeşil.

| Sıra | Grup | Dosya | Neden bu sırada | Geri alma |
|---|---|---|---|---|
| 1 | **K · ortak UI/kabuk** | 27 | Yaprak katman — kimseyi import etmez, herkes onu import eder. En çok import edilen 4 dosyanın 4'ü burada; erken taşıyınca sonraki adımların import düzeltmesi tek seferde yapılır | `git revert <sha>` — tek commit, davranış değişmedi |
| 2 | **L · altyapı** | 16 | İkinci yaprak (auth/prisma/kablolama). Ürün mantığı yok → kırılırsa hemen görünür (uygulama açılmaz) | `git revert` |
| 3 | **H · testler** | 73 | Ürün koduna dokunmaz; kırılsa üretim etkilenmez. Test yolları düzelince sonraki adımların doğrulaması güçlenir | `git revert` (CI zaten kapı) |
| 4 | **G · kütüphane/yönetim** | 51 | Büyük ama çekirdek akıştan uzak; admin ekranları izole | `git revert` |
| 5 | **M · teklif yaşam döngüsü** | 9 | Küçük, iyi sınırlı | `git revert` |
| 6 | **A · B · C · D · E · F — çekirdek akış** | 54+ | **EN SON.** Canlı hataların çıktığı yer burası; en son taşınırsa önceki adımlar boru hattını zaten sınamış olur | `git revert` + canlı duman testi |
| — | **J · DWG** | 44 | **TAŞINMAZ** (donmuş blok) | — |

**Her adımın sabit ritmi:** `git mv` → import düzeltmeleri → `tsc --noEmit` (iki taraf) → **harita satırlarını güncelle** → `git add -A` → `test:harita` + `test:regression` → commit → push → CI yeşil → sonraki grup.

**Durak noktaları:** her grup sonunda dur, CI'ı bekle. Bir grup kırmızı yanarsa **sonraki gruba geçilmez** — geri alınır ya da düzeltilir. Altı grup = altı durak.

## 8 · SAYIM (KL9)

| | Dosya |
|---|---|
| Taşınan | **240** |
| Kalıyor | **60** |
| **Toplam** | **300** ✅ (otomatik katmandaki kod dosyası sayısıyla birebir) |

"Kalıyor" diyenler: J grubunun 45 dosyası (donmuş blok) + kök `scripts/` betikleri + build/test config'leri + `prisma/schema.prisma` + zaten hedef yolunda olanlar.

---

## 9 · MEVCUT AĞAÇ (HS8'de üretildi, aynen — hedef ağaç bu görünmeden çizilemez)

Üretim komutu: `node scripts/harita-uret.mjs --agac` (çıkış 0; `git ls-files` tabanlı, `node_modules`/`dist` kapsam dışı).

```
├── .github/
│   └── workflows/
│       ├── keep-alive.yml
│       └── regression.yml
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── scripts/
│   │   ├── derleme-kapisi.js
│   │   └── surum-yaz.js
│   ├── src/
│   │   ├── admin/
│   │   │   ├── admin.controller.ts
│   │   │   ├── admin.module.ts
│   │   │   └── admin.service.ts
│   │   ├── ai/
│   │   │   ├── ai.controller.ts
│   │   │   ├── ai.module.ts
│   │   │   └── ai.service.ts
│   │   ├── auth/
│   │   │   ├── decorators/
│   │   │   │   ├── current-user.decorator.ts
│   │   │   │   └── roles.decorator.ts
│   │   │   ├── dto/
│   │   │   │   ├── login.dto.ts
│   │   │   │   └── register.dto.ts
│   │   │   ├── guards/
│   │   │   │   ├── jwt-auth.guard.ts
│   │   │   │   ├── roles.guard.ts
│   │   │   │   └── tier.guard.ts
│   │   │   ├── strategies/
│   │   │   │   └── jwt.strategy.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.service.ts
│   │   │   └── capabilities.helper.ts
│   │   ├── brands/
│   │   │   ├── dto/
│   │   │   │   └── create-brand.dto.ts
│   │   │   ├── brands.controller.ts
│   │   │   ├── brands.module.ts
│   │   │   └── brands.service.ts
│   │   ├── exchange-rates/
│   │   │   ├── exchange-rates.controller.ts
│   │   │   ├── exchange-rates.module.ts
│   │   │   └── exchange-rates.service.ts
│   │   ├── labor/
│   │   │   ├── labor.controller.ts
│   │   │   ├── labor.module.ts
│   │   │   └── labor.service.ts
│   │   ├── labor-firms/
│   │   │   ├── labor-firms.controller.ts
│   │   │   ├── labor-firms.module.ts
│   │   │   └── labor-firms.service.ts
│   │   ├── library/
│   │   │   ├── dto/
│   │   │   │   ├── bulk-discount.dto.ts
│   │   │   │   ├── bulk-update-items.dto.ts
│   │   │   │   ├── create-library-item.dto.ts
│   │   │   │   ├── create-manual-brand.dto.ts
│   │   │   │   ├── import-price-list.dto.ts
│   │   │   │   └── update-library-item.dto.ts
│   │   │   ├── library-sheet-builder.ts
│   │   │   ├── library.controller.ts
│   │   │   ├── library.module.ts
│   │   │   └── library.service.ts
│   │   ├── materials/
│   │   │   ├── dto/
│   │   │   │   ├── create-material-price.dto.ts
│   │   │   │   └── create-material.dto.ts
│   │   │   ├── materials.controller.ts
│   │   │   ├── materials.module.ts
│   │   │   └── materials.service.ts
│   │   ├── modules/
│   │   │   ├── dwg-engine/
│   │   │   │   ├── python/
│   │   │   │   │   ├── tests/
│   │   │   │   │   │   ├── __init__.py
│   │   │   │   │   │   ├── test_block_to_line_split.py
│   │   │   │   │   │   ├── test_pipe_segments.py
│   │   │   │   │   │   └── test_scale_normalization.py
│   │   │   │   │   ├── .env.example
│   │   │   │   │   ├── .gcloudignore
│   │   │   │   │   ├── CLOUD-RUN-MIGRATION.md
│   │   │   │   │   ├── Dockerfile
│   │   │   │   │   ├── converter.py
│   │   │   │   │   ├── deploy-to-cloudrun.ps1
│   │   │   │   │   ├── deploy-to-cloudrun.sh
│   │   │   │   │   ├── geometry.py
│   │   │   │   │   ├── graph.py
│   │   │   │   │   ├── main.py
│   │   │   │   │   ├── models.py
│   │   │   │   │   ├── parse_worker.py
│   │   │   │   │   ├── pipe_segments.py
│   │   │   │   │   ├── requirements.txt
│   │   │   │   │   ├── topology.py
│   │   │   │   │   └── upload_worker.py
│   │   │   │   ├── dwg-engine.controller.ts
│   │   │   │   ├── dwg-engine.module.ts
│   │   │   │   ├── dwg-engine.service.ts
│   │   │   │   ├── scale-param.test.ts
│   │   │   │   └── scale-param.ts
│   │   │   ├── excel-engine/
│   │   │   │   ├── excel-engine.controller.ts
│   │   │   │   ├── excel-engine.module.ts
│   │   │   │   └── excel-engine.service.ts
│   │   │   ├── excel-grid/
│   │   │   │   ├── excel-grid.controller.ts
│   │   │   │   ├── excel-grid.module.ts
│   │   │   │   ├── excel-grid.service.ts
│   │   │   │   ├── sheet-discipline.ts
│   │   │   │   └── standart-sema.ts
│   │   │   ├── labor-matching/
│   │   │   │   ├── labor-matching.controller.ts
│   │   │   │   ├── labor-matching.module.ts
│   │   │   │   └── labor-matching.service.ts
│   │   │   └── matching/
│   │   │       ├── index/
│   │   │       │   ├── line-parser.ts
│   │   │       │   ├── outcome-mapper.ts
│   │   │       │   ├── product-index.ts
│   │   │       │   ├── query-engine.ts
│   │   │       │   ├── types.ts
│   │   │       │   └── vocab.ts
│   │   │       ├── ad-cins-sozlugu.ts
│   │   │       ├── ad-resolver.ts
│   │   │       ├── conversion.ts
│   │   │       ├── matching.controller.ts
│   │   │       ├── matching.module.ts
│   │   │       ├── matching.service.ts
│   │   │       ├── normalizer.ts
│   │   │       ├── pricing.ts
│   │   │       ├── shared-tag-matcher.ts
│   │   │       ├── tag-generator.ts
│   │   │       ├── terminology.service.ts
│   │   │       └── types.ts
│   │   ├── prisma/
│   │   │   ├── prisma.module.ts
│   │   │   └── prisma.service.ts
│   │   ├── quote-formats/
│   │   │   ├── format-engine.ts
│   │   │   ├── quote-formats.controller.ts
│   │   │   ├── quote-formats.module.ts
│   │   │   └── quote-formats.service.ts
│   │   ├── quotes/
│   │   │   ├── dto/
│   │   │   │   └── create-quote.dto.ts
│   │   │   ├── export-engine.ts
│   │   │   ├── quotes.controller.ts
│   │   │   ├── quotes.module.ts
│   │   │   ├── quotes.service.ts
│   │   │   └── standart-cikti.ts
│   │   ├── utils/
│   │   │   ├── build-material-context.ts
│   │   │   ├── etiket-display.ts
│   │   │   ├── import-fidelity.ts
│   │   │   └── xlsx-to-pdf.ts
│   │   ├── app.module.ts
│   │   ├── bootstrap.controller.ts
│   │   ├── health.controller.ts
│   │   ├── main.ts
│   │   └── surum.ts
│   ├── test/
│   │   ├── fixtures/
│   │   │   ├── FIRMA-F-algilama-iscilik.xlsm
│   │   │   ├── FIRMA-G.xlsm
│   │   │   ├── demontaj-sefa.xlsx
│   │   │   ├── demontaj.xlsx
│   │   │   ├── fg-FIRMA-H-shared.xlsx
│   │   │   ├── hangar-yss.xlsx
│   │   │   └── yangin-temin-montaj.xlsx
│   │   ├── admin-import-test.ts
│   │   ├── audit-canli-kosum.ts
│   │   ├── audit-real-excel.ts
│   │   ├── build-sha-kablolama-test.ts
│   │   ├── contract-test.ts
│   │   ├── conversion-test.ts
│   │   ├── excel-grid-test.ts
│   │   ├── export-format-test.ts
│   │   ├── export-live-sim-test.ts
│   │   ├── faz0-gs7-probe.ts
│   │   ├── fixture-anonim.ts
│   │   ├── fixture-dogrula.ts
│   │   ├── gercek-dosya-test.ts
│   │   ├── gs6b-teshis.ts
│   │   ├── index-engine-test.ts
│   │   ├── kd11-toplam-yollari-test.ts
│   │   ├── kd12-baslik-satiri-test.ts
│   │   ├── kd9-kur-olcutu-test.ts
│   │   ├── kl-liste-ekleme-test.ts
│   │   ├── labor-matching-test.ts
│   │   ├── labor-sheet-test.ts
│   │   ├── library-transfer-test.ts
│   │   ├── manifest-kapisi.ts
│   │   ├── matching-regression.ts
│   │   ├── matching-unit-test.ts
│   │   ├── onceden-fiyatli-test.ts
│   │   ├── pano18-para-birimi-test.ts
│   │   ├── perf-profil.ts
│   │   ├── pk3-kimlik-haritasi-test.ts
│   │   ├── pk3-repo-kapsama-test.ts
│   │   ├── pk9-sessiz-indeks-test.ts
│   │   ├── product-index-test.ts
│   │   ├── regression-all.ts
│   │   ├── spec-regression-test.ts
│   │   ├── standart-cikti-test.ts
│   │   ├── standart-sema-test.ts
│   │   └── tam-zincir.ts
│   ├── .dockerignore
│   ├── .env.example
│   ├── Dockerfile
│   ├── nest-cli.json
│   ├── package-lock.json
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   ├── DEPLOYMENT.md
│   ├── RAPOR_HR_Kod_Haritasi.md
│   ├── RAPOR_KB_Kutuphane_Baglanti_Olcusu.md
│   └── RAPOR_Oturum_2026-08-02.md
├── frontend/
│   ├── app/
│   │   ├── (protected)/
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── dwg-workspace/
│   │   │   │   └── page.tsx
│   │   │   ├── labor/
│   │   │   │   └── page.tsx
│   │   │   ├── labor-firms/
│   │   │   │   ├── [firmaId]/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── library/
│   │   │   │   ├── brand/
│   │   │   │   │   └── [brandId]/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── electrical-brands/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── equipment/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── mechanical-brands/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── materials/
│   │   │   │   ├── [brandId]/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── electrical/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── mechanical/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── profile/
│   │   │   │   └── page.tsx
│   │   │   ├── quote-formats/
│   │   │   │   └── page.tsx
│   │   │   ├── quotes/
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── new/
│   │   │   │   │   ├── error.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── admin/
│   │   │   ├── brands/
│   │   │   │   └── page.tsx
│   │   │   ├── stats/
│   │   │   │   └── page.tsx
│   │   │   ├── users/
│   │   │   │   └── page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── dev/
│   │   │   └── grid-test/
│   │   │       └── page.tsx
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── admin/
│   │   │   └── AdminSidebar.tsx
│   │   ├── dashboard/
│   │   │   ├── QuickAccess.tsx
│   │   │   ├── QuickStart.tsx
│   │   │   └── RecentQuotes.tsx
│   │   ├── dwg-diameter-engine/
│   │   │   ├── DiameterLegendPanel.tsx
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── useLayerCalc.ts
│   │   │   └── useOriginalColorState.ts
│   │   ├── dwg-metraj/
│   │   │   ├── DiameterEditPopup.tsx
│   │   │   ├── DwgUploader.tsx
│   │   │   ├── MetrajEditor.tsx
│   │   │   ├── constants.ts
│   │   │   ├── diameter-colors.ts
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── unit-detection.test.ts
│   │   │   └── unit-detection.ts
│   │   ├── dwg-tagging/
│   │   │   ├── BucketPanel.tsx
│   │   │   ├── index.ts
│   │   │   └── useTaggingStore.ts
│   │   ├── dwg-viewer/
│   │   │   ├── DxfCanvasViewer.tsx
│   │   │   ├── aci-colors.ts
│   │   │   ├── index.ts
│   │   │   ├── segment-length.test.ts
│   │   │   ├── segment-length.ts
│   │   │   ├── types.ts
│   │   │   └── useViewport.ts
│   │   ├── dwg-workspace/
│   │   │   ├── DwgProjectWorkspace.tsx
│   │   │   ├── EquipmentDetailPopup.tsx
│   │   │   ├── LayerInfoSidebar.tsx
│   │   │   ├── LayerVisibilityPanel.tsx
│   │   │   ├── MetrajSummaryPanel.tsx
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   └── useWorkspaceState.ts
│   │   ├── excel-grid/
│   │   │   ├── CustomDropdown.tsx
│   │   │   ├── ExcelGrid.tsx
│   │   │   ├── SheetTabs.tsx
│   │   │   ├── aday-ayirt-edicilik.test.ts
│   │   │   ├── aday-ayirt-edicilik.ts
│   │   │   ├── build-material-context.test.ts
│   │   │   ├── build-material-context.ts
│   │   │   ├── discount-utils.test.ts
│   │   │   ├── discount-utils.ts
│   │   │   ├── fill-down.test.ts
│   │   │   ├── fill-down.ts
│   │   │   ├── fill-handle.css
│   │   │   ├── types.ts
│   │   │   └── useFillHandle.tsx
│   │   ├── layout/
│   │   │   ├── Breadcrumb.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── library/
│   │   │   ├── InlineFirmEntry.tsx
│   │   │   └── ManualBrandModal.tsx
│   │   ├── quotes/
│   │   │   └── ColumnManagerPanel.tsx
│   │   └── ui/
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── confirm-dialog.tsx
│   │       ├── dialog.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── select.tsx
│   │       ├── table.tsx
│   │       ├── toast.tsx
│   │       └── toaster.tsx
│   ├── contexts/
│   │   └── CapabilitiesContext.tsx
│   ├── e2e/
│   │   └── grid.spec.ts
│   ├── e2e-golden/
│   │   ├── KRITER_DEGISIKLIK_GUNLUGU.md
│   │   ├── artefakt-dizini.cjs
│   │   ├── bolum-f-kabul.spec.ts
│   │   ├── faz0-gs7-teshis.spec.ts
│   │   ├── firma-a-golden.spec.ts
│   │   ├── global-setup.mjs
│   │   ├── golden.spec.ts
│   │   ├── gs-kalicilik.spec.ts
│   │   ├── helpers.ts
│   │   ├── pu4-popup-genislik.spec.ts
│   │   ├── run.mjs
│   │   ├── sayi-ayristirma.mjs
│   │   ├── surum-kapisi.cjs
│   │   └── verify.mjs
│   ├── hooks/
│   │   ├── use-confirm.ts
│   │   ├── use-currency.ts
│   │   └── use-toast.ts
│   ├── lib/
│   │   ├── admin-stats.ts
│   │   ├── api.ts
│   │   ├── disiplin.ts
│   │   ├── export-download.ts
│   │   ├── gs6b-golge-kurali.test.ts
│   │   ├── kaynak-kolon.test.ts
│   │   ├── kaynak-kolon.ts
│   │   ├── merge-multisheet.test.ts
│   │   ├── merge-multisheet.ts
│   │   ├── metraj-excel.ts
│   │   ├── parse-material-text.test.ts
│   │   ├── parse-material-text.ts
│   │   ├── popup-secici-sozlesmesi.test.ts
│   │   ├── pricing.test.ts
│   │   ├── pricing.ts
│   │   ├── sayi-ayristirma.test.ts
│   │   └── utils.ts
│   ├── scripts/
│   │   └── surum-yaz.js
│   ├── types/
│   │   ├── index.ts
│   │   └── quotes.ts
│   ├── .dockerignore
│   ├── .env.example
│   ├── .env.production
│   ├── .gitignore
│   ├── .npmrc
│   ├── CLOUDFLARE_PAGES_SETUP.md
│   ├── Dockerfile
│   ├── next.config.js
│   ├── package-lock.json
│   ├── package.json
│   ├── playwright.config.ts
│   ├── playwright.golden.config.ts
│   ├── postcss.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── wrangler.toml
├── scripts/
│   ├── backup.sh
│   ├── deploy.sh
│   ├── harita-denetle.mjs
│   ├── harita-uret.mjs
│   └── kb5-olcu.sh
├── test-fixtures/
│   ├── e2e/
│   │   ├── 0_Bursa SAHA-BIR inşai işler - Revize Keşif (1).xlsx
│   │   ├── 2024-0001-FIRMA-F Enerji-SAHA-IKI Algılama - İŞÇİLİK.xlsm
│   │   ├── 2024-0001-FIRMA-F_SAHA-IKI_YSS -R003 -FIRMA-B.xlsx
│   │   ├── 2026-0008-FIRMA-C_SAHA-ALTI-FFS - FIRMA-B.xlsx
│   │   ├── F _ G mekanik-elektrik işleri FIRMA-H müh. 14.04.2026 teklif.xlsx
│   │   ├── FIRMA-A KEŞİF ÖZETİ 251224 R1 - FIRMA-B MÜHENDİSLİK.xlsx
│   │   ├── FIRMA-B MÜHENDİSLİK-SAHA-DORT OKUL PROJESİ SAHA-BES.xlsx
│   │   ├── FIRMA-B-2024-0063-R1-FIRMA-G-altnf 1-R1.xlsm
│   │   ├── FIRMA-C ENTEGRE SAHA-UC - Yangın Tesisatı.xlsx
│   │   ├── FIRMA-D-1.xlsx
│   │   ├── FIRMA-E Mobilya Metraj - Copy.xlsx
│   │   ├── GOREV_E2E_10_Dosya_Altin_Yol_Kosumu.md
│   │   ├── yangin-temin-montaj.xlsx
│   │   └── İşçilik_Hangar Yangın Keşif Özeti_R02 (1).xlsx
│   └── regression/
│       ├── FAZ0_KOK_NEDEN_RAPORU.md
│       ├── FAZ0_STANDART_SEMA_KOK_NEDEN.md
│       ├── FAZ3_RAPOR.md
│       ├── GS_MF_KIRMIZI_ONCE.txt
│       ├── KAPSAM_DEVRI.md
│       ├── PU_KIRMIZI_ONCE.txt
│       └── T6_SILME_ENVANTERI.md
├── .env.example
├── .gitignore
├── CLAUDE.md
├── Caddyfile
├── KOD_HARITASI.md
├── KOD_HARITASI_OTOMATIK.md
├── README.md
├── docker-compose.yml
├── harita-bekleyenler.txt
├── harita-kapsam-disi.txt
├── netlify.toml
└── render.yaml

94 dizin, 373 dosya
```

---

## 10 · HEDEF AĞAÇ (Seçenek C — tavsiye edilen)

```
├── .github/workflows/            (değişmez)
├── backend/
│   ├── prisma/schema.prisma      (KALIYOR — tek şema kaynağı)
│   ├── scripts/                  (derleme-kapisi.js · surum-yaz.js — KALIYOR)
│   ├── src/
│   │   ├── main.ts               (KALIYOR — Nest giriş noktası)
│   │   ├── altyapi/
│   │   │   ├── auth/             (guard · strategy · decorator · dto · service)
│   │   │   ├── db/               (prisma.service · prisma.module)
│   │   │   └── cekirdek/         (app.module · health · bootstrap · surum)
│   │   ├── ozellik/
│   │   │   ├── giris/            (excel-grid · excel-engine · ai)
│   │   │   ├── eslestirme/       (matching + index/* · labor-matching · terminology)
│   │   │   ├── fiyat/            (exchange-rates · pricing)
│   │   │   ├── cikti/            (export-engine · standart-cikti · quote-formats)
│   │   │   ├── kutuphane/        (library · brands · materials · labor · labor-firms · admin)
│   │   │   └── teklif/           (quotes)
│   │   └── modules/dwg-engine/   ❄ DONMUŞ BLOK (J — taşınmaz)
│   └── test/
│       ├── birim/                (ts-node kabul/regresyon paketleri)
│       └── e2e/                  (varsa)
├── frontend/
│   ├── app/                      (Next.js rota ağacı — çerçeve zorunluluğu, KALIYOR)
│   ├── ortak/
│   │   ├── ui/ · hooks/ · lib/ · contexts/ · kabuk/
│   ├── ozellik/
│   │   ├── tablo/                (excel-grid bileşenleri: ExcelGrid · fill-down · types…)
│   │   ├── giris/ · eslestirme/ · fiyat/ · cikti/ · kutuphane/ · teklif/
│   ├── components/dwg-*/         ❄ DONMUŞ BLOK (J — taşınmaz)
│   └── test/{birim,e2e}/         (vitest + playwright golden)
├── scripts/                      (deploy.sh · backup.sh · harita-*.mjs · kb5-olcu.sh — KALIYOR)
├── docs/                         (raporlar + bu plan)
└── KOD_HARITASI*.md · harita-*.txt   (KALIYOR — kapı bunlara bakar)
```

> ⚠ `frontend/app/` Next.js App Router zorunluluğudur: rota ağacı klasör adından türer, taşınamaz. Sayfa dosyaları yerinde kalır; **içlerindeki mantık** özellik klasörlerine çekilebilir — ama bu bir REFAKTÖR işidir, taşıma turunun konusu değildir (ayrı kalem).

---

## 11 · TAM TAŞIMA HARİTASI — 300 dosyanın hepsi (KL9)

> Örneklem değil, tam liste. Üretici deterministik: girdisi `KOD_HARITASI_OTOMATIK.md` (300 dosya) + HS sınıflandırması + §4 yerleşim kuralı.

| Dosya | Grup | Hedef |
|---|---|---|
| `backend/prisma/schema.prisma` | C | **KALIYOR** |
| `backend/scripts/derleme-kapisi.js` | I | **KALIYOR** |
| `backend/scripts/surum-yaz.js` | I | **KALIYOR** |
| `backend/src/admin/admin.controller.ts` | G | `backend/src/ozellik/kutuphane/admin/admin.controller.ts` |
| `backend/src/admin/admin.module.ts` | G | `backend/src/ozellik/kutuphane/admin/admin.module.ts` |
| `backend/src/admin/admin.service.ts` | G | `backend/src/ozellik/kutuphane/admin/admin.service.ts` |
| `backend/src/ai/ai.controller.ts` | A | `backend/src/ozellik/giris/ai/ai.controller.ts` |
| `backend/src/ai/ai.module.ts` | A | `backend/src/ozellik/giris/ai/ai.module.ts` |
| `backend/src/ai/ai.service.ts` | A | `backend/src/ozellik/giris/ai/ai.service.ts` |
| `backend/src/app.module.ts` | L | `backend/src/altyapi/cekirdek/app.module.ts` |
| `backend/src/auth/auth.controller.ts` | L | `backend/src/altyapi/auth/auth.controller.ts` |
| `backend/src/auth/auth.module.ts` | L | `backend/src/altyapi/auth/auth.module.ts` |
| `backend/src/auth/auth.service.ts` | L | `backend/src/altyapi/auth/auth.service.ts` |
| `backend/src/auth/capabilities.helper.ts` | L | `backend/src/altyapi/auth/capabilities.helper.ts` |
| `backend/src/auth/decorators/current-user.decorator.ts` | L | `backend/src/altyapi/auth/current-user.decorator.ts` |
| `backend/src/auth/decorators/roles.decorator.ts` | L | `backend/src/altyapi/auth/roles.decorator.ts` |
| `backend/src/auth/dto/login.dto.ts` | L | `backend/src/altyapi/auth/login.dto.ts` |
| `backend/src/auth/dto/register.dto.ts` | L | `backend/src/altyapi/auth/register.dto.ts` |
| `backend/src/auth/guards/jwt-auth.guard.ts` | L | `backend/src/altyapi/auth/jwt-auth.guard.ts` |
| `backend/src/auth/guards/roles.guard.ts` | L | `backend/src/altyapi/auth/roles.guard.ts` |
| `backend/src/auth/guards/tier.guard.ts` | L | `backend/src/altyapi/auth/tier.guard.ts` |
| `backend/src/auth/strategies/jwt.strategy.ts` | L | `backend/src/altyapi/auth/jwt.strategy.ts` |
| `backend/src/bootstrap.controller.ts` | G | `backend/src/ozellik/kutuphane/bootstrap.controller.ts` |
| `backend/src/brands/brands.controller.ts` | G | `backend/src/ozellik/kutuphane/brands/brands.controller.ts` |
| `backend/src/brands/brands.module.ts` | G | `backend/src/ozellik/kutuphane/brands/brands.module.ts` |
| `backend/src/brands/brands.service.ts` | G | `backend/src/ozellik/kutuphane/brands/brands.service.ts` |
| `backend/src/brands/dto/create-brand.dto.ts` | G | `backend/src/ozellik/kutuphane/brands/dto/create-brand.dto.ts` |
| `backend/src/exchange-rates/exchange-rates.controller.ts` | D | `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.controller.ts` |
| `backend/src/exchange-rates/exchange-rates.module.ts` | D | `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.module.ts` |
| `backend/src/exchange-rates/exchange-rates.service.ts` | D | `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.service.ts` |
| `backend/src/health.controller.ts` | I | `backend/scripts/health.controller.ts` |
| `backend/src/labor-firms/labor-firms.controller.ts` | G | `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` |
| `backend/src/labor-firms/labor-firms.module.ts` | G | `backend/src/ozellik/kutuphane/labor-firms/labor-firms.module.ts` |
| `backend/src/labor-firms/labor-firms.service.ts` | G | `backend/src/ozellik/kutuphane/labor-firms/labor-firms.service.ts` |
| `backend/src/labor/labor.controller.ts` | G | `backend/src/ozellik/kutuphane/labor/labor.controller.ts` |
| `backend/src/labor/labor.module.ts` | G | `backend/src/ozellik/kutuphane/labor/labor.module.ts` |
| `backend/src/labor/labor.service.ts` | G | `backend/src/ozellik/kutuphane/labor/labor.service.ts` |
| `backend/src/library/dto/bulk-discount.dto.ts` | G | `backend/src/ozellik/kutuphane/library/dto/bulk-discount.dto.ts` |
| `backend/src/library/dto/bulk-update-items.dto.ts` | G | `backend/src/ozellik/kutuphane/library/dto/bulk-update-items.dto.ts` |
| `backend/src/library/dto/create-library-item.dto.ts` | G | `backend/src/ozellik/kutuphane/library/dto/create-library-item.dto.ts` |
| `backend/src/library/dto/create-manual-brand.dto.ts` | G | `backend/src/ozellik/kutuphane/library/dto/create-manual-brand.dto.ts` |
| `backend/src/library/dto/import-price-list.dto.ts` | G | `backend/src/ozellik/kutuphane/library/dto/import-price-list.dto.ts` |
| `backend/src/library/dto/update-library-item.dto.ts` | G | `backend/src/ozellik/kutuphane/library/dto/update-library-item.dto.ts` |
| `backend/src/library/library-sheet-builder.ts` | G | `backend/src/ozellik/kutuphane/library/library-sheet-builder.ts` |
| `backend/src/library/library.controller.ts` | G | `backend/src/ozellik/kutuphane/library/library.controller.ts` |
| `backend/src/library/library.module.ts` | G | `backend/src/ozellik/kutuphane/library/library.module.ts` |
| `backend/src/library/library.service.ts` | G | `backend/src/ozellik/kutuphane/library/library.service.ts` |
| `backend/src/main.ts` | L | `backend/src/altyapi/cekirdek/main.ts` |
| `backend/src/materials/dto/create-material-price.dto.ts` | G | `backend/src/ozellik/kutuphane/materials/dto/create-material-price.dto.ts` |
| `backend/src/materials/dto/create-material.dto.ts` | G | `backend/src/ozellik/kutuphane/materials/dto/create-material.dto.ts` |
| `backend/src/materials/materials.controller.ts` | G | `backend/src/ozellik/kutuphane/materials/materials.controller.ts` |
| `backend/src/materials/materials.module.ts` | G | `backend/src/ozellik/kutuphane/materials/materials.module.ts` |
| `backend/src/materials/materials.service.ts` | G | `backend/src/ozellik/kutuphane/materials/materials.service.ts` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/dwg-engine.module.ts` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/dwg-engine.service.ts` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/python/converter.py` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/python/deploy-to-cloudrun.sh` | I | `backend/scripts/deploy-to-cloudrun.sh` |
| `backend/src/modules/dwg-engine/python/geometry.py` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/python/graph.py` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/python/main.py` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/python/models.py` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/python/parse_worker.py` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/python/pipe_segments.py` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/python/tests/__init__.py` | H | `backend/test/birim/__init__.py` |
| `backend/src/modules/dwg-engine/python/tests/test_block_to_line_split.py` | H | `backend/test/birim/test_block_to_line_split.py` |
| `backend/src/modules/dwg-engine/python/tests/test_pipe_segments.py` | H | `backend/test/birim/test_pipe_segments.py` |
| `backend/src/modules/dwg-engine/python/tests/test_scale_normalization.py` | H | `backend/test/birim/test_scale_normalization.py` |
| `backend/src/modules/dwg-engine/python/topology.py` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/python/upload_worker.py` | J | **KALIYOR** |
| `backend/src/modules/dwg-engine/scale-param.test.ts` | H | `backend/test/birim/scale-param.test.ts` |
| `backend/src/modules/dwg-engine/scale-param.ts` | J | **KALIYOR** |
| `backend/src/modules/excel-engine/excel-engine.controller.ts` | A | `backend/src/ozellik/giris/excel-engine/excel-engine.controller.ts` |
| `backend/src/modules/excel-engine/excel-engine.module.ts` | A | `backend/src/ozellik/giris/excel-engine/excel-engine.module.ts` |
| `backend/src/modules/excel-engine/excel-engine.service.ts` | A | `backend/src/ozellik/giris/excel-engine/excel-engine.service.ts` |
| `backend/src/modules/excel-grid/excel-grid.controller.ts` | A | `backend/src/ozellik/giris/excel-grid/excel-grid.controller.ts` |
| `backend/src/modules/excel-grid/excel-grid.module.ts` | A | `backend/src/ozellik/giris/excel-grid/excel-grid.module.ts` |
| `backend/src/modules/excel-grid/excel-grid.service.ts` | A | `backend/src/ozellik/giris/excel-grid/excel-grid.service.ts` |
| `backend/src/modules/excel-grid/sheet-discipline.ts` | A | `backend/src/ozellik/giris/excel-grid/sheet-discipline.ts` |
| `backend/src/modules/excel-grid/standart-sema.ts` | A | `backend/src/ozellik/giris/excel-grid/standart-sema.ts` |
| `backend/src/modules/labor-matching/labor-matching.controller.ts` | C | `backend/src/ozellik/eslestirme/labor-matching/labor-matching.controller.ts` |
| `backend/src/modules/labor-matching/labor-matching.module.ts` | C | `backend/src/ozellik/eslestirme/labor-matching/labor-matching.module.ts` |
| `backend/src/modules/labor-matching/labor-matching.service.ts` | C | `backend/src/ozellik/eslestirme/labor-matching/labor-matching.service.ts` |
| `backend/src/modules/matching/ad-cins-sozlugu.ts` | C | `backend/src/ozellik/eslestirme/matching/ad-cins-sozlugu.ts` |
| `backend/src/modules/matching/ad-resolver.ts` | C | `backend/src/ozellik/eslestirme/matching/ad-resolver.ts` |
| `backend/src/modules/matching/conversion.ts` | C | `backend/src/ozellik/eslestirme/matching/conversion.ts` |
| `backend/src/modules/matching/index/line-parser.ts` | C | `backend/src/ozellik/eslestirme/matching/index/line-parser.ts` |
| `backend/src/modules/matching/index/outcome-mapper.ts` | D | `backend/src/ozellik/fiyat/matching/index/outcome-mapper.ts` |
| `backend/src/modules/matching/index/product-index.ts` | C | `backend/src/ozellik/eslestirme/matching/index/product-index.ts` |
| `backend/src/modules/matching/index/query-engine.ts` | C | `backend/src/ozellik/eslestirme/matching/index/query-engine.ts` |
| `backend/src/modules/matching/index/types.ts` | C | `backend/src/ozellik/eslestirme/matching/index/types.ts` |
| `backend/src/modules/matching/index/vocab.ts` | C | `backend/src/ozellik/eslestirme/matching/index/vocab.ts` |
| `backend/src/modules/matching/matching.controller.ts` | C | `backend/src/ozellik/eslestirme/matching/matching.controller.ts` |
| `backend/src/modules/matching/matching.module.ts` | C | `backend/src/ozellik/eslestirme/matching/matching.module.ts` |
| `backend/src/modules/matching/matching.service.ts` | C | `backend/src/ozellik/eslestirme/matching/matching.service.ts` |
| `backend/src/modules/matching/normalizer.ts` | C | `backend/src/ozellik/eslestirme/matching/normalizer.ts` |
| `backend/src/modules/matching/pricing.ts` | D | `backend/src/ozellik/fiyat/matching/pricing.ts` |
| `backend/src/modules/matching/shared-tag-matcher.ts` | C | `backend/src/ozellik/eslestirme/matching/shared-tag-matcher.ts` |
| `backend/src/modules/matching/tag-generator.ts` | C | `backend/src/ozellik/eslestirme/matching/tag-generator.ts` |
| `backend/src/modules/matching/terminology.service.ts` | C | `backend/src/ozellik/eslestirme/matching/terminology.service.ts` |
| `backend/src/modules/matching/types.ts` | C | `backend/src/ozellik/eslestirme/matching/types.ts` |
| `backend/src/prisma/prisma.module.ts` | L | `backend/src/altyapi/db/prisma.module.ts` |
| `backend/src/prisma/prisma.service.ts` | L | `backend/src/altyapi/db/prisma.service.ts` |
| `backend/src/quote-formats/format-engine.ts` | F | `backend/src/ozellik/cikti/quote-formats/format-engine.ts` |
| `backend/src/quote-formats/quote-formats.controller.ts` | F | `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` |
| `backend/src/quote-formats/quote-formats.module.ts` | F | `backend/src/ozellik/cikti/quote-formats/quote-formats.module.ts` |
| `backend/src/quote-formats/quote-formats.service.ts` | F | `backend/src/ozellik/cikti/quote-formats/quote-formats.service.ts` |
| `backend/src/quotes/dto/create-quote.dto.ts` | M | `backend/src/ozellik/teklif/quotes/dto/create-quote.dto.ts` |
| `backend/src/quotes/export-engine.ts` | F | `backend/src/ozellik/cikti/quotes/export-engine.ts` |
| `backend/src/quotes/quotes.controller.ts` | M | `backend/src/ozellik/teklif/quotes/quotes.controller.ts` |
| `backend/src/quotes/quotes.module.ts` | M | `backend/src/ozellik/teklif/quotes/quotes.module.ts` |
| `backend/src/quotes/quotes.service.ts` | M | `backend/src/ozellik/teklif/quotes/quotes.service.ts` |
| `backend/src/quotes/standart-cikti.ts` | E | `backend/src/ozellik/toplam/quotes/standart-cikti.ts` |
| `backend/src/surum.ts` | I | `backend/scripts/surum.ts` |
| `backend/src/utils/build-material-context.ts` | C | `backend/src/ozellik/eslestirme/utils/build-material-context.ts` |
| `backend/src/utils/etiket-display.ts` | C | `backend/src/ozellik/eslestirme/utils/etiket-display.ts` |
| `backend/src/utils/import-fidelity.ts` | G | `backend/src/ozellik/kutuphane/utils/import-fidelity.ts` |
| `backend/src/utils/xlsx-to-pdf.ts` | F | `backend/src/ozellik/cikti/utils/xlsx-to-pdf.ts` |
| `backend/test/admin-import-test.ts` | H | `backend/test/birim/admin-import-test.ts` |
| `backend/test/audit-canli-kosum.ts` | H | `backend/test/birim/audit-canli-kosum.ts` |
| `backend/test/audit-real-excel.ts` | H | `backend/test/birim/audit-real-excel.ts` |
| `backend/test/build-sha-kablolama-test.ts` | H | `backend/test/birim/build-sha-kablolama-test.ts` |
| `backend/test/contract-test.ts` | H | `backend/test/birim/contract-test.ts` |
| `backend/test/conversion-test.ts` | H | `backend/test/birim/conversion-test.ts` |
| `backend/test/excel-grid-test.ts` | H | `backend/test/birim/excel-grid-test.ts` |
| `backend/test/export-format-test.ts` | H | `backend/test/birim/export-format-test.ts` |
| `backend/test/export-live-sim-test.ts` | H | `backend/test/birim/export-live-sim-test.ts` |
| `backend/test/faz0-gs7-probe.ts` | H | `backend/test/birim/faz0-gs7-probe.ts` |
| `backend/test/fixture-anonim.ts` | H | `backend/test/birim/fixture-anonim.ts` |
| `backend/test/fixture-dogrula.ts` | H | `backend/test/birim/fixture-dogrula.ts` |
| `backend/test/gercek-dosya-test.ts` | H | `backend/test/birim/gercek-dosya-test.ts` |
| `backend/test/gs6b-teshis.ts` | H | `backend/test/birim/gs6b-teshis.ts` |
| `backend/test/index-engine-test.ts` | H | `backend/test/birim/index-engine-test.ts` |
| `backend/test/kd11-toplam-yollari-test.ts` | H | `backend/test/birim/kd11-toplam-yollari-test.ts` |
| `backend/test/kd12-baslik-satiri-test.ts` | H | `backend/test/birim/kd12-baslik-satiri-test.ts` |
| `backend/test/kd9-kur-olcutu-test.ts` | H | `backend/test/birim/kd9-kur-olcutu-test.ts` |
| `backend/test/kl-liste-ekleme-test.ts` | H | `backend/test/birim/kl-liste-ekleme-test.ts` |
| `backend/test/labor-matching-test.ts` | H | `backend/test/birim/labor-matching-test.ts` |
| `backend/test/labor-sheet-test.ts` | H | `backend/test/birim/labor-sheet-test.ts` |
| `backend/test/library-transfer-test.ts` | H | `backend/test/birim/library-transfer-test.ts` |
| `backend/test/manifest-kapisi.ts` | H | `backend/test/birim/manifest-kapisi.ts` |
| `backend/test/matching-regression.ts` | H | `backend/test/birim/matching-regression.ts` |
| `backend/test/matching-unit-test.ts` | H | `backend/test/birim/matching-unit-test.ts` |
| `backend/test/onceden-fiyatli-test.ts` | H | `backend/test/birim/onceden-fiyatli-test.ts` |
| `backend/test/pano18-para-birimi-test.ts` | H | `backend/test/birim/pano18-para-birimi-test.ts` |
| `backend/test/perf-profil.ts` | H | `backend/test/birim/perf-profil.ts` |
| `backend/test/pk3-kimlik-haritasi-test.ts` | H | `backend/test/birim/pk3-kimlik-haritasi-test.ts` |
| `backend/test/pk3-repo-kapsama-test.ts` | H | `backend/test/birim/pk3-repo-kapsama-test.ts` |
| `backend/test/pk9-sessiz-indeks-test.ts` | H | `backend/test/birim/pk9-sessiz-indeks-test.ts` |
| `backend/test/product-index-test.ts` | H | `backend/test/birim/product-index-test.ts` |
| `backend/test/regression-all.ts` | H | `backend/test/birim/regression-all.ts` |
| `backend/test/spec-regression-test.ts` | H | `backend/test/birim/spec-regression-test.ts` |
| `backend/test/standart-cikti-test.ts` | H | `backend/test/birim/standart-cikti-test.ts` |
| `backend/test/standart-sema-test.ts` | E | `backend/test/birim/standart-sema-test.ts` |
| `backend/test/tam-zincir.ts` | H | `backend/test/birim/tam-zincir.ts` |
| `frontend/app/(protected)/dashboard/page.tsx` | K | `frontend/ortak/kabuk/app/(protected)/dashboard/page.tsx` |
| `frontend/app/(protected)/dwg-workspace/page.tsx` | J | **KALIYOR** |
| `frontend/app/(protected)/labor-firms/[firmaId]/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/labor-firms/[firmaId]/page.tsx` |
| `frontend/app/(protected)/labor-firms/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/labor-firms/page.tsx` |
| `frontend/app/(protected)/labor/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/labor/page.tsx` |
| `frontend/app/(protected)/layout.tsx` | K | `frontend/ortak/kabuk/app/(protected)/layout.tsx` |
| `frontend/app/(protected)/library/brand/[brandId]/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/library/brand/[brandId]/page.tsx` |
| `frontend/app/(protected)/library/electrical-brands/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/library/electrical-brands/page.tsx` |
| `frontend/app/(protected)/library/equipment/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/library/equipment/page.tsx` |
| `frontend/app/(protected)/library/mechanical-brands/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/library/mechanical-brands/page.tsx` |
| `frontend/app/(protected)/library/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/library/page.tsx` |
| `frontend/app/(protected)/materials/[brandId]/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/materials/[brandId]/page.tsx` |
| `frontend/app/(protected)/materials/electrical/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/materials/electrical/page.tsx` |
| `frontend/app/(protected)/materials/mechanical/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/materials/mechanical/page.tsx` |
| `frontend/app/(protected)/materials/page.tsx` | G | `frontend/ozellik/kutuphane/(protected)/materials/page.tsx` |
| `frontend/app/(protected)/profile/page.tsx` | K | `frontend/ortak/kabuk/app/(protected)/profile/page.tsx` |
| `frontend/app/(protected)/quote-formats/page.tsx` | F | `frontend/ozellik/cikti/(protected)/quote-formats/page.tsx` |
| `frontend/app/(protected)/quotes/[id]/page.tsx` | M | `frontend/ozellik/teklif/(protected)/quotes/[id]/page.tsx` |
| `frontend/app/(protected)/quotes/new/error.tsx` | B | `frontend/ozellik/tablo/(protected)/quotes/new/error.tsx` |
| `frontend/app/(protected)/quotes/new/page.tsx` | B | `frontend/ozellik/tablo/(protected)/quotes/new/page.tsx` |
| `frontend/app/(protected)/quotes/page.tsx` | M | `frontend/ozellik/teklif/(protected)/quotes/page.tsx` |
| `frontend/app/admin/brands/page.tsx` | G | `frontend/ozellik/kutuphane/admin/brands/page.tsx` |
| `frontend/app/admin/layout.tsx` | G | `frontend/ozellik/kutuphane/admin/layout.tsx` |
| `frontend/app/admin/page.tsx` | G | `frontend/ozellik/kutuphane/admin/page.tsx` |
| `frontend/app/admin/stats/page.tsx` | G | `frontend/ozellik/kutuphane/admin/stats/page.tsx` |
| `frontend/app/admin/users/page.tsx` | G | `frontend/ozellik/kutuphane/admin/users/page.tsx` |
| `frontend/app/dev/grid-test/page.tsx` | H | `frontend/test/birim/page.tsx` |
| `frontend/app/layout.tsx` | K | `frontend/ortak/kabuk/app/layout.tsx` |
| `frontend/app/login/page.tsx` | K | `frontend/ortak/kabuk/app/login/page.tsx` |
| `frontend/app/page.tsx` | K | `frontend/ortak/kabuk/app/page.tsx` |
| `frontend/app/register/page.tsx` | K | `frontend/ortak/kabuk/app/register/page.tsx` |
| `frontend/components/admin/AdminSidebar.tsx` | G | `frontend/ozellik/kutuphane/admin/AdminSidebar.tsx` |
| `frontend/components/dashboard/QuickAccess.tsx` | K | `frontend/ortak/kabuk/components/dashboard/QuickAccess.tsx` |
| `frontend/components/dashboard/QuickStart.tsx` | K | `frontend/ortak/kabuk/components/dashboard/QuickStart.tsx` |
| `frontend/components/dashboard/RecentQuotes.tsx` | M | `frontend/ozellik/teklif/dashboard/RecentQuotes.tsx` |
| `frontend/components/dwg-diameter-engine/DiameterLegendPanel.tsx` | J | **KALIYOR** |
| `frontend/components/dwg-diameter-engine/index.ts` | J | **KALIYOR** |
| `frontend/components/dwg-diameter-engine/types.ts` | J | **KALIYOR** |
| `frontend/components/dwg-diameter-engine/useLayerCalc.ts` | J | **KALIYOR** |
| `frontend/components/dwg-diameter-engine/useOriginalColorState.ts` | J | **KALIYOR** |
| `frontend/components/dwg-metraj/constants.ts` | J | **KALIYOR** |
| `frontend/components/dwg-metraj/diameter-colors.ts` | J | **KALIYOR** |
| `frontend/components/dwg-metraj/DiameterEditPopup.tsx` | J | **KALIYOR** |
| `frontend/components/dwg-metraj/DwgUploader.tsx` | J | **KALIYOR** |
| `frontend/components/dwg-metraj/index.ts` | J | **KALIYOR** |
| `frontend/components/dwg-metraj/MetrajEditor.tsx` | J | **KALIYOR** |
| `frontend/components/dwg-metraj/types.ts` | J | **KALIYOR** |
| `frontend/components/dwg-metraj/unit-detection.test.ts` | H | `frontend/test/birim/unit-detection.test.ts` |
| `frontend/components/dwg-metraj/unit-detection.ts` | J | **KALIYOR** |
| `frontend/components/dwg-tagging/BucketPanel.tsx` | J | **KALIYOR** |
| `frontend/components/dwg-tagging/index.ts` | J | **KALIYOR** |
| `frontend/components/dwg-tagging/useTaggingStore.ts` | J | **KALIYOR** |
| `frontend/components/dwg-viewer/aci-colors.ts` | J | **KALIYOR** |
| `frontend/components/dwg-viewer/DxfCanvasViewer.tsx` | J | **KALIYOR** |
| `frontend/components/dwg-viewer/index.ts` | J | **KALIYOR** |
| `frontend/components/dwg-viewer/segment-length.test.ts` | H | `frontend/test/birim/segment-length.test.ts` |
| `frontend/components/dwg-viewer/segment-length.ts` | J | **KALIYOR** |
| `frontend/components/dwg-viewer/types.ts` | J | **KALIYOR** |
| `frontend/components/dwg-viewer/useViewport.ts` | J | **KALIYOR** |
| `frontend/components/dwg-workspace/DwgProjectWorkspace.tsx` | J | **KALIYOR** |
| `frontend/components/dwg-workspace/EquipmentDetailPopup.tsx` | J | **KALIYOR** |
| `frontend/components/dwg-workspace/index.ts` | J | **KALIYOR** |
| `frontend/components/dwg-workspace/LayerInfoSidebar.tsx` | J | **KALIYOR** |
| `frontend/components/dwg-workspace/LayerVisibilityPanel.tsx` | J | **KALIYOR** |
| `frontend/components/dwg-workspace/MetrajSummaryPanel.tsx` | J | **KALIYOR** |
| `frontend/components/dwg-workspace/types.ts` | J | **KALIYOR** |
| `frontend/components/dwg-workspace/useWorkspaceState.ts` | J | **KALIYOR** |
| `frontend/components/excel-grid/aday-ayirt-edicilik.test.ts` | H | `frontend/test/birim/aday-ayirt-edicilik.test.ts` |
| `frontend/components/excel-grid/aday-ayirt-edicilik.ts` | B | `frontend/ozellik/tablo/excel-grid/aday-ayirt-edicilik.ts` |
| `frontend/components/excel-grid/build-material-context.test.ts` | H | `frontend/test/birim/build-material-context.test.ts` |
| `frontend/components/excel-grid/build-material-context.ts` | C | `frontend/ozellik/eslestirme/excel-grid/build-material-context.ts` |
| `frontend/components/excel-grid/CustomDropdown.tsx` | B | `frontend/ozellik/tablo/excel-grid/CustomDropdown.tsx` |
| `frontend/components/excel-grid/discount-utils.test.ts` | H | `frontend/test/birim/discount-utils.test.ts` |
| `frontend/components/excel-grid/discount-utils.ts` | D | `frontend/ozellik/fiyat/excel-grid/discount-utils.ts` |
| `frontend/components/excel-grid/ExcelGrid.tsx` | B | `frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx` |
| `frontend/components/excel-grid/fill-down.test.ts` | H | `frontend/test/birim/fill-down.test.ts` |
| `frontend/components/excel-grid/fill-down.ts` | B | `frontend/ozellik/tablo/excel-grid/fill-down.ts` |
| `frontend/components/excel-grid/SheetTabs.tsx` | B | `frontend/ozellik/tablo/excel-grid/SheetTabs.tsx` |
| `frontend/components/excel-grid/types.ts` | B | `frontend/ozellik/tablo/excel-grid/types.ts` |
| `frontend/components/excel-grid/useFillHandle.tsx` | B | `frontend/ozellik/tablo/excel-grid/useFillHandle.tsx` |
| `frontend/components/layout/Breadcrumb.tsx` | K | `frontend/ortak/kabuk/components/layout/Breadcrumb.tsx` |
| `frontend/components/layout/Sidebar.tsx` | K | `frontend/ortak/kabuk/components/layout/Sidebar.tsx` |
| `frontend/components/library/InlineFirmEntry.tsx` | G | `frontend/ozellik/kutuphane/library/InlineFirmEntry.tsx` |
| `frontend/components/library/ManualBrandModal.tsx` | G | `frontend/ozellik/kutuphane/library/ManualBrandModal.tsx` |
| `frontend/components/quotes/ColumnManagerPanel.tsx` | B | `frontend/ozellik/tablo/quotes/ColumnManagerPanel.tsx` |
| `frontend/components/ui/badge.tsx` | K | `frontend/ortak/ui/badge.tsx` |
| `frontend/components/ui/button.tsx` | K | `frontend/ortak/ui/button.tsx` |
| `frontend/components/ui/card.tsx` | K | `frontend/ortak/ui/card.tsx` |
| `frontend/components/ui/confirm-dialog.tsx` | K | `frontend/ortak/ui/confirm-dialog.tsx` |
| `frontend/components/ui/dialog.tsx` | K | `frontend/ortak/ui/dialog.tsx` |
| `frontend/components/ui/input.tsx` | K | `frontend/ortak/ui/input.tsx` |
| `frontend/components/ui/label.tsx` | K | `frontend/ortak/ui/label.tsx` |
| `frontend/components/ui/select.tsx` | K | `frontend/ortak/ui/select.tsx` |
| `frontend/components/ui/table.tsx` | K | `frontend/ortak/ui/table.tsx` |
| `frontend/components/ui/toast.tsx` | K | `frontend/ortak/ui/toast.tsx` |
| `frontend/components/ui/toaster.tsx` | K | `frontend/ortak/ui/toaster.tsx` |
| `frontend/contexts/CapabilitiesContext.tsx` | K | `frontend/ortak/contexts/CapabilitiesContext.tsx` |
| `frontend/e2e-golden/artefakt-dizini.cjs` | H | `frontend/test/e2e/artefakt-dizini.cjs` |
| `frontend/e2e-golden/bolum-f-kabul.spec.ts` | H | `frontend/test/e2e/bolum-f-kabul.spec.ts` |
| `frontend/e2e-golden/faz0-gs7-teshis.spec.ts` | H | `frontend/test/e2e/faz0-gs7-teshis.spec.ts` |
| `frontend/e2e-golden/firma-a-golden.spec.ts` | H | `frontend/test/e2e/firma-a-golden.spec.ts` |
| `frontend/e2e-golden/global-setup.mjs` | H | `frontend/test/e2e/global-setup.mjs` |
| `frontend/e2e-golden/golden.spec.ts` | H | `frontend/test/e2e/golden.spec.ts` |
| `frontend/e2e-golden/gs-kalicilik.spec.ts` | H | `frontend/test/e2e/gs-kalicilik.spec.ts` |
| `frontend/e2e-golden/helpers.ts` | H | `frontend/test/e2e/helpers.ts` |
| `frontend/e2e-golden/pu4-popup-genislik.spec.ts` | H | `frontend/test/e2e/pu4-popup-genislik.spec.ts` |
| `frontend/e2e-golden/run.mjs` | H | `frontend/test/e2e/run.mjs` |
| `frontend/e2e-golden/sayi-ayristirma.mjs` | H | `frontend/test/e2e/sayi-ayristirma.mjs` |
| `frontend/e2e-golden/surum-kapisi.cjs` | H | `frontend/test/e2e/surum-kapisi.cjs` |
| `frontend/e2e-golden/verify.mjs` | H | `frontend/test/e2e/verify.mjs` |
| `frontend/e2e/grid.spec.ts` | H | `frontend/test/e2e/grid.spec.ts` |
| `frontend/hooks/use-confirm.ts` | K | `frontend/ortak/hooks/use-confirm.ts` |
| `frontend/hooks/use-currency.ts` | D | `frontend/ozellik/fiyat/use-currency.ts` |
| `frontend/hooks/use-toast.ts` | K | `frontend/ortak/hooks/use-toast.ts` |
| `frontend/lib/admin-stats.ts` | G | `frontend/ozellik/kutuphane/admin-stats.ts` |
| `frontend/lib/api.ts` | K | `frontend/ortak/lib/api.ts` |
| `frontend/lib/disiplin.ts` | B | `frontend/ozellik/tablo/disiplin.ts` |
| `frontend/lib/export-download.ts` | F | `frontend/ozellik/cikti/export-download.ts` |
| `frontend/lib/gs6b-golge-kurali.test.ts` | H | `frontend/test/birim/gs6b-golge-kurali.test.ts` |
| `frontend/lib/kaynak-kolon.test.ts` | B | `frontend/test/birim/kaynak-kolon.test.ts` |
| `frontend/lib/kaynak-kolon.ts` | A | `frontend/ozellik/giris/kaynak-kolon.ts` |
| `frontend/lib/merge-multisheet.test.ts` | H | `frontend/test/birim/merge-multisheet.test.ts` |
| `frontend/lib/merge-multisheet.ts` | B | `frontend/ozellik/tablo/merge-multisheet.ts` |
| `frontend/lib/metraj-excel.ts` | J | **KALIYOR** |
| `frontend/lib/parse-material-text.test.ts` | H | `frontend/test/birim/parse-material-text.test.ts` |
| `frontend/lib/parse-material-text.ts` | B | `frontend/ozellik/tablo/parse-material-text.ts` |
| `frontend/lib/popup-secici-sozlesmesi.test.ts` | H | `frontend/test/birim/popup-secici-sozlesmesi.test.ts` |
| `frontend/lib/pricing.test.ts` | H | `frontend/test/birim/pricing.test.ts` |
| `frontend/lib/pricing.ts` | D | `frontend/ozellik/fiyat/pricing.ts` |
| `frontend/lib/sayi-ayristirma.test.ts` | H | `frontend/test/birim/sayi-ayristirma.test.ts` |
| `frontend/lib/utils.ts` | K | `frontend/ortak/lib/utils.ts` |
| `frontend/next.config.js` | I | **KALIYOR** |
| `frontend/playwright.config.ts` | H | **KALIYOR** |
| `frontend/playwright.golden.config.ts` | H | **KALIYOR** |
| `frontend/postcss.config.js` | I | **KALIYOR** |
| `frontend/scripts/surum-yaz.js` | I | **KALIYOR** |
| `frontend/tailwind.config.ts` | I | **KALIYOR** |
| `frontend/types/index.ts` | M | `frontend/ozellik/teklif/types/index.ts` |
| `frontend/types/quotes.ts` | M | `frontend/ozellik/teklif/types/quotes.ts` |
| `frontend/vitest.config.ts` | H | **KALIYOR** |
| `scripts/backup.sh` | I | **KALIYOR** |
| `scripts/deploy.sh` | I | **KALIYOR** |
| `scripts/harita-denetle.mjs` | H | **KALIYOR** |
| `scripts/harita-uret.mjs` | H | **KALIYOR** |
| `scripts/kb5-olcu.sh` | I | **KALIYOR** |

**Sayım:** taşınan **240** + kalan **60** = **300** ✅
