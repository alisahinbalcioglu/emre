# KOD HARİTASI — OTOMATİK KATMAN

<!-- URETILMIS DOSYA — ELLE DUZENLENMEZ. Uretici: scripts/harita-uret.mjs -->
<!-- Kapsam tanimi: harita-kapsam-disi.txt -->

Kod dosyasi: 445
Toplam satir: 96532
Uc nokta: 142
test:* scripti: 76

## 1 · Dosyalar ve satir sayilari

| Dosya | Satir |
|---|---|
| `backend/prisma/schema.prisma` | 1233 |
| `backend/scripts/derleme-kapisi.js` | 68 |
| `backend/scripts/kisisel-liste-backfill.js` | 107 |
| `backend/scripts/paketleri-kur.ts` | 397 |
| `backend/scripts/surum-yaz.js` | 47 |
| `backend/src/altyapi/auth/auth.controller.ts` | 28 |
| `backend/src/altyapi/auth/auth.module.ts` | 32 |
| `backend/src/altyapi/auth/auth.service.ts` | 119 |
| `backend/src/altyapi/auth/capabilities.helper.ts` | 130 |
| `backend/src/altyapi/auth/decorators/current-user.decorator.ts` | 9 |
| `backend/src/altyapi/auth/decorators/roles.decorator.ts` | 5 |
| `backend/src/altyapi/auth/dto/login.dto.ts` | 10 |
| `backend/src/altyapi/auth/dto/register.dto.ts` | 11 |
| `backend/src/altyapi/auth/guards/jwt-auth.guard.ts` | 6 |
| `backend/src/altyapi/auth/guards/roles.guard.ts` | 20 |
| `backend/src/altyapi/auth/guards/tier.guard.ts` | 46 |
| `backend/src/altyapi/auth/jwt-secret.ts` | 37 |
| `backend/src/altyapi/auth/kimlik.ts` | 35 |
| `backend/src/altyapi/auth/strategies/jwt.strategy.ts` | 39 |
| `backend/src/altyapi/db/prisma.module.ts` | 10 |
| `backend/src/altyapi/db/prisma.service.ts` | 14 |
| `backend/src/app.module.ts` | 55 |
| `backend/src/bootstrap.controller.ts` | 86 |
| `backend/src/health.controller.ts` | 33 |
| `backend/src/main.ts` | 68 |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | 215 |
| `backend/src/modules/dwg-engine/dwg-engine.module.ts` | 14 |
| `backend/src/modules/dwg-engine/dwg-engine.service.ts` | 420 |
| `backend/src/modules/dwg-engine/dwg-sahiplik.servisi.ts` | 105 |
| `backend/src/modules/dwg-engine/python/converter.py` | 598 |
| `backend/src/modules/dwg-engine/python/deploy-to-cloudrun.sh` | 71 |
| `backend/src/modules/dwg-engine/python/geometry.py` | 757 |
| `backend/src/modules/dwg-engine/python/graph.py` | 356 |
| `backend/src/modules/dwg-engine/python/main.py` | 1603 |
| `backend/src/modules/dwg-engine/python/models.py` | 89 |
| `backend/src/modules/dwg-engine/python/parse_worker.py` | 83 |
| `backend/src/modules/dwg-engine/python/pipe_segments.py` | 1153 |
| `backend/src/modules/dwg-engine/python/tests/__init__.py` | 1 |
| `backend/src/modules/dwg-engine/python/tests/test_block_to_line_split.py` | 104 |
| `backend/src/modules/dwg-engine/python/tests/test_pipe_segments.py` | 85 |
| `backend/src/modules/dwg-engine/python/tests/test_scale_normalization.py` | 127 |
| `backend/src/modules/dwg-engine/python/tests/test_split_mode.py` | 149 |
| `backend/src/modules/dwg-engine/python/tests/test_tolerance_robustness.py` | 118 |
| `backend/src/modules/dwg-engine/python/tests/test_unit_detect.py` | 597 |
| `backend/src/modules/dwg-engine/python/topology.py` | 268 |
| `backend/src/modules/dwg-engine/python/unit_detect.py` | 711 |
| `backend/src/modules/dwg-engine/python/upload_worker.py` | 107 |
| `backend/src/modules/dwg-engine/scale-param.test.ts` | 59 |
| `backend/src/modules/dwg-engine/scale-param.ts` | 30 |
| `backend/src/ozellik/cikti/quote-formats/format-engine.ts` | 453 |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | 95 |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.module.ts` | 13 |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.service.ts` | 163 |
| `backend/src/ozellik/cikti/utils/xlsx-to-pdf.ts` | 46 |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.controller.ts` | 51 |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.module.ts` | 14 |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.service.ts` | 76 |
| `backend/src/ozellik/eslestirme/matching/ad-cins-sozlugu.ts` | 251 |
| `backend/src/ozellik/eslestirme/matching/ad-resolver.ts` | 122 |
| `backend/src/ozellik/eslestirme/matching/conversion.ts` | 448 |
| `backend/src/ozellik/eslestirme/matching/index/line-parser.ts` | 231 |
| `backend/src/ozellik/eslestirme/matching/index/product-index.ts` | 665 |
| `backend/src/ozellik/eslestirme/matching/index/query-engine.ts` | 1561 |
| `backend/src/ozellik/eslestirme/matching/index/types.ts` | 275 |
| `backend/src/ozellik/eslestirme/matching/index/vocab.ts` | 37 |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | 97 |
| `backend/src/ozellik/eslestirme/matching/matching.module.ts` | 15 |
| `backend/src/ozellik/eslestirme/matching/matching.service.ts` | 1166 |
| `backend/src/ozellik/eslestirme/matching/normalizer.ts` | 712 |
| `backend/src/ozellik/eslestirme/matching/shared-tag-matcher.ts` | 165 |
| `backend/src/ozellik/eslestirme/matching/tag-generator.ts` | 161 |
| `backend/src/ozellik/eslestirme/matching/terminology.service.ts` | 327 |
| `backend/src/ozellik/eslestirme/matching/types.ts` | 147 |
| `backend/src/ozellik/eslestirme/utils/build-material-context.ts` | 126 |
| `backend/src/ozellik/eslestirme/utils/etiket-display.ts` | 70 |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.controller.ts` | 15 |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.module.ts` | 11 |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.service.ts` | 136 |
| `backend/src/ozellik/fiyat/matching/index/outcome-mapper.ts` | 325 |
| `backend/src/ozellik/fiyat/matching/pricing.ts` | 46 |
| `backend/src/ozellik/giris/ai/ai-maliyet.ts` | 122 |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | 46 |
| `backend/src/ozellik/giris/ai/ai.module.ts` | 14 |
| `backend/src/ozellik/giris/ai/ai.service.ts` | 859 |
| `backend/src/ozellik/giris/ai/ceviri.service.ts` | 364 |
| `backend/src/ozellik/giris/excel-engine/excel-engine.controller.ts` | 21 |
| `backend/src/ozellik/giris/excel-engine/excel-engine.module.ts` | 13 |
| `backend/src/ozellik/giris/excel-engine/excel-engine.service.ts` | 195 |
| `backend/src/ozellik/giris/excel-grid/excel-grid.controller.ts` | 23 |
| `backend/src/ozellik/giris/excel-grid/excel-grid.module.ts` | 13 |
| `backend/src/ozellik/giris/excel-grid/excel-grid.service.ts` | 1100 |
| `backend/src/ozellik/giris/excel-grid/sheet-discipline.ts` | 61 |
| `backend/src/ozellik/giris/excel-grid/standart-sema.ts` | 331 |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | 215 |
| `backend/src/ozellik/kutuphane/admin/admin.module.ts` | 15 |
| `backend/src/ozellik/kutuphane/admin/admin.service.ts` | 1669 |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | 72 |
| `backend/src/ozellik/kutuphane/brands/brands.module.ts` | 11 |
| `backend/src/ozellik/kutuphane/brands/brands.service.ts` | 273 |
| `backend/src/ozellik/kutuphane/brands/dto/create-brand.dto.ts` | 17 |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | 171 |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.module.ts` | 15 |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.service.ts` | 948 |
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | 52 |
| `backend/src/ozellik/kutuphane/labor/labor.module.ts` | 13 |
| `backend/src/ozellik/kutuphane/labor/labor.service.ts` | 85 |
| `backend/src/ozellik/kutuphane/library/dto/add-library-rows.dto.ts` | 22 |
| `backend/src/ozellik/kutuphane/library/dto/bulk-discount.dto.ts` | 12 |
| `backend/src/ozellik/kutuphane/library/dto/bulk-update-items.dto.ts` | 13 |
| `backend/src/ozellik/kutuphane/library/dto/create-library-item.dto.ts` | 34 |
| `backend/src/ozellik/kutuphane/library/dto/create-manual-brand.dto.ts` | 46 |
| `backend/src/ozellik/kutuphane/library/dto/import-price-list.dto.ts` | 10 |
| `backend/src/ozellik/kutuphane/library/dto/update-library-item.dto.ts` | 27 |
| `backend/src/ozellik/kutuphane/library/library-sheet-builder.ts` | 125 |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | 138 |
| `backend/src/ozellik/kutuphane/library/library.module.ts` | 13 |
| `backend/src/ozellik/kutuphane/library/library.service.ts` | 891 |
| `backend/src/ozellik/kutuphane/materials/dto/create-material-price.dto.ts` | 14 |
| `backend/src/ozellik/kutuphane/materials/dto/create-material.dto.ts` | 8 |
| `backend/src/ozellik/kutuphane/materials/materials.controller.ts` | 55 |
| `backend/src/ozellik/kutuphane/materials/materials.module.ts` | 11 |
| `backend/src/ozellik/kutuphane/materials/materials.service.ts` | 67 |
| `backend/src/ozellik/kutuphane/silme-etkisi.ts` | 74 |
| `backend/src/ozellik/kutuphane/utils/import-fidelity.ts` | 347 |
| `backend/src/ozellik/odeme/abonelik/abonelik.controller.ts` | 113 |
| `backend/src/ozellik/odeme/abonelik/abonelik.servisi.ts` | 393 |
| `backend/src/ozellik/odeme/abonelik/erisim.guard.ts` | 90 |
| `backend/src/ozellik/odeme/abonelik/erisim.servisi.ts` | 269 |
| `backend/src/ozellik/odeme/abonelik/mutabakat.job.ts` | 155 |
| `backend/src/ozellik/odeme/abonelik/satinalma.servisi.ts` | 526 |
| `backend/src/ozellik/odeme/dunning/dunning.metinleri.ts` | 165 |
| `backend/src/ozellik/odeme/dunning/dunning.servisi.ts` | 314 |
| `backend/src/ozellik/odeme/eposta/eposta.servisi.ts` | 132 |
| `backend/src/ozellik/odeme/fatura/fatura.servisi.ts` | 241 |
| `backend/src/ozellik/odeme/fatura/muhasebe.adaptor.ts` | 241 |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | 96 |
| `backend/src/ozellik/odeme/havale/havale.servisi.ts` | 274 |
| `backend/src/ozellik/odeme/iyzico/imza.ts` | 206 |
| `backend/src/ozellik/odeme/iyzico/iyzico.client.ts` | 435 |
| `backend/src/ozellik/odeme/odeme.module.ts` | 72 |
| `backend/src/ozellik/odeme/webhook/webhook.controller.ts` | 160 |
| `backend/src/ozellik/odeme/webhook/webhook.isleyici.ts` | 132 |
| `backend/src/ozellik/odeme/yapilandirma.ts` | 78 |
| `backend/src/ozellik/teklif/quotes/cikti-dil.ts` | 96 |
| `backend/src/ozellik/teklif/quotes/dto/create-quote.dto.ts` | 112 |
| `backend/src/ozellik/teklif/quotes/export-engine.ts` | 369 |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | 184 |
| `backend/src/ozellik/teklif/quotes/quotes.module.ts` | 16 |
| `backend/src/ozellik/teklif/quotes/quotes.service.ts` | 721 |
| `backend/src/ozellik/teklif/quotes/standart-cikti.ts` | 306 |
| `backend/src/surum.ts` | 30 |
| `backend/test/a1-silme-etkisi-test.ts` | 330 |
| `backend/test/admin-import-test.ts` | 264 |
| `backend/test/aile-oncelik-simulasyon.ts` | 292 |
| `backend/test/aile-oncelik-test.ts` | 182 |
| `backend/test/aile-uyusmazligi-test.ts` | 357 |
| `backend/test/alias-kelime-yutma-test.ts` | 181 |
| `backend/test/audit-canli-kosum.ts` | 314 |
| `backend/test/audit-real-excel.ts` | 82 |
| `backend/test/b1-kutuphane-cascade-test.ts` | 185 |
| `backend/test/build-sha-kablolama-test.ts` | 140 |
| `backend/test/cap-cevrilemedi-test.ts` | 254 |
| `backend/test/ceviri-karar-test.ts` | 166 |
| `backend/test/cikti-dil-test.ts` | 91 |
| `backend/test/contract-test.ts` | 364 |
| `backend/test/conversion-test.ts` | 261 |
| `backend/test/d1-marka-silme-capraz-tenant-test.ts` | 235 |
| `backend/test/dn-koprusu-test.ts` | 342 |
| `backend/test/erisim-kapisi-test.ts` | 380 |
| `backend/test/erken-kurtarma-test.ts` | 402 |
| `backend/test/excel-grid-test.ts` | 256 |
| `backend/test/export-format-test.ts` | 427 |
| `backend/test/export-live-sim-test.ts` | 417 |
| `backend/test/fallback-ad-kilidi-test.ts` | 185 |
| `backend/test/faz0-gs7-probe.ts` | 74 |
| `backend/test/firma-ekseni-test.ts` | 287 |
| `backend/test/firma-izolasyon-test.ts` | 315 |
| `backend/test/fixture-anonim.ts` | 330 |
| `backend/test/fixture-dogrula.ts` | 224 |
| `backend/test/fiyat-capasi-test.ts` | 185 |
| `backend/test/gercek-dosya-test.ts` | 263 |
| `backend/test/gs6b-teshis.ts` | 85 |
| `backend/test/guvenlik-turu-2-test.ts` | 338 |
| `backend/test/guvenlik-uclari-test.ts` | 365 |
| `backend/test/iliskisel-alan-suzgeci-test.ts` | 171 |
| `backend/test/imza-ekseni-test.ts` | 325 |
| `backend/test/index-engine-test.ts` | 1774 |
| `backend/test/iscilik-satir-silme-test.ts` | 127 |
| `backend/test/iyzico-imza-basligi-test.ts` | 235 |
| `backend/test/kalem59-oksuz-kutuphane-test.ts` | 131 |
| `backend/test/kaucuk-izolasyon-test.ts` | 244 |
| `backend/test/kd11-toplam-yollari-test.ts` | 150 |
| `backend/test/kd12-baslik-satiri-test.ts` | 226 |
| `backend/test/kd9-kur-olcutu-test.ts` | 252 |
| `backend/test/kisisel-liste-izolasyon-test.ts` | 347 |
| `backend/test/kl-kayit-toplami-test.ts` | 148 |
| `backend/test/kl-liste-ekleme-test.ts` | 171 |
| `backend/test/kur-donmasi-test.ts` | 111 |
| `backend/test/kurtarma-mesaj-test.ts` | 367 |
| `backend/test/kutuphane-ad-duzenleme-test.ts` | 152 |
| `backend/test/kutuphane-liste-test.ts` | 231 |
| `backend/test/labor-matching-test.ts` | 196 |
| `backend/test/labor-sheet-test.ts` | 102 |
| `backend/test/library-transfer-test.ts` | 96 |
| `backend/test/manifest-kapisi.ts` | 77 |
| `backend/test/matching-regression.ts` | 265 |
| `backend/test/matching-unit-test.ts` | 713 |
| `backend/test/migration-zinciri-test.ts` | 313 |
| `backend/test/odeme-onyukleme-test.ts` | 412 |
| `backend/test/olcu-anahtari-cakismasi-test.ts` | 449 |
| `backend/test/onceden-fiyatli-test.ts` | 163 |
| `backend/test/oneri-kutusu-cekince-test.ts` | 333 |
| `backend/test/ortam-degiskenleri-test.ts` | 185 |
| `backend/test/p2-2-sheets-indeks-test.ts` | 169 |
| `backend/test/pano18-para-birimi-test.ts` | 172 |
| `backend/test/perf-profil.ts` | 73 |
| `backend/test/pk3-kimlik-haritasi-test.ts` | 159 |
| `backend/test/pk3-repo-kapsama-test.ts` | 79 |
| `backend/test/pk9-sessiz-indeks-test.ts` | 97 |
| `backend/test/product-index-test.ts` | 479 |
| `backend/test/regression-all.ts` | 469 |
| `backend/test/s45-malzeme-aile-test.ts` | 440 |
| `backend/test/s45-olcum.ts` | 188 |
| `backend/test/sozluk-golgeleme-olcum.ts` | 125 |
| `backend/test/spec-regression-test.ts` | 447 |
| `backend/test/standart-cikti-test.ts` | 339 |
| `backend/test/standart-sema-test.ts` | 338 |
| `backend/test/tam-ad-surgunu-test.ts` | 190 |
| `backend/test/tam-zincir.ts` | 105 |
| `backend/test/urun-degil-test.ts` | 89 |
| `backend/test/varyant-surukleme-test.ts` | 189 |
| `backend/test/yuzey-genisletme-test.ts` | 193 |
| `frontend/app/(protected)/abonelik/donus/page.tsx` | 108 |
| `frontend/app/(protected)/abonelik/page.tsx` | 207 |
| `frontend/app/(protected)/dashboard/page.tsx` | 223 |
| `frontend/app/(protected)/dwg-workspace/page.tsx` | 79 |
| `frontend/app/(protected)/labor-firms/[firmaId]/page.tsx` | 491 |
| `frontend/app/(protected)/labor-firms/page.tsx` | 273 |
| `frontend/app/(protected)/labor/page.tsx` | 247 |
| `frontend/app/(protected)/layout.tsx` | 206 |
| `frontend/app/(protected)/library/brand/[brandId]/page.tsx` | 519 |
| `frontend/app/(protected)/library/electrical-brands/page.tsx` | 399 |
| `frontend/app/(protected)/library/mechanical-brands/page.tsx` | 311 |
| `frontend/app/(protected)/library/page.tsx` | 599 |
| `frontend/app/(protected)/materials/[brandId]/page.tsx` | 645 |
| `frontend/app/(protected)/materials/electrical/page.tsx` | 171 |
| `frontend/app/(protected)/materials/mechanical/page.tsx` | 171 |
| `frontend/app/(protected)/materials/page.tsx` | 23 |
| `frontend/app/(protected)/profile/page.tsx` | 336 |
| `frontend/app/(protected)/quote-formats/page.tsx` | 396 |
| `frontend/app/(protected)/quotes/[id]/page.tsx` | 467 |
| `frontend/app/(protected)/quotes/new/error.tsx` | 13 |
| `frontend/app/(protected)/quotes/new/page.tsx` | 2138 |
| `frontend/app/(protected)/quotes/page.tsx` | 196 |
| `frontend/app/admin/brands/page.tsx` | 895 |
| `frontend/app/admin/layout.tsx` | 80 |
| `frontend/app/admin/page.tsx` | 16 |
| `frontend/app/admin/stats/page.tsx` | 528 |
| `frontend/app/admin/users/page.tsx` | 190 |
| `frontend/app/dev/grid-test/page.tsx` | 227 |
| `frontend/app/layout.tsx` | 25 |
| `frontend/app/login/page.tsx` | 108 |
| `frontend/app/page.tsx` | 429 |
| `frontend/app/register/page.tsx` | 110 |
| `frontend/components/dwg-diameter-engine/DiameterLegendPanel.tsx` | 151 |
| `frontend/components/dwg-diameter-engine/index.ts` | 16 |
| `frontend/components/dwg-diameter-engine/types.ts` | 79 |
| `frontend/components/dwg-diameter-engine/useLayerCalc.ts` | 136 |
| `frontend/components/dwg-diameter-engine/useOriginalColorState.ts` | 36 |
| `frontend/components/dwg-metraj/DiameterEditPopup.tsx` | 121 |
| `frontend/components/dwg-metraj/DwgUploader.tsx` | 643 |
| `frontend/components/dwg-metraj/MetrajEditor.tsx` | 459 |
| `frontend/components/dwg-metraj/constants.ts` | 28 |
| `frontend/components/dwg-metraj/diameter-colors.ts` | 169 |
| `frontend/components/dwg-metraj/index.ts` | 12 |
| `frontend/components/dwg-metraj/types.ts` | 55 |
| `frontend/components/dwg-metraj/unit-detection.test.ts` | 118 |
| `frontend/components/dwg-metraj/unit-detection.ts` | 79 |
| `frontend/components/dwg-tagging/BucketPanel.tsx` | 144 |
| `frontend/components/dwg-tagging/index.ts` | 12 |
| `frontend/components/dwg-tagging/useTaggingStore.ts` | 110 |
| `frontend/components/dwg-viewer/DxfCanvasViewer.tsx` | 1989 |
| `frontend/components/dwg-viewer/aci-colors.ts` | 38 |
| `frontend/components/dwg-viewer/index.ts` | 6 |
| `frontend/components/dwg-viewer/segment-length.test.ts` | 54 |
| `frontend/components/dwg-viewer/segment-length.ts` | 48 |
| `frontend/components/dwg-viewer/types.ts` | 76 |
| `frontend/components/dwg-viewer/useViewport.ts` | 233 |
| `frontend/components/dwg-workspace/DwgProjectWorkspace.tsx` | 1076 |
| `frontend/components/dwg-workspace/LayerInfoSidebar.tsx` | 213 |
| `frontend/components/dwg-workspace/LayerVisibilityPanel.tsx` | 229 |
| `frontend/components/dwg-workspace/MetrajSummaryPanel.tsx` | 153 |
| `frontend/components/dwg-workspace/index.ts` | 6 |
| `frontend/components/dwg-workspace/onay-revizyon.test.ts` | 217 |
| `frontend/components/dwg-workspace/onay-revizyon.ts` | 114 |
| `frontend/components/dwg-workspace/sprinkler-bayatlik.test.ts` | 64 |
| `frontend/components/dwg-workspace/sprinkler-bayatlik.ts` | 51 |
| `frontend/components/dwg-workspace/types.ts` | 71 |
| `frontend/components/dwg-workspace/useWorkspaceState.ts` | 437 |
| `frontend/lib/gs6b-golge-kurali.test.ts` | 60 |
| `frontend/lib/indeks-sagligi.test.ts` | 75 |
| `frontend/lib/indeks-sagligi.ts` | 64 |
| `frontend/lib/kar-degisimi.test.ts` | 114 |
| `frontend/lib/kar-satiri.test.ts` | 174 |
| `frontend/lib/kaynak-kolon.test.ts` | 49 |
| `frontend/lib/marj-tek-kaynak.test.ts` | 80 |
| `frontend/lib/merge-multisheet.test.ts` | 112 |
| `frontend/lib/metraj-excel.ts` | 96 |
| `frontend/lib/ondalik-kurali.test.ts` | 70 |
| `frontend/lib/parse-material-text.test.ts` | 86 |
| `frontend/lib/popup-secici-sozlesmesi.test.ts` | 62 |
| `frontend/lib/pricing.test.ts` | 95 |
| `frontend/lib/sayfa-toplamlari.test.ts` | 127 |
| `frontend/lib/sayi-ayristirma.test.ts` | 80 |
| `frontend/lib/silme-etkisi-getir.ts` | 26 |
| `frontend/lib/silme-onay-metni.test.ts` | 194 |
| `frontend/lib/silme-onay-metni.ts` | 168 |
| `frontend/next.config.js` | 33 |
| `frontend/ortak/contexts/CapabilitiesContext.tsx` | 137 |
| `frontend/ortak/hooks/onay-secenekleri.test.ts` | 97 |
| `frontend/ortak/hooks/use-confirm.ts` | 158 |
| `frontend/ortak/hooks/use-toast.ts` | 119 |
| `frontend/ortak/kabuk/components/dashboard/QuickAccess.tsx` | 49 |
| `frontend/ortak/kabuk/components/dashboard/QuickStart.tsx` | 158 |
| `frontend/ortak/kabuk/components/dashboard/dosya-turu.test.ts` | 47 |
| `frontend/ortak/kabuk/components/dashboard/dosya-turu.ts` | 24 |
| `frontend/ortak/kabuk/components/landing/GirisliyseYonlendir.tsx` | 31 |
| `frontend/ortak/kabuk/components/landing/NasilCalisir.tsx` | 609 |
| `frontend/ortak/kabuk/components/layout/Breadcrumb.tsx` | 73 |
| `frontend/ortak/kabuk/components/layout/Sidebar.tsx` | 163 |
| `frontend/ortak/lib/api-401-kapsami.test.ts` | 232 |
| `frontend/ortak/lib/api.ts` | 81 |
| `frontend/ortak/lib/utils.ts` | 16 |
| `frontend/ortak/types/index.ts` | 64 |
| `frontend/ortak/types/quotes.ts` | 62 |
| `frontend/ortak/ui/badge.tsx` | 35 |
| `frontend/ortak/ui/button.tsx` | 50 |
| `frontend/ortak/ui/card.tsx` | 56 |
| `frontend/ortak/ui/confirm-dialog.tsx` | 130 |
| `frontend/ortak/ui/dialog.tsx` | 94 |
| `frontend/ortak/ui/geri-butonu.tsx` | 75 |
| `frontend/ortak/ui/input.tsx` | 24 |
| `frontend/ortak/ui/label.tsx` | 19 |
| `frontend/ortak/ui/parola-alani.tsx` | 62 |
| `frontend/ortak/ui/select.tsx` | 143 |
| `frontend/ortak/ui/table.tsx` | 77 |
| `frontend/ortak/ui/toast.tsx` | 115 |
| `frontend/ortak/ui/toaster.tsx` | 34 |
| `frontend/ozellik/cikti/export-download.ts` | 99 |
| `frontend/ozellik/fiyat/ikiz-suzgec-kapilari.test.ts` | 97 |
| `frontend/ozellik/fiyat/kar-tek-suzgec.test.ts` | 189 |
| `frontend/ozellik/fiyat/pricing.ts` | 501 |
| `frontend/ozellik/fiyat/sayi-alani.ts` | 59 |
| `frontend/ozellik/fiyat/sayi-oku.test.ts` | 72 |
| `frontend/ozellik/fiyat/use-currency.ts` | 87 |
| `frontend/ozellik/giris/kaynak-kolon.ts` | 34 |
| `frontend/ozellik/kutuphane/admin-stats.ts` | 202 |
| `frontend/ozellik/kutuphane/admin/AdminSidebar.tsx` | 125 |
| `frontend/ozellik/kutuphane/ai-butce.test.ts` | 115 |
| `frontend/ozellik/kutuphane/ai-butce.ts` | 91 |
| `frontend/ozellik/kutuphane/hata-metni.test.ts` | 147 |
| `frontend/ozellik/kutuphane/hata-metni.ts` | 59 |
| `frontend/ozellik/kutuphane/library/InlineFirmEntry.tsx` | 170 |
| `frontend/ozellik/kutuphane/library/ManualBrandModal.tsx` | 198 |
| `frontend/ozellik/kutuphane/oksuz-kutuphane-uyarisi.test.ts` | 136 |
| `frontend/ozellik/kutuphane/oksuz-kutuphane-uyarisi.ts` | 60 |
| `frontend/ozellik/odeme/AbonelikSeridi.tsx` | 51 |
| `frontend/ozellik/odeme/erisim-durumu.test.ts` | 183 |
| `frontend/ozellik/odeme/erisim-durumu.ts` | 111 |
| `frontend/ozellik/odeme/paket-bicim.ts` | 108 |
| `frontend/ozellik/tablo/disiplin.ts` | 13 |
| `frontend/ozellik/tablo/excel-grid/CustomDropdown.tsx` | 252 |
| `frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx` | 3680 |
| `frontend/ozellik/tablo/excel-grid/SheetTabs.tsx` | 109 |
| `frontend/ozellik/tablo/excel-grid/aday-ayirt-edicilik.test.ts` | 178 |
| `frontend/ozellik/tablo/excel-grid/aday-ayirt-edicilik.ts` | 175 |
| `frontend/ozellik/tablo/excel-grid/build-material-context.test.ts` | 37 |
| `frontend/ozellik/tablo/excel-grid/build-material-context.ts` | 38 |
| `frontend/ozellik/tablo/excel-grid/cap-sorguda.test.ts` | 130 |
| `frontend/ozellik/tablo/excel-grid/discount-utils.test.ts` | 41 |
| `frontend/ozellik/tablo/excel-grid/discount-utils.ts` | 28 |
| `frontend/ozellik/tablo/excel-grid/fill-down.test.ts` | 464 |
| `frontend/ozellik/tablo/excel-grid/fill-down.ts` | 374 |
| `frontend/ozellik/tablo/excel-grid/grup-iskonto-girisi.test.ts` | 186 |
| `frontend/ozellik/tablo/excel-grid/isaret.test.ts` | 238 |
| `frontend/ozellik/tablo/excel-grid/isaret.ts` | 133 |
| `frontend/ozellik/tablo/excel-grid/kar-yayilimi.test.ts` | 63 |
| `frontend/ozellik/tablo/excel-grid/kopyala.test.ts` | 182 |
| `frontend/ozellik/tablo/excel-grid/kopyala.ts` | 133 |
| `frontend/ozellik/tablo/excel-grid/oneri-cekince.test.ts` | 156 |
| `frontend/ozellik/tablo/excel-grid/oneri-cekince.ts` | 70 |
| `frontend/ozellik/tablo/excel-grid/types.ts` | 164 |
| `frontend/ozellik/tablo/excel-grid/useFillHandle.tsx` | 286 |
| `frontend/ozellik/tablo/excel-grid/yapistir.test.ts` | 128 |
| `frontend/ozellik/tablo/excel-grid/yapistir.ts` | 136 |
| `frontend/ozellik/tablo/merge-multisheet.ts` | 185 |
| `frontend/ozellik/tablo/parse-material-text.ts` | 69 |
| `frontend/ozellik/tablo/quotes/ColumnManagerPanel.tsx` | 146 |
| `frontend/ozellik/teklif/ceviri.test.ts` | 220 |
| `frontend/ozellik/teklif/ceviri.ts` | 189 |
| `frontend/ozellik/teklif/dashboard/RecentQuotes.tsx` | 97 |
| `frontend/ozellik/teklif/dwg-teklif-sema.test.ts` | 119 |
| `frontend/ozellik/teklif/dwg-teklif-sema.ts` | 84 |
| `frontend/ozellik/teklif/fiyatsiz-kalem-uyarisi.test.ts` | 212 |
| `frontend/ozellik/teklif/fiyatsiz-kalem-uyarisi.ts` | 159 |
| `frontend/ozellik/teklif/restore-rematch.test.ts` | 509 |
| `frontend/ozellik/teklif/restore-rematch.ts` | 229 |
| `frontend/ozellik/teklif/taslak.test.ts` | 89 |
| `frontend/ozellik/teklif/taslak.ts` | 98 |
| `frontend/ozellik/teklif/teklif-kalem.test.ts` | 230 |
| `frontend/ozellik/teklif/teklif-kalem.ts` | 112 |
| `frontend/playwright.config.ts` | 21 |
| `frontend/playwright.golden.config.ts` | 37 |
| `frontend/postcss.config.js` | 7 |
| `frontend/scripts/surum-yaz.js` | 33 |
| `frontend/tailwind.config.ts` | 70 |
| `frontend/test/e2e-golden/artefakt-dizini.cjs` | 101 |
| `frontend/test/e2e-golden/bolum-f-kabul.spec.ts` | 195 |
| `frontend/test/e2e-golden/faz0-gs7-teshis.spec.ts` | 103 |
| `frontend/test/e2e-golden/firma-a-golden.spec.ts` | 537 |
| `frontend/test/e2e-golden/global-setup.mjs` | 100 |
| `frontend/test/e2e-golden/golden.spec.ts` | 245 |
| `frontend/test/e2e-golden/gs-kalicilik.spec.ts` | 316 |
| `frontend/test/e2e-golden/helpers.ts` | 352 |
| `frontend/test/e2e-golden/pu4-popup-genislik.spec.ts` | 252 |
| `frontend/test/e2e-golden/run.mjs` | 47 |
| `frontend/test/e2e-golden/sayi-ayristirma.mjs` | 46 |
| `frontend/test/e2e-golden/surum-kapisi.cjs` | 135 |
| `frontend/test/e2e-golden/verify.mjs` | 836 |
| `frontend/test/e2e/grid.spec.ts` | 206 |
| `frontend/test/e2e/kopyala-yapistir.spec.ts` | 364 |
| `frontend/vitest.config.ts` | 10 |
| `scripts/backup.sh` | 75 |
| `scripts/deploy.sh` | 168 |
| `scripts/firma-olcum.sh` | 162 |
| `scripts/fk-dogrula.sh` | 94 |
| `scripts/geri-yukle.sh` | 177 |
| `scripts/harita-denetle.mjs` | 260 |
| `scripts/harita-uret.mjs` | 253 |
| `scripts/jwt-secret-kur.sh` | 85 |
| `scripts/kalem59-olcu.sh` | 220 |
| `scripts/kb5-olcu.sh` | 42 |
| `scripts/klasor-denetle.mjs` | 246 |
| `scripts/kv-kaucuk-olcu.sh` | 129 |
| `scripts/s45-olcu.sh` | 90 |

