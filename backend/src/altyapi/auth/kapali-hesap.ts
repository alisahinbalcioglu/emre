/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PLAN 5.8 §4 — KAPALI HESAP: GIRIS ve ERISIM KARARI (SAF, TEK KAYNAK)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre'nin K1 karari: kapanan hesabin e-postasi 30 gun hesapta kalir ve
 *  musteri AYNI adres/parolayla girip PAKET SATIN ALARAK geri doner. Bu
 *  dosya o kararin iki sorusunu yanitlar:
 *
 *    1. `geriDonusPenceresinde` → "bu kapali hesap GIRIS yapabilir mi?"
 *    2. `kapaliHesapDurumu`     → "girdikten sonra NE YAPABILIR?"
 *
 *  ⚠ NEDEN AYRI (ve neden import'suz) BIR DOSYA:
 *  Ayni yuklemi hem kimlik katmani (`oturum.servisi.ts`, `jwt.strategy.ts`,
 *  `auth.service.ts`, `parola.servisi.ts`) hem de odeme katmani
 *  (`erisim.servisi.ts`) okuyor. Yuklem auth'a konsaydi
 *  `erisim.servisi → auth`, odemeye konsaydi `oturum.servisi → odeme`
 *  bagimliligi dogardi; `auth.service.ts` ZATEN `ErisimServisi`yi import
 *  ediyor (auth.service.ts:14), yani ikinci yon bir DONGU olurdu. Bu dosya
 *  HICBIR SEY import etmez: her iki katman da serbestce okur.
 *
 *  ⚠ IKIZ KURAL YASAGI (bu depoda olculmus hata sinifi — `feedback_ikizi_
 *  unutma`): "kapali mi" sorusuna cevap veren IKINCI bir yer yazmayin. Giris
 *  kapisi, token kapisi, 403 kapisi, `/auth/me` yaniti ve ekran metni
 *  BURADAN besleniyor; biri ayrisirsa kullanici 403 alip "her sey normal"
 *  yazan bir ekran gorur (Faz 7'de aynen yasandi, `auth.service.ts:351`).
 *
 *  ⚠ SAF: DB yok, tarih disaridan verilir. Testte DB'siz olculur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * `KapatmaNedeni` enum'unun DIZGE karsiligi.
 *
 * ⚠ `@prisma/client` TIPI BILEREK IMPORT EDILMEDI: bu dosyanin import'suz
 * kalmasi dongu korumasinin ta kendisi (bkz. baslik). Degerler semadaki
 * enum ile BIREBIR ayni; sapma olursa `geri-donus-test.ts` B1 kirmiziya
 * doner (sema metnini okuyup bu listeyle karsilastirir).
 */
export const KAPATMA_NEDENLERI = [
  'kendi',
  'yonetici',
  'ekiptenCikarildi',
  'firmaKapandi',
] as const;

export type KapatmaNedeniDegeri = (typeof KAPATMA_NEDENLERI)[number];

/**
 * GIRISE IZIN VEREN NEDENLER.
 *
 * ── NEDEN IKI TANE (Emre karari, 21.09) ─────────────────────────────────
 * Brief §3.2 tablosu `firmaKapandi` icin "giris kapali" diyordu; §3.3.4 ise
 * AYNI kisi icin "verilerini indirme hakki ACIK KALIR" diyordu. Olculdu:
 * `kapatmaVerisi` o uyeye `deletedAt` + `passwordChangedAt` yaziyor, yani
 * giris kapaninca elindeki token da oluyor ve o KVKK hakkina ulasabilecegi
 * HICBIR yol kalmiyordu. Iki maddeden biri yanlis olmak zorundaydi:
 *   · §3.2'nin satiri bir URUN ERISIMI kurali
 *   · §3.3.4 bir YASAL HAK
 * Bu depoda oncelik zaten yazili: "bir KVKK hakki odeme durumuna bagimli
 * olamaz" (`hesap.servisi.ts` basligi). Yasal hakki ulasilamaz kilan okuma
 * yanlis okumadir → `firmaKapandi` GIRIS YAPABILIR.
 *
 * ⚠ GIRIS ≠ URUN. `firmaKapandi` uyesi girer ve YALNIZ sunu gorur: §3.3.4'un
 * tek cumlesi + "Verilerimi indir" + "Cikis". "Paket sec" YOK (firmayi
 * SAHIBI geri acar, uye odeyemez) ve butun urun uclari 403 kalir.
 *
 * Kapali KALAN iki neden — onlarda §3.3.4 gibi bir istisna YOK:
 *   · `yonetici`          — yonetici sildi; kisi kendi kendine geri acamaz
 *   · `ekiptenCikarildi`  — adres HEMEN serbest; kisi yeni hesap acar
 */
export const GIRIS_ACIK_KAPATMA_NEDENLERI: readonly KapatmaNedeniDegeri[] = [
  'kendi',
  'firmaKapandi',
];

/**
 * FIRMA KAPANMASI YUZUNDEN kapanan hesap mi.
 *
 * ⚠ `kapaliHesapDurumu`nun `tip`ini bu belirler; `deletedAt`in VARLIGI
 * DEGIL. Olculdu: `firmaKapandi` uyesinin de `deletedAt`i dolu — yalniz
 * `deletedAt`e bakan bir kural ona "Hesabiniz kapatildi, verileriniz su
 * tarihte silinecek" der ve "Paket sec" dugmesi cizerdi. Oysa o kisi
 * hesabini kapatmadi ve odeme de yapamaz.
 */
export function firmaYuzundenKapandiMi(u: KapaliHesapGirdisi): boolean {
  return u.kapatmaNedeni === 'firmaKapandi';
}

/** Kapali hesap yuklemlerinin okudugu EN DAR kullanici sekli. */
export type KapaliHesapGirdisi = {
  deletedAt?: Date | null;
  kapatmaNedeni?: string | null;
  imhaTarihi?: Date | null;
  /** Kisinin BAGLI OLDUGU firmanin imha tarihi (`Firma.imhaTarihi`). */
  firmaImhaTarihi?: Date | null;
};

/** `kapaliHesapDurumu` cevabi. `tip` hangi CUMLENIN gosterilecegini secer. */
export type KapaliHesapDurumu = {
  kapali: boolean;
  /** `hesap` = kisi kendi kapatti · `firma` = firmasi kapandi · null = acik. */
  tip: 'hesap' | 'firma' | null;
  /** Verilerin silinecegi an. Bilinmiyorsa null (ekran tarihsiz cumle yazar). */
  imhaTarihi: Date | null;
};

const ACIK: KapaliHesapDurumu = { kapali: false, tip: null, imhaTarihi: null };

/**
 * GERI DONUS PENCERESI (K1) — "bu kapali hesap GIRIS yapabilir mi?"
 *
 * UC kosul birlikte aranir:
 *   1. Hesap gercekten kapali (`deletedAt` dolu) — acik hesap zaten girer,
 *      bu yuklem ona `false` doner ve cagiran ayri karar verir.
 *   2. Neden `kendi` (§3.2 tablosu; diger uc yolda giris kapali).
 *   3. `imhaTarihi` DOLU ve HENUZ GECMEMIS.
 *
 * ⚠ (3)'te `imhaTarihi` BOSSA `false` DONER ve bu KASITLI (fail-closed).
 * Migration backfill YAPMIYOR: bu turdan ONCE kapatilmis hesaplarin
 * `imhaTarihi`si bostur ve onlara 30 gunluk bir geri donus SOZ VERILMEDI.
 * Bos tarihi "sonsuz pencere" saymak, kapali her eski hesabi SURESIZ giris
 * yapabilir hale getirirdi.
 *
 * ⚠ SINIR: `imhaTarihi === simdi` → KAPALI (`>` kullaniliyor). Imha isi o
 * ani "vakti geldi" sayar (`imhaTarihi < simdi` degil, `<=` ile calisirsa
 * bile); iki taraf ayni ani ACIK sayarsa veri silinirken giris yapan bir
 * kullanici olurdu.
 */
export function geriDonusPenceresinde(
  u: KapaliHesapGirdisi,
  simdi: Date = new Date(),
): boolean {
  if (!u.deletedAt) return false;
  if (!GIRIS_ACIK_KAPATMA_NEDENLERI.includes(u.kapatmaNedeni as KapatmaNedeniDegeri)) {
    return false;
  }
  if (!u.imhaTarihi) return false;
  return u.imhaTarihi.getTime() > simdi.getTime();
}

/**
 * KAPALI HESAP DURUMU — "girdikten sonra ne yapabilir?"
 *
 * IKI kapanma var ve ikisi AYRI cumle gosterir:
 *   · `hesap` — kisi kendi kapatti (§4.4 ekrani: paket sec / indir / cikis)
 *   · `firma` — firmasi kapandi (§3.3.4: tek cumle + veri indirme)
 *
 * ⚠ ONCELIK `hesap`: son sahip kendi hesabini kapatinca HEM `User.deletedAt`
 * HEM `Firma.imhaTarihi` dolar. O kisiye "firma sahibiniz geri acarsa"
 * demek anlamsiz olurdu — sahip KENDISI.
 *
 * ⚠ `deletedAt` dolu ama pencerede DEGILSE (ornegin `yonetici`) yine
 * `kapali: true` doner. O hesap zaten giris yapamaz; ama token omru 7 gun
 * oldugu icin elinde gecerli token'i OLAN biri bu kapidan da gecmemeli.
 */
export function kapaliHesapDurumu(
  u: KapaliHesapGirdisi,
  _simdi: Date = new Date(),
): KapaliHesapDurumu {
  if (u.deletedAt) {
    // ⚠ TIP NEDENDEN GELIR, `deletedAt`ten DEGIL: `firmaKapandi` uyesinin de
    // `deletedAt`i doludur ama o kisi hesabini KAPATMADI ve odeme yapamaz.
    return {
      kapali: true,
      tip: firmaYuzundenKapandiMi(u) ? 'firma' : 'hesap',
      imhaTarihi: u.imhaTarihi ?? null,
    };
  }
  if (u.firmaImhaTarihi) {
    return { kapali: true, tip: 'firma', imhaTarihi: u.firmaImhaTarihi };
  }
  return ACIK;
}

/** `gun.ay.yil` — Emre'nin karari: tarih GUN olarak yazilir, "30 gun sonra" degil. */
export function imhaTarihiMetni(tarih: Date | null | undefined): string {
  if (!tarih) return '';
  const iki = (n: number) => String(n).padStart(2, '0');
  return `${iki(tarih.getDate())}.${iki(tarih.getMonth() + 1)}.${tarih.getFullYear()}`;
}

/**
 * EKRAN ve 403 GOVDESI AYNI CUMLEYI TASIR.
 *
 * ⚠ Metin BURADAN gelir, ekranda YAZILMAZ: kullanici hem giristen sonraki
 * ekranda hem de bir ucun 403 yanitinda ayni cumleyi gormeli. Iki yerde ayri
 * yazilsaydi biri gunun birinde digerinden sapardi (bu depoda olculdu:
 * `koltukDurumuHesapla` ikizi, `auth.service.ts:351`).
 */
export function kapaliHesapMetni(durum: KapaliHesapDurumu): string {
  if (durum.tip === 'firma') {
    return (
      'Firmanızın hesabı kapatıldı. Firma sahibiniz geri açarsa erişiminiz ' +
      'geri gelir.'
    );
  }
  const tarih = imhaTarihiMetni(durum.imhaTarihi);
  return tarih
    ? `Hesabınız kapatıldı. Verileriniz ${tarih} tarihinde silinecek.`
    : 'Hesabınız kapatıldı.';
}

/**
 * §4.3 — KAPALI ADRESLE KAYIT DENEMESI.
 *
 * ⚠ "Geri donmek isteyen musterinin en kolay dusecegi tuzak bu" (brief §4.3):
 * adresi hala hesapta oldugu icin kayit `Email already in use` derdi; musteri
 * bunu "adresim baskasinda kalmis" diye okur ve BASKA bir adresle YENI, BOS
 * bir hesap acardi — 30 gunluk verisi orada dururken.
 */
export const KAYIT_KAPALI_HESAP_MESAJI =
  'Bu adresle kapatılmış bir hesabınız var. Giriş yapıp hesabınızı geri ' +
  'açabilirsiniz.';

/**
 * ⚠ FIRMASI KAPANAN UYEYE AYNI CUMLE SOYLENEMEZ: o kisi hesabini geri
 * ACAMAZ (firmayi SAHIBI geri acar). Yukaridaki metni ona gostermek,
 * yapamayacagi bir sey VAAT etmek olurdu — bu depoda "calismayan soz"
 * olarak adlandirilan hata sinifi.
 */
export const KAYIT_FIRMA_KAPANDI_MESAJI =
  'Bu adresle kapatılmış bir hesabınız var. Firmanızın hesabı kapatıldı; ' +
  'giriş yapıp verilerinizi indirebilirsiniz. Erişiminizi yalnız firma ' +
  'sahibiniz geri açabilir.';

/** Kayit ekraninda gosterilecek dogru cumle — neden bazli. SAF. */
export function kayitKapaliHesapMesaji(u: KapaliHesapGirdisi): string {
  return firmaYuzundenKapandiMi(u)
    ? KAYIT_FIRMA_KAPANDI_MESAJI
    : KAYIT_KAPALI_HESAP_MESAJI;
}
