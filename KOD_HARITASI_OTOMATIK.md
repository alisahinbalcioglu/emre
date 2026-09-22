# KOD HARİTASI — OTOMATİK KATMAN

<!-- URETILMIS DOSYA — ELLE DUZENLENMEZ. Uretici: scripts/harita-uret.mjs -->
<!-- Kapsam tanimi: harita-kapsam-disi.txt -->

Kod dosyasi: 704
Toplam satir: 172238
Uc nokta: 215
test:* scripti: 113

## 1 · Dosyalar ve satir sayilari

| Dosya | Satir |
|---|---|
| `backend/prisma/schema.prisma` | 2012 |
| `backend/scripts/ceviri-gecis-izni.ts` | 476 |
| `backend/scripts/ceviri-suzgec-olcum.ts` | 96 |
| `backend/scripts/derleme-kapisi.js` | 68 |
| `backend/scripts/kisisel-liste-backfill.js` | 107 |
| `backend/scripts/kullanici-hakki-guncelle.ts` | 195 |
| `backend/scripts/mfa-sifirla.ts` | 145 |
| `backend/scripts/paket-aciklama-duzelt.ts` | 172 |
| `backend/scripts/paketleri-kur.ts` | 534 |
| `backend/scripts/surum-yaz.js` | 47 |
| `backend/src/altyapi/auth/abonelik-erisim.ts` | 137 |
| `backend/src/altyapi/auth/auth.controller.ts` | 191 |
| `backend/src/altyapi/auth/auth.module.ts` | 64 |
| `backend/src/altyapi/auth/auth.service.ts` | 492 |
| `backend/src/altyapi/auth/capabilities.helper.ts` | 157 |
| `backend/src/altyapi/auth/decorators/current-user.decorator.ts` | 9 |
| `backend/src/altyapi/auth/decorators/firma-rolu.decorator.ts` | 18 |
| `backend/src/altyapi/auth/decorators/kapali-hesap-izinli.decorator.ts` | 34 |
| `backend/src/altyapi/auth/decorators/koltuk-disi-izinli.decorator.ts` | 21 |
| `backend/src/altyapi/auth/decorators/roles.decorator.ts` | 5 |
| `backend/src/altyapi/auth/dto/eposta-dogrula.dto.ts` | 9 |
| `backend/src/altyapi/auth/dto/hesap-kapat.dto.ts` | 23 |
| `backend/src/altyapi/auth/dto/login.dto.ts` | 10 |
| `backend/src/altyapi/auth/dto/parola-degistir.dto.ts` | 15 |
| `backend/src/altyapi/auth/dto/parola-sifirla.dto.ts` | 17 |
| `backend/src/altyapi/auth/dto/parola-sifirlama-iste.dto.ts` | 15 |
| `backend/src/altyapi/auth/dto/profil-guncelle.dto.ts` | 35 |
| `backend/src/altyapi/auth/dto/register.dto.ts` | 50 |
| `backend/src/altyapi/auth/eposta-dogrulama.servisi.ts` | 149 |
| `backend/src/altyapi/auth/eposta-dogrulama.ts` | 19 |
| `backend/src/altyapi/auth/eposta.ts` | 80 |
| `backend/src/altyapi/auth/guards/eposta-hiz-siniri.guard.ts` | 42 |
| `backend/src/altyapi/auth/guards/firma-rol.guard.ts` | 48 |
| `backend/src/altyapi/auth/guards/jwt-auth.guard.ts` | 99 |
| `backend/src/altyapi/auth/guards/kullanici-hiz-siniri.guard.ts` | 29 |
| `backend/src/altyapi/auth/guards/roles.guard.ts` | 20 |
| `backend/src/altyapi/auth/guards/tier.guard.ts` | 91 |
| `backend/src/altyapi/auth/hesap.servisi.ts` | 732 |
| `backend/src/altyapi/auth/hukuki-surum.ts` | 39 |
| `backend/src/altyapi/auth/jwt-secret.ts` | 37 |
| `backend/src/altyapi/auth/kapali-hesap.ts` | 233 |
| `backend/src/altyapi/auth/kapatma-epostalari.ts` | 72 |
| `backend/src/altyapi/auth/kimlik-sifreleme.ts` | 126 |
| `backend/src/altyapi/auth/kimlik.ts` | 35 |
| `backend/src/altyapi/auth/kurumsal/dto/kurumsal.dto.ts` | 144 |
| `backend/src/altyapi/auth/kurumsal/kurumsal-epostalari.ts` | 73 |
| `backend/src/altyapi/auth/kurumsal/kurumsal-giris.controller.ts` | 129 |
| `backend/src/altyapi/auth/kurumsal/kurumsal-giris.servisi.ts` | 1262 |
| `backend/src/altyapi/auth/kurumsal/kurumsal-zorunluluk.ts` | 121 |
| `backend/src/altyapi/auth/kurumsal/oidc-istemci.ts` | 414 |
| `backend/src/altyapi/auth/kurumsal/pkce.ts` | 36 |
| `backend/src/altyapi/auth/kurumsal/saglayici-kurallari.ts` | 258 |
| `backend/src/altyapi/auth/mfa/dto/mfa.dto.ts` | 88 |
| `backend/src/altyapi/auth/mfa/kurtarma-kodu.ts` | 67 |
| `backend/src/altyapi/auth/mfa/meydan-okuma.ts` | 107 |
| `backend/src/altyapi/auth/mfa/mfa-epostalari.ts` | 111 |
| `backend/src/altyapi/auth/mfa/mfa-karari.ts` | 152 |
| `backend/src/altyapi/auth/mfa/mfa.controller.ts` | 120 |
| `backend/src/altyapi/auth/mfa/mfa.servisi.ts` | 663 |
| `backend/src/altyapi/auth/mfa/totp.ts` | 177 |
| `backend/src/altyapi/auth/oturum.servisi.ts` | 288 |
| `backend/src/altyapi/auth/parola-kurali.ts` | 57 |
| `backend/src/altyapi/auth/parola.servisi.ts` | 311 |
| `backend/src/altyapi/auth/seviye.ts` | 154 |
| `backend/src/altyapi/auth/strategies/jwt.strategy.ts` | 227 |
| `backend/src/altyapi/auth/token-imza.ts` | 47 |
| `backend/src/altyapi/auth/token-ozet.ts` | 61 |
| `backend/src/altyapi/auth/uygulama-url.ts` | 43 |
| `backend/src/altyapi/db/prisma.module.ts` | 10 |
| `backend/src/altyapi/db/prisma.service.ts` | 14 |
| `backend/src/altyapi/http/govde-siniri.ts` | 35 |
| `backend/src/altyapi/http/guvenlik-basliklari.ts` | 51 |
| `backend/src/app.module.ts` | 72 |
| `backend/src/health.controller.ts` | 33 |
| `backend/src/main.ts` | 96 |
| `backend/src/modules/dwg-engine/dwg-engine.controller.ts` | 217 |
| `backend/src/modules/dwg-engine/dwg-engine.module.ts` | 14 |
| `backend/src/modules/dwg-engine/dwg-engine.service.ts` | 420 |
| `backend/src/modules/dwg-engine/dwg-sahiplik.servisi.ts` | 105 |
| `backend/src/modules/dwg-engine/python/converter.py` | 598 |
| `backend/src/modules/dwg-engine/python/deploy-to-cloudrun.sh` | 71 |
| `backend/src/modules/dwg-engine/python/geometry.py` | 757 |
| `backend/src/modules/dwg-engine/python/graph.py` | 356 |
| `backend/src/modules/dwg-engine/python/main.py` | 1624 |
| `backend/src/modules/dwg-engine/python/models.py` | 99 |
| `backend/src/modules/dwg-engine/python/parse_worker.py` | 83 |
| `backend/src/modules/dwg-engine/python/pipe_segments.py` | 1875 |
| `backend/src/modules/dwg-engine/python/tests/__init__.py` | 1 |
| `backend/src/modules/dwg-engine/python/tests/test_block_to_line_split.py` | 104 |
| `backend/src/modules/dwg-engine/python/tests/test_detector_version_kapisi.py` | 144 |
| `backend/src/modules/dwg-engine/python/tests/test_pipe_segments.py` | 85 |
| `backend/src/modules/dwg-engine/python/tests/test_scale_normalization.py` | 127 |
| `backend/src/modules/dwg-engine/python/tests/test_split_mode.py` | 149 |
| `backend/src/modules/dwg-engine/python/tests/test_symbol_cluster_split.py` | 499 |
| `backend/src/modules/dwg-engine/python/tests/test_tolerance_robustness.py` | 118 |
| `backend/src/modules/dwg-engine/python/tests/test_unit_detect.py` | 597 |
| `backend/src/modules/dwg-engine/python/topology.py` | 268 |
| `backend/src/modules/dwg-engine/python/unit_detect.py` | 766 |
| `backend/src/modules/dwg-engine/python/upload_worker.py` | 107 |
| `backend/src/modules/dwg-engine/scale-param.test.ts` | 59 |
| `backend/src/modules/dwg-engine/scale-param.ts` | 30 |
| `backend/src/ozellik/cikti/quote-formats/format-engine.ts` | 602 |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | 100 |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.module.ts` | 13 |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.service.ts` | 163 |
| `backend/src/ozellik/cikti/utils/antet.ts` | 232 |
| `backend/src/ozellik/cikti/utils/xlsx-to-pdf.ts` | 46 |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.controller.ts` | 60 |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.module.ts` | 15 |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.service.ts` | 94 |
| `backend/src/ozellik/eslestirme/matching/ad-cins-sozlugu.ts` | 251 |
| `backend/src/ozellik/eslestirme/matching/ad-resolver.ts` | 122 |
| `backend/src/ozellik/eslestirme/matching/conversion.ts` | 448 |
| `backend/src/ozellik/eslestirme/matching/index/line-parser.ts` | 231 |
| `backend/src/ozellik/eslestirme/matching/index/product-index.ts` | 665 |
| `backend/src/ozellik/eslestirme/matching/index/query-engine.ts` | 1561 |
| `backend/src/ozellik/eslestirme/matching/index/types.ts` | 275 |
| `backend/src/ozellik/eslestirme/matching/index/vocab.ts` | 37 |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | 104 |
| `backend/src/ozellik/eslestirme/matching/matching.module.ts` | 16 |
| `backend/src/ozellik/eslestirme/matching/matching.service.ts` | 1213 |
| `backend/src/ozellik/eslestirme/matching/normalizer.ts` | 712 |
| `backend/src/ozellik/eslestirme/matching/shared-tag-matcher.ts` | 165 |
| `backend/src/ozellik/eslestirme/matching/tag-generator.ts` | 161 |
| `backend/src/ozellik/eslestirme/matching/terminology.service.ts` | 327 |
| `backend/src/ozellik/eslestirme/matching/types.ts` | 152 |
| `backend/src/ozellik/eslestirme/utils/build-material-context.ts` | 126 |
| `backend/src/ozellik/eslestirme/utils/etiket-display.ts` | 70 |
| `backend/src/ozellik/firma/davet-kabul.controller.ts` | 38 |
| `backend/src/ozellik/firma/dto/davet-bilgi.dto.ts` | 8 |
| `backend/src/ozellik/firma/dto/davet-kabul.dto.ts` | 28 |
| `backend/src/ozellik/firma/dto/davet-olustur.dto.ts` | 12 |
| `backend/src/ozellik/firma/dto/firma-guncelle.dto.ts` | 93 |
| `backend/src/ozellik/firma/dto/firma-guvenlik.dto.ts` | 14 |
| `backend/src/ozellik/firma/dto/rol-degistir.dto.ts` | 7 |
| `backend/src/ozellik/firma/dto/uye-cikar.dto.ts` | 12 |
| `backend/src/ozellik/firma/firma-kurumsal-giris.controller.ts` | 85 |
| `backend/src/ozellik/firma/firma-maskele.ts` | 57 |
| `backend/src/ozellik/firma/firma-olay-tipleri.ts` | 56 |
| `backend/src/ozellik/firma/firma.controller.ts` | 107 |
| `backend/src/ozellik/firma/firma.module.ts` | 39 |
| `backend/src/ozellik/firma/firma.servisi.ts` | 292 |
| `backend/src/ozellik/firma/kurumsal-giris-ayar.servisi.ts` | 387 |
| `backend/src/ozellik/firma/uyelik-kurallari.ts` | 372 |
| `backend/src/ozellik/firma/uyelik.controller.ts` | 90 |
| `backend/src/ozellik/firma/uyelik.servisi.ts` | 842 |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.controller.ts` | 15 |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.module.ts` | 11 |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.service.ts` | 272 |
| `backend/src/ozellik/fiyat/matching/index/outcome-mapper.ts` | 371 |
| `backend/src/ozellik/fiyat/matching/pricing.ts` | 66 |
| `backend/src/ozellik/giris/ai/ai-maliyet.ts` | 126 |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | 128 |
| `backend/src/ozellik/giris/ai/ai.module.ts` | 19 |
| `backend/src/ozellik/giris/ai/ai.service.ts` | 876 |
| `backend/src/ozellik/giris/ai/ceviri-duzeltme.controller.ts` | 73 |
| `backend/src/ozellik/giris/ai/ceviri-duzeltme.servisi.ts` | 271 |
| `backend/src/ozellik/giris/ai/ceviri-katmani.ts` | 124 |
| `backend/src/ozellik/giris/ai/ceviri-kurali.ts` | 410 |
| `backend/src/ozellik/giris/ai/ceviri.service.ts` | 682 |
| `backend/src/ozellik/giris/ai/dto/ceviri-duzeltme.dto.ts` | 44 |
| `backend/src/ozellik/giris/ai/dto/ceviri.dto.ts` | 44 |
| `backend/src/ozellik/giris/excel-engine/excel-engine.controller.ts` | 24 |
| `backend/src/ozellik/giris/excel-engine/excel-engine.module.ts` | 14 |
| `backend/src/ozellik/giris/excel-engine/excel-engine.service.ts` | 195 |
| `backend/src/ozellik/giris/excel-grid/excel-grid.controller.ts` | 26 |
| `backend/src/ozellik/giris/excel-grid/excel-grid.module.ts` | 14 |
| `backend/src/ozellik/giris/excel-grid/excel-grid.service.ts` | 1120 |
| `backend/src/ozellik/giris/excel-grid/sheet-discipline.ts` | 61 |
| `backend/src/ozellik/giris/excel-grid/standart-sema.ts` | 361 |
| `backend/src/ozellik/imha/imha-listesi.ts` | 626 |
| `backend/src/ozellik/imha/imha.job.ts` | 149 |
| `backend/src/ozellik/imha/imha.module.ts` | 25 |
| `backend/src/ozellik/imha/imha.servisi.ts` | 505 |
| `backend/src/ozellik/imha/saklama-sureleri.ts` | 75 |
| `backend/src/ozellik/kutuphane/admin/admin-kurumsal-giris.controller.ts` | 136 |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | 288 |
| `backend/src/ozellik/kutuphane/admin/admin.module.ts` | 22 |
| `backend/src/ozellik/kutuphane/admin/admin.service.ts` | 2228 |
| `backend/src/ozellik/kutuphane/admin/dto/firma-rol.dto.ts` | 14 |
| `backend/src/ozellik/kutuphane/admin/dto/kullanicilar-sorgusu.dto.ts` | 48 |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | 76 |
| `backend/src/ozellik/kutuphane/brands/brands.module.ts` | 13 |
| `backend/src/ozellik/kutuphane/brands/brands.service.ts` | 273 |
| `backend/src/ozellik/kutuphane/brands/dto/create-brand.dto.ts` | 17 |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | 208 |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.module.ts` | 16 |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.service.ts` | 965 |
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | 94 |
| `backend/src/ozellik/kutuphane/labor/labor.module.ts` | 16 |
| `backend/src/ozellik/kutuphane/labor/labor.service.ts` | 85 |
| `backend/src/ozellik/kutuphane/library/dto/add-library-rows.dto.ts` | 22 |
| `backend/src/ozellik/kutuphane/library/dto/bulk-discount.dto.ts` | 12 |
| `backend/src/ozellik/kutuphane/library/dto/bulk-update-items.dto.ts` | 13 |
| `backend/src/ozellik/kutuphane/library/dto/create-library-item.dto.ts` | 34 |
| `backend/src/ozellik/kutuphane/library/dto/create-manual-brand.dto.ts` | 51 |
| `backend/src/ozellik/kutuphane/library/dto/import-price-list.dto.ts` | 10 |
| `backend/src/ozellik/kutuphane/library/dto/update-library-item.dto.ts` | 27 |
| `backend/src/ozellik/kutuphane/library/library-sheet-builder.ts` | 158 |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | 155 |
| `backend/src/ozellik/kutuphane/library/library.module.ts` | 14 |
| `backend/src/ozellik/kutuphane/library/library.service.ts` | 931 |
| `backend/src/ozellik/kutuphane/materials/dto/create-material-price.dto.ts` | 14 |
| `backend/src/ozellik/kutuphane/materials/dto/create-material.dto.ts` | 8 |
| `backend/src/ozellik/kutuphane/materials/materials.controller.ts` | 59 |
| `backend/src/ozellik/kutuphane/materials/materials.module.ts` | 13 |
| `backend/src/ozellik/kutuphane/materials/materials.service.ts` | 67 |
| `backend/src/ozellik/kutuphane/silme-etkisi.ts` | 74 |
| `backend/src/ozellik/kutuphane/utils/import-fidelity.ts` | 468 |
| `backend/src/ozellik/odeme/abonelik/abonelik.controller.ts` | 148 |
| `backend/src/ozellik/odeme/abonelik/abonelik.servisi.ts` | 626 |
| `backend/src/ozellik/odeme/abonelik/ceviri-kota.servisi.ts` | 606 |
| `backend/src/ozellik/odeme/abonelik/ceviri-kotasi.ts` | 393 |
| `backend/src/ozellik/odeme/abonelik/deneme-hakki.servisi.ts` | 84 |
| `backend/src/ozellik/odeme/abonelik/deneme-hakki.ts` | 151 |
| `backend/src/ozellik/odeme/abonelik/dto/abonelik-basla.dto.ts` | 66 |
| `backend/src/ozellik/odeme/abonelik/erisim.guard.ts` | 90 |
| `backend/src/ozellik/odeme/abonelik/erisim.servisi.ts` | 344 |
| `backend/src/ozellik/odeme/abonelik/fiyat.controller.ts` | 53 |
| `backend/src/ozellik/odeme/abonelik/iyzico-donus.controller.ts` | 80 |
| `backend/src/ozellik/odeme/abonelik/mutabakat.job.ts` | 170 |
| `backend/src/ozellik/odeme/abonelik/satinalma.servisi.ts` | 1351 |
| `backend/src/ozellik/odeme/dunning/dunning.metinleri.ts` | 165 |
| `backend/src/ozellik/odeme/dunning/dunning.servisi.ts` | 314 |
| `backend/src/ozellik/odeme/eposta/eposta.servisi.ts` | 294 |
| `backend/src/ozellik/odeme/fatura/fatura.servisi.ts` | 446 |
| `backend/src/ozellik/odeme/fatura/muhasebe.adaptor.ts` | 304 |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | 96 |
| `backend/src/ozellik/odeme/havale/havale.servisi.ts` | 274 |
| `backend/src/ozellik/odeme/iyzico/imza.ts` | 206 |
| `backend/src/ozellik/odeme/iyzico/iyzico-hata.filter.ts` | 108 |
| `backend/src/ozellik/odeme/iyzico/iyzico.client.ts` | 435 |
| `backend/src/ozellik/odeme/odeme.module.ts` | 115 |
| `backend/src/ozellik/odeme/webhook/webhook.controller.ts` | 160 |
| `backend/src/ozellik/odeme/webhook/webhook.isleyici.ts` | 132 |
| `backend/src/ozellik/odeme/yapilandirma.ts` | 78 |
| `backend/src/ozellik/panel/panel.controller.ts` | 29 |
| `backend/src/ozellik/panel/panel.module.ts` | 11 |
| `backend/src/ozellik/panel/panel.servisi.ts` | 80 |
| `backend/src/ozellik/teklif/quotes/cikti-dil.ts` | 96 |
| `backend/src/ozellik/teklif/quotes/dto/create-quote.dto.ts` | 112 |
| `backend/src/ozellik/teklif/quotes/dto/teklifler-sorgusu.dto.ts` | 48 |
| `backend/src/ozellik/teklif/quotes/export-engine.ts` | 417 |
| `backend/src/ozellik/teklif/quotes/hazirlayan.ts` | 35 |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | 203 |
| `backend/src/ozellik/teklif/quotes/quotes.module.ts` | 16 |
| `backend/src/ozellik/teklif/quotes/quotes.service.ts` | 825 |
| `backend/src/ozellik/teklif/quotes/standart-cikti.ts` | 397 |
| `backend/src/surum.ts` | 30 |
| `backend/test/a1-silme-etkisi-test.ts` | 330 |
| `backend/test/abonelik-erisim-test.ts` | 352 |
| `backend/test/abonelik-olcum-sorgu-test.ts` | 574 |
| `backend/test/admin-import-test.ts` | 325 |
| `backend/test/aile-oncelik-simulasyon.ts` | 292 |
| `backend/test/aile-oncelik-test.ts` | 182 |
| `backend/test/aile-uyusmazligi-test.ts` | 357 |
| `backend/test/alias-kelime-yutma-test.ts` | 181 |
| `backend/test/antet-test.ts` | 346 |
| `backend/test/audit-canli-kosum.ts` | 317 |
| `backend/test/audit-real-excel.ts` | 82 |
| `backend/test/b1-kutuphane-cascade-test.ts` | 185 |
| `backend/test/build-sha-kablolama-test.ts` | 140 |
| `backend/test/cap-cevrilemedi-test.ts` | 254 |
| `backend/test/ceviri-duzeltme-test.ts` | 919 |
| `backend/test/ceviri-gecis-test.ts` | 292 |
| `backend/test/ceviri-gorunum-cikti-test.ts` | 765 |
| `backend/test/ceviri-karar-test.ts` | 188 |
| `backend/test/ceviri-kota-uygulama-test.ts` | 1192 |
| `backend/test/ceviri-kotasi-test.ts` | 301 |
| `backend/test/ceviri-sahte-db.ts` | 273 |
| `backend/test/cikti-dil-test.ts` | 91 |
| `backend/test/cikti-test-yardimci.ts` | 223 |
| `backend/test/contract-test.ts` | 364 |
| `backend/test/conversion-test.ts` | 261 |
| `backend/test/d1-marka-silme-capraz-tenant-test.ts` | 235 |
| `backend/test/deneme-hakki-test.ts` | 1080 |
| `backend/test/deploy-olcum-test.ts` | 154 |
| `backend/test/dn-koprusu-test.ts` | 342 |
| `backend/test/erisim-kapisi-test.ts` | 559 |
| `backend/test/erken-kurtarma-test.ts` | 402 |
| `backend/test/excel-grid-test.ts` | 256 |
| `backend/test/export-format-test.ts` | 427 |
| `backend/test/export-live-sim-test.ts` | 417 |
| `backend/test/fallback-ad-kilidi-test.ts` | 185 |
| `backend/test/fatura-kimligi-kapisi-test.ts` | 896 |
| `backend/test/faz0-gs7-probe.ts` | 74 |
| `backend/test/faz2-kullanici-yonetimi-test.ts` | 618 |
| `backend/test/faz3-eposta-parola-test.ts` | 876 |
| `backend/test/faz4-firma-teklif-test.ts` | 263 |
| `backend/test/faz5-kvkk-hukuki-test.ts` | 486 |
| `backend/test/faz7-ekip-test.ts` | 1988 |
| `backend/test/faz7-kurumsal-test.ts` | 1934 |
| `backend/test/faz7-mfa-test.ts` | 1540 |
| `backend/test/faz7-oidc-test.ts` | 653 |
| `backend/test/faz7-totp-test.ts` | 501 |
| `backend/test/faz7-yetki-test.ts` | 677 |
| `backend/test/firma-ekseni-test.ts` | 287 |
| `backend/test/firma-izolasyon-test.ts` | 317 |
| `backend/test/fixture-anonim.ts` | 330 |
| `backend/test/fixture-dogrula.ts` | 224 |
| `backend/test/fiyat-capasi-test.ts` | 185 |
| `backend/test/gercek-dosya-test.ts` | 263 |
| `backend/test/geri-donus-test.ts` | 688 |
| `backend/test/gs6b-teshis.ts` | 85 |
| `backend/test/guvenlik-basliklari-test.ts` | 136 |
| `backend/test/guvenlik-paket1-test.ts` | 509 |
| `backend/test/guvenlik-turu-2-test.ts` | 376 |
| `backend/test/guvenlik-uclari-test.ts` | 459 |
| `backend/test/hesap-dogrulugu-test.ts` | 844 |
| `backend/test/iliskisel-alan-suzgeci-test.ts` | 171 |
| `backend/test/imha-test.ts` | 1165 |
| `backend/test/imza-ekseni-test.ts` | 325 |
| `backend/test/index-engine-test.ts` | 1774 |
| `backend/test/iscilik-satir-silme-test.ts` | 127 |
| `backend/test/iyzico-imza-basligi-test.ts` | 235 |
| `backend/test/kalem59-oksuz-kutuphane-test.ts` | 131 |
| `backend/test/kaucuk-izolasyon-test.ts` | 244 |
| `backend/test/kd11-toplam-yollari-test.ts` | 172 |
| `backend/test/kd12-baslik-satiri-test.ts` | 226 |
| `backend/test/kd9-kur-olcutu-test.ts` | 252 |
| `backend/test/kisisel-liste-izolasyon-test.ts` | 347 |
| `backend/test/kl-kayit-toplami-test.ts` | 148 |
| `backend/test/kl-liste-ekleme-test.ts` | 171 |
| `backend/test/kur-donmasi-test.ts` | 451 |
| `backend/test/kurtarma-mesaj-test.ts` | 367 |
| `backend/test/kutuphane-ad-duzenleme-test.ts` | 152 |
| `backend/test/kutuphane-fiyat-donmasi-test.ts` | 248 |
| `backend/test/kutuphane-liste-test.ts` | 231 |
| `backend/test/labor-matching-test.ts` | 242 |
| `backend/test/labor-sheet-test.ts` | 110 |
| `backend/test/library-transfer-test.ts` | 96 |
| `backend/test/manifest-kapisi.ts` | 79 |
| `backend/test/matching-regression.ts` | 281 |
| `backend/test/matching-unit-test.ts` | 713 |
| `backend/test/migration-zinciri-test.ts` | 753 |
| `backend/test/odeme-imha-test.ts` | 850 |
| `backend/test/odeme-onyukleme-test.ts` | 419 |
| `backend/test/olcu-anahtari-cakismasi-test.ts` | 449 |
| `backend/test/onceden-fiyatli-test.ts` | 163 |
| `backend/test/oneri-kutusu-cekince-test.ts` | 360 |
| `backend/test/ortam-degiskenleri-test.ts` | 254 |
| `backend/test/p2-2-sheets-indeks-test.ts` | 169 |
| `backend/test/paket-aciklama-duzelt-test.ts` | 183 |
| `backend/test/panel-ozet-test.ts` | 493 |
| `backend/test/pano18-para-birimi-test.ts` | 172 |
| `backend/test/para-birimi-yazim-test.ts` | 355 |
| `backend/test/parola-kapisi-test.ts` | 531 |
| `backend/test/perf-profil.ts` | 73 |
| `backend/test/pk3-kimlik-haritasi-test.ts` | 159 |
| `backend/test/pk3-repo-kapsama-test.ts` | 79 |
| `backend/test/pk9-sessiz-indeks-test.ts` | 97 |
| `backend/test/product-index-test.ts` | 479 |
| `backend/test/regression-all.ts` | 723 |
| `backend/test/s45-malzeme-aile-test.ts` | 440 |
| `backend/test/s45-olcum.ts` | 188 |
| `backend/test/satinalma-yolu-test.ts` | 882 |
| `backend/test/sir-dondur-kapsam-test.ts` | 188 |
| `backend/test/sozluk-golgeleme-olcum.ts` | 125 |
| `backend/test/spec-regression-test.ts` | 447 |
| `backend/test/standart-cikti-test.ts` | 339 |
| `backend/test/standart-sema-test.ts` | 444 |
| `backend/test/sunucu-urunleri-test.ts` | 328 |
| `backend/test/tam-ad-surgunu-test.ts` | 190 |
| `backend/test/tam-zincir.ts` | 104 |
| `backend/test/uc-kapisi-davranis-test.ts` | 343 |
| `backend/test/uc-kapisi.ts` | 494 |
| `backend/test/urun-degil-test.ts` | 89 |
| `backend/test/varyant-surukleme-test.ts` | 189 |
| `backend/test/yardimci/sahte-oidc-saglayici.ts` | 244 |
| `backend/test/yardimci/uc-envanteri.ts` | 162 |
| `backend/test/yuzey-genisletme-test.ts` | 193 |
| `frontend/app/(protected)/abonelik/donus/page.tsx` | 138 |
| `frontend/app/(protected)/abonelik/page.tsx` | 606 |
| `frontend/app/(protected)/dashboard/page.tsx` | 241 |
| `frontend/app/(protected)/dwg-workspace/page.tsx` | 112 |
| `frontend/app/(protected)/firma/ekip/kurumsal-giris/page.tsx` | 418 |
| `frontend/app/(protected)/firma/ekip/page.tsx` | 446 |
| `frontend/app/(protected)/koltuk-durduruldu/page.tsx` | 129 |
| `frontend/app/(protected)/labor-firms/[firmaId]/page.tsx` | 488 |
| `frontend/app/(protected)/labor-firms/page.tsx` | 287 |
| `frontend/app/(protected)/labor/page.tsx` | 293 |
| `frontend/app/(protected)/layout.tsx` | 243 |
| `frontend/app/(protected)/library/brand/[brandId]/page.tsx` | 517 |
| `frontend/app/(protected)/library/electrical-brands/page.tsx` | 411 |
| `frontend/app/(protected)/library/mechanical-brands/page.tsx` | 316 |
| `frontend/app/(protected)/library/page.tsx` | 636 |
| `frontend/app/(protected)/materials/[brandId]/page.tsx` | 645 |
| `frontend/app/(protected)/materials/electrical/page.tsx` | 171 |
| `frontend/app/(protected)/materials/mechanical/page.tsx` | 171 |
| `frontend/app/(protected)/materials/page.tsx` | 23 |
| `frontend/app/(protected)/profile/page.tsx` | 1185 |
| `frontend/app/(protected)/quote-formats/page.tsx` | 396 |
| `frontend/app/(protected)/quotes/[id]/page.tsx` | 760 |
| `frontend/app/(protected)/quotes/new/error.tsx` | 13 |
| `frontend/app/(protected)/quotes/new/page.tsx` | 2303 |
| `frontend/app/(protected)/quotes/page.tsx` | 312 |
| `frontend/app/admin/brands/page.tsx` | 903 |
| `frontend/app/admin/denetim/page.tsx` | 275 |
| `frontend/app/admin/layout.tsx` | 94 |
| `frontend/app/admin/page.tsx` | 16 |
| `frontend/app/admin/stats/page.tsx` | 528 |
| `frontend/app/admin/users/page.tsx` | 642 |
| `frontend/app/cerez-politikasi/page.tsx` | 13 |
| `frontend/app/davet-kabul/page.tsx` | 261 |
| `frontend/app/dev/grid-test/page.tsx` | 227 |
| `frontend/app/fiyatlar/page.tsx` | 174 |
| `frontend/app/forgot-password/page.tsx` | 92 |
| `frontend/app/gizlilik/page.tsx` | 13 |
| `frontend/app/hakkimizda/page.tsx` | 47 |
| `frontend/app/iletisim/page.tsx` | 106 |
| `frontend/app/kullanim-kosullari/page.tsx` | 13 |
| `frontend/app/layout.tsx` | 44 |
| `frontend/app/login/page.tsx` | 251 |
| `frontend/app/mesafeli-satis/page.tsx` | 16 |
| `frontend/app/page.tsx` | 483 |
| `frontend/app/register/page.tsx` | 244 |
| `frontend/app/reset-password/page.tsx` | 128 |
| `frontend/app/robots.ts` | 7 |
| `frontend/app/sitemap.ts` | 13 |
| `frontend/app/sso/tamam/page.tsx` | 223 |
| `frontend/app/verify-email/page.tsx` | 94 |
| `frontend/components/dwg-diameter-engine/DiameterLegendPanel.tsx` | 151 |
| `frontend/components/dwg-diameter-engine/index.ts` | 16 |
| `frontend/components/dwg-diameter-engine/types.ts` | 79 |
| `frontend/components/dwg-diameter-engine/useLayerCalc.ts` | 152 |
| `frontend/components/dwg-diameter-engine/useOriginalColorState.ts` | 36 |
| `frontend/components/dwg-metraj/DiameterEditPopup.tsx` | 121 |
| `frontend/components/dwg-metraj/DwgUploader.tsx` | 643 |
| `frontend/components/dwg-metraj/MetrajEditor.tsx` | 484 |
| `frontend/components/dwg-metraj/constants.ts` | 28 |
| `frontend/components/dwg-metraj/diameter-colors.ts` | 169 |
| `frontend/components/dwg-metraj/index.ts` | 12 |
| `frontend/components/dwg-metraj/types.ts` | 59 |
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
| `frontend/lib/merge-multisheet.test.ts` | 143 |
| `frontend/lib/metraj-excel.ts` | 98 |
| `frontend/lib/ondalik-kurali.test.ts` | 70 |
| `frontend/lib/parse-material-text.test.ts` | 86 |
| `frontend/lib/popup-secici-sozlesmesi.test.ts` | 62 |
| `frontend/lib/pricing.test.ts` | 95 |
| `frontend/lib/sayfa-toplamlari.test.ts` | 234 |
| `frontend/lib/sayi-ayristirma.test.ts` | 80 |
| `frontend/lib/silme-etkisi-getir.ts` | 26 |
| `frontend/lib/silme-onay-metni.test.ts` | 194 |
| `frontend/lib/silme-onay-metni.ts` | 168 |
| `frontend/next.config.js` | 33 |
| `frontend/ortak/contexts/CapabilitiesContext.tsx` | 182 |
| `frontend/ortak/hooks/onay-secenekleri.test.ts` | 97 |
| `frontend/ortak/hooks/use-confirm.ts` | 158 |
| `frontend/ortak/hooks/use-toast.ts` | 119 |
| `frontend/ortak/kabuk/components/dashboard/QuickAccess.tsx` | 49 |
| `frontend/ortak/kabuk/components/dashboard/QuickStart.tsx` | 239 |
| `frontend/ortak/kabuk/components/dashboard/dosya-turu.test.ts` | 47 |
| `frontend/ortak/kabuk/components/dashboard/dosya-turu.ts` | 24 |
| `frontend/ortak/kabuk/components/landing/GirisliyseYonlendir.tsx` | 31 |
| `frontend/ortak/kabuk/components/landing/NasilCalisir.tsx` | 692 |
| `frontend/ortak/kabuk/components/landing/TelefonMenusu.tsx` | 36 |
| `frontend/ortak/kabuk/components/landing/nasil-calisir-yukleme.test.ts` | 206 |
| `frontend/ortak/kabuk/components/landing/telefon-menusu.test.ts` | 232 |
| `frontend/ortak/kabuk/components/layout/Altbilgi.tsx` | 77 |
| `frontend/ortak/kabuk/components/layout/Breadcrumb.tsx` | 81 |
| `frontend/ortak/kabuk/components/layout/DepolamaSeridi.tsx` | 82 |
| `frontend/ortak/kabuk/components/layout/EpostaDogrulamaSeridi.tsx` | 83 |
| `frontend/ortak/kabuk/components/layout/KapaliHesapSeridi.tsx` | 113 |
| `frontend/ortak/kabuk/components/layout/Sidebar.tsx` | 204 |
| `frontend/ortak/kabuk/components/layout/kapali-durum.ts` | 48 |
| `frontend/ortak/kabuk/components/layout/kirinti-etiketi.ts` | 84 |
| `frontend/ortak/lib/api-401-kapsami.test.ts` | 676 |
| `frontend/ortak/lib/api.ts` | 270 |
| `frontend/ortak/lib/kimlik-hata-metinleri.ts` | 149 |
| `frontend/ortak/lib/oturum.test.ts` | 170 |
| `frontend/ortak/lib/oturum.ts` | 113 |
| `frontend/ortak/lib/parola-kurali.ts` | 23 |
| `frontend/ortak/lib/utils.ts` | 16 |
| `frontend/ortak/seo/arama-paylasim.test.ts` | 238 |
| `frontend/ortak/seo/arama-paylasim.ts` | 138 |
| `frontend/ortak/types/index.ts` | 64 |
| `frontend/ortak/types/quotes.ts` | 62 |
| `frontend/ortak/ui/badge.tsx` | 35 |
| `frontend/ortak/ui/button.tsx` | 50 |
| `frontend/ortak/ui/card.tsx` | 56 |
| `frontend/ortak/ui/confirm-dialog.tsx` | 130 |
| `frontend/ortak/ui/dialog.tsx` | 94 |
| `frontend/ortak/ui/geri-butonu.tsx` | 75 |
| `frontend/ortak/ui/input.tsx` | 24 |
| `frontend/ortak/ui/kimlik-kabugu.tsx` | 74 |
| `frontend/ortak/ui/label.tsx` | 19 |
| `frontend/ortak/ui/parola-alani.tsx` | 62 |
| `frontend/ortak/ui/select.tsx` | 143 |
| `frontend/ortak/ui/table.tsx` | 77 |
| `frontend/ortak/ui/toast.tsx` | 115 |
| `frontend/ortak/ui/toaster.tsx` | 34 |
| `frontend/ozellik/cikti/export-download.test.ts` | 74 |
| `frontend/ozellik/cikti/export-download.ts` | 95 |
| `frontend/ozellik/cikti/indirme-hatasi.ts` | 49 |
| `frontend/ozellik/firma/ekip/ekip-ekranlari.test.ts` | 227 |
| `frontend/ozellik/firma/ekip/kisi-metinleri.test.ts` | 109 |
| `frontend/ozellik/firma/ekip/kisi-metinleri.ts` | 76 |
| `frontend/ozellik/firma/ekip/koltuk-metinleri.ts` | 43 |
| `frontend/ozellik/firma/kurumsal-giris/kurumsal-giris-metinleri.ts` | 67 |
| `frontend/ozellik/fiyat/fitting-hesap.test.ts` | 354 |
| `frontend/ozellik/fiyat/gosterim-dili.test.ts` | 301 |
| `frontend/ozellik/fiyat/hesap-sinirlari.test.ts` | 242 |
| `frontend/ozellik/fiyat/ikiz-suzgec-kapilari.test.ts` | 109 |
| `frontend/ozellik/fiyat/kar-tek-suzgec.test.ts` | 189 |
| `frontend/ozellik/fiyat/kur-geri-dusus.test.ts` | 97 |
| `frontend/ozellik/fiyat/para-gosterim.ts` | 44 |
| `frontend/ozellik/fiyat/para-sutun-genisligi.ts` | 243 |
| `frontend/ozellik/fiyat/pricing.ts` | 698 |
| `frontend/ozellik/fiyat/sayi-alani.ts` | 385 |
| `frontend/ozellik/fiyat/sayi-kurali.test.ts` | 289 |
| `frontend/ozellik/fiyat/sayi-oku.test.ts` | 72 |
| `frontend/ozellik/fiyat/sayi-tek-suzgec.test.ts` | 172 |
| `frontend/ozellik/fiyat/sayi-yollari.test.ts` | 362 |
| `frontend/ozellik/fiyat/use-currency.ts` | 87 |
| `frontend/ozellik/giris/kaynak-kolon.ts` | 34 |
| `frontend/ozellik/hukuki/HukukiSayfa.tsx` | 110 |
| `frontend/ozellik/hukuki/metinler.ts` | 966 |
| `frontend/ozellik/hukuki/satici-metin.test.ts` | 447 |
| `frontend/ozellik/kimlik/DogrulamaBekleniyorEkrani.tsx` | 137 |
| `frontend/ozellik/kimlik/GirisDaliEkrani.tsx` | 53 |
| `frontend/ozellik/kimlik/IkiAdimliGirisKarti.tsx` | 328 |
| `frontend/ozellik/kimlik/KurtarmaKodlariEkrani.tsx` | 105 |
| `frontend/ozellik/kimlik/KurulumAnahtari.tsx` | 99 |
| `frontend/ozellik/kimlik/MfaKodAdimi.tsx` | 132 |
| `frontend/ozellik/kimlik/SirketHesabiKarti.tsx` | 154 |
| `frontend/ozellik/kimlik/ZorunluKurulumSihirbazi.tsx` | 166 |
| `frontend/ozellik/kimlik/dogrulama-bekleniyor.test.ts` | 178 |
| `frontend/ozellik/kimlik/giris-dali.test.ts` | 268 |
| `frontend/ozellik/kimlik/kapali-hesap-akisi.test.ts` | 253 |
| `frontend/ozellik/kimlik/kapatma-metinleri.test.ts` | 300 |
| `frontend/ozellik/kimlik/kapatma-metinleri.ts` | 190 |
| `frontend/ozellik/kimlik/kapatma-onizleme-getir.ts` | 47 |
| `frontend/ozellik/kimlik/kurumsal-baslat.ts` | 114 |
| `frontend/ozellik/kimlik/kurumsal-giris.test.ts` | 336 |
| `frontend/ozellik/kimlik/verileri-indir.test.ts` | 137 |
| `frontend/ozellik/kimlik/verileri-indir.ts` | 99 |
| `frontend/ozellik/kurumsal/KurumsalSayfa.tsx` | 60 |
| `frontend/ozellik/kurumsal/kurumsal-sayfalar.test.ts` | 296 |
| `frontend/ozellik/kurumsal/sayfalar.ts` | 112 |
| `frontend/ozellik/kutuphane/admin-stats.ts` | 202 |
| `frontend/ozellik/kutuphane/admin/AdminSidebar.tsx` | 118 |
| `frontend/ozellik/kutuphane/ai-butce.test.ts` | 115 |
| `frontend/ozellik/kutuphane/ai-butce.ts` | 91 |
| `frontend/ozellik/kutuphane/hata-metni.test.ts` | 147 |
| `frontend/ozellik/kutuphane/hata-metni.ts` | 59 |
| `frontend/ozellik/kutuphane/iscilik-katalog-adresi.test.ts` | 73 |
| `frontend/ozellik/kutuphane/iscilik-katalog-adresi.ts` | 21 |
| `frontend/ozellik/kutuphane/library/InlineFirmEntry.tsx` | 165 |
| `frontend/ozellik/kutuphane/library/ManualBrandModal.tsx` | 193 |
| `frontend/ozellik/kutuphane/oksuz-kutuphane-uyarisi.test.ts` | 136 |
| `frontend/ozellik/kutuphane/oksuz-kutuphane-uyarisi.ts` | 60 |
| `frontend/ozellik/odeme/AbonelikSeridi.tsx` | 51 |
| `frontend/ozellik/odeme/DenemeSatiri.tsx` | 27 |
| `frontend/ozellik/odeme/FiyatKartlari.tsx` | 142 |
| `frontend/ozellik/odeme/IyzicoFormu.tsx` | 36 |
| `frontend/ozellik/odeme/abonelik-ozeti.test.ts` | 435 |
| `frontend/ozellik/odeme/abonelik-ozeti.ts` | 214 |
| `frontend/ozellik/odeme/deneme-satiri.test.ts` | 121 |
| `frontend/ozellik/odeme/dwg-kapisi.test.ts` | 135 |
| `frontend/ozellik/odeme/dwg-kapisi.ts` | 44 |
| `frontend/ozellik/odeme/erisim-durumu.test.ts` | 183 |
| `frontend/ozellik/odeme/erisim-durumu.ts` | 115 |
| `frontend/ozellik/odeme/fatura-kimligi.test.ts` | 247 |
| `frontend/ozellik/odeme/fatura-kimligi.ts` | 196 |
| `frontend/ozellik/odeme/fiyat-sayfasi.test.ts` | 429 |
| `frontend/ozellik/odeme/gorunen-paket-adi.test.ts` | 82 |
| `frontend/ozellik/odeme/iyzico-form.test.ts` | 263 |
| `frontend/ozellik/odeme/iyzico-form.ts` | 138 |
| `frontend/ozellik/odeme/ozellik-kapisi.test.ts` | 162 |
| `frontend/ozellik/odeme/ozellik-kapisi.ts` | 64 |
| `frontend/ozellik/odeme/paket-bicim.test.ts` | 129 |
| `frontend/ozellik/odeme/paket-bicim.ts` | 287 |
| `frontend/ozellik/odeme/paket-rozeti.test.ts` | 205 |
| `frontend/ozellik/odeme/sozlesme-onayi.test.ts` | 83 |
| `frontend/ozellik/odeme/sozlesme-onayi.ts` | 31 |
| `frontend/ozellik/odeme/telefon-bicim.test.ts` | 150 |
| `frontend/ozellik/odeme/telefon-bicim.ts` | 105 |
| `frontend/ozellik/odeme/turkce-metin.test.ts` | 537 |
| `frontend/ozellik/tablo/disiplin.ts` | 13 |
| `frontend/ozellik/tablo/excel-grid/CustomDropdown.tsx` | 252 |
| `frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx` | 4536 |
| `frontend/ozellik/tablo/excel-grid/SheetTabs.tsx` | 109 |
| `frontend/ozellik/tablo/excel-grid/aday-ayirt-edicilik.test.ts` | 178 |
| `frontend/ozellik/tablo/excel-grid/aday-ayirt-edicilik.ts` | 175 |
| `frontend/ozellik/tablo/excel-grid/build-material-context.test.ts` | 37 |
| `frontend/ozellik/tablo/excel-grid/build-material-context.ts` | 38 |
| `frontend/ozellik/tablo/excel-grid/cap-sorguda.test.ts` | 130 |
| `frontend/ozellik/tablo/excel-grid/discount-utils.test.ts` | 65 |
| `frontend/ozellik/tablo/excel-grid/discount-utils.ts` | 66 |
| `frontend/ozellik/tablo/excel-grid/fill-down.test.ts` | 553 |
| `frontend/ozellik/tablo/excel-grid/fill-down.ts` | 399 |
| `frontend/ozellik/tablo/excel-grid/fitting.test.ts` | 234 |
| `frontend/ozellik/tablo/excel-grid/fitting.ts` | 165 |
| `frontend/ozellik/tablo/excel-grid/gosterim-baglantisi.test.ts` | 274 |
| `frontend/ozellik/tablo/excel-grid/grup-iskonto-girisi.test.ts` | 186 |
| `frontend/ozellik/tablo/excel-grid/isaret.test.ts` | 294 |
| `frontend/ozellik/tablo/excel-grid/isaret.ts` | 186 |
| `frontend/ozellik/tablo/excel-grid/kar-yayilimi.test.ts` | 63 |
| `frontend/ozellik/tablo/excel-grid/kopyala.test.ts` | 206 |
| `frontend/ozellik/tablo/excel-grid/kopyala.ts` | 133 |
| `frontend/ozellik/tablo/excel-grid/oneri-cekince.test.ts` | 156 |
| `frontend/ozellik/tablo/excel-grid/oneri-cekince.ts` | 70 |
| `frontend/ozellik/tablo/excel-grid/satir-terfi.test.ts` | 75 |
| `frontend/ozellik/tablo/excel-grid/satir-terfi.ts` | 72 |
| `frontend/ozellik/tablo/excel-grid/types.ts` | 177 |
| `frontend/ozellik/tablo/excel-grid/useFillHandle.tsx` | 286 |
| `frontend/ozellik/tablo/excel-grid/yapistir.test.ts` | 178 |
| `frontend/ozellik/tablo/excel-grid/yapistir.ts` | 156 |
| `frontend/ozellik/tablo/merge-multisheet.ts` | 195 |
| `frontend/ozellik/tablo/parse-material-text.ts` | 69 |
| `frontend/ozellik/tablo/quotes/ColumnManagerPanel.tsx` | 146 |
| `frontend/ozellik/teklif/CeviriDuzeltmeDialog.tsx` | 115 |
| `frontend/ozellik/teklif/ceviri-akisi.test.ts` | 557 |
| `frontend/ozellik/teklif/ceviri-akisi.ts` | 163 |
| `frontend/ozellik/teklif/ceviri-duzeltme.test.ts` | 116 |
| `frontend/ozellik/teklif/ceviri-duzeltme.ts` | 78 |
| `frontend/ozellik/teklif/ceviri-kota.ts` | 251 |
| `frontend/ozellik/teklif/ceviri.test.ts` | 310 |
| `frontend/ozellik/teklif/ceviri.ts` | 258 |
| `frontend/ozellik/teklif/dashboard/RecentQuotes.tsx` | 118 |
| `frontend/ozellik/teklif/durum.ts` | 52 |
| `frontend/ozellik/teklif/dwg-teklif-sema.test.ts` | 119 |
| `frontend/ozellik/teklif/dwg-teklif-sema.ts` | 84 |
| `frontend/ozellik/teklif/fiyatsiz-kalem-uyarisi.test.ts` | 254 |
| `frontend/ozellik/teklif/fiyatsiz-kalem-uyarisi.ts` | 195 |
| `frontend/ozellik/teklif/restore-rematch.test.ts` | 555 |
| `frontend/ozellik/teklif/restore-rematch.ts` | 236 |
| `frontend/ozellik/teklif/taslak.test.ts` | 89 |
| `frontend/ozellik/teklif/taslak.ts` | 98 |
| `frontend/ozellik/teklif/teklif-dil-karari.test.ts` | 117 |
| `frontend/ozellik/teklif/teklif-dil-karari.ts` | 103 |
| `frontend/ozellik/teklif/teklif-kalem.test.ts` | 288 |
| `frontend/ozellik/teklif/teklif-kalem.ts` | 124 |
| `frontend/playwright.config.ts` | 21 |
| `frontend/playwright.golden.config.ts` | 37 |
| `frontend/postcss.config.js` | 7 |
| `frontend/scripts/surum-yaz.js` | 33 |
| `frontend/tailwind.config.ts` | 70 |
| `frontend/test/e2e-golden/artefakt-dizini.cjs` | 101 |
| `frontend/test/e2e-golden/bolum-f-kabul.spec.ts` | 195 |
| `frontend/test/e2e-golden/faz0-gs7-teshis.spec.ts` | 103 |
| `frontend/test/e2e-golden/firma-a-golden.spec.ts` | 538 |
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
| `frontend/vitest.config.ts` | 15 |
| `scripts/abonelik-olcum.sh` | 294 |
| `scripts/backup.sh` | 125 |
| `scripts/deploy-olcum.cjs` | 162 |
| `scripts/deploy.sh` | 377 |
| `scripts/firma-olcum.sh` | 162 |
| `scripts/fk-dogrula.sh` | 94 |
| `scripts/geri-yukle.sh` | 182 |
| `scripts/harita-denetle.mjs` | 260 |
| `scripts/harita-uret.mjs` | 253 |
| `scripts/jwt-secret-kur.sh` | 85 |
| `scripts/kalem59-olcu.sh` | 220 |
| `scripts/kb5-olcu.sh` | 42 |
| `scripts/klasor-denetle.mjs` | 246 |
| `scripts/kv-kaucuk-olcu.sh` | 129 |
| `scripts/paket-satis-kapat.sh` | 150 |
| `scripts/s45-olcu.sh` | 90 |
| `scripts/sir-dondur.sh` | 204 |
| `scripts/sunucu/kur.sh` | 242 |
| `scripts/sunucu/sbin/metaprice-nobetci.sh` | 71 |
| `scripts/sunucu/sbin/metaprice-yedek-bekci.sh` | 29 |

