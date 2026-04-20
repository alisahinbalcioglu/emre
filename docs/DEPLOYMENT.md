# Deployment Rehberi — Netlify + Render

> Hedef: Frontend Netlify'da, NestJS + PostgreSQL + Python engine Render'da.
> Blueprint: `render.yaml` (kök). Netlify config: `netlify.toml` (kök).

---

## 0. Ön hazırlık (ÖNCE YAP)

### 0.1 API key rotate et — KRİTİK
Geçmiş `.env` dosyasında Anthropic API key commit olmadı ama paylaşılmış olabilir:

1. [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) → eski key'i **Revoke**
2. **Create Key** → yeni key oluştur
3. Yeni key'i güvenli bir yerde tut (1Password, Bitwarden) — deploy sırasında kullanılacak

### 0.2 JWT secret üret
Local `.env` için güçlü bir secret üret:
```bash
openssl rand -base64 48
```
Render'da zaten otomatik üretilecek (`generateValue: true`).

### 0.3 Repo hazırlığı
- [x] `render.yaml` kökte
- [x] `netlify.toml` kökte
- [x] `backend/.env.example` güncel
- [x] `backend/src/modules/dwg-engine/python/.env.example` güncel
- [x] `.env` dosyaları `.gitignore`'da (kontrol et: `git ls-files | grep -i env`)

---

## 1. Render — Backend + DB + Python Engine

