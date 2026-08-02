# RAPOR — KALEM 58 · Kütüphane Bağlantı ÖLÇÜSÜ (KB1-KB9)

**Tarih:** 02.08.2026 · **Görev:** `GOREV_Kutuphane_Baglanti_Olcusu.md` · **Sınır:** bu tur YALNIZ ölçer; canlıya hiçbir şey yazılmadı, backfill kodu yazılmadı, `test:regression:db` 9/10 kırmızısına dokunulmadı.

> Çıkış kodu sözleşmesi: **0 = PASS · 2 = ÖN KOŞUL YOK · diğer = FAIL.**
> Bu rapordaki her sayı bu oturumda ölçüldü.

---

## KB6 · ÜÇ SEÇENEK + EŞİKLİ KARAR KURALI

> **Damga:** Bu bölüm, canlı sayı GELMEDEN yazıldı (görevin şartı). Şeffaflık notu:
> yerel ortamın sayıları (116 bağsız satır / 1 kullanıcı, ÇAYIROVA) önceki oturum
> raporundan zaten biliniyordu; eşikler CANLI sayı bilinmeden, aşağıdaki gerekçelerle
> seçildi ve canlı sayı geldikten sonra DEĞİŞTİRİLMEYECEK.

### Seçenek (a) — Tek seferlik backfill betiği (admin, önizle→uygula)

| | |
|---|---|
| **İş** | ~1 gün: eşleştirme sinyalleri + önizleme raporu + mühür testleri. Marka başına koşulur. |
| **Neyi riske atar** | **YANLIŞ BAĞ** — satır başka ürünün yapısına bağlanırsa kullanıcı ekranda yanlış ad/çap görür ve motor yanlış üründen eşleşir; yanlış bağ, bağsızlıktan KÖTÜdür. Panzehir: önizle→uygula + "emin değilsen NULL bırak ve raporla" kuralı. |
| **Neyi ÇÖZMEZ** | (1) Boşluğun KAYNAĞINI — legacy import dalı (`library.service.ts:351-360`) ve `POST /library` (`library.service.ts:75-87`) bugün de `productIndexId=NULL` doğurmaya devam eder. (2) Hedef indeksi hiç olmayan markaları — bağlanacak `ProductIndex` satırı yoksa backfill'in yapabileceği şey yok; önce liste yeniden yüklenmeli. (3) Gelecekte yeniden birikmesini. |

### Seçenek (b) — Yüklemede otomatik bağlama (admin commit'i sonrası kanca)

| | |
|---|---|
| **İş** | (a)'nın motoru + `commitImportCore` sonrası kanca + kancanın mühür testi (~(a) + yarım gün). |
| **Neyi riske atar** | Admin'in fiyat listesi yüklemesi, KULLANICININ verisini yan etkiyle değiştirir — ne admin ne kullanıcı bunu görür; yanlış bağ otomatikleşir ve önizlemesiz olur; commit süresi uzar. |
| **Neyi ÇÖZMEZ** | Yeniden yükleme YAPILMAYAN markaların mevcut NULL'larını — kanca hiç tetiklenmez. (ÇAYIROVA dün yüklendi; kanca o zaman var olsaydı bile yalnız o markayı yakalardı.) Geçmiş birikimi tek seferde temizlemez. |

### Seçenek (c) — Kullanıcıya "kütüphanemi yeniden indeksle" düğmesi

| | |
|---|---|
| **İş** | En çok: (a)'nın motoru + FE düğme/akış + belirsiz vakalar için kullanıcı arayüzü (~2-3 gün). |
| **Neyi riske atar** | Belirsiz eşleşme kararı kullanıcıya taşınır (kullanıcı `Çelik boru · dişli manşonlu` varyant ayrımını yapamaz); düğmeye basmayan sessiz çoğunluk sorunlu kalır; destek yükü doğar. |
| **Neyi ÇÖZMEZ** | Görevin kendi cümlesindeki problemi: "canlıdaki her motor-öncesi kullanıcıyı vurur" — vurulan kullanıcı düğmenin varlığını bilmez; kapsama ölçülemez. |

