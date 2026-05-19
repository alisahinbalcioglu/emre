# Cloudflare Pages Deploy Setup

Vercel yerine Cloudflare Pages kullanmak için adımlar.

## 1. Cloudflare hesabı

[dash.cloudflare.com](https://dash.cloudflare.com/sign-up) — ücretsiz hesap aç (kredi kartı YOK).

## 2. Pages projesi oluştur

1. Dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. GitHub OAuth → repo seç: `alisahinbalcioglu/emre`
3. Proje adı: `metaprice` (otomatik subdomain: `metaprice.pages.dev`)
4. Production branch: `master`

## 3. Build configuration

| Alan | Değer |
|---|---|
| **Framework preset** | None (Next.js manuel) |
| **Build command** | `npx @cloudflare/next-on-pages@1` |
| **Build output directory** | `.vercel/output/static` |
| **Root directory** | `frontend` |
| **Node version env var** | `NODE_VERSION=20` |

## 4. Environment variables (önemli!)

Settings → Environment variables → **Production**:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://metaprice-api.onrender.com/api` |
| `NODE_VERSION` | `20` |

## 5. Compatibility flags

Settings → Functions → **Compatibility flags** (production):
- `nodejs_compat` (zorunlu — bazı npm paketleri için)

`wrangler.toml`'da zaten yazılı ama Dashboard'tan da set edilmeli.

## 6. Deploy

İlk build otomatik başlar. Sonraki her `git push origin master` → auto-deploy (~2 dk).

## 7. Custom domain (opsiyonel)

Dashboard → metaprice → Custom domains → Add → `metaprice.com.tr` veya istediğin domain.

## Sorun giderme

**Build başarısız: "Cannot find module"**
- Compatibility flag `nodejs_compat` aktif mi?
- Node version env var 20 mi?

**Sayfa açılıyor ama API hata veriyor**
- `NEXT_PUBLIC_API_URL` env var'ı doğru mu?
- Backend (Render) `https://metaprice-api.onrender.com` çalışıyor mu?

**Edge runtime hatası (Node API kullanan paket)**
- `next.config.js`'te `serverComponentsExternalPackages` listesine ekle
- Veya: o route'a `export const runtime = 'nodejs'` ekle
