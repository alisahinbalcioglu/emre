# Dağıtım — Hetzner VPS + Docker Compose + Caddy

> **⚠ 22.09.2026'da BAŞTAN YAZILDI (plan s.3).** Bu belgenin eski hâli
> Netlify + Render kurulumunu anlatıyordu ve 42 yerde o iki servisten söz
> ediyordu. Proje o kurulumda **çalışmıyor** ve uzun süredir çalışmıyor;
> belge okuyan biri var olmayan bir sisteme deploy etmeye çalışırdı.
> Kökteki `render.yaml` ve `netlify.toml` de aynı sebeple **silindi** (§ 7).

---

## 0. Bir bakışta

| Soru | Cevap |
|---|---|
| Nerede çalışıyor | Hetzner Cloud VPS — `ubuntu-8gb-fsn1-1`, Falkenstein DC Park 1 |
| Adres | `167.233.225.241` · `metapricex.com` |
| Nasıl | `docker compose`, **altı** konteyner |
| Kök dizin | `/opt/metaprice` (git deposunun kendisi) |
| Deploy komutu | `bash scripts/deploy.sh` |
| HTTPS | Caddy otomatik (Let's Encrypt) |
| Sırlar | `/opt/metaprice/.env` — **git'te değil** |
| Geri yükleme | `docs/GERI_YUKLEME.md` |

### Konteynerler

| Servis | İş | Port |
|---|---|---|
| `caddy` | Ters vekil + otomatik HTTPS | 80 / 443 (dışa açık) |
| `frontend` | Next.js | iç 3000 |
| `backend` | NestJS (`/api`) | iç 3001 |
| `dwg-engine` | Python DWG motoru | iç 10000, **yalnız iç ağ** |
| `db` | PostgreSQL 16 (kalıcı volume) | iç 5432 |
| `backup` | Günlük `pg_dump` | — |

Dışa açık tek şey Caddy'dir. Backend, motor ve veritabanı dış ağdan
erişilemez; ölçüldü ve öyle kalmalıdır.

---

## 1. Deploy — normal akış

### ⚠ Ön koşul: CI YEŞİL OLMADAN DEPLOY YOK

Depo kuralı (`CLAUDE.md`): o commit'in GitHub Actions `regression-gate`
koşumu yeşil olmalı. Depo açık, koşum durumu girişsiz okunur:

```bash
curl -s "https://api.github.com/repos/alisahinbalcioglu/emre/actions/runs?head_sha=<40 haneli sha>"
```

`conclusion: success` görmeden aşağıya geçmeyin. Bu kuralın bir kez
çiğnendiği bir vaka var (`eb424f3`, 14.09) ve kayda geçti.

### Deploy

```bash
ssh root@167.233.225.241
cd /opt/metaprice && nohup bash scripts/deploy.sh > /tmp/deploy.log 2>&1 &
tail -f /tmp/deploy.log
```

**`nohup` şart.** SSH koparsa deploy yarıda ölür; bu daha önce yaşandı.

> **⚠ HETZNER WEB KONSOLUNDA KOMUT YAZMAYIN.** TR klavyede konsol `>`, `&`,
> `|`, `$`, `_` karakterlerini **yazamıyor**. 22.09'da yukarıdaki komut
> konsolda sessizce şuna dönüştü:
> `nohup bash scripts/deploy.sh . /tmp/deploy.log 2.71 7`
> — yönlendirme ve arka plana alma hiç olmadı, çıktı `nohup.out`'a gitti ve
> konsol "takılmış" göründü. Deploy aslında koşuyordu. Kendi terminalinizden
> `ssh` kullanın. Konsol yalnız **kaçış yoludur** (SSH tamamen gittiğinde).

### Betiğin altı adımı

`deploy.sh` kendi kendini doğrular ve **6/6** demeden bitmiş sayılmaz:

1. `git pull` — depo güncellenir
2. Deploy öncesi yedek (`deploy-oncesi-*`) — alınamazsa deploy başlamaz
3. `docker compose build`
4. `prisma migrate deploy`
5. `docker compose up -d backend frontend dwg-engine` + Caddy yeniden yükleme
6. **Canlı doğrulama** — `/api/health` sorulur, `build_sha` beklenen commit mi

Son satır şöyle olmalı:

```
✅ DEPLOY DOGRULANDI — backend: <sha> · motor: <sha>
```

Bu satır "sözlü teyit" değil, iki servisin kendi cevabıdır.

> **⚠ BETİK KENDİ KOPYASINI DEĞİŞTİRİR.** `git pull` hem betiği hem
> mount'ları yeni inode ile yazar; `deploy.sh`'e yapılan bir değişiklik O
> KOŞUMDA DEĞİL, bir sonrakinde etkili olur. Aynı tuzak `Caddyfile` bind
> mount'unda da yaşandı.

---

## 2. Sırlar (`.env`)

`/opt/metaprice/.env` — git'te **yok** ve olmamalı. İçindekiler kabaca:
veritabanı kullanıcı/parolası, `JWT_SECRET`, `INTERNAL_API_TOKEN`, SMTP
(Brevo relay), iyzico anahtarları, AI sağlayıcı anahtarları, `PARASUT_*`.

- Sır döndürme betiği: `scripts/sir-dondur.sh` (7.09'da 32 saniyede koştu,
  5/5 kanıtla). Rotasyon **tüm oturumları düşürür**, herkes yeniden girer.
- `.env` bir ekran görüntüsüne ya da sohbete düşerse: rotasyon **zorunludur**.
  Bu iki kez yaşandı.
- Yedek alınırken `.env` de kopyalanır; kopyalar `age` ile şifrelenir
  (`docs/GERI_YUKLEME.md` § 1b).

---

## 3. Yedekler

**Dört ayrı aile, iki ayrı saklama süresi** — tek bir sayı yoktur:

| Aile | Ne zaman | Saklama | Nerede yazılı |
|---|---|---|---|
| `metaprice-*` | Günlük (backup konteyneri) | **14 gün** | `scripts/backup.sh:28` |
| `deploy-oncesi-*` | Her deploy'dan önce | **30 gün** | `scripts/deploy.sh:113` |
| `geri-yukleme-oncesi-*` | Geri yüklemeden önce (can simidi) | **30 gün** | aynı |
| `bekci-*` | Nöbetçi işi | **30 gün** | aynı |

Gizlilik Politikası müşteriye "silinen veriler yedeklerden **en geç 30 gün**
içinde çıkar" diye söz verir. Bu söz yukarıdaki tabloya dayanır; süreleri
değiştiren biri o cümleyi de gözden geçirmelidir.

**Sunucu dışı kopya:** `age` ile şifreli, alıcı Emre'nin SSH anahtarı.
Otomatik değil — Windows görevi oturuma bağlı koşuyor (plan 0.21) ve kalıcı
çözüm Hetzner Storage Box'tır (plan 0.9). **Açık boşluk, gizlenmiyor.**

---

## 4. Geri yükleme

Ayrı belge: **`docs/GERI_YUKLEME.md`**. Özet:

- `scripts/geri-yukle.sh` — geri yüklemeden önce can simidi yedeği alır,
  alamazsa **hiç başlamaz**.
- ⚠ Betik hedef veritabanı **seçemez**: hedefini `.env`'deki `POSTGRES_DB`'den
  okur ve hep canlının üstüne yükler.
- Prova 22.09'da sunucuda koştu: yükleme **3,83 sn**, psql çıkış kodu 0,
  50 tablonun 49'u birebir (tek fark, dökümden sonra oluşmuş bir satır).

---

## 5. Sunucu sertleştirme

Faz 0'ın ürünleri **depoda değil, sunucuda** yaşıyor (plan 0.23 bunu
kapattı — betikler artık `scripts/sunucu/` altında):

