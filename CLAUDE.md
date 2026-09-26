# MetaPrice SaaS — Proje Kurallari

## Proje Ozeti
AI destekli mekanik/elektrik tesisat teklif platformu. NestJS backend + Next.js frontend + PostgreSQL (Prisma).

## Ozellik Kurallari

### Kutuphaneme Aktar
- Kullanici "Malzeme Havuzu"ndan istedigini markaya girip fiyat listesindeki malzemeleri "Kutuphaneme Aktar" butonuyla kendi kutuphanesine kopyalayabilir.
- Aktarilan malzemelerde otomatik olarak `listPrice` (liste fiyati) kaynak fiyat listesinden alinir.
- Kutuphanede "Liste Fiyati", "Iskonto (%)" ve "Net Fiyat" sutunlari gosterilir.
- Net Fiyat = Liste Fiyati * (1 - Iskonto / 100)

### Fitting Satiri (teklif gridi)
- Kullanici bos satira adi ("disli fitting orani"), miktar hucresine ORANI (35) ve birim hucresine "%" yazar. Birim "%" olunca ad hucresinde "Σ satir sec" rozeti belirir ve kapsam secim modu acilir.
- Kapsam Ctrl+tik ile secilir; ayni satira tekrar Ctrl+tik cikarir. Baslik, grup bandi, ozet ve baska fitting satirlari secilemez; kapsam ayni sayfa icindedir.
- Tutar = Σ(kapsam satirlarinin Toplam hucresi) × oran / 100 — malzeme ve iscilik AYRI, ayni oranla. Birim fiyat hucresi kapsamin %1'idir (gosterim). Fitting satirinin kendi kar yuzdesi YOKTUR: kapsamin karini tasir (KAR satiri kapsamdan turetilir).
- Kural tek yerde: `frontend/ozellik/fiyat/pricing.ts` (`fittingHesapla`, `fittingKapsaminaAlinabilirMi`); kapsam yardimcilari `frontend/ozellik/tablo/excel-grid/fitting.ts`. Satirda `_fitting: { kapsam: [_rowIdx...] }` alani tasinir; yalniz bu alani tasiyan satir fitting sayilir (eski kayitlardaki birimi "%" olan satirlar etkilenmez).
- Kayit ve Excel ciktisi bu satiri SIRADAN kalem gibi tasir (ad, 35, %, birim fiyat, tutar) — backend'e dokunulmaz.

### Kutuphanede Gruplama
- Malzemeler "Teknik Sinif" bazli gruplanir (`parseMaterialClass` fonksiyonu ile).
- Caplar (1/2, 3/4, 1, 1 1/4...) teknik sirada dizilir (`DIAMETER_ORDER`).
- Gruplar arasi 32px bosluk olur.

### Fiyatlandırılmış Teklif Excel Çıktısı (23.09.2026)
- Tasarım Emre'nin referans dosyasıdır (`MetaPriceX-Teklif-Excel-Yeni-Tasarim-Ornek.xlsx`); kural yeri `backend/src/ozellik/teklif/quotes/`: `standart-cikti.ts` (yazıcı), `cikti-satirlari.ts` (satır planı, saf), `cikti-stil.ts` (görünüm/baskı). İki çıktı yolu (fiyatlı + teklif formatı) AYNI `standartSayfaYaz`'ı kullanır (KF7).
- İlk sekme GENEL TOPLAM (yalnız kalem sayfaları, SAYFA TOPLAMI hücresine tırnaklı adla formül). Kalemsiz sayfa DÜZ METİN (fiyat sütunu ve 0 TL toplam yok). Her sayfada 3 satırlık başlık bloğu; tablo başlığı antetsiz düzende 4., veri 5. satır — antet varsa kayar, hiçbir aralık sabit yazılmaz.
- Kalem = veri satırı + (sayısal miktar YA DA para). Tarifte "yalnız miktar" yazsa da götürü tutarlı satır kalemdir (aksi hâlde parası düşer).
- Tutar hücresi FORMÜL (`IF(E="","",ROUND(C*E,2))`), ama yalnız ekranın rakamını birebir üretiyorsa: uygulamanın yuvarladığı satır `ROUNDUP(…,1)` (yalnız TL, pozitif), boş toplam ekranın tamamlama kuralı (ceil1), dövizde TL'de yuvarlanmış satır / fitting / götürü → DEĞER. Birim fiyat hücresi TAM hassasiyet.
- KARAR (Emre, 23.09 "Excel yeniden hesaplasın"): dosyanın kendi toplamı miktar × birimle TL'de tutmuyorsa Excel çarpımı gösterir, ekran dosyanın rakamını; bu satırlar indirme özetinde SAYILIR. Kayıtlı "0" toplam boş DEĞİLDİR.
- ExcelJS tuzakları (ölçüldü): `cell.value` okuyucusu formül önbelleğindeki 0 ve "" değerini düşürür (model tutar) — önbellek denetimi `cell.model.result`tan okunur. Baskı alanı/tekrar satırı adında sayfa adındaki `'` kaçışlanmaz → o sayfalarda yazılmaz. Kesirli sütunla görsel çapası birim hatalı → piksel ofseti EMU ile verilir.