## 2 · Import bagliliklari

| Dosya | Import ettigi (ham) |
|---|---|
| `backend/scripts/ceviri-gecis-izni.ts` | `@prisma/client` `exceljs` `../src/ozellik/odeme/abonelik/ceviri-kota.servisi` `../src/ozellik/giris/ai/ceviri.service` `../src/ozellik/odeme/abonelik/ceviri-kotasi` `../src/ozellik/teklif/quotes/cikti-dil` |
| `backend/scripts/ceviri-suzgec-olcum.ts` | `@prisma/client` `../src/ozellik/giris/ai/ceviri-kurali` |
| `backend/scripts/derleme-kapisi.js` | `fs` `path` |
| `backend/scripts/kisisel-liste-backfill.js` | `@prisma/client` |
| `backend/scripts/kullanici-hakki-guncelle.ts` | `@prisma/client` |
| `backend/scripts/mfa-sifirla.ts` | `@prisma/client` `../src/altyapi/auth/mfa/mfa-karari` |
| `backend/scripts/paket-aciklama-duzelt.ts` | `@prisma/client` |
| `backend/scripts/paketleri-kur.ts` | `@prisma/client` `@nestjs/config` `../src/ozellik/odeme/iyzico/iyzico.client` `../src/ozellik/odeme/yapilandirma` |
| `backend/scripts/surum-yaz.js` | `fs` `path` `child_process` |
| `backend/src/altyapi/auth/auth.controller.ts` | `@nestjs/common` `@nestjs/throttler` `./auth.service` `./parola.servisi` `./eposta-dogrulama.servisi` `./dto/register.dto` `./dto/login.dto` `./dto/parola-sifirlama-iste.dto` `./dto/parola-sifirla.dto` `./dto/parola-degistir.dto` `./dto/eposta-dogrula.dto` `./dto/profil-guncelle.dto` `./dto/hesap-kapat.dto` `./hesap.servisi` `./guards/jwt-auth.guard` `./guards/eposta-hiz-siniri.guard` `./decorators/current-user.decorator` `./decorators/koltuk-disi-izinli.decorator` `./decorators/kapali-hesap-izinli.decorator` |
| `backend/src/altyapi/auth/auth.module.ts` | `@nestjs/common` `@nestjs/jwt` `@nestjs/passport` `./auth.service` `./auth.controller` `./strategies/jwt.strategy` `./parola.servisi` `./eposta-dogrulama.servisi` `./hesap.servisi` `./oturum.servisi` `./mfa/mfa.servisi` `./mfa/mfa.controller` `./kurumsal/kurumsal-giris.servisi` `./kurumsal/kurumsal-giris.controller` `./jwt-secret` `../../ozellik/odeme/odeme.module` |
| `backend/src/altyapi/auth/auth.service.ts` | `@nestjs/jwt` `bcrypt` `../db/prisma.service` `./hukuki-surum` `./dto/register.dto` `./dto/login.dto` `./capabilities.helper` `../../ozellik/odeme/abonelik/erisim.servisi` `./eposta-dogrulama.servisi` `./eposta` `./seviye` `./oturum.servisi` `./mfa/mfa-karari` `./token-imza` `../../ozellik/firma/firma-maskele` `../../ozellik/firma/uyelik-kurallari` |
| `backend/src/altyapi/auth/capabilities.helper.ts` | `../db/prisma.service` `./abonelik-erisim` |
| `backend/src/altyapi/auth/decorators/current-user.decorator.ts` | `@nestjs/common` |
| `backend/src/altyapi/auth/decorators/firma-rolu.decorator.ts` | `@nestjs/common` `../../../ozellik/firma/uyelik-kurallari` |
| `backend/src/altyapi/auth/decorators/kapali-hesap-izinli.decorator.ts` | `@nestjs/common` |
| `backend/src/altyapi/auth/decorators/koltuk-disi-izinli.decorator.ts` | `@nestjs/common` |
| `backend/src/altyapi/auth/decorators/roles.decorator.ts` | `@nestjs/common` |
| `backend/src/altyapi/auth/dto/eposta-dogrula.dto.ts` | `class-validator` |
| `backend/src/altyapi/auth/dto/hesap-kapat.dto.ts` | `class-validator` |
| `backend/src/altyapi/auth/dto/login.dto.ts` | `class-validator` |
| `backend/src/altyapi/auth/dto/parola-degistir.dto.ts` | `class-validator` `../parola-kurali` |
| `backend/src/altyapi/auth/dto/parola-sifirla.dto.ts` | `class-validator` `../parola-kurali` |
| `backend/src/altyapi/auth/dto/parola-sifirlama-iste.dto.ts` | `class-validator` |
| `backend/src/altyapi/auth/dto/profil-guncelle.dto.ts` | `class-validator` |
| `backend/src/altyapi/auth/dto/register.dto.ts` | `class-validator` `../parola-kurali` |
| `backend/src/altyapi/auth/eposta-dogrulama.servisi.ts` | `@nestjs/common` `@nestjs/config` `../db/prisma.service` `../../ozellik/odeme/eposta/eposta.servisi` `./token-ozet` `./uygulama-url` |
| `backend/src/altyapi/auth/eposta.ts` | `@prisma/client` `../db/prisma.service` |
| `backend/src/altyapi/auth/guards/eposta-hiz-siniri.guard.ts` | `@nestjs/common` `@nestjs/throttler` |
| `backend/src/altyapi/auth/guards/firma-rol.guard.ts` | `@nestjs/core` `../decorators/firma-rolu.decorator` `../kimlik` |
| `backend/src/altyapi/auth/guards/jwt-auth.guard.ts` | `@nestjs/common` `@nestjs/core` `@nestjs/passport` `../decorators/koltuk-disi-izinli.decorator` `../decorators/kapali-hesap-izinli.decorator` |
| `backend/src/altyapi/auth/guards/kullanici-hiz-siniri.guard.ts` | `@nestjs/common` `@nestjs/throttler` |
| `backend/src/altyapi/auth/guards/roles.guard.ts` | `@nestjs/common` `@nestjs/core` `../decorators/roles.decorator` |
| `backend/src/altyapi/auth/guards/tier.guard.ts` | `@nestjs/common` `@nestjs/core` `../../db/prisma.service` `../seviye` |
| `backend/src/altyapi/auth/hesap.servisi.ts` | `bcrypt` `../db/prisma.service` `../../ozellik/odeme/abonelik/satinalma.servisi` `../../ozellik/odeme/abonelik/deneme-hakki` `../../ozellik/firma/firma-maskele` `../../ozellik/odeme/eposta/eposta.servisi` `../../ozellik/odeme/abonelik/ceviri-kotasi` `./oturum.servisi` `./parola-kurali` |
| `backend/src/altyapi/auth/kapatma-epostalari.ts` | `../../ozellik/odeme/eposta/eposta.servisi` `../../ozellik/odeme/abonelik/ceviri-kotasi` |
| `backend/src/altyapi/auth/kimlik-sifreleme.ts` | `@nestjs/common` `node:crypto` |
| `backend/src/altyapi/auth/kimlik.ts` | `@nestjs/common` |
| `backend/src/altyapi/auth/kurumsal/kurumsal-epostalari.ts` | `../../../ozellik/odeme/eposta/eposta.servisi` |
| `backend/src/altyapi/auth/kurumsal/kurumsal-giris.controller.ts` | `@nestjs/throttler` `express` `./kurumsal-giris.servisi` `../guards/jwt-auth.guard` `../guards/eposta-hiz-siniri.guard` `../decorators/current-user.decorator` `../decorators/koltuk-disi-izinli.decorator` |
| `backend/src/altyapi/auth/kurumsal/kurumsal-giris.servisi.ts` | `@nestjs/config` `@nestjs/schedule` `node:crypto` `bcrypt` `../../db/prisma.service` `../../../ozellik/odeme/eposta/eposta.servisi` `../oturum.servisi` `../eposta` `../uygulama-url` `../hukuki-surum` `../kimlik-sifreleme` `./pkce` |
| `backend/src/altyapi/auth/kurumsal/kurumsal-zorunluluk.ts` | `./saglayici-kurallari` |
| `backend/src/altyapi/auth/kurumsal/oidc-istemci.ts` | `@nestjs/common` `node:crypto` `jsonwebtoken` |
| `backend/src/altyapi/auth/kurumsal/pkce.ts` | `node:crypto` |
| `backend/src/altyapi/auth/kurumsal/saglayici-kurallari.ts` | `node:url` |
| `backend/src/altyapi/auth/mfa/kurtarma-kodu.ts` | `node:crypto` `bcrypt` |
| `backend/src/altyapi/auth/mfa/meydan-okuma.ts` | `@nestjs/common` `node:crypto` `jsonwebtoken` `../jwt-secret` |
| `backend/src/altyapi/auth/mfa/mfa-epostalari.ts` | `../../../ozellik/odeme/eposta/eposta.servisi` |
| `backend/src/altyapi/auth/mfa/mfa.controller.ts` | `@nestjs/common` `@nestjs/throttler` `./mfa.servisi` `../guards/jwt-auth.guard` `../decorators/current-user.decorator` `../decorators/koltuk-disi-izinli.decorator` |
| `backend/src/altyapi/auth/mfa/mfa.servisi.ts` | `bcrypt` `../../db/prisma.service` `../../../ozellik/odeme/eposta/eposta.servisi` `../oturum.servisi` `../kimlik-sifreleme` `./meydan-okuma` |
| `backend/src/altyapi/auth/mfa/totp.ts` | `node:crypto` |
| `backend/src/altyapi/auth/oturum.servisi.ts` | `@nestjs/common` `@nestjs/jwt` `../db/prisma.service` `./token-imza` `./seviye` `./mfa/meydan-okuma` |
| `backend/src/altyapi/auth/parola.servisi.ts` | `@nestjs/config` `bcrypt` `../db/prisma.service` `../../ozellik/odeme/eposta/eposta.servisi` `./auth.service` `./eposta` `./token-ozet` `./uygulama-url` `./kurumsal/kurumsal-zorunluluk` `./parola-kurali` `./kapali-hesap` |
| `backend/src/altyapi/auth/seviye.ts` | `./abonelik-erisim` |
| `backend/src/altyapi/auth/strategies/jwt.strategy.ts` | `@nestjs/common` `@nestjs/passport` `passport-jwt` `../../db/prisma.service` `../jwt-secret` |
| `backend/src/altyapi/auth/token-imza.ts` | `@nestjs/jwt` `./jwt-secret` |
| `backend/src/altyapi/auth/token-ozet.ts` | `node:crypto` |
| `backend/src/altyapi/auth/uygulama-url.ts` | `@nestjs/config` |
| `backend/src/altyapi/db/prisma.module.ts` | `@nestjs/common` `./prisma.service` |
| `backend/src/altyapi/db/prisma.service.ts` | `@nestjs/common` `@prisma/client` |
| `backend/src/altyapi/http/govde-siniri.ts` | `@nestjs/platform-express` `express` |
| `backend/src/altyapi/http/guvenlik-basliklari.ts` | `express` `@nestjs/platform-express` |
| `backend/src/app.module.ts` | `@nestjs/common` `@nestjs/config` `@nestjs/throttler` `./health.controller` `./altyapi/db/prisma.module` `./altyapi/auth/auth.module` `./ozellik/kutuphane/brands/brands.module` `./ozellik/kutuphane/materials/materials.module` `./ozellik/kutuphane/library/library.module` `./ozellik/teklif/quotes/quotes.module` `./ozellik/kutuphane/admin/admin.module` `./ozellik/giris/ai/ai.module` `./ozellik/kutuphane/labor/labor.module` `./ozellik/kutuphane/labor-firms/labor-firms.module` `./ozellik/giris/excel-engine/excel-engine.module` `./ozellik/giris/excel-grid/excel-grid.module` `./ozellik/eslestirme/matching/matching.module` `./ozellik/eslestirme/labor-matching/labor-matching.module` `./modules/dwg-engine/dwg-engine.module` `./ozellik/fiyat/exchange-rates/exchange-rates.module` `./ozellik/cikti/quote-formats/quote-formats.module` `./ozellik/odeme/odeme.module` `./ozellik/firma/firma.module` `./ozellik/panel/panel.module` `./ozellik/imha/imha.module` |
| `backend/src/health.controller.ts` | `@nestjs/common` `./surum` |
| `backend/src/main.ts` | `@nestjs/core` `@nestjs/platform-express` `@nestjs/common` `express` `./app.module` `./altyapi/http/guvenlik-basliklari` `./altyapi/http/govde-siniri` |
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
| `backend/src/modules/dwg-engine/python/pipe_segments.py` | `typing` `ezdxf` `converter` `collections` |
| `backend/src/modules/dwg-engine/python/tests/test_block_to_line_split.py` | `__future__` `pipe_segments` |
| `backend/src/modules/dwg-engine/python/tests/test_detector_version_kapisi.py` | `__future__` |
| `backend/src/modules/dwg-engine/python/tests/test_pipe_segments.py` | `__future__` `pipe_segments` |
| `backend/src/modules/dwg-engine/python/tests/test_scale_normalization.py` | `__future__` `main` |
| `backend/src/modules/dwg-engine/python/tests/test_split_mode.py` | `pipe_segments` |
| `backend/src/modules/dwg-engine/python/tests/test_symbol_cluster_split.py` | `__future__` `pipe_segments` |
| `backend/src/modules/dwg-engine/python/tests/test_tolerance_robustness.py` | `pipe_segments` |
| `backend/src/modules/dwg-engine/python/tests/test_unit_detect.py` | `unit_detect` |
| `backend/src/modules/dwg-engine/python/topology.py` | `collections` `graph` `models` `converter` |
| `backend/src/modules/dwg-engine/python/unit_detect.py` | `__future__` `dataclasses` `pipe_segments` |
| `backend/src/modules/dwg-engine/python/upload_worker.py` | `converter` `geometry` `main` |
| `backend/src/modules/dwg-engine/scale-param.test.ts` | `node:assert` `./scale-param` |
| `backend/src/ozellik/cikti/quote-formats/format-engine.ts` | `exceljs` `../../fiyat/matching/pricing` `../../kutuphane/utils/import-fidelity` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.controller.ts` | `@nestjs/platform-express` `express` `multer` `./quote-formats.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.module.ts` | `@nestjs/common` `./quote-formats.service` `./quote-formats.controller` `../../odeme/odeme.module` |
| `backend/src/ozellik/cikti/quote-formats/quote-formats.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `../../../altyapi/auth/kimlik` `exceljs` |
| `backend/src/ozellik/cikti/utils/antet.ts` | `exceljs` |
| `backend/src/ozellik/cikti/utils/xlsx-to-pdf.ts` | `child_process` `fs/promises` `os` `path` |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.controller.ts` | `@nestjs/common` `./labor-matching.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `../../../altyapi/auth/kimlik` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` `../../../altyapi/auth/guards/tier.guard` |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.module.ts` | `@nestjs/common` `./labor-matching.service` `./labor-matching.controller` `../matching/matching.module` `../../odeme/odeme.module` |
| `backend/src/ozellik/eslestirme/labor-matching/labor-matching.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `../matching/matching.service` `../matching/tag-generator` `../matching/types` `../../../altyapi/auth/kimlik` |
| `backend/src/ozellik/eslestirme/matching/ad-resolver.ts` | `./ad-cins-sozlugu` `./normalizer` |
| `backend/src/ozellik/eslestirme/matching/conversion.ts` | `./normalizer` |
| `backend/src/ozellik/eslestirme/matching/index/line-parser.ts` | `../normalizer` `../ad-resolver` `../conversion` `./product-index` `./types` |
| `backend/src/ozellik/eslestirme/matching/index/product-index.ts` | `crypto` `../normalizer` `../ad-resolver` `../conversion` |
| `backend/src/ozellik/eslestirme/matching/index/query-engine.ts` | `../conversion` `../normalizer` `./product-index` `../shared-tag-matcher` `./vocab` `./line-parser` `./types` |
| `backend/src/ozellik/eslestirme/matching/index/types.ts` | `../conversion` `./product-index` |
| `backend/src/ozellik/eslestirme/matching/index/vocab.ts` | `./types` |
| `backend/src/ozellik/eslestirme/matching/matching.controller.ts` | `@nestjs/common` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `./matching.service` `./terminology.service` `../../../altyapi/auth/kimlik` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` |
| `backend/src/ozellik/eslestirme/matching/matching.module.ts` | `@nestjs/common` `../../../altyapi/db/prisma.module` `./matching.service` `./matching.controller` `./terminology.service` `../../fiyat/exchange-rates/exchange-rates.module` `../../odeme/odeme.module` |
| `backend/src/ozellik/eslestirme/matching/matching.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `./tag-generator` `../../fiyat/matching/pricing` `./normalizer` `./conversion` `./terminology.service` `./index/line-parser` `./index/query-engine` `../../fiyat/matching/index/outcome-mapper` `./index/product-index` `./index/types` `../../fiyat/exchange-rates/exchange-rates.service` `./types` `./shared-tag-matcher` `../../../altyapi/auth/kimlik` |
| `backend/src/ozellik/eslestirme/matching/shared-tag-matcher.ts` | `./ad-resolver` |
| `backend/src/ozellik/eslestirme/matching/tag-generator.ts` | `./types` `./ad-resolver` |
| `backend/src/ozellik/eslestirme/matching/terminology.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `./normalizer` `./conversion` |
| `backend/src/ozellik/eslestirme/utils/etiket-display.ts` | `../matching/tag-generator` `../matching/ad-resolver` |
| `backend/src/ozellik/firma/davet-kabul.controller.ts` | `@nestjs/common` `@nestjs/throttler` `./uyelik.servisi` `./dto/davet-bilgi.dto` `./dto/davet-kabul.dto` |
| `backend/src/ozellik/firma/dto/davet-bilgi.dto.ts` | `class-validator` |
| `backend/src/ozellik/firma/dto/davet-kabul.dto.ts` | `class-validator` `../../../altyapi/auth/parola-kurali` |
| `backend/src/ozellik/firma/dto/davet-olustur.dto.ts` | `class-validator` |
| `backend/src/ozellik/firma/dto/firma-guncelle.dto.ts` | `class-validator` |
| `backend/src/ozellik/firma/dto/firma-guvenlik.dto.ts` | `class-validator` |
| `backend/src/ozellik/firma/dto/rol-degistir.dto.ts` | `class-validator` |
| `backend/src/ozellik/firma/dto/uye-cikar.dto.ts` | `class-validator` |
| `backend/src/ozellik/firma/firma-kurumsal-giris.controller.ts` | `@nestjs/throttler` `../../altyapi/auth/guards/jwt-auth.guard` `../../altyapi/auth/guards/firma-rol.guard` `../../altyapi/auth/decorators/firma-rolu.decorator` `../../altyapi/auth/decorators/current-user.decorator` `../../altyapi/auth/kimlik` `./kurumsal-giris-ayar.servisi` |
| `backend/src/ozellik/firma/firma-maskele.ts` | `./uyelik-kurallari` |
| `backend/src/ozellik/firma/firma.controller.ts` | `@nestjs/platform-express` `express` `multer` `./firma.servisi` `./dto/firma-guncelle.dto` `./dto/firma-guvenlik.dto` `../../altyapi/auth/guards/jwt-auth.guard` `../../altyapi/auth/guards/firma-rol.guard` `../../altyapi/auth/decorators/firma-rolu.decorator` `../../altyapi/auth/decorators/current-user.decorator` `../../altyapi/auth/kimlik` |
| `backend/src/ozellik/firma/firma.module.ts` | `@nestjs/common` `./firma.servisi` `./firma.controller` `./uyelik.servisi` `./uyelik.controller` `./davet-kabul.controller` `./kurumsal-giris-ayar.servisi` `./firma-kurumsal-giris.controller` `../odeme/odeme.module` `../../altyapi/auth/auth.module` |
| `backend/src/ozellik/firma/firma.servisi.ts` | `../../altyapi/db/prisma.service` `../../altyapi/auth/kimlik` `./firma-maskele` `./dto/firma-guncelle.dto` |
| `backend/src/ozellik/firma/kurumsal-giris-ayar.servisi.ts` | `../../altyapi/db/prisma.service` `../../altyapi/auth/parola.servisi` `../../altyapi/auth/kurumsal/kurumsal-giris.servisi` `../../altyapi/auth/kimlik-sifreleme` `../../altyapi/auth/eposta` `./uyelik-kurallari` `../../altyapi/auth/kimlik` `../../altyapi/auth/kurumsal/dto/kurumsal.dto` |
| `backend/src/ozellik/firma/uyelik.controller.ts` | `@nestjs/throttler` `../../altyapi/auth/guards/jwt-auth.guard` `../../altyapi/auth/guards/firma-rol.guard` `../../altyapi/auth/decorators/firma-rolu.decorator` `../../altyapi/auth/decorators/current-user.decorator` `../../altyapi/auth/kimlik` `../odeme/abonelik/erisim.guard` `../odeme/abonelik/erisim.servisi` `./uyelik.servisi` `./dto/davet-olustur.dto` `./dto/rol-degistir.dto` `./dto/uye-cikar.dto` |
| `backend/src/ozellik/firma/uyelik.servisi.ts` | `@nestjs/config` `bcrypt` `../../altyapi/db/prisma.service` `../odeme/eposta/eposta.servisi` `../../altyapi/auth/oturum.servisi` `../../altyapi/auth/eposta` `../../altyapi/auth/token-ozet` `../../altyapi/auth/uygulama-url` `../../altyapi/auth/hukuki-surum` `../../altyapi/auth/kimlik` `./dto/davet-kabul.dto` |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.controller.ts` | `@nestjs/common` `./exchange-rates.service` |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.module.ts` | `@nestjs/common` `./exchange-rates.controller` `./exchange-rates.service` |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.service.ts` | `@nestjs/common` |
| `backend/src/ozellik/fiyat/matching/index/outcome-mapper.ts` | `../pricing` `../../exchange-rates/exchange-rates.service` `../../../eslestirme/matching/normalizer` `../../../eslestirme/matching/shared-tag-matcher` `../../../eslestirme/matching/index/query-engine` `../../../eslestirme/matching/types` `../../../eslestirme/matching/index/types` |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | `@nestjs/common` `@nestjs/platform-express` `@nestjs/throttler` `multer` `./ai.service` `./ceviri.service` `./dto/ceviri.dto` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/tier.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` `../../odeme/abonelik/ceviri-kota.servisi` |
| `backend/src/ozellik/giris/ai/ai.module.ts` | `@nestjs/common` `./ai.controller` `./ai.service` `./ceviri.service` `./ceviri-duzeltme.controller` `./ceviri-duzeltme.servisi` `../../../altyapi/db/prisma.module` `../../odeme/odeme.module` |
| `backend/src/ozellik/giris/ai/ai.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `../../../altyapi/auth/kimlik` `@anthropic-ai/sdk` `./ai-maliyet` `../../kutuphane/utils/import-fidelity` `xlsx` `pdf-parse` |
| `backend/src/ozellik/giris/ai/ceviri-duzeltme.controller.ts` | `@nestjs/common` `@nestjs/throttler` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/kullanici-hiz-siniri.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` `./ceviri-duzeltme.servisi` `./dto/ceviri-duzeltme.dto` |
| `backend/src/ozellik/giris/ai/ceviri-duzeltme.servisi.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `../../../altyapi/auth/kimlik` `../../../altyapi/auth/eposta-dogrulama` `../../odeme/abonelik/ceviri-kota.servisi` `../../odeme/abonelik/erisim.servisi` `./ceviri-kurali` `./ceviri-katmani` |
| `backend/src/ozellik/giris/ai/ceviri-katmani.ts` | `crypto` `@prisma/client` `../../../altyapi/db/prisma.service` `./ceviri-kurali` |
| `backend/src/ozellik/giris/ai/ceviri-kurali.ts` | `crypto` |
| `backend/src/ozellik/giris/ai/ceviri.service.ts` | `@nestjs/common` `@anthropic-ai/sdk` `../../../altyapi/db/prisma.service` `../../../altyapi/auth/kimlik` `../../odeme/abonelik/ceviri-kota.servisi` `./ai.service` `./ceviri-katmani` `./ceviri-duzeltme.servisi` |
| `backend/src/ozellik/giris/ai/dto/ceviri-duzeltme.dto.ts` | `class-validator` |
| `backend/src/ozellik/giris/ai/dto/ceviri.dto.ts` | `class-validator` |
| `backend/src/ozellik/giris/excel-engine/excel-engine.controller.ts` | `@nestjs/platform-express` `multer` `../../../altyapi/auth/guards/jwt-auth.guard` `./excel-engine.service` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` |
| `backend/src/ozellik/giris/excel-engine/excel-engine.module.ts` | `@nestjs/common` `../../../altyapi/db/prisma.module` `./excel-engine.service` `./excel-engine.controller` `../../odeme/odeme.module` |
| `backend/src/ozellik/giris/excel-engine/excel-engine.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `xlsx` |
| `backend/src/ozellik/giris/excel-grid/excel-grid.controller.ts` | `@nestjs/common` `@nestjs/platform-express` `multer` `../../../altyapi/auth/guards/jwt-auth.guard` `./excel-grid.service` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` |
| `backend/src/ozellik/giris/excel-grid/excel-grid.module.ts` | `@nestjs/common` `../../../altyapi/db/prisma.module` `./excel-grid.service` `./excel-grid.controller` `../../odeme/odeme.module` |
| `backend/src/ozellik/giris/excel-grid/excel-grid.service.ts` | `@nestjs/common` `xlsx` `../../../altyapi/db/prisma.service` `./sheet-discipline` `./standart-sema` `../../kutuphane/utils/import-fidelity` |
| `backend/src/ozellik/giris/excel-grid/standart-sema.ts` | `../../kutuphane/utils/import-fidelity` |
| `backend/src/ozellik/imha/imha.job.ts` | `@nestjs/common` `@nestjs/schedule` `../../altyapi/db/prisma.service` `./imha.servisi` |
| `backend/src/ozellik/imha/imha.module.ts` | `@nestjs/common` `./imha.servisi` `./imha.job` |
| `backend/src/ozellik/imha/imha.servisi.ts` | `@nestjs/common` `../../altyapi/db/prisma.service` `./saklama-sureleri` |
| `backend/src/ozellik/kutuphane/admin/admin-kurumsal-giris.controller.ts` | `../../../altyapi/db/prisma.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kurumsal/saglayici-kurallari` `../../../altyapi/auth/kurumsal/dto/kurumsal.dto` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `express` `@nestjs/platform-express` `multer` `./admin.service` `../../giris/excel-grid/excel-grid.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `../../../altyapi/auth/decorators/current-user.decorator` `./dto/kullanicilar-sorgusu.dto` `./dto/firma-rol.dto` |
| `backend/src/ozellik/kutuphane/admin/admin.module.ts` | `@nestjs/common` `./admin.controller` `./admin-kurumsal-giris.controller` `./admin.service` `../../../altyapi/db/prisma.module` `../../giris/ai/ai.module` `../../giris/excel-grid/excel-grid.module` `../../eslestirme/matching/matching.module` `../../odeme/odeme.module` |
| `backend/src/ozellik/kutuphane/admin/admin.service.ts` | `@prisma/client` `xlsx` `../../odeme/abonelik/satinalma.servisi` `../../../altyapi/db/prisma.service` `../../../altyapi/auth/mfa/mfa-karari` `../../../altyapi/auth/mfa/mfa-epostalari` `../../odeme/eposta/eposta.servisi` `./dto/kullanicilar-sorgusu.dto` `../../giris/ai/ai.service` `../../giris/ai/ceviri.service` `../../eslestirme/matching/terminology.service` `../../eslestirme/utils/etiket-display` `../../eslestirme/matching/index/product-index` `../silme-etkisi` `../../fiyat/exchange-rates/exchange-rates.service` `../../eslestirme/matching/tag-generator` |
| `backend/src/ozellik/kutuphane/admin/dto/firma-rol.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/admin/dto/kullanicilar-sorgusu.dto.ts` | `class-validator` `class-transformer` |
| `backend/src/ozellik/kutuphane/brands/brands.controller.ts` | `./brands.service` `./dto/create-brand.dto` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` |
| `backend/src/ozellik/kutuphane/brands/brands.module.ts` | `@nestjs/common` `./brands.service` `./brands.controller` `../../odeme/odeme.module` |
| `backend/src/ozellik/kutuphane/brands/brands.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `./dto/create-brand.dto` `../silme-etkisi` |
| `backend/src/ozellik/kutuphane/brands/dto/create-brand.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.controller.ts` | `@nestjs/platform-express` `multer` `./labor-firms.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../giris/excel-grid/excel-grid.service` `../../../altyapi/auth/kimlik` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` `../../../altyapi/auth/guards/tier.guard` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.module.ts` | `@nestjs/common` `./labor-firms.service` `./labor-firms.controller` `../../giris/excel-grid/excel-grid.module` `../../eslestirme/matching/matching.module` `../../odeme/odeme.module` |
| `backend/src/ozellik/kutuphane/labor-firms/labor-firms.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `../utils/import-fidelity` `../../eslestirme/utils/build-material-context` `../../eslestirme/matching/matching.service` `../../eslestirme/matching/index/product-index` `../../../altyapi/auth/kimlik` `../../fiyat/exchange-rates/exchange-rates.service` `../../eslestirme/matching/tag-generator` |
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | `./labor.service` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/tier.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` |
| `backend/src/ozellik/kutuphane/labor/labor.module.ts` | `@nestjs/common` `./labor.service` `./labor.controller` `../../../altyapi/db/prisma.module` `../../odeme/odeme.module` |
| `backend/src/ozellik/kutuphane/labor/labor.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` |
| `backend/src/ozellik/kutuphane/library/dto/add-library-rows.dto.ts` | `class-transformer` `./create-manual-brand.dto` |
| `backend/src/ozellik/kutuphane/library/dto/bulk-discount.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/library/dto/bulk-update-items.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/library/dto/create-library-item.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/library/dto/create-manual-brand.dto.ts` | `class-transformer` |
| `backend/src/ozellik/kutuphane/library/dto/import-price-list.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/library/dto/update-library-item.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/library/library.controller.ts` | `./library.service` `./dto/create-library-item.dto` `./dto/update-library-item.dto` `./dto/import-price-list.dto` `./dto/bulk-discount.dto` `./dto/bulk-update-items.dto` `./dto/create-manual-brand.dto` `./dto/add-library-rows.dto` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` |
| `backend/src/ozellik/kutuphane/library/library.module.ts` | `@nestjs/common` `./library.service` `./library.controller` `../../eslestirme/matching/matching.module` `../../odeme/odeme.module` |
| `backend/src/ozellik/kutuphane/library/library.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `../../../altyapi/auth/kimlik` `./dto/create-library-item.dto` `./dto/update-library-item.dto` `./dto/import-price-list.dto` `./dto/bulk-discount.dto` `./dto/bulk-update-items.dto` `./dto/create-manual-brand.dto` `./dto/add-library-rows.dto` `./library-sheet-builder` `../../eslestirme/matching/terminology.service` `../../fiyat/exchange-rates/exchange-rates.service` |
| `backend/src/ozellik/kutuphane/materials/dto/create-material-price.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/materials/dto/create-material.dto.ts` | `class-validator` |
| `backend/src/ozellik/kutuphane/materials/materials.controller.ts` | `./materials.service` `./dto/create-material.dto` `./dto/create-material-price.dto` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` |
| `backend/src/ozellik/kutuphane/materials/materials.module.ts` | `@nestjs/common` `./materials.service` `./materials.controller` `../../odeme/odeme.module` |
| `backend/src/ozellik/kutuphane/materials/materials.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `./dto/create-material.dto` `./dto/create-material-price.dto` |
| `backend/src/ozellik/odeme/abonelik/abonelik.controller.ts` | `@nestjs/common` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/kapali-hesap-izinli.decorator` `../../../altyapi/auth/guards/firma-rol.guard` `../../../altyapi/auth/decorators/firma-rolu.decorator` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` `./erisim.servisi` `./satinalma.servisi` `./deneme-hakki.servisi` `./dto/abonelik-basla.dto` |
| `backend/src/ozellik/odeme/abonelik/abonelik.servisi.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `@prisma/client` `../iyzico/iyzico.client` |
| `backend/src/ozellik/odeme/abonelik/ceviri-kota.servisi.ts` | `@prisma/client` `../../../altyapi/db/prisma.service` `../../../altyapi/auth/kimlik` `../../../altyapi/auth/eposta-dogrulama` `../../giris/ai/ceviri-katmani` |
| `backend/src/ozellik/odeme/abonelik/ceviri-kotasi.ts` | `@nestjs/common` |
| `backend/src/ozellik/odeme/abonelik/deneme-hakki.servisi.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `../../../altyapi/auth/eposta-dogrulama` |
| `backend/src/ozellik/odeme/abonelik/deneme-hakki.ts` | `@prisma/client` `../../../altyapi/auth/eposta` |
| `backend/src/ozellik/odeme/abonelik/dto/abonelik-basla.dto.ts` | `class-validator` |
| `backend/src/ozellik/odeme/abonelik/erisim.guard.ts` | `@nestjs/core` `../../../altyapi/auth/kimlik` `./erisim.servisi` |
| `backend/src/ozellik/odeme/abonelik/erisim.servisi.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `@prisma/client` `../../../altyapi/auth/abonelik-erisim` |
| `backend/src/ozellik/odeme/abonelik/fiyat.controller.ts` | `@nestjs/common` `@nestjs/throttler` `./satinalma.servisi` |
| `backend/src/ozellik/odeme/abonelik/iyzico-donus.controller.ts` | `@nestjs/common` `@nestjs/config` `express` `./satinalma.servisi` |
| `backend/src/ozellik/odeme/abonelik/mutabakat.job.ts` | `@nestjs/common` `@nestjs/schedule` `../../../altyapi/db/prisma.service` `@prisma/client` `../iyzico/iyzico.client` `./abonelik.servisi` |
| `backend/src/ozellik/odeme/abonelik/satinalma.servisi.ts` | `@nestjs/config` `@nestjs/schedule` `../../../altyapi/db/prisma.service` `../iyzico/iyzico.client` `./abonelik.servisi` `./ceviri-kotasi` `./deneme-hakki` `./deneme-hakki.servisi` `../eposta/eposta.servisi` `../../../altyapi/auth/hukuki-surum` |
| `backend/src/ozellik/odeme/dunning/dunning.servisi.ts` | `@nestjs/common` `@nestjs/config` `@nestjs/schedule` `../../../altyapi/db/prisma.service` `@prisma/client` `../iyzico/iyzico.client` `../abonelik/abonelik.servisi` `../eposta/eposta.servisi` |
| `backend/src/ozellik/odeme/eposta/eposta.servisi.ts` | `@nestjs/common` `@nestjs/config` `nodemailer` |
| `backend/src/ozellik/odeme/fatura/fatura.servisi.ts` | `@nestjs/common` `@nestjs/schedule` `../../../altyapi/db/prisma.service` `@prisma/client` `../eposta/eposta.servisi` |
| `backend/src/ozellik/odeme/fatura/muhasebe.adaptor.ts` | `@nestjs/common` `@nestjs/config` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `@nestjs/common` `./havale.servisi` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/guards/roles.guard` `../../../altyapi/auth/decorators/roles.decorator` `../../../altyapi/auth/decorators/current-user.decorator` |
| `backend/src/ozellik/odeme/havale/havale.servisi.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `@prisma/client` `../abonelik/abonelik.servisi` `../fatura/fatura.servisi` `../eposta/eposta.servisi` `../dunning/dunning.metinleri` |
| `backend/src/ozellik/odeme/iyzico/imza.ts` | `node:crypto` |
| `backend/src/ozellik/odeme/iyzico/iyzico-hata.filter.ts` | `express` `./iyzico.client` |
| `backend/src/ozellik/odeme/iyzico/iyzico.client.ts` | `@nestjs/common` `@nestjs/config` `../yapilandirma` `node:crypto` |
| `backend/src/ozellik/odeme/odeme.module.ts` | `@nestjs/common` `@nestjs/core` `./iyzico/iyzico-hata.filter` `./abonelik/iyzico-donus.controller` `@nestjs/config` `@nestjs/schedule` `./iyzico/iyzico.client` `./webhook/webhook.controller` `./webhook/webhook.isleyici` `./abonelik/abonelik.servisi` `./abonelik/erisim.servisi` `./abonelik/satinalma.servisi` `./abonelik/deneme-hakki.servisi` `./abonelik/abonelik.controller` `./abonelik/fiyat.controller` `./abonelik/ceviri-kota.servisi` `./abonelik/mutabakat.job` `./dunning/dunning.servisi` `./fatura/fatura.servisi` `./havale/havale.servisi` `./havale/havale.controller` `./eposta/eposta.servisi` |
| `backend/src/ozellik/odeme/webhook/webhook.controller.ts` | `@nestjs/config` `../../../altyapi/db/prisma.service` `./webhook.isleyici` `../yapilandirma` |
| `backend/src/ozellik/odeme/webhook/webhook.isleyici.ts` | `@nestjs/common` `@nestjs/schedule` `../../../altyapi/db/prisma.service` `../abonelik/abonelik.servisi` `../fatura/fatura.servisi` `../dunning/dunning.servisi` |
| `backend/src/ozellik/odeme/yapilandirma.ts` | `@nestjs/common` `@nestjs/config` |
| `backend/src/ozellik/panel/panel.controller.ts` | `@nestjs/common` `./panel.servisi` `../../altyapi/auth/guards/jwt-auth.guard` `../../altyapi/auth/decorators/current-user.decorator` `../../altyapi/auth/kimlik` |
| `backend/src/ozellik/panel/panel.module.ts` | `@nestjs/common` `./panel.servisi` `./panel.controller` |
| `backend/src/ozellik/panel/panel.servisi.ts` | `@nestjs/common` `../../altyapi/db/prisma.service` `../../altyapi/auth/kimlik` `../firma/uyelik-kurallari` |
| `backend/src/ozellik/teklif/quotes/dto/create-quote.dto.ts` | `class-validator` `class-transformer` |
| `backend/src/ozellik/teklif/quotes/dto/teklifler-sorgusu.dto.ts` | `class-validator` `class-transformer` |
| `backend/src/ozellik/teklif/quotes/export-engine.ts` | `exceljs` `./standart-cikti` `../../cikti/utils/antet` |
| `backend/src/ozellik/teklif/quotes/quotes.controller.ts` | `@nestjs/platform-express` `express` `./quotes.service` `./dto/create-quote.dto` `./dto/teklifler-sorgusu.dto` `../../../altyapi/auth/guards/jwt-auth.guard` `../../../altyapi/auth/decorators/current-user.decorator` `../../../altyapi/auth/kimlik` `multer` `../../odeme/abonelik/erisim.guard` `../../odeme/abonelik/erisim.servisi` |
| `backend/src/ozellik/teklif/quotes/quotes.module.ts` | `@nestjs/common` `./quotes.service` `./quotes.controller` `../../giris/ai/ai.module` `../../../altyapi/db/prisma.module` `../../fiyat/exchange-rates/exchange-rates.module` `../../odeme/odeme.module` |
| `backend/src/ozellik/teklif/quotes/quotes.service.ts` | `@nestjs/common` `../../../altyapi/db/prisma.service` `./dto/create-quote.dto` `./dto/teklifler-sorgusu.dto` `../../../altyapi/auth/kimlik` `./hazirlayan` `xlsx` `exceljs` `./export-engine` `./standart-cikti` `../../cikti/quote-formats/format-engine` `../../fiyat/exchange-rates/exchange-rates.service` `../../giris/ai/ceviri.service` `../../giris/ai/ceviri-kurali` `../../fiyat/matching/pricing` `../../cikti/utils/antet` |
| `backend/src/ozellik/teklif/quotes/standart-cikti.ts` | `exceljs` `../../fiyat/matching/pricing` `../../kutuphane/utils/import-fidelity` `../../cikti/utils/antet` |
| `backend/src/surum.ts` | `./surum.generated` |
| `backend/test/a1-silme-etkisi-test.ts` | `@prisma/client` `@nestjs/common` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/kutuphane/admin/admin.controller` `../src/ozellik/kutuphane/brands/brands.service` `../src/ozellik/kutuphane/brands/brands.controller` `reflect-metadata` |
| `backend/test/abonelik-erisim-test.ts` | `fs` `path` `@nestjs/core` `../src/altyapi/auth/seviye` `../src/altyapi/auth/capabilities.helper` `../src/altyapi/auth/guards/tier.guard` `../src/ozellik/odeme/abonelik/erisim.servisi` `../src/ozellik/kutuphane/labor/labor.controller` `reflect-metadata` |
| `backend/test/abonelik-olcum-sorgu-test.ts` | `node:fs` `node:path` |
| `backend/test/admin-import-test.ts` | `../src/ozellik/eslestirme/utils/etiket-display` `xlsx` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/kutuphane/utils/import-fidelity` |
| `backend/test/aile-oncelik-simulasyon.ts` | `fs` `path` `../src/ozellik/eslestirme/matching/ad-cins-sozlugu` `../src/ozellik/eslestirme/matching/ad-resolver` `../src/ozellik/eslestirme/matching/index/product-index` `xlsx` |
| `backend/test/aile-oncelik-test.ts` | `../src/ozellik/eslestirme/matching/ad-cins-sozlugu` `../src/ozellik/eslestirme/matching/index/product-index` |
| `backend/test/aile-uyusmazligi-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/alias-kelime-yutma-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/ad-cins-sozlugu` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/antet-test.ts` | `fs` `path` `exceljs` `../src/ozellik/teklif/quotes/quotes.service` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/cikti/utils/antet` `./cikti-test-yardimci` `../../frontend/ozellik/fiyat/pricing` |
| `backend/test/audit-canli-kosum.ts` | `@prisma/client` `fs` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/kutuphane/library/library.service` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/eslestirme/matching/conversion` |
| `backend/test/audit-real-excel.ts` | `xlsx` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/product-index` |
| `backend/test/b1-kutuphane-cascade-test.ts` | `@prisma/client` |
| `backend/test/build-sha-kablolama-test.ts` | `fs` `path` `../src/health.controller` |
| `backend/test/cap-cevrilemedi-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/eslestirme/matching/conversion` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/ceviri-duzeltme-test.ts` | `http` `@nestjs/common` `@nestjs/common/constants` `@nestjs/core` `@nestjs/platform-express` `express` `@nestjs/throttler` `fs` `path` `../src/ozellik/giris/ai/ceviri-katmani` `../src/ozellik/giris/ai/ceviri-kurali` `../src/ozellik/giris/ai/ceviri-duzeltme.controller` `../src/ozellik/giris/ai/dto/ceviri-duzeltme.dto` `../src/ozellik/giris/ai/ceviri.service` `../src/ozellik/odeme/abonelik/ceviri-kota.servisi` `../src/ozellik/odeme/abonelik/erisim.guard` `../src/ozellik/odeme/abonelik/erisim.servisi` `../src/altyapi/auth/guards/kullanici-hiz-siniri.guard` `../src/altyapi/http/govde-siniri` `../src/altyapi/auth/hesap.servisi` `../src/ozellik/teklif/quotes/quotes.service` `../scripts/ceviri-suzgec-olcum` `./ceviri-sahte-db` `reflect-metadata` |
| `backend/test/ceviri-gecis-test.ts` | `exceljs` `../src/ozellik/giris/ai/ceviri-kurali` `../src/ozellik/odeme/abonelik/ceviri-kotasi` `../src/ozellik/odeme/abonelik/ceviri-kota.servisi` `../src/ozellik/giris/ai/ceviri.service` `./ceviri-sahte-db` `reflect-metadata` |
| `backend/test/ceviri-gorunum-cikti-test.ts` | `fs` `http` `path` `exceljs` `@nestjs/common` `@nestjs/common/constants` `@nestjs/core` `@nestjs/throttler` `../src/ozellik/odeme/abonelik/ceviri-kota.servisi` `../src/ozellik/giris/ai/ceviri.service` `../src/ozellik/giris/ai/ai.controller` `../src/ozellik/teklif/quotes/quotes.service` `../src/ozellik/teklif/quotes/quotes.controller` `../src/ozellik/odeme/abonelik/erisim.guard` `./ceviri-sahte-db` `reflect-metadata` |
| `backend/test/ceviri-karar-test.ts` | `../src/ozellik/giris/ai/ceviri.service` `../src/ozellik/giris/ai/ceviri-kurali` |
| `backend/test/ceviri-kota-uygulama-test.ts` | `fs` `path` `@nestjs/common` `@nestjs/common/constants` `@nestjs/throttler` `../src/ozellik/giris/ai/ceviri.service` `../src/ozellik/giris/ai/ai.controller` `../src/ozellik/giris/ai/dto/ceviri.dto` `../src/ozellik/odeme/abonelik/erisim.servisi` `reflect-metadata` |
| `backend/test/ceviri-kotasi-test.ts` | `../src/ozellik/odeme/abonelik/satinalma.servisi` `../src/ozellik/odeme/abonelik/fiyat.controller` `../src/ozellik/odeme/abonelik/abonelik.controller` `../src/ozellik/odeme/odeme.module` `reflect-metadata` |
| `backend/test/cikti-dil-test.ts` | `../src/ozellik/teklif/quotes/cikti-dil` `../src/ozellik/teklif/quotes/standart-cikti` |
| `backend/test/cikti-test-yardimci.ts` | `zlib` `exceljs` `../../frontend/ozellik/fiyat/pricing` |
| `backend/test/contract-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/types` |
| `backend/test/conversion-test.ts` | `../src/ozellik/eslestirme/matching/conversion` |
| `backend/test/d1-marka-silme-capraz-tenant-test.ts` | `@prisma/client` `@nestjs/common` `../src/ozellik/kutuphane/brands/brands.service` |
| `backend/test/deneme-hakki-test.ts` | `bcrypt` `node:crypto` `@nestjs/common` `@nestjs/config` `@prisma/client` `../src/altyapi/auth/eposta` `../src/ozellik/odeme/abonelik/deneme-hakki.servisi` `../src/ozellik/odeme/abonelik/abonelik.servisi` `../src/ozellik/odeme/abonelik/mutabakat.job` `../src/ozellik/odeme/webhook/webhook.isleyici` `../src/altyapi/auth/hesap.servisi` `../src/altyapi/auth/auth.service` `../src/altyapi/auth/oturum.servisi` `../src/altyapi/auth/parola.servisi` `../src/ozellik/odeme/abonelik/abonelik.controller` `../src/ozellik/odeme/odeme.module` `reflect-metadata` |
| `backend/test/deploy-olcum-test.ts` | `fs` `http` `path` `../../scripts/deploy-olcum.cjs` |
| `backend/test/dn-koprusu-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/conversion` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/erisim-kapisi-test.ts` | `@prisma/client` `../src/ozellik/odeme/abonelik/erisim.guard` `../src/ozellik/teklif/quotes/quotes.controller` `../src/ozellik/cikti/quote-formats/quote-formats.controller` `../src/modules/dwg-engine/dwg-engine.controller` `../src/ozellik/odeme/abonelik/abonelik.controller` `../src/ozellik/kutuphane/labor/labor.controller` `../src/ozellik/giris/ai/ai.controller` `../src/ozellik/giris/ai/ceviri-duzeltme.controller` `reflect-metadata` `node:fs` `node:path` |
| `backend/test/erken-kurtarma-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/excel-grid-test.ts` | `xlsx` `../src/ozellik/giris/excel-grid/excel-grid.service` |
| `backend/test/export-format-test.ts` | `exceljs` `../src/ozellik/teklif/quotes/export-engine` `../src/ozellik/cikti/quote-formats/format-engine` |
| `backend/test/export-live-sim-test.ts` | `exceljs` `../src/ozellik/teklif/quotes/quotes.service` |
| `backend/test/fallback-ad-kilidi-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/fatura-kimligi-kapisi-test.ts` | `node:fs` `node:path` `@nestjs/common` `@nestjs/config` `../src/ozellik/odeme/abonelik/deneme-hakki.servisi` `../src/ozellik/odeme/fatura/muhasebe.adaptor` |
| `backend/test/faz0-gs7-probe.ts` | `fs` `path` `../src/ozellik/giris/excel-grid/excel-grid.service` |
| `backend/test/faz2-kullanici-yonetimi-test.ts` | `node:fs` `node:path` `@nestjs/common` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/giris/ai/ai-maliyet` `reflect-metadata` |
| `backend/test/faz3-eposta-parola-test.ts` | `node:fs` `node:path` `@nestjs/config` `../src/altyapi/auth/uygulama-url` `reflect-metadata` |
| `backend/test/faz4-firma-teklif-test.ts` | `node:fs` `node:path` `reflect-metadata` |
| `backend/test/faz5-kvkk-hukuki-test.ts` | `node:fs` `node:path` `reflect-metadata` |
| `backend/test/faz7-ekip-test.ts` | `fs` `path` `@nestjs/core` `jsonwebtoken` `bcrypt` `../src/ozellik/firma/firma-maskele` `../src/ozellik/teklif/quotes/hazirlayan` `../src/altyapi/auth/strategies/jwt.strategy` `../src/altyapi/auth/guards/jwt-auth.guard` `../src/altyapi/auth/guards/firma-rol.guard` `../src/altyapi/auth/decorators/roles.decorator` `../src/altyapi/auth/guards/tier.guard` `../src/ozellik/odeme/abonelik/erisim.guard` `../src/ozellik/odeme/abonelik/erisim.servisi` `../src/ozellik/firma/uyelik.servisi` `../src/ozellik/firma/uyelik.controller` `../src/ozellik/odeme/abonelik/abonelik.controller` `../src/ozellik/firma/firma.controller` `../src/altyapi/auth/auth.controller` `../src/altyapi/auth/auth.service` `../src/altyapi/auth/hesap.servisi` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/firma/firma.servisi` `../src/altyapi/auth/token-ozet` `reflect-metadata` `../src/altyapi/auth/hukuki-surum` `../src/ozellik/kutuphane/admin/admin.controller` `../src/ozellik/odeme/abonelik/abonelik.servisi` |
| `backend/test/faz7-kurumsal-test.ts` | `fs` `path` `node:crypto` `@nestjs/core` `jsonwebtoken` `bcrypt` `../src/altyapi/auth/kurumsal/kurumsal-giris.controller` `../src/altyapi/auth/kimlik-sifreleme` `../src/altyapi/auth/mfa/totp` `../src/altyapi/auth/oturum.servisi` `../src/altyapi/auth/auth.service` `../src/altyapi/auth/hesap.servisi` `../src/altyapi/auth/parola.servisi` `../src/altyapi/auth/mfa/mfa.servisi` `../src/ozellik/firma/uyelik.servisi` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/firma/kurumsal-giris-ayar.servisi` `../src/ozellik/firma/firma-kurumsal-giris.controller` `../src/ozellik/kutuphane/admin/admin-kurumsal-giris.controller` `../src/altyapi/auth/decorators/koltuk-disi-izinli.decorator` `../src/altyapi/auth/guards/jwt-auth.guard` `../src/altyapi/auth/decorators/roles.decorator` `../src/altyapi/auth/decorators/firma-rolu.decorator` `../src/altyapi/auth/guards/tier.guard` `./yardimci/sahte-oidc-saglayici` `../src/altyapi/auth/kurumsal/oidc-istemci` `reflect-metadata` |
| `backend/test/faz7-mfa-test.ts` | `fs` `path` `@nestjs/core` `jsonwebtoken` `bcrypt` `../src/altyapi/auth/mfa/mfa.servisi` `../src/altyapi/auth/mfa/mfa.controller` `../src/altyapi/auth/mfa/meydan-okuma` `../src/altyapi/auth/mfa/kurtarma-kodu` `../src/altyapi/auth/kimlik-sifreleme` `../src/altyapi/auth/token-ozet` `../src/altyapi/auth/oturum.servisi` `../src/altyapi/auth/auth.service` `../src/altyapi/auth/hesap.servisi` `../src/altyapi/auth/strategies/jwt.strategy` `../src/ozellik/firma/uyelik.servisi` `../src/ozellik/firma/firma.servisi` `../src/ozellik/kutuphane/admin/admin.service` `../src/altyapi/auth/parola.servisi` `../src/altyapi/auth/decorators/koltuk-disi-izinli.decorator` `../src/altyapi/auth/decorators/roles.decorator` `../src/altyapi/auth/decorators/firma-rolu.decorator` `../src/ozellik/kutuphane/admin/admin.controller` `../src/ozellik/firma/firma.controller` `../scripts/mfa-sifirla` `reflect-metadata` `crypto` |
| `backend/test/faz7-oidc-test.ts` | `node:fs` `node:path` `node:crypto` `../src/altyapi/auth/kurumsal/pkce` `./yardimci/sahte-oidc-saglayici` |
| `backend/test/faz7-totp-test.ts` | `node:fs` `node:path` `node:crypto` `bcrypt` `jsonwebtoken` `../src/altyapi/auth/kimlik-sifreleme` `../src/altyapi/auth/strategies/jwt.strategy` |
| `backend/test/faz7-yetki-test.ts` | `fs` `path` `bcrypt` `@nestjs/core` `../src/altyapi/auth/guards/tier.guard` `../src/altyapi/auth/guards/roles.guard` `../src/altyapi/auth/decorators/roles.decorator` `../src/ozellik/odeme/abonelik/erisim.guard` `../src/ozellik/kutuphane/labor/labor.controller` `../src/ozellik/giris/ai/ai.controller` `../src/ozellik/giris/ai/ai.service` `../src/altyapi/auth/auth.service` `../src/altyapi/auth/oturum.servisi` `../src/ozellik/kutuphane/admin/admin.service` `../src/altyapi/auth/hesap.servisi` `../src/ozellik/eslestirme/labor-matching/labor-matching.service` `../src/ozellik/eslestirme/labor-matching/labor-matching.controller` `../src/ozellik/kutuphane/labor-firms/labor-firms.controller` `../src/ozellik/eslestirme/matching/matching.service` `reflect-metadata` |
| `backend/test/firma-ekseni-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/kutuphane/labor-firms/labor-firms.service` `../src/altyapi/auth/kimlik` `reflect-metadata` |
| `backend/test/firma-izolasyon-test.ts` | `@prisma/client` `../src/ozellik/teklif/quotes/quotes.service` `../src/altyapi/auth/kimlik` `../src/ozellik/cikti/quote-formats/quote-formats.service` `../src/ozellik/kutuphane/library/library.service` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `reflect-metadata` |
| `backend/test/fixture-anonim.ts` | `fs` `path` `jszip` |
| `backend/test/fixture-dogrula.ts` | `fs` `path` `./fixture-anonim` `../src/ozellik/giris/excel-grid/excel-grid.service` `jszip` |
| `backend/test/fiyat-capasi-test.ts` | `../scripts/paketleri-kur` |
| `backend/test/gercek-dosya-test.ts` | `fs` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/teklif/quotes/quotes.service` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/cikti/quote-formats/format-engine` `../src/ozellik/teklif/quotes/export-engine` |
| `backend/test/geri-donus-test.ts` | `fs` `path` `@nestjs/core` `@nestjs/config` `../src/altyapi/auth/oturum.servisi` `../src/altyapi/auth/auth.service` `../src/altyapi/auth/parola.servisi` `../src/altyapi/auth/strategies/jwt.strategy` `../src/altyapi/auth/guards/jwt-auth.guard` `../src/ozellik/odeme/abonelik/erisim.servisi` `../src/altyapi/auth/auth.controller` `../src/ozellik/teklif/quotes/quotes.controller` `../src/ozellik/kutuphane/library/library.controller` `../src/ozellik/cikti/quote-formats/quote-formats.controller` `../src/ozellik/giris/ai/ai.controller` `../src/ozellik/odeme/abonelik/abonelik.controller` `../src/altyapi/auth/token-ozet` `reflect-metadata` |
| `backend/test/gs6b-teshis.ts` | `fs` `../src/ozellik/giris/excel-grid/excel-grid.service` |
| `backend/test/guvenlik-basliklari-test.ts` | `fs` `http` `path` `@nestjs/common` `@nestjs/core` `@nestjs/platform-express` `reflect-metadata` |
| `backend/test/guvenlik-paket1-test.ts` | `node:fs` `node:path` `../src/altyapi/auth/auth.controller` `reflect-metadata` |
| `backend/test/guvenlik-turu-2-test.ts` | `node:fs` `node:path` `../src/altyapi/auth/decorators/roles.decorator` `../src/ozellik/kutuphane/labor/labor.controller` `../src/ozellik/teklif/quotes/quotes.controller` `../src/ozellik/kutuphane/brands/brands.controller` `../src/modules/dwg-engine/dwg-engine.controller` `../src/modules/dwg-engine/dwg-sahiplik.servisi` `reflect-metadata` |
| `backend/test/guvenlik-uclari-test.ts` | `@nestjs/core` `../src/ozellik/eslestirme/matching/matching.controller` `../src/ozellik/eslestirme/labor-matching/labor-matching.controller` `../src/altyapi/auth/decorators/roles.decorator` `../src/ozellik/kutuphane/labor/labor.controller` `../src/ozellik/giris/ai/ai.controller` `../src/altyapi/auth/guards/tier.guard` `../src/ozellik/kutuphane/brands/brands.controller` `../src/ozellik/kutuphane/admin/admin.controller` `reflect-metadata` |
| `backend/test/hesap-dogrulugu-test.ts` | `fs` `path` `exceljs` `../src/ozellik/teklif/quotes/standart-cikti` `../src/ozellik/teklif/quotes/export-engine` `../src/ozellik/cikti/quote-formats/format-engine` `../src/ozellik/teklif/quotes/quotes.service` `../src/ozellik/fiyat/exchange-rates/exchange-rates.service` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/fiyat/matching/pricing` `../src/ozellik/cikti/utils/antet` `./cikti-test-yardimci` `../../frontend/ozellik/fiyat/pricing` `../../frontend/ozellik/teklif/teklif-kalem` `../../frontend/ozellik/fiyat/sayi-alani` `../src/ozellik/kutuphane/utils/import-fidelity` `../src/ozellik/giris/excel-grid/standart-sema` `../src/ozellik/giris/ai/ai.service` |
| `backend/test/iliskisel-alan-suzgeci-test.ts` | `../src/ozellik/teklif/quotes/quotes.service` |
| `backend/test/imha-test.ts` | `fs` `path` `../src/ozellik/imha/imha.job` `reflect-metadata` |
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
| `backend/test/kur-donmasi-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/fiyat/exchange-rates/exchange-rates.service` |
| `backend/test/kurtarma-mesaj-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/kutuphane-ad-duzenleme-test.ts` | `../src/ozellik/kutuphane/library/library-sheet-builder` `../src/ozellik/kutuphane/library/library.service` |
| `backend/test/kutuphane-fiyat-donmasi-test.ts` | `fs` `path` `typescript` `../src/ozellik/kutuphane/library/library.service` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/index/product-index` `../../frontend/ozellik/fiyat/sayi-alani` `../src/ozellik/kutuphane/library/library-sheet-builder` |
| `backend/test/kutuphane-liste-test.ts` | `@nestjs/common` `../src/ozellik/kutuphane/labor-firms/labor-firms.service` `../src/ozellik/kutuphane/library/library.service` |
| `backend/test/labor-matching-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/labor-matching/labor-matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/labor-sheet-test.ts` | `@prisma/client` `../src/ozellik/kutuphane/labor-firms/labor-firms.service` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/library-transfer-test.ts` | `../src/ozellik/kutuphane/library/library-sheet-builder` |
| `backend/test/manifest-kapisi.ts` | `fs` `path` |
| `backend/test/matching-regression.ts` | `@prisma/client` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/tag-generator` `../src/ozellik/eslestirme/matching/normalizer` |
| `backend/test/matching-unit-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/migration-zinciri-test.ts` | `@electric-sql/pglite` `node:fs` `node:path` `../src/ozellik/kutuphane/library/library-sheet-builder` |
| `backend/test/odeme-imha-test.ts` | `node:fs` `node:path` `@nestjs/config` `@prisma/client` `../src/ozellik/odeme/abonelik/satinalma.servisi` `../src/ozellik/odeme/abonelik/deneme-hakki.servisi` |
| `backend/test/odeme-onyukleme-test.ts` | `reflect-metadata` |
| `backend/test/olcu-anahtari-cakismasi-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/tag-generator` `../src/ozellik/eslestirme/matching/normalizer` `../src/ozellik/eslestirme/matching/conversion` |
| `backend/test/onceden-fiyatli-test.ts` | `fs` `../src/ozellik/giris/excel-grid/excel-grid.service` |
| `backend/test/oneri-kutusu-cekince-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/types` |
| `backend/test/ortam-degiskenleri-test.ts` | `node:fs` `node:path` |
| `backend/test/p2-2-sheets-indeks-test.ts` | `@prisma/client` `../src/ozellik/kutuphane/admin/admin.service` `../src/ozellik/kutuphane/library/library.service` `../src/ozellik/eslestirme/matching/terminology.service` `../src/ozellik/eslestirme/matching/index/product-index` |
| `backend/test/paket-aciklama-duzelt-test.ts` | `node:fs` `node:path` |
| `backend/test/panel-ozet-test.ts` | `fs` `path` `@nestjs/core` `../src/ozellik/panel/panel.servisi` `../src/ozellik/panel/panel.controller` `../src/ozellik/teklif/quotes/quotes.service` `../src/ozellik/kutuphane/library/library.service` `../src/ozellik/firma/uyelik.servisi` `../src/ozellik/kutuphane/admin/admin.controller` `../src/ozellik/firma/uyelik-kurallari` `../src/altyapi/auth/decorators/roles.decorator` `reflect-metadata` |
| `backend/test/pano18-para-birimi-test.ts` | `fs` `exceljs` `../src/ozellik/teklif/quotes/standart-cikti` `../src/ozellik/teklif/quotes/export-engine` `../src/ozellik/cikti/quote-formats/format-engine` |
| `backend/test/para-birimi-yazim-test.ts` | `@nestjs/common` `xlsx` `../src/ozellik/kutuphane/labor-firms/labor-firms.service` `../src/ozellik/kutuphane/library/library.service` `../src/ozellik/kutuphane/library/library.controller` `../src/ozellik/kutuphane/library/dto/create-manual-brand.dto` `../src/ozellik/kutuphane/library/dto/add-library-rows.dto` `../src/ozellik/kutuphane/admin/admin.service` `reflect-metadata` |
| `backend/test/parola-kapisi-test.ts` | `node:fs` `node:path` `@nestjs/config` `@nestjs/core` `class-validator` `class-transformer` `bcrypt` `../src/altyapi/auth/dto/register.dto` `../src/altyapi/auth/dto/parola-degistir.dto` `../src/altyapi/auth/dto/parola-sifirla.dto` `../src/ozellik/firma/dto/davet-kabul.dto` `../src/altyapi/auth/parola.servisi` `../src/altyapi/auth/hesap.servisi` `../src/altyapi/auth/auth.controller` `reflect-metadata` |
| `backend/test/perf-profil.ts` | `fs` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/teklif/quotes/export-engine` `../src/ozellik/teklif/quotes/standart-cikti` `../src/ozellik/cikti/quote-formats/format-engine` `exceljs` |
| `backend/test/pk3-kimlik-haritasi-test.ts` | `./fixture-anonim` |
| `backend/test/pk3-repo-kapsama-test.ts` | `fs` `path` `child_process` |
| `backend/test/pk9-sessiz-indeks-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/regression-all.ts` | `child_process` |
| `backend/test/s45-malzeme-aile-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/eslestirme/matching/conversion` `../src/ozellik/eslestirme/matching/index/types` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/s45-olcum.ts` | `fs` `path` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/satinalma-yolu-test.ts` | `node:fs` `node:path` `@nestjs/config` `../src/altyapi/auth/hukuki-surum` `class-transformer` `class-validator` `../src/ozellik/odeme/abonelik/abonelik.controller` `../src/ozellik/odeme/abonelik/dto/abonelik-basla.dto` `@nestjs/common` `../src/ozellik/odeme/abonelik/deneme-hakki.servisi` |
| `backend/test/sir-dondur-kapsam-test.ts` | `node:fs` `node:os` `node:path` `node:child_process` |
| `backend/test/sozluk-golgeleme-olcum.ts` | `../src/ozellik/eslestirme/matching/ad-cins-sozlugu` `../src/ozellik/eslestirme/matching/ad-resolver` `../src/ozellik/eslestirme/matching/normalizer` `../src/ozellik/eslestirme/matching/index/product-index` |
| `backend/test/spec-regression-test.ts` | `../src/ozellik/eslestirme/matching/matching.service` `../src/ozellik/eslestirme/matching/terminology.service` |
| `backend/test/standart-cikti-test.ts` | `fs` `path` `exceljs` `../src/ozellik/teklif/quotes/standart-cikti` `../src/ozellik/giris/excel-grid/excel-grid.service` |
| `backend/test/standart-sema-test.ts` | `fs` `path` `xlsx` `../src/ozellik/giris/excel-grid/excel-grid.service` `../src/ozellik/giris/excel-grid/standart-sema` `../../frontend/ozellik/fiyat/sayi-alani` `../../frontend/ozellik/fiyat/pricing` |
| `backend/test/sunucu-urunleri-test.ts` | `node:fs` `node:path` |
| `backend/test/tam-ad-surgunu-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/tam-zincir.ts` | `child_process` `path` |
| `backend/test/uc-kapisi-davranis-test.ts` | `path` `@nestjs/core` `@prisma/client` `../src/altyapi/auth/guards/tier.guard` `../src/ozellik/odeme/abonelik/erisim.guard` `../src/ozellik/odeme/abonelik/erisim.servisi` `./yardimci/uc-envanteri` `reflect-metadata` |
| `backend/test/uc-kapisi.ts` | `path` |
| `backend/test/urun-degil-test.ts` | `../src/ozellik/eslestirme/matching/index/line-parser` |
| `backend/test/varyant-surukleme-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` |
| `backend/test/yardimci/sahte-oidc-saglayici.ts` | `node:crypto` `jsonwebtoken` `../../src/altyapi/auth/kurumsal/oidc-istemci` |
| `backend/test/yardimci/uc-envanteri.ts` | `typescript` `fs` `path` |
| `backend/test/yuzey-genisletme-test.ts` | `../src/ozellik/eslestirme/matching/index/product-index` `../src/ozellik/eslestirme/matching/index/line-parser` `../src/ozellik/eslestirme/matching/index/query-engine` `../src/ozellik/fiyat/matching/index/outcome-mapper` `../src/ozellik/eslestirme/matching/index/types` |
| `frontend/app/(protected)/abonelik/donus/page.tsx` | `react` `next/link` `@/ortak/lib/api` `@/ortak/contexts/CapabilitiesContext` |
| `frontend/app/(protected)/abonelik/page.tsx` | `react` `@/ortak/lib/api` `@/ozellik/odeme/paket-bicim` `@/ozellik/odeme/DenemeSatiri` `@/ozellik/firma/ekip/koltuk-metinleri` `@/ozellik/odeme/abonelik-ozeti` `@/ozellik/odeme/IyzicoFormu` |
| `frontend/app/(protected)/dashboard/page.tsx` | `react` `next/navigation` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/contexts/CapabilitiesContext` `@/ortak/kabuk/components/dashboard/QuickStart` `@/ozellik/teklif/dashboard/RecentQuotes` `@/ortak/kabuk/components/dashboard/QuickAccess` |
| `frontend/app/(protected)/dwg-workspace/page.tsx` | `next/navigation` `next/dynamic` `lucide-react` `next/link` `@/components/dwg-metraj/types` `@/ortak/contexts/CapabilitiesContext` `@/ozellik/odeme/dwg-kapisi` |
| `frontend/app/(protected)/firma/ekip/kurumsal-giris/page.tsx` | `react` `next/link` `next/navigation` `@/ortak/lib/api` `@/ortak/lib/kimlik-hata-metinleri` `@/ozellik/kimlik/kurumsal-baslat` |
| `frontend/app/(protected)/firma/ekip/page.tsx` | `react` `@/ortak/lib/api` `@/ortak/lib/kimlik-hata-metinleri` `@/ozellik/firma/ekip/koltuk-metinleri` `@/ozellik/firma/ekip/kisi-metinleri` |
| `frontend/app/(protected)/koltuk-durduruldu/page.tsx` | `react` `next/navigation` `@/ortak/lib/api` `@/ozellik/kimlik/verileri-indir` `@/ortak/hooks/use-toast` |
| `frontend/app/(protected)/labor-firms/[firmaId]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/kutuphane/library/InlineFirmEntry` `@/ozellik/tablo/excel-grid/types` `@/ozellik/fiyat/sayi-alani` |
| `frontend/app/(protected)/labor-firms/page.tsx` | `react` `next/link` `next/navigation` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/ui/input` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ortak/contexts/CapabilitiesContext` |
| `frontend/app/(protected)/labor/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ortak/lib/utils` `@/ozellik/fiyat/sayi-alani` `@/ozellik/kutuphane/iscilik-katalog-adresi` |
| `frontend/app/(protected)/layout.tsx` | `@/ortak/kabuk/components/layout/Altbilgi` `react` `next/navigation` `next/link` `@/ortak/contexts/CapabilitiesContext` `@/ozellik/odeme/AbonelikSeridi` `@/ortak/kabuk/components/layout/EpostaDogrulamaSeridi` `@/ortak/kabuk/components/layout/KapaliHesapSeridi` `@/ortak/kabuk/components/layout/Sidebar` `@/ortak/kabuk/components/layout/Breadcrumb` `@/ortak/lib/oturum` |
| `frontend/app/(protected)/library/brand/[brandId]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/types` `@/ozellik/fiyat/sayi-alani` |
| `frontend/app/(protected)/library/electrical-brands/page.tsx` | `react` `next/link` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/ui/dialog` `@/ortak/ui/select` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ozellik/fiyat/sayi-alani` |
| `frontend/app/(protected)/library/mechanical-brands/page.tsx` | `react` `next/link` `next/navigation` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/ui/dialog` `@/ortak/ui/select` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ozellik/kutuphane/library/ManualBrandModal` |
| `frontend/app/(protected)/library/page.tsx` | `react` `next/link` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/card` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ortak/lib/api` `@/ozellik/fiyat/pricing` `@/ozellik/fiyat/sayi-alani` |
| `frontend/app/(protected)/materials/[brandId]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/lib/silme-onay-metni` `@/lib/silme-etkisi-getir` `@/ortak/lib/utils` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/SheetTabs` `@/ozellik/tablo/excel-grid/types` |
| `frontend/app/(protected)/materials/electrical/page.tsx` | `react` `next/link` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/ui/dialog` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/lib/silme-onay-metni` `@/lib/silme-etkisi-getir` `@/ozellik/kutuphane/hata-metni` |
| `frontend/app/(protected)/materials/mechanical/page.tsx` | `react` `next/link` `lucide-react` `@/ortak/ui/card` `@/ortak/ui/geri-butonu` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/ui/dialog` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/lib/silme-onay-metni` `@/lib/silme-etkisi-getir` `@/ozellik/kutuphane/hata-metni` |
| `frontend/app/(protected)/materials/page.tsx` | `react` `next/navigation` `lucide-react` |
| `frontend/app/(protected)/profile/page.tsx` | `react` `next/navigation` `@/ortak/ui/button` `@/ortak/ui/parola-alani` `@/ortak/lib/oturum` `@/ozellik/kimlik/IkiAdimliGirisKarti` `@/ozellik/kimlik/SirketHesabiKarti` `@/ozellik/kimlik/kapatma-onizleme-getir` `@/ortak/lib/api` `@/ortak/lib/utils` `@/ortak/contexts/CapabilitiesContext` `@/ozellik/odeme/abonelik-ozeti` `@/ortak/hooks/use-toast` `@/ozellik/teklif/ceviri-kota` `@/ozellik/odeme/paket-bicim` `@/ortak/lib/parola-kurali` |
| `frontend/app/(protected)/quote-formats/page.tsx` | `react` `next/link` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` |
| `frontend/app/(protected)/quotes/[id]/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/lib/utils` `@/ozellik/teklif/ceviri` `@/ozellik/teklif/ceviri-duzeltme` `@/ozellik/teklif/CeviriDuzeltmeDialog` `@/ozellik/teklif/ceviri-akisi` `@/ozellik/teklif/ceviri-kota` `@/ozellik/teklif/teklif-dil-karari` `@/ortak/hooks/use-confirm` `@/ozellik/teklif/taslak` `@/ozellik/cikti/export-download` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/SheetTabs` `@/ozellik/tablo/excel-grid/types` `@/ozellik/fiyat/use-currency` `@/ortak/contexts/CapabilitiesContext` `@/ozellik/tablo/disiplin` `@/ortak/types/quotes` `@/ortak/types` `@/ozellik/teklif/durum` `@/ortak/kabuk/components/layout/kirinti-etiketi` |
| `frontend/app/(protected)/quotes/new/page.tsx` | `react` `next/navigation` `next/link` `@/ortak/ui/button` `@/ozellik/tablo/disiplin` `@/ortak/ui/card` `@/ortak/ui/input` `@/ortak/ui/label` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ortak/lib/utils` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/satir-terfi` `@/ozellik/tablo/excel-grid/SheetTabs` `@/ozellik/tablo/quotes/ColumnManagerPanel` `@/ozellik/tablo/excel-grid/types` `@/ortak/contexts/CapabilitiesContext` `@/components/dwg-metraj/types` `@/components/dwg-metraj/MetrajEditor` `@/ozellik/tablo/parse-material-text` `@/ozellik/tablo/merge-multisheet` `@/ozellik/giris/kaynak-kolon` `@/lib/indeks-sagligi` `@/ozellik/teklif/dwg-teklif-sema` `@/ozellik/teklif/teklif-kalem` `@/ozellik/teklif/restore-rematch` `@/ozellik/teklif/taslak` `@/ozellik/teklif/ceviri` `@/ozellik/teklif/ceviri-duzeltme` `@/ozellik/teklif/CeviriDuzeltmeDialog` `@/ozellik/teklif/ceviri-akisi` `@/ozellik/teklif/ceviri-kota` `@/ozellik/fiyat/sayi-alani` `@/ozellik/fiyat/pricing` `@/ortak/types` `@/ozellik/fiyat/use-currency` |
| `frontend/app/(protected)/quotes/page.tsx` | `react` `next/navigation` `next/link` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/geri-butonu` `@/ortak/ui/card` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ortak/ui/badge` `@/ozellik/teklif/durum` |
| `frontend/app/admin/brands/page.tsx` | `react` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/lib/silme-onay-metni` `@/lib/silme-etkisi-getir` `@/ozellik/kutuphane/oksuz-kutuphane-uyarisi` `@/ozellik/fiyat/sayi-alani` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/badge` `@/ortak/ui/card` |
| `frontend/app/admin/denetim/page.tsx` | `react` `next/navigation` `next/link` `@/ortak/lib/api` `@/ortak/ui/input` `@/ortak/ui/button` `@/ortak/ui/badge` `@/ortak/ui/card` |
| `frontend/app/admin/layout.tsx` | `@/ortak/kabuk/components/layout/Altbilgi` `react` `next/navigation` `@/ozellik/kutuphane/admin/AdminSidebar` |
| `frontend/app/admin/page.tsx` | `react` `next/navigation` |
| `frontend/app/admin/stats/page.tsx` | `react` `@/ortak/ui/button` `@/ortak/ui/badge` `@/ortak/ui/card` `@/ozellik/kutuphane/ai-butce` |
| `frontend/app/admin/users/page.tsx` | `react` `next/link` `@/ortak/lib/api` `@/ortak/ui/input` `@/ortak/ui/button` `@/ortak/ui/badge` `@/ortak/ui/card` `@/ortak/hooks/use-confirm` `@/ortak/hooks/use-toast` `@/ozellik/odeme/paket-bicim` |
| `frontend/app/cerez-politikasi/page.tsx` | `next` `@/ozellik/hukuki/HukukiSayfa` `@/ozellik/hukuki/metinler` |
| `frontend/app/davet-kabul/page.tsx` | `react` `next/navigation` `@/ortak/lib/api` `@/ozellik/kimlik/kurumsal-baslat` `@/ortak/lib/oturum` `@/ozellik/kimlik/GirisDaliEkrani` `@/ortak/lib/kimlik-hata-metinleri` `@/ortak/ui/parola-alani` `@/ortak/lib/parola-kurali` |
| `frontend/app/dev/grid-test/page.tsx` | `react` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/types` |
| `frontend/app/fiyatlar/page.tsx` | `next` `next/link` `@/ortak/kabuk/components/layout/Altbilgi` `@/ozellik/odeme/FiyatKartlari` `@/ortak/seo/arama-paylasim` |
| `frontend/app/forgot-password/page.tsx` | `react` `@/ortak/lib/api` `@/ortak/ui/kimlik-kabugu` |
| `frontend/app/gizlilik/page.tsx` | `next` `@/ozellik/hukuki/HukukiSayfa` `@/ozellik/hukuki/metinler` |
| `frontend/app/hakkimizda/page.tsx` | `next` `next/link` `@/ozellik/kurumsal/KurumsalSayfa` `@/ozellik/kurumsal/sayfalar` |
| `frontend/app/iletisim/page.tsx` | `next` `next/link` `@/ozellik/kurumsal/KurumsalSayfa` `@/ozellik/kurumsal/sayfalar` `@/ozellik/hukuki/metinler` |
| `frontend/app/kullanim-kosullari/page.tsx` | `next` `@/ozellik/hukuki/HukukiSayfa` `@/ozellik/hukuki/metinler` |
| `frontend/app/layout.tsx` | `next` `next/font/google` `@/ortak/ui/toaster` `@/ortak/ui/confirm-dialog` `@/ortak/kabuk/components/layout/DepolamaSeridi` `@/ortak/seo/arama-paylasim` `./globals.css` |
| `frontend/app/login/page.tsx` | `react` `next/navigation` `next/link` `@/ortak/lib/oturum` `@/ozellik/kimlik/GirisDaliEkrani` `@/ortak/lib/api` `@/ortak/ui/parola-alani` `@/ortak/hooks/use-toast` `@/ortak/lib/kimlik-hata-metinleri` |
| `frontend/app/mesafeli-satis/page.tsx` | `next` `@/ozellik/hukuki/HukukiSayfa` `@/ozellik/hukuki/metinler` |
| `frontend/app/page.tsx` | `@/ortak/kabuk/components/layout/Altbilgi` `next/link` `lucide-react` `@/ortak/kabuk/components/landing/GirisliyseYonlendir` `@/ortak/kabuk/components/landing/NasilCalisir` `@/ortak/kabuk/components/landing/TelefonMenusu` `@/ortak/seo/arama-paylasim` |
| `frontend/app/register/page.tsx` | `react` `next/navigation` `next/link` `@/ortak/lib/oturum` `@/ozellik/kimlik/GirisDaliEkrani` `@/ozellik/kimlik/DogrulamaBekleniyorEkrani` `@/ortak/lib/api` `@/ortak/ui/parola-alani` `@/ortak/lib/parola-kurali` `@/ortak/hooks/use-toast` |
| `frontend/app/reset-password/page.tsx` | `react` `next/navigation` `@/ortak/lib/api` `@/ortak/ui/parola-alani` `@/ortak/ui/kimlik-kabugu` `@/ortak/lib/parola-kurali` |
| `frontend/app/robots.ts` | `@/ortak/seo/arama-paylasim` |
| `frontend/app/sitemap.ts` | `@/ortak/seo/arama-paylasim` |
| `frontend/app/sso/tamam/page.tsx` | `react` `next/navigation` `next/link` `@/ortak/lib/api` `@/ortak/lib/oturum` `@/ortak/lib/kimlik-hata-metinleri` `@/ozellik/kimlik/kurumsal-baslat` `@/ozellik/kimlik/MfaKodAdimi` |
| `frontend/app/verify-email/page.tsx` | `react` `next/link` `@/ortak/lib/api` `@/ortak/ui/kimlik-kabugu` |
| `frontend/components/dwg-diameter-engine/DiameterLegendPanel.tsx` | `react` `lucide-react` `@/components/dwg-metraj/diameter-colors` `./types` |
| `frontend/components/dwg-diameter-engine/types.ts` | `@/components/dwg-metraj/types` `@/components/dwg-workspace/types` `@/components/dwg-metraj/diameter-colors` `@/components/dwg-metraj/constants` |
| `frontend/components/dwg-diameter-engine/useLayerCalc.ts` | `react` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/components/dwg-metraj` `@/components/dwg-workspace/types` `./types` |
| `frontend/components/dwg-diameter-engine/useOriginalColorState.ts` | `react` |
| `frontend/components/dwg-metraj/DiameterEditPopup.tsx` | `react` `lucide-react` `./types` `./diameter-colors` |
| `frontend/components/dwg-metraj/DwgUploader.tsx` | `react` `lucide-react` `@/ortak/lib/utils` `@/ortak/hooks/use-toast` `@/ortak/lib/api` `./types` `./unit-detection` `@/components/dwg-workspace` |
| `frontend/components/dwg-metraj/MetrajEditor.tsx` | `react` `lucide-react` `@/ortak/lib/utils` `@/ortak/hooks/use-toast` `@/ozellik/fiyat/sayi-alani` `./types` |
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
| `frontend/lib/metraj-excel.ts` | `../ozellik/fiyat/sayi-alani` |
| `frontend/lib/ondalik-kurali.test.ts` | `vitest` |
| `frontend/lib/parse-material-text.test.ts` | `vitest` `../ozellik/tablo/parse-material-text` |
| `frontend/lib/popup-secici-sozlesmesi.test.ts` | `vitest` `fs` `path` |
| `frontend/lib/pricing.test.ts` | `vitest` `../ozellik/fiyat/pricing` |
| `frontend/lib/sayfa-toplamlari.test.ts` | `vitest` `fs` `path` |
| `frontend/lib/sayi-ayristirma.test.ts` | `vitest` `fs` `path` `../test/e2e-golden/sayi-ayristirma.mjs` |
| `frontend/lib/silme-etkisi-getir.ts` | `@/ortak/lib/api` `./silme-onay-metni` |
| `frontend/lib/silme-onay-metni.test.ts` | `vitest` `./silme-onay-metni` |
| `frontend/next.config.js` | `@cloudflare/next-on-pages/next-dev` |
| `frontend/ortak/contexts/CapabilitiesContext.tsx` | `react` `@/ortak/lib/api` `@/ozellik/odeme/erisim-durumu` |
| `frontend/ortak/hooks/onay-secenekleri.test.ts` | `vitest` `fs` `path` |
| `frontend/ortak/hooks/use-confirm.ts` | `react` |
| `frontend/ortak/hooks/use-toast.ts` | `react` `@/ortak/ui/toast` |
| `frontend/ortak/kabuk/components/dashboard/QuickAccess.tsx` | `next/link` `lucide-react` |
| `frontend/ortak/kabuk/components/dashboard/QuickStart.tsx` | `react` `next/link` `lucide-react` `@/ortak/lib/utils` `@/ortak/hooks/use-toast` `./dosya-turu` `@/ortak/contexts/CapabilitiesContext` |
| `frontend/ortak/kabuk/components/dashboard/dosya-turu.test.ts` | `vitest` `./dosya-turu` |
| `frontend/ortak/kabuk/components/landing/GirisliyseYonlendir.tsx` | `react` `next/navigation` |
| `frontend/ortak/kabuk/components/landing/NasilCalisir.tsx` | `react` `./nasil-calisir.css` |
| `frontend/ortak/kabuk/components/landing/TelefonMenusu.tsx` | `next/link` |
| `frontend/ortak/kabuk/components/landing/nasil-calisir-yukleme.test.ts` | `node:fs` `node:path` `typescript` `vitest` |
| `frontend/ortak/kabuk/components/landing/telefon-menusu.test.ts` | `node:fs` `node:path` `react` `react-dom/server` `typescript` `vitest` `./TelefonMenusu` |
| `frontend/ortak/kabuk/components/layout/Altbilgi.tsx` | `next/link` `@/ozellik/hukuki/metinler` `@/ozellik/kurumsal/sayfalar` |
| `frontend/ortak/kabuk/components/layout/Breadcrumb.tsx` | `next/navigation` `next/link` `lucide-react` `./kirinti-etiketi` |
| `frontend/ortak/kabuk/components/layout/DepolamaSeridi.tsx` | `react` `next/link` |
| `frontend/ortak/kabuk/components/layout/EpostaDogrulamaSeridi.tsx` | `react` `lucide-react` `@/ortak/lib/api` `@/ortak/contexts/CapabilitiesContext` |
| `frontend/ortak/kabuk/components/layout/KapaliHesapSeridi.tsx` | `react` `lucide-react` `@/ortak/contexts/CapabilitiesContext` `@/ozellik/kimlik/verileri-indir` `@/ortak/hooks/use-toast` |
| `frontend/ortak/kabuk/components/layout/Sidebar.tsx` | `next/navigation` `next/link` `@/ortak/lib/utils` `@/ozellik/odeme/paket-bicim` |
| `frontend/ortak/kabuk/components/layout/kirinti-etiketi.ts` | `react` |
| `frontend/ortak/lib/api-401-kapsami.test.ts` | `vitest` |
| `frontend/ortak/lib/api.ts` | `axios` |
| `frontend/ortak/lib/oturum.test.ts` | `vitest` `node:fs` `node:path` `./oturum` |
| `frontend/ortak/lib/utils.ts` | `clsx` `tailwind-merge` |
| `frontend/ortak/seo/arama-paylasim.test.ts` | `node:fs` `node:path` `typescript` `vitest` |
| `frontend/ortak/seo/arama-paylasim.ts` | `next` |
| `frontend/ortak/types/quotes.ts` | `./index` |
| `frontend/ortak/ui/badge.tsx` | `react` `class-variance-authority` `@/ortak/lib/utils` |
| `frontend/ortak/ui/button.tsx` | `react` `@radix-ui/react-slot` `class-variance-authority` `@/ortak/lib/utils` |
| `frontend/ortak/ui/card.tsx` | `react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/confirm-dialog.tsx` | `react` `lucide-react` `@/ortak/hooks/use-confirm` `@/ortak/lib/utils` |
| `frontend/ortak/ui/dialog.tsx` | `react` `@radix-ui/react-dialog` `lucide-react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/geri-butonu.tsx` | `next/link` `next/navigation` `lucide-react` |
| `frontend/ortak/ui/input.tsx` | `react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/kimlik-kabugu.tsx` | `next/link` |
| `frontend/ortak/ui/label.tsx` | `react` `@radix-ui/react-label` `class-variance-authority` `@/ortak/lib/utils` |
| `frontend/ortak/ui/parola-alani.tsx` | `react` `lucide-react` |
| `frontend/ortak/ui/select.tsx` | `react` `@radix-ui/react-select` `lucide-react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/table.tsx` | `react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/toast.tsx` | `react` `@radix-ui/react-toast` `class-variance-authority` `lucide-react` `@/ortak/lib/utils` |
| `frontend/ortak/ui/toaster.tsx` | `@/ortak/hooks/use-toast` |
| `frontend/ozellik/cikti/export-download.test.ts` | `vitest` `node:fs` `node:path` `./indirme-hatasi` |
| `frontend/ozellik/cikti/export-download.ts` | `@/ortak/lib/api` `@/ortak/hooks/use-toast` `./indirme-hatasi` |
| `frontend/ozellik/cikti/indirme-hatasi.ts` | `../teklif/ceviri-kota` |
| `frontend/ozellik/firma/ekip/ekip-ekranlari.test.ts` | `vitest` `node:fs` `node:path` `./koltuk-metinleri` |
| `frontend/ozellik/firma/ekip/kisi-metinleri.test.ts` | `vitest` `node:fs` `node:path` `./kisi-metinleri` |
| `frontend/ozellik/fiyat/fitting-hesap.test.ts` | `vitest` |
| `frontend/ozellik/fiyat/gosterim-dili.test.ts` | `vitest` `./sayi-alani` `./pricing` |
| `frontend/ozellik/fiyat/hesap-sinirlari.test.ts` | `vitest` |
| `frontend/ozellik/fiyat/ikiz-suzgec-kapilari.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/ozellik/fiyat/kar-tek-suzgec.test.ts` | `vitest` `fs` `path` |
| `frontend/ozellik/fiyat/kur-geri-dusus.test.ts` | `vitest` `fs` `path` `./para-gosterim` |
| `frontend/ozellik/fiyat/para-gosterim.ts` | `@/ortak/types/quotes` |
| `frontend/ozellik/fiyat/pricing.ts` | `./sayi-alani` |
| `frontend/ozellik/fiyat/sayi-kurali.test.ts` | `vitest` |
| `frontend/ozellik/fiyat/sayi-oku.test.ts` | `vitest` `./sayi-alani` |
| `frontend/ozellik/fiyat/sayi-tek-suzgec.test.ts` | `vitest` `fs` `path` |
| `frontend/ozellik/fiyat/sayi-yollari.test.ts` | `vitest` `fs` `path` `./pricing` `../tablo/excel-grid/discount-utils` `../tablo/excel-grid/yapistir` |
| `frontend/ozellik/fiyat/use-currency.ts` | `react` `@/ortak/lib/api` `@/ortak/types/quotes` `./para-gosterim` |
| `frontend/ozellik/hukuki/HukukiSayfa.tsx` | `next/link` `@/ortak/kabuk/components/layout/Altbilgi` `./metinler` |
| `frontend/ozellik/hukuki/metinler.ts` | `../kimlik/kapatma-metinleri` |
| `frontend/ozellik/hukuki/satici-metin.test.ts` | `vitest` `../kimlik/kapatma-metinleri` `node:fs` `node:path` |
| `frontend/ozellik/kimlik/DogrulamaBekleniyorEkrani.tsx` | `react` `lucide-react` `@/ortak/lib/api` |
| `frontend/ozellik/kimlik/GirisDaliEkrani.tsx` | `@/ortak/lib/oturum` `./MfaKodAdimi` `./ZorunluKurulumSihirbazi` |
| `frontend/ozellik/kimlik/IkiAdimliGirisKarti.tsx` | `react` `lucide-react` `@/ortak/lib/api` `@/ortak/lib/kimlik-hata-metinleri` `./KurulumAnahtari` `./KurtarmaKodlariEkrani` |
| `frontend/ozellik/kimlik/KurtarmaKodlariEkrani.tsx` | `react` |
| `frontend/ozellik/kimlik/MfaKodAdimi.tsx` | `react` `@/ortak/lib/api` `@/ortak/lib/kimlik-hata-metinleri` |
| `frontend/ozellik/kimlik/SirketHesabiKarti.tsx` | `react` `@/ortak/lib/api` `@/ortak/lib/kimlik-hata-metinleri` `@/ozellik/kimlik/kurumsal-baslat` |
| `frontend/ozellik/kimlik/ZorunluKurulumSihirbazi.tsx` | `react` `@/ortak/lib/api` `@/ortak/lib/kimlik-hata-metinleri` `./KurulumAnahtari` `./KurtarmaKodlariEkrani` |
| `frontend/ozellik/kimlik/dogrulama-bekleniyor.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/ozellik/kimlik/giris-dali.test.ts` | `vitest` `fs` `path` `../../ortak/lib/oturum` `./KurulumAnahtari` |
| `frontend/ozellik/kimlik/kapali-hesap-akisi.test.ts` | `vitest` `node:fs` `node:path` `../../ortak/lib/oturum` `../../ortak/kabuk/components/layout/kapali-durum` |
| `frontend/ozellik/kimlik/kapatma-metinleri.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/ozellik/kimlik/kapatma-onizleme-getir.ts` | `@/ortak/lib/api` `./kapatma-metinleri` |
| `frontend/ozellik/kimlik/kurumsal-baslat.ts` | `@/ortak/lib/api` |
| `frontend/ozellik/kimlik/kurumsal-giris.test.ts` | `vitest` `fs` `path` `node:crypto` |
| `frontend/ozellik/kimlik/verileri-indir.test.ts` | `vitest` `fs` `path` |
| `frontend/ozellik/kurumsal/KurumsalSayfa.tsx` | `next/link` `@/ortak/kabuk/components/layout/Altbilgi` `./sayfalar` |
| `frontend/ozellik/kurumsal/kurumsal-sayfalar.test.ts` | `vitest` `node:fs` `node:path` `../hukuki/metinler` |
| `frontend/ozellik/kurumsal/sayfalar.ts` | `../hukuki/metinler` |
| `frontend/ozellik/kutuphane/admin-stats.ts` | `@/ortak/lib/api` |
| `frontend/ozellik/kutuphane/admin/AdminSidebar.tsx` | `next/link` `next/navigation` `lucide-react` `@/ortak/lib/utils` |
| `frontend/ozellik/kutuphane/ai-butce.test.ts` | `vitest` `./ai-butce` |
| `frontend/ozellik/kutuphane/hata-metni.test.ts` | `vitest` `fs` `path` `./hata-metni` |
| `frontend/ozellik/kutuphane/iscilik-katalog-adresi.test.ts` | `vitest` `node:fs` `node:path` `./iscilik-katalog-adresi` |
| `frontend/ozellik/kutuphane/library/InlineFirmEntry.tsx` | `react` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/types` `@/ozellik/fiyat/sayi-alani` |
| `frontend/ozellik/kutuphane/library/ManualBrandModal.tsx` | `react` `lucide-react` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `@/ozellik/tablo/excel-grid/ExcelGrid` `@/ozellik/tablo/excel-grid/types` `@/ozellik/fiyat/sayi-alani` |
| `frontend/ozellik/kutuphane/oksuz-kutuphane-uyarisi.test.ts` | `vitest` `fs` `path` `./oksuz-kutuphane-uyarisi` |
| `frontend/ozellik/odeme/AbonelikSeridi.tsx` | `next/link` `@/ortak/contexts/CapabilitiesContext` `./erisim-durumu` |
| `frontend/ozellik/odeme/DenemeSatiri.tsx` | `./paket-bicim` |
| `frontend/ozellik/odeme/FiyatKartlari.tsx` | `react` `next/link` `@/ortak/lib/api` `./paket-bicim` |
| `frontend/ozellik/odeme/IyzicoFormu.tsx` | `react` `./iyzico-form` |
| `frontend/ozellik/odeme/abonelik-ozeti.test.ts` | `vitest` `node:fs` `node:path` `typescript` `../teklif/ceviri-kota` |
| `frontend/ozellik/odeme/abonelik-ozeti.ts` | `./erisim-durumu` `../teklif/ceviri-kota` |
| `frontend/ozellik/odeme/deneme-satiri.test.ts` | `node:fs` `node:path` `react` `react-dom/server` `typescript` `vitest` `./DenemeSatiri` |
| `frontend/ozellik/odeme/dwg-kapisi.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/ozellik/odeme/erisim-durumu.test.ts` | `vitest` `./paket-bicim` |
| `frontend/ozellik/odeme/fatura-kimligi.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/ozellik/odeme/fatura-kimligi.ts` | `./telefon-bicim` |
| `frontend/ozellik/odeme/fiyat-sayfasi.test.ts` | `node:fs` `node:path` `typescript` `vitest` |
| `frontend/ozellik/odeme/gorunen-paket-adi.test.ts` | `vitest` `node:fs` `node:path` `./paket-bicim` |
| `frontend/ozellik/odeme/iyzico-form.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/ozellik/odeme/ozellik-kapisi.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/ozellik/odeme/paket-bicim.test.ts` | `vitest` `./paket-bicim` |
| `frontend/ozellik/odeme/paket-rozeti.test.ts` | `vitest` `node:fs` `node:path` `./paket-bicim` |
| `frontend/ozellik/odeme/sozlesme-onayi.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/ozellik/odeme/telefon-bicim.test.ts` | `vitest` `node:fs` `node:path` `./fatura-kimligi` |
| `frontend/ozellik/odeme/turkce-metin.test.ts` | `node:fs` `node:path` `typescript` `vitest` `./fatura-kimligi` `./telefon-bicim` `./dwg-kapisi` `./paket-bicim` |
| `frontend/ozellik/tablo/excel-grid/CustomDropdown.tsx` | `react` `react-dom` |
| `frontend/ozellik/tablo/excel-grid/ExcelGrid.tsx` | `react` `react-dom` `ag-grid-react` `ag-grid-community` `./types` `./oneri-cekince` `./useFillHandle` `./discount-utils` `./CustomDropdown` `./fill-down` `./yapistir` `./kopyala` `./isaret` `@/ozellik/tablo/parse-material-text` `@/ozellik/fiyat/pricing` `./satir-terfi` `@/ozellik/fiyat/sayi-alani` `@/ozellik/fiyat/para-sutun-genisligi` `./build-material-context` `./aday-ayirt-edicilik` `@/ortak/lib/api` `@/ortak/hooks/use-toast` `@/ortak/hooks/use-confirm` `ag-grid-community/styles/ag-grid.css` `ag-grid-community/styles/ag-theme-alpine.css` `./fill-handle.css` |
| `frontend/ozellik/tablo/excel-grid/SheetTabs.tsx` | `react` |
| `frontend/ozellik/tablo/excel-grid/aday-ayirt-edicilik.test.ts` | `vitest` `node:fs` `node:path` |
| `frontend/ozellik/tablo/excel-grid/build-material-context.test.ts` | `vitest` `./build-material-context` |
| `frontend/ozellik/tablo/excel-grid/cap-sorguda.test.ts` | `vitest` `fs` `path` |
| `frontend/ozellik/tablo/excel-grid/discount-utils.test.ts` | `vitest` `./discount-utils` |
| `frontend/ozellik/tablo/excel-grid/discount-utils.ts` | `../../fiyat/sayi-alani` |
| `frontend/ozellik/tablo/excel-grid/fill-down.test.ts` | `vitest` `./fill-down` |
| `frontend/ozellik/tablo/excel-grid/fill-down.ts` | `../../fiyat/pricing` `../../fiyat/sayi-alani` |
| `frontend/ozellik/tablo/excel-grid/fitting.test.ts` | `vitest` `./yapistir` |
| `frontend/ozellik/tablo/excel-grid/fitting.ts` | `../../fiyat/pricing` |
| `frontend/ozellik/tablo/excel-grid/gosterim-baglantisi.test.ts` | `vitest` `fs` `path` |
| `frontend/ozellik/tablo/excel-grid/grup-iskonto-girisi.test.ts` | `vitest` `fs` `path` |
| `frontend/ozellik/tablo/excel-grid/isaret.test.ts` | `vitest` `fs` `path` `./isaret` |
| `frontend/ozellik/tablo/excel-grid/isaret.ts` | `../../fiyat/sayi-alani` `../../fiyat/pricing` |
| `frontend/ozellik/tablo/excel-grid/kar-yayilimi.test.ts` | `vitest` `./fill-down` `../../fiyat/pricing` |
| `frontend/ozellik/tablo/excel-grid/kopyala.test.ts` | `vitest` `./kopyala` `./yapistir` `../../fiyat/sayi-alani` |
| `frontend/ozellik/tablo/excel-grid/oneri-cekince.test.ts` | `vitest` `fs` `path` |
| `frontend/ozellik/tablo/excel-grid/satir-terfi.test.ts` | `vitest` `./satir-terfi` |
| `frontend/ozellik/tablo/excel-grid/useFillHandle.tsx` | `react` `ag-grid-react` `ag-grid-community` `./types` |
| `frontend/ozellik/tablo/excel-grid/yapistir.test.ts` | `vitest` `./yapistir` `../../../test/e2e-golden/sayi-ayristirma.mjs` |
| `frontend/ozellik/tablo/excel-grid/yapistir.ts` | `../../fiyat/sayi-alani` |
| `frontend/ozellik/tablo/merge-multisheet.ts` | `../fiyat/sayi-alani` |
| `frontend/ozellik/tablo/quotes/ColumnManagerPanel.tsx` | `react` `lucide-react` |
| `frontend/ozellik/teklif/CeviriDuzeltmeDialog.tsx` | `react` `@/ortak/ui/dialog` `@/ortak/ui/button` `@/ortak/ui/input` `@/ortak/ui/label` |
| `frontend/ozellik/teklif/ceviri-akisi.test.ts` | `vitest` `node:fs` `node:path` `./ceviri-akisi` |
| `frontend/ozellik/teklif/ceviri-akisi.ts` | `./ceviri` |
| `frontend/ozellik/teklif/ceviri-duzeltme.test.ts` | `vitest` `node:fs` `node:path` `./ceviri-duzeltme` |
| `frontend/ozellik/teklif/ceviri-duzeltme.ts` | `./ceviri-kota` |
| `frontend/ozellik/teklif/ceviri-kota.ts` | `../odeme/paket-bicim` |
| `frontend/ozellik/teklif/ceviri.test.ts` | `vitest` `node:fs` `node:path` `../tablo/excel-grid/types` |
| `frontend/ozellik/teklif/ceviri.ts` | `../tablo/excel-grid/types` |
| `frontend/ozellik/teklif/dashboard/RecentQuotes.tsx` | `react` `next/link` `lucide-react` `@/ortak/lib/api` |
| `frontend/ozellik/teklif/dwg-teklif-sema.test.ts` | `vitest` |
| `frontend/ozellik/teklif/dwg-teklif-sema.ts` | `@/ozellik/tablo/excel-grid/types` |
| `frontend/ozellik/teklif/fiyatsiz-kalem-uyarisi.test.ts` | `vitest` `./teklif-kalem` |
| `frontend/ozellik/teklif/fiyatsiz-kalem-uyarisi.ts` | `./teklif-kalem` |
| `frontend/ozellik/teklif/restore-rematch.test.ts` | `vitest` `./restore-rematch` `../tablo/excel-grid/types` |
| `frontend/ozellik/teklif/restore-rematch.ts` | `../tablo/excel-grid/types` `../fiyat/sayi-alani` |
| `frontend/ozellik/teklif/taslak.test.ts` | `vitest` `./taslak` |
| `frontend/ozellik/teklif/teklif-dil-karari.test.ts` | `vitest` `./ceviri-kota` |
| `frontend/ozellik/teklif/teklif-dil-karari.ts` | `./ceviri` `./ceviri-kota` |
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
| `scripts/deploy-olcum.cjs` | `fs` |
| `scripts/harita-denetle.mjs` | `node:child_process` `node:fs` `node:path` `node:url` `./harita-uret.mjs` |
| `scripts/harita-uret.mjs` | `node:child_process` `node:fs` `node:path` `node:url` |
| `scripts/klasor-denetle.mjs` | `node:child_process` `node:fs` `node:path` `node:url` `./harita-uret.mjs` |

