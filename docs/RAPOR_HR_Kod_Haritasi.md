# RAPOR — KOD HARİTASI (HR1-HR4, HR8)

**Panel kalemi:** 56 · **Tarih:** 02.08.2026 · **Tur:** FAZ 1

> Bu turda **kod taşınmadı.** Tek dosya yer değiştirmedi, üretim koduna dokunulmadı.
> Eklenen her şey belge, betik ve testtir.
>
> **Çıkış kodu okunacak komutların hiçbiri boruya sokulmadı** — komut çıktısı dosyaya
> yönlendirildi, `$?` ayrıca okundu.

---

## Özet tablo

| # | Ölçüt | Durum | Kanıt |
|---|---|---|---|
| HR1 | Otomatik katman üreticisi | ✅ | çıkış 0 · 295→297 kod dosyası · 59.651→60.026 satır · 124 uç · 33→34 `test:*` |
| HR1b | 13 belge sayısı ↔ gerçek sayı | ✅ | çıkış 0 · **13 → 33**, fark +20 (+23 / −3) |
| HR1c | Klasör ağacı fotoğrafı + 10 dosya yolu | ✅ | çıkış 0 · 94 dizin / 360 dosya · **3 dosya BULUNAMADI** |
| HR2 | `KOD_HARITASI.md` olduğu gibi repoda | ✅ | `b46991d` · `cmp` BİREBİR · `git show --stat` |
| HR3 | Denetim kapısı + `npm run test:harita` | ✅ | çıkış 0 |
| **HR3-RET** | **Ret yolu kasten ateşlendi** | ✅ | **çıkış 1 → çıkış 0** (iki koşum, ikisi de aşağıda) |
| HR4 | Cırcır — liste yalnız kısalır | ✅ | **çıkış 1 (283→284) → çıkış 0** |
| HR8 | Görev dosyası kapanış satırı | ✅ | raporun sonunda |

---

## HR1 — otomatik katman üreticisi

**Komut**
```
node scripts/harita-uret.mjs > /tmp/hr1.out 2>&1; echo "CIKIS_KODU=$?"
```
**Çıkış kodu:** `0`

**Çıktı**
```
YAZILDI: KOD_HARITASI_OTOMATIK.md
  kod dosyasi : 295
  toplam satir: 59651
  uc nokta    : 124
  test:* adedi: 33
```

Betikler haritaya yazılıp `test:harita` eklendikten sonra yeniden üretildi:

```
YAZILDI: KOD_HARITASI_OTOMATIK.md
  kod dosyasi : 297
  toplam satir: 60026
  uc nokta    : 124
  test:* adedi: 34
```

> 295 → 297 farkı, bu turda eklenen iki betiktir. 33 → 34 farkı `test:harita`'dır.
> HR1b ölçümü **33** anındaki sayıyla yapıldı; sonradan eklenen script sayıya dahil değildir.

**Üretilen dosyanın ilk 20 satırı**
```
# KOD HARİTASI — OTOMATİK KATMAN

<!-- URETILMIS DOSYA — ELLE DUZENLENMEZ. Uretici: scripts/harita-uret.mjs -->
<!-- Kapsam tanimi: harita-kapsam-disi.txt -->

Kod dosyasi: 295
Toplam satir: 59651
Uc nokta: 124
test:* scripti: 33

## 1 · Dosyalar ve satir sayilari

| Dosya | Satir |
|---|---|
| `backend/prisma/schema.prisma` | 593 |
| `backend/scripts/derleme-kapisi.js` | 68 |
| `backend/scripts/surum-yaz.js` | 47 |
| `backend/src/admin/admin.controller.ts` | 202 |
| `backend/src/admin/admin.module.ts` | 15 |
| `backend/src/admin/admin.service.ts` | 1440 |
```

**Kapsam tanımı betiğin içinde değil:** `harita-kapsam-disi.txt`. İki bölüm var —
kod sayılan uzantılar ve gerekçeli kapsam-dışı desenler. Gerekçesiz desen yasak.

---

## HR1b — belgeden sayılan 13 ↔ repodaki gerçek sayı

**Komut**
```
node /tmp/hr1b.mjs > /tmp/hr1b.out 2>&1; echo "CIKIS_KODU=$?"
```
**Çıkış kodu:** `0`

**Çıktı**
```
BELGEDEN SAYILAN : 13
REPODA GERCEK    : 33
FARK             : 20 (+23 / -3)

BELGEDE VAR, REPODA YOK (3): test:ke · test:kb · test:sahte

REPODA VAR, BELGEDE YOK (23):
test:regression:db  test:conversion  test:matching  test:spec  test:contract  test:product-index
test:index  test:labor  test:grid  test:labor-sheet  test:kl  test:livesim
test:tf  test:manifest  test:build-sha  test:pk9  test:18  test:pk3
test:pk3-repo  test:kd11  test:kd12  test:kd9  test:e2e
```

