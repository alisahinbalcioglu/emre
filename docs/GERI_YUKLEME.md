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
| Deploy yedeği | `deploy-oncesi-<sürüm>-<damga>.sql.gz` — her `deploy.sh` başında alınır, **kendiliğinden silinmez** |
| Can simidi | `geri-yukleme-oncesi-<damga>.sql.gz` — her geri yüklemeden hemen önce alınır |
| Geri yükleme | `bash scripts/geri-yukle.sh DOSYA-ADI` |
| Sunucu dışında kopya var mı? | **HAYIR.** Bkz. § "Bilinen boşluklar" |

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

> ### ⚠ SUNUCUDA PROVA BUGÜN YAPILAMIYOR — dürüst boşluk
>
> `geri-yukle.sh` yedeği **her zaman canlı veritabanının üstüne** yükler; hedef
> veritabanını seçme desteği **yoktur**. Yani sunucuda "canlıya dokunmadan bir
> kez deneme" bugün mümkün değil. Bunu mümkün kılmak ayrı bir iştir ve
> **yapılmadı** — bu belge onu varmış gibi göstermez.
>
> Bugün elinizdeki güvence şudur: prosedür 04.08'de geliştirme makinesinde
> gerçek veriyle uçtan uca koşturuldu (aşağıdaki tablo), ve betiğin **her ret
> yolu** ayrı ayrı ateşlendi. Prosedürün kendisi yazıldığı gibi çalışıyor.
>
> Sunucuda ilk gerçek geri yükleme, her hâlükârda **can simidi** ile korunur:
> betik geri yüklemeden hemen önce mevcut durumun doğrulanmış bir yedeğini alır,
> alamazsa hiç başlamaz.

### 04.08.2026'da yapılan prova (kanıt)

Geliştirme makinesinde, gerçek veriyle, **gerçekten koşturuldu**:

| Adım | Sonuç |
|---|---|
| `pg_dump` + `gzip` ile yedek | 1.059.037 bayt |
| `gzip -t` bütünlük | GEÇTİ |
| Dump SONU işareti (`PostgreSQL database dump complete`) | VAR |
| Boş hedef veritabanı oluştur | OK |
| `gzip -dc ... \| psql -v ON_ERROR_STOP=1` | çıkış kodu **0** — tek hata yok |
| Satır sayıları (UserLibrary / User / Brand) | **1760 / 3 / 57 → 1760 / 3 / 57** (birebir) |
| KALEM 59 ölçüsü kopyada | **117 öksüz / 59 iskontolu** — kaynakla aynı |
| Kopya kaldırıldı | OK |

**Neyin provası YAPILMADI:** aynı akışın `docker compose` üzerinden, sunucuda
koşması. Geliştirme makinesinde docker yok. `geri-yukle.sh`'in karar akışı
(9 ayrı yol: bozuk yedek, yarım dump, onay verilmemesi, can simidi alınamaması,
yükleme hatası, başarılı yol …) sahte `docker` ile ayrı ayrı ateşlendi; ama
gerçek konteynerle uçtan uca **koşmadı.**

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

### Deploy yedeklerini budamak (elle)

`deploy-oncesi-...` dosyaları kendiliğinden silinmez, birikirler. Önce **ne
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
| **Sunucu dışında kopya yok** | Sunucu diski ölürse yedekler de ölür. Yedekler korunan verinin yanında duruyor. | Kullanıcı şimdilik istemedi (04.08) |
| Sunucuda prova desteği yok | Prosedür sunucuda uçtan uca hiç koşmadı | § 3'te yazılı |
| Yedek şifrelenmiyor | `backups/` klasörünü okuyabilen herkes tüm müşteri verisini okur | Açık |
| Geri yükleme süresi ölçülmedi | Felaket anında "ne kadar sürer" sorusunun cevabı yok | Açık |

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
