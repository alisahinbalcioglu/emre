# MetaPrice SaaS

AI destekli mekanik/elektrik tesisat teklif platformu. DWG/DXF planlarindan otomatik metraj, AI ile cap atama, marka fiyat listelerinden teklif uretimi.

## Mimari

| Katman | Stack | Konum |
|--------|-------|-------|
| Frontend | Next.js 14 (App Router) + Tailwind + shadcn/ui + ag-grid + PixiJS | [`frontend/`](frontend/) |
| Backend API | NestJS 10 + Prisma + PostgreSQL + JWT | [`backend/`](backend/) |
| DWG Engine | FastAPI + ezdxf + Anthropic Claude (cap atama) | [`backend/src/modules/dwg-engine/python/`](backend/src/modules/dwg-engine/python/) |
| Deploy | Render (API + Postgres + Python) + Netlify (frontend) | [`render.yaml`](render.yaml), [`netlify.toml`](netlify.toml) |

## Yerel Kurulum

### On Kosullar

- Node.js 20+
- Python 3.11+
- PostgreSQL 16 (Docker onerilir)
- Optional: ODA FileConverter veya `libredwg-tools` (DWG -> DXF donusumu icin; sadece DXF yukleyecekseniz gerek yok)

### Adimlar

```bash
# 1) Backend
cd backend
cp .env.example .env            # DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY doldur
npm install
npx prisma generate
npx prisma migrate dev          # ilk seferde schema'yi DB'ye uygular
npm run start:dev               # http://localhost:3001/api

# 2) DWG Engine (ayri terminal)
cd backend/src/modules/dwg-engine/python
cp .env.example .env            # ANTHROPIC_API_KEY (opsiyonel: INTERNAL_API_TOKEN)
pip install -r requirements.txt
python main.py                  # http://localhost:8011

# 3) Frontend (ayri terminal)
cd frontend
cp .env.example .env.local      # NEXT_PUBLIC_API_URL
npm install
npm run dev                     # http://localhost:3000
```

## Deploy

- **Render Blueprint**: dashboard'da `New + > Blueprint > bu repo` -> `render.yaml` 3 servisi (Postgres + NestJS API + Python engine) tek tikta kurar. `ANTHROPIC_API_KEY` ve `CORS_ORIGINS` dashboard'dan elle set edilir.
- **Netlify**: dashboard'da `New site > Import from Git > bu repo`, base directory `frontend`. `NEXT_PUBLIC_API_URL` Netlify env'ine eklenir (Render API URL + `/api`).
- Branch: `main`. Auto-deploy push'ta tetiklenir.
- Health check: `GET /api/health` -> `{ status: "ok" }`.

## Komutlar

```bash
# Backend
npm run build              # NestJS prod build (dist/main.js)
npm run start:prod         # production server
npm run lint               # tsc --noEmit
npm run test:regression    # matching engine regression suite
npm run prisma:studio      # DB GUI

# Frontend
npm run build              # Next.js prod build
npm run start              # production server
npm run lint               # next lint
```

## Proje Kurallari

Detayli bilgi icin [`CLAUDE.md`](CLAUDE.md) — ozet:

- **Kutuphaneme Aktar**: Marka malzemelerini iskonto + net fiyat ile kullanici kutuphanesine kopyalama.
- **DWG Engine v3**: 4 modullu Python pipeline (geometry, topology, ai_diameter, converter).
- **Windows DLL EPERM hatasi**: `taskkill //F //IM node.exe` kullanma. `npx kill-port 3001` -> `npx prisma db push`.
- **AI scope**: sadece cap atama. Vana/ekipman manuel.

## Lisans

Ozel proje. Tum haklari saklidir.
