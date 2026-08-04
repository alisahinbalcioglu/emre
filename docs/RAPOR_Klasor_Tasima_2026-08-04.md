# RAPOR — KLASÖR TAŞIMA (uygulama turu)

**Tarih:** 04.08.2026 · **Durum:** altı durak TAMAM, canlıda doğrulandı
**Geri dönüş noktası:** `f6f6ee2` · **`origin/master`:** `aa453e0` · **Canlı:** `aa453e022b75` (sunucunun kendi cevabı)
**CI:** yeşil · **Ağaç:** temiz

---

## 1 · SONUÇ — bir bakışta

| | |
|---|---|
| Taşınan dosya | **155** |
| Yerinde kalan | **157** |
| Commit | **8** (her durak kendi commit'inde) |
| Ara kırmızı | **3** (hepsi kök nedeni bulunup kapatıldı, hiçbiri gizlenmedi) |
| Ürün davranışı değişikliği | **0** |

**Kanıt zinciri:** her durakta beş kapı — `tsc` (iki taraf) · `test:harita` · `test:regression` (PG'li) · **derleme (TM18)** · `vitest`. Hiçbir noktada kırmızı ağaç bırakılmadı; her commit tek başına derlenebilir ve testi geçer.

**Canlı doğrulama:** `build_sha = aa453e022b75` · `tree_dirty = false` · `/login` **200** · `/quotes` **200**.
Rotaların cevap vermesi bu turun **en kritik kanıtı** — nedeni §3.1'de.

---

## 2 · DURAKLAR

| # | Grup | Dosya | Commit |
|---|---|---|---|
| 1 | K · ortak UI/kabuk | 20 | `8516350` |
| 2a | prisma → `altyapi/db/` | 2 | `a33dbc0` |
| 2b | auth → `altyapi/auth/` | 13 | `d3965b6` |
| 3 | M · teklif | 9 | `da09190` |
| 4 | G · kütüphane/yönetim | 33 | `603b824` |
| 5a | çekirdek akış — backend | 43 | `451f8b6` |
| 5b | çekirdek akış — frontend | 23 | `fcec83f` |
| 6 | e2e altyapısı | 15 | `aa453e0` |

Sıra rastgele değil: **yapraklar önce** (kimseyi import etmeyenler), **canlı hataların çıktığı çekirdek en son**. Donmuş bloğa dokunan tek adım (2b) bilerek prisma'dan **sonraya** kondu — ters gitseydi geri alınacak commit en üstte olurdu.

---

## 3 · ★ TURUN ASIL BULGUSU — plan tablosu ~10 kez yanlıştı

Plan 965 satırdı ve taşıma tablosu **kendi düz metniyle** ya da gerçekle tekrar tekrar çelişti. Hiçbiri okumakla bulunmadı; **hepsi ölçümle**.

### 3.1 · Uygulansaydı ürün çökerdi (üç kalem)

| Kalem | Ne olurdu |
|---|---|
| **`frontend/app/` altındaki 30 dosya** taşınıyordu | Next.js rotaları klasör yolundan türer → **uygulamanın hiçbir rotası kalmazdı** (`layout`, `login`, `dashboard` dahil). Planın kendi satırı zaten *"taşınamaz"* diyordu; tablo tersini yapıyordu |
| **`main.ts` · `health.controller.ts` · `surum.ts`** `src` dışına | `rootDir` ihlali (TS6059) → **backend hiç derlenmez**. `main.ts` için ayrıca `dist/main.js` üretilmez; Dockerfile `CMD`, `start:prod` ve `derleme-kapisi.js` zinciri kopardı |
| **`standart-cikti.ts` → `ozellik/toplam/`** | Hedef ağaçta **böyle bir dizin yok** |

Deploy sonrası `/login` ve `/quotes`'un 200 dönmesi, birinci kalemin gerçekten önlendiğinin kanıtıdır. Sunucudaki `derleme-kapisi` çıktısı (`dist/*.js = 103 · dist/main.js = VAR`) ikincisinin.

### 3.2 · Sessizce yanlış olurdu (üç kalem)

- **Tailwind `content` glob'ları** — 15 dosya `./ortak/` altına çıkınca sınıfları taranmaz, üretim CSS'inden silinir: buton/dialog/toast/sidebar **stilsiz** render olur. Ve **hiçbir kapı kırmızı yanmaz** — `build`, `tsc`, `vitest`, CI hepsi yeşil kalır. Glob'a `./ortak/**` + `./ozellik/**` eklendi.
- **Donmuş blok sınırı yol düzeyinde delinmişti** — tablo "grup etiketi J olan 45 dosyanın 45'i de kalıyor" diyordu, ama §5'in çizdiği sınırın *içinde* olup H/I etiketiyle taşınan 8 dosya vardı. Ölçüm "yalancı yeşil" veriyordu.
- **`quotes/` ve `excel-grid/` bölünüyordu** — her ikisinde de kardeş import'lar (`./export-engine`, `./fill-down` …) önce çirkin çapraz-ağaç yoluna döner, sonraki durakta **bir daha** yazılırdı. Ölçüm bölmenin kazancının sıfır olduğunu gösterdi: `export-engine`/`standart-cikti`'nın `quotes/` dışından **hiç çağıranı yok**.

### 3.3 · Sayılar tutmuyordu

Plan **240 + 60 = 300** diyordu. Repo **307**'ydi (plan yazıldıktan sonra 7 dosya eklenmiş). `60 = 44 + 16` eşitliği plan metninde **hiç yoktu**; gerçek dağılım `60 = 45 + 15`. J grubu üç ayrı yerde **44 / 45 / 46** olarak yazılıydı.

**Kural kalıcılaştı:** *taşıma tablosu tek başına yetkili değildir; her grup taşınmadan önce çerçeve kısıtlarına karşı ayrıca denetlenir.*

---

## 4 · ★ `tsc`'NİN GÖREMEDİĞİ ÜÇ SINIF

Taşımanın gerçek riski tip hatalarında değil, tip denetiminin **kapsamı dışında** kaldı.

| Sınıf | Neden görünmez | Nerede çıktı |
|---|---|---|
| **Dinamik `require()`** | Gövde içinde, tip denetiminden geçmez | 7 çağrı — `admin.service`, `labor-firms.service` |
| **`backend/test/**`** | `backend/tsconfig.json` `test` dizinini **exclude** ediyor | ~15 dosya, `../src/...` referansları |
| ★ **`readFileSync` argümanı** | Ne import ne tip — **hiçbir araç** yakalamaz | 5 dosya: `kd11`, `kd9`, `popup-secici`, `sayi-ayristirma`, `artefakt-dizini` |

Üçüncüsü en sinsisi: `artefakt-dizini.cjs` repo kökünü **`e2e-golden` klasörünün varlığına bakarak** tespit ediyordu — taşıma onu sessizce bozardı.

**Sonuç:** `tsc` yeşili taşıma turunda **kanıt değildir**. Tek gerçek kapı `test:regression` koşumudur.

---

## 5 · ARA KIRMIZILAR — üçü de gizlenmedi (TM11)

| Kırmızı | Kök neden | Çözüm |
|---|---|---|
| `test:gs` | Plan `standart-sema-test.ts`'i **H değil E grubuna** koymuş; üreticim A-F'yi topluca aldığı için *"testler taşınmıyor"* kararını deldi | `git mv` ile geri alındı + betiğin yazdığı iki import düzeltildi |
| `test:kd9` · `test:kd11` | **Paketler arası** `require('../../frontend/lib/pricing')` — betik tek kök içinde çalışır, göremez | Elle düzeltildi |
| vitest ×2 | `readFileSync('../e2e-golden/...')` | Elle düzeltildi |

**Ders:** *"H grubu taşınmıyor"* kararı **grup etiketine göre uygulanamaz** — plan test dosyalarını A-M arasına dağıtmış. Ölçüt **yol** olmalı.

---

## 6 · UYGULANAN SAPMALAR (hepsi commit mesajlarında gerekçeli)

Görev şunu şart koşuyordu: *"plandan sapılacaksa sapma ayrıca bildirilir, sessizce uygulanmaz."*

1. `frontend/app/**` taşınmadı — çerçeve zorunluluğu
2. `main.ts` · `app.module.ts` · `health.controller.ts` · `surum.ts` · `bootstrap.controller.ts` `src` kökünde kaldı
3. Donmuş blok sınırı **yol düzeyinde** — tek satır değişti: `dwg-engine.controller.ts:7`
4. **H grubu taşınmadı** — `backend/test/`'in 39 dosyası yerinde; yalnız 15 FE e2e taşındı
5. `quotes/` ve `excel-grid/` **tek parça**
6. `frontend/types/` → `ortak/types/` (paylaşımlı, teklife özgü değil)
7. `bootstrap.controller.ts` kaldı (içeriği kütüphane değil güvenlik)
8. İki e2e paketi **ayrı** tutuldu — birleştirilse `test:e2e` golden'ları da koşardı

---

## 7 · ADIM 3 · SAYIM (TM10)

| | Plan | Revize hedef | **Ölçülen** |
|---|---|---|---|
| Taşınan | 240 | 206 | **155** |
| Kalan | 60 | 101 | **157** |

**Sapma açıklandı:** revize hedef 206, planın tablosundan türetilmişti (202+4) ve **H grubu kararını sayıya yansıtmamıştı**. O karar ~45 dosyayı, `bootstrap.controller` 1 dosyayı çıkarır. 155 rakamı verilen kararlarla tutarlı — *planın tutmaması planın yanlış olduğunu değil, birinin ölçülmediğini gösterir.*

---

## 8 · KALAN İŞLER

### 🔵 Sıradaki
- **ADIM 5** — kullanıcının iki canlı kontrolü: oturum (kalem 63) · **yeni** teklifte toplam (kalem 64). ⚠ Eski teklifle test edilmez (kalem 71).
- **ADIM 6** — klasör↔grup disiplin kapısı. Bugün `test:harita` dosyanın *doğru klasörde* olduğuna **bakmıyor**; kapısız düzen bir turluktur. Önce rakamla ölçülecek.

### ⚪ Yokluk kaydı
- **TM19 — HTML harita çıktısı YOK.** `harita-uret.mjs` yalnız `KOD_HARITASI_OTOMATIK.md` üretiyor (757 satır, iç bağlantı sıfır — gezilecek değil, içinde aranacak belge). HTML eklemek ~100 satırlık tek çıktı fonksiyonu. Görev dosyası `harita_uret.py` diyor; repoda öyle bir dosya **hiç var olmamış**.

### 🔴 Açık kalanlar
- **Kalem 59 onarımı** — 116 öksüz kütüphane satırı, **59'unda kullanıcının iskontosu var**. Önleme yapıldı (`5512fb7`: yeniden yükleme artık öksüz bıraktığı satırları raporluyor), onarım **kullanıcı kararı**.
- `test:regression:db` 1/10 — legacy yerel veri, tur başından beri aynı, ürün boşluğu değil.
- **Ölü `main` dalı** — `origin/master`'ın 386 commit gerisinde, master'da olmayan 0 commit'i var; ana checkout hâlâ orada. Yedi worktree Nisan 2026'da donmuş. Taşımadan sonra o klasöre bakan **taşıma öncesi düzeni** görür.

---

## 9 · BU TURUN İKİ DERSİ

**(1) Ölçütü önce doğrula.** Bu turda **altı kez** kendi ölçütüm bozuk çıktı — regex uzantı sıralaması (`.tsx`→`.ts` kırpması), kabuğa gömülü tırnak kaçışları, tek CSS dosyasına bakma, boş dizide `.every()` yalancı yeşili. İkisi raporlanmak üzereydi (*"fiyatların %30'u yanlış"*, *"taşınan dosyaların hiçbir sınıfı CSS'te yok"*) ve eyleme geçilseydi sağlam kodu kurcalayacaktık. **Tuhaf sonuç = önce ölçütü sına, veriyi değil.**

**(2) "Build yeşil" sessiz kırılmayı kapatmaz.** Tailwind kontrolünde 4-5 sınıfa bakmak örneklemdi. Taşınan dosyalardaki **322 sınıfın tamamı** üretilen CSS'e karşı denetlendi; gerçekten eksik dört sınıf çıktı ve dördü de `tailwind.config.ts`'te **hiç tanımlı olmayan** `card`/`popover` renkleriydi — taşımadan önce de öyleydiler. **Stil regresyonu sıfır**, ve bu varsayımla değil ölçümle söyleniyor.
