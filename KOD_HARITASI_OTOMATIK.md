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
| `backend/src/ai/ai.controller.ts` | 26 |
| `backend/src/ai/ai.module.ts` | 13 |
| `backend/src/ai/ai.service.ts` | 825 |
| `backend/src/app.module.ts` | 45 |
| `backend/src/auth/auth.controller.ts` | 28 |
| `backend/src/auth/auth.module.ts` | 21 |
| `backend/src/auth/auth.service.ts` | 72 |
| `backend/src/auth/capabilities.helper.ts` | 65 |
| `backend/src/auth/decorators/current-user.decorator.ts` | 9 |
| `backend/src/auth/decorators/roles.decorator.ts` | 5 |
| `backend/src/auth/dto/login.dto.ts` | 10 |
| `backend/src/auth/dto/register.dto.ts` | 11 |
| `backend/src/auth/guards/jwt-auth.guard.ts` | 6 |
| `backend/src/auth/guards/roles.guard.ts` | 20 |
| `backend/src/auth/guards/tier.guard.ts` | 40 |
| `backend/src/auth/strategies/jwt.strategy.ts` | 24 |
| `backend/src/bootstrap.controller.ts` | 57 |
| `backend/src/brands/brands.controller.ts` | 54 |
| `backend/src/brands/brands.module.ts` | 11 |
| `backend/src/brands/brands.service.ts` | 161 |
| `backend/src/brands/dto/create-brand.dto.ts` | 17 |
| `backend/src/exchange-rates/exchange-rates.controller.ts` | 15 |
| `backend/src/exchange-rates/exchange-rates.module.ts` | 11 |
| `backend/src/exchange-rates/exchange-rates.service.ts` | 136 |
| `backend/src/health.controller.ts` | 33 |
| `backend/src/labor-firms/labor-firms.controller.ts` | 168 |
| `backend/src/labor-firms/labor-firms.module.ts` | 15 |
| `backend/src/labor-firms/labor-firms.service.ts` | 860 |
| `backend/src/labor/labor.controller.ts` | 47 |
| `backend/src/labor/labor.module.ts` | 13 |
| `backend/src/labor/labor.service.ts` | 85 |
| `backend/src/library/dto/bulk-discount.dto.ts` | 12 |
| `backend/src/library/dto/bulk-update-items.dto.ts` | 13 |
| `backend/src/library/dto/create-library-item.dto.ts` | 40 |
| `backend/src/library/dto/create-manual-brand.dto.ts` | 46 |
| `backend/src/library/dto/import-price-list.dto.ts` | 10 |
| `backend/src/library/dto/update-library-item.dto.ts` | 32 |
| `backend/src/library/library-sheet-builder.ts` | 125 |
| `backend/src/library/library.controller.ts` | 110 |
| `backend/src/library/library.module.ts` | 13 |
| `backend/src/library/library.service.ts` | 653 |
| `backend/src/main.ts` | 68 |
| `backend/src/materials/dto/create-material-price.dto.ts` | 14 |
| `backend/src/materials/dto/create-material.dto.ts` | 8 |
| `backend/src/materials/materials.controller.ts` | 65 |
| `backend/src/materials/materials.module.ts` | 11 |
| `backend/src/materials/materials.service.ts` | 72 |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | 172 |
| `backend/src/modules/dwg-engine/dwg-engine.module.ts` | 11 |
| `backend/src/modules/dwg-engine/dwg-engine.service.ts` | 413 |
| `backend/src/modules/dwg-engine/python/converter.py` | 598 |
| `backend/src/modules/dwg-engine/python/deploy-to-cloudrun.sh` | 71 |
| `backend/src/modules/dwg-engine/python/geometry.py` | 757 |
| `backend/src/modules/dwg-engine/python/graph.py` | 356 |
| `backend/src/modules/dwg-engine/python/main.py` | 1554 |
| `backend/src/modules/dwg-engine/python/models.py` | 80 |
| `backend/src/modules/dwg-engine/python/parse_worker.py` | 82 |
| `backend/src/modules/dwg-engine/python/pipe_segments.py` | 1051 |
| `backend/src/modules/dwg-engine/python/tests/__init__.py` | 1 |
| `backend/src/modules/dwg-engine/python/tests/test_block_to_line_split.py` | 104 |
| `backend/src/modules/dwg-engine/python/tests/test_pipe_segments.py` | 85 |
| `backend/src/modules/dwg-engine/python/tests/test_scale_normalization.py` | 72 |
| `backend/src/modules/dwg-engine/python/topology.py` | 268 |
| `backend/src/modules/dwg-engine/python/upload_worker.py` | 104 |
| `backend/src/modules/dwg-engine/scale-param.test.ts` | 51 |
| `backend/src/modules/dwg-engine/scale-param.ts` | 24 |
| `backend/src/modules/excel-engine/excel-engine.controller.ts` | 21 |
| `backend/src/modules/excel-engine/excel-engine.module.ts` | 13 |
| `backend/src/modules/excel-engine/excel-engine.service.ts` | 195 |
| `backend/src/modules/excel-grid/excel-grid.controller.ts` | 23 |
| `backend/src/modules/excel-grid/excel-grid.module.ts` | 13 |
| `backend/src/modules/excel-grid/excel-grid.service.ts` | 964 |
| `backend/src/modules/excel-grid/sheet-discipline.ts` | 61 |
| `backend/src/modules/excel-grid/standart-sema.ts` | 331 |
| `backend/src/modules/labor-matching/labor-matching.controller.ts` | 50 |
| `backend/src/modules/labor-matching/labor-matching.module.ts` | 14 |
| `backend/src/modules/labor-matching/labor-matching.service.ts` | 74 |
| `backend/src/modules/matching/ad-cins-sozlugu.ts` | 231 |
| `backend/src/modules/matching/ad-resolver.ts` | 48 |
| `backend/src/modules/matching/conversion.ts` | 400 |
| `backend/src/modules/matching/index/line-parser.ts` | 191 |
| `backend/src/modules/matching/index/outcome-mapper.ts` | 255 |
| `backend/src/modules/matching/index/product-index.ts` | 482 |
| `backend/src/modules/matching/index/query-engine.ts` | 632 |
| `backend/src/modules/matching/index/types.ts` | 155 |
| `backend/src/modules/matching/index/vocab.ts` | 37 |
| `backend/src/modules/matching/matching.controller.ts` | 86 |
| `backend/src/modules/matching/matching.module.ts` | 15 |
| `backend/src/modules/matching/matching.service.ts` | 924 |
| `backend/src/modules/matching/normalizer.ts` | 658 |
| `backend/src/modules/matching/pricing.ts` | 36 |
| `backend/src/modules/matching/shared-tag-matcher.ts` | 165 |
| `backend/src/modules/matching/tag-generator.ts` | 161 |
| `backend/src/modules/matching/terminology.service.ts` | 288 |
| `backend/src/modules/matching/types.ts` | 78 |
| `backend/src/prisma/prisma.module.ts` | 10 |
| `backend/src/prisma/prisma.service.ts` | 14 |
| `backend/src/quote-formats/format-engine.ts` | 453 |
| `backend/src/quote-formats/quote-formats.controller.ts` | 89 |
| `backend/src/quote-formats/quote-formats.module.ts` | 11 |
| `backend/src/quote-formats/quote-formats.service.ts` | 155 |
| `backend/src/quotes/dto/create-quote.dto.ts` | 79 |
| `backend/src/quotes/export-engine.ts` | 365 |
| `backend/src/quotes/quotes.controller.ts` | 145 |
| `backend/src/quotes/quotes.module.ts` | 15 |
| `backend/src/quotes/quotes.service.ts` | 411 |
| `backend/src/quotes/standart-cikti.ts` | 289 |
| `backend/src/surum.ts` | 30 |
| `backend/src/utils/build-material-context.ts` | 126 |
| `backend/src/utils/etiket-display.ts` | 70 |
| `backend/src/utils/import-fidelity.ts` | 347 |
| `backend/src/utils/xlsx-to-pdf.ts` | 46 |
| `backend/test/admin-import-test.ts` | 264 |
| `backend/test/audit-canli-kosum.ts` | 313 |
| `backend/test/audit-real-excel.ts` | 82 |
| `backend/test/build-sha-kablolama-test.ts` | 140 |
| `backend/test/contract-test.ts` | 285 |
| `backend/test/conversion-test.ts` | 218 |
| `backend/test/excel-grid-test.ts` | 157 |
| `backend/test/export-format-test.ts` | 427 |
| `backend/test/export-live-sim-test.ts` | 411 |
| `backend/test/faz0-gs7-probe.ts` | 74 |
| `backend/test/fixture-anonim.ts` | 305 |
| `backend/test/fixture-dogrula.ts` | 224 |
| `backend/test/gercek-dosya-test.ts` | 259 |
| `backend/test/gs6b-teshis.ts` | 85 |
| `backend/test/index-engine-test.ts` | 1509 |
| `backend/test/kd11-toplam-yollari-test.ts` | 142 |
| `backend/test/kd12-baslik-satiri-test.ts` | 183 |
| `backend/test/kd9-kur-olcutu-test.ts` | 222 |
| `backend/test/kl-liste-ekleme-test.ts` | 168 |
| `backend/test/labor-matching-test.ts` | 196 |
| `backend/test/labor-sheet-test.ts` | 102 |
| `backend/test/library-transfer-test.ts` | 96 |
| `backend/test/manifest-kapisi.ts` | 77 |
| `backend/test/matching-regression.ts` | 265 |
| `backend/test/matching-unit-test.ts` | 710 |
| `backend/test/onceden-fiyatli-test.ts` | 163 |
| `backend/test/pano18-para-birimi-test.ts` | 172 |
| `backend/test/perf-profil.ts` | 73 |
| `backend/test/pk3-kimlik-haritasi-test.ts` | 157 |
| `backend/test/pk3-repo-kapsama-test.ts` | 79 |
| `backend/test/pk9-sessiz-indeks-test.ts` | 97 |
| `backend/test/product-index-test.ts` | 453 |
| `backend/test/regression-all.ts` | 109 |
| `backend/test/spec-regression-test.ts` | 447 |
| `backend/test/standart-cikti-test.ts` | 316 |
| `backend/test/standart-sema-test.ts` | 338 |
| `backend/test/tam-zincir.ts` | 105 |
| `frontend/app/(protected)/dashboard/page.tsx` | 241 |
| `frontend/app/(protected)/dwg-workspace/page.tsx` | 79 |
| `frontend/app/(protected)/labor-firms/[firmaId]/page.tsx` | 459 |
| `frontend/app/(protected)/labor-firms/page.tsx` | 249 |
| `frontend/app/(protected)/labor/page.tsx` | 248 |
| `frontend/app/(protected)/layout.tsx` | 198 |
| `frontend/app/(protected)/library/brand/[brandId]/page.tsx` | 300 |
| `frontend/app/(protected)/library/electrical-brands/page.tsx` | 400 |
| `frontend/app/(protected)/library/equipment/page.tsx` | 458 |
| `frontend/app/(protected)/library/mechanical-brands/page.tsx` | 312 |
| `frontend/app/(protected)/library/page.tsx` | 599 |
| `frontend/app/(protected)/materials/[brandId]/page.tsx` | 638 |
| `frontend/app/(protected)/materials/electrical/page.tsx` | 148 |
| `frontend/app/(protected)/materials/mechanical/page.tsx` | 148 |
| `frontend/app/(protected)/materials/page.tsx` | 23 |
| `frontend/app/(protected)/profile/page.tsx` | 336 |
| `frontend/app/(protected)/quote-formats/page.tsx` | 397 |
| `frontend/app/(protected)/quotes/[id]/page.tsx` | 244 |
| `frontend/app/(protected)/quotes/new/error.tsx` | 13 |
| `frontend/app/(protected)/quotes/new/page.tsx` | 2290 |
| `frontend/app/(protected)/quotes/page.tsx` | 192 |
| `frontend/app/admin/brands/page.tsx` | 869 |
| `frontend/app/admin/layout.tsx` | 80 |
| `frontend/app/admin/page.tsx` | 16 |
| `frontend/app/admin/stats/page.tsx` | 199 |
| `frontend/app/admin/users/page.tsx` | 190 |
| `frontend/app/dev/grid-test/page.tsx` | 200 |
| `frontend/app/layout.tsx` | 25 |
| `frontend/app/login/page.tsx` | 84 |
| `frontend/app/page.tsx` | 20 |
| `frontend/app/register/page.tsx` | 85 |
| `frontend/components/admin/AdminSidebar.tsx` | 125 |
| `frontend/components/dashboard/QuickAccess.tsx` | 49 |
| `frontend/components/dashboard/QuickStart.tsx` | 216 |
| `frontend/components/dashboard/RecentQuotes.tsx` | 97 |
| `frontend/components/dwg-diameter-engine/DiameterLegendPanel.tsx` | 151 |
| `frontend/components/dwg-diameter-engine/index.ts` | 16 |
| `frontend/components/dwg-diameter-engine/types.ts` | 79 |
| `frontend/components/dwg-diameter-engine/useLayerCalc.ts` | 127 |
| `frontend/components/dwg-diameter-engine/useOriginalColorState.ts` | 36 |
| `frontend/components/dwg-metraj/DiameterEditPopup.tsx` | 121 |
| `frontend/components/dwg-metraj/DwgUploader.tsx` | 484 |
| `frontend/components/dwg-metraj/MetrajEditor.tsx` | 459 |
| `frontend/components/dwg-metraj/constants.ts` | 28 |
| `frontend/components/dwg-metraj/diameter-colors.ts` | 169 |
| `frontend/components/dwg-metraj/index.ts` | 12 |
| `frontend/components/dwg-metraj/types.ts` | 70 |
| `frontend/components/dwg-metraj/unit-detection.test.ts` | 47 |
| `frontend/components/dwg-metraj/unit-detection.ts` | 37 |
| `frontend/components/dwg-tagging/BucketPanel.tsx` | 144 |
| `frontend/components/dwg-tagging/index.ts` | 12 |
| `frontend/components/dwg-tagging/useTaggingStore.ts` | 110 |
| `frontend/components/dwg-viewer/DxfCanvasViewer.tsx` | 2011 |
| `frontend/components/dwg-viewer/aci-colors.ts` | 38 |
| `frontend/components/dwg-viewer/index.ts` | 6 |
| `frontend/components/dwg-viewer/segment-length.test.ts` | 54 |
| `frontend/components/dwg-viewer/segment-length.ts` | 48 |
| `frontend/components/dwg-viewer/types.ts` | 76 |
| `frontend/components/dwg-viewer/useViewport.ts` | 233 |
| `frontend/components/dwg-workspace/DwgProjectWorkspace.tsx` | 1013 |
| `frontend/components/dwg-workspace/EquipmentDetailPopup.tsx` | 371 |
| `frontend/components/dwg-workspace/LayerInfoSidebar.tsx` | 143 |
| `frontend/components/dwg-workspace/LayerVisibilityPanel.tsx` | 229 |
| `frontend/components/dwg-workspace/MetrajSummaryPanel.tsx` | 165 |
| `frontend/components/dwg-workspace/index.ts` | 6 |
| `frontend/components/dwg-workspace/types.ts` | 79 |
| `frontend/components/dwg-workspace/useWorkspaceState.ts` | 365 |
| `frontend/components/excel-grid/CustomDropdown.tsx` | 233 |
| `frontend/components/excel-grid/ExcelGrid.tsx` | 2729 |
| `frontend/components/excel-grid/SheetTabs.tsx` | 109 |
| `frontend/components/excel-grid/aday-ayirt-edicilik.test.ts` | 178 |
| `frontend/components/excel-grid/aday-ayirt-edicilik.ts` | 175 |
| `frontend/components/excel-grid/build-material-context.test.ts` | 37 |
| `frontend/components/excel-grid/build-material-context.ts` | 38 |
| `frontend/components/excel-grid/discount-utils.test.ts` | 41 |
| `frontend/components/excel-grid/discount-utils.ts` | 28 |
| `frontend/components/excel-grid/fill-down.test.ts` | 205 |
| `frontend/components/excel-grid/fill-down.ts` | 276 |
| `frontend/components/excel-grid/types.ts` | 112 |
| `frontend/components/excel-grid/useFillHandle.tsx` | 284 |
| `frontend/components/layout/Breadcrumb.tsx` | 73 |
| `frontend/components/layout/Sidebar.tsx` | 142 |
| `frontend/components/library/InlineFirmEntry.tsx` | 160 |
| `frontend/components/library/ManualBrandModal.tsx` | 198 |
| `frontend/components/quotes/ColumnManagerPanel.tsx` | 146 |
| `frontend/components/ui/badge.tsx` | 35 |
| `frontend/components/ui/button.tsx` | 50 |
| `frontend/components/ui/card.tsx` | 56 |
| `frontend/components/ui/confirm-dialog.tsx` | 95 |
| `frontend/components/ui/dialog.tsx` | 94 |
| `frontend/components/ui/input.tsx` | 24 |
| `frontend/components/ui/label.tsx` | 19 |
| `frontend/components/ui/select.tsx` | 143 |
| `frontend/components/ui/table.tsx` | 77 |
| `frontend/components/ui/toast.tsx` | 115 |
| `frontend/components/ui/toaster.tsx` | 34 |
| `frontend/contexts/CapabilitiesContext.tsx` | 98 |
| `frontend/e2e-golden/artefakt-dizini.cjs` | 101 |
| `frontend/e2e-golden/bolum-f-kabul.spec.ts` | 195 |
| `frontend/e2e-golden/faz0-gs7-teshis.spec.ts` | 103 |
| `frontend/e2e-golden/firma-a-golden.spec.ts` | 534 |
| `frontend/e2e-golden/global-setup.mjs` | 80 |
| `frontend/e2e-golden/golden.spec.ts` | 245 |
| `frontend/e2e-golden/gs-kalicilik.spec.ts` | 316 |
| `frontend/e2e-golden/helpers.ts` | 352 |
| `frontend/e2e-golden/pu4-popup-genislik.spec.ts` | 252 |
| `frontend/e2e-golden/run.mjs` | 47 |
| `frontend/e2e-golden/sayi-ayristirma.mjs` | 46 |
| `frontend/e2e-golden/surum-kapisi.cjs` | 135 |
| `frontend/e2e-golden/verify.mjs` | 836 |
| `frontend/e2e/grid.spec.ts` | 206 |
| `frontend/hooks/use-confirm.ts` | 83 |
| `frontend/hooks/use-currency.ts` | 87 |
| `frontend/hooks/use-toast.ts` | 119 |
| `frontend/lib/admin-stats.ts` | 81 |
| `frontend/lib/api.ts` | 26 |
| `frontend/lib/disiplin.ts` | 13 |
| `frontend/lib/export-download.ts` | 91 |
| `frontend/lib/gs6b-golge-kurali.test.ts` | 60 |
| `frontend/lib/merge-multisheet.test.ts` | 112 |
| `frontend/lib/merge-multisheet.ts` | 185 |
| `frontend/lib/metraj-excel.ts` | 96 |
| `frontend/lib/parse-material-text.test.ts` | 86 |
| `frontend/lib/parse-material-text.ts` | 69 |
| `frontend/lib/popup-secici-sozlesmesi.test.ts` | 62 |
| `frontend/lib/pricing.test.ts` | 61 |
| `frontend/lib/pricing.ts` | 177 |
| `frontend/lib/sayi-ayristirma.test.ts` | 80 |
| `frontend/lib/utils.ts` | 16 |
| `frontend/next.config.js` | 33 |
| `frontend/playwright.config.ts` | 21 |
| `frontend/playwright.golden.config.ts` | 37 |
| `frontend/postcss.config.js` | 7 |
| `frontend/scripts/surum-yaz.js` | 33 |
| `frontend/tailwind.config.ts` | 64 |
| `frontend/types/index.ts` | 64 |
| `frontend/types/quotes.ts` | 62 |
| `frontend/vitest.config.ts` | 10 |
| `scripts/backup.sh` | 15 |
| `scripts/deploy.sh` | 90 |

