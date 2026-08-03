# RAPOR — HARİTA SINIFLANDIRMA · TAM TUR (HS1-HS12)

**Tarih:** 02-03.08.2026 · **Görev:** `GOREV_Harita_Siniflandirma_Tam.md` · **Hedef:** bekleyenler 269 → 0
**Sınır:** kod TAŞINMADI, ürün koduna dokunulmadı, hiçbir şey silinmedi, canlıya dokunulmadı, FAZ 2 soruları açılmadı.

> Çıkış kodu sözleşmesi: **0 = PASS · 2 = ÖN KOŞUL YOK · diğer = FAIL.**

---

## HS1 · Bağımlılık sıralaması — üreteçten, elle sayma yok

**Yöntem:** Girdi tamamen otomatik katman (`KOD_HARITASI_OTOMATIK.md`, `scripts/harita-uret.mjs` çıktısı): §1 dosya+satır tablosu, §2 import tablosu. Görece (`./`, `../`) ve alias (`@/` → `frontend/`) importlar dosya kümesine çözülüp giren-derece sayıldı; paket importları sayılmadı. Çözücü betik oturum scratchpad'inde (`hs1-siralama.mjs`); **çıkış kodu 0**. Çözülemeyen görece import: 3 (üçü de `.css` — kod uzantısı değil, kapsam dışı).

**En çok import edilen ilk 20 (giren-derece):**

| # | ← | Dosya |
|---|---|---|
| 1 | 34 | `frontend/lib/api.ts` |
| 2 | 30 | `frontend/hooks/use-toast.ts` |
| 3 | 22 | `frontend/components/ui/button.tsx` |
| 4 | 22 | `frontend/lib/utils.ts` |
| 5 | 20 | `backend/src/prisma/prisma.service.ts` |
| 6 | 19 | `frontend/components/ui/card.tsx` |
| 7 | 17 | `frontend/hooks/use-confirm.ts` |
| 8 | 16 | `backend/src/modules/excel-grid/excel-grid.service.ts` |
| 9 | 16 | `backend/src/modules/matching/terminology.service.ts` |
| 10 | 15 | `backend/src/auth/guards/jwt-auth.guard.ts` |
| 11 | 15 | `backend/src/modules/matching/matching.service.ts` |
| 12 | 15 | `frontend/components/ui/input.tsx` |
| 13 | 10 | `backend/src/modules/matching/index/product-index.ts` |
| 14 | 10 | `frontend/components/excel-grid/types.ts` |
| 15 | 10 | `frontend/components/ui/label.tsx` |
| 16 | 10 | `frontend/e2e-golden/artefakt-dizini.cjs` |
| 17 | 9 | `backend/src/modules/matching/conversion.ts` |
| 18 | 9 | `backend/src/modules/matching/normalizer.ts` |
| 19 | 8 | `backend/src/prisma/prisma.module.ts` |
| 20 | 8 | `frontend/components/dwg-metraj/types.ts` |

**En uzun ilk 20 (satır):**

| # | Satır | Dosya |
|---|---|---|
| 1 | 2729 | `frontend/components/excel-grid/ExcelGrid.tsx` |
| 2 | 2293 | `frontend/app/(protected)/quotes/new/page.tsx` |
| 3 | 2011 | `frontend/components/dwg-viewer/DxfCanvasViewer.tsx` |
| 4 | 1554 | `backend/src/modules/dwg-engine/python/main.py` |
| 5 | 1509 | `backend/test/index-engine-test.ts` |
| 6 | 1440 | `backend/src/admin/admin.service.ts` |
| 7 | 1061 | `backend/src/modules/excel-grid/excel-grid.service.ts` |
| 8 | 1051 | `backend/src/modules/dwg-engine/python/pipe_segments.py` |
| 9 | 1013 | `frontend/components/dwg-workspace/DwgProjectWorkspace.tsx` |
| 10 | 924 | `backend/src/modules/matching/matching.service.ts` |
| 11 | 869 | `frontend/app/admin/brands/page.tsx` |
| 12 | 860 | `backend/src/labor-firms/labor-firms.service.ts` |
| 13 | 836 | `frontend/e2e-golden/verify.mjs` |
| 14 | 825 | `backend/src/ai/ai.service.ts` |
| 15 | 757 | `backend/src/modules/dwg-engine/python/geometry.py` |
| 16 | 710 | `backend/test/matching-unit-test.ts` |
| 17 | 658 | `backend/src/modules/matching/normalizer.ts` |
| 18 | 653 | `backend/src/library/library.service.ts` |
| 19 | 638 | `frontend/app/(protected)/materials/[brandId]/page.tsx` |
| 20 | 632 | `backend/src/modules/matching/index/query-engine.ts` |

**Taşıyıcı küme (birleşim): 37 dosya** — 6'sı geçen turlarda zaten haritada (`admin.service.ts` · `library.service.ts` · `matching.service.ts` · `product-index.ts` · `query-engine.ts` · `ExcelGrid.tsx`), 31'i bu turda okunup sınıflandırıldı (HS2).

---

## HS2 · Taşıyıcı küme sınıflandırması (37 dosya — hepsi OKUNARAK)

Grup tanımlarının okunduğu yer: `KOD_HARITASI.md` — A:47 · B:68 · C:92 · D:117 · E:138 · F:158 · G:176 · H:195 · I:224. 31 dosya bu turda 6 paralel okuyucuyla açıldı (her satırda okunan aralık + karar veren semboller kayıtlı); 6 dosya önceki turlarda zaten okunmuş ve haritadaydı.

