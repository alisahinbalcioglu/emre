/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F1b — UYELIK KURALLARI (saf fonksiyonlar + firma kilidi)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Buradaki her kural TEK YERDE durur. Ikizlenirse (davet sayan bir yer,
 *  ekip listesini dizen baska bir yer) ikisi ayri zamanlarda degisir ve
 *  "ekranda 2/3 yaziyor ama davet KOLTUK_DOLU diyor" sinifindan sessiz
 *  celiskiler uretir. Bu depoda o hata sinifi olculmus bir gecmise sahiptir
 *  (`erisim-durumu.ts` ikizi, `Math.max(tier, abonelik)` ikili kaynagi).
 *
 *  ⚠ SAF OLANLAR (DB YOK): `etkinHesapKosulu`, `bekleyenDavetKosulu`,
 *  `koltukKarari`, `koltukSirasiKarari`, `oncekilerKosulu`, `ayrilmaKarari`,
 *  `kapatmaVerisi`, `topluKapatmaVerisi`, `imhaTarihiHesapla`.
 *  Hepsi testte DB'siz olculur.
 *  ⚠ DB ISTEYENLER: `firmaKilitliIslem` (advisory lock) ve
 *  `koltukDurumuHesapla` (sayim + hak sorgusu) — ikisi de sahte Prisma ile
 *  olculur.
 */

/** Firma rolu — semadaki `FirmaRol` enum'unun dizge karsiligi. */
export type FirmaRol = 'sahip' | 'uye';

/**
 * ETKIN HESAP — koltuk tutan, sirada yer alan hesap.
 *
 * ⚠ TEK TANIM: koltuk sayimi (§3.4), kisi sinirinin sirasi (§3.12) ve ekip
 * listesi bunu kullanir. Banli hesap koltuk TUTMAZ (parasi odenen bir yeri
 * kullanmiyor); bani kalkinca sıraya KATILMA ZAMANIYLA geri girer, en sona
 * atilmaz.
 */
export function etkinHesapKosulu(): { deletedAt: null; status: 'active' } {
  return { deletedAt: null, status: 'active' };
}

/**
 * BEKLEYEN DAVET — henuz kabul edilmemis, iptal edilmemis, suresi gecmemis.
 * ⚠ TEK TANIM: hem sayim hem liste bunu kullanir (`sonGecerlilik > simdi`).
 */
export function bekleyenDavetKosulu(simdi: Date): {
  kabulAt: null;
  iptalAt: null;
  sonGecerlilik: { gt: Date };
} {
  return { kabulAt: null, iptalAt: null, sonGecerlilik: { gt: simdi } };
}

export type KoltukNedenKodu = 'PAKET_EKIP_YOK' | 'KOLTUK_DOLU';

/**
 * KOLTUK KAPISI — yeni bir kisi bu firmaya girebilir mi?
 *
 * `hak` = firmanin aboneligindeki `Paket.kullaniciHakki` (FIRMA SAHIBI
 * DAHIL sayilir, Emre karari E-2: Basic 1 · Pro 2 · Pro-MEP 3).
 *
 * ⚠ `hak <= 1` AYRI bir neden kodu dondurur (`PAKET_EKIP_YOK`): "koltuk
 * dolu" demek kullaniciya "birini cikarirsan davet edebilirsin" der, oysa
 * tek kisilik pakette EKIP OZELLIGI HIC YOKTUR ve dogru eylem paketi
 * yukseltmektir. Aboneligi olmayan firmada `hak` 0 gelir — ayni dal.
 *
 * ⚠ KESIN KUCUK (`<`): mevcut etkin hesaplar + bekleyen davetler yeni
 * kisiyle birlikte hakki asmamali. `<=` yazilmasi tam bir kisi fazla
 * alirdi (mutant #1).
 */
export function koltukKarari(g: {
  etkinHesap: number;
  bekleyenDavet: number;
  hak: number;
}): { izin: boolean; nedenKodu?: KoltukNedenKodu } {
  if (g.hak <= 1) return { izin: false, nedenKodu: 'PAKET_EKIP_YOK' };
  if (g.etkinHesap + g.bekleyenDavet < g.hak) return { izin: true };
  return { izin: false, nedenKodu: 'KOLTUK_DOLU' };
}

