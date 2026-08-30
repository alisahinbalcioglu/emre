# PLAN — Eslestirme motorunun FIRMA kapsamina gecisi (ADIM 1 son dilim)

> Uretildi: 28.08.2026 — salt-okunur olcum turu: 6 paralel harita + her haritanin EN RISKLI
> iddiasinin cekismeli sinanmasi + sentez (kosum wf_e7a6450c-268, 13 ajan).
>
> ⚠ Plan YAZILDIGI ANDAKI kodu olcer. Uygulamadan ONCE ADIM 0 sayimlarini CANLIDA kos:
> K0.1 > 0 ise plan orada DURUR (backfill migration canlida hic kosmamis demektir).

---

## ⚠ ÖNCE: ALTI HARİTANIN ORTAK HATASI — DURUM GÜNCEL DEĞİL

Altı haritanın beşi `matching.service.ts`'i **1083 satır** ve `terminology.service.ts`'i **287 satır** olarak okumuş. Gerçek: **1127** ve **321**. Aradaki fark tam olarak planın en pahalı adımıdır ve **ZATEN YAPILMIŞ**:

| İddia (haritalar) | Gerçek (taze okuma) |
|---|---|
| "EslesmeHafizasi yazma yolu firmaId yazmıyor 0/2" | `matching.service.ts:1029-1041` **`firmaIdBul()`** var; `remember()` her iki upsert'te firmaId yazıyor — `create` (1064, 1086) **ve** `update` (1062, 1084 — eski NULL satır teyitte kendiliğinden iyileşir) |
| "TerminologyAlias yazma yolu firmaId yazmıyor 0/2" | `terminology.service.ts:207-219` `firmaIdBul()`; `learnFamilyAliases` createMany **246**; `saveUserAlias` create **285** |
| "firma-izolasyon-test eşleştirmeyi kapsamıyor" | `test/firma-izolasyon-test.ts:236-237` MatchingService+TerminologyService kuruyor; **H1, H2, T1, T2, T3** kapıları yazma köprüsünü ölçüyor; `regression-all.ts:256` `db:true` ile mühürde |
| "ikinci backfill zorunlu" | Yazma köprüsü NULL üretimini **durdurdu**; ikinci backfill hâlâ gerekli ama yalnız 28.08 ile köprü commit'i arasındaki pencere için |

**Yani plan artık "yazma tarafını taşı" ile başlamıyor.** Sıradaki iş SADECE OKUMA tarafı + kısıtlar + kimlik kapısı. Aşağıdaki her satır taze okumadan.

---

## ADIM 0 — ÖLÇÜM (kod yok, migration yok)

**Ne değişir:** Hiçbir şey. Dört SQL sayımı canlıda koşar, sonuçları plana girer.

```sql
-- K0.1 KÖK KAPI (türev değil — backfill adım 2 buna bağlı)
SELECT count(*) FILTER (WHERE "firmaId" IS NULL), count(*) FROM "User";
-- K0.2 ADIM 4'ün ön koşulu — TOPTAN risk
SELECT count(*) FILTER (WHERE "firmaId" IS NULL), count(*) FROM "UserLibrary";
-- K0.3 SESSİZ risk (köprü öncesi pencere)
SELECT count(*) FILTER (WHERE "firmaId" IS NULL AND "userId" IS NOT NULL), count(*) FROM "EslesmeHafizasi";
SELECT count(*) FILTER (WHERE "firmaId" IS NULL AND "userId" IS NOT NULL), count(*) FROM "TerminologyAlias";
-- K0.4 KISIT ÇAKIŞMASI (ADIM 5 ve 6 buna bağlı)
SELECT "firmaId", imza  FROM "EslesmeHafizasi"  WHERE "firmaId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1;
SELECT "firmaId", alias FROM "TerminologyAlias" WHERE "firmaId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1;
SELECT "firmaId", name  FROM "LaborFirm"        WHERE "firmaId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1;
```

**Hangi kapı ölçer:** Yok — bu adımın kendisi kapıdır. **K0.1 > 0 ise migration canlıda hiç koşmamış demektir; plan burada DURUR.** K0.4'ten satır dönerse ilgili adım (5/6/7) bloklanır.
**Mutasyon:** Yok.
**Risk:** yok. **Canlıda davranış:** değişmez.

---

## ADIM 1 — Yazma köprüsündeki TEK delik: `saveUserAlias` UPDATE dalı

**Ne değişir:** `terminology.service.ts:270-281` mevcut satırı güncellerken `firmaId` **yazmıyor** — yani firmaId'si NULL kalmış bir alias yeniden kaydedilse de iyileşmiyor. İkizi `matching.service.ts:1057-1062` bunu **doğru** yapıyor (yorumu bile var: *"eski (firmaId'siz) satır her teyitte KENDİLİĞİNDEN iyileşir"*). İkiz asimetrisi.

