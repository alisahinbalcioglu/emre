# VERİTABANI GERİ YÜKLEME

**Son güncelleme:** 04.08.2026 · **İlgili betikler:** `scripts/geri-yukle.sh`, `scripts/backup.sh`, `scripts/deploy.sh`

Bu belge, MetaPrice veritabanının bir yedekten nasıl geri yükleneceğini anlatır.

> ## ⚠ ÖNCE BİR KEZ PROVA EDİN
>
> Bu prosedürü **ilk kez felaket anında öğrenmeyin.** Sakin bir günde § 3'ü
> baştan sona okuyun ve § 2 Adım 1'i (`liste`) bir kez çalıştırın — o adım
> hiçbir şeyi değiştirmez, sadece elinizde ne olduğunu gösterir.
>
> Denenmemiş bir geri yükleme prosedürü, prosedür değil, **umuttur**.
> § 3, bugüne kadar neyin denendiğini ve **neyin denenmediğini** yazar.

---

## 0. Bir bakışta

| Soru | Cevap |
|---|---|
| Yedekler nerede? | Sunucuda `/opt/metaprice/backups/` |
| Biçim | Düz SQL dump, gzip'li — `pg_dump` + `gzip` |
| Günlük yedek | `metaprice-YYYYAAGG-SSDDSS.sql.gz` — `backup` servisi 24 saatte bir alır, **14 gün** saklar |
| Deploy yedeği | `deploy-oncesi-<sürüm>-<damga>.sql.gz` — her `deploy.sh` başında alınır, **30 gün** saklanır |
| Can simidi | `geri-yukleme-oncesi-<damga>.sql.gz` — her geri yüklemeden hemen önce alınır, **30 gün** saklanır |
| Bekçi yedeği | `bekci-<damga>.sql.gz` — günlük yedek bayatlarsa nöbetçi kendi alır, **30 gün** saklanır |
| Geri yükleme | `bash scripts/geri-yukle.sh DOSYA-ADI` |
| Sunucu dışında kopya var mı? | **Otomatik olarak HAYIR.** Elle alınan `age` ile şifreli kopyalar için bkz. § 1b ve § "Bilinen boşluklar" |

---

## 1. Neden komutlar betikte, belgede değil

Geri yükleme komutunun kalbi şudur:

```
gzip -dc yedek.sql.gz | psql -U metaprice -d metaprice
```

