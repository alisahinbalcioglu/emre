# RAPOR — 02.08.2026 Oturumu

**GOREV_Kapanis_Devam_4 KAPANDI (ADIM 0-8) · KOD HARİTASI FAZ 1 · 2 canlı bulgu kökten düzeltildi**

> Çıkış kodu sözleşmesi: **0 = PASS · 2 = ÖN KOŞUL YOK · diğer = FAIL.**
> Bu rapordaki her sayı bu oturumda ölçüldü; belge üzerinden aktarılan sayı yok.

---

## 1 · Özet tablo

| İş | Sonuç | Commit | Kanıt |
|---|---|---|---|
| **ADIM 6 · PK3** — 19 fixture anonimleştirilip repoya | ✅ | `5d3c30b` | `fixture:dogrula` PARSE FARKI 0 · `git archive` CI taklidi: fixture varken KD11/KD12 çıkış 0, silinince çıkış 2 |
| **KD12(c)** — serbest metinden sayı türetme | ✅ kapandı | `d79024b` | 19 dosya / 10.015 satır önce-sonra; tek veri değişikliği `"TEKLİF NO : T25-0121"` → artık para üretmiyor |
| **ADIM 7 · KD9** — KG13 kur ölçütü dairesel | ✅ | `2a5e45e` | gerçek kur ∈ (47,4271, 47,4308], testin tahmini 47,4321 **dışarıda** · `test:kd9` 11 assert |
| **KOD HARİTASI FAZ 1** — HR1-HR4, HR8 | ✅ | `b46991d`+`7a98377`+`1d76279` | ayrı rapor: `docs/RAPOR_HR_Kod_Haritasi.md` (863 satır) |
| **Canlı bulgu 1** — seçici etiketi | ✅ | `d14856f`+`2deedaa` | kutuda yalnız `MALZEME ADI`; eski davranışla 4 assert kırmızı |
| **Canlı bulgu 2 · ADIM 1a** — merge bandı başlık sanılıyor | ✅ | `81f2521` | 83 sayfa kıyas: 3 değişim (3'ü kazanım), 80 birebir · KD12 (e)(f)(f2) |
| **ADIM 8 · KD10** — PostgreSQL teşhisi | ✅ | — (yerel) | kök: `0xC0000142` + bayat pid + **logsuz başlatma**; sonda 20/20 seri + 10/10 paralel, 0 istisna |
| **ÇAYIROVA tamiri** — onaylı yoldan yeniden yükleme | ✅ | — (yerel DB) | ProductIndex 0→**359**, belirsiz 0 · KL + İşçilik-sheet **ilk kez** canlı PASS |
| **PK13** — GS8b × 5 koşum | ✅ | `48b0624` | **5/5 yeşil** (3 passed × 5, ~58sn/koşum), PG yük altında 0 istisna |

Toplam: **10 commit · 6 CI koşumu (5 yeşil, 1 kırmızı — aşağıda) · 3 deploy.**

---

## 2 · Sürüm zinciri

| An | origin/master | Canlı build_sha | Not |
|---|---|---|---|
| Oturum başı | `d83ebbf` (main worktree) / iş `99cb023` | `0f0a9ac` | makas açıktı |
| Deploy 1 (16:36) | `1d76279` | `1d7627981adc` | ADIM 6+7+HR — iki taraf bağımsız teyit |
| Deploy 2 (17:26) | `2deedaa` | `2deedaa75cf8` | seçici etiketi düzeltmesi |
| Deploy 3 (18:21) | `81f2521` | `81f2521143d3` | ADIM 1a — **kullanıcı canlıda doğruladı: "tamam düzeldi"** |
| Oturum sonu | **`48b0624`** | `81f2521143d3` | son commit yalnız test altyapısı, deploy gerektirmez |

CI: run #40 ✅ · #41 ✅ · **#42 ❌** · #43 ✅ · #44 ✅ · #45 ✅.

**#42 neden kırmızıydı:** `test:regression`'ı `git add`'den ÖNCE koştum; iki yeni dosya henüz izlenmediği için harita kapısı onları göremedi, yerel yeşil dedi, CI haklı olarak `HİÇBİR LİSTEDE YOK: 2 dosya` ile kırdı. Aynı tuzak aynı gün iki kez vurdu (HR4 ilk ateşlemesi kapının **kendi betiklerini** yakalamıştı). Ders kalıcılaştı: `git ls-files` tabanlı kapılar **stage'ten sonra** koşulur; kapıya izlenmeyen-dosya uyarısı eklendi (çıkış sözleşmesi değişmeden).

---

## 3 · ADIM 6 — fixture anonimleştirme: 6 gerçek kusur

Yazma moduna geçmeden yapılan taramalar haritayı 6 kusurla yakaladı; hepsi ölçümle:

1. Çıplak `Aksa` anahtarı ürün metnini bozuyordu (`"Gong ve Aksamı"` → `"…FIRMA-Fmı"`). Çözüm Unicode sözcük sınırı — `\b` **kullanılamaz**, `\w` ASCII olduğundan sınır `HABAŞ`+`İ` arasına düşer.
2. Takma addaki rakam (`SAHA-3`) başlık metnine sayı soktu → `miktarNormalize` `-3` çekti → satır tipi değişti. Takma adlar rakamsız yapıldı.
3. Adres zengin-metin run'larına bölünmüş — bileşik anahtar ham XML'de hiç eşleşmiyordu.
4. **`docProps` hiç taranmıyordu** — 19 dosyanın hepsinde gerçek kişi adı (`dc:creator`/`cp:lastModifiedBy`, toplam 11 kişi), birinde `Company="HABAS A.S."`.
5. Yeniden adlandırma içerik değişimine bağlıydı — kimliği yalnız adında taşıyan 3 dosya kaçıyordu.
6. `git ls-files` Türkçe yolları kaçış dizisiyle basar — kapının kendisi 7 dosyayı "izlenmiyor" sanıyordu (`-z` + NFC).

Kalıcı kapılar: `test:pk3` (15 assert; sınır kuralı kapatılınca 3'ü kırmızıya döndü — ölçüldü) · `test:pk3-repo` · `fixture:dogrula` (D1 ZIP / D2 ayrıştırma / D3 tanı kararı).

Oturum içinde iki kişi-adı sızıntısı daha kapandı: `BEARO HAVACİLİK` (sektör-kelimesi taramasıyla) ve `HASAN SEVİNDİK` (KARTEPE künyesi, commit'liydi — ADIM 1a sırasında). `Yıldız Entegre` run bölünmesi üçüncü kez aynı dersi verdi; hem kalıntı taraması hem `fixture:dogrula` **bağımsız** yakaladı. Son durum: **20 fixture, `fixture:dogrula` 60/60, kalıntı 0.**

---

## 4 · ADIM 7 — KG13 kur ölçütü: ürün değil, ölçüt

31.07 koşumunda KG13 kırmızıydı (3 sapan, üçü "işçilik"). Ölçüm:

- Gözlenen üç gösterim **tek** kurla açıklanıyor: gerçek kur ∈ **(47,4271, 47,4308]**. Testin ekrandan geri-çıkardığı `kurAmpirik` = 47,4321 → **aralığın dışında**. Yani hata üründe değil, tahmincide.
- Tolerans (2,43 TL) %97,5'iyle USD kuantizasyonuna gidiyor; kur hatasının `tl·δ/kur` katkısı **TL ile orantılı** ve bütçesiz. δ=0,003'te: kesin geçer ≤ ₺949 · **şans bandı ₺949–₺75.937** · kesin kalır ≥ ₺75.937. "Üçü de işçilik" bir tip farkı değil, **büyüklük** yan ürünü.
- Kodda işçiliğe özel çevrim yok: 6 fiyat alanı tek `valueFormatter` (`ExcelGrid.tsx:2172-2195`), tek `conversionRate` (`use-currency.ts:71-78`); `Math.ceil` para yoluna girmiyor.

Düzeltme: `paraBicim()` tek kaynak; E2E kuru **sayfanın kendi `/exchange-rates` yanıtından** alıp tam eşitlik arıyor; kur etiketi ayrı assert; `test:kd9` çevrimdışı kapı (11 assert). İki iddiam ölçümle çürütülüp daraltıldı — rapor dürüstlüğü gereği commit mesajında da yazılı.

---

## 5 · Canlı bulgular (kullanıcı buldu, kökten düzeltildi)

### 5a · Seçici etiketi (`d14856f`)
Kutu "malzeme isimleri hangi sütunda" sorusunu cevaplar; `MALZEME ADI — ör: 2000 GPM…` gürültüydü. Kural: gerçek başlık varsa yalnız başlık; başlık yoksa (`headerName === field`) örnek **kalır** — bu projede başlıksız dosya istisna değil kural (`demontaj-sefa`, `yangin`). Regresyon değildi: deploy-öncesi kodla aynı çıktı üretildi. 5 assert; eski davranışla 4'ü kırmızı.

### 5b · ADIM 1a — merge bandı başlık sanılıyor (`81f2521`)
AKHİSAR İCMAL'de kutu `İCMAL SAYFASI- İŞÇİLİK` gösteriyordu; gerçek başlık `Bölge No | KAPSAM` bir alt satırda. Kök: merge yayılımı tek hücreyi N kolona kopyalar, skor **hücre** sayıyordu → 3 kopyalı ünvan bandı tek 'işçilik' kelimesiyle 3 puan alıp kazanıyordu.

Üç yapısal kural (`excel-grid.service.ts:895-1005`): ayrık-metin sayımı + band eleme · başlığın **altında sayısal veri** şartı · kelimesiz-başlık geri-düşüşü (üç sigortalı). Kalibrasyon 83 sayfalık önce/sonra kıyasla — **ilk üç deneme regresyon üretti ve ölçüm yakaladı** (Aksa İngilizce başlık · BEYKOZ FIRE×5 bandı · Bursa'nın *meşru* 3-kolonluk `İmalatlar` merge'ü), üçü sigortaya dönüştü.

Sonuç: 3 değişim / 80 birebir — AKHİSAR → **KAPSAM** · Bursa İCMAL **ölü sayfaydı, dirildi** (0→6 satır) · Bursa Elektrik gerçek başlıklar. Kırmızı-önce `git stash` ile ölçüldü; KD12 (e)(f)(f2) mühürledi. AKHİSAR anonimleştirilip 20. fixture oldu. **Kullanıcı canlıda doğruladı.**

---

## 6 · ADIM 8 — PostgreSQL teşhisi ve PK13

**Teşhis:** bayat `postmaster.pid` (PID ölü, damga 31.07 — kirli kapanış) · çökme imzası `0xC0000142` (13.04+26.04 kayıtlı) · **31.07 çökmelerinin logu hiç yok** — `-l`siz başlatılmış, kanıt birikmiyordu. Reçete artık: `pg_ctl -D "C:\Program Files\PostgreSQL\17\data" -l "...\kd10-teshis.log" -w start`.

**Kararlılık:** 20/20 seri + 10/10 paralel bağlantı, ardından tüm E2E + DB regresyon + 359 kalemlik import yükü boyunca **0 istisna**. (İlk paralel sondam hatalıydı — `grep "1"` hata metnindeki "5432"yi sayıyordu; düzeltilip yeniden ölçüldü.)

**ÇAYIROVA:** `Cayirova_Boru_Yapilandirilmis.xlsx` admin API preview→commit ile yüklendi: 359 kalem, ProductIndex 0→359, belirsiz 0. `PG_REGRESSION=1` ile paket **29 PASS · 0 FAIL** — KL ve İşçilik-sheet ilk kez canlı geçti.

**⛔ Açık ürün boşluğu (yeşile boyanmadı):** `test:regression:db` 9/10 — havuz yalnız `UserLibrary`'den kurulur ve ÇAYIROVA'nın 116 satırının hepsi `productIndexId=NULL` (31.03 yüklemesi; motor 15.07'de geldi). Motor 359'luk taze indeksi **hiç görmüyor**; kendi `⛔ MARKA INDEKSLENMEMIS` uyarısı doğru atıyor. Eski kütüphaneyi indekse bağlayan **hiçbir kod yolu yok** — canlıdaki her motor-öncesi kullanıcıyı vurur. Backfill tasarım kararı olarak panoda chip: `task_7dc2a949`. (`materialPrice`'tan geri-inşa reddedildi: sourceRow=0 → dejenere rowKey, ölçümü yalanlar.)

**PK13:** gs-kalicilik **5/5 koşum yeşil** (3 passed × 5, ~58sn). Yolda iki altyapı bulgusu: sandbox arka plan görevleri localhost'a çıkamıyor (E2E hep ön planda) ve sürüm kapısının `AbortSignal.timeout`'lu fetch'leri undici havuzunda yarı-ölü soket bırakıp sonraki fetch'e `ECONNRESET` yediriyordu — deterministik üretildi, 3-denemeli sigorta eklendi (`48b0624`), ilk koşumda öngörüldüğü gibi ateşledi.

---

## 7 · Açık kalanlar

| # | Konu | Durum |
|---|---|---|
| 1 | **Legacy UserLibrary → ProductIndex backfill** | Chip açık (`task_7dc2a949`) — tasarım kararı |
| 2 | `test:regression:db` 9/10 | Bilinçli kırmızı; #1'e bağlı |
| 3 | AKHİSAR'ı golden CASES'e ekleme (11. dosya) | Kullanıcı kararı |
| 4 | Git geçmişindeki kimlik (motor-öncesi commit'ler) | Kullanıcı kararı: şimdilik bırakıldı (01.08) |
| 5 | `"TL 1.234,50"` gibi harfle başlayan para biçimi | KD12(c) sonrası `null` döner; 20 fixture'da örneği yok |
| 6 | Golden E2E tam koşum (11 dosya) | Bu oturumda yalnız gs-kalicilik koşuldu; yığın reçetesi hazır |

---

## 8 · Kapanış

```
Haritada değişen satır: A · excel-grid.service.ts:895-1005 · başlık satırı kararı üç yapısal kuralla (ADIM 1a)
Haritada değişen satır: A · grup A'nın 2 cevapsız sorusu cevaplandı (başlık kararı 3 yerde · sayfa-adı iki ayrı vaka)
Haritada değişen satır: B · frontend/lib/kaynak-kolon.ts · seçici etiketi tek kaynak (yeni)
Haritada değişen satır: H · test:kd9 · kur ölçütü sözleşmesi (yeni)
Bekleyenler listesi: 283 -> 283 (uzamadı — cırcır yeşil)
origin/master = 48b0624   canlı build_sha = 81f2521143d3
```