### 1.1 Blueprint oluştur
1. [dashboard.render.com](https://dashboard.render.com) → giriş yap
2. **New** → **Blueprint**
3. **Connect** → GitHub'dan `alisahinbalcioglu/emre` repo'sunu seç (yetki iste)
4. Branch: `master`
5. **Apply** → Render `render.yaml`'ı okur, 3 servis + 1 DB ayar önerir
6. **Create** → kurulum başlar (~5–10 dk)

### 1.2 Environment değişkenlerini doldur

Render 3 `sync: false` değişkeni otomatik dolduramaz — dashboard'dan gir:

| Servis | Key | Değer |
|--------|-----|-------|
| `metaprice-dwg-engine` | `ANTHROPIC_API_KEY` | Yeni rotate ettiğin key |
| `metaprice-api` | `ANTHROPIC_API_KEY` | Aynı key |
| `metaprice-api` | `CORS_ORIGINS` | Netlify deploy sonrası doldur (aşağıda) |

Render **her servis için** Settings → Environment → Add variable.

### 1.3 Deploy sırasını kontrol et
Servislerin deploy sırası:
1. `metaprice-db` (Postgres) — ~1 dk
2. `metaprice-dwg-engine` (Python) — pip install + uvicorn, ~3 dk
3. `metaprice-api` (NestJS) — npm install + prisma + build, ~5 dk

Logs'ları takip et:
- API'da `MetaPrice API running on http://localhost:10000/api` çıkmalı
- Python'da `Uvicorn running on http://0.0.0.0:10000` çıkmalı

### 1.4 URL'leri not al
Deploy bitince Render sana 2 public URL verir:
- `https://metaprice-api-xxxx.onrender.com` → NestJS
- `https://metaprice-dwg-engine-xxxx.onrender.com` → Python (internal kullanım için)

API URL'sinin sonuna `/api` eklenir → frontend config'e yazılacak.

---

## 2. Netlify — Frontend

### 2.1 Site oluştur
1. [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
2. GitHub → `alisahinbalcioglu/emre` repo'sunu seç
3. Branch: `master`
4. Netlify otomatik `netlify.toml` okur → build ayarları dolu gelir
5. **Deploy site** → ilk build ~3 dk

### 2.2 Environment variable ekle
Site settings → Environment variables → **Add a variable**:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | `https://metaprice-api-xxxx.onrender.com/api` (Render API URL + `/api`) |

**Değişiklikten sonra Deploys → Trigger deploy → Clear cache and deploy** gerekli (env'in bundle'a girmesi için).

### 2.3 URL'i not al
Netlify sana verir: `https://random-name-xxxx.netlify.app`

Custom domain istersen: Site settings → Domain management → Add custom domain.

---

## 3. CORS Bağlama (zincir tamamlama)

Frontend deploy olunca Render API'ye Netlify URL'sini tanıt:

1. Render → `metaprice-api` → Environment → `CORS_ORIGINS` değişkenini düzenle
2. Değer: `https://random-name-xxxx.netlify.app`
   (custom domain varsa onu da virgülle ekle: `https://app.netlify.app,https://metaprice.com`)
3. Save changes → Render otomatik re-deploy eder

---

## 4. Veritabanı migration

İlk deploy'da `npx prisma migrate deploy` otomatik çalıştı. Yeni migration eklersen:
1. Lokalde `npx prisma migrate dev --name açıklama`
2. Git commit + push
3. Render API re-deploy olur → migration otomatik uygulanır

Seed data lazımsa: bir kerelik Render Shell → `npx prisma db seed` (Starter tier gerekir).

---

## 5. Sağlık kontrolü (deploy sonrası)

### Backend
```bash
curl https://metaprice-api-xxxx.onrender.com/api
# Beklenti: 404 Not Found (home route tanımlı değil — servis sağlıklı)
```

### Python engine
```bash
curl https://metaprice-dwg-engine-xxxx.onrender.com/health
# Beklenti: {"status": "ok"} veya benzeri 200

curl -H "X-Internal-Token: test" https://metaprice-dwg-engine-xxxx.onrender.com/layers
# Beklenti: 401 Unauthorized — token auth çalışıyor demek
```

### Frontend
- `https://xxx.netlify.app` aç → login sayfası gelmeli
- Login → dashboard → bir DWG yükle → viewer WebGL etiketi göstermeli

---

## 6. Free Tier Gerçekleri & Production Yol Haritası

| Sorun | Free davranış | Çözüm |
|-------|---------------|-------|
| İlk istek yavaş | Web servis 15dk idle sonra uyur, ~60s soğuk kalkış | Starter tier ($7/ay/servis) — always-on |
| DB silinir | Postgres 30 gün sonra expire | **Günde 1 backup al** (manual) veya Starter'a geç |
| RAM darlığı | 512 MB / servis | Puppeteer/Chromium bellek kullanıyorsa risk |
| Uzun request | 30s timeout | Büyük DWG parse 5dk — free'de timeout yiyebilir |

Starter yapacağın ilk anda:
- `render.yaml` içinde her `plan: free` → `plan: starter`
- Postgres Starter ($7/ay, 1GB, kalıcı)
- Python'u `type: web` → `type: pserv` yap (Private Service — public URL kapanır)
- Blueprint'i re-apply et

---

## 7. Monitoring

### Render
- Her servis → Metrics: CPU, memory, response time
- Logs: live + son 7 gün (free)
- Alerts: Settings → Notifications (email/slack webhook)

### Netlify
- Analytics: Site overview → Analytics tab
- Forms/Functions: kullanılmıyor
- Build logs: her deploy için detaylı

### Observability önerisi (ileride)
- Sentry (frontend + backend hata takibi)
- Render Logtail entegrasyonu
- Uptime monitoring: [uptimerobot.com](https://uptimerobot.com) ücretsiz 5dk ping

---

## 8. Sık karşılaşılan sorunlar

### "Module not found: prisma" build hatası
Build command'da `npx prisma generate` eksik olabilir. `render.yaml`'da:
```yaml
buildCommand: npm install && npx prisma generate && npm run build
```

### NestJS Render'da 502 Bad Gateway
Port dinlemesi yanlış. `main.ts`'de `process.env.PORT` okumalı (zaten okuyor).

### Python build "ezdxf not found"
`requirements.txt` Python `rootDir`'ında olmalı (var). `PYTHON_VERSION: "3.11"` set edildi (var).

### CORS error frontend'de
`CORS_ORIGINS` Render env'de set mi? Netlify URL exact match mi? (slash sonundaki `/` önemli — `https://foo.netlify.app` ile `https://foo.netlify.app/` farklıdır).

### Next.js image 404 / ISR çalışmıyor
`@netlify/plugin-nextjs` plugin'i aktif mi? `netlify.toml` içinde yazılı, otomatik kurulur.

### `NEXT_PUBLIC_API_URL` değişti ama frontend hala eski URL'i çağırıyor
Netlify build-time env — değiştikten sonra **Clear cache + deploy** şart. Runtime update yok.

---

## 9. Scaling (binlerce kullanıcı noktası)

Free → Starter geçince ilk öncelikler:
1. **Postgres connection pool** — Prisma `DATABASE_URL` sonuna `?connection_limit=10&pool_timeout=20` ekle
2. **Redis cache** (Render Redis Starter $10/ay) — `/geometry` endpoint cache
3. **NestJS cluster mode** — PM2 veya node `cluster` ile multi-process
4. **CDN** — Netlify global CDN zaten dahil. API için Cloudflare opsiyonel
5. **Database read replicas** — trafik büyüdüğünde (Pro tier)
6. **Frontend bundle split** — PixiJS dinamik import (`ssr: false`) kritik yolda değilse
7. **Rate limiting** — `@nestjs/throttler` ekle, IP başına 100 req/dk vs