### Karar kuralı (eşikler SAYI ile, önden yazıldı)

| Canlı ölçüm | Karar |
|---|---|
| `bagsizsatir = 0` | Hiçbir şey yapılmaz; kalem kapanır. |
| `bagsizkullanici ≤ 5` **VE** `bagsizsatir ≤ 1.000` | **(a)** tek seferlik, önizle→uygula, marka marka. Ayrıca boşluğun kaynağı (legacy import dalı + POST /library) AYRI kalemde kapatılır — kaynak kapanmadan backfill cırcırsız kalır. |
| `6 ≤ bagsizkullanici ≤ 50` **VEYA** `1.001 ≤ bagsizsatir ≤ 20.000` | **(a) + (b)**: önce tek seferlik temizlik, sonra commit kancası (yeni yüklemeler kendi markasını bağlar). |
| `bagsizkullanici ≥ 51` **VEYA** `bagsizsatir ≥ 20.001` | **(a) + (b)**, marka bazlı AŞAMALI koşum (parti parti; her partinin önizleme raporu saklanır). **(c) bu durumda bile önerilmez** — sessiz çoğunluk sorunu büyüklükle kaybolmaz. |
| `kismikullanici ≥ 1` (her durumda) | Kısmi kullanıcılar İLK parti olur: motor "kısmen çalışıyor" göründüğü için hata bildirimi gelmez — en sinsi vaka. |

**Eşik gerekçeleri:** 5 kullanıcı / 1.000 satır = tek oturumda önizleme çıktısının İNSAN GÖZÜYLE denetlenebildiği hacim (ÇAYIROVA önizlemesi 116 satırdı ve okunabilirdi; 10 katı hâlâ okunur). 50 kullanıcı / 20.000 satır = göz denetiminin imkânsızlaştığı ama tek gece koşumunun kaldırdığı üst sınır; üstü parti ister.

**Bilerek ölçüye ALINMAYAN ön koşul:** (a)'nın çalışabilmesi, bağsız satırların markalarında ProductIndex bulunmasına bağlı. Bu beşinci sayı KB5'in dört sayısına eklenmedi (görev DÖRT dedi); tamir turunun İLK sorusudur.

---

## KB7 · Reddedilen yol — yazıya geçti, reddedilmiş kalır

**`materialPrice`'tan geri-inşa REDDEDİLDİ.** Gerekçe (kod kanıtlı): `ProductIndex` kimliği `rowKey = sha1_16(sheetKey | adBucket | cinsNorm | baglantiNorm | capNorm | boyTag | urunKodu)` — kimlik, satırın DOSYADAKİ yapısal demetinden doğar (`backend/src/modules/matching/index/product-index.ts:368-374`; yorum :361-366 "rowKey FİYATTAN bağımsızdır"). `MaterialPrice` bu demetin alanlarını taşımaz (baglanti/boy/urunKodu/sheetName yok — `backend/prisma/schema.prisma:274-306`) ve `Material.name @unique` farklı varyantları tek kayda çökertir (kodda kayıtlı canlı ölçüm: ProductIndex 4571 · MaterialPrice 4068 → 503 ürün MaterialPrice'ta HİÇ yok; `backend/src/library/library.service.ts:296-299` yorumu). Geri-inşada demet alanları boş kalır → çok sayıda satır AYNI rowKey'e çöker; `#N` soneki ekleme sırasına bağlıdır ve `sourceRow=0` legacy veride sıra anlamsızdır → üretilen kimlikler gerçek dosya satırlarıyla örtüşmez: **"ölçümü yalanlar."** Bu tur ek bir çürütme daha ölçtü: köprünün kendisi de ölü — yerelde 116 bağsız satırın `(materialId + sourcePriceListId)` çifti MaterialPrice'ta **0/116** eşleşiyor, çünkü `replaceExisting` yeniden yüklemesi eski MaterialPrice satırlarını silmiş (`backend/src/admin/admin.service.ts:917-918`; geçen oturumun `removed:116` sayacı tam buydu). **Bu paragraf bu dosyada durur:** `docs/RAPOR_KB_Kutuphane_Baglanti_Olcusu.md` §KB7.