Hetzner web konsolu TR klavyede `|` karakterini **yazamıyor** (aynı şekilde
`"` `(` `)` `?` `_` `$` `>` `%` `~` `` ` `` ). Yani prosedürün en kritik komutu
konsola elle yazılamaz. Bu yüzden bütün özel karakterler `scripts/geri-yukle.sh`
içinde durur; konsola yazdığınız satırlarda **hiçbir yasak karakter yoktur.**

Bu belgedeki **her komut** bu kısıta göre seçilmiştir. Kopyalamadan, olduğu gibi
yazabilirsiniz.

---

## 1b. Dış kopya ŞİFRELİDİR — önce çözün (0.9b, 07.09.2026)

Sunucu dışındaki kopyalar (`C:\Users\basar\MetaPriceYedek\<tarih>\`, ileride Storage Box) `age` ile şifrelidir ve
**yalnızca kişisel SSH anahtarınızla** (`~/.ssh/basar_metaprice`, parola korumalı) açılır.
Sunucuda bu anahtarın yalnız AÇIK yarısı vardır (`/etc/metaprice/yedek-alici.pub`); sunucu
kendi dış kopyasını AÇAMAZ — bilerek: dış kopyayı ele geçiren, sunucuyu ele geçirmeden içini
okuyamaz.

Kendi makinenizde (bir kez: `winget install FiloSottile.age`):

    age -d -i ~/.ssh/basar_metaprice bekci-20260906-212406.sql.gz.age > bekci-20260906-212406.sql.gz
    age -d -i ~/.ssh/basar_metaprice yapilandirma-20260907-182237.tgz.age | tar -xz

İlki veritabanı dökümüdür → `scp` ile sunucuda `/opt/metaprice/backups/` altına koyup aşağıdaki
adımlarla devam edin. İkincisi `.env`, `docker-compose.yml`, `Caddyfile` ve `scripts/` içerir —
sunucu sıfırdan kuruluyorsa gereken her şey budur. Çözülmüş `.env` düz metin sırdır; işiniz
bitince silin.

**Anahtarı kaybederseniz dış kopyalar AÇILAMAZ.** `basar_metaprice` özel anahtarını ve parolasını
parola yöneticinize yedekleyin. Sunucudaki yedekler (`/opt/metaprice/backups/`, yalnız root okur)
şifresizdir; sunucu ayaktayken bu bölüme gerek yoktur.

## 2. GERİ YÜKLEME — adım adım

### Adım 1 — Sunucuya girin ve eldeki yedekleri görün

```
cd /opt/metaprice
bash scripts/geri-yukle.sh liste
```

En yeni yedek en üstte listelenir. **Hangi dosyayı seçeceğiniz:**

- Bir **deploy** her şeyi bozduysa → o deploy'un `deploy-oncesi-...` dosyası.
  Adında deploy'un sürüm damgası vardır; hangi deploy'dan önce alındığı bellidir.
- Veri **kademeli olarak** bozulduysa (ne zaman başladığı belirsiz) → bozulmanın
  kesinlikle olmadığı **en yeni** `metaprice-...` dosyası.
- Yanlış bir geri yükleme yaptıysanız → `geri-yukleme-oncesi-...` dosyası.

> **Yedeğin yaşı = kaybedeceğiniz veri.** Günlük yedek 24 saatte bir alınır;
> en kötü ihtimalle bir günlük giriş kaybedersiniz. Kararı verirken bunu
> kullanıcıya söylemeniz gerekebilir.

### Adım 2 — Geri yükleyin

```
bash scripts/geri-yukle.sh metaprice-20260804-030000.sql.gz
```

(Dosya adını Adım 1'in listesinden aynen yazın.)

Betik sırayla şunları yapar ve **her birinde durabilir**:

| # | Ne yapar | Durursa ne anlama gelir |
|---|---|---|
| 1/7 | Yedeğin bütünlüğünü doğrular | Dosya bozuk ya da yarım — **başka yedek seçin** |
| 2/7 | Mevcut veritabanının sayılarını gösterir, **EVET** yazmanızı ister | Onay vermezseniz hiçbir şey değişmez |
| 3/7 | **Can simidi**: mevcut durumun yedeğini alır ve doğrular | Alınamazsa geri yüklemeye **başlanmaz** |
| 4/7 | backend + frontend'i durdurur | — |
| 5/7 | Veritabanını boşaltıp yeniden oluşturur | — |
| 6/7 | Yedeği yükler | Hata verirse: **veritabanı yarım**, can simidiyle geri dönün |
| 7/7 | Sayıları gösterir, servisleri başlatır | — |

Adım 2'de betik size şunu sorar — büyük harfle `EVET` yazın, başka her şey iptal eder:

```
Devam etmek icin buyuk harfle EVET yazip enter'a basin
```

### Adım 3 — Şema uyumunu kontrol edin (yalnız ESKİ bir yedek yüklediyseniz)

Yedek, alındığı **andaki şemayı** taşır. Aradan bir şema değişikliği geçtiyse
(yeni kolon, yeni tablo), yeni kod eski şemayla konuşamaz ve backend hata verir.

Belirti: site açılır ama sayfalar 500 döner; backend logunda `column ... does not exist`.

Çözüm:

```
docker compose exec backend npx prisma db push
```

### Adım 4 — GÖZLE doğrulayın

Betiğin bastığı satır sayıları **makinenin cevabıdır; ekranın çalıştığını kanıtlamaz.**
Tarayıcıdan girin ve şunları açın:

- Giriş yapabiliyor musunuz
- Bir teklifin detay sayfası açılıyor mu
- Kütüphane sayfası dolu mu
- Bir marka fiyat listesi görünüyor mu

---

## 3. PROVA — canlıya dokunmadan (bunu bir kez yapın)

> ### ✅ SUNUCUDA PROVA YAPILDI — 22.09.2026
>
> **Prosedür sunucuda, gerçek yedekle, canlıya dokunmadan koştu ve geçti.**
> Aşağıdaki tablo o koşumun kendi çıktısıdır.
>
> ### ⚠ AMA `geri-yukle.sh` HÂLÂ HEDEF VERİTABANI SEÇEMİYOR
>
> Bu ayrım önemli ve bu belge onu gizlemez. `geri-yukle.sh` hedefini `.env`
> içindeki `POSTGRES_DB`'den okur (satır 41) ve yedeği **her zaman canlı
> veritabanının üstüne** yükler. Yani provada betiğin kendisi değil,
> **betiğin kalbi olan yükleme borusu** ayrı bir veritabanına koşturuldu:
>
> ```
> gzip -dc <yedek> | psql -U <kullanici> -d <PROVA_VT> -v ON_ERROR_STOP=1
> ```
>
> Provası YAPILMAYAN kısım: `geri-yukle.sh`'in onay soruları, can simidi
> yedeği ve ret yolları — bunlar 04.08'de sahte `docker` ile ayrı ayrı
> ateşlenmişti, gerçek konteynerle uçtan uca koşmadı. Sunucuda ilk gerçek
> geri yükleme her hâlükârda can simidiyle korunur: betik geri yüklemeden
> hemen önce mevcut durumun doğrulanmış bir yedeğini alır, alamazsa hiç
> başlamaz.

### 22.09.2026 sunucu provası (kanıt)

Yedek: `backups/metaprice-20260921-195424.sql.gz` (9.775.648 bayt,
21.09.2026 19:54:25 UTC). Hedef: geçici `metaprice_prova_*` veritabanı.

**Önce üç güvenlik kontrolü** — dökümün canlı veritabanına atlayıp atlamadığı
ölçüldü, varsayılmadı:

| Kontrol | Sonuç |
|---|---|
| `gzip -t` bütünlük | GEÇTİ |
| Dökümde `\connect` / `\c` satırı | **YOK** |
| Dökümde `CREATE DATABASE` / `DROP DATABASE` | **YOK** |
| `backup.sh` `pg_dump` çağrısında `--create` | **YOK** (`backup.sh:57`) |

Bu dördü birlikte şu anlama gelir: döküm hangi veritabanına verilirse oraya
yazar, kendi başına canlıya **atlayamaz**. Üçü de doğrulanmadan prova
başlatılmadı — çünkü `\connect metaprice` taşıyan bir döküm, "ayrı
veritabanına yüklüyorum" derken canlıyı ezerdi.

**Prova sonucu:**

| Adım | Sonuç |
|---|---|
| Ayrı veritabanı oluştur | OK |
| `gzip -dc … \| psql -v ON_ERROR_STOP=1` | çıkış kodu **0** |
| Log'da `ERROR`/`FATAL` satırı | **0** |
| **Yükleme süresi** | **3,83 sn** |
| Tablo sayısı (canlı → kopya) | **50 → 50** |
| 50 tablonun satır sayıları | **49'u birebir aynı** |
| Kopya kaldırıldı | OK (kalan prova vt: 0) |
| Prova sonrası canlı `/api/health` | `status: ok`, `73a8ef4707c7` |

**Tek fark ve NEDEN doğru olduğu:** `PasswordResetToken` canlıda 4, kopyada 3
satır. Fark, 22.09 10:44'te oluşturulmuş bir sıfırlama jetonu; döküm ise
21.09 19:54'ten. Yani kopya, dökümün alındığı **anın** sadık bir fotoğrafı —
eksik değil, **daha eski**. Bu fark aslında en değerli bulgu: karşılaştırma
gerçekten çalışıyor. Her tablo tesadüfen eşleşseydi, ölçüm aletinin kendisinden
şüphelenmek gerekirdi.

**Canlı veriye tek yazma yapılmadı:** canlı veritabanına yalnız `SELECT
count(*)` sorguları gitti; yazma, şema değişikliği ve `geri-yukle.sh` çağrısı
YOK. Oluşturulan geçici veritabanı prova bitince düşürüldü.

### Provayı kendiniz tekrarlamak

Sunucuda, sırayla (hepsi canlıya dokunmaz):

```bash
cd /opt/metaprice
KUL=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2- | tr -d '\r"')
SON=$(ls -t backups/metaprice-*.sql.gz | head -1)
PROVA=metaprice_prova_$(date +%H%M%S)