## 2 · Import bagliliklari

| Dosya | Import ettigi (ham) |
|---|---|
| `backend/scripts/derleme-kapisi.js` | `fs` `path` |
| `backend/scripts/surum-yaz.js` | `fs` `path` `child_process` |
| `backend/src/admin/admin.controller.ts` | `@nestjs/platform-express` `multer` `./admin.service` `../modules/excel-grid/excel-grid.service` `../auth/guards/jwt-auth.guard` `../auth/guards/roles.guard` `../auth/decorators/roles.decorator` |
| `backend/src/admin/admin.module.ts` | `@nestjs/common` `./admin.controller` `./admin.service` `../prisma/prisma.module` `../ai/ai.module` `../modules/excel-grid/excel-grid.module` `../modules/matching/matching.module` |
| `backend/src/admin/admin.service.ts` | `@nestjs/common` `xlsx` `../prisma/prisma.service` `../ai/ai.service` `../modules/matching/terminology.service` `../utils/etiket-display` `../modules/matching/index/product-index` `../modules/matching/tag-generator` |
| `backend/src/ai/ai.controller.ts` | `@nestjs/common` `@nestjs/platform-express` `multer` `./ai.service` `../auth/guards/jwt-auth.guard` `../auth/guards/tier.guard` `../auth/decorators/current-user.decorator` |
| `backend/src/ai/ai.module.ts` | `@nestjs/common` `./ai.controller` `./ai.service` `../prisma/prisma.module` |
| `backend/src/ai/ai.service.ts` | `@nestjs/common` `../prisma/prisma.service` `@anthropic-ai/sdk` `xlsx` `pdf-parse` |
| `backend/src/app.module.ts` | `@nestjs/common` `./health.controller` `./bootstrap.controller` `./prisma/prisma.module` `./auth/auth.module` `./brands/brands.module` `./materials/materials.module` `./library/library.module` `./quotes/quotes.module` `./admin/admin.module` `./ai/ai.module` `./labor/labor.module` `./labor-firms/labor-firms.module` `./modules/excel-engine/excel-engine.module` `./modules/excel-grid/excel-grid.module` `./modules/matching/matching.module` `./modules/labor-matching/labor-matching.module` `./modules/dwg-engine/dwg-engine.module` `./exchange-rates/exchange-rates.module` `./quote-formats/quote-formats.module` |
| `backend/src/auth/auth.controller.ts` | `@nestjs/common` `./auth.service` `./dto/register.dto` `./dto/login.dto` `./guards/jwt-auth.guard` `./decorators/current-user.decorator` |
| `backend/src/auth/auth.module.ts` | `@nestjs/common` `@nestjs/jwt` `@nestjs/passport` `./auth.service` `./auth.controller` `./strategies/jwt.strategy` |
| `backend/src/auth/auth.service.ts` | `@nestjs/jwt` `bcrypt` `../prisma/prisma.service` `./dto/register.dto` `./dto/login.dto` `./capabilities.helper` |
| `backend/src/auth/capabilities.helper.ts` | `../prisma/prisma.service` |
| `backend/src/auth/decorators/current-user.decorator.ts` | `@nestjs/common` |
| `backend/src/auth/decorators/roles.decorator.ts` | `@nestjs/common` |
| `backend/src/auth/dto/login.dto.ts` | `class-validator` |
| `backend/src/auth/dto/register.dto.ts` | `class-validator` |
| `backend/src/auth/guards/jwt-auth.guard.ts` | `@nestjs/common` `@nestjs/passport` |
| `backend/src/auth/guards/roles.guard.ts` | `@nestjs/common` `@nestjs/core` `../decorators/roles.decorator` |
| `backend/src/auth/guards/tier.guard.ts` | `@nestjs/common` `@nestjs/core` `../../prisma/prisma.service` |
| `backend/src/auth/strategies/jwt.strategy.ts` | `@nestjs/common` `@nestjs/passport` `passport-jwt` `../../prisma/prisma.service` |
| `backend/src/bootstrap.controller.ts` | `bcrypt` `./prisma/prisma.service` |
| `backend/src/brands/brands.controller.ts` | `./brands.service` `./dto/create-brand.dto` `../auth/guards/jwt-auth.guard` `../auth/guards/roles.guard` `../auth/decorators/roles.decorator` |
| `backend/src/brands/brands.module.ts` | `@nestjs/common` `./brands.service` `./brands.controller` |
| `backend/src/brands/brands.service.ts` | `@nestjs/common` `../prisma/prisma.service` `./dto/create-brand.dto` |
| `backend/src/brands/dto/create-brand.dto.ts` | `class-validator` |
| `backend/src/exchange-rates/exchange-rates.controller.ts` | `@nestjs/common` `./exchange-rates.service` |
| `backend/src/exchange-rates/exchange-rates.module.ts` | `@nestjs/common` `./exchange-rates.controller` `./exchange-rates.service` |
| `backend/src/exchange-rates/exchange-rates.service.ts` | `@nestjs/common` |
| `backend/src/health.controller.ts` | `@nestjs/common` `./surum` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `@nestjs/platform-express` `multer` `./labor-firms.service` `../auth/guards/jwt-auth.guard` `../auth/decorators/current-user.decorator` `../modules/excel-grid/excel-grid.service` |
| `backend/src/labor-firms/labor-firms.module.ts` | `@nestjs/common` `./labor-firms.service` `./labor-firms.controller` `../modules/excel-grid/excel-grid.module` `../modules/matching/matching.module` |
| `backend/src/labor-firms/labor-firms.service.ts` | `@nestjs/common` `../prisma/prisma.service` `../utils/build-material-context` `../modules/matching/matching.service` `../modules/matching/index/product-index` `../modules/matching/tag-generator` |
| `backend/src/labor/labor.controller.ts` | `./labor.service` `../auth/guards/jwt-auth.guard` `../auth/guards/tier.guard` |
| `backend/src/labor/labor.module.ts` | `@nestjs/common` `./labor.service` `./labor.controller` `../prisma/prisma.module` |
| `backend/src/labor/labor.service.ts` | `@nestjs/common` `../prisma/prisma.service` |
| `backend/src/library/dto/bulk-discount.dto.ts` | `class-validator` |
| `backend/src/library/dto/bulk-update-items.dto.ts` | `class-validator` |
| `backend/src/library/dto/create-library-item.dto.ts` | `class-validator` |
| `backend/src/library/dto/create-manual-brand.dto.ts` | `class-transformer` |
| `backend/src/library/dto/import-price-list.dto.ts` | `class-validator` |
| `backend/src/library/dto/update-library-item.dto.ts` | `class-validator` |
| `backend/src/library/library.controller.ts` | `./library.service` `./dto/create-library-item.dto` `./dto/update-library-item.dto` `./dto/import-price-list.dto` `./dto/bulk-discount.dto` `./dto/bulk-update-items.dto` `./dto/create-manual-brand.dto` `../auth/guards/jwt-auth.guard` `../auth/decorators/current-user.decorator` |
| `backend/src/library/library.module.ts` | `@nestjs/common` `./library.service` `./library.controller` `../modules/matching/matching.module` |
| `backend/src/library/library.service.ts` | `@nestjs/common` `../prisma/prisma.service` `./dto/create-library-item.dto` `./dto/update-library-item.dto` `./dto/import-price-list.dto` `./dto/bulk-discount.dto` `./dto/bulk-update-items.dto` `./dto/create-manual-brand.dto` `./library-sheet-builder` `../modules/matching/terminology.service` |
| `backend/src/main.ts` | `@nestjs/core` `@nestjs/common` `express` `./app.module` |
| `backend/src/materials/dto/create-material-price.dto.ts` | `class-validator` |
| `backend/src/materials/dto/create-material.dto.ts` | `class-validator` |
| `backend/src/materials/materials.controller.ts` | `./materials.service` `./dto/create-material.dto` `./dto/create-material-price.dto` `../auth/guards/jwt-auth.guard` `../auth/guards/roles.guard` `../auth/decorators/roles.decorator` |
| `backend/src/materials/materials.module.ts` | `@nestjs/common` `./materials.service` `./materials.controller` |
| `backend/src/materials/materials.service.ts` | `@nestjs/common` `../prisma/prisma.service` `./dto/create-material.dto` `./dto/create-material-price.dto` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `@nestjs/platform-express` `multer` `../../auth/guards/jwt-auth.guard` `./dwg-engine.service` `./scale-param` |
| `backend/src/modules/dwg-engine/dwg-engine.module.ts` | `@nestjs/common` `./dwg-engine.controller` `./dwg-engine.service` |
| `backend/src/modules/dwg-engine/dwg-engine.service.ts` | `@nestjs/common` |
| `backend/src/modules/dwg-engine/python/converter.py` | `dataclasses` `pathlib` `ezdxf` |
| `backend/src/modules/dwg-engine/python/geometry.py` | `__future__` `typing` `pydantic` `converter` |
| `backend/src/modules/dwg-engine/python/graph.py` | `collections` `typing` `converter` |
| `backend/src/modules/dwg-engine/python/main.py` | `collections` `fastapi` `fastapi.middleware.cors` `fastapi.middleware.gzip` `fastapi.responses` `converter` `topology` `geometry` `models` `pipe_segments` |
| `backend/src/modules/dwg-engine/python/models.py` | `pydantic` |
| `backend/src/modules/dwg-engine/python/parse_worker.py` | `main` |
| `backend/src/modules/dwg-engine/python/pipe_segments.py` | `typing` `converter` `collections` |
| `backend/src/modules/dwg-engine/python/tests/test_block_to_line_split.py` | `__future__` `pipe_segments` |
| `backend/src/modules/dwg-engine/python/tests/test_pipe_segments.py` | `__future__` `pipe_segments` |
| `backend/src/modules/dwg-engine/python/tests/test_scale_normalization.py` | `__future__` `main` |
| `backend/src/modules/dwg-engine/python/topology.py` | `collections` `graph` `models` `converter` |
| `backend/src/modules/dwg-engine/python/upload_worker.py` | `converter` `geometry` `main` |
| `backend/src/modules/dwg-engine/scale-param.test.ts` | `node:assert` `./scale-param` |
| `backend/src/modules/excel-engine/excel-engine.controller.ts` | `@nestjs/platform-express` `multer` `../../auth/guards/jwt-auth.guard` `./excel-engine.service` |
| `backend/src/modules/excel-engine/excel-engine.module.ts` | `@nestjs/common` `../../prisma/prisma.module` `./excel-engine.service` `./excel-engine.controller` |
| `backend/src/modules/excel-engine/excel-engine.service.ts` | `@nestjs/common` `../../prisma/prisma.service` `xlsx` |
| `backend/src/modules/excel-grid/excel-grid.controller.ts` | `@nestjs/common` `@nestjs/platform-express` `multer` `../../auth/guards/jwt-auth.guard` `./excel-grid.service` |
| `backend/src/modules/excel-grid/excel-grid.module.ts` | `@nestjs/common` `../../prisma/prisma.module` `./excel-grid.service` `./excel-grid.controller` |
| `backend/src/modules/excel-grid/excel-grid.service.ts` | `@nestjs/common` `xlsx` `../../prisma/prisma.service` `./sheet-discipline` `./standart-sema` |
| `backend/src/modules/labor-matching/labor-matching.controller.ts` | `@nestjs/common` `./labor-matching.service` `../../auth/guards/jwt-auth.guard` `../../auth/decorators/current-user.decorator` `../../auth/guards/roles.guard` `../../auth/decorators/roles.decorator` |
| `backend/src/modules/labor-matching/labor-matching.module.ts` | `@nestjs/common` `./labor-matching.service` `./labor-matching.controller` `../matching/matching.module` |
| `backend/src/modules/labor-matching/labor-matching.service.ts` | `@nestjs/common` `../../prisma/prisma.service` `../matching/matching.service` `../matching/tag-generator` `../matching/types` |
| `backend/src/modules/matching/ad-resolver.ts` | `./ad-cins-sozlugu` `./normalizer` |
| `backend/src/modules/matching/conversion.ts` | `./normalizer` |
| `backend/src/modules/matching/index/line-parser.ts` | `../normalizer` `../ad-resolver` `../conversion` `./product-index` `./types` |
| `backend/src/modules/matching/index/outcome-mapper.ts` | `../pricing` `../normalizer` `../shared-tag-matcher` `./query-engine` `../types` `./types` |
| `backend/src/modules/matching/index/product-index.ts` | `crypto` `../normalizer` `../ad-resolver` `../conversion` |
| `backend/src/modules/matching/index/query-engine.ts` | `../conversion` `../normalizer` `./product-index` `../shared-tag-matcher` `./vocab` `./line-parser` `./types` |
| `backend/src/modules/matching/index/types.ts` | `../conversion` `./product-index` |
| `backend/src/modules/matching/index/vocab.ts` | `./types` |
| `backend/src/modules/matching/matching.controller.ts` | `@nestjs/common` `../../auth/guards/jwt-auth.guard` `./matching.service` `./terminology.service` |
| `backend/src/modules/matching/matching.module.ts` | `@nestjs/common` `../../prisma/prisma.module` `./matching.service` `./matching.controller` `./terminology.service` `../../exchange-rates/exchange-rates.module` |
| `backend/src/modules/matching/matching.service.ts` | `@nestjs/common` `../../prisma/prisma.service` `./tag-generator` `./pricing` `./normalizer` `./conversion` `./terminology.service` `./index/line-parser` `./index/query-engine` `./index/outcome-mapper` `./index/product-index` `./index/types` `../../exchange-rates/exchange-rates.service` `./types` `./shared-tag-matcher` |
| `backend/src/modules/matching/shared-tag-matcher.ts` | `./ad-resolver` |
| `backend/src/modules/matching/tag-generator.ts` | `./types` `./ad-resolver` |
| `backend/src/modules/matching/terminology.service.ts` | `@nestjs/common` `../../prisma/prisma.service` `./normalizer` `./conversion` |
| `backend/src/prisma/prisma.module.ts` | `@nestjs/common` `./prisma.service` |
| `backend/src/prisma/prisma.service.ts` | `@nestjs/common` `@prisma/client` |
| `backend/src/quote-formats/format-engine.ts` | `exceljs` |
| `backend/src/quote-formats/quote-formats.controller.ts` | `@nestjs/platform-express` `express` `multer` `./quote-formats.service` `../auth/guards/jwt-auth.guard` `../auth/decorators/current-user.decorator` |
| `backend/src/quote-formats/quote-formats.module.ts` | `@nestjs/common` `./quote-formats.service` `./quote-formats.controller` |
| `backend/src/quote-formats/quote-formats.service.ts` | `@nestjs/common` `../prisma/prisma.service` `exceljs` |
| `backend/src/quotes/dto/create-quote.dto.ts` | `class-validator` `class-transformer` |
| `backend/src/quotes/export-engine.ts` | `exceljs` `./standart-cikti` |
| `backend/src/quotes/quotes.controller.ts` | `@nestjs/platform-express` `express` `./quotes.service` `./dto/create-quote.dto` `../auth/guards/jwt-auth.guard` `../auth/decorators/current-user.decorator` `multer` |
| `backend/src/quotes/quotes.module.ts` | `@nestjs/common` `./quotes.service` `./quotes.controller` `../ai/ai.module` `../prisma/prisma.module` `../exchange-rates/exchange-rates.module` |
| `backend/src/quotes/quotes.service.ts` | `@nestjs/common` `../prisma/prisma.service` `./dto/create-quote.dto` `xlsx` `exceljs` `./export-engine` `./standart-cikti` `../quote-formats/format-engine` `../exchange-rates/exchange-rates.service` |
| `backend/src/quotes/standart-cikti.ts` | `exceljs` |
| `backend/src/surum.ts` | `./surum.generated` |
| `backend/src/utils/etiket-display.ts` | `../modules/matching/tag-generator` `../modules/matching/ad-resolver` |
| `backend/src/utils/xlsx-to-pdf.ts` | `child_process` `fs/promises` `os` `path` |
| `backend/test/admin-import-test.ts` | `../src/utils/etiket-display` |
| `backend/test/audit-canli-kosum.ts` | `@prisma/client` `fs` `../src/modules/matching/matching.service` `../src/modules/matching/terminology.service` `../src/admin/admin.service` `../src/library/library.service` `../src/modules/excel-grid/excel-grid.service` `../src/modules/matching/conversion` |
| `backend/test/audit-real-excel.ts` | `xlsx` `../src/modules/matching/index/line-parser` `../src/modules/matching/index/product-index` |
| `backend/test/build-sha-kablolama-test.ts` | `fs` `path` `../src/health.controller` |
| `backend/test/contract-test.ts` | `../src/modules/matching/matching.service` `../src/modules/matching/terminology.service` `../src/modules/matching/types` |
| `backend/test/conversion-test.ts` | `../src/modules/matching/conversion` |
| `backend/test/excel-grid-test.ts` | `xlsx` `../src/modules/excel-grid/excel-grid.service` |
| `backend/test/export-format-test.ts` | `exceljs` `../src/quotes/export-engine` `../src/quote-formats/format-engine` |
| `backend/test/export-live-sim-test.ts` | `exceljs` `../src/quotes/quotes.service` |
| `backend/test/faz0-gs7-probe.ts` | `fs` `path` `../src/modules/excel-grid/excel-grid.service` |
| `backend/test/fixture-anonim.ts` | `fs` `path` `jszip` |
| `backend/test/fixture-dogrula.ts` | `fs` `path` `./fixture-anonim` `../src/modules/excel-grid/excel-grid.service` `jszip` |
| `backend/test/gercek-dosya-test.ts` | `fs` `../src/modules/excel-grid/excel-grid.service` `../src/quotes/quotes.service` `../src/modules/matching/matching.service` `../src/modules/matching/terminology.service` `../src/modules/matching/index/product-index` `../src/quote-formats/format-engine` `../src/quotes/export-engine` |
| `backend/test/gs6b-teshis.ts` | `fs` `../src/modules/excel-grid/excel-grid.service` |
| `backend/test/index-engine-test.ts` | `../src/modules/matching/index/product-index` `../src/modules/matching/index/line-parser` `../src/modules/matching/index/query-engine` `../src/modules/matching/index/outcome-mapper` `../src/modules/matching/index/types` `../src/modules/matching/matching.service` `../src/modules/matching/terminology.service` `../src/modules/matching/conversion` |
| `backend/test/kd11-toplam-yollari-test.ts` | `fs` `path` `../src/modules/excel-grid/excel-grid.service` `../../frontend/lib/pricing` |
| `backend/test/kd12-baslik-satiri-test.ts` | `fs` `path` `../src/modules/excel-grid/excel-grid.service` |
| `backend/test/kd9-kur-olcutu-test.ts` | `../../frontend/lib/pricing` |
| `backend/test/kl-liste-ekleme-test.ts` | `@prisma/client` `../src/labor-firms/labor-firms.service` `../src/library/library.service` `../src/modules/matching/matching.service` `../src/modules/matching/terminology.service` |
| `backend/test/labor-matching-test.ts` | `../src/modules/matching/matching.service` `../src/modules/labor-matching/labor-matching.service` `../src/modules/matching/terminology.service` |
| `backend/test/labor-sheet-test.ts` | `@prisma/client` `../src/labor-firms/labor-firms.service` `../src/modules/matching/matching.service` `../src/modules/matching/terminology.service` |
| `backend/test/library-transfer-test.ts` | `../src/library/library-sheet-builder` |
| `backend/test/manifest-kapisi.ts` | `fs` `path` |
| `backend/test/matching-regression.ts` | `@prisma/client` `../src/modules/matching/matching.service` `../src/modules/matching/terminology.service` `../src/modules/matching/tag-generator` `../src/modules/matching/normalizer` |
| `backend/test/matching-unit-test.ts` | `../src/modules/matching/matching.service` `../src/modules/matching/terminology.service` |
| `backend/test/onceden-fiyatli-test.ts` | `fs` `../src/modules/excel-grid/excel-grid.service` |
| `backend/test/pano18-para-birimi-test.ts` | `fs` `exceljs` `../src/quotes/standart-cikti` `../src/quotes/export-engine` `../src/quote-formats/format-engine` |
| `backend/test/perf-profil.ts` | `fs` `../src/modules/excel-grid/excel-grid.service` `../src/modules/matching/index/product-index` `../src/modules/matching/index/line-parser` `../src/modules/matching/index/query-engine` `../src/quotes/export-engine` `../src/quotes/standart-cikti` `../src/quote-formats/format-engine` `exceljs` |
| `backend/test/pk3-kimlik-haritasi-test.ts` | `./fixture-anonim` |
| `backend/test/pk3-repo-kapsama-test.ts` | `fs` `path` `child_process` |
| `backend/test/pk9-sessiz-indeks-test.ts` | `../src/modules/matching/matching.service` `../src/modules/matching/terminology.service` |
| `backend/test/regression-all.ts` | `child_process` |
| `backend/test/spec-regression-test.ts` | `../src/modules/matching/matching.service` `../src/modules/matching/terminology.service` |
| `backend/test/standart-cikti-test.ts` | `fs` `path` `exceljs` `../src/quotes/standart-cikti` `../src/modules/excel-grid/excel-grid.service` |
| `backend/test/standart-sema-test.ts` | `fs` `path` `xlsx` `../src/modules/excel-grid/excel-grid.service` `../src/modules/excel-grid/standart-sema` |
| `backend/test/tam-zincir.ts` | `child_process` `path` |
| `frontend/app/(protected)/dashboard/page.tsx` | `react` `next/navigation` `@/lib/api` `@/hooks/use-toast` `@/contexts/CapabilitiesContext` `@/components/dashboard/QuickStart` `@/components/dashboard/RecentQuotes` `@/components/dashboard/QuickAccess` |
| `frontend/app/(protected)/dwg-workspace/page.tsx` | `next/navigation` `next/dynamic` `lucide-react` `next/link` `@/components/dwg-metraj/types` |
| `frontend/app/(protected)/labor-firms/[firmaId]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/components/ui/button` `@/components/ui/card` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` `@/components/excel-grid/ExcelGrid` `@/components/library/InlineFirmEntry` `@/components/excel-grid/types` |
| `frontend/app/(protected)/labor-firms/page.tsx` | `react` `next/link` `next/navigation` `lucide-react` `@/components/ui/button` `@/components/ui/card` `@/components/ui/input` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` `@/contexts/CapabilitiesContext` |
| `frontend/app/(protected)/labor/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/components/ui/card` `@/components/ui/button` `@/components/ui/input` `@/components/ui/label` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` `@/lib/utils` |
| `frontend/app/(protected)/layout.tsx` | `react` `next/navigation` `next/link` `@/contexts/CapabilitiesContext` `@/components/layout/Sidebar` `@/components/layout/Breadcrumb` |
| `frontend/app/(protected)/library/brand/[brandId]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/components/ui/button` `@/components/ui/card` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` `@/components/excel-grid/ExcelGrid` `@/components/excel-grid/types` |
| `frontend/app/(protected)/library/electrical-brands/page.tsx` | `react` `next/link` `lucide-react` `@/components/ui/card` `@/components/ui/button` `@/components/ui/input` `@/components/ui/label` `@/components/ui/dialog` `@/components/ui/select` `@/lib/api` `@/hooks/use-toast` |
| `frontend/app/(protected)/library/equipment/page.tsx` | `react` `next/link` `lucide-react` `@/components/ui/button` `@/components/ui/input` `@/components/ui/label` `@/hooks/use-toast` `@/hooks/use-confirm` `@/lib/api` |
| `frontend/app/(protected)/library/mechanical-brands/page.tsx` | `react` `next/link` `next/navigation` `lucide-react` `@/components/ui/card` `@/components/ui/button` `@/components/ui/input` `@/components/ui/label` `@/components/ui/dialog` `@/components/ui/select` `@/lib/api` `@/hooks/use-toast` `@/components/library/ManualBrandModal` |
| `frontend/app/(protected)/library/page.tsx` | `react` `next/link` `lucide-react` `@/components/ui/button` `@/components/ui/card` `@/components/ui/input` `@/components/ui/label` `@/hooks/use-toast` `@/hooks/use-confirm` `@/lib/api` `@/lib/pricing` |
| `frontend/app/(protected)/materials/[brandId]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/components/ui/card` `@/components/ui/button` `@/components/ui/input` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` `@/lib/utils` `@/components/excel-grid/ExcelGrid` `@/components/excel-grid/SheetTabs` `@/components/excel-grid/types` |
| `frontend/app/(protected)/materials/electrical/page.tsx` | `react` `next/link` `lucide-react` `@/components/ui/card` `@/components/ui/button` `@/components/ui/input` `@/components/ui/label` `@/components/ui/dialog` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` |
| `frontend/app/(protected)/materials/mechanical/page.tsx` | `react` `next/link` `lucide-react` `@/components/ui/card` `@/components/ui/button` `@/components/ui/input` `@/components/ui/label` `@/components/ui/dialog` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` |
| `frontend/app/(protected)/materials/page.tsx` | `react` `next/navigation` `lucide-react` |
| `frontend/app/(protected)/profile/page.tsx` | `react` `next/navigation` `@/components/ui/button` `@/lib/api` `@/lib/utils` |
| `frontend/app/(protected)/quote-formats/page.tsx` | `react` `next/link` `@/components/ui/button` `@/components/ui/card` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` |
| `frontend/app/(protected)/quotes/[id]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/components/ui/button` `@/components/ui/card` `@/lib/api` `@/lib/utils` `@/lib/export-download` `@/components/excel-grid/ExcelGrid` `@/components/excel-grid/SheetTabs` `@/components/excel-grid/types` `@/hooks/use-currency` `@/contexts/CapabilitiesContext` `@/lib/disiplin` `@/types/quotes` `@/types` |
| `frontend/app/(protected)/quotes/new/page.tsx` | `react` `next/navigation` `next/link` `@/components/ui/button` `@/lib/export-download` `@/lib/disiplin` `@/components/ui/card` `@/components/ui/input` `@/components/ui/label` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` `@/lib/utils` `@/components/excel-grid/ExcelGrid` `@/components/excel-grid/SheetTabs` `@/components/quotes/ColumnManagerPanel` `@/components/excel-grid/types` `@/contexts/CapabilitiesContext` `@/components/dwg-metraj/types` `@/components/dwg-metraj/MetrajEditor` `@/lib/parse-material-text` `@/lib/merge-multisheet` `@/lib/pricing` `@/types` `@/hooks/use-currency` |
| `frontend/app/(protected)/quotes/page.tsx` | `react` `next/navigation` `lucide-react` `@/components/ui/button` `@/components/ui/card` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` |
| `frontend/app/admin/brands/page.tsx` | `react` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` `@/components/ui/button` `@/components/ui/input` `@/components/ui/badge` `@/components/ui/card` |
| `frontend/app/admin/layout.tsx` | `react` `next/navigation` `@/components/admin/AdminSidebar` |
| `frontend/app/admin/page.tsx` | `react` `next/navigation` |
| `frontend/app/admin/stats/page.tsx` | `react` `@/components/ui/button` `@/components/ui/badge` `@/components/ui/card` `@/lib/admin-stats` |
| `frontend/app/admin/users/page.tsx` | `react` `lucide-react` `@/lib/api` `@/components/ui/input` `@/components/ui/button` `@/components/ui/badge` `@/components/ui/card` |
| `frontend/app/dev/grid-test/page.tsx` | `react` `@/components/excel-grid/ExcelGrid` `@/components/excel-grid/types` |
| `frontend/app/layout.tsx` | `next` `next/font/google` `@/components/ui/toaster` `@/components/ui/confirm-dialog` `./globals.css` |
| `frontend/app/login/page.tsx` | `react` `next/navigation` `next/link` `@/lib/api` `@/components/ui/button` `@/components/ui/input` `@/components/ui/label` `@/components/ui/card` `@/hooks/use-toast` |
| `frontend/app/page.tsx` | `react` `next/navigation` |
| `frontend/app/register/page.tsx` | `react` `next/navigation` `next/link` `@/lib/api` `@/components/ui/button` `@/components/ui/input` `@/components/ui/label` `@/components/ui/card` `@/hooks/use-toast` |
| `frontend/components/admin/AdminSidebar.tsx` | `next/link` `next/navigation` `@/lib/utils` |
| `frontend/components/dashboard/QuickAccess.tsx` | `next/link` `lucide-react` |
| `frontend/components/dashboard/QuickStart.tsx` | `react` `lucide-react` `@/lib/utils` `@/hooks/use-toast` |
| `frontend/components/dashboard/RecentQuotes.tsx` | `react` `next/link` `lucide-react` `@/lib/api` |
| `frontend/components/dwg-diameter-engine/DiameterLegendPanel.tsx` | `react` `lucide-react` `@/components/dwg-metraj/diameter-colors` `./types` |
| `frontend/components/dwg-diameter-engine/types.ts` | `@/components/dwg-metraj/types` `@/components/dwg-workspace/types` `@/components/dwg-metraj/diameter-colors` `@/components/dwg-metraj/constants` |
| `frontend/components/dwg-diameter-engine/useLayerCalc.ts` | `react` `@/lib/api` `@/hooks/use-toast` `@/components/dwg-metraj` `@/components/dwg-workspace/types` `./types` |
| `frontend/components/dwg-diameter-engine/useOriginalColorState.ts` | `react` |
| `frontend/components/dwg-metraj/DiameterEditPopup.tsx` | `react` `lucide-react` `./types` `./diameter-colors` |
| `frontend/components/dwg-metraj/DwgUploader.tsx` | `react` `lucide-react` `@/lib/utils` `@/hooks/use-toast` `@/lib/api` `./types` `@/components/dwg-workspace` |
| `frontend/components/dwg-metraj/MetrajEditor.tsx` | `react` `lucide-react` `@/lib/utils` `@/hooks/use-toast` `./types` |
| `frontend/components/dwg-metraj/diameter-colors.ts` | `./constants` |
| `frontend/components/dwg-metraj/unit-detection.test.ts` | `vitest` `./unit-detection` |
| `frontend/components/dwg-tagging/BucketPanel.tsx` | `react` `lucide-react` `@/lib/utils` `@/hooks/use-toast` `./useTaggingStore` |
| `frontend/components/dwg-tagging/useTaggingStore.ts` | `zustand` `zustand/middleware` `@/components/dwg-metraj/diameter-colors` |
| `frontend/components/dwg-viewer/DxfCanvasViewer.tsx` | `react` `rbush` `lucide-react` `@/lib/api` `./types` `@/components/dwg-metraj/types` `@/components/dwg-metraj/diameter-colors` `@/components/dwg-metraj/constants` `./segment-length` `./useViewport` `./aci-colors` |
| `frontend/components/dwg-viewer/segment-length.test.ts` | `vitest` `./segment-length` |
| `frontend/components/dwg-viewer/useViewport.ts` | `react` `./types` |
| `frontend/components/dwg-workspace/DwgProjectWorkspace.tsx` | `react` `lucide-react` `@/hooks/use-toast` `@/hooks/use-confirm` `@/lib/api` `@/components/dwg-viewer` `@/components/dwg-metraj` `@/components/dwg-metraj/types` `./LayerInfoSidebar` `./LayerVisibilityPanel` `./MetrajSummaryPanel` `./EquipmentDetailPopup` `./useWorkspaceState` `./types` `@/components/dwg-tagging` `@/components/dwg-metraj/diameter-colors` `@/components/dwg-metraj/constants` `@/lib/metraj-excel` |
| `frontend/components/dwg-workspace/EquipmentDetailPopup.tsx` | `react` `lucide-react` `@/lib/api` `@/hooks/use-toast` `./types` |
| `frontend/components/dwg-workspace/LayerInfoSidebar.tsx` | `react` `lucide-react` `./types` `@/components/dwg-metraj/constants` |
| `frontend/components/dwg-workspace/LayerVisibilityPanel.tsx` | `react` `lucide-react` `@/lib/utils` |
| `frontend/components/dwg-workspace/MetrajSummaryPanel.tsx` | `react` `lucide-react` `./types` `@/components/dwg-metraj/diameter-colors` `@/components/dwg-metraj/constants` |
| `frontend/components/dwg-workspace/types.ts` | `@/components/dwg-metraj` |
| `frontend/components/dwg-workspace/useWorkspaceState.ts` | `react` |
| `frontend/components/excel-grid/CustomDropdown.tsx` | `react` `react-dom` |
| `frontend/components/excel-grid/ExcelGrid.tsx` | `react` `react-dom` `ag-grid-react` `ag-grid-community` `./types` `./useFillHandle` `./discount-utils` `./CustomDropdown` `./fill-down` `@/lib/parse-material-text` `@/lib/pricing` `./build-material-context` `./aday-ayirt-edicilik` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` `ag-grid-community/styles/ag-grid.css` `ag-grid-community/styles/ag-theme-alpine.css` `./fill-handle.css` |
| `frontend/components/excel-grid/SheetTabs.tsx` | `react` |
| `frontend/components/excel-grid/aday-ayirt-edicilik.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/components/excel-grid/build-material-context.test.ts` | `vitest` `./build-material-context` |
| `frontend/components/excel-grid/discount-utils.test.ts` | `vitest` `./discount-utils` |
| `frontend/components/excel-grid/fill-down.test.ts` | `vitest` `./fill-down` |
| `frontend/components/excel-grid/fill-down.ts` | `../../lib/pricing` |
| `frontend/components/excel-grid/useFillHandle.tsx` | `react` `ag-grid-react` `ag-grid-community` |
| `frontend/components/layout/Breadcrumb.tsx` | `next/navigation` `next/link` `lucide-react` |
| `frontend/components/layout/Sidebar.tsx` | `next/navigation` `next/link` `@/lib/utils` |
| `frontend/components/library/InlineFirmEntry.tsx` | `react` `@/lib/api` `@/hooks/use-toast` `@/components/excel-grid/ExcelGrid` `@/components/excel-grid/types` |
| `frontend/components/library/ManualBrandModal.tsx` | `react` `lucide-react` `@/components/ui/button` `@/components/ui/input` `@/lib/api` `@/hooks/use-toast` `@/hooks/use-confirm` `@/components/excel-grid/ExcelGrid` `@/components/excel-grid/types` |
| `frontend/components/quotes/ColumnManagerPanel.tsx` | `react` `lucide-react` |
| `frontend/components/ui/badge.tsx` | `react` `class-variance-authority` `@/lib/utils` |
| `frontend/components/ui/button.tsx` | `react` `@radix-ui/react-slot` `class-variance-authority` `@/lib/utils` |
| `frontend/components/ui/card.tsx` | `react` `@/lib/utils` |
| `frontend/components/ui/confirm-dialog.tsx` | `react` `lucide-react` `@/hooks/use-confirm` `@/lib/utils` |
| `frontend/components/ui/dialog.tsx` | `react` `@radix-ui/react-dialog` `lucide-react` `@/lib/utils` |
| `frontend/components/ui/input.tsx` | `react` `@/lib/utils` |
| `frontend/components/ui/label.tsx` | `react` `@radix-ui/react-label` `class-variance-authority` `@/lib/utils` |
| `frontend/components/ui/select.tsx` | `react` `@radix-ui/react-select` `lucide-react` `@/lib/utils` |
| `frontend/components/ui/table.tsx` | `react` `@/lib/utils` |
| `frontend/components/ui/toast.tsx` | `react` `@radix-ui/react-toast` `class-variance-authority` `lucide-react` `@/lib/utils` |
| `frontend/components/ui/toaster.tsx` | `@/hooks/use-toast` |
| `frontend/contexts/CapabilitiesContext.tsx` | `react` `@/lib/api` |
| `frontend/e2e-golden/artefakt-dizini.cjs` | `node:fs` `node:path` `node:child_process` |
| `frontend/e2e-golden/bolum-f-kabul.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` `./helpers` |
| `frontend/e2e-golden/faz0-gs7-teshis.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` |
| `frontend/e2e-golden/firma-a-golden.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` `../lib/pricing` |
| `frontend/e2e-golden/global-setup.mjs` | `node:fs` `node:path` `node:url` `node:module` `./artefakt-dizini.cjs` `./surum-kapisi.cjs` `jsonwebtoken` |
| `frontend/e2e-golden/golden.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` |
| `frontend/e2e-golden/gs-kalicilik.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` |
| `frontend/e2e-golden/helpers.ts` | `@playwright/test` |
| `frontend/e2e-golden/pu4-popup-genislik.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` `./helpers` |
| `frontend/e2e-golden/run.mjs` | `node:child_process` `node:path` `node:url` `./artefakt-dizini.cjs` `./surum-kapisi.cjs` |
| `frontend/e2e-golden/surum-kapisi.cjs` | `node:fs` `node:path` `node:child_process` |
| `frontend/e2e-golden/verify.mjs` | `node:fs` `node:path` `node:url` `node:module` `./sayi-ayristirma.mjs` `./artefakt-dizini.cjs` |
| `frontend/e2e/grid.spec.ts` | `@playwright/test` |
| `frontend/hooks/use-confirm.ts` | `react` |
| `frontend/hooks/use-currency.ts` | `react` `@/lib/api` `@/types/quotes` |
| `frontend/hooks/use-toast.ts` | `react` `@/components/ui/toast` |
| `frontend/lib/admin-stats.ts` | `@/lib/api` |
| `frontend/lib/api.ts` | `axios` |
| `frontend/lib/export-download.ts` | `@/lib/api` `@/hooks/use-toast` |
| `frontend/lib/gs6b-golge-kurali.test.ts` | `vitest` `fs` `path` |
| `frontend/lib/merge-multisheet.test.ts` | `vitest` `./merge-multisheet` `@/components/excel-grid/types` |
| `frontend/lib/parse-material-text.test.ts` | `vitest` `./parse-material-text` |
| `frontend/lib/popup-secici-sozlesmesi.test.ts` | `vitest` `fs` `path` |
| `frontend/lib/pricing.test.ts` | `vitest` `./pricing` |
| `frontend/lib/sayi-ayristirma.test.ts` | `vitest` `fs` `path` `../e2e-golden/sayi-ayristirma.mjs` |
| `frontend/lib/utils.ts` | `clsx` `tailwind-merge` |
| `frontend/next.config.js` | `@cloudflare/next-on-pages/next-dev` |
| `frontend/playwright.config.ts` | `@playwright/test` |
| `frontend/playwright.golden.config.ts` | `@playwright/test` `./e2e-golden/artefakt-dizini.cjs` |
| `frontend/scripts/surum-yaz.js` | `fs` `path` `child_process` |
| `frontend/tailwind.config.ts` | `tailwindcss` `tailwindcss-animate` |
| `frontend/types/quotes.ts` | `./index` |
| `frontend/vitest.config.ts` | `vitest/config` |