Haritanın grup H'deki cevapsız sorusu (*"gerçekten 13 mü, daha fazla mı?"*) bu ölçümle
kapandı. Soru satırı **silinmedi**, üstü çizilerek cevabı yazıldı — harita kuralı:
yanlış satır düzeltilir, silinmez.

---

## HR1c — mevcut klasör ağacı ve 10 dosyanın gerçek yolu

**Komut**
```
node scripts/harita-uret.mjs --agac > /tmp/agac.out 2>&1; echo "CIKIS_KODU=$?"
```
**Çıkış kodu:** `0`

### 10 çıplak dosya adının gerçek yolu

| Haritadaki ad | Gerçek yol |
|---|---|
| `standart-sema.ts` | `backend/src/modules/excel-grid/standart-sema.ts` |
| `standart-cikti.ts` | `backend/src/quotes/standart-cikti.ts` |
| `package.json` | `backend/package.json` **ve** `frontend/package.json` — **kökte package.json YOK** |
| `regression.yml` | `.github/workflows/regression.yml` |
| `tsconfig.build.json` | **bulunamadı** |
| `backup.sh` | `scripts/backup.sh` |
| `setup_env.sh` | **bulunamadı** |
| `dogrula.py` | **bulunamadı** |
| `regression-all.ts` | `backend/test/regression-all.ts` |
| `bolum-f-kabul.spec.ts` | `frontend/e2e-golden/bolum-f-kabul.spec.ts` |

> Üç dosya **ne izlenen dosyalarda ne de çalışma ağacında** bulundu. Ana repo kopyasında
> da arandı, yok. Tahmin edilmedi. Haritanın kendi notu `setup_env.sh` için
> *"izlenmeyen dosya olarak duruyor (?? setup_env.sh)"* diyordu — **bu makinede o dosya yok.**
> `dogrula.py` haritada zaten "ürün kodu OLMAYAN dosyalar" bölümünde, kullanıcının kendi
> betiği olarak geçiyor; repoda bulunmaması bu kayıtla tutarlı.

### Ağacın tamamı (`node_modules`, `dist`, `.next`, e2e-artifacts hariç)

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
│   └── DEPLOYMENT.md
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
│   └── harita-uret.mjs
├── test-fixtures/
│   ├── e2e/
│   │   ├── 0_Bursa SAHA-BIR inşai işler - Revize Keşif (1).xlsx
│   │   ├── 2024-0001-FIRMA-F Enerji-SAHA-IKI Algılama - İŞÇİLİK.xlsm
│   │   ├── 2024-0001-FIRMA-F_SAHA-IKI_YSS -R003 -FIRMA-B.xlsx
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

94 dizin, 366 dosya
```

---

## HR2 — harita repoya olduğu gibi girdi

**Komut**
```
cp KOD_HARITASI.md ./KOD_HARITASI.md ; cmp <kaynak> <repo>
```
**Sonuç:** `BIREBIR AYNI` — satır silinmedi, değiştirilmedi.

**Commit:** `b46991d`

**`git show --stat`**
```
b46991d feat(hr): kod haritasi kuruldu, eskimesi teste baglandi (HR1-HR4, HR8)
 KOD_HARITASI.md                | 261 ++++++++++++++
 KOD_HARITASI_OTOMATIK.md       | 748 +++++++++++++++++++++++++++++++++++++++++
 backend/package.json           |   3 +-
 backend/test/regression-all.ts |   1 +
 harita-bekleyenler.txt         | 290 ++++++++++++++++
 harita-kapsam-disi.txt         |  36 ++
 scripts/harita-denetle.mjs     | 147 ++++++++
 scripts/harita-uret.mjs        | 225 +++++++++++++
 8 files changed, 1710 insertions(+), 1 deletion(-)