/**
 * KISI SINIRI SIRASI (§3.12, Emre karari E-3) — bu hesap calisiyor mu?
 *
 * Paket kuculdugunde (ya da hak dusurulduğunde) kimse SILINMEZ; hakki asan
 * hesaplar durdurulur. Karar TURETILIR, saklanmaz: hak degisikligi betik,
 * webhook, havale ve yonetici gibi cok kaynaktan gelir; saklanan bir bayrak
 * o kaynaklardan birinde bayatlardi (hafiza dersi: turetilen hucre yan
 * etkiye baglanmaz).
 *
 * ⚠ `Math.max(hak, 1)`: hak 0 (abonelik satiri var ama paket hakki 0) ya da
 * 1 iken bile EN ESKI SAHIP calisir — yoksa firma sahibi kendi paketini
 * yukseltemez duruma duserdi (kilitlenme). Mutant #37 bunu olcer.
 * ⚠ `hak === null` (firmanin Abonelik satiri YOK) → kural uygulanmaz;
 * erisim karari zaten ayri bir kapidir.
 */
export function koltukSirasiKarari(g: {
  onceGelen: number;
  hak: number | null;
}): { iceride: boolean } {
  if (g.hak === null) return { iceride: true };
  return { iceride: g.onceGelen < Math.max(g.hak, 1) };
}

/**
 * SIRADA BENDEN ONCE GELENLERIN kosulu (Prisma `OR` dallari).
 *
 * Siralama: once `sahip`ler (createdAt artan, esitlikte id artan), sonra
 * `uye`ler (ayni ikili sira).
 *
 * ⚠ SAHIPLER HER ZAMAN ONCE: "herkesi sahip yap, sonra kucult" atlatmasi
 * boylece kapanir — sahip sayisi hakki asarsa fazla SAHIPLER de durur
 * (yalniz en eskisi kalir). Uye dalindan `{ firmaRol: 'sahip' }` satiri
 * silinirse (mutant #38) sahipler uyelerden sonra sayilir ve atlatma acilir.
 */
export function oncekilerKosulu(user: {
  firmaRol: FirmaRol;
  createdAt: Date;
  id: string;
}): Record<string, unknown>[] {
  const oncekiAyniGrup = [
    { firmaRol: user.firmaRol, createdAt: { lt: user.createdAt } },
    { firmaRol: user.firmaRol, createdAt: user.createdAt, id: { lt: user.id } },
  ];
  if (user.firmaRol === 'sahip') return oncekiAyniGrup;
  return [{ firmaRol: 'sahip' as const }, ...oncekiAyniGrup];
}

export type AyrilmaKarari =
  | { izin: true; firmaKapaniyor: boolean }
  | { izin: false; kod: 'SON_SAHIP' };