### DWG — Sprinkler Sembolu ve Bolme (02.09.2026)
- Sprinkler sembolu HERHANGI geometri olabilir: INSERT blok, CIRCLE, LINE capraz, ELLIPSE, HATCH, kapali polyline. Motor sembolu varlik TIPINE gore ELEMEZ — 💧 isaretli katmandaki tum cizim varliklari bbox kesisimiyle kumelenir, kume = 1 sprinkler (`pipe_segments._sprinkler_symbols_from_layers`). Gercek dosyada 743 sembol = 2 LINE + 2 ELLIPSE + 1 HATCH idi, blok/daire YOKTU.
- "T noktalarinda bol" sprinkler'da yalniz katman 💧 ile ISARETLIYSE boler. Isaretsizse motor aday katmanlari OLCER (`sprinkler_candidates`: boru ustundeki sembol sayisi) ve on yuz tostla soyler; karar kullanicinin, otomatik bolme YOK.
- Boyut kapilari birimsizdir (katman medyani x3, boru agi kosegeninin %10'u; blok icin %50). Kullanici birimi yanlis secse de (cm cizime m) bolme ayni sonucu verir.
- INSERT (blok ornegi) TEK BASINA semboldur, komsu bloklarla ASLA birlesmez: kapsama dairesi iceren sprinkler bloklari birbirine biner, kesisim kumelemesi 906 blogu tek dev kumeye zincirleyip kaybediyordu (3. gercek aile). Merkez = ekleme noktasi, yaricap = min(blok yari-kosegeni, komsu araligi/4).
- IC ICE BLOK ACILIR: kendisi YA DA icerigi isaretli katmanda olan INSERT ele alinir. Kucuk yaprak blok atomik (icerigi patlatilmaz). Nested INSERT iceren blok BOYUTLA ayrilir: kosegen < ust duzey komsu araliginin yarisi -> BILESIK sembol (govde+ok+etiket, atomik); ustu -> GRUP (acilir). Agdan buyuk blok KAT'tir, acilir. Katman-'0' icerik ust INSERT'in katmanini alir. Blok icerigi dokumana bagli onbellekte (ad basina bir kez, `_block_locals`), acilim matris bilesimiyle (`M_ic @ M_ust`) — `virtual_entities` KULLANMA (3. ailede 24 sn/cagri olculdu).
- Block-to-Line (isaretsiz otomatik yol) grup bloklarini da acar; kucuk bilesik blogu acmaz (okun anchor'u ikinci bolme uretirdi). Isaretli sembolun yaricapi icindeki INSERT anchor'lari ikinci kez bolunmez (bir sprinkler = bir bolme).
- KAPSAM DISI (bilinen sinirlar): XREF, proxy varlik; boru katmaniyla AYNI katmandaki LINE capraz (kesisim run'i kirar ama kol parcalari gurultu segment olur); isaretli katmanda blok DISI serbest kapsama daireleri (semboller zincirlenir); 2 kafalik KUCUK blok (bilesik sanilir). Yeni bir proje "bolmuyor" derse once bu listeye bak, sonra gercek dosyayi sunucu onbelleginden cek ve OLC (`analyze_dxf_metraj`, `converter.read_dxf`).
- Yerel olcumde DXF'i `converter.read_dxf` ile oku, `ezdxf.readfile` ile DEGIL: LibreDWG ciktisinda Turkce İ mojibake olur ("SPRÄ°NK"), regex eslesmez, olcum yanlis "bos" doner.

### DWG — /parse İptali: İstemci Koparsa Motor İşi Durur (26.09.2026)
- Zincir: tarayıcı `iptalEt` → Caddy arka bağlantıyı kapatır (Go istek bağlamı iptali — ÇIKARIM, canlıda backend'in `istemci koptu` satırıyla doğrulanır) → Nest `istemciKopmaSinyali(res)` (`altyapi/http/istemci-koptu.ts`: `res` 'close' + `writableFinished`; `req.on('close')` DEĞİL — Node 16+ onu gövde okununca yayar, denetleyicide kurulan dinleyici hiç tetiklenmez) → motor fetch'i `AbortSignal.any([zaman aşımı, istemciKoptu])` → motorun `request.receive()` bekçisi `http.disconnect` görür → `parse_worker` alt süreci öldürülür (≤250 ms).
- Ölçüm (yerel, 4 E-çekirdek, 34 sn'lik ayırma, gerçek denetleyici + gerçek motor): ÖNCE 3. saniyede kesilen ayırma 44-48 sn daha koştu (tam CPU), yeni istek %51-63, üç hızlı birim değişiminde %142-159 uzadı. SONRA alt süreç kopmadan ~50 ms sonra öldü, yeni istek taban süresinde (34 sn). Yalnız backend kesmek YETMEZ: motor alt süreci yine sonuna kadar koşturur (ara ölçüm).
- Tuzaklar (ölçüldü): motorda `request.is_disconnected()` `@app.middleware("http")` altında kopmayı GÖRMEZ → `receive()` bekçisi. undici 7 (Node 24), ÖNCEDEN iptal edilmiş sinyal + FormData gövdeyle çağrılan fetch'te reddin üstüne YAKALANMAMIŞ istisna atar (süreç düşer; canlıdaki Node 20.20.2 / undici 6.24.1'de olmuyor) → iptal edilmiş sinyalle fetch ÇAĞRILMAZ (Node yükseltmesinde de güvende). Node 20'de `AbortSignal.any` kaynağı ZAYIF tutar: undici dinleyicisi birleşik sinyalde olunca `AbortSignal.timeout` GC'de toplanır, zaman aşımı HİÇ tetiklenmez → zaman aşımı sinyaline boş `abort` dinleyicisi eklenir (canlı Node 20.20.2'de ölçüldü; Node 24 göstermez — kapı Z GC zorlar). Python 3.11 POSIX `communicate(input=…, timeout=…)` yeniden denemede kalan girdiyi YAZMAZ, stdin'i kapatmaz → işçi takılır → girdi döngüden ÖNCE `stdin.write` ile yazılır (canlı motor imajında ölçüldü; Windows ve 3.14 bu hatayı göstermez).
- KARAR: "aynı dosya için yeni istek gelince eskiyi kes" kuralı YOK. Kopma sinyali kesindir ("bu sonucu bekleyen kalmadı"), anahtar kuralı tahmindir: file_id anahtar olursa aynı dosyanın başka katmanı, başka sekme ya da ekip üyesi öldürülür; motor kullanıcıyı/sekmeyi bilmez; WORKERS>1'de süreç içi kayıt yetmez. Kopma iletilmeyen bir yol bulunursa kesmenin yeri NestJS'tir (kullanıcıyı bilir; (kullanıcı, file_id, katman) anahtarıyla eskinin AbortController'ını keser, motor gerisini kopmayla halleder).
- Sınır: alt süreç bittikten SONRA gelen kopmada sonuç yine JSON'a çevrilir (küçük maliyet). `/upload` arka plan işi isteğe bağlı değildir, kesilmez; `/geometry` süreç içidir (iş parçacığı havuzunda), kesilemez (birim değişiminde yeniden istenmez). Kalan asıl maliyet: her `/parse` yeni süreçte DXF'in TAMAMINI yeniden okur — birim değişimini hızlandırmanın kaldıracı bu (ayrı iş).
- Kapılar: `test:dwg-istemci-koptu` (regresyon paketinde) · `python/tests/test_parse_iptal.py` (pytest, CI'da YOK — elle koşulur).

### DWG Motoru — Olay Döngüsünde Ağır İş Yok (26.09.2026)
- Motor TEK uvicorn işçisiyle (WORKERS=1) tüm kiracılara hizmet eder. `async def` uç (ve ara katman, bekçi) gövdesinde DWG→DXF dönüşümü, ezdxf okuması, alt süreç ya da uyku BEKLENMEZ — ağır iş alt sürece (`upload_worker` / `parse_worker`) gider, alt süreç `asyncio.to_thread` içinde beklenir. Yeni uç gerekiyorsa `def` (iş parçacığı havuzu) ya da bu desen.
- KALDIRILDI: `POST /layers`, `POST /convert`, dosya gövdeli (file_id'siz) `/parse` — hem Nest (`/api/dwg-engine/*`) hem motor. Dönüşümü döngüde yapıyorlardı: oturumlu tek istek motoru 120 sn'ye kadar dondurabiliyordu (ölçüldü: 3 sn'lik taklit dönüşümde `/health` 3,15 sn bekledi). Kullanım önce ÖLÇÜLDÜ: ön yüz 21.05'ten beri yalnız `/upload` + file_id; kalıcı `/tmp` biriminde 04.07'den beri tek `dwg2dxf_*` artığı yok (bu yollar her DWG dönüşümünde bırakırdı); 28.08'den beri 7 DwgDosya kaydının 7'si `/upload`.
- `/parse` yalnız file_id alır (yoksa 400); Nest'te dosya alıcısı (multer, 1 GB bellek) YOK, motora boş form gider. Gövde işlenmez ama AKITILIR (`res.req.resume()`): okunmayan gövde yüksek su işaretini (16 KiB) aşınca Node soketi okumayı bırakıp istemcinin kopuşunu GÖRMÜYORDU — iptal zinciri yalnız küçük gövdede çalışırdı (ölçüldü: Node 24 ve canlı Node 20.20.2, kapı B). `DwgSahiplikServisi.dogrula` kimliksiz isteğe 403 — savunma katmanı; bugünkü çağıranlar id'yi önceden eler (eskiden "gövdeden geliyor" diye sorgusuz geçiyordu).
- BİLİNEN SINIRLAR (döngüde, boyutla orantılı; yerel ölçüm): `/upload` gövdenin sha256'sı + diske yazımı (60 MB ~250 ms, 200 MB ~1 sn; Nest sınırı 1 GB) · `/parse` sonucunun `json.dumps`'ı ve GZip seviye 9 sıkıştırması (`/parse` + `/geometry` yanıtları; 14 MB JSON ~1 sn + ~0,8 sn — canlıda geometri JSON'u 11 MB, her proje açılışında). `/geometry` `def` uçtur (döngüde değil) ama önbellek yoksa ya da `layers` süzgeci verilirse DXF'i SÜREÇ İÇİNDE ezdxf ile okur: GIL döngüyle paylaşılır, paralel istek motoru yavaşlatır/OOM. Ayrı iş.
- Kapılar: `python/tests/test_olay_dongusu.py` (pytest, CI'da YOK — D1-D3 uçtan uca taklit `dwg2dxf`/işçiyle; D4 AST: modül düzeyindeki her `async def` gövdesinde ağır çağrı — ad, öznitelik (`ezdxf.readfile`), takma ad, main.py yardımcısı ya da doğrudan çağrılan iç def/lambda üzerinden — `def` uçlara BAKMAZ) · `test:dwg-istemci-koptu` E (eski yollar motora hiç gitmez) + B (büyük gövdede kopma) blokları, regresyonda.

## Hata Yonetimi

### Windows DLL (EPERM) Hatasi
Prisma veya Node.js EPERM/EBUSY hatasi alirsan:
- ASLA `taskkill //F //IM node.exe` calistirma — bu TUM servisleri oldurur!
- Sadece ilgili portu kapat: `npx kill-port 3000` veya `npx kill-port 3001`
- Sonra `npx prisma db push` ile devam et

## CI ve Deploy Kurali (14.09.2026)
- **Kirmizi CI kosumuyla deploy EDILMEZ.** Deploy'dan once o commit'in GitHub Actions `regression-gate` kosumu yesil olmali. Depo acik; kosum durumu girissiz okunur: `https://api.github.com/repos/alisahinbalcioglu/emre/actions/runs?head_sha=<40 haneli sha>`.
- **Kararsiz test "bazen dusuyor" diye BIRAKILMAZ.** Ya duzeltilir ya da devre disi birakilip ADIYLA kaydedilir: `backend/test/regression-all.ts` SUITES'ten cikarilir, `backend/test/manifest-kapisi.ts` ISTISNALAR listesine gerekce + tarihle yazilir (manifest kapisi gerekcesiz cikarmayi reddeder). Kirmiziyi anlamsizlastiran test kapiyi curutur: insanlar kirmiziyi gormezden gelmeye baslar.
- Vaka: `eb424f3` (14.09) master kosumu (34831257774) "Tek regresyon paketi" adiminda kirmiziydi ve yine de canliya cikti. Gunluk girissiz okunamadi; en guclu aday Faz 6 `W21f` (kapi komutuyla 20 kosumda 3 dustu).
- Kararsizlik kaniti kapinin KENDI komutuyla alinir (`npm run test:<x>`). `ts-node --transpile-only` zamanlamayi degistirir: ayni test onunla 20/20 yesil, kapi komutuyla 20'de 3 dustu.

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