## 3 · Uc noktalar

| Dosya | Uc |
|---|---|
| `backend/src/altyapi/auth/auth.controller.ts` | `POST /auth/register` |
| `backend/src/altyapi/auth/auth.controller.ts` | `POST /auth/login` |
| `backend/src/altyapi/auth/auth.controller.ts` | `GET /auth/me` |
| `backend/src/altyapi/auth/auth.controller.ts` | `PATCH /auth/profil` |
| `backend/src/altyapi/auth/auth.controller.ts` | `POST /auth/forgot-password` |
| `backend/src/altyapi/auth/auth.controller.ts` | `POST /auth/reset-password` |
| `backend/src/altyapi/auth/auth.controller.ts` | `POST /auth/change-password` |
| `backend/src/altyapi/auth/auth.controller.ts` | `POST /auth/verify-email` |
| `backend/src/altyapi/auth/auth.controller.ts` | `POST /auth/resend-verification` |
| `backend/src/altyapi/auth/auth.controller.ts` | `GET /auth/hesabim/verilerim` |
| `backend/src/altyapi/auth/auth.controller.ts` | `GET /auth/hesabimi-kapat/onizleme` |
| `backend/src/altyapi/auth/auth.controller.ts` | `POST /auth/hesabimi-kapat` |
| `backend/src/altyapi/auth/kurumsal/kurumsal-giris.controller.ts` | `POST /auth/sso/kesfet` |
| `backend/src/altyapi/auth/kurumsal/kurumsal-giris.controller.ts` | `POST /auth/sso/baslat` |
| `backend/src/altyapi/auth/kurumsal/kurumsal-giris.controller.ts` | `POST /auth/sso/niyet` |
| `backend/src/altyapi/auth/kurumsal/kurumsal-giris.controller.ts` | `GET /auth/sso/donus` |
| `backend/src/altyapi/auth/kurumsal/kurumsal-giris.controller.ts` | `POST /auth/sso/degis` |
| `backend/src/altyapi/auth/kurumsal/kurumsal-giris.controller.ts` | `POST /auth/sso/katil` |
| `backend/src/altyapi/auth/kurumsal/kurumsal-giris.controller.ts` | `DELETE /auth/sso/baglanti` |
| `backend/src/altyapi/auth/mfa/mfa.controller.ts` | `POST /auth/mfa/dogrula` |
| `backend/src/altyapi/auth/mfa/mfa.controller.ts` | `POST /auth/mfa/zorunlu-kurulum/baslat` |
| `backend/src/altyapi/auth/mfa/mfa.controller.ts` | `POST /auth/mfa/zorunlu-kurulum/onayla` |
| `backend/src/altyapi/auth/mfa/mfa.controller.ts` | `POST /auth/mfa/kurulum/baslat` |
| `backend/src/altyapi/auth/mfa/mfa.controller.ts` | `POST /auth/mfa/kurulum/onayla` |
| `backend/src/altyapi/auth/mfa/mfa.controller.ts` | `POST /auth/mfa/kapat` |
| `backend/src/altyapi/auth/mfa/mfa.controller.ts` | `POST /auth/mfa/kurtarma-kodlari/yenile` |
| `backend/src/altyapi/auth/mfa/mfa.controller.ts` | `POST /auth/mfa/sirket-girisinde-de-sor` |
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
| `backend/src/ozellik/firma/davet-kabul.controller.ts` | `POST /auth/davet-bilgi` |
| `backend/src/ozellik/firma/davet-kabul.controller.ts` | `POST /auth/davet-kabul` |
| `backend/src/ozellik/firma/firma-kurumsal-giris.controller.ts` | `GET /firma/kurumsal-giris` |
| `backend/src/ozellik/firma/firma-kurumsal-giris.controller.ts` | `PUT /firma/kurumsal-giris` |
| `backend/src/ozellik/firma/firma-kurumsal-giris.controller.ts` | `POST /firma/kurumsal-giris/etkinlestir` |
| `backend/src/ozellik/firma/firma-kurumsal-giris.controller.ts` | `POST /firma/kurumsal-giris/kapat` |
| `backend/src/ozellik/firma/firma-kurumsal-giris.controller.ts` | `DELETE /firma/kurumsal-giris` |
| `backend/src/ozellik/firma/firma-kurumsal-giris.controller.ts` | `DELETE /firma/uyeler/:id/kurumsal-baglanti` |
| `backend/src/ozellik/firma/firma.controller.ts` | `GET /firma` |
| `backend/src/ozellik/firma/firma.controller.ts` | `PATCH /firma` |
| `backend/src/ozellik/firma/firma.controller.ts` | `PATCH /firma/guvenlik` |
| `backend/src/ozellik/firma/firma.controller.ts` | `POST /firma/logo` |
| `backend/src/ozellik/firma/firma.controller.ts` | `GET /firma/logo` |
| `backend/src/ozellik/firma/firma.controller.ts` | `DELETE /firma/logo` |
| `backend/src/ozellik/firma/uyelik.controller.ts` | `GET /firma/uyeler` |
| `backend/src/ozellik/firma/uyelik.controller.ts` | `POST /firma/davetler` |
| `backend/src/ozellik/firma/uyelik.controller.ts` | `POST /firma/davetler/:id/yeniden-gonder` |
| `backend/src/ozellik/firma/uyelik.controller.ts` | `DELETE /firma/davetler/:id` |
| `backend/src/ozellik/firma/uyelik.controller.ts` | `PATCH /firma/uyeler/:id/rol` |
| `backend/src/ozellik/firma/uyelik.controller.ts` | `DELETE /firma/uyeler/:id` |
| `backend/src/ozellik/fiyat/exchange-rates/exchange-rates.controller.ts` | `GET /exchange-rates` |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | `POST /ai/analyze` |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | `POST /ai/translate` |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | `GET /ai/translate/goruntule` |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | `GET /ai/translate/onizleme` |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | `GET /ai/translate/kota` |
| `backend/src/ozellik/giris/ai/ai.controller.ts` | `POST /ai/translate/correct` |
| `backend/src/ozellik/giris/ai/ceviri-duzeltme.controller.ts` | `GET /ai/translate/duzeltmeler` |
| `backend/src/ozellik/giris/ai/ceviri-duzeltme.controller.ts` | `PUT /ai/translate/duzeltmeler` |
| `backend/src/ozellik/giris/ai/ceviri-duzeltme.controller.ts` | `DELETE /ai/translate/duzeltmeler/:id` |
| `backend/src/ozellik/giris/excel-engine/excel-engine.controller.ts` | `POST /excel-engine/analyze` |
| `backend/src/ozellik/giris/excel-grid/excel-grid.controller.ts` | `POST /excel-grid/prepare` |
| `backend/src/ozellik/kutuphane/admin/admin-kurumsal-giris.controller.ts` | `POST /admin/firmalar/:firmaId/kurumsal-giris/zorunlu-kapat` |
| `backend/src/ozellik/kutuphane/admin/admin-kurumsal-giris.controller.ts` | `DELETE /admin/alan-adlari/:alanAdi` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/stats` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/ai-stats` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/ai-tasks` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `PATCH /admin/ai-tasks` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/ai-health-check` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/users` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `PATCH /admin/users/:id/role` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `PATCH /admin/users/:id/status` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `PATCH /admin/users/:id/tier` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `PATCH /admin/users/:id/firma-rol` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `POST /admin/users/:id/mfa-sifirla` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `DELETE /admin/users/:id` |
| `backend/src/ozellik/kutuphane/admin/admin.controller.ts` | `GET /admin/denetim` |
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
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | `GET /labor/:id` |
| `backend/src/ozellik/kutuphane/labor/labor.controller.ts` | `GET /labor/yonetici-katalog` |
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
| `backend/src/ozellik/odeme/abonelik/fiyat.controller.ts` | `GET /fiyatlar` |
| `backend/src/ozellik/odeme/abonelik/iyzico-donus.controller.ts` | `POST /abonelik/iyzico-donus` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `GET /yonetim/havale` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `POST /yonetim/havale/teklif` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `POST /yonetim/havale/:id/fatura` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `POST /yonetim/havale/:id/onayla` |
| `backend/src/ozellik/odeme/havale/havale.controller.ts` | `POST /yonetim/havale/:id/iptal` |
| `backend/src/ozellik/odeme/webhook/webhook.controller.ts` | `POST /webhook/iyzico/abonelik` |
| `backend/src/ozellik/panel/panel.controller.ts` | `GET /panel/ozet` |
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
| `backend/test/ceviri-duzeltme-test.ts` | `PUT /ai/translate/duzeltmeler` |
| `backend/test/ceviri-duzeltme-test.ts` | `POST /ai/translate/correct` |
| `backend/test/ceviri-duzeltme-test.ts` | `POST /ai/translate` |
| `backend/test/ceviri-gorunum-cikti-test.ts` | `GET /kukla/kapi` |
| `backend/test/ceviri-gorunum-cikti-test.ts` | `GET /kukla/tamamlanamadi` |
| `backend/test/faz7-yetki-test.ts` | `GET /:id` |
| `backend/test/guvenlik-basliklari-test.ts` | `GET /deneme` |
| `backend/test/guvenlik-basliklari-test.ts` | `GET /deneme/hata` |
| `backend/test/satinalma-yolu-test.ts` | `POST /iyzico-donus` |
| `backend/test/yardimci/uc-envanteri.ts` | `GET /x/` deseni
 *   yorum bloklarındaki örnekleri de sayıyor, sınıf düzeyi dekoratörleri
 *   metot düzeyindekilerden ayıramıyor, `@UseGuards(...` |
| `backend/test/yardimci/uc-envanteri.ts` | `GET /x/y` |
| `frontend/ozellik/kimlik/kapatma-metinleri.test.ts` | `GET /hesabimi-kapat/onizleme` |
| `frontend/ozellik/kimlik/kapatma-onizleme-getir.ts` | `GET /hesabimi-kapat/onizleme` |
| `frontend/ozellik/kutuphane/iscilik-katalog-adresi.ts` | `GET /yonetici-katalog` |

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
| `backend/package.json` | `test:ceviri-kota` | `ts-node test/ceviri-kotasi-test.ts` |
| `backend/package.json` | `test:ceviri-kota-uygulama` | `ts-node test/ceviri-kota-uygulama-test.ts` |
| `backend/package.json` | `test:ceviri-gorunum-cikti` | `ts-node test/ceviri-gorunum-cikti-test.ts` |
| `backend/package.json` | `test:ceviri-gecis` | `ts-node test/ceviri-gecis-test.ts` |
| `backend/package.json` | `test:ceviri-duzeltme` | `ts-node test/ceviri-duzeltme-test.ts` |
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
| `backend/package.json` | `test:guvenlik-paket1` | `ts-node test/guvenlik-paket1-test.ts` |
| `backend/package.json` | `test:faz2` | `ts-node test/faz2-kullanici-yonetimi-test.ts` |
| `backend/package.json` | `test:faz3` | `ts-node test/faz3-eposta-parola-test.ts` |
| `backend/package.json` | `test:faz4` | `ts-node test/faz4-firma-teklif-test.ts` |
| `backend/package.json` | `test:faz5` | `ts-node test/faz5-kvkk-hukuki-test.ts` |
| `backend/package.json` | `test:sunucu` | `ts-node test/sunucu-urunleri-test.ts` |
| `backend/package.json` | `test:sir-dondur` | `ts-node test/sir-dondur-kapsam-test.ts` |
| `backend/package.json` | `test:hesap` | `ts-node test/hesap-dogrulugu-test.ts` |
| `backend/package.json` | `test:antet` | `ts-node test/antet-test.ts` |
| `backend/package.json` | `test:imza` | `ts-node test/imza-ekseni-test.ts` |
| `backend/package.json` | `test:oneri` | `ts-node test/oneri-kutusu-cekince-test.ts` |
| `backend/package.json` | `test:s45` | `ts-node test/s45-malzeme-aile-test.ts` |
| `backend/package.json` | `test:aile` | `ts-node test/aile-oncelik-test.ts` |
| `backend/package.json` | `test:aile-uyusmazligi` | `ts-node test/aile-uyusmazligi-test.ts` |
| `backend/package.json` | `test:kb-ad` | `ts-node test/kutuphane-ad-duzenleme-test.ts` |
| `backend/package.json` | `test:kb-fiyat` | `ts-node test/kutuphane-fiyat-donmasi-test.ts` |
| `backend/package.json` | `test:guvenlik-basliklari` | `ts-node test/guvenlik-basliklari-test.ts` |
| `backend/package.json` | `test:deploy-olcum` | `ts-node test/deploy-olcum-test.ts` |
| `backend/package.json` | `test:isc-sil` | `ts-node test/iscilik-satir-silme-test.ts` |
| `backend/package.json` | `test:kur` | `ts-node test/kur-donmasi-test.ts` |
| `backend/package.json` | `test:para-birimi-yazim` | `ts-node test/para-birimi-yazim-test.ts` |
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
| `backend/package.json` | `test:olcum-sorgu` | `ts-node test/abonelik-olcum-sorgu-test.ts` |
| `backend/package.json` | `test:satinalma` | `ts-node test/satinalma-yolu-test.ts` |
| `backend/package.json` | `test:odeme-imha` | `ts-node test/odeme-imha-test.ts` |
| `backend/package.json` | `test:fatura-kimligi` | `ts-node test/fatura-kimligi-kapisi-test.ts` |
| `backend/package.json` | `test:deneme-hakki` | `ts-node test/deneme-hakki-test.ts` |
| `backend/package.json` | `test:abonelik-erisim` | `ts-node test/abonelik-erisim-test.ts` |
| `backend/package.json` | `test:faz7-yetki` | `ts-node test/faz7-yetki-test.ts` |
| `backend/package.json` | `test:faz7-totp` | `ts-node test/faz7-totp-test.ts` |
| `backend/package.json` | `test:faz7-oidc` | `ts-node test/faz7-oidc-test.ts` |
| `backend/package.json` | `test:faz7-ekip` | `ts-node test/faz7-ekip-test.ts` |
| `backend/package.json` | `test:faz7-mfa` | `ts-node test/faz7-mfa-test.ts` |
| `backend/package.json` | `test:faz7-kurumsal` | `ts-node test/faz7-kurumsal-test.ts` |
| `backend/package.json` | `test:parola-kapisi` | `ts-node test/parola-kapisi-test.ts` |
| `backend/package.json` | `test:panel-ozet` | `ts-node test/panel-ozet-test.ts` |
| `backend/package.json` | `test:imha` | `ts-node test/imha-test.ts` |
| `backend/package.json` | `test:geri-donus` | `ts-node test/geri-donus-test.ts` |
| `backend/package.json` | `test:paket-aciklama` | `ts-node test/paket-aciklama-duzelt-test.ts` |
| `backend/package.json` | `test:uc-kapisi` | `ts-node test/uc-kapisi.ts` |
| `backend/package.json` | `test:uc-kapisi-davranis` | `ts-node test/uc-kapisi-davranis-test.ts` |
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