/**
 * AYRILMA KARARI — hesap kapatma · uye cikarma · yonetici silme IKIZI
 * (§3.8, Emre karari E-1 · 21.09 plan 5.8 K2).
 *
 * `digerHesap`      = ayni firmada `deletedAt IS NULL` BASKA hesap sayisi.
 *                     ⚠ BANLI HESAP DE SAYILIR — Emre'nin "firmanin tek
 *                     kullanicisi" olcusu budur; banli bir uyesi olan firma
 *                     "tek kullanicili" degildir, aboneligi iptal edilmez.
 * `digerEtkinSahip` = bunlardan `firmaRol: 'sahip'` VE `status: 'active'`.
 * `firmayiKapatabilir` = bu YOL firmayi kapatma yetkisi tasiyor mu. YALNIZ
 *                     kisinin KENDI kapatmasi tasir (K2). Yonetici silmesi ve
 *                     uye cikarma tasimaz: yonetici panelinden bir satira
 *                     yanlis basmak butun bir firmayi kapatamamali — o yolun
 *                     cikisi `updateFirmaRol` ile baska birini sahip yapmak.
 *
 * ── TEK CIKTI: `firmaKapaniyor` ──────────────────────────────────────────
 * Onceki surumde IKI bayrak vardi (`abonelikIptal`, `sonHesap`) ve ikisi de
 * HER ZAMAN ayni degeri tasiyordu; ucuncu bir bayrak eklemek (K2 ile gelen
 * "uyeleri durdur") ucuzunun ayri zamanlarda degismesi riskini getirirdi —
 * bu depoda olculmus hata sinifi. Artik TEK soru var: "bu ayrilmadan sonra
 * firmada CALISAN kimse kaliyor mu?" Cevap hayirsa:
 *   · abonelik iptal edilir (kart cekilmeye devam etmesin)
 *   · bekleyen davetler iptal edilir (kapanan firmaya katilim olmasin)
 *   · `Firma.imhaTarihi` yazilir (30 gun sonra firma verisi imha edilir)
 *   · geride kalan hesaplar `firmaKapandi` ile kapatilir (varsa)
 * Son madde `digerHesap === 0` dalinda HICBIR SATIRA dokunmaz (toplu yazma
 * dogal olarak 0 satir gunceller) — bu yuzden ayri bir bayrak gerekmiyor.
 *
 * ⚠ ABONELIK IPTALI HER KAPATMADA DEGIL. Bugunku kod (07.09 oncesi) her
 * hesap kapatmada iptal ediyordu: ucuncu uye hesabini kapatinca FIRMANIN
 * aboneligi iptal oluyordu (olculdu, sahte Prisma ile).
 */
export function ayrilmaKarari(g: {
  firmaRol: FirmaRol;
  digerHesap: number;
  digerEtkinSahip: number;
  firmayiKapatabilir?: boolean;
}): AyrilmaKarari {
  if (g.digerHesap === 0) {
    return { izin: true, firmaKapaniyor: true };
  }
  if (g.firmaRol === 'sahip' && g.digerEtkinSahip === 0) {
    // K2 (21.09): son sahip ARTIK kapatabilir — firma kapanir ve uyeler
    // durur. Yalniz kendi kapatma yolunda; diger yollar hâlâ SON_SAHIP.
    if (g.firmayiKapatabilir) return { izin: true, firmaKapaniyor: true };
    return { izin: false, kod: 'SON_SAHIP' };
  }
  return { izin: true, firmaKapaniyor: false };
}

/**
 * HESAP KAPATMA NEDENI — semadaki `KapatmaNedeni` enum'unun dizge karsiligi.
 * Dort kapatma yolu (Ö1) bugune kadar ayirt edilemiyordu; K1 istisnasi buna
 * bagli.
 */
export type KapatmaNedeni = 'kendi' | 'yonetici' | 'ekiptenCikarildi' | 'firmaKapandi';

/**
 * GERI DONUS SURESI (K1) — kapatilan hesabin verisi kac gun saklanir.
 * TEK KAYNAK: e-posta metni, profil metni ve gizlilik metni bu sayiyi
 * gosterir; imha isi (`imhaTarihi`) bu sayidan turer.
 */
export const KAPATMA_SAKLAMA_GUN = 30;

/** Kapatma aninin uzerine saklama suresini ekler. Saf, DB yok. */
export function imhaTarihiHesapla(simdi: Date): Date {
  return new Date(simdi.getTime() + KAPATMA_SAKLAMA_GUN * 24 * 60 * 60 * 1000);
}

/**
 * KAPATMANIN KISIYE BAGLI OLMAYAN ALANLARI — cok hesabi AYNI ANDA kapatan
 * yol (firma kapanisinda uyeler) bunu `updateMany` ile yazar.
 *
 * · `deletedAt`         → giris ve token kapisi
 * · `passwordChangedAt` → elindeki token ANINDA olur (jwt.strategy `iat`)
 * · `imhaTarihi`        → imha isinin BAKTIGI TEK ALAN (`deletedAt` DEGIL).
 *                         Ayni `simdi` ile cagrilan her hesap AYNI tarihi
 *                         alir — firma kapanisinda sahip ve uyeler tek
 *                         tarihte imha olur (§3.2).
 * · `kapatmaNedeni`     → K1 istisnasinin ve geri acmanin dayanagi.
 */
