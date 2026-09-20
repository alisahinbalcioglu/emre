# F2b RAPORU — İKİ ADIMLI GİRİŞ BAĞLAMA (Faz 7)

> Çalışma kopyası: `C:/Users/basar/Projects/metaprice-saas/.claude/worktrees/nice-lederberg-9aaf1c`
> Dal `claude/faz-6-7-tamamla-3be6b1` (= master = canlı `f9594a8c370e`). **Commit/push YOK**; değişiklikler yalnız `git add` ile sahnede.
> Tasarım: `scratchpad/faz7/faz7-tasarim.md` §R1, §11-F2b, §2.4, §2.7, §4.1-4.9, §6.2, §6.7, §6.9, §6.10, §7 · İlerleme: `scratchpad/faz7/F2b-ilerleme.md`

## ⚠ RAPORUN BAŞINDA: GÖZLE BAKILMADI

**Yeni ekranların hiçbiri tarayıcıda gözle doğrulanmadı.** Yalıtılmış çalışma kopyasında önizleme ana `launch.json`'a bağlı (hafıza dersi: *worktree'de önizleme kısıtı*) ve bu turda sunucu ayağa kaldırılmadı. Ölçülenler: `tsc`, `vitest`, `npx next build` (üçü de yeşil) ve kaynak kapıları. **Yerleşim, hizalama ve akışın el yordamıyla kullanılabilirliği ölçülmedi** — deploy öncesi bir tarayıcı turu gerekir (§Açık riskler).

---

## Özet

- **Tam paket YEŞİL**: backend regresyon **89 PASS / 0 FAIL / 9 SKIP** (defter 9=9) · ön yüz vitest **1588/1588** · `npx next build` çıkış 0. Yeni kapı `test:faz7-mfa` **162 PASS / 0 FAIL**. **Mutasyon 29/29 öldü.**
- İki adımlı giriş uçtan uca bağlandı: şema + migration, saf karar (`mfa-karari.ts`), `OturumServisi.girisKarari`, `MfaServisi` + `MfaController` (8 uç), yönetici sıfırlama, firma zorunluluk anahtarı, parola sıfırlamada kilit açma, KVKK dışa aktarımı, sunucu betiği, ön yüz (6 yeni bileşen + 8 dosya) ve hukuki metin.
- Emre'nin dört kararı da koda girdi: yöneticide **zorunlu**, firma sahibi **firması için zorunlu kılabilir ve bu yalnız parolayla girenlere uygulanır**, kişi kendi açtıysa (`mfaKaynagi='kisisel'`) **kurumsal girişte de sorulur**, oturumlu kurulum **parola ister** ve token yeniden basılırken **`authAt` korunur**, yanlış kod/parola **400**'dür (kullanıcı oturumdan atılmaz).
- **QR kodu YOK** (bilinçli): `qrcode-generator` yeni bir bağımlılıktır ve tasarım §0.6 onu **Emre onayına** bağlamıştır; onay bu turda alınmadı → §0.6'nın yazılı yedeği uygulandı (**elle anahtar + `otpauth://` bağlantısı**). Onay gelirse tek dosya değişir (`KurulumAnahtari.tsx`).
- **Beş öncül çürüdü** (tasarımda yanlış yazılmış yollar/satırlar) — aşağıda adlarıyla.

## Taban ağacı

- F2b başı (`git add -A && git write-tree`, değişiklikten önce): **`12f395772b6bf74c715d76f0e8fc37ba7007b97f`**
- Mutasyon koşumundan hemen önce: **`9c152d9996bccdf9ea308e786d4b18d12622a5d4`**

## Değişen / yeni dosyalar

`git diff --cached --stat`: **58 dosya, 5037 ekleme, 82 silme.** Mutasyon koşumundan sonraki ağaç: **`1ff376a79fe5e834fefe35e2dcf9a964f36a6fd0`**.

### Yeni (18)