`data: {...}` bloğuna `...(await this.firmaIdBul(userId) ? { firmaId } : {})` eklenir — **null ise DOKUNULMAZ** (dolu firmaId ezilmesin, matching'deki desenin aynısı).

**Dosyalar:** `backend/src/ozellik/eslestirme/matching/terminology.service.ts` (tek dosya, ~4 satır).
**Hangi kapı ölçer:** YENİ **T4** — `test/firma-izolasyon-test.ts`, H2'nin ikizi: alias yaz → `firmaId`'yi elle NULL'a çek → `saveUserAlias` ile aynı alias'ı tekrar kaydet → `firmaId === f1.id` olmalı. (`npm run test:firma`, `regression-all.ts:256`)
**Mutasyon:** Eklenen `firmaId` yayılımını sil → T4 kırmızı, T1 **yeşil kalmalı** (T1 yalnız create yolunu ölçüyor — bu, T4'ün gerçekten yeni bir şey ölçtüğünün kanıtı).
**Risk:** düşük. **Canlıda davranış:** değişmez (yalnız NULL satır iyileşir).

---

## ADIM 2 — İkinci backfill + `UserLibrary.firmaId` NOT NULL

**Ne değişir:** İki ayrı migration, **ayrı dosya**:
- **M-A** `20260829000000_firma_backfill_2`: `20260828010000`'in 3. adımındaki üç UPDATE'i (EslesmeHafizasi / TerminologyAlias / UserLibrary) **aynen** tekrarlar. Yapı gereği idempotent (`WHERE t."firmaId" IS NULL AND u."firmaId" IS NOT NULL`).
- **M-B** `ALTER TABLE "UserLibrary" ALTER COLUMN "firmaId" SET NOT NULL` + `schema.prisma:388` `String?` → `String`. Bu **sayımı kalıcı kısıta çevirir**: ADIM 4'ün ön koşulu bir daha ölçülmek zorunda kalmaz. Güvenli, çünkü UserLibrary'nin 4/4 yazma yolu firmaId yazıyor (`library.service.ts:68-71, 234-237, 412-415, 524-527` — dördü de `firmaId: k.firmaId`).

**Dosyalar:** `backend/prisma/migrations/…/migration.sql` ×2, `backend/prisma/schema.prisma:388`.
**Hangi kapı ölçer:** Migration'ın kendisi. M-B, NULL kalmış tek satır varsa **GÜRÜLTÜLÜ patlar** — istenen budur.
**Mutasyon:** Yerel DB'de bir `UserLibrary` satırının firmaId'sini NULL'a çek, `prisma migrate deploy` → M-B patlamalı. Patlamıyorsa migration hiç koşmamıştır.
**Risk:** M-A düşük · M-B orta (deploy'u durdurabilir — ama sessiz veri bozulmasından iyidir).
**Canlıda NO-OP mu:** M-A K0.2/K0.3 sıfırsa **evet, tam NO-OP**. M-B davranışsal olarak NO-OP, yalnız kısıt ekler.

> ⚠ `EslesmeHafizasi` / `TerminologyAlias` NOT NULL yapılamaz: TerminologyAlias'ta `firmaId: null` **meşru** (sistem seed'i, `terminology.service.ts:119,125`), EslesmeHafizasi'nda ise `firmaIdBul` firmasız kullanıcıda null döner.

---

## ADIM 3 — Kimlik tesisatı: `Kimlik` nesnesi + `kimlikCoz` kapısı (filtre YOK)

**Ne değişir:** `matching.controller.ts`'in **6/6 ucu** çıplak `req.user?.id ?? req.user?.sub` okuyor (25, 36, 45, 54, 65, 72) — `kimlikCoz` **0 kez** geçiyor. Kardeş dilimler (`quotes.controller`, `library.controller`) `Kimlik` geçiriyor. Bu adımda:
- 6 uç → `kimlikCoz(req.user)`; `labor-matching.controller.ts` 3 uç → `kimlikCoz(user)`.
- `MatchingService.bulkMatch/remember/indexHealth/matchV2/hafizaOnSecim/findAlternativesV2/bulkMatchLabor/reindexLabor` ve `TerminologyService.loadAliases/listAliases/saveUserAlias/deactivateAlias` imzaları `userId: string` → `k: Kimlik`. Gövdede **yalnız `k.userId` kullanılır** — hiçbir `where` değişmez.
- `learnFamilyAliases(items, userId: string | null)` → `(items, k: Kimlik | null)`: `null` = **GLOBAL admin yolu**, anlamı KORUNUR (`admin.service.ts:1245, 1658` `null` geçmeye devam eder). Bu adımda `firmaIdBul` kalır; ADIM 5'te `k.firmaId`'ye devredilir.
- `?? req.user?.sub` **ölü dal** — `jwt.strategy` `sub` döndürmüyor; silinir.

**Neden filtre yok:** `firmaId`'yi okuyan ilk satır yazılmadan ÖNCE 403 kapısı yerinde olmalı. Aksi halde `where: { firmaId: undefined }` Prisma'da **sessizce düşer** (`kimlik.ts:16-20`) → o markadaki TÜM firmaların kütüphanesi tek havuz olur.

**Dosyalar:** `matching.controller.ts`, `labor-matching.controller.ts`, `matching.service.ts`, `terminology.service.ts`, `labor-matching.service.ts`, `library.service.ts:262-264`, `admin.service.ts:1245,1658`.
**Test yükü (bu adımın tamamı):** 16 dosya / ~126 `.bulkMatch(` + 10 `.remember(` çağrı yeri. Ağır olanlar: `matching-unit-test.ts` (50), `index-engine-test.ts` (19), `contract-test.ts` (14), `audit-canli-kosum.ts` (20), `olcu-anahtari-cakismasi-test.ts` (10), `labor-matching-test.ts` (8). `spec-regression-test.ts:65-67` **tek sarmalayıcı → 27 senaryo**; `matching-regression.ts:139` **tek satır → 10 fiyat vakası** (düzenlenecek satır az, etkilenen iddia çok).

> ⚠ **`contract-test.ts` MÜHÜR ÇATIŞMASI (satır 15-16: "bu dosyayi DEGISTIRMEDEN gecmek zorundadir").** İmza değişikliği bu mührü tanım gereği bozar. Sessizce düzenlemek projenin en sert kapısını gevşetmektir. **Karar açıkça verilmeli:** dosya başlığındaki mühür bu commit'te bilinçli revize edilir ve yerine **C0-firma** assert'i konur (kurucu + `bulkMatch(k: Kimlik, …)` imzası pinlenir). Mühür kaldırılmaz, **yeniden kurulur**.
> ⚠ `backend/test/` tsconfig kapsamı DIŞINDA — `tsc` yeşili KANIT DEĞİL. Bu adımda `npm run test:regression` + `test:regression:db` + `test:firma` tek tek koşmalı.
> ⚠ `test/audit-canli-kosum.ts` (20 çağrı) `package.json`'da **script'i YOK** → hiçbir kapıda koşmuyor. Bu adımda ya `test:audit` script'i + `regression-all` SUITES kaydı eklenir (manifest kapısı tek yönlü denetliyor), ya da dosya bilinçli olarak ölü ilan edilir.

**Hangi kapı ölçer:** `test:regression` (18/20 dosya) + `test:contract` + YENİ **K7** (`guvenlik-uclari-test.ts`): `matching.controller` ve `labor-matching.controller`'ın 9 ucunun 9'unda `kimlikCoz` geçiyor mu (kaynak metin denetimi, `pk3-kimlik-haritasi` deseniyle).
**Mutasyon:** Bir uçta `kimlikCoz(req.user)` → `{ userId: req.user.id, firmaId: req.user.firmaId }` yap → K7 kırmızı. İkinci mutasyon: `kimlik.ts:28`'deki `if (!u.firmaId)` kapısını sil → `firma-izolasyon-test` I3/I4 kırmızı.
**Risk:** orta (yüzey geniş, ama **derleyici yakalar** — sessiz kırılamaz; `test/` dizini istisna).
**Canlıda davranış:** **EVET DEĞİŞİR** — firmasız hesap bugün bulk-match'i sessizce kullanabiliyor, bu adımdan sonra **403** alır. K0.1 = 0 ise etkilenen kullanıcı yoktur; K0.1 > 0 ise ADIM 3'e **girilmez**.

---

## ADIM 4 — ⭐ ÖLÇÜLEN KIRIK: aday havuzu + iki ikizi firmaya döner

**Ne değişir:** Dört `where`, tek commit (altın kural — UserLibrary'nin yazması `library.service`'te zaten firma):

| Satır | Bugün | Sonra | Kırılma tipi |
|---|---|---|---|
| `matching.service.ts:102` | `{ userId, brandId }` | `{ firmaId: k.firmaId, brandId }` | **GÜRÜLTÜLÜ** — 113-121 dalı, her kalem 0 TL + "Kütüphanenizde bu markaya ait malzeme yok" |
| `:510` (`findAlternativesV2`) | `{ userId, brandId: { not } }` | `{ firmaId: k.firmaId, … }` | **SESSİZ** — 519'da `return []`, M3 öneri kutusu hiç görünmez |
| `:584`, `:586` (`indexHealth`) | `{ userId, … }` | `{ firmaId: k.firmaId, … }` | **SESSİZ** — I7 rozeti ikinci üyede "0 bayat" yalanı söyler |

Ayrıca **M-F** (ayrı, saf perf migration): `@@index([firmaId, brandId])`. `schema.prisma:459`'daki `@@index([userId, brandId])` bileşik indeksi (yorumu: *"bugüne kadar bu tabloda HİÇ index yoktu (full scan)"*) süzgeç dönünce **sorguyu karşılamaz**; geriye yalnız tek kolonlu `@@index([firmaId])` (463) kalır.

**Dosyalar:** `matching.service.ts` (4 `where`), `prisma/schema.prisma` (indeks), `test/matching-regression.ts:130-139` (fixture `select: { userId: true }` → `firmaId`).

**Hangi kapı ölçer — ⚠ MEVCUT KAPILARIN HİÇBİRİ YAKALAMAZ.** Ölçtüm: 18 DB'siz `userLibrary` sahtesinin **18'i de** `where.userId` okumuyor (16'sı yalnız `where.brandId`'nin `{not:…}` olup olmadığına bakıyor, 2'si sıfır-arite: `labor-matching-test.ts:66`, `oneri-kutusu-cekince-test.ts:141`). Yani bu dört `where` çevrildiğinde **DB'siz test kütlesinin tamamı yeşil kalır ve kiracılık hakkında sıfır şey ölçer.**

**YENİ KAPILAR** (`test/firma-izolasyon-test.ts`, L6'nın eşleştirme ikizi — `db:true`, mühürde):
- **M0 (FİXTÜR KANITI, zorunlu):** u1 için `bulkMatch` → havuz **boş değil**, `confidence !== 'none'`. Bu assert olmadan M1 "tesadüfen yeşil" kalabilir (27.08'de 5 kez oldu).
- **M1 ⭐ AYIRT EDİCİ:** **aynı firma, FARKLI kişi** — K2 (u2) `bulkMatch` → u1'in aktardığı markanın satırını görür, `confidence !== 'none'`. *L2/L4 tipi "başka firma göremez" testi bunu yakalayamaz, çünkü başka firma zaten başka kişidir.*
- **M2:** K3 (başka firma) → havuz boş, `confidence === 'none'`.
- **M3:** u2 için `findAlternativesV2` çapraz-marka önerisi **boş dönmemeli** (510'un sessiz ikizi — kendi assert'i olmalı, M1 ile paylaşılmamalı).
- **M4:** u2 için `indexHealth()` sayaçları u1'inkiyle **aynı** olmalı (584/586).

**Mutasyon:** `:102`'de `firmaId: k.firmaId` → `userId: k.userId` geri al → **M1 kırmızı, M2 yeşil kalmalı** (M2'nin de kızarması testin izolasyonu değil bir yan etkiyi ölçtüğünü gösterirdi). İkinci mutasyon: yalnız `:510`'u geri al → **M3 kırmızı, M1 yeşil** (üç `where`in ayrı ayrı ölçüldüğünün kanıtı).
**Risk:** **YÜKSEK** — yanlış giderse ürünün tamamı durur. Ama ADIM 2'nin NOT NULL kısıtı bunu **yapısal olarak** imkânsızlaştırır ve hata **gürültülüdür** (anında görülür, tek `where` geri alınır).
**Canlıda davranış:** **HAYIR** — her firmada tek üye var, `firmaId` ile `userId` bugün aynı kümeyi döner. M-F yalnız plan değiştirir.

---

## ADIM 5 — Sözlük (TerminologyAlias): nöbetçiyi KORUyarak firmaya geç

**Ne değişir — ⚠ EN İNCE ADIM.** `terminology.service.ts:142` tek satırda **iki farklı anlam** var:
```ts
where: { active: true, OR: [{ userId: null }, { userId }] }
//                            ^ SİSTEM SEED (kimlik DEĞİL)  ^ KİŞİ SÜZGECİ
```
Doğru dönüşüm — **yalnız ikinci kanat döner**:
```ts
where: { active: true, OR: [{ userId: null }, { firmaId: k.firmaId }] }
```
**`{ firmaId: null }` YAZILMAZ.** Yazılırsa firmaId'si NULL kalmış her kişisel alias GLOBAL olur; bu alias'lar `impliedType` taşıdığı için (`:246` her zaman `impliedType: alias` yazıyor) başka firmanın satırını **yanlış aileye kilitler** — para hatası. ADIM 1+2 bu NULL nüfusunu sıfırlar, ama nöbetçi yine de `userId: null` kalmalı: *kapsamı NULL'dan türetme.*

Aynı commit'te dönen ikizler:
- `:300` `listAliases` — **aynı kural** (motorla ekran ayrışırsa kullanıcı gördüğü alias'ın çalışmadığı duruma düşer)
- `:238` `learnFamilyAliases` idempotens ön-okuması `{ userId, alias: { in } }` → `{ firmaId, alias: { in } }` (yoksa ikinci üye aynı alias'ı ikinci kez yazar)
- `:269` `saveUserAlias` S5 tekillik araması `findFirst({ userId, alias })` → `{ firmaId, alias }`
- `:317` `deactivateAlias` yetki kapısı `row.userId !== userId` → `row.firmaId !== k.firmaId`. **`:310` `row.userId === null` (seed) DOKUNULMAZ.**
- `firmaIdBul` (207-219) → `k.firmaId` (artık imzada var; DB'ye ekstra sorgu kalkar). `learnFamilyAliases(items, null)` yolunda **null kalmaya devam eder**.
- `:185-186` yorumu bayat kalır → güncellenir (yanlış yorum aktif zarardır).

**Migration M-C:** `@@unique([userId, alias])` (`schema.prisma:126`) → `@@unique([firmaId, alias])`.
⚠ **Sıra: ÖNCE CREATE, SONRA DROP** (mevcut `20260828020000`'in tersi). Böylece çakışmada eski indeks sağlam kalır ve migration gürültülü durur; `migrate deploy`'un dosya başına transaction açıp açmadığı **ölçülmedi** (bkz. "önce ölçülmeli").
⚠ Seed satırları (firmaId NULL) yeni unique'ten **muaf** kalır — ama bugün de (userId NULL) muaflar; **gerileme yok**, dedup zaten `:118` `findFirst` ile elle yapılıyor.

**Dosyalar:** `terminology.service.ts` (6 `where` + 1 kapı + 1 yorum), `schema.prisma:126`, yeni migration.
**Hangi kapı ölçer — ⚠ MEVCUTLAR YAKALAMAZ:** 18 `terminologyAlias` sahtesinin **18'i de argümansız** (`findMany: async () => …`). `loadAliases` süzgeci değişse hiçbir DB'siz test görmez.
**YENİ KAPILAR** (`firma-izolasyon-test.ts`):
- **A0 (fikstür kanıtı):** u1'in `saveUserAlias` ile yazdığı alias `loadAliases(K1)` içinde **var**.
- **A1 ⭐ AYIRT EDİCİ:** `loadAliases(K2)` (aynı firma, farklı kişi) u1'in alias'ını **görür**.
- **A2 ⭐ NÖBETÇİ:** u3 (F2) bir alias yazar → `loadAliases(K1)` onu **GÖRMEZ**; ama seed satırı (`userId: null`) **K1, K2, K3'ün üçünde de** görünür. *Bu tek assert `{firmaId:null}` mutasyonunu yakalayan tek şeydir.*
- **A3:** `listAliases(K2)` = `loadAliases(K2)` kapsamı (ikiz ayrışma kapısı).
- **A4:** u2, u1'in yazdığı alias'ı `deactivateAlias` ile silebilir (317); u3 **403/yetki yok** alır.
- **A5 (kısıt):** u1 ve u2 aynı alias'ı `saveUserAlias` ile kaydeder → tabloda o `(firmaId, alias)` için **tam 1 satır** (M-C kanıtı).

**Mutasyon:** `:142`'yi `OR: [{ firmaId: null }, { firmaId }]` yap → **A2 kırmızı, A1 yeşil kalır** (sızıntının A1 ile ölçülemediğinin, A2'nin gerçekten yeni bir şey ölçtüğünün kanıtı).
**Risk:** **YÜKSEK** — `impliedType` aile kilidi kurar; yanlış alias yanlış ürünün fiyatını yazdırır.
**Canlıda davranış:** **HAYIR** (tek üye), K0.3 = 0 şartıyla. K0.3 > 0 ise bu adım **bloklanır**.
**Ek iş:** `guvenlik-uclari-test.ts:140,142`'deki sözleşme metinleri ("*kullanici-kapsamli*") **dizgi** olduğu için hep yeşildir — bu adımda elle güncellenmeli, yoksa bayat sözleşme sonraki turda yanlış varsayım kaynağı olur.

---

## ADIM 6 — Hafıza (EslesmeHafizasi): kısıt + okuma, TEK commit

**Ne değişir — bu adım kısıtsız YAPILAMAZ.** Dört okuma da **bileşik unique** üzerinden gidiyor: `:864` `findUnique({ userId_imza })`, `:941` `findUnique({ userId_imza })`, `:1056` ve `:1080` `upsert.where`. Prisma'da `findUnique`/`upsert.where` **yalnız bir UNIQUE kısıtı** adresleyebilir — yani *"firmadan oku, kişiye yaz"* bu tabloda **yapısal olarak imkânsız**. `findFirst({ firmaId, imza })`'ya kaçmak da yanlış: aynı firmadan iki üye aynı imzaya cevap verirse iki satır oluşur, `orderBy`'sız `findFirst` hangisini döneceğini **garanti etmez** ve `:896-919` OTOYAZ dalı (`confidence: 'high'`, fiyat yazılır, soru sorulmaz) her istekte rastgele birini seçer.

- **Migration M-D:** `@@unique([userId, imza])` (`schema.prisma:94`) → `@@unique([firmaId, imza])`. **CREATE önce, DROP sonra.**
- `:864, :941, :1056, :1080` → `firmaId_imza: { firmaId: k.firmaId, imza }`.
- `userId` satırda **YAZAR** olarak KALIR (Quote/UserLibrary deseni).
- `secimSayisi: { increment: 1 }` artık firma çapında birikir — bu zaten `:914-917`'deki kendi yorumunun dediği şey (*"sayaç SATIRA değil ANAHTARA ait"*).
- `:113` ve `:1066` logları firmayı da basar (teşhis: "kimin boş" sorusunun cevabı artık firma).

⚠ **ÜRÜN KARARI GEREKLİ, KOD KARARI DEĞİL:** `:896-919` OTOYAZ dalı, meslektaşın onayını **onaysız** devreder. Ölçtüm: `idx >= 0` **ve** `candidates.length === 1` birlikte `idx === 0`'ı zorlar, yani `c` bu kullanıcının **kendi** havuzundan gelen tek adaydır ve hafıza satırı yalnız bir **AD** tutar (fiyat tutmaz) — dolayısıyla **yanlış fiyat üretmez**, devredilen şey **onay feragatidir**. Ama `ExcelGrid.tsx:440`'taki rozet metni *"Geçmiş **seçiminizden** atandı"* o durumda **yalan** olur. Karar: (a) metin "Firmanızda kayıtlı seçim (N×)" olarak düzeltilir, ya da (b) otoyaz yalnız `mem.userId === k.userId` iken uygulanır, meslektaş kaydı ön-seçime düşer. Bu karar bu adımda **verilmeli**, sessizce geçilmemeli.

**Dosyalar:** `matching.service.ts` (4 anahtar + 2 log), `schema.prisma:94`, yeni migration, `frontend/…/ExcelGrid.tsx:440` (karar (a) ise) + `matching.service.ts:918` reason metni.
**Hangi kapı ölçer — bu adımın kırılması GÜRÜLTÜLÜDÜR (iyi haber):** 7 DB'siz dosya sahte anahtarı `memKey = (w) => w.userId_imza.userId` diye kuruyor — `contract-test.ts:28`, `dn-koprusu-test.ts:107`, `imza-ekseni-test.ts:51`, `labor-matching-test.ts:51`, `matching-unit-test.ts:24`, `olcu-anahtari-cakismasi-test.ts:53`, `spec-regression-test.ts:20`. Anahtar adı değişince **TypeError** ile çökerler.
⚠ **ASİMETRİ:** okuma yolları `try{…}catch{ mem = null }` ile sarılı (`:862-866`, `:939-943`) → **sessizce yutulur, yeşil kalır**. `remember()`'ın ana upsert'i (`:1055`) sarılı **değil** → çöker. Yani 7 sahtenin sadece `remember` çağıranları kızarır. Bu yüzden **7'sinin de** elle güncellenmesi gerekir; "test yeşil" kanıt değildir.
**YENİ KAPILAR:** **H3 ⭐** u1 `remember(...)` → u2 aynı satırı `bulkMatch` ettiğinde ön-seçim/otoyaz **gelir**; **H4 ⭐** u1 ve u2 aynı imza için `remember` çağırır → tabloda `(firmaId, imza)` için **tam 1 satır**, `secimSayisi === 2` (M-D kanıtı); **H5** u3 (F2) aynı imzayı yazar → ayrı satır, K1 onu görmez.
**Mutasyon:** M-D'yi uygula ama `:1056` upsert'ini `userId_imza`'da bırak (Prisma derleme hatası vermeyecek şekilde `findFirst`+`create`'e kaçır) → **H4 kırmızı** (2 satır). İkinci mutasyon: `:864`'ü `findFirst({ imza })`'ya (firmaId'siz) indir → **H5 kırmızı**.
**Risk:** **EN YÜKSEK** (gerekçe aşağıda).
**Canlıda davranış:** **EVET, ÜRÜN DAVRANIŞI DEĞİŞİR** — üyeler birbirinin öğrenilmiş seçimini devralır. Bu bir hata düzeltmesi değil, **bilinçli ürün kararıdır**; kullanıcı onayı gerekir.

---

## ADIM 7a — İSİM AYRIŞTIRMA (saf rename, sıfır davranış)

**Ne değişir:** `matching.service.ts`'te `firmaId` **10/10 İŞÇİLİK FİRMASI**'dır (LaborFirm.id) — 311(yorum), 322, 448, 601, 607, 623, 626, 628, 710, 713. **Bugün bu dosyada ŞİRKET anlamlı tek bir `firmaId` yok.** Şema bunu doğruluyor ve tuzağı büyütüyor: `LaborPrice.firmaId` (705) → LaborFirm FK, ama `LaborFirm.firmaId` (678) = **ŞİRKET**.

En tehlikeli tek satır `:713`: `where: { firma: { userId, id: { not: firmaId } } }`. Firmaya çevrilince `where: { firma: { firmaId: k.firmaId, id: { not: firmaId } } }` olur — **üç token arayla iki farklı anlamda `firmaId`**. `LaborFirm.firmaId` çıplak skaler (Firma modelinde geri-ilişki yok), yani iç içe yazmaktan kaçış yolu da yok.

Bu adım **yalnızca yeniden adlandırma** yapar: işçilik firması parametresi/değişkeni her yerde **`laborFirmId`** olur (`matching.service.ts` 9 kod satırı + `labor-matching.service.ts:21,32,39,45,47` + `labor-matching.controller.ts` `body.firmaId` → `body.laborFirmId` ⚠ **API sözleşmesi** — FE ile aynı commit).

**Hangi kapı ölçer:** `test:labor`, `test:oneri`, `test:regression` — davranış aynı kalmalı, tamamı yeşil.
**Mutasyon:** Yok (saf rename). Bunun yerine **kanıt**: `git diff --stat` yalnız isim değişikliği göstermeli; `git diff -w` içinde hiçbir `where` yapısı değişmemeli.
**Risk:** düşük (derleyici + FE sözleşmesi hariç).
**Canlıda davranış:** **HAYIR** — ama `body.laborFirmId` FE ile **eşzamanlı** deploy edilmeli, yoksa 4 uç kırılır.

## ADIM 7b — İşçilik dilimi ŞİRKET'e döner

**Ne değişir:** 7a'dan sonra ŞİRKET `firmaId`'si dosyaya güvenle girebilir:
- `labor-matching.service.ts:24` `firma.userId !== userId` → **`firma.firmaId !== k.firmaId`**. Bugün canlı bir ÇELİŞKİ var: `quotes.service.ts:194` sahipliği zaten FİRMA ile ölçüyor (*"ADIM 1: sahiplik ölçüsü KİŞİ değil FİRMA"*) ama `assertOwnership` KİŞİ ile ölçüyor → u2, u1'in teklifini açar, işçilik eşleştirmesinde **403** alır.
- `matching.service.ts:713` `firma: { userId, … }` → `firma: { firmaId: k.firmaId, … }` (`laborFirmId` dışlaması aynen kalır).
- `matching.service.ts:788` `firma: { userId }` → `firma: { firmaId: k.firmaId }`. ⚠ **`grep firmaId` ile bulunamayan iki yer bunlar** — arama `firma: { userId }` deseniyle de yapılmalı. `LaborItem` GLOBAL tablodur (indeks alanları deterministik), kapsam genişlemesi zararsız ama **sessizdir** — açıkça söylenmeli.
- **Migration M-E:** `LaborFirm @@unique([userId, name])` (`683`) → `@@unique([firmaId, name])`. Yoksa aynı firmanın iki üyesi aynı işçilik firmasını iki kez açar → iki ayrı `LaborFirm.id` → hafıza öneki `iscilik|<id>` iki ayrı ad-alanına düşer ve ADIM 6'daki firma hafızası işçilikte **hiç gerçekleşmez**.
- ⚠ `:626` `iscilik|${laborFirmId}` öneki **imza METNİNE** girer, hiçbir `where`'e girmez — **DOKUNULMAZ**. Şirket id'sine çevrilirse mevcut TÜM işçilik hafızası geçersiz olur.

**Hangi kapı ölçer — ⚠ MEVCUT SAHTELER SESSİZCE YANLIŞ DALA DÜŞER:** `labor-matching-test.ts:57-64` ve `oneri-kutusu-cekince-test.ts:133-139` `laborPrice` sahtesi **`where` ŞEKLİNE** göre dal seçiyor (`if (args?.where?.firmaId) return mainRows; if (args?.where?.firma) return otherRows`). Süzgeç iç nesneye taşınırsa sahte **otherRows** döner — test çökmez, **yanlış dalda koşar**. Ayrıca `labor-matching-test.ts:52-55` `laborFirm` sahtesi `firmaId` alanı **taşımıyor** → 7 çağrının hepsi fırlatır. İkisi de bu adımda elle düzeltilir.
**YENİ KAPILAR:** **İ1 ⭐** u2, u1'in açtığı LaborFirm ile `bulkMatch` yapabilir (403 almaz); **İ2** u3 **403** alır; **İ3** u2 için `findLaborAlternativesV2` u1'in diğer firmalarını **görür**; **İ4 (kısıt)** u1 ve u2 aynı isimle firma açmayı dener → tek satır (M-E).
**Mutasyon:** `:24`'ü `firma.userId !== k.userId`'ye geri al → **İ1 kırmızı, İ2 yeşil**. İkinci: `labor-matching-test.ts` `laborPrice` sahtesini şekil-bağımlı bırak → gerçek-DB İ3 kapısı ile DB'siz test **çelişmeli** (sahtenin yalan söylediğinin kanıtı).
**Risk:** orta-yüksek (403 gürültülü; ama sahte-dal tuzağı sessiz).
**Canlıda davranış:** **HAYIR** (tek üye) — ama `assertOwnership` çelişkisi bugün de mevcut; düzeltilmesi `quotes.service` ile tutarlılık kazandırır.

---

## ADIM 8 — İkizler, kısıtlar ve temizlik

**Ne değişir:**
- **`ai.service.ts:311-313`** — dilim DIŞI ama **AYNI TABLO, AYNI KÖK**: `userLibrary.findMany({ where: { userId } })`. Çevrilmezse ikinci üyede teklif ekranı dolu, PDF akışı **boş kütüphane** görür: aynı veriye iki farklı cevap. (`ai.controller` de `kimlikCoz`'a geçer.)
- `matching.service.ts:1029-1041` ve `terminology.service.ts:207-219` `firmaIdBul` köprüleri artık **ölü** (kimlik imzada) → kaldırılır; kaldırma H1/H2/T1/T3/T4 kapılarını **kırmamalı** (kırıyorsa köprü hâlâ canlı demektir).
- Bayat yorumlar: `matching.service.ts:1011-1018` ("okumalar hâlâ kişi bazlı"), `terminology.service.ts:185-186, 190-203`, `schema.prisma` 86/107/137/388/475/678'deki *"suzgecler backfill sonrasi buna doner"* notları → dönmüş olduğu için güncellenir. **Yanlış yorum aktif zarardır.**
- **`BrandMaterialType` (schema.prisma:134-151):** `src/` genelinde **0 kullanım** — okuyan, yazan, seed eden yok (`terminology.service.ts:25-27` sebebi yazıyor: *BrandClassHint + resolveBrandClass + BRAND_SEEDS SİLİNDİ*). Bu dilimde **İŞ YOK**. `@@unique([userId, pattern])` (147) çevrilmez, `firmaId` kolonuna dokunulmaz. ⚠ Kapsam raporunda bu tablo **sayılmamalı** — backfill onu güncellediği için paydayı yanlış şişirir. Düşürülüp düşürülmeyeceği **ayrı bir karar**.
- İsteğe bağlı: `EslesmeHafizasi.firmaId` NOT NULL (yalnız K0.3 = 0 ve ADIM 6 canlıda bir süre koştuktan sonra).

**Hangi kapı ölçer:** `test:regression` tamamı + `test:firma` + YENİ **X1**: `firma-izolasyon-test`'e DB invariant assert'i — `SELECT count(*) FROM "UserLibrary"/"EslesmeHafizasi"/"TerminologyAlias" WHERE "firmaId" IS NULL AND "userId" IS NOT NULL` = **0**. Bu, sayımı kalıcı bir kapıya çevirir.
**Mutasyon:** `ai.service.ts`'i kişi bazlı bırak → YENİ **AI1** kapısı (u2 için `matchWithDatabase` boş dönmemeli) kırmızı.
**Risk:** düşük. **Canlıda davranış:** hayır.

---

## EN RİSKLİ ADIM VE SIRA GEREKÇESİ

**En riskli: ADIM 6 (EslesmeHafizasi kısıt takası + okuma). EN SONA konuldu.** Dört gerekçe:

1. **Tek DROP INDEX'i o taşıyor.** Yanlış giderse tablo ne eski ne yeni kısıtla kalabilir. (Bu yüzden CREATE-önce-DROP-sonra sırası zorunlu.)
2. **Kırılması SESSİZ.** Yanlış anahtar → hafıza görünmez → kullanıcı aynı soruyu her teklifte yeniden cevaplar. Hata mesajı yok, log yok, fiyat yanlış değil. ADIM 4'ün kırılması ise **gürültülü** (her kalem 0 TL) ve tek `where` geri alınarak dakikalar içinde onarılır.
3. **Bugün BOZUK değil.** ADIM 4 ölçülmüş bir kırıktır (davet akışı çıkınca ikinci üye boş havuz görür). ADIM 6 ise çalışan bir davranışı **ürün kararıyla** değiştirir. Bozuk olanı önce, çalışanı sonra.
4. **Bağımlı.** ADIM 6'nın güvenliği yazma köprüsünün (ADIM 1) ve ikinci backfill'in (ADIM 2) canlıda **kanıtlanmış** olmasına bağlıdır; K0.4 çakışma sorgusu da ancak ADIM 5 sonrası verinin oturmasıyla anlamlıdır.

**En başa ADIM 0 + 3:** ADIM 3 (`kimlikCoz`) her filtre değişikliğinden **önce** gelmek zorunda — aksi halde `where: { firmaId: undefined }` sessizce düşer ve tek satırlık bir ihmal çapraz-tenant havuz üretir (`kimlik.ts:16-20`'nin tarif ettiği tam felaket). ADIM 0 ise ADIM 2/4/5/6'nın hepsinin ön koşulunu tek seferde ölçer.

---

## ÖNCE ÖLÇÜLMELİ (tahmin üretilmedi — bunlar BİLİNMİYOR)

1. **K0.1–K0.4 SQL sayımlarının hiçbiri koşulmadı** (salt-okunur görev). Yukarıdaki "canlıda NO-OP" cevaplarının tamamı **kod okumasına** dayanıyor. K0.1 > 0 → migration canlıda hiç koşmamış → **plan ADIM 0'da durur.**
2. **`prisma migrate deploy` her migration dosyasını tek transaction'da koşuyor mu?** Bu repoda ölçülmedi. M-C/M-D/M-E'nin DROP+CREATE çiftinin atomikliği buna bağlı. Ölçülene kadar **CREATE-önce-DROP-sonra** sırası zorunlu tutulmalı.
3. **`@prisma/client` sürümü ve `strictUndefinedChecks` ayarı** okunmadı. `where: { firmaId: undefined }`'ın sessizce düşmesi projenin kendi yazılı kuralından alınıyor (`kimlik.ts:16-20`), bu repoda deneysel doğrulanmadı.
4. **EslesmeHafizasi firmaya geçince `userId`'nin ANLAMI** — "ilk öğreten kişi" (create'te yazılır, update'te dokunulmaz) mi, "son seçen kişi" (her update'te yenilenir) mi? Bugün `:1062` `update`'te `secilenAd` yenilenirken `userId` dokunulmuyor, yani fiilen "ilk öğreten". Sonucu değiştirmez (süzgeç firmaId), **denetim izini** değiştirir. **Kullanıcı kararı.**
5. **ADIM 6'daki OTOYAZ devri** (meslektaşın onayının onaysız devri) — ürün kararı. Rozet metni düzeltilecek mi, yoksa otoyaz sahibine mi kısıtlanacak? **Kullanıcı kararı.**
6. **Sözlük (TerminologyAlias) için doğru kapsam gerçekten FİRMA mı?** Alias'lar `impliedType` üzerinden aile kilidi kurduğu için bir üyenin yanlış öğrettiği terim **tüm firmanın** fiyatlarını kaydırır. Tutarlılık için doğru, ama "yanlış öğrenme" yarıçapını da büyütür. **Ürün kararı.**
7. **`test/audit-canli-kosum.ts`** (20 çağrı, `firmaId`'yi zaten okuyan tek matching tüketicisi) `package.json`'da script'i **yok** → hiçbir kapıda koşmuyor. Yaşayacak mı ölecek mi **karar verilmedi**.
8. **`BrandMaterialType` düşürülecek mi?** 0 kullanım kesin (ölçüldü), gelecek planı bilinmiyor.
9. **FE tarafı okunmadı** (görev backend/src ile sınırlıydı). ADIM 7a'nın `body.firmaId` → `body.laborFirmId` değişikliğinin FE'de kaç çağrı yerini etkilediği **sayılmadı**; eşzamanlı deploy zorunluluğu bu yüzden varsayım değil, ölçülmesi gereken bir kalem.