---

## KB1 · Şema doğrulaması — tahmin yok

| İddia | Kanıt |
|---|---|
| Tablo adı `"UserLibrary"` (tırnaklı, büyük-küçük duyarlı) | `backend/prisma/schema.prisma:308` → `model UserLibrary {` · `@@map` tüm şemada **0** kez geçiyor (`grep -c "@@map"` = 0) → Prisma tablo adı = model adı, birebir |
| `productIndexId` gerçekten o tabloda, tipi `String?` (nullable text) | `backend/prisma/schema.prisma:349` → `productIndexId String?` (iliş.: :348 `onDelete: Cascade`) |
| `userId` kolonu | `backend/prisma/schema.prisma:311` → `userId String` |
| Payda tablosu `"User"` | `backend/prisma/schema.prisma:37` → `model User {` |
| SQL yazımı | `"UserLibrary"` · `"productIndexId"` · `"userId"` · `"User"` — hepsi çift tırnaklı. Tırnaksız yazım küçük harfe katlanır ve `relation does not exist` verir. Yerel ateşlemede (KB2) tırnaklı yazım **aynen çalıştı** (çıkış 0) — ampirik teyit. |
| Docker servis adları (tahmin değil) | `docker-compose.yml:16` → `db:` (postgres:16) · `docker-compose.yml:113` → `backup:` (postgres:16, psql içerir) · kimlikler compose environment'tan: `:20-22` (db) ve `:119-122` (backup, `PGPASSWORD` dahil) · sunucu dizini `/opt/metaprice` = `scripts/deploy.sh:6` · compose çağrı biçimi `docker compose` (v2, boşluklu) = `scripts/deploy.sh:42,45` |

## KB2 · Komut ÖNCE yerelde ateşlendi

Konsol kısıtı KB3'ün üç karakterinden ibaret değil: `scripts/deploy.sh:9-12` kayıtlı vaka — TR klavyede `$ > | _` de yazılamıyor/bozuluyor (`$VAR→4VAR`, `pg_dump→pg-dump`, iki kez yaşanmış). Env genişletmesi gerektiren her tek-satır `psql` komutu `$` içermek zorunda → konsolda ölür. Bu yüzden komut, projenin **çözülmüş deseniyle** verildi (deploy.sh deseni): özel karakterler repo'daki `scripts/kb5-olcu.sh` içinde durur; konsola yalnız düz satır yazılır.

**Ateşleme 1 — sorgu katmanı, BİREBİR dizge, gerçek yerel DB (metaprice):** Betikteki `docker compose exec -T backup sh -c '…'` satırının içindeki dizge `sed` ile betikten çıkarıldı (elle kopya değil — bayt bayt aynı) ve aynı `sh -c` mekanizmasıyla yerel PostgreSQL 17'ye koşuldu. `-h db` hedefi `PGHOSTADDR=127.0.0.1` ile yerele çevrildi (libpq: hostaddr bağlantıyı, host yalnız kimliği belirler — dizgeye dokunulmadı):

```
PGHOSTADDR=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres POSTGRES_DB=metaprice PGPASSWORD=*** sh -c "$INNER"
→ BEGIN
   bagsizsatir | bagsizkullanici | kismikullanici | toplamkullanici
  -------------+-----------------+----------------+-----------------
           116 |               1 |              1 |               3
  (1 satır)
  ROLLBACK
── ÇIKIŞ KODU: 0 ──
```

**Ateşleme 2 — betiğin ön-koşul yolu (bilerek):** `bash scripts/kb5-olcu.sh` yerelde koşuldu; docker olmadığı için `ON KOSUL YOK — docker bulunamadi` deyip **çıkış 2** verdi (KD8: 2 yalnız bilerek verilir; SKIP yolu ateşlendiği görüldü).