export function topluKapatmaVerisi(
  simdi: Date,
  neden: KapatmaNedeni,
): {
  deletedAt: Date;
  passwordChangedAt: Date;
  imhaTarihi: Date;
  kapatmaNedeni: KapatmaNedeni;
} {
  return {
    deletedAt: simdi,
    passwordChangedAt: simdi,
    imhaTarihi: imhaTarihiHesapla(simdi),
    kapatmaNedeni: neden,
  };
}

/**
 * TEK HESABIN KAPATMA VERI DESENI — dort yol da (kendi kapatma ×2, uye
 * cikarma, yonetici silme) BIREBIR ayni satirlari yazar (R1-D7).
 *
 * Ortak alanlar `topluKapatmaVerisi`den GELIR — iki fonksiyon arasinda
 * ikizlenme olamaz. Buraya yalniz KISIYE BAGLI iki alan eklenir:
 *
 * · `kapatilanEposta` → kapatma anindaki adres; denetim/ispat izi.
 * · `email`           → YALNIZ `ekiptenCikarildi` yolunda anonimlesir.
 *
 * ── E-POSTA NEDEN ARTIK ANONIMLESMIYOR (K1, 21.09) ───────────────────────
 * Eski hâl adresi HER kapatmada `kapali-<id>@metapricex.invalid` yapiyordu.
 * K1 ile musteri 30 gun boyunca AYNI e-posta ve parolayla girip paket
 * secerek geri donebiliyor; adres anonimlesirse ne giris ne de "Parolamı
 * unuttum" onu bulabilir — geri donus yolu kapanirdi.
 *
 * ── K1 ISTISNASI: `ekiptenCikarildi` ─────────────────────────────────────
 * Firma sahibinin ekipten cikardigi kisi AYRILMAYI SECMEDI. Adresi 30 gun
 * kilitli kalsaydi baska bir firmanin davetini kabul edemezdi (`User.email`
 * @unique). Onun adresi bugunku gibi HEMEN serbest kalir.
 *
 * ⚠ TEKLIFLER SILINMEZ (sert silme yasak; `Quote.onDelete: Cascade`).
 */
