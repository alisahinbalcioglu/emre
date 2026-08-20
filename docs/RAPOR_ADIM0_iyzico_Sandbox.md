# RAPOR — ADIM 0: iyzico Sandbox Ölçümü (GOREV_Odeme_Altyapisi_1.md)

**Tarih:** 20.08.2026 · **Ortam:** sandbox-api.iyzipay.com · **Araç:** iyzipay@2.0.69 (Node SDK)
· **Ölçüm betikleri:** scratchpad/iyzico-olcum/adim0-olcum.mjs + adim0-ek.mjs (repo dışı, ürün kodu değildir)

Aktivasyon: 19.08 gecesi entegrasyon@iyzico.com'a talep → 20.08 09:58 "gerekli güncellemeler
sağlanmıştır" (Doğukan Aslan, Integration Specialist). Aktivasyon ÖNCESİ ürün oluşturma denemesi
`100001 Sistem hatası` veriyordu (tutanakta) — S3'ün "varsayılan kapalı" cevabının kanıtı.

---

## S1 — Değişken tutar var mı? **HAYIR — SABİT. (18 kademeli plan gerekir)**

**a) Tanımsız alanlar sessizce yutuluyor.** `quantity: 3, itemCount: 3` ile plan oluşturma
isteği HATA VERMEDİ; yanıtta bu alanlar yok:

```json
{ "status": "success", "data": { "referenceCode": "98cb6a16-0f21-428c-994e-096df4850b34",
  "name": "QuantityDeneme mt19olnu", "price": 10, "paymentInterval": "MONTHLY",
  "paymentIntervalCount": 1, "trialPeriodDays": 0, "currencyCode": "TRY",
  "planPaymentType": "RECURRING", "status": "ACTIVE" } }
```
⚠ Ders: iyzico bilinmeyen alanı REDDETMEZ — yazım hatası sessizce kaybolur; entegrasyonda
alan adları çift kontrol edilmeli.

**b) `price` oluşturulduktan sonra DEĞİŞTİRİLEMİYOR — üstelik sessizce.** Update isteğine
`price: "149.0"` kondu; yanıt `success` döndü ama fiyat 99 kaldı (GET ile de doğrulandı):

```json
{ "status": "success", "data": { "referenceCode": "1d6bf1bf-...", "name": "Kademe-1 mt19olnu",
  "price": 99, ... } }   ← update yanıtı; 149 YOK, hata da YOK
```

**Sonuç:** adet/koltuk çarpanı yok, abonelik tek plan alır, fiyat plan başına sabittir.
"Ek kullanıcı × adet" tek abonelikte TAŞINAMAZ → **kademeli plan seti (görevdeki 18 plan
senaryosu) zorunlu.** Kullanıcı kararı: **A (kademe)** — 19.08 "eğilim", bu ölçümle kesinleşmesi bekleniyor.

---

## S2 — Plan DÜŞÜRME çalışıyor mu? **EVET (NEXT_PERIOD ile ölçüldü) — ama mimari bir sürprizle**

199 TL planda abonelik açıldı, 99 TL plana `upgradePeriod: NEXT_PERIOD` ile düşürme İSTENDİ:

```json
{ "status": "success", "data": {
  "referenceCode": "15fbd765-f21f-4257-8673-1e745761be2d",   ← YENİ abonelik referansı!
  "parentReferenceCode": "ae817e37-8dd8-4d05-a7ab-64d06e6986dd",
  "pricingPlanReferenceCode": "1d6bf1bf-...(99 TL plan)",
  "subscriptionStatus": "ACTIVE", "startDate": 1789893431301 } }  ← dönem sonunda başlar
```

**⚠ EN ÖNEMLİ ENTEGRASYON BULGUSU:** upgrade/downgrade YENİ bir `subscriptionReferenceCode`
üretir; eski abonelik `UPGRADED` durumuna düşer ve ÜZERİNDE HİÇBİR İŞLEM YAPILAMAZ
(`201402 Bu abonelik yükseltilemez`, `201403 Bu abonelik iptal edilemez` — ikisi de ölçüldü).
Zincirin sabiti `parentReferenceCode`. **ADIM 3'te DB her plan değişiminde yeni referansı
kaydetmeli; webhook eşlemesi zincir köküyle yapılmalı.**

**NOW davranışı (49.90→89.90 ile ölçüldü): PRORASYON YOK.**
- Eski aboneliğin ödenmiş dönemi ANINDA kesildi (`endDate` = şimdi), para iadesi/mahsup YOK.
- Yeni abonelik TAM 89.90'lık yeni bir aylık dönem açtı (`orders[0]: price 89.90, WAITING`).
- Yani NOW = müşteri kesişen süre için İKİ KEZ öder. **Karar: hem yükseltme hem düşürmede
  `NEXT_PERIOD` kullanılacak** (dönem sonunda geçiş; kıst sorusu hiç doğmaz).

**Aralık kısıtı (gerçek hatasıyla):** MONTHLY abonelik YEARLY plana geçirilemez:
```json
{ "status": "failure", "errorCode": "201406",
  "errorMessage": "Abonelik farklı ödeme sıklığına sahip ödeme plana yükseltilemez." }
```

---

## S3 — Abonelik özelliği sandbox'ta açık mı? **VARSAYILAN KAPALI — talep ile açıldı**

- Aktivasyon öncesi: `POST /v2/subscription/products` → `100001 Sistem hatası` (19.08 tutanağı).
- entegrasyon@iyzico.com'a talep (abonelik + webhook X-IYZ-SIGNATURE-V3 birlikte) → ertesi
  sabah açıldı. Aktivasyon sonrası aynı çağrı `success`.
- Webhook imzası da aynı taleple açtırıldı (ADIM 3'te ayrı bekleme olmayacak).

---

## Pazarlık dışı yan bulgular (ADIM 3 tasarımına girdi)

1. **Plan silme:** hiç kullanılmamış plan silinir; İPTAL edilmiş aboneliği olan plan da
   silinebildi (ölçüldü); ama upgrade ZİNCİRİNE girmiş plan silinemiyor
   (`201053 Ödeme planı silinmek için uygun değil`). Kademe modeli (A) için sorun değil;
   dinamik plan üretimi (B) çöp biriktirirdi — A kararını ölçüm de destekliyor.
2. **İptal:** yalnız zincirin AKTİF ucu iptal edilebilir; `UPGRADED` referanslar terminal.
3. Sandbox'ta NON-3D abonelik başlatma resmî test kartıyla (5528790000000008) sorunsuz;
   ilk dönem siparişi anında `SUCCESS` (paymentAttempts dolu geldi).

**Tam tutanak:** `adim0-cikti.json` (16 kayıt) + `adim0-ek-cikti.json` (14 kayıt) —
scratchpad/iyzico-olcum/ altında; her API çağrısının yanıt gövdesi birebir.

---

## ⏸ KONTROL NOKTASI

Görev gereği bu çıktı paylaşılmadan ADIM 1'e geçilmez. Bekleyen kullanıcı onayları:
1. **Ek kullanıcı modeli A kesin mi?** (S1 ölçümü kademeyi zorunlu kılıyor; B'nin plan-çöpü
   riski de ölçüldü.) Kademe fiyat rakamları ADIM 3 panel girişinden önce ayrıca sorulacak.
2. **ADIM 1'e (Clerk + Firma modeli) başlama onayı.**
