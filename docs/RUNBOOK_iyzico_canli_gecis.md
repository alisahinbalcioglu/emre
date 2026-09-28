# iyzico Canlı Anahtar Geçişi — Runbook (28.09.2026)

Sistem bugün iyzico'nun **TEST ortamına (sandbox)** bağlı. Canlı iyzico hesabı **ayrı ve boştur**: sandbox'ta üretilmiş abonelik, müşteri, sipariş ve **plan** kodları canlı hesapta YOKTUR.

Geçiş dört işten oluşur:
1. anahtar ve adres değişimi,
2. sandbox izlerinin temizliği,
3. planların canlıda yeniden kurulması,
4. webhook imza zorunluluğu (ön koşullu, en son).

İlk üçü **tek bakım penceresinde, backend DURMUŞKEN** yapılır. Sırayla uygulayın. Sırlar (API anahtarı, gizli anahtar) YALNIZ sunucunun `.env`'ine yazılır — sohbete, commit'e ya da günlüğe yazılmaz.

## 1. Ön koşullar (geçiş gününden ÖNCE)

- [ ] Canlı üye işyeri hesabı açık ve **Abonelik** ürünü canlı hesapta etkin. Sandbox'ta bunun için ayrı talep gerekmişti (`docs/RAPOR_ADIM0_iyzico_Sandbox.md` S3).
- [ ] **Webhook imzası** (X-IYZ-SIGNATURE-V3) CANLI hesap için ayrıca talep edildi (entegrasyon@iyzico.com). Sandbox'ta açık olması canlıda açık olduğu anlamına gelmez.
  - ⚠ 28.09 canlı ölçüm: sandbox'tan alınan TEK bildirimde (06.09) imza başlığı YOKTU.
- [ ] Canlı panelde abonelik bildirim adresi girildi: `https://<alan-adı>/api/webhook/iyzico/abonelik`.
  - Yer: Ayarlar > Üye İşyeri Ayarları > **Üye İşyeri Abonelik Bildirimleri**. Ödeme bildirimleri ayrı alandır, oraya girilmez.
- [ ] Canlı API anahtarı, gizli anahtar ve üye işyeri numarası (MID) elde.
- [ ] Satıştaki fiyatlar güncel mi? `seedpaketler --tek-urun` fiyatı AYNEN taşır. Kurla yeniden fiyatlama ayrı iştir.
- [ ] Canlıdaki sürüm "webhook güvenliği" turunu (28.09) içeriyor ve o commit'in CI koşumu yeşil.

## 2. Geçiş günü — BAKIM PENCERESİ (backend durmuş)

**Neden pencere:** Temizlik betiği "iyzico kodu taşıyan satır"ın sandbox mı canlı mı olduğunu AYIRT EDEMEZ. Backend canlı anahtarla açıkken:
- bir müşteri canlı satın alabilir ve betik onun satırını da siler;
- dakikalık fatura işi sandbox ödemesinin bekleyen faturasını "test ortamı DEĞİL" damgasıyla NES'e gönderir.

Betik bu yüzden ilk uygulamadan sonra canlı etkinlik (yeni ya da tamamlanmış satın alma niyeti, gelen webhook, yeni abonelik satırı) görürse `--uygula`'yı REDDEDER. Ama ilk koşumu korumak pencerenin işidir.

### 2.1 Salt okuma sayımı (hâlâ sandbox'tayken, backend açık)

```bash
docker compose exec -T backend npm run iyzicocanligecis
```

Çıktı şunları listeler (iyzico kodu YAZILMAZ):
- kodlu abonelik satırları: firma adı, durum, erişim sonu, ne olacağı;
- bekleyen satın alma niyetleri;
- işlenmemiş webhook olayları;
- kesilmemiş ve **kesilmiş** kart faturaları;
- satıştaki paket sürümleri.

Kesilmiş kart faturası (sandbox ödemesine kesilmiş fatura) varsa betik ona DOKUNMAZ; NES'te elle iptal edilir, numaraları çıktıdadır.