export function kapatmaVerisi(
  user: { id: string; email: string },
  simdi: Date,
  neden: KapatmaNedeni,
): {
  deletedAt: Date;
  passwordChangedAt: Date;
  imhaTarihi: Date;
  kapatmaNedeni: KapatmaNedeni;
  kapatilanEposta: string;
  email?: string;
} {
  return {
    ...topluKapatmaVerisi(simdi, neden),
    kapatilanEposta: user.email,
    // `.invalid` RFC 2606 ile ayrilmis TLD'dir.
    ...(neden === 'ekiptenCikarildi'
      ? { email: `kapali-${user.id}@metapricex.invalid` }
      : {}),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  GERI ACMA BURADA DEGIL — `abonelik.servisi.ts` `firmayiGeriAc` (§4.6)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Odeme sonrasi geri acmanin kosulu (`GERI_ACILAN_KAPATMA_NEDENLERI` =
 *  `kendi` + `firmaKapandi`) ve yazdigi veri O DOSYADADIR. Burada ikinci bir
 *  "hangi hesaplar doner" kurali TUTULMAZ: ikisi ayri zamanlarda degisir ve
 *  gun gelir `ekiptenCikarildi` bir kisi sessizce ekibe geri duserdi.
 *  Kapatma tarafi (bu dosya) hangi NEDENI yazdigini belirler; geri acma
 *  tarafi o nedenleri okur. Sozlesme `KapatmaNedeni` tipidir.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** `disKimlikleriSil`in ihtiyac duydugu en dar Prisma yuzeyi. */
export type DisKimlikPrisma = {
  kullaniciDisKimlik: { deleteMany(args: any): Promise<{ count: number }> };
};

/**
 * KAPATMA AKISININ DIS KIMLIK AYAGI (FAZ 7 F3b, §5.11) — TEK FONKSIYON.
 *
 * UC TUKETICI: hesap kapatma, uye cikarma, yonetici silme. Ucu de AYNI
 * transaction icinde cagirir; ayri ayri yazilsaydi biri gunun birinde
 * unutulur ve KAPATILMIS bir hesap sirket hesabiyla GERI ACILIRDI (dis
 * kimlik satiri `(issuer, subject)` eslemesini surdururdu).
 *
 * ⚠ `kapatilanEposta` uzerinden ASLA esleme yapilmaz: kisi ayni kurumsal
 * kimlikle YENI bir hesap olarak katilabilir — eski hesabina donemez.
 */
export async function disKimlikleriSil(tx: DisKimlikPrisma, userId: string): Promise<void> {
  await tx.kullaniciDisKimlik.deleteMany({ where: { userId } });
}

/** `firmaKilitliIslem`in ihtiyac duydugu en dar Prisma yuzeyi. */
export type KilitliPrisma = {
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
};

/**
 * FIRMA KILIDI — uyelik degistiren HER islem bu kilitte karar verir ve yazar.
 *
 * Anahtar `firma-uyelik:<firmaId>` (P2'nin `ceviri-kota:` / `ceviri-ortak:` /
 * `ceviri-duzeltme:` oneklerinden farkli — olculdu). Bicim
 * `ceviri-kota.servisi.ts:499` ile BIREBIR: `::text` sart, cunku `void`
 * donen bir `$queryRaw` Prisma'da cozulemez.
 *
 * Neden gerekli: iki davet ayni anda kabul edilirse ikisi de "1 koltuk bos"
 * gorup ikisi de girerdi; son sahip ayni anda iki yerden dusurulurse firma
 * SAHIPSIZ kalirdi. Sayim + karar + yazma ayni kilitte olmak zorunda.
 *
 * ⚠ DIS CAGRI (abonelik iptali, e-posta) BU KILIDIN ICINDE OLMAZ: HTTP
 * cagrisi kilidi dakikalarca tutabilir. Iptal commit'ten SONRA cagrilir.
 */
export async function firmaKilitliIslem<T>(
  prisma: KilitliPrisma,
  firmaId: string,
  fn: (tx: any) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`firma-uyelik:${firmaId}`}))::text AS kilit`;
    return fn(tx);
  });
}

/** `koltukDurumuHesapla`nin ihtiyac duydugu en dar Prisma yuzeyi. */
export type KoltukPrisma = {
  user: { count(args: any): Promise<number> };
  abonelik: { findUnique(args: any): Promise<any> };
};

/**
 * KOLTUK DURUMU — TEK YARDIMCI (§3.12 madde 1).
 *
 * `JwtStrategy.validate` (her istek) VE oturum yaniti (`login`/`register`/
 * `davet-kabul`, strateji hic kosmadigi icin) AYNI fonksiyonu cagirir. Ikiz
 * yazilsaydi biri "durduruldu" der, digeri demezdi.
 *
 * ⚠ MALIYET: `onceGelen === 0` ise hak sorgusu ATILMAZ. Tek kisilik firmada
 * (musterilerin cogunlugu) istek basina ek maliyet TEK `count`tur.
 */
export async function koltukDurumuHesapla(
  prisma: KoltukPrisma,
  user: { id: string; firmaId: string; firmaRol: FirmaRol; createdAt: Date },
): Promise<{ durduruldu: boolean; hak: number | null }> {
  const onceGelen = await prisma.user.count({
    where: {
      firmaId: user.firmaId,
      ...etkinHesapKosulu(),
      NOT: { id: user.id },
      OR: oncekilerKosulu(user),
    },
  });
  if (onceGelen === 0) return { durduruldu: false, hak: null };

  const abonelik = await prisma.abonelik.findUnique({
    where: { firmaId: user.firmaId },
    select: { paketSurumu: { select: { paket: { select: { kullaniciHakki: true } } } } },
  });
  const hak: number | null =
    typeof abonelik?.paketSurumu?.paket?.kullaniciHakki === 'number'
      ? abonelik.paketSurumu.paket.kullaniciHakki
      : null;
  const { iceride } = koltukSirasiKarari({ onceGelen, hak });
  return { durduruldu: !iceride, hak };
}