| Dosya | Ne |
|---|---|
| `backend/prisma/migrations/20260920120000_faz7_iki_adimli_giris/migration.sql` | `User` +8 mfa kolonu · `MfaKurtarmaKodu` tablosu · `Firma.mfaZorunlu`. Yalnız EKLER, backfill YOK, sonda GERİ ALMA bloğu (yorum) |
| `backend/src/altyapi/auth/mfa/mfa-karari.ts` | SAF karar: `mfaZorunluMu`, `girisKarariSaf`, `kapatilabilirMi`, `mfaTemizlemeVerisi` |
| `backend/src/altyapi/auth/mfa/mfa.servisi.ts` | 8 akış: doğrulama, zorunlu kurulum (başlat/onayla), oturumlu kurulum (başlat/onayla), kapatma, kod yenileme, "şirket girişinde de sor" |
| `backend/src/altyapi/auth/mfa/mfa.controller.ts` | `auth/mfa/*` — guardsız üçlü + oturumlu beşli (`@KoltukDisiIzinli`) |
| `backend/src/altyapi/auth/mfa/dto/mfa.dto.ts` | 6 sınıf DTO (satır içi tip literali `ValidationPipe`'ı sessizce atlar) |
| `backend/src/altyapi/auth/mfa/mfa-epostalari.ts` | 6 bilgi e-postası (SAF: talep üretir, göndermez) |
| `backend/scripts/mfa-sifirla.ts` | Son yöneticinin kilitlenmesi için sunucu betiği (varsayılan PROVA, **KOŞULMADI**) |
| `backend/src/ozellik/firma/dto/firma-guvenlik.dto.ts` | `PATCH /firma/guvenlik` gövdesi |
| `backend/test/faz7-mfa-test.ts` | Yeni kapı — **162 kontrol** (M1-M28 + M11c, M12d, M14e) |
| `frontend/ozellik/kimlik/` (6 dosya) | `GirisDaliEkrani`, `MfaKodAdimi`, `ZorunluKurulumSihirbazi`, `KurulumAnahtari`, `KurtarmaKodlariEkrani`, `IkiAdimliGirisKarti` |
| `frontend/ozellik/kimlik/giris-dali.test.ts` | 32 vitest kontrolü (saf karar + kaynak kapıları) |

### Değişen (40) — önemli olanlar

| Dosya | Ne |
|---|---|
| `backend/prisma/schema.prisma` | `User` mfa kolonları + ilişki, `Firma.mfaZorunlu`, `MfaKurtarmaKodu` modeli |
| `backend/src/altyapi/auth/oturum.servisi.ts` | **`girisKarari(user, yol)`** — token veren her yolun tek kapısı |
| `backend/src/altyapi/auth/auth.service.ts` | `login`/`register` → `girisKarari`; `me()` → `mfa` bloğu |
| `backend/src/ozellik/firma/uyelik.servisi.ts` | `davetKabul` → `girisKarari` (R1-O1); ekip listesine `mfaAcik` |
| `backend/src/altyapi/auth/strategies/jwt.strategy.ts` | İlk satır `amac`/`aud` reddi; yönetici `MFA_KURULUM_GEREKLI` kapısı |
| `backend/src/ozellik/kutuphane/admin/admin.{controller,service}.ts` | `POST users/:id/mfa-sifirla` (+ `EpostaServisi` enjeksiyonu) |
| `backend/src/ozellik/firma/firma.{controller,servisi}.ts` | `PATCH /firma/guvenlik` + damga `updateMany` + `FirmaOlayi` |
| `backend/src/altyapi/auth/parola.servisi.ts` | Sıfırlamada `mfaHataSayaci: 0, mfaKilitliAt: null` (MFA **açık kalır**) |
| `backend/src/altyapi/auth/hesap.servisi.ts` | KVKK dışa aktarımına `mfa` + 3 not |
| `backend/src/altyapi/auth/hukuki-surum.ts` · `frontend/ozellik/hukuki/metinler.ts` | Sürüm `2026-09-17` → **`2026-09-20`** + 4 metin bloğu |
| `frontend/ortak/lib/oturum.ts` | `girisDaliCoz` (saf dal kararı) |
| `frontend/ortak/lib/api.ts` | `KIMLIK_UCLARI` +3 guardsız MFA ucu |
| `frontend/app/(protected)/layout.tsx` | Token **biçimi** sınanır (`gecerliTokenMi`) |
| `frontend/app/{login,register,davet-kabul}` | İkinci adım (ortak `GirisDaliEkrani`) |
| `frontend/app/(protected)/profile` · `firma/ekip` · `admin/users` | MFA kartı · MFA sütunu + sahip anahtarı · "İki adımlı girişi sıfırla" |
| 11 mevcut backend testi | Fixture uyarlaması (aşağıda) |

**Uyarlanan mevcut fixture'lar (gerekçeli):** 9 dosyada `new AdminService(...)` beşinci argüman (`EpostaServisi` sahtesi) · `deneme-hakki-test.ts`'e `oturumDali()` daraltıcısı (8 çağrı; `as any` YERİNE — MFA dalı gelirse gürültülü düşer) · `faz7-yetki-test.ts`'e `firma`/`mfaKurtarmaKodu` stub'ları · `faz7-ekip-test.ts` AdminService çağrısı · `migration-zinciri-test.ts` Z2 + yeni Z3b bloğu.

## Migration'lar

`20260920120000_faz7_iki_adimli_giris` — `ALTER TABLE "User" ADD COLUMN` ×8 (hepsi NULL ya da `DEFAULT 0`), `CREATE TABLE "MfaKurtarmaKodu"` (+ indeks + FK `ON DELETE CASCADE`), `ALTER TABLE "Firma" ADD COLUMN "mfaZorunlu" BOOLEAN NOT NULL DEFAULT false`. **Backfill YOK; hiçbir hesabın girişi bu migration ile değişmez, hiçbir firmada zorunluluk açılmaz.**

## Koşulan testler

| Komut | Sonuç satırı |
|---|---|
| `cd backend && npx tsc --noEmit -p tsconfig.json` | çıkış 0 |
| `npm run typecheck:test` | çıkış 0 |
| `npm run test:faz7-mfa` (YENİ) | `FAZ 7 IKI ADIMLI GIRIS (F2b): 162 PASS, 0 FAIL` |
| `npm run test:faz7-ekip` (F1b kapısı) | `FAZ 7 EKIP (F1b): 230 PASS, 0 FAIL` |
| `npm run test:faz7-yetki` | `FAZ 7 YETKI (2.12 + K1-K3): 57 PASS, 0 FAIL` |
| `npm run test:faz5` (D7 sürüm ikizi) | `FAZ 5: 74 PASS, 0 FAIL` |
| `npm run test:sunucu` (W1 nöbetçi etiketi) | `SUNUCU URUNLERI: 26 PASS, 0 FAIL` |
| `npm run test:harita` | `HARITA DENETIMI: PASS — her kod dosyasinin karsiligi var.` |
| `npm run test:klasor` | `KLASOR DUZENI DENETIMI: PASS — her dosya ilan edilmis bir alan kokunde, her grup kendi yolunda.` |
| **TAM PAKET** `npm run test:regression` | **`TOPLAM: 89 PASS · 0 FAIL · 9 SKIP`** · `SKIP DEFTERİ: beklenen 9 · gerçek 9` · çıkış 0 (günlük: `scratchpad/faz7/f2b-tam-paket-backend.log`) |
| `cd frontend && npx tsc --noEmit` | çıkış 0 |
| `npx vitest run` | `Test Files 77 passed (77)` · `Tests 1588 passed (1588)` |
| `npx next build` | çıkış 0 (günlük: `scratchpad/faz7/f2b-next-build.log`) |
| Mutasyon koşucusu (29 mutant) | `MUTASYON: 29/29 öldü` |

> Taban (F1b sonrası master, `f9594a8`): regresyon 88/0/9 · vitest 1546 civarı. F2b **+1 paket** (`test:faz7-mfa`) ve **+42 vitest kontrolü** (32 yeni dosya + 10 D bloğu) getirdi. Defter 9=9 korundu (yeni paket DB'siz, `zincir: 'Z0'`).

### Migration zinciri (PGlite, gerçek SQL)

`test:migration` temiz bir veritabanında zincirin tamamını koşar ve yeni **Z3b** bloğu şunları ölçer: 8 `User` mfa kolonu VAR · `mfaHataSayaci` `NOT NULL DEFAULT 0` · `Firma.mfaZorunlu` `NOT NULL DEFAULT false` · `MfaKurtarmaKodu` tablosu oluştu. Tam pakette YEŞİL.
## Mutasyonlar — **29/29 ÖLDÜ**

Koşum: `node araclar/mutant-kosucu.cjs araclar/f2b-mutantlar.cjs mutasyon-f2b/sonuc-son.jsonl` (kapının KENDİ komutuyla: `npm run test:faz7-mfa`; ön yüz mutantlarında `npx vitest run`). Her mutantta: yedek → uygula → yazıldığını geri oku → koş → geri yükle → `cmp`. **Geri yükleme sorunlu: YOK** (29/29 `cmp 0 (birebir)`).

| # | Dosya | Mutasyon | Kırmızıya döndüren | Durum |
|---|---|---|---|---|
| 1 | `jwt.strategy.ts` | `amac`/`aud` ret satırı silinir | M6 (iki ayrı assert) | ÖLDÜ |
| 2 | `meydan-okuma.ts` | imza anahtarı `jwtSecret()` (katman 1 düşer) | M5 BAĞLANTI | ÖLDÜ |
| 3 | `auth.service.ts` | `login` doğrudan `oturumYaniti` | M1 · M2 · M28 | ÖLDÜ |
| 4 | `oturum.servisi.ts` | MFA dalında yanıta `token` da eklenir | M1 (`'token' in yanit === false`) | ÖLDÜ |
| 5 | `jwt.strategy.ts` | yönetici MFA kontrolü silinir | M7 | ÖLDÜ |
| 6 | `mfa-karari.ts` | `role === 'admin'` koşulu silinir | M2 · M21 | ÖLDÜ |
| 7 | `mfa.servisi.ts` | TOTP tüketiminde koşullu `updateMany` → düz `update` | M8 (casus) | ÖLDÜ |
| 8 | `mfa.servisi.ts` | tüketim `where`'inden `mfaSonAdim` koşulu silinir | M8 (casus) | ÖLDÜ |
| 9 | `mfa.servisi.ts` | kurtarma kodu koşullu tüketimi silinir | **M12d** | ÖLDÜ |
| 10 | `mfa.servisi.ts` | rezervasyon `where`'inden `mfaKilitliAt: null` silinir | **M11c** | ÖLDÜ |
| 11 | `mfa.servisi.ts` | yanlış parolada `UnauthorizedException` (401) | M15b · M16 | ÖLDÜ |
| 12 | `mfa.servisi.ts` | kurulum onayında `passwordChangedAt` silinir | M15 | ÖLDÜ |
| 13 | `mfa.servisi.ts` | meydan okuma sonrası `hesapKapisi` silinir | M13 (banlı) | ÖLDÜ |
| 14 | `firma.servisi.ts` | zorunluluk açılırken damga `updateMany` silinir | M19 | ÖLDÜ |
| 15 | `parola.servisi.ts` | kilit açma satırı silinir | M20 | ÖLDÜ |
| 16 | `login/page.tsx` | `oturumuYaz` yerine doğrudan `localStorage` | vitest ×3 kaynak kapısı | ÖLDÜ |
| 17 | `api.ts` | `KIMLIK_UCLARI`'ndan `/auth/mfa/dogrula` çıkarılır | vitest D bloğu | ÖLDÜ |
| 18 | `mfa.servisi.ts` | zorunlu kurulumun beklenen amacı `'mfa-dogrula'` | M14b (+15 kontrol) | ÖLDÜ |
| 19 | `mfa.servisi.ts` | onay koşullu yazımından `mfaAcikAt: null` silinir | **M14e** | ÖLDÜ |
| 20 | `mfa.servisi.ts` | `kurulumBaslat` parola kontrolü silinir | M15b | ÖLDÜ |
| 21 | `mfa.servisi.ts` | `kurulumOnayla` token'ında `authAt: simdiSn` | M15c | ÖLDÜ |
| 22 | `mfa.servisi.ts` | meydan okumada `iat >= passwordChangedAt` silinir | M13 (damga) | ÖLDÜ |
| 23 | `mfa.servisi.ts` | rezervasyon `where`'inden `mfaHataSayaci: { lt: 20 }` | M11b (iki assert) | ÖLDÜ |
| 24 | `uyelik.servisi.ts` | `davetKabul` doğrudan `oturumYaniti` | M3b · M28 | ÖLDÜ |
| 25 | `mfa-karari.ts` | `kapatilabilirMi` firma dalı silinir | M16b | ÖLDÜ |
| 26 | `mfa-karari.ts` | kurumsal yolda `mfaKaynagi === 'kisisel'` silinir | M21 | ÖLDÜ |
| 27 | `mfa.servisi.ts` | `zorunluKurulumBaslat`'ta `mfaAcikAt !== null` silinir | M14c (başlat) | ÖLDÜ |
| 28 | `mfa.controller.ts` | `kurulum/baslat`'tan `@KoltukDisiIzinli` silinir | M27 | ÖLDÜ |
| 29 | `mfa.servisi.ts` | zorunlu kurulumda `girisKarariSaf` yeniden koşulmaz | M14d | ÖLDÜ |

### İlk koşumda 6 mutant yakalanmadı — testler GÜÇLENDİRİLDİ (dürüst kayıt)

İlk tam koşum **23/29** verdi. Kalan altısı testin zayıflığını gösterdi; **kod değil TEST** düzeltildi:

| # | İlk sonuç | Neden | Ne yapıldı |
|---|---|---|---|
| 7, 8 | "yanlış neden" | M8'in casus assert'i `where.OR` yokken `JSON.stringify(undefined).includes(...)` ile **ÇÖKÜYORDU** → özet basılmıyor, kırmızı anlamsızlaşıyordu | Assert null-güvenli yapıldı |
| 18 | "yanlış neden" | Mutlu yol çağrıları ÇIPLAK `await` ile yazılmıştı; fırlatan mutant testi çökertiyordu | 12 mutlu yol `dene()` ile sarmalandı + `-FIXTURE` assert'leri |
| 9 | **HAYATTA** | Sıralı test koşullu tüketimi ölçemiyordu (ikinci deneme zaten `findMany` süzgecine takılıyordu) | **M12d**: aday listesi BAYAT döndürülür (DB'de kullanılmış) → koşullu tüketim `count: 0` görmeli |
| 19 | **HAYATTA** | Erken `mfaAcikAt !== null` kontrolü koşullu yazımı GÖLGELİYORDU | **M14e**: servise BAYAT kullanıcı görüntüsü verilir, DB'deki satır AÇIK |
| 10 | (M11'e bağlıydı) | `mfaHataSayaci < 20` zaten engelliyordu; kilit alanı tek başına ölçülmüyordu | **M11c**: kilit DOLU + sayaç 0 |
| 29 | DESEN HATASI | Mutasyon deseni bir YORUM satırı içeriyordu; koşucu "yorumsuz kodda 0 kez" dedi (doğru davranış) | Desen yorumsuz tek satıra indirildi |

**Kaynakta mutasyon için yapılan üç düzenleme** (davranış DEĞİŞMEDİ, yalnız desen benzersizliği): `meydanOkumayiCoz` içindeki `hesapKapisi` çağrısı en dar şekli açıkça geçirir (`kullaniciAl`dakinden metinsel ayrışsın) · zorunlu kurulumun beklenen amacı tek sabit (`ZORUNLU_AMAC`) · M8 casusu null-güvenli.

**Tasarımdan sapma (gerekçeli):** tablo #8'i M9'a bağlıyordu. Ölçüldü: `mfaSonAdim` koşulunu `where`'den silmek M9'u (sıralı ikinci kullanım) KIRMIZIYA DÖNDÜRMEZ — o senaryoyu `totpDogrula`nın kendi tekrar reddi (F2a) yakalar. #8'in gerçek etkisi yarış korumasıdır ve onu **M8'in casus assert'i** ölçer.
## Kabul ölçütleri (§11-F2b)

| # | Ölçüt | Durum | Kanıt |
|---|---|---|---|
| 1 | Tam paket yeşil + `npx next build`; `test:migration`, `test:faz5` (D7) yeşil | **SAĞLANDI** | regresyon 89/0/9 · build çıkış 0 · `test:faz5` 74/0 |
| 2 | Kontrollerin tamamı geçer; mutantların HEPSİ öldü — özellikle M5/M6, M14b/M14c, M15b/M15c | **SAĞLANDI** | 162/0 · mutasyon 29/29 (mutant #1→M6, #2→M5, #18→M14b, #19→M14e, #27→M14c, #20→M15b, #21→M15c) |
| 3 | Meydan okuma token'ı hiçbir korumalı uçta oturum sayılmaz; MFA'sı açık hesapta parola tek başına sırrı değiştiremez | **SAĞLANDI** | M5 (gerçek `JwtStrategy.authenticate` → `fail`, `findUnique` HİÇ çağrılmadı) · M6 (katman 2) · M14b/M14c/M14e |
| 4 | Çalınmış token tek başına MFA kuramaz ve MFA işlemleriyle "taze" `authAt` kazanamaz | **SAĞLANDI** | M15b (parolasız/yanlış parola → 400, bekleyen sır YAZILMADI) · M15c (`kurulumOnayla` ve `kapat` token'ı eski `authAt`ı kopyalar; `authAt`sız istekte alan YOK) |
| 5 | Oturumlu MFA uçları yanlış girdide 401 dönmez ve ön yüz kullanıcıyı atmaz; kişi sınırı durdurması bu uçları kapatmaz | **SAĞLANDI** | M11/M15b/M16 (400) · M27 (`@KoltukDisiIzinli` beş oturumlu metotta TAM) · vitest D4 (oturumlu MFA uçları `KIMLIK_UCLARI`'nda YOK — negatif kriter) |
| 6 | Yönetici MFA'sız token'la panele giremez; normal kullanıcı ve E2E altın yol etkilenmez | **KISMEN** | M7 sağlandı; normal kullanıcı M4/M7-ÖLÇÜT ile sağlandı. **E2E altın yol KOŞULMADI** (bkz. Ölçülemeyenler + Açık riskler 1) |
| 7 | Firma zorunluluğu davet kabulünde de uygulanır; kurumsal girişte yalnız kişisel MFA sorulur | **SAĞLANDI** | M3b (yanıtta `token` anahtarı YOK, kullanıcı yine oluşturuldu) · M21 (altı dal) |
| 8 | Paralel yanlış kod denemesi kilit sınırını aşamaz | **SAĞLANDI** | M11b: 25 paralel yanlış kod → sayaç TAM 20, TAM 5 istek `MFA_KILITLI`, kod doğrulaması ≤20 kez koştu (casus). ⚠ Gerçek eşzamanlılık değil, deterministik `Promise.all` (bkz. Ölçülemeyenler) |
| 9 | `KIMLIK_SIFRELEME_KEY` yokken uygulama açılır (`test:odeme` yeşil), MFA uçları 503 | **SAĞLANDI** | `test:odeme` tam pakette yeşil (tüm `AppModule`'ü kurar) · M22: `kurulumBaslat` 503, kod yolu 503, **kurtarma kodu yolu ÇALIŞIR** |
| 10 | Yeni ekranlar gözle ya da "gözle bakılmadı" raporun başında; Emre notu; deploy notu §10.2 D3 birebir | **SAĞLANDI (gözle bakılMADI, raporun başında yazılı)** | Emre notları ve deploy bölümü aşağıda |

### Emre'nin dört kararı — kodda nerede

| Karar | Kod | Test |
|---|---|---|
| Yöneticide **zorunlu**, diğerlerine isteğe bağlı | `mfa-karari.ts` `mfaZorunluMu` + `jwt.strategy.ts` ikinci kapı | M2 · M7 · M21 |
| Firma sahibi zorunlu kılabilir; **yalnız parolayla girenlere** | `girisKarariSaf` (`kurumsal` yolu `oturum` döner) + `firma.servisi.ts` `guvenlikGuncelle` | M3 · M19 · M21 |
| Kişi kendi açtıysa **kurumsal girişte de sorulur** (`mfaKaynagi`) | `girisKarariSaf` kurumsal dalı + `sirketGirisindeDeSor` | M21 · M26 |
| Oturumlu kurulum **parola ister**; yeniden basımda **`authAt` korunur** | `kurulumBaslat` `yenidenKimlikDogrula` + `kurulumOnayla`/`kapat` `{ authAt }` | M15b · M15c |
| Yanlış kod/parola **400**, kullanıcı atılmaz | `BadRequestException` + `KIMLIK_UCLARI` ayrımı | M11 · M15b · M16 · vitest D/D4 |
## Çürüyen öncüller (tasarımda yanlış yazılmış — adlarıyla)

1. **`frontend/ozellik/kimlik/` dizini YOKTU.** §11-F2b adım 15/16 bu yolu mevcut sayıyordu. F1b'nin kimlik yardımcıları `frontend/ortak/lib/` altındadır (`oturum.ts`, `kimlik-hata-metinleri.ts`, `api.ts`). Dizin bu turda AÇILDI ve `klasor-duzeni.txt`e **Q grubu** olarak ilan edildi (O ve P emsali); `KOD_HARITASI.md`ye "Q · KİMLİK ve İKİ ADIMLI GİRİŞ" bölümü eklendi.
2. **"Saf `tokenGecerliMi` yaz" talimatı gereksizdi:** fonksiyon F1b'de zaten var (`ortak/lib/oturum.ts:28`, adı **`gecerliTokenMi`**). Yeni fonksiyon YAZILMADI; korunan yerleşim mevcut olana bağlandı (tek kaynak).
3. **`metinler.ts` `:191` ve `:248` satır numaraları yanlıştı.** `:191` bir YORUM satırının ortası, `:248` "Haklarınız" bölümü. Gerçek yerler ölçüldü ve kullanıldı: aydınlatma envanteri `:153`, saklama süreleri `:230`, "Verilerin güvenliği" `:273`, kullanım koşulları md.3 `:319-323`.
4. **`UyeListesi` bileşeni YOK.** §6.5 onu adıyla anıyordu; üye listesi `firma/ekip/page.tsx` içinde satır içi `<table>`. MFA sütunu oraya eklendi.
5. **`qrcode-generator` kurulu değil.** §0.6 onu "tek yeni ön yüz bağımlılığı" diye anıyordu ve **Emre onayına** bağlamıştı; onay bu turda alınmadı → §0.6'nın kendi yazılı yedeği uygulandı.

**Tasarımda olmayan, ölçümle bulunan iki kaynak kapısı** (kod bunlara UYDURULDU, kapılar gevşetilmedi):

- `faz2-kullanici-yonetimi-test.ts:113` ve `guvenlik-turu-2-test.ts:128` `auth.service.ts` içinde **`hesapKapisi(`** metnini arıyor → `login`deki çağrı KALDIRILMADI (saf ve yan etkisiz; `girisKarari` de aynı kapıyı çağırır).
- `sunucu-urunleri-test.ts:197` (W1) `admin.service.ts`teki **İLK** `logger.error` etiketini nöbetçinin saydığı etiketle karşılaştırıyor. Yeni `mfaSifirla` metodunun log mesajı büyük harfle başlasaydı gerçek etiketi (`DENETIM-YAZILAMADI`) gölgeler ve **alarm kapısını sessizce çürütürdü** — mesaj küçük harfle başlatıldı, gerekçe koda yazıldı.
## Ölçülemeyenler (dürüst liste)

- **Tarayıcıda gözle kontrol: YAPILMADI** (raporun başında da yazılı). Yerleşim, hizalama ve akışın el yordamıyla kullanılabilirliği ölçülmedi.
- **React bileşenleri RENDER EDİLEREK ölçülmedi:** `@testing-library/react` bu depoda kurulu DEĞİL. Ön yüzde ölçülen: saf `girisDaliCoz` dallanması + kaynak kapıları (32 kontrol). Bileşenlerin gerçek DOM davranışı ölçülmedi.
- **Gerçek eşzamanlılık ölçülmedi:** Node tek iş parçacıklı; `Promise.all` yalnız `await` noktalarında serpiştirir. Yarış senaryoları (M10, M11b, M12d, M14e) sahte Prisma üzerinde DETERMİNİSTİK kuruldu. **Gerçek PostgreSQL kilidi ve gerçek paralel istek ÖLÇÜLMEDİ.**
- **Gerçek doğrulama uygulaması (Google/Microsoft Authenticator) ile kurulum DENENMEDİ.** TOTP çekirdeği F2a'da RFC vektörleriyle ölçüldü; `otpauth://` URI'sinin gerçek uygulamada okunması ölçülmedi.
- **SMTP ölçülmedi:** e-posta metinleri saf fonksiyon olarak üretilir, gönderim sahte serviste sayılır; gerçek gönderim denenmedi.
- **`backend/scripts/mfa-sifirla.ts` KOŞULMADI** (tasarım gereği). Yalnız saf `sifirlamaPlaniUret` ve PROVA sırası (yazma `--uygula` kontrolünden SONRA) ölçüldü.
- **E2E altın yol KOŞULMADI** (Playwright; bu turda sunucu ayağa kaldırılmadı). Giriş akışı değiştiği için deploy öncesi koşulmalı — bkz. Açık riskler.
- **Node 20 ile koşulmadı** (yerelde v24.14.0). F2b yeni bir Node API kullanmıyor; F2a'nın Node 20 tablosu geçerli.
- **Ücretsiz/paketli müşteri sayısı, kaç kişinin MFA açacağı gibi kullanım tahminleri YAPILMADI** (ölçüm yok).
## Emre notları (sade Türkçe, kod terimsiz)

- **Yayından hemen sonra yönetim paneli sizden telefon isteyecek.** Yönetici hesaplarında iki adımlı giriş artık zorunlu. Elinizdeki açık oturum bir sonraki tıklamada düşecek, giriş ekranına yönlendirileceksiniz; parolanızı girdikten sonra ekran "Şimdi kuralım" diyecek ve telefonunuzdaki doğrulama uygulamasına (Google Authenticator, Microsoft Authenticator, 1Password…) bir kurulum anahtarı yazmanızı isteyecek. Sonrasında ekranda **10 kurtarma kodu** çıkacak.
- **Kurtarma kodlarını mutlaka kaydedin.** O ekran bir daha gösterilmiyor; kodların sunucuda geri çevrilebilir bir kopyası YOK. Telefonunuzu ve kodları birlikte kaybederseniz hesabınıza dönmenin tek yolu başka bir yöneticinin sıfırlaması ya da sunucuda bir betik çalıştırmak olur.
- **Ekibinize zorunlu kılabilirsiniz.** Ekip sayfasında "Firmamdaki herkes iki adımlı giriş kullansın" anahtarı var. Açmadan önce KENDİ hesabınızda açmanız gerekiyor (aksi hâlde sistem izin vermiyor). Açtığınız anda MFA'sı olmayan üyelerin açık oturumları kapanır ve bir sonraki girişlerinde kurulum ekranına düşerler.
- **Telefonu olmayan bir çalışan için:** yönetim panelindeki kullanıcı satırında "iki adımlı girişi sıfırla" düğmesi var. Parolayı DEĞİŞTİRMEZ, yalnız ikinci adımı kaldırır ve kişinin açık oturumlarını kapatır. Kendi hesabınızı oradan sıfırlayamazsınız (bilinçli).
- **Kodu yanlış yazmak sizi uygulamadan ATMAZ.** Yanlış kod/parola "hata" der, ekranda kalırsınız. Ama art arda 20 yanlış denemede doğrulama adımı kilitlenir; kilidi "Parolamı unuttum" ile parola sıfırlayarak ya da yöneticiye sıfırlatarak açabilirsiniz. Parola sıfırlamak iki adımlı girişi KAPATMAZ — yalnız kilidi açar.
- **QR kodu şimdilik yok.** QR çizmek için dışarıdan yeni bir paket kurmamız gerekiyor ve o paket **sizin onayınıza** bağlıydı; onay gelmediği için ekranda QR yerine **elle yazılacak anahtar** ve telefondan tıklanabilen bir bağlantı var. Doğrulama uygulamalarının hepsi "kurulum anahtarını elle gir" seçeneğini destekliyor. Onay verirseniz tek bir ekran dosyası değişecek.
- **Hukuki metinlerin sürümü 17 Eylül'den 20 Eylül'e çıktı.** Aydınlatma metnine "iki adımlı giriş açıksa şunları saklıyoruz", kullanım koşullarına "kurtarma kodlarınız sizin sorumluluğunuzda" cümleleri eklendi. **Avukat onayı GEREKİR** — metinler hâlâ taslak durumunda.
- **Yeni bir sunucu ayarı gerekiyor: `KIMLIK_SIFRELEME_KEY`.** Bu, telefon uygulamasıyla paylaşılan gizli anahtarı veritabanında şifreli tutmak için. **Eksikse uygulama yine açılır** ama iki adımlı giriş ekranları "şu an kullanılamıyor" der. Yani deploy sırasında bu değer konmazsa yönetici paneli kapalı kalır. Değeri koyduktan sonra konteyneri **yeniden yaratmak** gerekiyor; sadece "yeniden başlat" demek ortam değişkenini güncellemiyor.
- **Gözle bakılmadı.** Yeni ekranları tarayıcıda hiç açmadım (yalıtılmış çalışma kopyasında önizleme açılamıyor). Deploy öncesi bir tur gerekir.
## Deploy notları (tasarım §10.2 "D3" satırı — birebir uygulanmalı)

**Genel kural (CLAUDE.md 14.09):** kırmızı CI koşumuyla deploy YOK. Bu commit'in `regression-gate` koşumu yeşil olmadan canlıya çıkılmaz.

### 1) Deploy'dan ÖNCE: `.env`'e yeni ortam değişkeni (yazan: **Emre**; ajanlar `.env`'e dokunmadı)

```
KIMLIK_SIFRELEME_KEY=<openssl rand -base64 32 çıktısı, tek satır>
```

Değeri **yazdırmadan** kontrol (`.env`'in bulunduğu dizinde):

```
grep -c '^KIMLIK_SIFRELEME_KEY=' .env                          # → 1
grep -cE '^KIMLIK_SIFRELEME_KEY=[A-Za-z0-9+/]{43}=$' .env      # → 1
```

> `docker-compose.yml`deki `KIMLIK_SIFRELEME_KEY: ${KIMLIK_SIFRELEME_KEY:-}` satırı ve `.env.example` açıklaması **F2a'da zaten eklendi**; bu turda dokunulmadı.

### 2) Migration

`20260920120000_faz7_iki_adimli_giris` — deploy'un mevcut migration adımında koşar. Deploy günlüğünde migration adının geçtiği ÖLÇÜLÜR. Yalnız EKLER; geri alma bloğu dosyanın sonunda yorum olarak duruyor.

### 3) Konteyner **YENİDEN YARATILIR** — "restart" YETMEZ

`docker compose restart` ortam değişkenini GÜNCELLEMEZ. Deploy günlüğünde backend için "Recreate/Recreated" görülmezse:

```
docker compose up -d --force-recreate backend
```

Sonra çalışan konteynerde anahtarın gerçekten göründüğü ölçülür (değer BASILMAZ):

```
docker compose exec -T backend node -e "const s=process.env.KIMLIK_SIFRELEME_KEY||'';console.log(/^[A-Za-z0-9+/]{43}=$/.test(s)&&Buffer.from(s,'base64').length===32?'var':'yok-ya-da-bozuk')"
```
→ `var` beklenir.

### 4) Deploy sonrası ölçüm

| # | Ne ölçülür | Beklenen |
|---|---|---|
| 1 | Yöneticinin açık oturumu | Sonraki tıklamada 401 → `/login` |
| 2 | Yönetici parolayla girer | "Şimdi kuralım" (kurulum sihirbazı) — token DEĞİL |
| 3 | Kurulum anahtarı → uygulamaya elle girilir → kod | 10 kurtarma kodu ekranı, sonra panel |
| 4 | Normal kullanıcı girişi | DEĞİŞİKLİK YOK (token + panel) |
| 5 | Profil → İki adımlı giriş → "Aç" | Önce PAROLA ister (deneme hesabıyla) |
| 6 | Ekip sayfası (deneme firması) | "İki adımlı giriş" sütunu + sahip anahtarı; anahtar sahip kendi MFA'sını açmadan PASİF |
| 7 | Yanlış kod | Ekranda kalır, "Kod hatalı" — **oturumdan atılmaz** |
| 8 | Hukuki sayfalar | Metin sürümü **2026-09-20** |

⚠ **Anahtar yoksa** MFA uçları 503 döner ve yönetici panele GİREMEZ (bilinçli güvenli taraf, §4.6). Bu yüzden 1. adım deploy'dan ÖNCE yapılmalı.

⚠ **Anahtar kaybı**: `KIMLIK_SIFRELEME_KEY` kaybolursa/değişirse bütün TOTP sırları çözülemez → kullanıcılar kurtarma koduyla girer, yöneticiler panelden sıfırlar. `sir-dondur.sh` bu anahtarı DÖNDÜRMEZ (F2a'da kapsam testine yazıldı); kapsam raporundaki "⚠ ATLANDI — sağlayıcı panelinden döndürülür" satırı bu anahtar için YANILTICIDIR (betik bu turda değişmedi).

⚠ **Son yönetici telefonunu kaybederse**: sunucuda `docker compose exec -T backend npm run mfasifirla -- --eposta <adres>` (önce PROVA, sonra `--uygula`). Betik **bu turda KOŞULMADI**.
## Açık riskler (öncelik sırasıyla)

1. **E2E altın yol koşulmadı ve giriş akışı DEĞİŞTİ.** `test/e2e-golden` giriş adımında token bekliyorsa ve o hesap MFA'lı/zorunlu duruma düşerse paket kırmızıya döner. Normal (MFA'sız, firması zorunlu olmayan) kullanıcıda yanıt şekli aynı kaldığı için büyük olasılıkla etkilenmez — ama **ölçülmedi**. Deploy öncesi `npm run test:e2e-golden` koşulmalı.
2. **Gözle bakılmadı.** Altı yeni bileşen hiç render edilmedi. En muhtemel kusur türü: yerleşim/hizalama, `firma/ekip` sayfasının koyu temasında yeni kartın kontrastı, profil kartındaki alanların dar ekranda taşması.
3. **`KIMLIK_SIFRELEME_KEY` konmadan deploy edilirse yönetici paneli KAPALI kalır.** Bu bilinçli güvenli taraf ama operasyonel bir tuzak: deploy kontrol listesinin 1. maddesi.
4. **Hukuki metin AVUKAT ONAYSIZ** (`HUKUKI_METIN_DURUMU = 'taslak'`). Sürüm 2026-09-20'ye çekildi; eski sürümü onaylamış kullanıcılardan yeniden onay istenip istenmeyeceği hâlâ ürün/hukuk kararı (tasarım §7.3, kod bu turda da yazılmadı).
5. **Kurtarma kodu e-postası ve "5 hatalı" uyarısı best-effort.** SMTP düşerse kullanıcı bilgilendirilmez; akış yine tamamlanır. Bilinçli (bilgi e-postası bir kapı değildir) ama kayıt altında.
6. **"5 hatalı deneme" uyarı e-postası tam eşikte okunan değere bakar.** Birebir aynı anda gelen iki istek eşiği atlayabilir ve uyarı GİTMEYEBİLİR. Kapı değil bilgidir; **asıl kapı** rezervasyonun `mfaHataSayaci < 20` koşuludur ve o atomiktir (M11b ile ölçüldü). Koda da bu şekilde yazıldı.
7. **`change-password` ve `hesabimi-kapat` hâlâ yanlış parolada 401 dönüyor** (`parola.servisi.ts:187`, `hesap.servisi.ts:206`). Aynı aile, tasarım §10.5'te "bu turda düzeltilmez" deniyor — DOKUNULMADI. Kullanıcı o iki ekranda parolayı yanlış yazarsa hâlâ oturumdan atılır.
8. **QR kodu yok.** Kullanıcı deneyimi açısından en görünür eksik. Emre onayı gelirse `qrcode-generator@2.0.4` kurulup `KurulumAnahtari.tsx`e `<img src="data:…">` eklenmesi yeterli (CSP `img-src 'self' data:` `Caddyfile:52`de zaten izinli).
9. **`MfaKurtarmaKodu` tablosunda temizlik işi yok.** Kapatma ve sıfırlama satırları siliyor; ama bir hesap yumuşak silinirse kodlar kalır (FK `ON DELETE CASCADE` yalnız SERT silmede çalışır ve bu depoda sert silme yok). Zararsız (özet, ~50 bit, bcrypt) ama kayıt altında.