**Yerelde ateşlenemeyen tek katman (dürüst boşluk):** `docker compose exec -T backup` öneki — bu makinede docker yok (Git Bash + PowerShell ikisinde de `command not found`, ölçüldü). Riski karşılayan kanıtlar: (1) `docker compose` aynı sunucuda dün 3 deploy'da fiilen çalıştı (`scripts/deploy.sh:42,45`); (2) `backup` konteyneri **her gün** aynı kimlikle aynı `db` hedefine bağlanıp dump alıyor (`scripts/backup.sh:7` — psql ile aynı libpq kimlik yolu); (3) `-T` bayrağı TTY istemez (web konsolu uyumlu).

## KB3 · Konsol-güvenlik — tarama ile

Kullanıcının konsola yazacağı üç satır (`/tmp/konsol-satirlari.txt` üzerinde `tr -cd | wc -c` taraması):

```
'%' sayisi: 0 · '&' sayisi: 0 · '|' sayisi: 0 · '$' sayisi: 0 · '_' sayisi: 0 · '>' sayisi: 0
satir sayisi: 3 (3 komut, her biri tek satir; zincirleme yok — kabuk seviyesinde ; yok, boru yok)
```

Görev üç karakter istedi (`% & |`); `deploy.sh:9` kanıtına dayanarak üç karakter daha tarandı (`$ _ >`) — altısı da **0**. Betiğin İÇİ özel karakter içerir; bu, desenin kendisidir (dosya konsoldan değil `git pull` ile gider — deploy.sh:12 aynı gerekçe).

## KB4 · Salt-okuma — tarama ile

`scripts/kb5-olcu.sh` üzerinde büyük-küçük duyarsız kelime taraması:

```
UPDATE: 0 · INSERT: 0 · DELETE: 0 · DROP: 0 · ALTER: 0 · TRUNCATE: 0 · CREATE: 0 · GRANT: 0
SELECT gecen satir: 1 (tek sorgu satırı)
```

Sorgu `BEGIN READ ONLY` içine alındı ve `ROLLBACK` ile kapatıldı — konsol-güvenliğini bozmadı çünkü `;` yalnız tırnak İÇİNDE (SQL ayracı olarak) geçiyor, konsola yazılan üç satırda hiç yok (KB3 taraması bunu kapsıyor).

## KB5 · Dört sayı — tek sorgu, tek çıktı (YEREL)

| Sayı | Yerel değer | Hangi ifadeden |
|---|---|---|
| `bagsizsatir` | **116** | `SELECT count(*) FROM "UserLibrary" WHERE "productIndexId" IS NULL` |
| `bagsizkullanici` | **1** | `SELECT count(DISTINCT "userId") FROM "UserLibrary" WHERE "productIndexId" IS NULL` |
| `kismikullanici` | **1** | `GROUP BY "userId" HAVING bool_or(NULL'lu satır var) AND bool_or(dolu satır var)` → sayısı |
| `toplamkullanici` | **3** | `SELECT count(*) FROM "User"` |

Yerel yorum (canlıya genellenmez): tek bağsız kullanıcı ÇAYIROVA sahibi; aynı kullanıcının DUYAR kütüphanesi bağlı olduğundan **kısmi (en sinsi) vaka yerelde fiilen var** — motor bu kullanıcı için "kısmen çalışıyor" görünür.

---

## Kullanıcıya verilecek komutlar (Hetzner web konsolu, sırayla, birer birer)

> Üç satır da KB3 taramasından geçti (altı özel karakterin hiçbiri yok). Önce iş commit'lenip push'lanmalı — betik sunucuya `git pull` ile gider.

**1)** `cd /opt/metaprice`
Beklenen: çıktı yok, istem dizin değiştirir.

**2)** `git pull origin master`
Beklenen: `Updating …` + dosya listesinde `scripts/kb5-olcu.sh` ve bu rapor görünür; `Fast-forward` yazar. ⚠ Bu YALNIZ çalışma ağacını günceller — build/up YOK, konteynerlere dokunmaz, canlı sürüm DEĞİŞMEZ (`/api/health` aynı kalır).