```

Sonraki commit `7a98377` haritayı **doldurdu** (grup H'ye 4 satır), silmedi.

---

## HR3 — denetim kapısı

**Komut**
```
cd backend && npm run test:harita > /tmp/hr3.out 2>&1; echo "CIKIS_KODU=$?"
```
**Çıkış kodu:** `0`

**Çıktı**
```
── HARITA DENETIMI ──
  kod dosyasi        : 295
  haritada karsiligi : 12
  bekleyenlerde      : 283 (HEAD`de yok — ilk olusturma)

HARITA DENETIMI: PASS — her kod dosyasinin karsiligi var.
```

### Sözleşme

```
0 → otomatik katmandaki her kod dosyasının karşılığı var
1 → en az bir dosya hiçbir listede yok  VEYA  bekleyenler listesi uzadı  VEYA
    bekleyenlerde artık var olmayan bir dosya duruyor
2 → ön koşul yok: git deposu değil, ya da KOD_HARITASI_OTOMATIK.md üretilmemiş,
    ya da KOD_HARITASI.md yok
```

> **Ek olarak yazılan, görevde geçmeyen bir ön koşul var:** `KOD_HARITASI.md` yoksa da
> çıkış 2. Gerekçe: üst katman olmadan "haritada var mı" sorusu ölçülemez.
> Görev metnine eklenmiş bir madde olduğu için burada açıkça bildiriliyor.

### "Haritada var" ne demek — bu bir iddia, o yüzden yazıldı

Bir kod dosyası haritada **sayılır** eğer (a) tam repo-göreli yolu metinde geçiyorsa,
**ya da** (b) dosya adı repoda **tekse** ve metinde geçiyorsa. `package.json` gibi repoda
birden çok bulunan adlar (b) ile sayılmaz: hangi paketten söz ettiğini söylemeyen satır
konum bildirmiyor demektir.

### Denetim listeyi nereden alıyor

Otomatik katman **MD dosyasından okunmuyor**, doğrudan `git ls-files`'tan üretiliyor.
Gerekçe: MD bayatlarsa yeni eklenen dosyayı göremezdi ve kapı sessizce yeşil kalırdı.
MD dosyası yalnız **ön koşul** olarak aranıyor (yoksa çıkış 2).

---

## HR3-RET ★ — ret yolu kasten ateşlendi

> *Ateşlendiği görülmemiş kapı, kapı değildir.* (KD8 dersi.)

### Koşum 1 — sahte kaynak dosya eklendi (hiçbir listede yok)

**Komut**
```
printf 'export const sahte = 1;\n' > backend/src/__sahte-harita-denemesi.ts
git add backend/src/__sahte-harita-denemesi.ts
cd backend && npm run test:harita > /tmp/ret1.out 2>&1; echo "CIKIS_KODU=$?"
```
**Çıkış kodu:** `1`

**Çıktı**
```
── HARITA DENETIMI ──
  kod dosyasi        : 296
  haritada karsiligi : 12
  bekleyenlerde      : 283 (HEAD`de yok — ilk olusturma)
  ❌ listesiz: backend/src/__sahte-harita-denemesi.ts

  ⛔ HICBIR LISTEDE YOK: 1 dosya

