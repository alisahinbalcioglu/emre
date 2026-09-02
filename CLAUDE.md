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

### DWG — Sprinkler Sembolu ve Bolme (02.09.2026)
- Sprinkler sembolu HERHANGI geometri olabilir: INSERT blok, CIRCLE, LINE capraz, ELLIPSE, HATCH, kapali polyline. Motor sembolu varlik TIPINE gore ELEMEZ — 💧 isaretli katmandaki tum cizim varliklari bbox kesisimiyle kumelenir, kume = 1 sprinkler (`pipe_segments._sprinkler_symbols_from_layers`). Gercek dosyada 743 sembol = 2 LINE + 2 ELLIPSE + 1 HATCH idi, blok/daire YOKTU.
- "T noktalarinda bol" sprinkler'da yalniz katman 💧 ile ISARETLIYSE boler. Isaretsizse motor aday katmanlari OLCER (`sprinkler_candidates`: boru ustundeki sembol sayisi) ve on yuz tostla soyler; karar kullanicinin, otomatik bolme YOK.
- Boyut kapilari birimsizdir (katman medyani x3, boru agi kosegeninin %10'u; blok icin %50). Kullanici birimi yanlis secse de (cm cizime m) bolme ayni sonucu verir.
- INSERT (blok ornegi) TEK BASINA semboldur, komsu bloklarla ASLA birlesmez: kapsama dairesi iceren sprinkler bloklari birbirine biner, kesisim kumelemesi 906 blogu tek dev kumeye zincirleyip kaybediyordu (3. gercek aile). Merkez = ekleme noktasi, yaricap = min(blok yari-kosegeni, komsu araligi/4).
- IC ICE BLOK ACILIR: kendisi YA DA icerigi isaretli katmanda olan INSERT ele alinir. Kucuk yaprak blok atomik (icerigi patlatilmaz). Nested INSERT iceren blok BOYUTLA ayrilir: kosegen < ust duzey komsu araliginin yarisi -> BILESIK sembol (govde+ok+etiket, atomik); ustu -> GRUP (acilir). Agdan buyuk blok KAT'tir, acilir. Katman-'0' icerik ust INSERT'in katmanini alir. Blok icerigi dokumana bagli onbellekte (ad basina bir kez, `_block_locals`), acilim matris bilesimiyle (`M_ic @ M_ust`) — `virtual_entities` KULLANMA (3. ailede 24 sn/cagri olculdu).
- Block-to-Line (isaretsiz otomatik yol) grup bloklarini da acar; kucuk bilesik blogu acmaz (okun anchor'u ikinci bolme uretirdi). Isaretli sembolun yaricapi icindeki INSERT anchor'lari ikinci kez bolunmez (bir sprinkler = bir bolme).
- KAPSAM DISI (bilinen sinirlar): XREF, proxy varlik; boru katmaniyla AYNI katmandaki LINE capraz (kesisim run'i kirar ama kol parcalari gurultu segment olur); isaretli katmanda blok DISI serbest kapsama daireleri (semboller zincirlenir); 2 kafalik KUCUK blok (bilesik sanilir). Yeni bir proje "bolmuyor" derse once bu listeye bak, sonra gercek dosyayi sunucu onbelleginden cek ve OLC (`analyze_dxf_metraj`, `converter.read_dxf`).
- Yerel olcumde DXF'i `converter.read_dxf` ile oku, `ezdxf.readfile` ile DEGIL: LibreDWG ciktisinda Turkce İ mojibake olur ("SPRÄ°NK"), regex eslesmez, olcum yanlis "bos" doner.

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