## 2 · Import bagliliklari

| Dosya | Import ettigi (ham) |
|---|---|
| `backend/scripts/derleme-kapisi.js` | `fs` `path` |
| `backend/scripts/kisisel-liste-backfill.js` | `@prisma/client` |
| `backend/scripts/paketleri-kur.ts` | `@prisma/client` `@nestjs/config` `../src/ozellik/odeme/iyzico/iyzico.client` `../src/ozellik/odeme/yapilandirma` |
| `backend/scripts/surum-yaz.js` | `fs` `path` `child_process` |
| `backend/src/altyapi/auth/auth.controller.ts` | `@nestjs/common` `./auth.service` `./dto/register.dto` `./dto/login.dto` `./guards/jwt-auth.guard` `./decorators/current-user.decorator` |
| `backend/src/altyapi/auth/auth.module.ts` | `@nestjs/common` `@nestjs/jwt` `@nestjs/passport` `./auth.service` `./auth.controller` `./strategies/jwt.strategy` `./jwt-secret` `../../ozellik/odeme/odeme.module` |
| `backend/src/altyapi/auth/auth.service.ts` | `@nestjs/jwt` `bcrypt` `../db/prisma.service` `./jwt-secret` `./dto/register.dto` `./dto/login.dto` `./capabilities.helper` `../../ozellik/odeme/abonelik/erisim.servisi` |
| `backend/src/altyapi/auth/capabilities.helper.ts` | `../db/prisma.service` |
| `backend/src/altyapi/auth/decorators/current-user.decorator.ts` | `@nestjs/common` |
| `backend/src/altyapi/auth/decorators/roles.decorator.ts` | `@nestjs/common` |
| `backend/src/altyapi/auth/dto/login.dto.ts` | `class-validator` |
| `backend/src/altyapi/auth/dto/register.dto.ts` | `class-validator` |
| `backend/src/altyapi/auth/guards/jwt-auth.guard.ts` | `@nestjs/common` `@nestjs/passport` |
| `backend/src/altyapi/auth/guards/roles.guard.ts` | `@nestjs/common` `@nestjs/core` `../decorators/roles.decorator` |
| `backend/src/altyapi/auth/guards/tier.guard.ts` | `@nestjs/common` `@nestjs/core` `../../db/prisma.service` |
| `backend/src/altyapi/auth/kimlik.ts` | `@nestjs/common` |
| `backend/src/altyapi/auth/strategies/jwt.strategy.ts` | `@nestjs/common` `@nestjs/passport` `passport-jwt` `../../db/prisma.service` `../jwt-secret` |
| `backend/src/altyapi/db/prisma.module.ts` | `@nestjs/common` `./prisma.service` |
| `backend/src/altyapi/db/prisma.service.ts` | `@nestjs/common` `@prisma/client` |
| `backend/src/app.module.ts` | `@nestjs/common` `@nestjs/config` `./health.controller` `./bootstrap.controller` `./altyapi/db/prisma.module` `./altyapi/auth/auth.module` `./ozellik/kutuphane/brands/brands.module` `./ozellik/kutuphane/materials/materials.module` `./ozellik/kutuphane/library/library.module` `./ozellik/teklif/quotes/quotes.module` `./ozellik/kutuphane/admin/admin.module` `./ozellik/giris/ai/ai.module` `./ozellik/kutuphane/labor/labor.module` `./ozellik/kutuphane/labor-firms/labor-firms.module` `./ozellik/giris/excel-engine/excel-engine.module` `./ozellik/giris/excel-grid/excel-grid.module` `./ozellik/eslestirme/matching/matching.module` `./ozellik/eslestirme/labor-matching/labor-matching.module` `./modules/dwg-engine/dwg-engine.module` `./ozellik/fiyat/exchange-rates/exchange-rates.module` `./ozellik/cikti/quote-formats/quote-formats.module` `./ozellik/odeme/odeme.module` |
| `backend/src/bootstrap.controller.ts` | `bcrypt` `./altyapi/db/prisma.service` |
| `backend/src/health.controller.ts` | `@nestjs/common` `./surum` |
| `backend/src/main.ts` | `@nestjs/core` `@nestjs/common` `express` `./app.module` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `@nestjs/platform-express` `multer` `../../altyapi/auth/guards/jwt-auth.guard` `./dwg-engine.service` `./scale-param` `../../altyapi/auth/decorators/current-user.decorator` `../../altyapi/auth/kimlik` `./dwg-sahiplik.servisi` `../../ozellik/odeme/abonelik/erisim.guard` `../../ozellik/odeme/abonelik/erisim.servisi` |
| `backend/src/modules/dwg-engine/dwg-engine.module.ts` | `@nestjs/common` `./dwg-engine.controller` `./dwg-engine.service` `./dwg-sahiplik.servisi` `../../ozellik/odeme/odeme.module` |
| `backend/src/modules/dwg-engine/dwg-engine.service.ts` | `@nestjs/common` |
| `backend/src/modules/dwg-engine/dwg-sahiplik.servisi.ts` | `@nestjs/common` `../../altyapi/db/prisma.service` |
| `backend/src/modules/dwg-engine/python/converter.py` | `dataclasses` `pathlib` `ezdxf` |
| `backend/src/modules/dwg-engine/python/geometry.py` | `__future__` `typing` `pydantic` `converter` |
| `backend/src/modules/dwg-engine/python/graph.py` | `collections` `typing` `converter` |
| `backend/src/modules/dwg-engine/python/main.py` | `collections` `fastapi` `fastapi.middleware.cors` `fastapi.middleware.gzip` `fastapi.responses` `converter` `topology` `geometry` `models` `unit_detect` `pipe_segments` |
| `backend/src/modules/dwg-engine/python/models.py` | `pydantic` |
| `backend/src/modules/dwg-engine/python/parse_worker.py` | `main` |
| `backend/src/modules/dwg-engine/python/pipe_segments.py` | `typing` `converter` `collections` |
| `backend/src/modules/dwg-engine/python/tests/test_block_to_line_split.py` | `__future__` `pipe_segments` |
| `backend/src/modules/dwg-engine/python/tests/test_pipe_segments.py` | `__future__` `pipe_segments` |
| `backend/src/modules/dwg-engine/python/tests/test_scale_normalization.py` | `__future__` `main` |
| `backend/src/modules/dwg-engine/python/tests/test_split_mode.py` | `pipe_segments` |
| `backend/src/modules/dwg-engine/python/tests/test_tolerance_robustness.py` | `pipe_segments` |
| `backend/src/modules/dwg-engine/python/tests/test_unit_detect.py` | `unit_detect` |
| `backend/src/modules/dwg-engine/python/topology.py` | `collections` `graph` `models` `converter` |
| `backend/src/modules/dwg-engine/python/unit_detect.py` | `__future__` `dataclasses` |
| `backend/src/modules/dwg-engine/python/upload_worker.py` | `converter` `geometry` `main` |
| `backend/src/modules/dwg-engine/scale-param.test.ts` | `node:assert` `./scale-param` |
| `backend/src/ozellik/cikti/quote-formats/format-engine.ts` | `exceljs` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | `@nestjs/platform-express` `express` `multer` `./quote-formats.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.module.ts` | `@nestjs/common` `./quote-formats.service` `./quote-formats.controller` `../../odeme/odeme.module` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `../../../altyapi/auth/kimlik` `exceljs` |
| `backend/src/ozellik/cikti/utils/xlsx-to-pdf.ts` | `child_process` `fs/promises` `os` `path` |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.controller.ts` | `@nestjs/common` `./labor-matching.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `../../../altyapi/auth/kimlik` |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.module.ts` | `@nestjs/common` `./labor-matching.service` `./labor-matching.controller` `../matching/matching.module` |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `../matching/matching.service` `../matching/tag-generator` `../matching/types` `../../../altyapi/auth/kimlik` |
| `backend/src/ozellik/eslestirme/matching/ad-resolver.ts` | `./ad-cins-sozlugu` `./normalizer` |
| `backend/src/ozellik/eslestirme/matching/conversion.ts` | `./normalizer` |
| `backend/src/ozellik/eslestirme/matching/index/line-parser.ts` | `../normalizer` `../ad-resolver` `../conversion` `./product-index` `./types` |
| `backend/src/ozellik/eslestirme/matching/index/product-index.ts` | `crypto` `../normalizer` `../ad-resolver` `../conversion` |
| `backend/src/ozellik/eslestirme/matching/index/query-engine.ts` | `../conversion` `../normalizer` `./product-index` `../shared-tag-matcher` `./vocab` `./line-parser` `./types` |
| `backend/src/ozellik/eslestirme/matching/index/types.ts` | `../conversion` `./product-index` |
| `backend/src/ozellik/eslestirme/matching/index/vocab.ts` | `./types` |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | `@nestjs/common` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `./matching.service` `./terminology.service` `../../../altyapi/auth/kimlik` |
| `backend/src/ozellik/eslestirme/matching/matching.module.ts` | `@nestjs/common` `../../../altyapi/db/prisma.module` `./matching.service` `./matching.controller` `./terminology.service` `../../fiyat/exchange-rates/exchange-rates.module` |
| `backend/src/ozellik/eslestirme/matching/matching.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `./tag-generator` `../../fiyat/matching/pricing` `./normalizer` `./conversion` `./terminology.service` `./index/line-parser` `./index/query-engine` `../../fiyat/matching/index/outcome-mapper` `./index/product-index` `./index/types` `../../fiyat/exchange-rates/exchange-rates.service` `./types` `./shared-tag-matcher` `../../../altyapi/auth/kimlik` |
| `backend/src/ozellik/eslestirme/matching/shared-tag-matcher.ts` | `./ad-resolver` |
| `backend/src/ozellik/eslestirme/matching/tag-generator.ts` | `./types` `./ad-resolver` |
| `backend/src/ozellik/eslestirme/matching/terminology.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `./normalizer` `./conversion` |
| `backend/src/ozellik/eslestirme/utils/etiket-display.ts` | `../matching/tag-generator` `../matching/ad-resolver` |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.controller.ts` | `@nestjs/common` `./exchange-rates.service` |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.module.ts` | `@nestjs/common` `./exchange-rates.controller` `./exchange-rates.service` |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.service.ts` | `@nestjs/common` |
| `backend/src/ozellik/fiyat/matching/index/outcome-mapper.ts` | `../pricing` `../../../eslestirme/matching/normalizer` `../../../eslestirme/matching/shared-tag-matcher` `../../../eslestirme/matching/index/query-engine` `../../../eslestirme/matching/types` `../../../eslestirme/matching/index/types` |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | `@nestjs/common` `@nestjs/platform-express` `multer` `./ai.service` `./ceviri.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/tier.guard` `../../../altyapi/auth/decorators/current-user.decorator` |
| `backend/src/ozellik/giris/ai/ai.module.ts` | `@nestjs/common` `./ai.controller` `./ai.service` `./ceviri.service` `../../../altyapi/db/prisma.module` |
| `backend/src/ozellik/giris/ai/ai.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `@anthropic-ai/sdk` `./ai-maliyet` `xlsx` `pdf-parse` |
| `backend/src/ozellik/giris/ai/ceviri.service.ts` | `@nestjs/common` `@anthropic-ai/sdk` `../../../altyapi/db/prisma.service` `./ai.service` |
| `backend/src/ozellik/giris/excel-engine/excel-engine.controller.ts` | `@nestjs/platform-express` `multer` `../../../altyapi/auth/guards/jwt-auth.guard` `./excel-engine.service` |
| `backend/src/ozellik/giris/excel-engine/excel-engine.module.ts` | `@nestjs/common` `../../../altyapi/db/prisma.module` `./excel-engine.service` `./excel-engine.controller` |
| `backend/src/ozellik/giris/excel-engine/excel-engine.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `xlsx` |
| `backend/src/ozellik/giris/excel-grid/excel-grid.controller.ts` | `@nestjs/common` `@nestjs/platform-express` `multer` `../../../altyapi/auth/guards/jwt-auth.guard` `./excel-grid.service` |
| `backend/src/ozellik/giris/excel-grid/excel-grid.module.ts` | `@nestjs/common` `../../../altyapi/db/prisma.module` `./excel-grid.service` `./excel-grid.controller` |
| `backend/src/ozellik/giris/excel-grid/excel-grid.service.ts` | `@nestjs/common` `xlsx` `../../../altyapi/db/prisma.service` `./sheet-discipline` `./standart-sema` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `@nestjs/platform-express` `multer` `./admin.service` `../../giris/excel-grid/excel-grid.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` |
| `backend/src/ozellik/kutuphane/admin/admin.module.ts` | `@nestjs/common` `./admin.controller` `./admin.service` `../../../altyapi/db/prisma.module` `../../giris/ai/ai.module` `../../giris/excel-grid/excel-grid.module` `../../eslestirme/matching/matching.module` |
| `backend/src/ozellik/kutuphane/admin/admin.service.ts` | `@nestjs/common` `xlsx` `../../../altyapi/db/prisma.service` `../../giris/ai/ai.service` `../../giris/ai/ceviri.service` `../../eslestirme/matching/terminology.service` `../../eslestirme/utils/etiket-display` `../../eslestirme/matching/index/product-index` `../silme-etkisi` `../../eslestirme/matching/tag-generator` |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | `./brands.service` `./dto/create-brand.dto` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` |
| `backend/src/ozellik/kutuphane/brands/brands.module.ts` | `@nestjs/common` `./brands.service` `./brands.controller` |
| `backend/src/ozellik/kutuphane/brands/brands.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `./dto/create-brand.dto` `../silme-etkisi` |
| `backend/src/ozellik/kutuphane/brands/dto/create-brand.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `@nestjs/platform-express` `multer` `./labor-firms.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../giris/excel-grid/excel-grid.service` `../../../altyapi/auth/kimlik` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.module.ts` | `@nestjs/common` `./labor-firms.service` `./labor-firms.controller` `../../giris/excel-grid/excel-grid.module` `../../eslestirme/matching/matching.module` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `../../eslestirme/utils/build-material-context` `../../eslestirme/matching/matching.service` `../../eslestirme/matching/index/product-index` `../../../altyapi/auth/kimlik` `../../eslestirme/matching/tag-generator` |
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | `./labor.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/tier.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` |
| `backend/src/ozellik/kutuphane/labor/labor.module.ts` | `@nestjs/common` `./labor.service` `./labor.controller` `../../../altyapi/db/prisma.module` |
| `backend/src/ozellik/kutuphane/labor/labor.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` |
| `backend/src/ozellik/kutuphane/library/dto/add-library-rows.dto.ts` | `class-transformer` `./create-manual-brand.dto` |
| `backend/src/ozellik/kutuphane/library/dto/bulk-discount.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/library/dto/bulk-update-items.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/library/dto/create-library-item.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/library/dto/create-manual-brand.dto.ts` | `class-transformer` |
| `backend/src/ozellik/kutuphane/library/dto/import-price-list.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/library/dto/update-library-item.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `./library.service` `./dto/create-library-item.dto` `./dto/update-library-item.dto` `./dto/import-price-list.dto` `./dto/bulk-discount.dto` `./dto/bulk-update-items.dto` `./dto/create-manual-brand.dto` `./dto/add-library-rows.dto` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` |
| `backend/src/ozellik/kutuphane/library/library.module.ts` | `@nestjs/common` `./library.service` `./library.controller` `../../eslestirme/matching/matching.module` |
| `backend/src/ozellik/kutuphane/library/library.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `../../../altyapi/auth/kimlik` `./dto/create-library-item.dto` `./dto/update-library-item.dto` `./dto/import-price-list.dto` `./dto/bulk-discount.dto` `./dto/bulk-update-items.dto` `./dto/create-manual-brand.dto` `./dto/add-library-rows.dto` `./library-sheet-builder` `../../eslestirme/matching/terminology.service` |
| `backend/src/ozellik/kutuphane/materials/dto/create-material-price.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/materials/dto/create-material.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/materials/materials.controller.ts` | `./materials.service` `./dto/create-material.dto` `./dto/create-material-price.dto` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` |
| `backend/src/ozellik/kutuphane/materials/materials.module.ts` | `@nestjs/common` `./materials.service` `./materials.controller` |
| `backend/src/ozellik/kutuphane/materials/materials.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `./dto/create-material.dto` `./dto/create-material-price.dto` |
| `backend/src/ozellik/odeme/abonelik/abonelik.controller.ts` | `@nestjs/common` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` `./erisim.servisi` `./satinalma.servisi` |
| `backend/src/ozellik/odeme/abonelik/abonelik.servisi.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `@prisma/client` `../iyzico/iyzico.client` |
| `backend/src/ozellik/odeme/abonelik/erisim.guard.ts` | `@nestjs/core` `../../../altyapi/auth/kimlik` `./erisim.servisi` |
| `backend/src/ozellik/odeme/abonelik/erisim.servisi.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `@prisma/client` |
| `backend/src/ozellik/odeme/abonelik/mutabakat.job.ts` | `@nestjs/common` `@nestjs/schedule` `../../../altyapi/db/prisma.service` `@prisma/client` `../iyzico/iyzico.client` `./abonelik.servisi` |
| `backend/src/ozellik/odeme/abonelik/satinalma.servisi.ts` | `@nestjs/config` `@nestjs/schedule` `../../../altyapi/db/prisma.service` `../iyzico/iyzico.client` `./abonelik.servisi` |
| `backend/src/ozellik/odeme/dunning/dunning.servisi.ts` | `@nestjs/common` `@nestjs/config` `@nestjs/schedule` `../../../altyapi/db/prisma.service` `@prisma/client` `../iyzico/iyzico.client` `../abonelik/abonelik.servisi` `../eposta/eposta.servisi` |
| `backend/src/ozellik/odeme/eposta/eposta.servisi.ts` | `@nestjs/common` `@nestjs/config` |
| `backend/src/ozellik/odeme/fatura/fatura.servisi.ts` | `@nestjs/common` `@nestjs/schedule` `../../../altyapi/db/prisma.service` `@prisma/client` `./muhasebe.adaptor` `../eposta/eposta.servisi` |
| `backend/src/ozellik/odeme/fatura/muhasebe.adaptor.ts` | `@nestjs/common` `@nestjs/config` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `@nestjs/common` `./havale.servisi` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `../../../altyapi/auth/decorators/current-user.decorator` |
| `backend/src/ozellik/odeme/havale/havale.servisi.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `@prisma/client` `../abonelik/abonelik.servisi` `../fatura/fatura.servisi` `../eposta/eposta.servisi` `../dunning/dunning.metinleri` |
| `backend/src/ozellik/odeme/iyzico/imza.ts` | `node:crypto` |
| `backend/src/ozellik/odeme/iyzico/iyzico.client.ts` | `@nestjs/common` `@nestjs/config` `../yapilandirma` `node:crypto` |
| `backend/src/ozellik/odeme/odeme.module.ts` | `@nestjs/common` `@nestjs/config` `@nestjs/schedule` `./iyzico/iyzico.client` `./webhook/webhook.controller` `./webhook/webhook.isleyici` `./abonelik/abonelik.servisi` `./abonelik/erisim.servisi` `./abonelik/satinalma.servisi` `./abonelik/abonelik.controller` `./abonelik/mutabakat.job` `./dunning/dunning.servisi` `./fatura/fatura.servisi` `./havale/havale.servisi` `./havale/havale.controller` `./eposta/eposta.servisi` |
| `backend/src/ozellik/odeme/webhook/webhook.controller.ts` | `@nestjs/config` `../../../altyapi/db/prisma.service` `./webhook.isleyici` `../yapilandirma` |
| `backend/src/ozellik/odeme/webhook/webhook.isleyici.ts` | `@nestjs/common` `@nestjs/schedule` `../../../altyapi/db/prisma.service` `../abonelik/abonelik.servisi` `../fatura/fatura.servisi` `../dunning/dunning.servisi` |
| `backend/src/ozellik/odeme/yapilandirma.ts` | `@nestjs/common` `@nestjs/config` |
| `backend/src/ozellik/teklif/quotes/dto/create-quote.dto.ts` | `class-validator` `class-transformer` |
| `backend/src/ozellik/teklif/quotes/export-engine.ts` | `exceljs` `./standart-cikti` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `@nestjs/platform-express` `express` `./quotes.service` `./dto/create-quote.dto` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` `multer` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` |
| `backend/src/ozellik/teklif/quotes/quotes.module.ts` | `@nestjs/common` `./quotes.service` `./quotes.controller` `../../giris/ai/ai.module` `../../../altyapi/db/prisma.module` `../../fiyat/exchange-rates/exchange-rates.module` `../../odeme/odeme.module` |
| `backend/src/ozellik/teklif/quotes/quotes.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `./dto/create-quote.dto` `../../../altyapi/auth/kimlik` `xlsx` `exceljs` `./export-engine` `./standart-cikti` `../../cikti/quote-formats/format-engine` `../../fiyat/exchange-rates/exchange-rates.service` `../../giris/ai/ceviri.service` `../../fiyat/matching/pricing` |
| `backend/src/ozellik/teklif/quotes/standart-cikti.ts` | `exceljs` |
| `backend/src/surum.ts` | `./surum.generated` |
| `backend/test/a1-silme-etkisi-test.ts` | `@prisma/client` `@nestjs/common` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/kutuphane/admin/admin.controller` `../src/ozellik/kutuphane/brands/brands.service` `../src/ozellik/kutuphane/brands/brands.controller` `reflect-metadata` |
| `backend/test/admin-import-test.ts` | `../src/ozellik/eslestirme/utils/etiket-display` |
| `backend/test/aile-oncelik-simulasyon.ts` | `fs` `path` `../src/ozellik/eslestirme/matching/ad-cins-sozlugu` `../src/ozellik/eslestirme/matching/ad-resolver` `../src/ozellik/eslestirme/matching/index/product-index` `xlsx` |
| `backend/test/aile-oncelik-test.ts` | `../src/ozellik/eslestirme/matching/ad-cins-sozlugu` `../src/ozellik/eslestirme/matching/index/product-index` |
| `backend/test/aile-uyusmazligi-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/alias-kelime-yutma-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/ad-cins-sozlugu` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/audit-canli-kosum.ts` | `@prisma/client` `fs` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/kutuphane/library/library.service` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/eslestirme/matching/conversion` |
| `backend/test/audit-real-excel.ts` | `xlsx` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/product-index` |
| `backend/test/b1-kutuphane-cascade-test.ts` | `@prisma/client` |
| `backend/test/build-sha-kablolama-test.ts` | `fs` `path` `../src/health.controller` |
| `backend/test/cap-cevrilemedi-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/eslestirme/matching/conversion` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/ceviri-karar-test.ts` | `../src/ozellik/giris/ai/ceviri.service` |
| `backend/test/cikti-dil-test.ts` | `../src/ozellik/teklif/quotes/cikti-dil` `../src/ozellik/teklif/quotes/standart-cikti` |
| `backend/test/contract-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/types` |
| `backend/test/conversion-test.ts` | `../src/ozellik/eslestirme/matching/conversion` |
| `backend/test/d1-marka-silme-capraz-tenant-test.ts` | `@prisma/client` `@nestjs/common` `../src/ozellik/kutuphane/brands/brands.service` |
| `backend/test/dn-koprusu-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/conversion` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/erisim-kapisi-test.ts` | `@prisma/client` `../src/ozellik/odeme/abonelik/erisim.guard` `../src/ozellik/teklif/quotes/quotes.controller` `../src/ozellik/cikti/quote-formats/quote-formats.controller` `../src/modules/dwg-engine/dwg-engine.controller` `../src/ozellik/odeme/abonelik/abonelik.controller` `reflect-metadata` `node:fs` `node:path` |
| `backend/test/erken-kurtarma-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/excel-grid-test.ts` | `xlsx` `../src/ozellik/giris/excel-grid/excel-grid.service` |
| `backend/test/export-format-test.ts` | `exceljs` `../src/ozellik/teklif/quotes/export-engine` `../src/ozellik/cikti/quote-formats/format-engine` |
| `backend/test/export-live-sim-test.ts` | `exceljs` `../src/ozellik/teklif/quotes/quotes.service` |
| `backend/test/fallback-ad-kilidi-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/faz0-gs7-probe.ts` | `fs` `path` `../src/ozellik/giris/excel-grid/excel-grid.service` |
| `backend/test/firma-ekseni-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/kutuphane/labor-firms/labor-firms.service` `../src/altyapi/auth/kimlik` `reflect-metadata` |
| `backend/test/firma-izolasyon-test.ts` | `@prisma/client` `../src/ozellik/teklif/quotes/quotes.service` `../src/altyapi/auth/kimlik` `../src/ozellik/cikti/quote-formats/quote-formats.service` `../src/ozellik/kutuphane/library/library.service` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `reflect-metadata` |
| `backend/test/fixture-anonim.ts` | `fs` `path` `jszip` |
| `backend/test/fixture-dogrula.ts` | `fs` `path` `./fixture-anonim` `../src/ozellik/giris/excel-grid/excel-grid.service` `jszip` |
| `backend/test/fiyat-capasi-test.ts` | `../scripts/paketleri-kur` |
| `backend/test/gercek-dosya-test.ts` | `fs` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/teklif/quotes/quotes.service` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/cikti/quote-formats/format-engine` `../src/ozellik/teklif/quotes/export-engine` |
| `backend/test/gs6b-teshis.ts` | `fs` `../src/ozellik/giris/excel-grid/excel-grid.service` |
| `backend/test/guvenlik-turu-2-test.ts` | `node:fs` `node:path` `../src/altyapi/auth/decorators/roles.decorator` `../src/ozellik/kutuphane/labor/labor.controller` `../src/ozellik/teklif/quotes/quotes.controller` `../src/ozellik/kutuphane/brands/brands.controller` `../src/modules/dwg-engine/dwg-engine.controller` `../src/modules/dwg-engine/dwg-sahiplik.servisi` `reflect-metadata` |
| `backend/test/guvenlik-uclari-test.ts` | `@nestjs/core` `../src/ozellik/eslestirme/matching/matching.controller` `../src/ozellik/eslestirme/labor-matching/labor-matching.controller` `../src/altyapi/auth/decorators/roles.decorator` `../src/ozellik/kutuphane/labor/labor.controller` `../src/ozellik/giris/ai/ai.controller` `../src/altyapi/auth/guards/tier.guard` `../src/ozellik/kutuphane/brands/brands.controller` `../src/ozellik/kutuphane/admin/admin.controller` `reflect-metadata` |
| `backend/test/iliskisel-alan-suzgeci-test.ts` | `../src/ozellik/teklif/quotes/quotes.service` |
| `backend/test/imza-ekseni-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/tag-generator` `../src/ozellik/eslestirme/matching/shared-tag-matcher` |
| `backend/test/index-engine-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/conversion` |
| `backend/test/iscilik-satir-silme-test.ts` | `../src/ozellik/kutuphane/labor-firms/labor-firms.service` |
| `backend/test/iyzico-imza-basligi-test.ts` | `node:crypto` `@nestjs/config` `../src/ozellik/odeme/iyzico/iyzico.client` |
| `backend/test/kalem59-oksuz-kutuphane-test.ts` | `@prisma/client` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/kaucuk-izolasyon-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/eslestirme/matching/ad-resolver` `../src/ozellik/eslestirme/matching/index/types` `../src/ozellik/eslestirme/matching/normalizer` |
| `backend/test/kd11-toplam-yollari-test.ts` | `fs` `path` `../src/ozellik/giris/excel-grid/excel-grid.service` `../../frontend/ozellik/fiyat/pricing` |
| `backend/test/kd12-baslik-satiri-test.ts` | `fs` `path` `../src/ozellik/giris/excel-grid/excel-grid.service` |
| `backend/test/kd9-kur-olcutu-test.ts` | `../../frontend/ozellik/fiyat/pricing` |
| `backend/test/kisisel-liste-izolasyon-test.ts` | `@nestjs/common` `../src/ozellik/kutuphane/brands/brands.service` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/kutuphane/library/library.service` |
| `backend/test/kl-kayit-toplami-test.ts` | `../src/ozellik/teklif/quotes/quotes.service` `../src/ozellik/fiyat/matching/pricing` |
| `backend/test/kl-liste-ekleme-test.ts` | `@prisma/client` `../src/ozellik/kutuphane/labor-firms/labor-firms.service` `../src/ozellik/kutuphane/library/library.service` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/kur-donmasi-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/kurtarma-mesaj-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/kutuphane-ad-duzenleme-test.ts` | `../src/ozellik/kutuphane/library/library-sheet-builder` `../src/ozellik/kutuphane/library/library.service` |
| `backend/test/kutuphane-liste-test.ts` | `@nestjs/common` `../src/ozellik/kutuphane/labor-firms/labor-firms.service` `../src/ozellik/kutuphane/library/library.service` |
| `backend/test/labor-matching-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/labor-matching/labor-matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/labor-sheet-test.ts` | `@prisma/client` `../src/ozellik/kutuphane/labor-firms/labor-firms.service` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/library-transfer-test.ts` | `../src/ozellik/kutuphane/library/library-sheet-builder` |
| `backend/test/manifest-kapisi.ts` | `fs` `path` |
| `backend/test/matching-regression.ts` | `@prisma/client` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/tag-generator` `../src/ozellik/eslestirme/matching/normalizer` |
| `backend/test/matching-unit-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/migration-zinciri-test.ts` | `@electric-sql/pglite` `node:fs` `node:path` |
| `backend/test/odeme-onyukleme-test.ts` | `reflect-metadata` |
| `backend/test/olcu-anahtari-cakismasi-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/tag-generator` `../src/ozellik/eslestirme/matching/normalizer` `../src/ozellik/eslestirme/matching/conversion` |
| `backend/test/onceden-fiyatli-test.ts` | `fs` `../src/ozellik/giris/excel-grid/excel-grid.service` |
| `backend/test/oneri-kutusu-cekince-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/types` |
| `backend/test/ortam-degiskenleri-test.ts` | `node:fs` `node:path` |
| `backend/test/p2-2-sheets-indeks-test.ts` | `@prisma/client` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/kutuphane/library/library.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/index/product-index` |
| `backend/test/pano18-para-birimi-test.ts` | `fs` `exceljs` `../src/ozellik/teklif/quotes/standart-cikti` `../src/ozellik/teklif/quotes/export-engine` `../src/ozellik/cikti/quote-formats/format-engine` |
| `backend/test/perf-profil.ts` | `fs` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/teklif/quotes/export-engine` `../src/ozellik/teklif/quotes/standart-cikti` `../src/ozellik/cikti/quote-formats/format-engine` `exceljs` |
| `backend/test/pk3-kimlik-haritasi-test.ts` | `./fixture-anonim` |
| `backend/test/pk3-repo-kapsama-test.ts` | `fs` `path` `child_process` |
| `backend/test/pk9-sessiz-indeks-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/regression-all.ts` | `child_process` |
| `backend/test/s45-malzeme-aile-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/eslestirme/matching/conversion` `../src/ozellik/eslestirme/matching/index/types` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/s45-olcum.ts` | `fs` `path` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/sozluk-golgeleme-olcum.ts` | `../src/ozellik/eslestirme/matching/ad-cins-sozlugu` `../src/ozellik/eslestirme/matching/ad-resolver` `../src/ozellik/eslestirme/matching/normalizer` `../src/ozellik/eslestirme/matching/index/product-index` |
| `backend/test/spec-regression-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/standart-cikti-test.ts` | `fs` `path` `exceljs` `../src/ozellik/teklif/quotes/standart-cikti` `../src/ozellik/giris/excel-grid/excel-grid.service` |
| `backend/test/standart-sema-test.ts` | `fs` `path` `xlsx` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/giris/excel-grid/standart-sema` |
| `backend/test/tam-ad-surgunu-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/tam-zincir.ts` | `child_process` `path` |
| `backend/test/urun-degil-test.ts` | `../src/ozellik/eslestirme/matching/index/line-parser` |
| `backend/test/varyant-surukleme-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/yuzey-genisletme-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` |
| `frontend/app/(protected)/abonelik/donus/page.tsx` | `react` `next/link` `@/ortak/lib/api` `@/ortak/contexts/CapabilitiesContext` |
| `frontend/app/(protected)/abonelik/page.tsx` | `react` `@/ortak/lib/api` `@/ortak/contexts/CapabilitiesContext` `@/ozellik/odeme/paket-bicim` |
| `frontend/app/(protected)/dashboard/page.tsx` | `react` `next/navigation` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/contexts/CapabilitiesContext` `@/ortak/kabuk/components/dashboard/QuickStart` `@/ozellik/teklif/dashboard/RecentQuotes` `@/ortak/kabuk/components/dashboard/QuickAccess` |
| `frontend/app/(protected)/dwg-workspace/page.tsx` | `next/navigation` `next/dynamic` `lucide-react` `next/link` `@/components/dwg-metraj/types` |
| `frontend/app/(protected)/labor-firms/[firmaId]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/kutuphane/library/InlineFirmEntry` `@/ozellik/tablo/excel-grid/types` |
| `frontend/app/(protected)/labor-firms/page.tsx` | `react` `next/link` `next/navigation` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/ui/input` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ortak/contexts/CapabilitiesContext` |
| `frontend/app/(protected)/labor/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ortak/lib/utils` |
| `frontend/app/(protected)/layout.tsx` | `react` `next/navigation` `next/link` `@/ortak/contexts/CapabilitiesContext` `@/ozellik/odeme/AbonelikSeridi` `@/ortak/kabuk/components/layout/Sidebar` `@/ortak/kabuk/components/layout/Breadcrumb` |
| `frontend/app/(protected)/library/brand/[brandId]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/types` |
| `frontend/app/(protected)/library/electrical-brands/page.tsx` | `react` `next/link` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/ui/dialog` `@/ortak/ui/select` `@/ortak/lib/api` `@/ortak/hooks/use-toast` |
| `frontend/app/(protected)/library/mechanical-brands/page.tsx` | `react` `next/link` `next/navigation` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/ui/dialog` `@/ortak/ui/select` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ozellik/kutuphane/library/ManualBrandModal` |
| `frontend/app/(protected)/library/page.tsx` | `react` `next/link` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/card` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ortak/lib/api` `@/ozellik/fiyat/pricing` |
| `frontend/app/(protected)/materials/[brandId]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/lib/silme-onay-metni` `@/lib/silme-etkisi-getir` `@/ortak/lib/utils` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/SheetTabs` `@/ozellik/tablo/excel-grid/types` |
| `frontend/app/(protected)/materials/electrical/page.tsx` | `react` `next/link` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/ui/dialog` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/lib/silme-onay-metni` `@/lib/silme-etkisi-getir` `@/ozellik/kutuphane/hata-metni` |
| `frontend/app/(protected)/materials/mechanical/page.tsx` | `react` `next/link` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/ui/dialog` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/lib/silme-onay-metni` `@/lib/silme-etkisi-getir` `@/ozellik/kutuphane/hata-metni` |
| `frontend/app/(protected)/materials/page.tsx` | `react` `next/navigation` `lucide-react` |
| `frontend/app/(protected)/profile/page.tsx` | `react` `next/navigation` `@/ortak/ui/button` `@/ortak/lib/api` `@/ortak/lib/utils` |
| `frontend/app/(protected)/quote-formats/page.tsx` | `react` `next/link` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` |
| `frontend/app/(protected)/quotes/[id]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/lib/utils` `@/ozellik/teklif/ceviri` `@/ozellik/teklif/taslak` `@/ozellik/cikti/export-download` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/SheetTabs` `@/ozellik/tablo/excel-grid/types` `@/ozellik/fiyat/use-currency` `@/ortak/contexts/CapabilitiesContext` `@/ozellik/tablo/disiplin` `@/ortak/types/quotes` `@/ortak/types` |
| `frontend/app/(protected)/quotes/new/page.tsx` | `react` `next/navigation` `next/link` `@/ortak/ui/button` `@/ozellik/tablo/disiplin` `@/ortak/ui/card` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ortak/lib/utils` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/SheetTabs` `@/ozellik/tablo/quotes/ColumnManagerPanel` `@/ozellik/tablo/excel-grid/types` `@/ortak/contexts/CapabilitiesContext` `@/components/dwg-metraj/types` `@/components/dwg-metraj/MetrajEditor` `@/ozellik/tablo/parse-material-text` `@/ozellik/tablo/merge-multisheet` `@/ozellik/giris/kaynak-kolon` `@/lib/indeks-sagligi` `@/ozellik/teklif/dwg-teklif-sema` `@/ozellik/teklif/teklif-kalem` `@/ozellik/teklif/restore-rematch` `@/ozellik/teklif/taslak` `@/ozellik/teklif/ceviri` `@/ozellik/fiyat/sayi-alani` `@/ozellik/teklif/fiyatsiz-kalem-uyarisi` `@/ozellik/fiyat/pricing` `@/ortak/types` `@/ozellik/fiyat/use-currency` |
| `frontend/app/(protected)/quotes/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` |
| `frontend/app/admin/brands/page.tsx` | `react` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/lib/silme-onay-metni` `@/lib/silme-etkisi-getir` `@/ozellik/kutuphane/oksuz-kutuphane-uyarisi` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/badge` `@/ortak/ui/card` |
| `frontend/app/admin/layout.tsx` | `react` `next/navigation` `@/ozellik/kutuphane/admin/AdminSidebar` |
| `frontend/app/admin/page.tsx` | `react` `next/navigation` |
| `frontend/app/admin/stats/page.tsx` | `react` `@/ortak/ui/button` `@/ortak/ui/badge` `@/ortak/ui/card` `@/ozellik/kutuphane/ai-butce` |
| `frontend/app/admin/users/page.tsx` | `react` `lucide-react` `@/ortak/lib/api` `@/ortak/ui/input` `@/ortak/ui/button` `@/ortak/ui/badge` `@/ortak/ui/card` |
| `frontend/app/dev/grid-test/page.tsx` | `react` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/types` |
| `frontend/app/layout.tsx` | `next` `next/font/google` `@/ortak/ui/toaster` `@/ortak/ui/confirm-dialog` `./globals.css` |
| `frontend/app/login/page.tsx` | `react` `next/navigation` `next/link` `@/ortak/lib/api` `@/ortak/ui/parola-alani` `@/ortak/hooks/use-toast` |
| `frontend/app/page.tsx` | `next/link` `lucide-react` `@/ortak/kabuk/components/landing/GirisliyseYonlendir` `@/ortak/kabuk/components/landing/NasilCalisir` |
| `frontend/app/register/page.tsx` | `react` `next/navigation` `next/link` `@/ortak/lib/api` `@/ortak/ui/parola-alani` `@/ortak/hooks/use-toast` |
| `frontend/components/dwg-diameter-engine/DiameterLegendPanel.tsx` | `react` `lucide-react` `@/components/dwg-metraj/diameter-colors` `./types` |
| `frontend/components/dwg-diameter-engine/types.ts` | `@/components/dwg-metraj/types` `@/components/dwg-workspace/types` `@/components/dwg-metraj/diameter-colors` `@/components/dwg-metraj/constants` |
| `frontend/components/dwg-diameter-engine/useLayerCalc.ts` | `react` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/components/dwg-metraj` `@/components/dwg-workspace/types` `./types` |
| `frontend/components/dwg-diameter-engine/useOriginalColorState.ts` | `react` |
| `frontend/components/dwg-metraj/DiameterEditPopup.tsx` | `react` `lucide-react` `./types` `./diameter-colors` |
| `frontend/components/dwg-metraj/DwgUploader.tsx` | `react` `lucide-react` `@/ortak/lib/utils` `@/ortak/hooks/use-toast` `@/ortak/lib/api` `./types` `./unit-detection` `@/components/dwg-workspace` |
| `frontend/components/dwg-metraj/MetrajEditor.tsx` | `react` `lucide-react` `@/ortak/lib/utils` `@/ortak/hooks/use-toast` `./types` |
| `frontend/components/dwg-metraj/diameter-colors.ts` | `./constants` |
| `frontend/components/dwg-metraj/unit-detection.test.ts` | `vitest` |
| `frontend/components/dwg-tagging/BucketPanel.tsx` | `react` `lucide-react` `@/ortak/lib/utils` `@/ortak/hooks/use-toast` `./useTaggingStore` |
| `frontend/components/dwg-tagging/useTaggingStore.ts` | `zustand` `zustand/middleware` `@/components/dwg-metraj/diameter-colors` |
| `frontend/components/dwg-viewer/DxfCanvasViewer.tsx` | `react` `rbush` `lucide-react` `@/ortak/lib/api` `./types` `@/components/dwg-metraj/types` `@/components/dwg-metraj/diameter-colors` `@/components/dwg-metraj/constants` `./segment-length` `./useViewport` `./aci-colors` |
| `frontend/components/dwg-viewer/segment-length.test.ts` | `vitest` `./segment-length` |
| `frontend/components/dwg-viewer/useViewport.ts` | `react` `./types` |
| `frontend/components/dwg-workspace/DwgProjectWorkspace.tsx` | `react` `lucide-react` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ortak/lib/api` `@/components/dwg-viewer` `@/components/dwg-metraj` `@/components/dwg-metraj/types` `./LayerInfoSidebar` `./LayerVisibilityPanel` `./MetrajSummaryPanel` `./useWorkspaceState` `./onay-revizyon` `./sprinkler-bayatlik` `./types` `@/components/dwg-tagging` `@/components/dwg-metraj/diameter-colors` `@/components/dwg-metraj/constants` |
| `frontend/components/dwg-workspace/LayerInfoSidebar.tsx` | `react` `lucide-react` `./types` `@/components/dwg-metraj/constants` `./onay-revizyon` |
| `frontend/components/dwg-workspace/LayerVisibilityPanel.tsx` | `react` `lucide-react` `@/ortak/lib/utils` |
| `frontend/components/dwg-workspace/MetrajSummaryPanel.tsx` | `react` `lucide-react` `./types` `./onay-revizyon` `@/components/dwg-metraj/diameter-colors` `@/components/dwg-metraj/constants` |
| `frontend/components/dwg-workspace/onay-revizyon.test.ts` | `vitest` `./types` |
| `frontend/components/dwg-workspace/sprinkler-bayatlik.test.ts` | `vitest` `./sprinkler-bayatlik` |
| `frontend/components/dwg-workspace/types.ts` | `@/components/dwg-metraj` |
| `frontend/components/dwg-workspace/useWorkspaceState.ts` | `react` `./onay-revizyon` |
| `frontend/lib/gs6b-golge-kurali.test.ts` | `vitest` `fs` `path` |
| `frontend/lib/indeks-sagligi.test.ts` | `vitest` `./indeks-sagligi` |
| `frontend/lib/kar-degisimi.test.ts` | `vitest` |
| `frontend/lib/kar-satiri.test.ts` | `vitest` |
| `frontend/lib/kaynak-kolon.test.ts` | `vitest` `../ozellik/giris/kaynak-kolon` |
| `frontend/lib/marj-tek-kaynak.test.ts` | `vitest` `fs` `path` `../ozellik/fiyat/pricing` |
| `frontend/lib/merge-multisheet.test.ts` | `vitest` `../ozellik/tablo/merge-multisheet` `@/ozellik/tablo/excel-grid/types` |
| `frontend/lib/ondalik-kurali.test.ts` | `vitest` |
| `frontend/lib/parse-material-text.test.ts` | `vitest` `../ozellik/tablo/parse-material-text` |
| `frontend/lib/popup-secici-sozlesmesi.test.ts` | `vitest` `fs` `path` |
| `frontend/lib/pricing.test.ts` | `vitest` `../ozellik/fiyat/pricing` |
| `frontend/lib/sayfa-toplamlari.test.ts` | `vitest` |
| `frontend/lib/sayi-ayristirma.test.ts` | `vitest` `fs` `path` `../test/e2e-golden/sayi-ayristirma.mjs` |
| `frontend/lib/silme-etkisi-getir.ts` | `@/ortak/lib/api` `./silme-onay-metni` |
| `frontend/lib/silme-onay-metni.test.ts` | `vitest` `./silme-onay-metni` |
| `frontend/next.config.js` | `@cloudflare/next-on-pages/next-dev` |
| `frontend/ortak/contexts/CapabilitiesContext.tsx` | `react` `@/ortak/lib/api` `@/ozellik/odeme/erisim-durumu` |
| `frontend/ortak/hooks/onay-secenekleri.test.ts` | `vitest` `fs` `path` |
| `frontend/ortak/hooks/use-confirm.ts` | `react` |
| `frontend/ortak/hooks/use-toast.ts` | `react` `@/ortak/ui/toast` |
| `frontend/ortak/kabuk/components/dashboard/QuickAccess.tsx` | `next/link` `lucide-react` |
| `frontend/ortak/kabuk/components/dashboard/QuickStart.tsx` | `react` `lucide-react` `@/ortak/lib/utils` `@/ortak/hooks/use-toast` `./dosya-turu` |
| `frontend/ortak/kabuk/components/dashboard/dosya-turu.test.ts` | `vitest` `./dosya-turu` |
| `frontend/ortak/kabuk/components/landing/GirisliyseYonlendir.tsx` | `react` `next/navigation` |
| `frontend/ortak/kabuk/components/landing/NasilCalisir.tsx` | `react` `./nasil-calisir.css` |
| `frontend/ortak/kabuk/components/layout/Breadcrumb.tsx` | `next/navigation` `next/link` `lucide-react` |
| `frontend/ortak/kabuk/components/layout/Sidebar.tsx` | `next/navigation` `next/link` `@/ortak/lib/utils` |
| `frontend/ortak/lib/api-401-kapsami.test.ts` | `vitest` `./api` |
| `frontend/ortak/lib/api.ts` | `axios` |
| `frontend/ortak/lib/utils.ts` | `clsx` `tailwind-merge` |
| `frontend/ortak/types/quotes.ts` | `./index` |
| `frontend/ortak/ui/badge.tsx` | `react` `class-variance-authority` `@/ortak/lib/utils` |
| `frontend/ortak/ui/button.tsx` | `react` `@radix-ui/react-slot` `class-variance-authority` `@/ortak/lib/utils` |
| `frontend/ortak/ui/card.tsx` | `react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/confirm-dialog.tsx` | `react` `lucide-react` `@/ortak/hooks/use-confirm` `@/ortak/lib/utils` |
| `frontend/ortak/ui/dialog.tsx` | `react` `@radix-ui/react-dialog` `lucide-react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/geri-butonu.tsx` | `next/link` `next/navigation` `lucide-react` |
| `frontend/ortak/ui/input.tsx` | `react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/label.tsx` | `react` `@radix-ui/react-label` `class-variance-authority` `@/ortak/lib/utils` |
| `frontend/ortak/ui/parola-alani.tsx` | `react` `lucide-react` |
| `frontend/ortak/ui/select.tsx` | `react` `@radix-ui/react-select` `lucide-react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/table.tsx` | `react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/toast.tsx` | `react` `@radix-ui/react-toast` `class-variance-authority` `lucide-react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/toaster.tsx` | `@/ortak/hooks/use-toast` |
| `frontend/ozellik/cikti/export-download.ts` | `@/ortak/lib/api` `@/ortak/hooks/use-toast` |
| `frontend/ozellik/fiyat/ikiz-suzgec-kapilari.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/ozellik/fiyat/kar-tek-suzgec.test.ts` | `vitest` `fs` `path` |
| `frontend/ozellik/fiyat/pricing.ts` | `./sayi-alani` |
| `frontend/ozellik/fiyat/sayi-oku.test.ts` | `vitest` `./sayi-alani` |
| `frontend/ozellik/fiyat/use-currency.ts` | `react` `@/ortak/lib/api` `@/ortak/types/quotes` |
| `frontend/ozellik/kutuphane/admin-stats.ts` | `@/ortak/lib/api` |
| `frontend/ozellik/kutuphane/admin/AdminSidebar.tsx` | `next/link` `next/navigation` `@/ortak/lib/utils` |
| `frontend/ozellik/kutuphane/ai-butce.test.ts` | `vitest` `./ai-butce` |
| `frontend/ozellik/kutuphane/hata-metni.test.ts` | `vitest` `fs` `path` `./hata-metni` |
| `frontend/ozellik/kutuphane/library/InlineFirmEntry.tsx` | `react` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/types` |
| `frontend/ozellik/kutuphane/library/ManualBrandModal.tsx` | `react` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/types` |
| `frontend/ozellik/kutuphane/oksuz-kutuphane-uyarisi.test.ts` | `vitest` `fs` `path` `./oksuz-kutuphane-uyarisi` |
| `frontend/ozellik/odeme/AbonelikSeridi.tsx` | `next/link` `@/ortak/contexts/CapabilitiesContext` `./erisim-durumu` |
| `frontend/ozellik/odeme/erisim-durumu.test.ts` | `vitest` `./paket-bicim` |
| `frontend/ozellik/tablo/excel-grid/CustomDropdown.tsx` | `react` `react-dom` |
| `frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx` | `react` `react-dom` `ag-grid-react` `ag-grid-community` `./types` `./oneri-cekince` `./useFillHandle` `./discount-utils` `./CustomDropdown` `./fill-down` `./yapistir` `./kopyala` `./isaret` `@/ozellik/tablo/parse-material-text` `@/ozellik/fiyat/pricing` `@/ozellik/fiyat/sayi-alani` `./build-material-context` `./aday-ayirt-edicilik` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `ag-grid-community/styles/ag-grid.css` `ag-grid-community/styles/ag-theme-alpine.css` `./fill-handle.css` |
| `frontend/ozellik/tablo/excel-grid/SheetTabs.tsx` | `react` |
| `frontend/ozellik/tablo/excel-grid/aday-ayirt-edicilik.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/ozellik/tablo/excel-grid/build-material-context.test.ts` | `vitest` `./build-material-context` |
| `frontend/ozellik/tablo/excel-grid/cap-sorguda.test.ts` | `vitest` `fs` `path` |
| `frontend/ozellik/tablo/excel-grid/discount-utils.test.ts` | `vitest` `./discount-utils` |
| `frontend/ozellik/tablo/excel-grid/fill-down.test.ts` | `vitest` `./fill-down` |
| `frontend/ozellik/tablo/excel-grid/fill-down.ts` | `../../fiyat/pricing` `../../fiyat/sayi-alani` |
| `frontend/ozellik/tablo/excel-grid/grup-iskonto-girisi.test.ts` | `vitest` `fs` `path` |
| `frontend/ozellik/tablo/excel-grid/isaret.test.ts` | `vitest` `fs` `path` `./isaret` |
| `frontend/ozellik/tablo/excel-grid/kar-yayilimi.test.ts` | `vitest` `./fill-down` `../../fiyat/pricing` |
| `frontend/ozellik/tablo/excel-grid/kopyala.test.ts` | `vitest` `./kopyala` `./yapistir` |
| `frontend/ozellik/tablo/excel-grid/oneri-cekince.test.ts` | `vitest` `fs` `path` |
| `frontend/ozellik/tablo/excel-grid/useFillHandle.tsx` | `react` `ag-grid-react` `ag-grid-community` `./types` |
| `frontend/ozellik/tablo/excel-grid/yapistir.test.ts` | `vitest` `./yapistir` `../../../test/e2e-golden/sayi-ayristirma.mjs` |
| `frontend/ozellik/tablo/quotes/ColumnManagerPanel.tsx` | `react` `lucide-react` |
| `frontend/ozellik/teklif/ceviri.test.ts` | `vitest` `../tablo/excel-grid/types` |
| `frontend/ozellik/teklif/ceviri.ts` | `../tablo/excel-grid/types` |
| `frontend/ozellik/teklif/dashboard/RecentQuotes.tsx` | `react` `next/link` `lucide-react` `@/ortak/lib/api` |
| `frontend/ozellik/teklif/dwg-teklif-sema.test.ts` | `vitest` |
| `frontend/ozellik/teklif/dwg-teklif-sema.ts` | `@/ozellik/tablo/excel-grid/types` |
| `frontend/ozellik/teklif/fiyatsiz-kalem-uyarisi.test.ts` | `vitest` `./teklif-kalem` |
| `frontend/ozellik/teklif/fiyatsiz-kalem-uyarisi.ts` | `./teklif-kalem` |
| `frontend/ozellik/teklif/restore-rematch.test.ts` | `vitest` `./restore-rematch` `../tablo/excel-grid/types` |
| `frontend/ozellik/teklif/restore-rematch.ts` | `../tablo/excel-grid/types` `../fiyat/sayi-alani` |
| `frontend/ozellik/teklif/taslak.test.ts` | `vitest` `./taslak` |
| `frontend/ozellik/teklif/teklif-kalem.test.ts` | `vitest` `./teklif-kalem` |
| `frontend/ozellik/teklif/teklif-kalem.ts` | `../fiyat/pricing` `../fiyat/sayi-alani` |
| `frontend/playwright.config.ts` | `@playwright/test` |
| `frontend/playwright.golden.config.ts` | `@playwright/test` `./test/e2e-golden/artefakt-dizini.cjs` |
| `frontend/scripts/surum-yaz.js` | `fs` `path` `child_process` |
| `frontend/tailwind.config.ts` | `tailwindcss` `tailwindcss-animate` |
| `frontend/test/e2e-golden/artefakt-dizini.cjs` | `node:fs` `node:path` `node:child_process` |
| `frontend/test/e2e-golden/bolum-f-kabul.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` `./helpers` |
| `frontend/test/e2e-golden/faz0-gs7-teshis.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` |
| `frontend/test/e2e-golden/firma-a-golden.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` `../../ozellik/fiyat/pricing` |
| `frontend/test/e2e-golden/global-setup.mjs` | `node:fs` `node:path` `node:url` `node:module` `./artefakt-dizini.cjs` `./surum-kapisi.cjs` `jsonwebtoken` |
| `frontend/test/e2e-golden/golden.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` |
| `frontend/test/e2e-golden/gs-kalicilik.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` |
| `frontend/test/e2e-golden/helpers.ts` | `@playwright/test` |
| `frontend/test/e2e-golden/pu4-popup-genislik.spec.ts` | `@playwright/test` `node:fs` `node:path` `./artefakt-dizini.cjs` `./helpers` |
| `frontend/test/e2e-golden/run.mjs` | `node:child_process` `node:path` `node:url` `./artefakt-dizini.cjs` `./surum-kapisi.cjs` |
| `frontend/test/e2e-golden/surum-kapisi.cjs` | `node:fs` `node:path` `node:child_process` |
| `frontend/test/e2e-golden/verify.mjs` | `node:fs` `node:path` `node:url` `node:module` `./sayi-ayristirma.mjs` `./artefakt-dizini.cjs` |
| `frontend/test/e2e/grid.spec.ts` | `@playwright/test` |
| `frontend/test/e2e/kopyala-yapistir.spec.ts` | `@playwright/test` |
| `frontend/vitest.config.ts` | `vitest/config` |
| `scripts/harita-denetle.mjs` | `node:child_process` `node:fs` `node:path` `node:url` `./harita-uret.mjs` |
| `scripts/harita-uret.mjs` | `node:child_process` `node:fs` `node:path` `node:url` |
| `scripts/klasor-denetle.mjs` | `node:child_process` `node:fs` `node:path` `node:url` `./harita-uret.mjs` |

## 3 · Uc noktalar

| Dosya | Uc |
|---|---|
| `backend/src/altyapi/auth/auth.controller.ts` | `POST /auth/register` |
| `backend/src/altyapi/auth/auth.controller.ts` | `POST /auth/login` |
| `backend/src/altyapi/auth/auth.controller.ts` | `GET /auth/me` |
| `backend/src/bootstrap.controller.ts` | `POST /bootstrap/make-admin` |
| `backend/src/health.controller.ts` | `GET /health` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `POST /dwg-engine/layers` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `POST /dwg-engine/parse` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `POST /dwg-engine/convert` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `GET /dwg-engine/health` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `POST /dwg-engine/upload` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `GET /dwg-engine/status/:fileId` |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | `GET /dwg-engine/geometry/:fileId` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | `POST /quote-formats` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | `GET /quote-formats` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | `GET /quote-formats/sample` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | `GET /quote-formats/:id/preview` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | `GET /quote-formats/:id/preview-pdf` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | `POST /quote-formats/:id/file` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | `PATCH /quote-formats/:id` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | `DELETE /quote-formats/:id` |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.controller.ts` | `POST /labor-matching/bulk-match` |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.controller.ts` | `POST /labor-matching/remember` |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.controller.ts` | `POST /labor-matching/reindex` |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.controller.ts` | `POST /labor-matching/backfill-tags` |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | `POST /matching/bulk-match` |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | `POST /matching/remember` |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | `GET /matching/index-health` |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | `GET /matching/aliases` |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | `POST /matching/aliases` |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | `DELETE /matching/aliases/:id` |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | `POST /matching/backfill-tags` |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | `POST /matching/generate-tags` |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.controller.ts` | `GET /exchange-rates` |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | `POST /ai/analyze` |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | `POST /ai/translate` |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | `POST /ai/translate/correct` |
| `backend/src/ozellik/giris/excel-engine/excel-engine.controller.ts` | `POST /excel-engine/analyze` |
| `backend/src/ozellik/giris/excel-grid/excel-grid.controller.ts` | `POST /excel-grid/prepare` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/stats` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/ai-stats` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/ai-tasks` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `PATCH /admin/ai-tasks` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/ai-health-check` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/users` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `PATCH /admin/users/:id/role` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `PATCH /admin/users/:id/status` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `PATCH /admin/users/:id/tier` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `DELETE /admin/users/:id` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/users/:id/subscriptions` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/users/:id/subscriptions` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `DELETE /admin/users/:userId/subscriptions/:subId` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/settings` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `PATCH /admin/settings` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/reindex-products` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/brands/:brandId/price-lists` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/price-lists/:id/silme-etkisi` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `DELETE /admin/price-lists/:id` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/brands/:brandId/materials` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/price-lists/:id/materials` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/materials/extract-pdf` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/materials/parse-full-excel` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/brands/:brandId/save-from-sheets` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/brands/:brandId/import-excel/preview` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/price-lists/:id/import-excel/preview` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/brands/:brandId/import-excel/commit` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/price-lists/:id/import-excel/commit` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/materials/save-bulk` |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | `GET /brands` |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | `GET /brands/search` |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | `GET /brands/price-lists/:listId/materials` |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | `GET /brands/:id` |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | `GET /brands/:id/price-lists` |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | `GET /brands/:id/silme-etkisi` |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | `POST /brands` |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | `PUT /brands/:id` |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | `DELETE /brands/:id` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `GET /labor-firms` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `GET /labor-firms/price-lists/:listId/items` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `GET /labor-firms/:id` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `GET /labor-firms/:id/price-lists` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `POST /labor-firms` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `PUT /labor-firms/:id` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `DELETE /labor-firms/:id` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/:id/price-lists` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `DELETE /labor-firms/price-lists/:listId` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `PUT /labor-firms/price-items/:id` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/price-items/bulk-update` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `DELETE /labor-firms/price-items/:id` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `GET /labor-firms/price-lists/:listId/sheets` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/price-lists/:listId/save-sheets` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/:id/save-bulk` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/:id/parse-full-excel` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `POST /labor-firms/:id/save-from-sheets` |
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | `GET /labor` |
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | `GET /labor/:id` |
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | `POST /labor` |
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | `PUT /labor/:id` |
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | `DELETE /labor/:id` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `GET /library` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `GET /library/brands` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `POST /library` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `POST /library/manual-brand` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `PUT /library/:id` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `POST /library/bulk-discount` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `POST /library/bulk-update-items` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `POST /library/import-price-list` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `GET /library/brand/:brandId/sheets` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `GET /library/brand/:brandId/lists` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `POST /library/brand/:brandId/rows` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `DELETE /library/brand/:brandId/lists/:listId` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `POST /library/brand/:brandId/save-sheets` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `DELETE /library/brand/:brandId` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `DELETE /library/:id` |
| `backend/src/ozellik/kutuphane/materials/materials.controller.ts` | `GET /materials` |
| `backend/src/ozellik/kutuphane/materials/materials.controller.ts` | `GET /materials/:id` |
| `backend/src/ozellik/kutuphane/materials/materials.controller.ts` | `POST /materials` |
| `backend/src/ozellik/kutuphane/materials/materials.controller.ts` | `PUT /materials/:id` |
| `backend/src/ozellik/kutuphane/materials/materials.controller.ts` | `DELETE /materials/:id` |
| `backend/src/ozellik/kutuphane/materials/materials.controller.ts` | `POST /materials/price` |
| `backend/src/ozellik/odeme/abonelik/abonelik.controller.ts` | `GET /abonelik/paketler` |
| `backend/src/ozellik/odeme/abonelik/abonelik.controller.ts` | `GET /abonelik/durum` |
| `backend/src/ozellik/odeme/abonelik/abonelik.controller.ts` | `POST /abonelik/basla` |
| `backend/src/ozellik/odeme/abonelik/abonelik.controller.ts` | `POST /abonelik/donus` |
| `backend/src/ozellik/odeme/abonelik/abonelik.controller.ts` | `POST /abonelik/kart-guncelle` |
| `backend/src/ozellik/odeme/abonelik/abonelik.controller.ts` | `POST /abonelik/iptal` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `GET /yonetim/havale` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `POST /yonetim/havale/teklif` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `POST /yonetim/havale/:id/fatura` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `POST /yonetim/havale/:id/onayla` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `POST /yonetim/havale/:id/iptal` |
| `backend/src/ozellik/odeme/webhook/webhook.controller.ts` | `POST /webhook/iyzico/abonelik` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `POST /quotes/upload-excel` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `POST /quotes` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `PUT /quotes/:id` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `GET /quotes` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `PATCH /quotes/:id/info` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `POST /quotes/:id/export` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `GET /quotes/:id/export-priced` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `GET /quotes/:id/exports` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `GET /quotes/:id/exports/:rev` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `GET /quotes/:id` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `DELETE /quotes/:id` |

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
| `backend/package.json` | `test:ceviri` | `ts-node test/ceviri-karar-test.ts` |
| `backend/package.json` | `test:cikti-dil` | `ts-node test/cikti-dil-test.ts` |
| `backend/package.json` | `test:product-index` | `ts-node test/product-index-test.ts` |
| `backend/package.json` | `test:index` | `ts-node test/index-engine-test.ts` |
| `backend/package.json` | `test:fallback-ad` | `ts-node test/fallback-ad-kilidi-test.ts` |
| `backend/package.json` | `test:kaucuk` | `ts-node test/kaucuk-izolasyon-test.ts` |
| `backend/package.json` | `test:varyant` | `ts-node test/varyant-surukleme-test.ts` |
| `backend/package.json` | `test:kurtarma-mesaj` | `ts-node test/kurtarma-mesaj-test.ts` |
| `backend/package.json` | `test:cap-cevrilemedi` | `ts-node test/cap-cevrilemedi-test.ts` |
| `backend/package.json` | `test:erken-kurtarma` | `ts-node test/erken-kurtarma-test.ts` |
| `backend/package.json` | `test:yuzey-genisletme` | `ts-node test/yuzey-genisletme-test.ts` |
| `backend/package.json` | `test:urun-degil` | `ts-node test/urun-degil-test.ts` |
| `backend/package.json` | `test:tam-ad-surgunu` | `ts-node test/tam-ad-surgunu-test.ts` |
| `backend/package.json` | `test:olcu-anahtari` | `ts-node test/olcu-anahtari-cakismasi-test.ts` |
| `backend/package.json` | `test:dn-koprusu` | `ts-node test/dn-koprusu-test.ts` |
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
| `backend/package.json` | `test:kl-kayit` | `ts-node test/kl-kayit-toplami-test.ts` |
| `backend/package.json` | `test:kd12` | `ts-node test/kd12-baslik-satiri-test.ts` |
| `backend/package.json` | `test:kd9` | `ts-node test/kd9-kur-olcutu-test.ts` |
| `backend/package.json` | `test:harita` | `node ../scripts/harita-denetle.mjs` |
| `backend/package.json` | `test:klasor` | `node ../scripts/klasor-denetle.mjs` |
| `backend/package.json` | `test:p2-2` | `ts-node test/p2-2-sheets-indeks-test.ts` |
| `backend/package.json` | `test:kalem59` | `ts-node test/kalem59-oksuz-kutuphane-test.ts` |
| `backend/package.json` | `test:b1` | `ts-node test/b1-kutuphane-cascade-test.ts` |
| `backend/package.json` | `test:d1` | `ts-node test/d1-marka-silme-capraz-tenant-test.ts` |
| `backend/package.json` | `test:a1` | `ts-node test/a1-silme-etkisi-test.ts` |
| `backend/package.json` | `test:firma` | `ts-node test/firma-izolasyon-test.ts` |
| `backend/package.json` | `test:guvenlik` | `ts-node test/guvenlik-uclari-test.ts` |
| `backend/package.json` | `test:imza` | `ts-node test/imza-ekseni-test.ts` |
| `backend/package.json` | `test:oneri` | `ts-node test/oneri-kutusu-cekince-test.ts` |
| `backend/package.json` | `test:s45` | `ts-node test/s45-malzeme-aile-test.ts` |
| `backend/package.json` | `test:aile` | `ts-node test/aile-oncelik-test.ts` |
| `backend/package.json` | `test:aile-uyusmazligi` | `ts-node test/aile-uyusmazligi-test.ts` |
| `backend/package.json` | `test:kb-ad` | `ts-node test/kutuphane-ad-duzenleme-test.ts` |
| `backend/package.json` | `test:isc-sil` | `ts-node test/iscilik-satir-silme-test.ts` |
| `backend/package.json` | `test:kur` | `ts-node test/kur-donmasi-test.ts` |
| `backend/package.json` | `test:alias-yutma` | `ts-node test/alias-kelime-yutma-test.ts` |
| `backend/package.json` | `test:kb-liste` | `ts-node test/kutuphane-liste-test.ts` |
| `backend/package.json` | `test:iliskisel-alan` | `ts-node test/iliskisel-alan-suzgeci-test.ts` |
| `backend/package.json` | `test:kisisel-liste` | `ts-node test/kisisel-liste-izolasyon-test.ts` |
| `backend/package.json` | `test:odeme` | `ts-node test/odeme-onyukleme-test.ts` |
| `backend/package.json` | `test:migration` | `ts-node test/migration-zinciri-test.ts` |
| `backend/package.json` | `test:erisim` | `ts-node test/erisim-kapisi-test.ts` |
| `backend/package.json` | `test:guvenlik2` | `ts-node test/guvenlik-turu-2-test.ts` |
| `backend/package.json` | `test:firma-ekseni` | `ts-node test/firma-ekseni-test.ts` |
| `backend/package.json` | `test:ortam` | `ts-node test/ortam-degiskenleri-test.ts` |
| `backend/package.json` | `test:fiyat-capasi` | `ts-node test/fiyat-capasi-test.ts` |
| `backend/package.json` | `test:iyzico-basligi` | `ts-node test/iyzico-imza-basligi-test.ts` |
| `frontend/package.json` | `test:e2e` | `playwright test` |
| `frontend/package.json` | `test:e2e-golden` | `node test/e2e-golden/run.mjs` |

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