28.09 ölçümü (koordinatör, salt okuma):

| Kayıt | Değer |
|---|---|
| KART abonelik | 1 (AKTIF, kodlu; Emre'nin test firması) |
| HAVALE abonelik | 3 (kodsuz, miras) |
| Satın alma niyeti | TAMAMLANDI 1 · VAZGECILDI 4 |
| Deneme kaydı | 1/4 müşteri kodlu |
| Fatura | 0 |
| İşlenmemiş webhook olayı | 0 |

### 2.2 Pencereyi aç: backend'i durdur, ortamı değiştir

```bash
docker compose stop backend
```

`.env` (sunucu):

```
IYZICO_API_KEY=<canlı>
IYZICO_SECRET_KEY=<canlı>
IYZICO_MERCHANT_ID=<canlı MID>
IYZICO_TABAN_URL=https://api.iyzipay.com
IYZICO_IMZA_ZORUNLU=false      # KALIR — bkz. bölüm 3
IYZICO_IMZA_SIRASI=            # boş KALIR — bkz. bölüm 3
```

**Sandbox panelinde** abonelik bildirim adresini KALDIRIN. Sandbox'taki test abonelikleri bildirim göndermeye devam ederse canlı sisteme düşer: betiğin kilidi onları canlı etkinlik sayar, işleyici de canlı API'ye sandbox kodu sorar.

### 2.3 Sandbox izlerinin temizliği (tek seferlik kapta)

```bash
docker compose run --rm backend npm run iyzicocanligecis
```

PROVA çıktısı artık `CANLI` demeli ve "önceki uygulama: yok (ilk koşum)" yazmalı. "kodlu abonelik" sayısını okuyun, sonra:

```bash
docker compose run --rm backend npm run iyzicocanligecis -- --uygula --beklenen=<sayı>
```

Betik yalnız şu koşullarda uygular:
- iyzico adresi CANLI;
- `--beklenen` PROVA'daki sayıya eşit;
- ilk uygulamadan sonra canlı etkinlik yok.

**"atlanan" 0 değilse:** pencere hâlâ açıksa (backend durmuş) PROVA'yı yeniden koşup tekrar uygulamak güvenlidir; betik idempotenttir. Backend açıldıktan SONRA betik yeniden koşmaz (kilit). Kalan satırlar tek tek elle incelenir, çünkü kodları canlı satın almaya ait olabilir.

Ne yapar (kural `backend/src/ozellik/odeme/abonelik/canli-gecis.ts`, kapı `test:iyzico-canli-gecis`):

| Satır | Sonuç |
|---|---|
| KART · DENEME / AKTIF / ODEME_BEKLIYOR / KISITLI | IPTAL, erişim ŞİMDİ biter, dunning sayaçları sıfır. Saatlik iş 1 saat içinde SONA_ERDI yapar; miras hakkı olan firma miras paketine döner. **Emre kararı 28.09: sandbox ödemesi gerçek para değil.** |
| KART · ASKIDA | SONA_ERDI (miras hakkı varsa mirasa döner) |
| KART · IPTAL | IPTAL kalır, erişim en geç şimdi |
| KART · SONA_ERDI · HAVALE (her durum) | Yalnız iyzico kodları temizlenir. Havale gerçek paradır: durum, erişim ve planlı geçiş aynen kalır |
| Bekleyen satın alma niyeti (plandakiler) | VAZGECILDI (sandbox jetonu canlıda sonuçlanamaz) |
| İşlenmemiş webhook olayı (plandakiler) | "işlendi" + hata notu (canlı API'ye sorulmaz) |
| Kesilmemiş KART faturası | IPTAL (gerçek para yok). Kesilmiş olana ve havale faturasına dokunulmaz |

Her satırın eski kodları, değişiklikten ÖNCE `AbonelikOlayi` (`iyzico.anahtar.gecisi`) denetim izine yazılır. Plan ile uygulama arasında kodu ya da durumu değişen satır atlanır; o arada doğan kayda dokunulmaz.

### 2.4 Planları canlıda kur (pencere hâlâ açık)

```bash
docker compose run --rm backend npm run seedpaketler -- --tek-urun            # PROVA
docker compose run --rm backend npm run seedpaketler -- --tek-urun --uygula
```

PROVA'da her satıştaki sürüm "TASINACAK" demeli, çünkü canlıda ürün yok. Uygulama canlıda tek ürün ile ana ve denemesiz planları kurar, yeni sürüm satırlarını yazar ve sandbox kodlu sürümü satıştan çeker.
- ⚠ Canlı plan SİLİNEMEZ ve fiyatı değiştirilemez.
- ⚠ Kipsiz `seedpaketler` mevcut paketleri ATLAR; canlı planı KURMAZ.

### 2.5 Pencereyi kapat

```bash
docker compose up -d backend
```

Doğrulama (salt okuma):
- Fiyat sayfası `/abonelik` açılıyor, paketler görünüyor.
- Satıştaki sürümler TEK üründe ve kodları dolu (`satistaki_urun` 1 olmalı):

  ```bash
  bash scripts/abonelik-olcum.sh paket
  ```

- Kodlu abonelik kalmadı (0):

  ```sql
  BEGIN READ ONLY;
  SELECT count(*) FROM "Abonelik"
   WHERE "iyzicoAbonelikKodu" IS NOT NULL OR "iyzicoDurum" IS NOT NULL;
  ROLLBACK;
  ```

### 2.6 İlk canlı satın alma (Emre, kendi kartıyla, küçük paket)

- [ ] Ödeme → dönüş → abonelik AKTIF.
- [ ] Webhook geldi: `WebhookOlayi` son satırında imza başlığı dolu mu (`imzaBasligi`), doğrulandı mı (`imzaGecerli`)?
- [ ] Günlükte `İmza doğrulandı. Alan sırası: "…"` satırı → bölüm 3 için sırayı not edin.

## 3. İmza zorunluluğu — ÖN KOŞULLU, geçişten SONRA

**Açma şartı:** canlıdan gelen imzalı bir bildirimin `imzaGecerli = true` olduğu ÖLÇÜLDÜ.

```sql
BEGIN READ ONLY;
SELECT "kaynak", ("imzaBasligi" IS NOT NULL) AS baslik, "imzaGecerli", count(*)
  FROM "WebhookOlayi" WHERE "alindi" > now() - interval '7 days'
 GROUP BY 1, 2, 3;
ROLLBACK;
```

Başlık hiç yoksa iyzico imzayı göndermiyor. iyzico'ya yeniden yazın; zorunluluğu AÇMAYIN.

Şart sağlandıysa:
1. `.env`: `IYZICO_IMZA_SIRASI=<günlükteki sıra>` (`merchantId-once` | `secretKey-once`) → yeniden başlat → bir bildirim daha `imzaGecerli = true`.
2. `.env`: `IYZICO_IMZA_ZORUNLU=true` → yeniden başlat.
3. İzleyin: sonraki gerçek bildirim yeni bir `WebhookOlayi` satırı olarak `imzaGecerli = true` ile düşmeli.

**Geri alma ölçütü** (`false`'a çek + yeniden başlat):

⚠ `Webhook REDDEDİLDİ (401)` satırı TEK BAŞINA geri alma sebebi DEĞİLDİR: imzasız bir istekle herkes üretebilir, yani zorunluluğu uzaktan kapattırmanın yolu olur. Geri alma yalnız GERÇEK bir bildirimin reddedildiği gösterilince:
- (a) Bir aboneliğin iyzico panelinde görünen yenilemesi (ya da ilk ödemesi) sonrası `WebhookOlayi`'da karşılığı YOK, ve aynı saatlerde günlükte o aboneliğin koduyla `REDDEDİLDİ (401)` satırı var.
- ya da (b) Gece mutabakatı kayıp tahsilat oynatmaya başladı (özet satırında "yeniden oynatılan" > 0). Bu, iyzico bildirimlerinin ulaşmadığını gösterir.

Zorunluyken imzası tutmayan gerçek bildirimler de 401 alır; iyzico 15 dk arayla 3 kez dener, sonra vazgeçer. Kayıp tahsilatı gece mutabakatı iyzico'dan bulur; müşterinin erişimi en geç ertesi gece düzelir.

Zorunluyken davranış (kapı `test:webhook-tahsilat-dogrulama` I):
- Eksik ya da yanlış imza → 401, satır YAZILMAZ, işlenmez.
- Beklenen imza günlüğe yazılmaz.
- Biçimsiz gövde (kod biçimi, eksik alan) her durumda 400 alır ve kaydedilmez.
- Uçta 16 KB gövde tavanı var.

⚠ 28.09 öncesi kodda `IYZICO_IMZA_ZORUNLU=true` hiçbir şeyi korumuyordu: reddedilen olay `islendi=false` ile kaydediliyor, dakikalık tarama onu yine işliyordu. Ölçüldü: imzası yanlış gövde erişimi uzattı, fatura açtı.

İmza zorunlu değilken koruma doğrulama kurallarındadır. Gövde kanıt sayılmaz, her bildirim iyzico'ya sorulur. Aynı siparişin tekrarı uygulanmaz. Sonraki dönemi işlenmiş siparişin başarısı dunning'i sıfırlamaz, reddi dunning başlatmaz. Kapı: `test:webhook-tahsilat-dogrulama` R.

## 4. Geri dönüş

- **Anahtarlar:** `.env`'i sandbox değerlerine çevirin, yeniden başlatın.
  - Temizlik geri ALINMAZ: eski kodlar `iyzico.anahtar.gecisi` izinde.
  - Sandbox'a dönülürse test aboneliği yeniden satın alınır.
- **Planlar:** canlıda kurulan plan silinemez. Satın alma paket başına EN YÜKSEK satıştaki sürümü seçer (`satinalma.servisi.ts`). Bu yüzden sandbox kodlu eski sürümü yeniden satışa almak YETMEZ: canlı kodlu sürümler de satıştan çekilmeli (`PaketSurumu.satistaMi`, yazma işlemi — onaylı).
- **İmza:** `IYZICO_IMZA_ZORUNLU=false` + yeniden başlatma.

## 5. Ayrıntılı salt okuma ölçümü

- Betiğin PROVA çıktısı (bölüm 2.1/2.3) geçişin sayımıdır; iyzico kodu yazdırmaz.
- Paket/plan durumu: `bash scripts/abonelik-olcum.sh paket`.
- Aynı siparişe birden çok başarı olayı geliyor mu (iyzico yeniden gönderiyor mu, ref kodu değişiyor mu, hangi aralıkla)? Kod yazdırmadan:

  ```sql
  BEGIN READ ONLY;
  WITH s AS (
    SELECT "siparisKodu", count(*) AS n, count(DISTINCT "iyzicoRefKodu") AS ref,
           count(DISTINCT "kaynak") AS kaynak,
           extract(epoch FROM max("alindi") - min("alindi")) AS aralik_sn
      FROM "WebhookOlayi"
     WHERE "olayTipi" = 'subscription.order.success' AND "siparisKodu" IS NOT NULL
     GROUP BY 1)
  SELECT n::int AS olay, ref::int AS farkli_ref, kaynak::int AS farkli_kaynak,
         count(*)::int AS siparis, max(aralik_sn)::int AS en_uzun_sn
    FROM s GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
  ROLLBACK;
  ```

  Ölçüm kaydı: 28.09'da koordinatörün koştuğu sorgu seti (Q1–Q8) PGlite + göç zinciriyle doğrulandı (17/17). Bu sorgu Q8'dir.
