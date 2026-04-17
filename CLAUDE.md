# MetaPrice SaaS — Proje Kurallari

## Proje Ozeti
AI destekli mekanik/elektrik tesisat teklif platformu. NestJS backend + Next.js frontend + PostgreSQL (Prisma).

## Ozellik Kurallari

### Kutuphaneme Aktar
- Kullanici "Malzeme Havuzu"ndan istedigini markaya girip fiyat listesindeki malzemeleri "Kutuphaneme Aktar" butonuyla kendi kutuphanesine kopyalayabilir.
- Aktarilan malzemelerde otomatik olarak `listPrice` (liste fiyati) kaynak fiyat listesinden alinir.
- Kutuphanede "Liste Fiyati", "Iskonto (%)" ve "Net Fiyat" sutunlari gosterilir.
- Net Fiyat = Liste Fiyati * (1 - Iskonto / 100)

### Kutuphanede Gruplama
- Malzemeler "Teknik Sinif" bazli gruplanir (`parseMaterialClass` fonksiyonu ile).
- Caplar (1/2, 3/4, 1, 1 1/4...) teknik sirada dizilir (`DIAMETER_ORDER`).
- Gruplar arasi 32px bosluk olur.

## Hata Yonetimi

### Windows DLL (EPERM) Hatasi
Prisma veya Node.js EPERM/EBUSY hatasi alirsan:
- ASLA `taskkill //F //IM node.exe` calistirma — bu TUM servisleri oldurur!
- Sadece ilgili portu kapat: `npx kill-port 3000` veya `npx kill-port 3001`
- Sonra `npx prisma db push` ile devam et

## Tech Stack
- **Backend**: NestJS, Prisma, PostgreSQL, JWT auth
- **Frontend**: Next.js 13+ (App Router), Tailwind CSS, shadcn/ui
- **AI**: Claude/Gemini/OpenRouter (PDF malzeme ayiklama)

## Dizin Yapisi
- `backend/prisma/schema.prisma` — DB sema
- `backend/src/library/` — Kutuphane API
- `backend/src/brands/` — Marka + fiyat listesi API
- `frontend/app/(protected)/materials/[brandId]/page.tsx` — Marka detay sayfasi
- `frontend/app/(protected)/library/page.tsx` — Kutuphane sayfasi