## 3 · Uc noktalar

| Dosya | Uc |
|---|---|
| `backend/src/admin/admin.controller.ts` | `GET /admin/stats` |
| `backend/src/admin/admin.controller.ts` | `GET /admin/ai-stats` |
| `backend/src/admin/admin.controller.ts` | `GET /admin/ai-tasks` |
| `backend/src/admin/admin.controller.ts` | `PATCH /admin/ai-tasks` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/ai-health-check` |
| `backend/src/admin/admin.controller.ts` | `GET /admin/users` |
| `backend/src/admin/admin.controller.ts` | `PATCH /admin/users/:id/role` |
| `backend/src/admin/admin.controller.ts` | `PATCH /admin/users/:id/status` |
| `backend/src/admin/admin.controller.ts` | `PATCH /admin/users/:id/tier` |
| `backend/src/admin/admin.controller.ts` | `DELETE /admin/users/:id` |
| `backend/src/admin/admin.controller.ts` | `GET /admin/users/:id/subscriptions` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/users/:id/subscriptions` |
| `backend/src/admin/admin.controller.ts` | `DELETE /admin/users/:userId/subscriptions/:subId` |
| `backend/src/admin/admin.controller.ts` | `GET /admin/settings` |
| `backend/src/admin/admin.controller.ts` | `PATCH /admin/settings` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/reindex-products` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/brands/:brandId/price-lists` |
| `backend/src/admin/admin.controller.ts` | `DELETE /admin/price-lists/:id` |
| `backend/src/admin/admin.controller.ts` | `GET /admin/brands/:brandId/materials` |
| `backend/src/admin/admin.controller.ts` | `GET /admin/price-lists/:id/materials` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/materials/extract-pdf` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/materials/parse-full-excel` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/brands/:brandId/save-from-sheets` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/brands/:brandId/import-excel/preview` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/price-lists/:id/import-excel/preview` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/brands/:brandId/import-excel/commit` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/price-lists/:id/import-excel/commit` |
| `backend/src/admin/admin.controller.ts` | `POST /admin/materials/save-bulk` |
| `backend/src/ai/ai.controller.ts` | `POST /ai/analyze` |
| `backend/src/auth/auth.controller.ts` | `POST /auth/register` |
| `backend/src/auth/auth.controller.ts` | `POST /auth/login` |
| `backend/src/auth/auth.controller.ts` | `GET /auth/me` |
| `backend/src/bootstrap.controller.ts` | `POST /bootstrap/make-admin` |
| `backend/src/brands/brands.controller.ts` | `GET /brands` |
| `backend/src/brands/brands.controller.ts` | `GET /brands/search` |
| `backend/src/brands/brands.controller.ts` | `GET /brands/price-lists/:listId/materials` |
| `backend/src/brands/brands.controller.ts` | `GET /brands/:id` |
| `backend/src/brands/brands.controller.ts` | `GET /brands/:id/price-lists` |
| `backend/src/brands/brands.controller.ts` | `POST /brands` |
| `backend/src/brands/brands.controller.ts` | `PUT /brands/:id` |
| `backend/src/brands/brands.controller.ts` | `DELETE /brands/:id` |
| `backend/src/exchange-rates/exchange-rates.controller.ts` | `GET /exchange-rates` |
| `backend/src/health.controller.ts` | `GET /health` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `GET /labor-firms` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `GET /labor-firms/price-lists/:listId/items` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `GET /labor-firms/:id` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `GET /labor-firms/:id/price-lists` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `POST /labor-firms` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `PUT /labor-firms/:id` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `DELETE /labor-firms/:id` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/:id/price-lists` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `DELETE /labor-firms/price-lists/:listId` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `PUT /labor-firms/price-items/:id` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/price-items/bulk-update` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `DELETE /labor-firms/price-items/:id` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `GET /labor-firms/price-lists/:listId/sheets` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/price-lists/:listId/save-sheets` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/:id/save-bulk` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/:id/parse-full-excel` |
| `backend/src/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/:id/save-from-sheets` |
| `backend/src/labor/labor.controller.ts` | `GET /labor` |
| `backend/src/labor/labor.controller.ts` | `GET /labor/:id` |
| `backend/src/labor/labor.controller.ts` | `POST /labor` |
| `backend/src/labor/labor.controller.ts` | `PUT /labor/:id` |
| `backend/src/labor/labor.controller.ts` | `DELETE /labor/:id` |
| `backend/src/library/library.controller.ts` | `GET /library` |
| `backend/src/library/library.controller.ts` | `GET /library/brands` |
| `backend/src/library/library.controller.ts` | `GET /library/equipment` |
| `backend/src/library/library.controller.ts` | `POST /library` |
| `backend/src/library/library.controller.ts` | `POST /library/manual-brand` |
| `backend/src/library/library.controller.ts` | `PUT /library/:id` |
| `backend/src/library/library.controller.ts` | `POST /library/bulk-discount` |
| `backend/src/library/library.controller.ts` | `POST /library/bulk-update-items` |
| `backend/src/library/library.controller.ts` | `POST /library/import-price-list` |
| `backend/src/library/library.controller.ts` | `GET /library/brand/:brandId/sheets` |
| `backend/src/library/library.controller.ts` | `POST /library/brand/:brandId/save-sheets` |
| `backend/src/library/library.controller.ts` | `DELETE /library/brand/:brandId` |
| `backend/src/library/library.controller.ts` | `DELETE /library/:id` |
| `backend/src/materials/materials.controller.ts` | `GET /materials` |
| `backend/src/materials/materials.controller.ts` | `GET /materials/:id` |
| `backend/src/materials/materials.controller.ts` | `POST /materials` |
| `backend/src/materials/materials.controller.ts` | `PUT /materials/:id` |
| `backend/src/materials/materials.controller.ts` | `DELETE /materials/:id` |
| `backend/src/materials/materials.controller.ts` | `POST /materials/price` |
| `backend/src/materials/materials.controller.ts` | `DELETE /materials/:materialId/price/:brandId` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `POST /dwg-engine/layers` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `POST /dwg-engine/parse` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `POST /dwg-engine/convert` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `GET /dwg-engine/health` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `POST /dwg-engine/upload` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `GET /dwg-engine/status/:fileId` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `GET /dwg-engine/geometry/:fileId` |
| `backend/src/modules/excel-engine/excel-engine.controller.ts` | `POST /excel-engine/analyze` |
| `backend/src/modules/excel-grid/excel-grid.controller.ts` | `POST /excel-grid/prepare` |
| `backend/src/modules/labor-matching/labor-matching.controller.ts` | `POST /labor-matching/bulk-match` |
| `backend/src/modules/labor-matching/labor-matching.controller.ts` | `POST /labor-matching/remember` |
| `backend/src/modules/labor-matching/labor-matching.controller.ts` | `POST /labor-matching/reindex` |
| `backend/src/modules/labor-matching/labor-matching.controller.ts` | `POST /labor-matching/backfill-tags` |
| `backend/src/modules/matching/matching.controller.ts` | `POST /matching/bulk-match` |
| `backend/src/modules/matching/matching.controller.ts` | `POST /matching/remember` |
| `backend/src/modules/matching/matching.controller.ts` | `GET /matching/index-health` |
| `backend/src/modules/matching/matching.controller.ts` | `GET /matching/aliases` |
| `backend/src/modules/matching/matching.controller.ts` | `POST /matching/aliases` |
| `backend/src/modules/matching/matching.controller.ts` | `DELETE /matching/aliases/:id` |
| `backend/src/modules/matching/matching.controller.ts` | `POST /matching/backfill-tags` |
| `backend/src/modules/matching/matching.controller.ts` | `POST /matching/generate-tags` |
| `backend/src/quote-formats/quote-formats.controller.ts` | `POST /quote-formats` |
| `backend/src/quote-formats/quote-formats.controller.ts` | `GET /quote-formats` |
| `backend/src/quote-formats/quote-formats.controller.ts` | `GET /quote-formats/sample` |
| `backend/src/quote-formats/quote-formats.controller.ts` | `GET /quote-formats/:id/preview` |
| `backend/src/quote-formats/quote-formats.controller.ts` | `GET /quote-formats/:id/preview-pdf` |
| `backend/src/quote-formats/quote-formats.controller.ts` | `POST /quote-formats/:id/file` |
| `backend/src/quote-formats/quote-formats.controller.ts` | `PATCH /quote-formats/:id` |
| `backend/src/quote-formats/quote-formats.controller.ts` | `DELETE /quote-formats/:id` |
| `backend/src/quotes/quotes.controller.ts` | `POST /quotes/upload-excel` |
| `backend/src/quotes/quotes.controller.ts` | `POST /quotes` |
| `backend/src/quotes/quotes.controller.ts` | `GET /quotes` |
| `backend/src/quotes/quotes.controller.ts` | `PATCH /quotes/:id/info` |
| `backend/src/quotes/quotes.controller.ts` | `POST /quotes/:id/export` |
| `backend/src/quotes/quotes.controller.ts` | `GET /quotes/:id/export-priced` |
| `backend/src/quotes/quotes.controller.ts` | `GET /quotes/:id/exports` |
| `backend/src/quotes/quotes.controller.ts` | `GET /quotes/:id/exports/:rev` |
| `backend/src/quotes/quotes.controller.ts` | `GET /quotes/:id` |
| `backend/src/quotes/quotes.controller.ts` | `DELETE /quotes/:id` |