- SSH: **parola girişi kapalı**, `PermitRootLogin prohibit-password`,
  `MaxAuthTries 3`. Yapılandırma `/etc/ssh/sshd_config.d/00-sertlestirme.conf`
  — dosya adı `00-*` çünkü OpenSSH'de **İLK okunan değer kazanır** ve
  `50-cloud-init.conf` aksini yazıyordu.
- 22.09 (plan 0.12): ana `sshd_config` ve cloud-init boothook'u da
  düzeltildi, böylece sertleştirme dosyası bir gün silinse bile parola
  girişi **geri açılmaz**. Ölçüldü: önce `yes/yes`, sonra
  `prohibit-password/no`.
- `fail2ban`, ufw, canlı çekirdek yaması etkin.
- **Kaçış yolu:** Hetzner panelinden Rescue modu (root parolası kilitli).

`sshd_config` değiştirirken kural: her değişiklikten sonra `sshd -t`,
geçmezse yedekten geri al; servisi **restart etme, yalnız reload** —
açık oturumlar düşmez.

---

## 6. İzleme

- İki systemd timer + log tavanları (nöbetçi/bekçi).
- Docker log rotasyonu: altı konteynerin altısı `json-file 10m×3`.
  ⚠ Docker bu ayarı **yalnız konteyner yeniden yaratılınca** uygular.
- ⚠ **Dış alarm kanalı YOK** (plan 0.8): nöbetçinin kritik uyarısı
  `journal`dan öteye gitmiyor, sunucuda MTA kurulu değil. UptimeRobot
  bağlanmadan `unattended-upgrades` otomatik yeniden başlatma da bilerek
  açılmadı.

---

## 7. Ölü dosyalar

**`render.yaml`** ve **`netlify.toml`** 22.09.2026'da **SİLİNDİ** (plan s.3,
Emre onayı). İkisi de Netlify + Render kurulumuna aitti ve bu kurulumda
hiçbir şey onları okumuyordu; duran bir dosya rehber sanılır.

Silmeden önce ölçüldü: iki dosyaya yapılan tek atıf **yorumlardı**
(`regression-all.ts`, `migration-zinciri-test.ts` — `render.yaml:64`'teki
migration komutuna işaret ediyorlardı). Varlıklarını sınayan bir kapı yoktu;
yine de o yorumlar ve `README.md` ile `backend/.env.example` aynı turda
düzeltildi, yoksa ölü bir dosyaya işaret eden canlı işaretçiler kalırdı.

`.github/workflows/` içinde yalnız `regression.yml` var — eski keep-alive iş
akışı zaten kaldırılmış.