HARITA DENETIMI: FAIL
```

### Koşum 2 — sahte dosya silindi

**Komut**
```
git rm --cached --quiet backend/src/__sahte-harita-denemesi.ts
rm -f backend/src/__sahte-harita-denemesi.ts
cd backend && npm run test:harita > /tmp/ret2.out 2>&1; echo "CIKIS_KODU=$?"
```
**Çıkış kodu:** `0`

**Çıktı**
```
── HARITA DENETIMI ──
  kod dosyasi        : 295
  haritada karsiligi : 12
  bekleyenlerde      : 283 (HEAD`de yok — ilk olusturma)

HARITA DENETIMI: PASS — her kod dosyasinin karsiligi var.
```

---

## HR4 — cırcır (liste yalnız kısalır)

### İlk ateşleme GERÇEK bir boşluk buldu

Cırcır ilk kez tetiklendiğinde beklenmeyen bir şey daha çıktı: **haritanın kendi
betikleri hiçbir listede değildi.**

```
CIKIS_KODU=1
  ❌ listesiz: scripts/harita-uret.mjs
  ❌ listeye eklenmis: backend/src/uydurma-bir-satir.ts
  ❌ hayalet: backend/src/uydurma-bir-satir.ts

  ⛔ HICBIR LISTEDE YOK: 2 dosya
  ⛔ BEKLEYENLER UZADI: 283 → 284
  ⛔ BEKLEYENLERDE HAYALET: 1 dosya artik yok
```

**Kök neden:** bekleyenler listesi `git add`'den **önce** üretilmişti; o an betikler
henüz izlenmiyordu, dolayısıyla `git ls-files` onları görmüyordu. Kapı kendi kurucusunu
yakaladı.

**Çözüm bekleyenler listesine eklemek DEĞİL** (HR4 yasağı) — haritaya yazmak: grup H'ye
dört satır eklendi (`harita-uret.mjs` · `harita-denetle.mjs` · `harita-kapsam-disi.txt` ·
`harita-bekleyenler.txt`), her biri kanıt sütunuyla. Sonra otomatik katman yeniden üretildi.

Ara ölçüm (test satırı geri alındıktan sonra, betikler haritaya yazılmadan **önce**):
```
CIKIS_KODU=1
  ❌ listesiz: scripts/harita-denetle.mjs
  ❌ listesiz: scripts/harita-uret.mjs
  ⛔ HICBIR LISTEDE YOK: 2 dosya
```

Düzeltmeden sonra:
```
CIKIS_KODU=0
  kod dosyasi        : 297
  haritada karsiligi : 14
  bekleyenlerde      : 283 (HEAD: 283)
HARITA DENETIMI: PASS
```

### Yalıtılmış cırcır ateşlemesi

Yukarıdaki ilk ateşlemede üç koşul birden yandı; cırcırın **tek başına** çalıştığını
göstermek için listede **zaten var olan gerçek bir dosya** tekrarlandı (hayalet yok,
listesiz yok — yalnız uzama).

**Koşum 1**
```
ILK=$(grep -v "^#\|^$" harita-bekleyenler.txt | head -1)   # backend/prisma/schema.prisma
echo "$ILK" >> harita-bekleyenler.txt
cd backend && npm run test:harita > /tmp/hr4d.out 2>&1; echo "CIKIS_KODU=$?"
```
**Çıkış kodu:** `1`
```
  haritada karsiligi : 14
  bekleyenlerde      : 284 (HEAD: 283)

  ⛔ BEKLEYENLER UZADI: 283 → 284

HARITA DENETIMI: FAIL
```

**Koşum 2**
```
git checkout -- harita-bekleyenler.txt
cd backend && npm run test:harita > /tmp/hr4e.out 2>&1; echo "CIKIS_KODU=$?"
```
**Çıkış kodu:** `0`
```
  bekleyenlerde      : 283 (HEAD: 283)
HARITA DENETIMI: PASS — her kod dosyasinin karsiligi var.
```

---

## Kapıyı kalıcı hâle getiren bağlantı

`test:harita` **`backend/package.json`'a** kondu (kökte `package.json` yok) ve
`regression-all.ts` SUITES listesine girdi. PK1 manifest kapısı doğruladı:

```
PK1 PASS — 32 scriptin tamami kapsanmis (SUITES veya gerekceli istisna).
```

Tam regresyon:
```
cd backend && npm run test:regression > /tmp/reg2.out 2>&1; echo "CIKIS_KODU=$?"
CIKIS_KODU=0

  🟢 PASS [Z0] Kod haritası denetimi (HR3) (0.9s)
TOPLAM: 27 PASS · 0 FAIL · 3 SKIP
```

Yani harita denetimi bundan sonra **CI'da da** koşuyor.

---

## Yapılamayanlar

| Madde | Neden |
|---|---|
| FAZ 2 (HR5, HR5b, HR6, HR7) | Görev tanımı gereği ayrı tur değil; ADIM 0 ve ADIM 1 tamiri sırasında okunan kodun haritaya yazılmasıdır. Bu turda o tamir yapılmadı, dolayısıyla **yazılacak kanıt üretilmedi.** Tahminle doldurmak yasak. |
| Grup A/C/D/E'nin ⬜ satırları | Aynı gerekçe — bu tur kod okumadı, fotoğraf çekti. |

---

## Kapanış

```
Haritada değişen satır: H · scripts/harita-uret.mjs · haritanın otomatik alt katmanını üretir (yeni)
Haritada değişen satır: H · scripts/harita-denetle.mjs · harita denetim kapısı, ret yolu ateşlendi (yeni)
Haritada değişen satır: H · harita-kapsam-disi.txt · kapsam tanımı, betiğin dışında (yeni)
Haritada değişen satır: H · harita-bekleyenler.txt · borç listesi, cırcıra bağlı (yeni)
Haritada değişen satır: H · package.json · "13 test scripti" sorusu CEVAPLANDI → 33 (soru satırı silinmedi, üstü çizildi)
Bekleyenler listesi: (yoktu) -> 283
origin/master = d79024b   canlı build_sha = 0f0a9ac8ddae
```

> **Makas açık:** yerel HEAD (`7a98377`) → `origin/master` (`d79024b`) → canlı (`0f0a9ac`).
> Bu tur üretime dokunmadığı için engel değil, ama görev metnindeki
> `origin/master = 9635d43` / canlı `6846423` değerleri **artık geçerli değil**;
> yukarıdakiler bugün ölçüldü.
