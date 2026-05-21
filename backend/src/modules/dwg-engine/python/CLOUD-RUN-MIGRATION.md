# MetaPrice DWG Engine → Google Cloud Run Migration

Render free tier 512 MB RAM yetersiz (fork-OOM, subprocess crash). Cloud Run free tier 2 GB RAM seçilebilir + ayda 2M request bedava. Bu kılavuz step-by-step migration adımları.

---

## Faz 1: GCP Setup (~15 dakika)

### 1.1 Hesap aç
👉 https://cloud.google.com/free

- "Get started for free"
- Mevcut Gmail ile giriş
- Billing account oluştur (kart gerekli, free tier'da kesinti **YOK**)
- $300 / 90 gün trial otomatik aktive olur

### 1.2 Proje oluştur
👉 https://console.cloud.google.com/projectcreate

| Alan | Değer |
|---|---|
| Project name | `metaprice-dwg` |
| Project ID | (otomatik üretilir, örn `metaprice-dwg-prod-481923`) |
| Billing | yeni açtığını seç |
| Location | No organization |

→ **Create**

⚠️ **PROJECT_ID'yi not al** — deploy script'te kullanacağız.

### 1.3 API'leri aktif et
👉 https://console.cloud.google.com/apis/library

Üç API:
1. Search → **"Cloud Run Admin API"** → Enable
2. Search → **"Artifact Registry API"** → Enable
3. Search → **"Cloud Build API"** → Enable

(Aktive 30-60 saniye sürer)

### 1.4 gcloud CLI yükle
👉 https://cloud.google.com/sdk/docs/install#windows

- `GoogleCloudSDKInstaller.exe` indir
- Çalıştır (default install)
- Sonunda **"Run gcloud init"** seçili kalsın
- Browser açılır → Gmail ile login ver
- "Choose project" → `metaprice-dwg-prod-XXX` seç

Doğrulama (terminal):
```powershell
gcloud --version
gcloud config get-value project
```

### 1.5 Billing alert kur (opsiyonel, önerilen)
👉 https://console.cloud.google.com/billing/budgets

- **Create Budget**
- Amount: **$1**
- Alert at: 50%, 90%, 100%
- Email: Gmail adresin

Bu sayede sürpriz kesinti olmaz, $1 bile aşılırsa uyarı gelir.

---

## Faz 2: Engine Deploy (~10-15 dakika)

### 2.1 Repository setup (sadece ilk kez)

```powershell
gcloud artifacts repositories create dwg-engine `
  --repository-format=docker `
  --location=europe-west3 `
  --description="MetaPrice DWG Engine images"
```

### 2.2 Internal token belirle

Engine ↔ Backend NestJS arasındaki auth token. Mevcut Render'dakini kullan:

👉 https://dashboard.render.com → `metaprice-dwg-engine` → Environment

`INTERNAL_API_TOKEN` değerini kopyala (gizli, paylaşma!).

Sonra PowerShell'de:
```powershell
$env:INTERNAL_API_TOKEN = "buraya_kopyaladigin_token"
```

### 2.3 Deploy

```powershell
cd c:\Users\basar\projects\emre\backend\src\modules\dwg-engine\python
.\deploy-to-cloudrun.ps1
```

Script şunu yapar:
- Cloud Build üzerinde Docker image build (LibreDWG source compile dahil ~8-12 dk)
- Artifact Registry'ye push
- Cloud Run'a deploy
- Service URL döner: `https://metaprice-dwg-engine-XXXXX-ew.a.run.app`

⚠️ **Service URL'yi not al** — backend update için lazım.

---

## Faz 3: Backend NestJS Update (~2 dakika)

👉 https://dashboard.render.com → `metaprice-api` → Environment

Değiştir:
```
DWG_ENGINE_URL = https://metaprice-dwg-engine-XXXXX-ew.a.run.app
```

(eski: `https://metaprice-dwg-engine.onrender.com`)

`DWG_ENGINE_TOKEN` aynı kalsın (Cloud Run engine'in INTERNAL_API_TOKEN'ı ile eşleşmeli — Faz 2.2'de aynı token kullandık).

**Save** → backend auto-redeploy (~2 dk).

---

## Faz 4: Test (~5 dakika)

### 4.1 Cloud Run health check
```powershell
curl https://metaprice-dwg-engine-XXXXX-ew.a.run.app/health
```

Beklenen: `{"status":"ok","service":"dwg-engine","version":"2.2",...}`

### 4.2 End-to-end test
Tarayıcı → https://metaprice.pages.dev → login → DWG yükle.

Beklenen:
- Upload + status ready (~15-20 sn, cold-start 5-15 sn)
- Workspace açılır, çizim görünür
- Bulk auto-calc başlar → batch'ler işlenir (subprocess izolasyonu artık 2 GB RAM'de çalışır)
- T-noktası tespiti çalışır

---

## Faz 5: Cleanup (opsiyonel)

### 5.1 Render engine'i durdur (isteğe bağlı, $0 ama kapatabilirsin)
👉 https://dashboard.render.com → `metaprice-dwg-engine` → Settings → **Suspend**

Geri açmak için aynı yerden "Resume".

### 5.2 Render backend kal
Backend hala Render'da (free tier yeterli, sadece proxy yapıyor).

---

## Monitoring & Logs

| Ne | Nereden |
|---|---|
| Logs | https://console.cloud.google.com/run → service → Logs tab |
| Memory/CPU metrik | https://console.cloud.google.com/run → service → Metrics tab |
| Billing | https://console.cloud.google.com/billing |
| Free tier usage | https://console.cloud.google.com/billing → "Reports" → filter Cloud Run |

---

## Troubleshooting

### "Permission denied" gcloud submit'te
```powershell
gcloud auth login
gcloud auth configure-docker europe-west3-docker.pkg.dev
```

### Build çok yavaş (>15 dk)
LibreDWG compile + bookworm packages. İlk build uzun, sonrakileri Docker layer cache kullanır (~3 dk).

### Cold-start çok uzun
Cloud Run free tier'da **min-instances=0**. İlk istek 5-15 sn. Hot tutmak için:
- Cron-job.org ile her 5 dk `/health` ping (free) — Render'da denedik aynı pattern
- Veya `min-instances=1` ($5/ay civarı — free tier'i aşar)

### "Out of memory" yine
Cloud Run service edit → Memory: 2 GB → 4 GB. Pricing artar (~$1-2/ay civarı kullanım miktarına göre).

---

## Maliyet beklentisi

| Senaryo | Aylık tahmin |
|---|---|
| MVP/test (~20 DWG/ay) | **$0** (Always Free içinde) |
| Küçük production (~100 DWG/ay) | **$0** (limitlerin sınırında) |
| Orta production (~500 DWG/ay) | ~$5-10 |
| Büyük (~2000 DWG/ay) | ~$25-50 |

Always Free limitleri ayda:
- 2M request
- 400K GB-seconds memory
- 200K vCPU-seconds CPU