| Dosya | Ne yapıyor | Grup |
|---|---|---|
| `backend/src/modules/dwg-engine/python/geometry.py` | DXF çizim öğelerini viewer'ın çizebileceği koordinat listesine çevirir | **J** (yeni — HS3) |
| `backend/src/modules/dwg-engine/python/main.py` | DWG yükleme, DXF dönüşümü, layer/metraj/geometri servislerini HTTP'den sunan FastAPI uygulaması | **J** |
| `backend/src/modules/dwg-engine/python/pipe_segments.py` | Boru çizgilerini kesişim/T-noktası/sprinkler konumlarından bölüp işaretlenebilir hat parçaları üretir | **J** |
| `frontend/components/dwg-viewer/DxfCanvasViewer.tsx` | Çizim geometrisini Canvas2D'de çizer; pan/zoom, hit-test, silgi, çap-renkli vurgu | **J** |
| `frontend/components/dwg-workspace/DwgProjectWorkspace.tsx` | Layer seçip tıkla-etiketle çap atayan, ekipman işaretleyen, metrajı onaylatan akışı yönetir | **J** |
| `frontend/components/dwg-metraj/types.ts` | Boru segmenti, çap, layer agregesi, ekipman ve metraj sonucu veri tipleri | **J** |
| `backend/src/modules/matching/conversion.ts` | Çelik/plastik borularda DN-inç-mm çap eşdeğerlerini tablolarla çevirir | C |
| `backend/src/modules/matching/normalizer.ts` | Türkçe/unicode metni normalleştirir; satırdan çap, yüzey, bağlantı, PN etiketleri çıkarır | C |
| `backend/src/modules/matching/terminology.service.ts` | Takma adları malzeme ailesine çevirir; kullanıcı alias'larını öğrenip saklar | C |
| `backend/src/modules/excel-grid/excel-grid.service.ts` | Yüklenen xlsx'i sayfa sayfa ayrıştırıp kolon rollerini içerikten tespit eder | A |
| `backend/src/ai/ai.service.ts` | PDF/Excel içeriğinden LLM'lerle malzeme satırları ve sütun rolleri çıkarır | A |
| `backend/src/auth/guards/jwt-auth.guard.ts` | JWT stratejisini endpoint koruması olarak devreye sokan guard | **L** (yeni — HS3) |
| `backend/src/prisma/prisma.module.ts` | DB erişim servisini tüm uygulamaya global sağlayan modül tanımı | **L** |
| `backend/src/prisma/prisma.service.ts` | PrismaClient'ı yaşam döngüsüne bağlayıp bağlantıyı açan-kapatan sarmalayıcı | **L** |
| `backend/src/labor-firms/labor-firms.service.ts` | Kullanıcının işçilik firmalarını ve fiyat listelerini sahiplik kontrolüyle yönetir | G |
| `frontend/app/(protected)/materials/[brandId]/page.tsx` | Marka fiyat listelerini gösterir, kütüphaneye aktarır, admin Excel düzenleyici açar | G |
| `frontend/app/admin/brands/page.tsx` | Global havuz CRUD'u: marka/liste/malzeme + iki fazlı Excel içe aktarım önizlemesi | G |
| `frontend/app/(protected)/quotes/new/page.tsx` | Teklif oluşturma akışının tamamını tek sayfada yürüten orkestratör (yükleme→grid→eşleştirme→fiyat→kayıt→export) | B* |
| `frontend/components/excel-grid/types.ts` | Grid kolon tanımı, satır meta alanları, kolon rolleri, aday/marka tipleri | B |
| `backend/test/index-engine-test.ts` | İndeksli motorun K1-K7 kabulünü gerçek indeksleyiciyle DB'siz doğrular | H |
| `backend/test/matching-unit-test.ts` | bulkMatch akışını fake Prisma + gerçek seed'lerle uçtan uca DB'siz test eder | H |
| `frontend/components/ui/button.tsx` | Varyant/boyut seçenekli genel tıklama bileşeni | **K** (yeni — HS3) |
| `frontend/components/ui/card.tsx` | Başlık/içerik/alt bölümlü kutu düzeni parçaları | **K** |
| `frontend/components/ui/input.tsx` | Ref iletimli standart metin giriş kutusu | **K** |
| `frontend/components/ui/label.tsx` | Form alanlarına erişilebilir etiket bağlayan sarmalayıcı | **K** |
| `frontend/hooks/use-confirm.ts` | Tıklanan noktada açılan Promise tabanlı onay popover'ı | **K** |
| `frontend/hooks/use-toast.ts` | Bildirim mesajlarının yaşam döngüsünü yöneten reducer | **K** |
| `frontend/lib/api.ts` | JWT ekleyen, 401'de oturumu temizleyip girişe yönlendiren merkezi HTTP istemcisi | **K** |
| `frontend/lib/utils.ts` | Tailwind sınıf birleştirme (cn) + sayı biçimleme yardımcıları | **K** |
| `frontend/e2e-golden/artefakt-dizini.cjs` | Her E2E koşumuna damgalı artefakt dizini açar, latest işaretçisini günceller | H |
| `frontend/e2e-golden/verify.mjs` | E2E artefaktlarını bağımsız yeniden hesaplayıp C1-C11 PASS/FAIL matrisi üretir | H |
| `backend/src/admin/admin.service.ts` | *(önceki turdan haritada — G)* içe aktarım/indeks çift-yazımı + reindex | G |
| `backend/src/library/library.service.ts` | *(önceki turdan haritada — G)* kütüphaneye yazan tek dosya, 4 yol | G |
| `backend/src/modules/matching/matching.service.ts` | *(önceki turdan haritada — C)* havuz kurulumu + üç durumlu hazırlık | C |
| `backend/src/modules/matching/index/product-index.ts` | *(önceki turdan haritada — C)* rowKey/indeks üretici | C |
| `backend/src/modules/matching/index/query-engine.ts` | *(önceki turdan haritada — C)* sorgu motoru | C |
| `frontend/components/excel-grid/ExcelGrid.tsx` | *(önceki turdan haritada — B)* ana tablo bileşeni | B |

\* `quotes/new/page.tsx`: okuyucu "UYMUYOR — orkestratör, A/B/C/D/E/F hepsine dokunuyor" dedi (orta güven). Sentez hükmü: B — grubun tanımı "satırların düzenlendiği ana ekran" (`KOD_HARITASI.md:71`) tam bu sayfadır ve harita zaten `:1565` satırıyla bu dosyayı B'de anıyor. Çok-gruba-dokunma notu satırında saklı; bu bir BELİRSİZ değil, bilinen bir orkestratör.