# 1) Döküm canlıya atlıyor mu? Üçü de BOŞ dönmeli.
gzip -dc "$SON" | grep -nE '^\\connect|^\\c ' | head
gzip -dc "$SON" | grep -niE '^(CREATE|DROP) DATABASE' | head

# 2) Ayrı veritabanı + yükleme
docker compose exec -T db psql -U "$KUL" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$PROVA\";" </dev/null
time gzip -dc "$SON" | docker compose exec -T db psql -U "$KUL" -d "$PROVA" \
  -v ON_ERROR_STOP=1 -q

# 3) Tablo sayısı karşılaştır
docker compose exec -T db psql -U "$KUL" -d metaprice -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" </dev/null
docker compose exec -T db psql -U "$KUL" -d "$PROVA" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" </dev/null

# 4) TEMİZLE — bu adım atlanırsa kopya diskte kalır
docker compose exec -T db psql -U "$KUL" -d postgres \
  -c "DROP DATABASE \"$PROVA\";" </dev/null
```

> **⚠ PÜRÜZ — `docker compose exec -T` STDIN'İ YUTAR.** Yukarıdaki komutların
> dökümü boruya veren biri DIŞINDA hepsinde `</dev/null` var ve bu şart. Bir
> betiğin içinde `</dev/null` olmadan çağrılırsa, o `exec` betiğin geri kalan
> satırlarını girdi sanıp tüketir ve **betiğin gerisi sessizce hiç koşmaz.**
> Bu depoda ölçülmüş bir tuzaktır.

### 04.08.2026'da yapılan prova (geçmiş kayıt)

Sunucu provasından önce, geliştirme makinesinde gerçek veriyle koşturulmuştu:

| Adım | Sonuç |
|---|---|
| `pg_dump` + `gzip` ile yedek | 1.059.037 bayt |
| `gzip -t` bütünlük | GEÇTİ |
| Dump SONU işareti | VAR |
| Boş hedef veritabanı oluştur | OK |
| `gzip -dc … \| psql -v ON_ERROR_STOP=1` | çıkış kodu **0** — tek hata yok |
| Satır sayıları (UserLibrary / User / Brand) | **1760 / 3 / 57 → 1760 / 3 / 57** |
| KALEM 59 ölçüsü kopyada | **117 öksüz / 59 iskontolu** — kaynakla aynı |
| Kopya kaldırıldı | OK |

O gün eksik kalan şey — "aynı akışın sunucuda, gerçek konteynerle koşması" —
22.09 provasıyla kapandı (yükleme borusu için). `geri-yukle.sh`'in karar akışı
(9 ayrı ret yolu) hâlâ yalnız sahte `docker` ile sınanmış durumda.

---

## 4. Yedeklerin sağlığını kontrol etmek

Yedek almanın sessizce durması, geri yükleme gününe kadar fark edilmeyen bir
arızadır. Ayda bir bakın:

```
cd /opt/metaprice
ls -lht backups
docker compose logs backup --tail 30
```

Görmeniz gereken: en yeni `metaprice-...` dosyasının tarihi **bugün ya da dün**,
ve logda `tamam` satırı. `HATA` satırı görüyorsanız o gün yedek **alınmamıştır**.

> **04.08.2026 öncesi alınmış yedeklere dikkat.** O tarihe kadar `backup.sh`
> başarısız bir dump'ı da `tamam` diye damgalıyordu ve eski yedekleri yine de
> siliyordu. Yani eski `metaprice-...` dosyalarından bazıları **yarım** olabilir.
> `geri-yukle.sh` bunu yakalar ve reddeder — ama o dosyaya güvenmeyin.

### Yedeklerin budanması

**21.09.2026 (K5) — artık kendiliğinden budanıyor.** Bütün yedekler en fazla
**30 gün** saklanır; günlük yedekler (`metaprice-...`) **14 gün** (değişmedi).

| Aile | Saklama | Kim siler |
|---|---|---|
| `metaprice-...` | 14 gün | `scripts/backup.sh` günlük döngü |
| `deploy-oncesi-...` | 30 gün | `backup.sh` günlük **ve** `deploy.sh` her başarılı deploy yedeğinden sonra |
| `geri-yukleme-oncesi-...` | 30 gün | `backup.sh` günlük döngü |
| `bekci-...` | 30 gün | `backup.sh` günlük döngü |

İki emniyet var, ikisi de aynı desenden geliyor: **silme yalnız doğrulanmış
yeni bir yedek oluştuktan sonra koşar.** Ayrıca 30 gün kuralı, son 2 günde
doğrulanmış bir `metaprice-...` yedeği **yoksa hiç çalışmaz** — can simidi
dosyalarını elde güncel yedek olmadan silmemek için. O durumda log şunu yazar:
`[backup] 30 GUN KURALI ATLANDI`.

Aradaki bir anda **elle** budamak isterseniz önce **ne
silineceğini görün**:

```
find backups -name 'deploy-oncesi-*.sql.gz' -mtime +30
```

Liste doğruysa silin:

```
find backups -name 'deploy-oncesi-*.sql.gz' -mtime +30 -delete
```

---

## 5. Bilinen boşluklar (gizlenmiyor)

| Boşluk | Sonucu | Durum |
|---|---|---|
| **Sunucu dışında OTOMATİK kopya yok** | Sunucu diski ölürse yedekler de ölür. Elle alınan şifreli kopyalar var (§ 1b, 07.09) ama bir betiğe bağlı değil, düzenli olduğu ölçülmedi. | Açık |
| **Sunucu dışı kopyalarda 30 gün kuralı ELLE** | 21.09 (K5): sunucudaki dört yedek ailesi en fazla 30 gün saklanıyor. `MetaPriceYedek` klasöründeki şifreli kopyalar bu kuralın DIŞINDA — orayı budayan bir betik depoda yok. Gizlilik metnindeki "yedeklerden en geç 30 gün içinde çıkar" cümlesi o klasör için elle sağlanmalı. | Açık — Emre |
| `geri-yukle.sh` hedef veritabanı seçemiyor | Betiğin KENDİSİ sunucuda prova edilemiyor; hedefini `.env`'den okur ve hep canlının üstüne yükler. 22.09'da **yükleme borusu** ayrı bir veritabanına koşturuldu ve geçti (§ 3), ama betiğin onay/ret yolları gerçek konteynerle hiç koşmadı. | Kısmen kapandı — § 3 |
| Yedek şifrelenmiyor | `backups/` klasörünü okuyabilen herkes tüm müşteri verisini okur | Açık |
| Tam geri dönüş süresi ölçülmedi | 22.09 provası YÜKLEME adımını ölçtü: **3,83 sn** (9,8 MB döküm, 50 tablo). Felaket anındaki toplam süre bundan uzun — yedeği bulma, çözme, onay, can simidi yedeği ve servis yeniden başlatma dahil değil. | Kısmen ölçüldü — § 3 |

---

## 6. İşler kötüye giderse

**Geri yükleme yarıda kaldı, veritabanı yarım:**

```
cd /opt/metaprice
bash scripts/geri-yukle.sh liste
```

En üstteki `geri-yukleme-oncesi-...` dosyasını seçin — bu, geri yüklemeden
**hemen önceki** durumdur:

```
bash scripts/geri-yukle.sh geri-yukleme-oncesi-20260804-235900.sql.gz
```

**Servisler kalkmadı:**

```
docker compose ps
docker compose logs backend --tail 50
docker compose up -d backend frontend
```

**Hiçbir yedek çalışmıyor:** Durun. Daha fazla komut çalıştırmayın; her deneme
durumu daha da bulanıklaştırır. `backups/` klasörünün tamamının bir kopyasını
alın, sonra yardım isteyin.