## 4 · test:* scriptleri (package.json`dan)

| Paket | Script | Komut |
|---|---|---|
| `backend/package.json` | `test:regression` | `ts-node test/regression-all.ts` |
| `backend/package.json` | `test:tam` | `ts-node test/tam-zincir.ts` |
| `backend/package.json` | `test:regression:db` | `ts-node test/matching-regression.ts` |
| `backend/package.json` | `test:conversion` | `ts-node test/conversion-test.ts` |
| `backend/package.json` | `test:matching` | `ts-node test/matching-unit-test.ts` |
| `backend/package.json` | `test:admin-import` | `ts-node test/admin-import-test.ts` |
| `backend/package.json` | `test:library` | `ts-node test/library-transfer-test.ts` |
| `backend/package.json` | `test:spec` | `ts-node test/spec-regression-test.ts` |
| `backend/package.json` | `test:contract` | `ts-node test/contract-test.ts` |
| `backend/package.json` | `test:product-index` | `ts-node test/product-index-test.ts` |
| `backend/package.json` | `test:index` | `ts-node test/index-engine-test.ts` |
| `backend/package.json` | `test:labor` | `ts-node test/labor-matching-test.ts` |
| `backend/package.json` | `test:grid` | `ts-node test/excel-grid-test.ts` |
| `backend/package.json` | `test:labor-sheet` | `ts-node test/labor-sheet-test.ts` |
| `backend/package.json` | `test:kl` | `ts-node test/kl-liste-ekleme-test.ts` |
| `backend/package.json` | `test:export` | `ts-node test/export-format-test.ts` |
| `backend/package.json` | `test:livesim` | `ts-node test/export-live-sim-test.ts` |
| `backend/package.json` | `test:tf` | `ts-node test/gercek-dosya-test.ts` |
| `backend/package.json` | `test:perf` | `ts-node test/perf-profil.ts` |
| `backend/package.json` | `test:of` | `ts-node test/onceden-fiyatli-test.ts` |
| `backend/package.json` | `test:gs` | `ts-node test/standart-sema-test.ts` |
| `backend/package.json` | `test:ex` | `ts-node test/standart-cikti-test.ts` |
| `backend/package.json` | `test:manifest` | `ts-node test/manifest-kapisi.ts` |
| `backend/package.json` | `test:build-sha` | `ts-node test/build-sha-kablolama-test.ts` |
| `backend/package.json` | `test:pk9` | `ts-node test/pk9-sessiz-indeks-test.ts` |
| `backend/package.json` | `test:18` | `ts-node test/pano18-para-birimi-test.ts` |
| `backend/package.json` | `test:pk3` | `ts-node test/pk3-kimlik-haritasi-test.ts` |
| `backend/package.json` | `test:pk3-repo` | `ts-node test/pk3-repo-kapsama-test.ts` |
| `backend/package.json` | `test:kd11` | `ts-node test/kd11-toplam-yollari-test.ts` |
| `backend/package.json` | `test:kd12` | `ts-node test/kd12-baslik-satiri-test.ts` |
| `backend/package.json` | `test:kd9` | `ts-node test/kd9-kur-olcutu-test.ts` |
| `frontend/package.json` | `test:e2e` | `playwright test` |
| `frontend/package.json` | `test:e2e-golden` | `node e2e-golden/run.mjs` |

## 5 · Kapsam disi birakilanlar

| Desen | Gerekce |
|---|---|
| `node_modules/` | Bağımlılık ağacı — bizim kodumuz değil, haritalanmaz. |
| `dist/` | Derleme çıktısı — kaynaktan üretilir, kendi satırını hak etmez. |
| `.next/` | Next.js derleme çıktısı — aynı gerekçe. |
| `*.d.ts` | Yalnız tip bildirimi — çalışan davranış içermez. |
| `*.min.js` | Küçültülmüş çıktı — okunabilir kaynağı başka yerde. |
| `frontend/e2e-artifacts/` | Test koşum artefaktları — kanıt, kod değil. |
| `backend/prisma/migrations/` | Üretilmiş göç dosyaları — şema kaynağı schema.prisma. |