**3)** `bash scripts/kb5-olcu.sh`
Beklenen çıktı biçimi (sayılar canlının kendi değerleri olacak):
```
── KB5 olcum sorgusu (salt-okuma, dort sayi) ──
BEGIN
 bagsizsatir | bagsizkullanici | kismikullanici | toplamkullanici
-------------+-----------------+----------------+-----------------
        SAYI |            SAYI |           SAYI |            SAYI
(1 satır)

ROLLBACK
── olcum bitti (yukarida BEGIN / tablo / ROLLBACK gorunmeli) ──
```
Yanlış çıktıyı doğru sanmamak için: tablo başlığında DÖRT sütun adı birebir böyle olmalı; `BEGIN` ve `ROLLBACK` satırları görünmeli. `ON KOSUL YOK` yazarsa docker bulunamadı demektir (beklenmez); `psql: error` görünürse çıktıyı olduğu gibi bildir.

Dört sayı geldiğinde karar, §KB6'daki **önden yazılmış** eşik tablosundan mekanik okunur.

---

## KB8 · Bu turda okunan kod → haritaya yazıldı (YALNIZ okunan)

Haritaya giren/güncellenen satırlar (hepsi bu turda fiilen okundu; ajan okumaları kritik satırlarda ayrıca nokta-teyit edildi): C grubu — `matching.service.ts:92-101` (◑→✅) · `query-engine.ts` (◑, yol+satırlar eklendi) · `product-index.ts:368-374` (◑→✅) · `schema.prisma:308-355` (yeni ◑) · `types.ts:11-36` (yeni ◑) · C'ye yeni CEVAPLANDI sorusu ("legacy'yi bağlayan yol var mı? YOK"). D grubu — `pricing.ts:28-31` (yeni ◑) · `outcome-mapper.ts:49-54` (yeni ◑). G grubu — `library.service.ts` (⬜→✅) · `library.controller.ts:40-74` (yeni ◑) · `create-library-item.dto.ts` (yeni ✅) · `admin.service.ts` (yeni ◑) · `admin.controller.ts:92-200` (yeni ◑). H grubu — `matching-regression.ts` (yeni ✅) · `pk9-sessiz-indeks-test.ts` (yeni ✅). I grubu — `scripts/kb5-olcu.sh` (yeni ✅, bu turun betiği) · `docker-compose.yml` (yeni ✅). Okunmayan hiçbir dosya için satır yazılmadı; kısmen okunanlar ◑ ve "kalanı okunmadı" şerhiyle girdi. Ayrıca haritanın dolgunluk sayacı bayat çıktı (19/12/17/48 yazıyordu, HEAD'de gerçek 30/12/14 idi) — sayaç `grep -c` ile ölçülüp 38/17/13/68 yapıldı.

## KB9 · Kapanış

```
Haritada değişen satır: C · matching.service.ts:92-101 + product-index.ts:368-374 + query-engine.ts + schema.prisma:308-355 + types.ts:11-36 · eşleştirme zinciri dosya:satır'a bağlandı; "legacy'yi bağlayan yol YOK" CEVAPLANDI
Haritada değişen satır: D · pricing.ts:28-31 + outcome-mapper.ts:49-54 · net fiyat formülünün iki yarısı
Haritada değişen satır: G · library.service.ts (⬜→✅) + library.controller.ts + create-library-item.dto.ts + admin.service.ts + admin.controller.ts · kütüphane yazım yüzeyinin tamamı
Haritada değişen satır: H · matching-regression.ts + pk9-sessiz-indeks-test.ts · bilinçli kırmızının ve PK9 sözleşmesinin harita kaydı
Haritada değişen satır: I · scripts/kb5-olcu.sh (yeni) + docker-compose.yml · ölçüm betiği ve yığın tanımı
Bekleyenler listesi: 283 -> 269 (cırcır: yalnız kısaldı; 14 dosya haritaya taşındı)
```