---

## HS3 ★ · TAKSONOMİ KONTROL NOKTASI — HÜKÜM

**Mevcut A-I kümesi YETMEDİ.** 31 okunan taşıyıcının 17'si hiçbir gruba oturmadı ve üç net temada kümelendi. Şu **dört grup burada ilan edilir**, şema bundan sonra **DONDURULMUŞTUR** (HS4 yalnız bu şemayı kullanır; yolda sessiz genişletme yok):

| Grup | Ad | Tanım | Gerekçe |
|---|---|---|---|
| **J** | **DWG-METRAJ** | İkinci ürün hattı: DWG/DXF yükleme ve dönüşüm (Python motoru), çizim görüntüleme, tıkla-etiketle çap atama, boru segmentasyonu/topoloji, ekipman işaretleme, metraj çıkarımı ve Excel'e metraj ihracı. | Projenin iki bel kemiğinden biri (DWG→boru/çap); harita yalnız Excel hattını gruplamıştı. 6/37 taşıyıcı buraya düştü, hiçbirinin evi yoktu. |
| **K** | **ORTAK UI, KABUK ve İSTEMCİ ALTYAPISI** | Uygulama geneli arayüz primitifleri (ui/*), genel hook'lar (toast/confirm), merkezi HTTP+auth istemcisi, layout/navigasyon/kabuk sayfaları (login, register, profil, dashboard), frontend context'leri. | 8/37 taşıyıcı buraya düştü; bunlar hiçbir iş akışına ait değil, hepsine hizmet ediyor. En çok import edilen 4 dosyanın 4'ü de bu temadaydı. |
| **L** | **ÇEKİRDEK BACKEND ALTYAPISI** | Kimlik doğrulama (guard/strategy/decorator/DTO), Prisma bağlantı katmanı, NestJS modül kablolaması (`*.module.ts`, `app.module`, `main.ts`), yetki/rol/tier kapıları. | 3/37 taşıyıcı + tüm modül-kablolama dosyaları; "yönetim ekranı" (G) değil, ürünün altındaki çatı. |
| **M** | **TEKLİF YAŞAM DÖNGÜSÜ** | Teklifin kaydı, listelenmesi, detayı, güncellenmesi (quotes backend modülü + frontend teklif listesi/detay sayfaları + teklif tipleri). Üretim hattı (A-F) teklifi KURAR; M kurulan teklifi SAKLAR ve yeniden açar. | Haritadaki G satırı `/api/quotes/`yu "ne döndürdüğü bilinmiyor" diye tutuyordu — teklif nesnesi "kütüphane/yönetim" değil, ürünün ana çıktısı. Şema dondurulmadan açıkça ayrıldı. |

Sığ sınıflandırmada geçerli etiket kümesi (DONDURULDU): **A B C D E F G H I J K L M + BELİRSİZ.**

**Dondurulmuş eşitlik-bozucu kurallar** (12 okuyucunun tutarlı etiketlemesi için, HS4 başlamadan sabitlendi ve prompt'a birebir girdi): her `*.module.ts` → L (kablolama; iş mantığı varsa notlanır) · controller/DTO ait olduğu ALANIN grubuna (quotes→M, brands→G, matching→C, excel-grid→A, dwg-engine→J, exchange-rates→D; auth→L) · test config'leri → H, build config'leri → I · salt re-export `index.ts` → modülünün grubuna · emin olunamayan → BELİRSİZ.

---

*(HS4-HS7 ve HS11-HS12 aşağıda.)*

## HS9 · HR3-RET'in iki çıkış kodu (kaynaktan KOPYALANDI, görülerek)

Kaynak: `docs/RAPOR_HR_Kod_Haritasi.md:689-735` — bu turda açılıp okundu, aşağısı birebir aktarım:

- **Koşum 1** (sahte dosya `backend/src/__sahte-harita-denemesi.ts` eklendi + `git add`): **çıkış kodu 1** — çıktı: `⛔ HICBIR LISTEDE YOK: 1 dosya · HARITA DENETIMI: FAIL`
- **Koşum 2** (sahte dosya silindi): **çıkış kodu 0** — çıktı: `HARITA DENETIMI: PASS — her kod dosyasinin karsiligi var.`

## HS10 · Cırcır aritmetiği — hipotez YANLIŞ, sayaç bayat DEĞİL

Ölçüm (`git diff 459dbdd 5502c00 -- harita-bekleyenler.txt`):

- Silinen satır: **14** · Eklenen satır: **0** → **283 − 14 = 269** ✓ aritmetik tutuyor.
- Görevdeki hipotez ("iki yeni dosya doğdu ve listeye eklendi, 267+2=269") **YANLIŞ**: listeye hiçbir şey eklenmedi (cırcır zaten eklemeye izin vermez). "16" geçen turun HARİTA satırı sayısıydı; ikisinin bekleyenler karşılığı hiç olmadı: `scripts/kb5-olcu.sh` yeni doğup **doğrudan haritaya** girdi (listeye hiç düşmedi), `docker-compose.yml` ise `.yml` uzantısı `harita-kapsam-disi.txt` [KOD UZANTILARI]'nda olmadığından **hiç kod dosyası sayılmıyor**. `RAPOR_KB_*.md` de aynı sebeple (md kod uzantısı değil) evrende yok. Yani 16 harita satırı = 14 bekleyenler silmesi + 2 listede-hiç-olmayan.
- Kod dosyası evreni ayrıca ölçüldü: OTOMATIK §1 listesi `459dbdd`'de 299, şimdi **300**; fark tam olarak `scripts/kb5-olcu.sh` (+1), giden yok.
- **Bu ölçümün bulduğu ek kusur:** bekleyenlerde, haritada tam yolu ZATEN geçen 2 dosya duruyordu (`backend/src/modules/excel-grid/excel-grid.service.ts` · `frontend/app/(protected)/quotes/new/page.tsx`) — önceki turlar haritaya yazarken listeden silmemiş. Kapı bunu hata saymaz (dosya ≥1 listede), ama "haritaya yazılınca listeden silinir" sözleşmesine aykırıydı; kapı sayılarındaki 33+269=302>300 farkının açıklaması buydu. Bu tur listeyi sıfırlarken kendiliğinden kapandı → "görüldü, dokunulmadı" listesine değil, "görüldü, bu turun kendi işiyle kapandı" notuna girer.

## HS4 · Kalan BÜTÜN dosyalar sınıflandırıldı — 269/269

238 dosya 12 paralel okuyucuyla, HS3'te dondurulmuş şema + eşitlik-bozucularla OKUNARAK sınıflandırıldı (ilk koşumda 6 parti oturum limitine takıldı; koşum kaldığı yerden devam ettirildi, önbellek + 6 yeniden koşum → 238/238, eksik 0). HS2'nin 31 taşıyıcısıyla birlikte **269/269 — bekleyenler evreninin tamamı, eksiksiz ve evren-dışı kayıtsız** (birleştirici betiğin kapsama kontrolü: eksik 0 · evren-dışı 0 · çift 0). Sınıflandırmanın tamamı haritanın yeni **"TAM SINIFLANDIRMA — sığ katman"** bölümünde tablo halinde durur (`KOD_HARITASI.md`); her kaydın okunan aralığı ve karar veren sembolleri workflow kayıtlarında.

**Grup dağılımı (269):** A:7 · B:11 · C:16 · D:5 · E:0 · F:7 · G:40 · H:64 · I:9 · J:44 · K:27 · L:31 · M:8 · BELİRSİZ:0.

**E'nin sıfırlığı dürüst boşluk:** toplam hesabı zaten derin katmandaki `standart-sema.ts:191-195`'te; bekleyenler evreninde E'ye düşen dosya yoktu.

## HS5 · Belirsizler — sayı SIFIR ve bu ayrıca açıklanır

BELİRSİZ = **0**. Görev bunun şüpheyle karşılanmasını ister; açıklama:

1. **Şema, veri "uymuyor" dedikten SONRA genişletildi:** HS2'de 31 taşıyıcının 17'si mevcut A-I'ya UYMUYOR çıktı; HS3 bu üç temaya (DWG · ortak UI/istemci · çekirdek altyapı) + teklif yaşam döngüsüne ev açtı. HS4'te belirsizin sıfırlanması, zorlama değil bu genişletmenin sonucu — aynı okumalar eski şemayla yapılsaydı ~100+ dosya UYMUYOR çıkacaktı (J:44 + K:27 + L:31 + M:8 = 110).
2. **Eşitlik-bozucular sınır vakaları mekanikleştirdi** (module.ts→L, controller/DTO→alan, config'ler→H/I, index.ts→modül).
3. **Nüans yutulmadı:** 12 kayıt "orta güven" + gerekçeli sınır notu taşıyor (ör. `bootstrap.controller.ts` G↔L savunulabilir · `labor.service.ts` içindeki matchLabor C'ye taşar · `merge-multisheet.ts` A↔B sınırı · `types/index.ts` G+M+K karışımı). Bunlar BELİRSİZ'e kaçmak yerine dondurulmuş kurala göre karar + not aldı. Güven dağılımı (238 toplu kayıt): **226 yüksek · 12 orta · 0 düşük**; 108 kayıtta içerik notu var.
4. Sıfırın bağımsız sınaması HS6 çürütme denetimidir (aşağıda).

## Bu turda GÖRÜLDÜ, DOKUNULMADI (kusur listesi — düzeltme yok, yalnız kayıt)

1. **Hardcoded JWT fallback secret `'metaprice-secret'` ÜÇ kopya:** `auth.module.ts` · `auth.service.ts` (ayrıca secret/expiresIn çift kaynak) · `jwt.strategy.ts`. Env yoksa üretimde tahmin edilebilir imza — güvenlik adayı.
2. `bootstrap.controller.ts` — `BOOTSTRAP_SECRET` env silinmezse açık kalan tek-seferlik admin yükseltme ucu (dosyada uyarı yorumu var).
3. `python/main.py` — `/debug/*` uçları auth'suz (bilinçli not düşülmüş); dosya ~1554 satır, çok-işli.
4. **Ölü kod adayları:** `python/converter.py` ODA kalıntıları (`find_oda_converter`, `_ODA_VERSION_TARGET` — çağıran yok, grep'le doğrulandı) · `labor-matching.service.ts backfillTags()` (yorumda LEGACY v1) · `useFillHandle.tsx FillHandleIndicator` boş bileşen · `Sidebar.tsx` section-başlığı render dalı (NAV_ITEMS'ta 'section' alanı yok) · `pipe_segments.py` kullanılmayan geri-uyum parametreleri (:920, :948) · `ai.service.ts` pdf-parse v2 dalı (parser kurulup kullanılmıyor) · `test/audit-real-excel.ts` + `test/faz0-gs7-probe.ts` assert'süz geçici ölçüm betikleri.
5. `materials/electrical/page.tsx` — ana akıştan erişimi belirsiz (`materials/page.tsx` "elektrik havuz KALDIRILDI 22.07" deyip mekaniğe yönlendiriyor) ve arama kutusu state'e bağlı değil (filtre çalışmıyor).
6. `EquipmentDetailPopup.tsx:51` — ternary'nin iki kolu da `'library'`: koşul etkisiz, muhtemel kusur.
7. `DwgUploader.tsx:57-62` — kalıcı bırakılmış debug `console.warn` build-marker'ı; ayrıca upload+polling+persist+dialog tek dosyada.
8. `build-material-context.ts` backend/frontend **elle senkron İKİZ kopya** (`backend/src/utils/` ↔ `frontend/components/excel-grid/`) — kopya kayması riski.
9. `tier.guard.ts` — her korumalı istekte DB sorgusu (performans notu).
10. `quotes.service.ts` — yaşam döngüsü + parse + export orkestrasyonu tek dosyada; `KDV_ORAN` sabit kodlu; console.log'lar.
11. `excel-engine.service.ts` — `excel-grid/prepare` ile PARALEL ikinci yükleme hattı (ölü değil: quotes/new + dashboard çağırıyor) — "bir davranış kaç yoldan tetikleniyor" sorusunun A grubundaki yeni örneği.
12. `AdminSidebar.tsx:35-36` yorumu — backend `/admin/ai-*` uçlarının UI'sız durduğunu söylüyor (backend'de ölü uç şüphesi).
13. 800-satır proje limitini aşan dosyalar (sığ okumada sayıldı): `ExcelGrid.tsx` 2729 · `quotes/new/page.tsx` 2293 · `DxfCanvasViewer.tsx` 2011 · `python/main.py` 1554 · `index-engine-test.ts` 1509 · `admin.service.ts` 1440 · `excel-grid.service.ts` 1061 · `pipe_segments.py` 1051 · `DwgProjectWorkspace.tsx` 1013 · `matching.service.ts` 924 · `admin/brands/page.tsx` 869 · `labor-firms.service.ts` 860 · `verify.mjs` 836 · `ai.service.ts` 825.
14. HS10'da bulunan liste-hijyen kusuru (harita∩bekleyenler 2 örtüşme) bu turun kendi işiyle kapandı — §HS10.

## HS8 · Klasör ağacı — bu raporun içinde

Üretim komutu: `node scripts/harita-uret.mjs --agac` (çıkış kodu 0; `git ls-files` tabanlı; `node_modules`/`dist` kapsam tanımı gereği zaten dışarıda). Olduğu gibi, yorumsuz:

```
├── .github/
│   └── workflows/
│       ├── keep-alive.yml
│       └── regression.yml
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── scripts/
│   │   ├── derleme-kapisi.js
│   │   └── surum-yaz.js
│   ├── src/
│   │   ├── admin/
│   │   │   ├── admin.controller.ts
│   │   │   ├── admin.module.ts
│   │   │   └── admin.service.ts
│   │   ├── ai/
│   │   │   ├── ai.controller.ts
│   │   │   ├── ai.module.ts
│   │   │   └── ai.service.ts
│   │   ├── auth/
│   │   │   ├── decorators/
│   │   │   │   ├── current-user.decorator.ts
│   │   │   │   └── roles.decorator.ts
│   │   │   ├── dto/
│   │   │   │   ├── login.dto.ts
│   │   │   │   └── register.dto.ts
│   │   │   ├── guards/
│   │   │   │   ├── jwt-auth.guard.ts
│   │   │   │   ├── roles.guard.ts
│   │   │   │   └── tier.guard.ts
│   │   │   ├── strategies/
│   │   │   │   └── jwt.strategy.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.service.ts
│   │   │   └── capabilities.helper.ts
│   │   ├── brands/
│   │   │   ├── dto/
│   │   │   │   └── create-brand.dto.ts
│   │   │   ├── brands.controller.ts
│   │   │   ├── brands.module.ts
│   │   │   └── brands.service.ts
│   │   ├── exchange-rates/
│   │   │   ├── exchange-rates.controller.ts
│   │   │   ├── exchange-rates.module.ts
│   │   │   └── exchange-rates.service.ts
│   │   ├── labor/
│   │   │   ├── labor.controller.ts
│   │   │   ├── labor.module.ts
│   │   │   └── labor.service.ts
│   │   ├── labor-firms/
│   │   │   ├── labor-firms.controller.ts
│   │   │   ├── labor-firms.module.ts
│   │   │   └── labor-firms.service.ts
│   │   ├── library/
│   │   │   ├── dto/
│   │   │   │   ├── bulk-discount.dto.ts
│   │   │   │   ├── bulk-update-items.dto.ts
│   │   │   │   ├── create-library-item.dto.ts
│   │   │   │   ├── create-manual-brand.dto.ts
│   │   │   │   ├── import-price-list.dto.ts
│   │   │   │   └── update-library-item.dto.ts
│   │   │   ├── library-sheet-builder.ts
│   │   │   ├── library.controller.ts
│   │   │   ├── library.module.ts
│   │   │   └── library.service.ts
│   │   ├── materials/
│   │   │   ├── dto/
│   │   │   │   ├── create-material-price.dto.ts
│   │   │   │   └── create-material.dto.ts
│   │   │   ├── materials.controller.ts
│   │   │   ├── materials.module.ts
│   │   │   └── materials.service.ts
│   │   ├── modules/
│   │   │   ├── dwg-engine/
│   │   │   │   ├── python/
│   │   │   │   │   ├── tests/
│   │   │   │   │   │   ├── __init__.py
│   │   │   │   │   │   ├── test_block_to_line_split.py
│   │   │   │   │   │   ├── test_pipe_segments.py
│   │   │   │   │   │   └── test_scale_normalization.py
│   │   │   │   │   ├── .env.example
│   │   │   │   │   ├── .gcloudignore
│   │   │   │   │   ├── CLOUD-RUN-MIGRATION.md
│   │   │   │   │   ├── Dockerfile
│   │   │   │   │   ├── converter.py
│   │   │   │   │   ├── deploy-to-cloudrun.ps1
│   │   │   │   │   ├── deploy-to-cloudrun.sh
│   │   │   │   │   ├── geometry.py
│   │   │   │   │   ├── graph.py
│   │   │   │   │   ├── main.py
│   │   │   │   │   ├── models.py
│   │   │   │   │   ├── parse_worker.py
│   │   │   │   │   ├── pipe_segments.py
│   │   │   │   │   ├── requirements.txt
│   │   │   │   │   ├── topology.py
│   │   │   │   │   └── upload_worker.py
│   │   │   │   ├── dwg-engine.controller.ts
│   │   │   │   ├── dwg-engine.module.ts
│   │   │   │   ├── dwg-engine.service.ts
│   │   │   │   ├── scale-param.test.ts
│   │   │   │   └── scale-param.ts
│   │   │   ├── excel-engine/
│   │   │   │   ├── excel-engine.controller.ts
│   │   │   │   ├── excel-engine.module.ts
│   │   │   │   └── excel-engine.service.ts
│   │   │   ├── excel-grid/
│   │   │   │   ├── excel-grid.controller.ts
│   │   │   │   ├── excel-grid.module.ts
│   │   │   │   ├── excel-grid.service.ts
│   │   │   │   ├── sheet-discipline.ts
│   │   │   │   └── standart-sema.ts
│   │   │   ├── labor-matching/
│   │   │   │   ├── labor-matching.controller.ts
│   │   │   │   ├── labor-matching.module.ts
│   │   │   │   └── labor-matching.service.ts
│   │   │   └── matching/
│   │   │       ├── index/
│   │   │       │   ├── line-parser.ts
│   │   │       │   ├── outcome-mapper.ts
│   │   │       │   ├── product-index.ts
│   │   │       │   ├── query-engine.ts
│   │   │       │   ├── types.ts
│   │   │       │   └── vocab.ts
│   │   │       ├── ad-cins-sozlugu.ts
│   │   │       ├── ad-resolver.ts
│   │   │       ├── conversion.ts
│   │   │       ├── matching.controller.ts
│   │   │       ├── matching.module.ts
│   │   │       ├── matching.service.ts
│   │   │       ├── normalizer.ts
│   │   │       ├── pricing.ts
│   │   │       ├── shared-tag-matcher.ts
│   │   │       ├── tag-generator.ts
│   │   │       ├── terminology.service.ts
│   │   │       └── types.ts
│   │   ├── prisma/
│   │   │   ├── prisma.module.ts
│   │   │   └── prisma.service.ts
│   │   ├── quote-formats/
│   │   │   ├── format-engine.ts
│   │   │   ├── quote-formats.controller.ts
│   │   │   ├── quote-formats.module.ts
│   │   │   └── quote-formats.service.ts
│   │   ├── quotes/
│   │   │   ├── dto/
│   │   │   │   └── create-quote.dto.ts
│   │   │   ├── export-engine.ts
│   │   │   ├── quotes.controller.ts
│   │   │   ├── quotes.module.ts
│   │   │   ├── quotes.service.ts
│   │   │   └── standart-cikti.ts
│   │   ├── utils/
│   │   │   ├── build-material-context.ts
│   │   │   ├── etiket-display.ts
│   │   │   ├── import-fidelity.ts
│   │   │   └── xlsx-to-pdf.ts
│   │   ├── app.module.ts
│   │   ├── bootstrap.controller.ts
│   │   ├── health.controller.ts
│   │   ├── main.ts
│   │   └── surum.ts
│   ├── test/
│   │   ├── fixtures/
│   │   │   ├── FIRMA-F-algilama-iscilik.xlsm
│   │   │   ├── FIRMA-G.xlsm
│   │   │   ├── demontaj-sefa.xlsx
│   │   │   ├── demontaj.xlsx
│   │   │   ├── fg-FIRMA-H-shared.xlsx
│   │   │   ├── hangar-yss.xlsx
│   │   │   └── yangin-temin-montaj.xlsx
│   │   ├── admin-import-test.ts
│   │   ├── audit-canli-kosum.ts
│   │   ├── audit-real-excel.ts
│   │   ├── build-sha-kablolama-test.ts
│   │   ├── contract-test.ts
│   │   ├── conversion-test.ts
│   │   ├── excel-grid-test.ts
│   │   ├── export-format-test.ts
│   │   ├── export-live-sim-test.ts
│   │   ├── faz0-gs7-probe.ts
│   │   ├── fixture-anonim.ts
│   │   ├── fixture-dogrula.ts
│   │   ├── gercek-dosya-test.ts
│   │   ├── gs6b-teshis.ts
│   │   ├── index-engine-test.ts
│   │   ├── kd11-toplam-yollari-test.ts
│   │   ├── kd12-baslik-satiri-test.ts
│   │   ├── kd9-kur-olcutu-test.ts
│   │   ├── kl-liste-ekleme-test.ts
│   │   ├── labor-matching-test.ts
│   │   ├── labor-sheet-test.ts
│   │   ├── library-transfer-test.ts
│   │   ├── manifest-kapisi.ts
│   │   ├── matching-regression.ts
│   │   ├── matching-unit-test.ts
│   │   ├── onceden-fiyatli-test.ts
│   │   ├── pano18-para-birimi-test.ts
│   │   ├── perf-profil.ts
│   │   ├── pk3-kimlik-haritasi-test.ts
│   │   ├── pk3-repo-kapsama-test.ts
│   │   ├── pk9-sessiz-indeks-test.ts
│   │   ├── product-index-test.ts
│   │   ├── regression-all.ts
│   │   ├── spec-regression-test.ts
│   │   ├── standart-cikti-test.ts
│   │   ├── standart-sema-test.ts
│   │   └── tam-zincir.ts
│   ├── .dockerignore
│   ├── .env.example
│   ├── Dockerfile
│   ├── nest-cli.json
│   ├── package-lock.json
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   ├── DEPLOYMENT.md
│   ├── RAPOR_HR_Kod_Haritasi.md
│   ├── RAPOR_KB_Kutuphane_Baglanti_Olcusu.md
│   └── RAPOR_Oturum_2026-08-02.md
├── frontend/
│   ├── app/
│   │   ├── (protected)/
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── dwg-workspace/
│   │   │   │   └── page.tsx
│   │   │   ├── labor/
│   │   │   │   └── page.tsx
│   │   │   ├── labor-firms/
│   │   │   │   ├── [firmaId]/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── library/
│   │   │   │   ├── brand/
│   │   │   │   │   └── [brandId]/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── electrical-brands/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── equipment/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── mechanical-brands/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── materials/
│   │   │   │   ├── [brandId]/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── electrical/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── mechanical/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── profile/
│   │   │   │   └── page.tsx
│   │   │   ├── quote-formats/
│   │   │   │   └── page.tsx
│   │   │   ├── quotes/
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── new/
│   │   │   │   │   ├── error.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── admin/
│   │   │   ├── brands/
│   │   │   │   └── page.tsx
│   │   │   ├── stats/
│   │   │   │   └── page.tsx
│   │   │   ├── users/
│   │   │   │   └── page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── dev/
│   │   │   └── grid-test/
│   │   │       └── page.tsx
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── admin/
│   │   │   └── AdminSidebar.tsx
│   │   ├── dashboard/
│   │   │   ├── QuickAccess.tsx
│   │   │   ├── QuickStart.tsx
│   │   │   └── RecentQuotes.tsx
│   │   ├── dwg-diameter-engine/
│   │   │   ├── DiameterLegendPanel.tsx
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── useLayerCalc.ts
│   │   │   └── useOriginalColorState.ts
│   │   ├── dwg-metraj/
│   │   │   ├── DiameterEditPopup.tsx
│   │   │   ├── DwgUploader.tsx
│   │   │   ├── MetrajEditor.tsx
│   │   │   ├── constants.ts
│   │   │   ├── diameter-colors.ts
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── unit-detection.test.ts
│   │   │   └── unit-detection.ts
│   │   ├── dwg-tagging/
│   │   │   ├── BucketPanel.tsx
│   │   │   ├── index.ts
│   │   │   └── useTaggingStore.ts
│   │   ├── dwg-viewer/
│   │   │   ├── DxfCanvasViewer.tsx
│   │   │   ├── aci-colors.ts
│   │   │   ├── index.ts
│   │   │   ├── segment-length.test.ts
│   │   │   ├── segment-length.ts
│   │   │   ├── types.ts
│   │   │   └── useViewport.ts
│   │   ├── dwg-workspace/
│   │   │   ├── DwgProjectWorkspace.tsx
│   │   │   ├── EquipmentDetailPopup.tsx
│   │   │   ├── LayerInfoSidebar.tsx
│   │   │   ├── LayerVisibilityPanel.tsx
│   │   │   ├── MetrajSummaryPanel.tsx
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   └── useWorkspaceState.ts
│   │   ├── excel-grid/
│   │   │   ├── CustomDropdown.tsx
│   │   │   ├── ExcelGrid.tsx
│   │   │   ├── SheetTabs.tsx
│   │   │   ├── aday-ayirt-edicilik.test.ts
│   │   │   ├── aday-ayirt-edicilik.ts
│   │   │   ├── build-material-context.test.ts
│   │   │   ├── build-material-context.ts
│   │   │   ├── discount-utils.test.ts
│   │   │   ├── discount-utils.ts
│   │   │   ├── fill-down.test.ts
│   │   │   ├── fill-down.ts
│   │   │   ├── fill-handle.css
│   │   │   ├── types.ts
│   │   │   └── useFillHandle.tsx
│   │   ├── layout/
│   │   │   ├── Breadcrumb.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── library/
│   │   │   ├── InlineFirmEntry.tsx
│   │   │   └── ManualBrandModal.tsx
│   │   ├── quotes/
│   │   │   └── ColumnManagerPanel.tsx
│   │   └── ui/
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── confirm-dialog.tsx
│   │       ├── dialog.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── select.tsx
│   │       ├── table.tsx
│   │       ├── toast.tsx
│   │       └── toaster.tsx
│   ├── contexts/
│   │   └── CapabilitiesContext.tsx
│   ├── e2e/
│   │   └── grid.spec.ts
│   ├── e2e-golden/
│   │   ├── KRITER_DEGISIKLIK_GUNLUGU.md
│   │   ├── artefakt-dizini.cjs
│   │   ├── bolum-f-kabul.spec.ts
│   │   ├── faz0-gs7-teshis.spec.ts
│   │   ├── firma-a-golden.spec.ts
│   │   ├── global-setup.mjs
│   │   ├── golden.spec.ts
│   │   ├── gs-kalicilik.spec.ts
│   │   ├── helpers.ts
│   │   ├── pu4-popup-genislik.spec.ts
│   │   ├── run.mjs
│   │   ├── sayi-ayristirma.mjs
│   │   ├── surum-kapisi.cjs
│   │   └── verify.mjs
│   ├── hooks/
│   │   ├── use-confirm.ts
│   │   ├── use-currency.ts
│   │   └── use-toast.ts
│   ├── lib/
│   │   ├── admin-stats.ts
│   │   ├── api.ts
│   │   ├── disiplin.ts
│   │   ├── export-download.ts
│   │   ├── gs6b-golge-kurali.test.ts
│   │   ├── kaynak-kolon.test.ts
│   │   ├── kaynak-kolon.ts
│   │   ├── merge-multisheet.test.ts
│   │   ├── merge-multisheet.ts
│   │   ├── metraj-excel.ts
│   │   ├── parse-material-text.test.ts
│   │   ├── parse-material-text.ts
│   │   ├── popup-secici-sozlesmesi.test.ts
│   │   ├── pricing.test.ts
│   │   ├── pricing.ts
│   │   ├── sayi-ayristirma.test.ts
│   │   └── utils.ts
│   ├── scripts/
│   │   └── surum-yaz.js
│   ├── types/
│   │   ├── index.ts
│   │   └── quotes.ts
│   ├── .dockerignore
│   ├── .env.example
│   ├── .env.production
│   ├── .gitignore
│   ├── .npmrc
│   ├── CLOUDFLARE_PAGES_SETUP.md
│   ├── Dockerfile
│   ├── next.config.js
│   ├── package-lock.json
│   ├── package.json
│   ├── playwright.config.ts
│   ├── playwright.golden.config.ts
│   ├── postcss.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── wrangler.toml
├── scripts/
│   ├── backup.sh
│   ├── deploy.sh
│   ├── harita-denetle.mjs
│   ├── harita-uret.mjs
│   └── kb5-olcu.sh
├── test-fixtures/
│   ├── e2e/
│   │   ├── 0_Bursa SAHA-BIR inşai işler - Revize Keşif (1).xlsx
│   │   ├── 2024-0001-FIRMA-F Enerji-SAHA-IKI Algılama - İŞÇİLİK.xlsm
│   │   ├── 2024-0001-FIRMA-F_SAHA-IKI_YSS -R003 -FIRMA-B.xlsx
│   │   ├── 2026-0008-FIRMA-C_SAHA-ALTI-FFS - FIRMA-B.xlsx
│   │   ├── F _ G mekanik-elektrik işleri FIRMA-H müh. 14.04.2026 teklif.xlsx
│   │   ├── FIRMA-A KEŞİF ÖZETİ 251224 R1 - FIRMA-B MÜHENDİSLİK.xlsx
│   │   ├── FIRMA-B MÜHENDİSLİK-SAHA-DORT OKUL PROJESİ SAHA-BES.xlsx
│   │   ├── FIRMA-B-2024-0063-R1-FIRMA-G-altnf 1-R1.xlsm
│   │   ├── FIRMA-C ENTEGRE SAHA-UC - Yangın Tesisatı.xlsx
│   │   ├── FIRMA-D-1.xlsx
│   │   ├── FIRMA-E Mobilya Metraj - Copy.xlsx
│   │   ├── GOREV_E2E_10_Dosya_Altin_Yol_Kosumu.md
│   │   ├── yangin-temin-montaj.xlsx
│   │   └── İşçilik_Hangar Yangın Keşif Özeti_R02 (1).xlsx
│   └── regression/
│       ├── FAZ0_KOK_NEDEN_RAPORU.md
│       ├── FAZ0_STANDART_SEMA_KOK_NEDEN.md
│       ├── FAZ3_RAPOR.md
│       ├── GS_MF_KIRMIZI_ONCE.txt
│       ├── KAPSAM_DEVRI.md
│       ├── PU_KIRMIZI_ONCE.txt
│       └── T6_SILME_ENVANTERI.md
├── .env.example
├── .gitignore
├── CLAUDE.md
├── Caddyfile
├── KOD_HARITASI.md
├── KOD_HARITASI_OTOMATIK.md
├── README.md
├── docker-compose.yml
├── harita-bekleyenler.txt
├── harita-kapsam-disi.txt
├── netlify.toml
└── render.yaml

94 dizin, 373 dosya
```

## HS6 ★ · Örneklem denetimi — 15 dosya yeniden açıldı

**Seçim yöntemi (denetçi seçmedi, kural seçti):** en kalabalık 5 grup (H:64 · J:44 · G:40 · L:31 · K:27) × her birinden satır sayısına göre **en büyük + medyan + en küçük** = 15 dosya. Boyut yelpazesi 1 satır (`__init__.py`) ile 2011 satır (`DxfCanvasViewer.tsx`) arası; kolay dosya kayırması yok — seçim, birleştirici betikte deterministik.

**Denetim biçimi:** 5 bağımsız denetçi × 3 dosya; talimat "etiketi ÇÜRÜTMEYE çalış" (nezaket yeşili yasak, zorlama kırmızı da yasak). Denetçiler dosyaları yeniden okudu.

**Sonuç: 14/15 TUTTU · 1/15 TUTMADI (%93).** Tutmayan: `frontend/components/dwg-diameter-engine/useLayerCalc.ts` — düzeltildi; haritadaki satır artık denetçinin içerik tespitiyle: *"Tek layer için backend'e metraj isteği atar; SAF geometri+uzunluk sonucunu (çapsız segmentler) callback ile parent'a verir."* (Dosyanın kendi başlığı da bunu doğruluyor: "Otomatik çap atama TAMAMEN KALDIRILDI".) Grup ataması (J) 15/15 doğru çıktı — düzeltme yalnız işlev cümlesindeydi.

**Denetimin yakaladığı SÜREÇ KUSURU (dürüst kayıt):** 15 etiketin 5'i denetim prompt'una kayıttaki cümleyle birebir değil, sentezcinin özetiyle geçmişti (kopyalama disiplini ihlali). Tek TUTMADI, tam da anlamlı sapan özetin olduğu satırda çıktı — yani denetim hem etiketi hem denetim sürecinin kendisini sınadı. Telafi: 5 satırın kayıttaki orijinal cümleleri, denetçilerin bağımsız içerik tespitleriyle sentezde ayrıca karşılaştırıldı — dördü birebir örtüşüyor; `useLayerCalc`'ta kayıttaki cümle içeriğe yakın olsa da denetçininki daha keskin olduğu için haritaya o yazıldı.

## HS7 · Tamamlanma ölçüsü — payda ile

| Sayı | Değer |
|---|---|
| Sınıflandırılan | **269 / 269** |
| Kalan | **0** |
| Cırcır son değeri | **0** (283 → 269 → 0) |

**BİTTİ** — durulan nokta yok. Hiçbir etiket adından tahminle yazılmadı (her kayıtta okunan aralık + semboller var); hedefe yetişmek için etiket uydurulmadı — bunun sınaması HS5'in sıfır-belirsiz açıklaması + HS6 çürütme denetimidir.

## HS11 · Kapılar — `git add`'den SONRA koşuldu (sıra kanıtlı)

Koşum sırası: (1) tüm değişiklikler `git add -A` ile stage'lendi → (2) `npm run test:harita` → (3) `npm run test:regression`. CI #42 dersine uygun: `git ls-files` tabanlı kapı, izlenmeyen dosya kalmadan koşuldu (kapının kendi İZLENMEYEN uyarısı da tetiklenmedi).

```
── HARITA DENETIMI ──
  kod dosyasi        : 300
  haritada karsiligi : 300
  bekleyenlerde      : 0 (HEAD: 269)
HARITA DENETIMI: PASS — her kod dosyasinin karsiligi var.   → çıkış 0
```

`test:regression`: **27 PASS · 0 FAIL · 3 SKIP** (3 SKIP = DB paketleri, tasarım gereği PG_REGRESSION=1 ister; SKIP PASS değildir) → çıkış 0.

## HS12 · Kapanış (HR8)

```
Haritada değişen satır: TAM SINIFLANDIRMA (yeni bölüm) · 269 dosya sığ katmanda A-M'ye dağıtıldı · J/K/L/M grupları HS3'te ilan edilip tanımlandı
Haritada değişen satır: J · frontend/components/dwg-diameter-engine/useLayerCalc.ts · HS6 denetim düzeltmesi — işlev cümlesi içerikle netleştirildi
Bekleyenler listesi: 269 -> 0 (cırcır: yalnız kısaldı; HEDEF TUTTU — kod dosyası 300/300 haritada)
```
