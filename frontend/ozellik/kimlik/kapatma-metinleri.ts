/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HESAP KAPATMA METNİ (saf) — veri imhası turu §8.1 · 21.09.2026
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ NEDEN VAR: 21.09'a kadar profil ekranı şunu yazıyordu —
 *
 *     "Teklifleriniz ve kütüphaneniz sistemde kalmaya devam eder; tamamen
 *      imha edilmesini istiyorsanız bunu ayrıca iletmeniz gerekir.
 *      Aynı e-posta adresiyle yeniden kayıt olabilirsiniz."
 *
 * Emre'nin K1/K2/K3 kararlarından sonra bu cümlenin ÜÇ ayrı iddiası da
 * yanlış oldu: (1) veriler sistemde KALMIYOR, 30 gün sonra imha ediliyor;
 * (2) imha "ayrı bir talep" DEĞİL, kendiliğinden işliyor; (3) aynı adresle
 * yeniden kayıt 30 gün boyunca AÇILMIYOR (kapalı hesap geri açılır).
 *
 * ⚠ BU DOSYA KARAR VERMEZ — yalnız METİN kurar.
 * "Firmam kapanıyor mu" kararı SUNUCUDA, tek yerde:
 * `backend/src/ozellik/firma/uyelik-kurallari.ts` `ayrilmaKarari`.
 * Turun brief'i bunu adıyla şart koşuyor (§3.3 "Tek kaynak") çünkü bu depoda
 * ikiz kural ölçülmüş bir hata sınıfıdır (`erisim-durumu.ts` ikizi,
 * `Math.max(tier, abonelik)` ikili kaynağı). Ön yüzde ikinci bir "son sahip
 * mi" hesabı YAZILMAZ: aşağıdaki fonksiyon sunucunun kararını OLDUĞU GİBİ
 * alır ve yalnız hangi cümlenin çizileceğini seçer.
 *
 * Desen: `ozellik/firma/ekip/koltuk-metinleri.ts` (karar sunucuda, metin
 * burada) + `lib/silme-onay-metni.ts` (yıkıcı onaydan önce GERÇEK sayı).
 */

/**
 * SAKLAMA SÜRESİ — YEDEK değer (Emre kararı K1, 21.09.2026).
 *
 * ⚠ TEK KAYNAK SUNUCUDADIR: `uyelik-kurallari.ts` `KAPATMA_SAKLAMA_GUN`.
 * Ön izleme ucu bu sayıyı `saklamaGun` olarak yollar ve metin ONU kullanır.
 * Buradaki sabit YALNIZ uç cevap vermediğinde devreye girer — ekranda
 * sayısız bir cümle ("verilerinizi gün saklıyoruz") çıkmasın diye.
 * Sözleşme kapısı iki değerin eşitliğini ölçer (`kapatma-metinleri.test.ts`).
 */
export const SAKLAMA_GUN = 30;

/**
 * Sunucunun `ayrilmaKarari` ÇIKTISI — birebir
 * (`backend/src/ozellik/firma/uyelik-kurallari.ts` `AyrilmaKarari`).
 *
 * ⚠ 21.09'da DEĞİŞTİ: eski `{izin:true, abonelikIptal, sonHesap}` ikilisi
 * TEK bayrağa indi. Gerekçe sunucu başlığında yazılı: iki bayrak her zaman
 * aynı değeri taşıyordu, üçüncüsünü eklemek üçünün ayrı zamanlarda
 * değişmesi riskini getirirdi.
 *
 * ⚠ `izin: false` bu uçtan GELMEZ: ön izleme `firmayiKapatabilir: true`
 * geçiyor (`hesap.servisi.ts`), yani son sahip de kapatabiliyor. Dal yine de
 * tipte duruyor; sunucu yarın yolu değiştirirse ön yüz sessizce yanlış
 * cümle yazmasın diye aşağıda AYRICA ele alınır.
 */
export type AyrilmaKarariYaniti =
  | { izin: true; firmaKapaniyor: boolean }
  | { izin: false; kod: 'SON_SAHIP' };

/** `GET /auth/hesabimi-kapat/onizleme` yanıtı (sunucu imzasıyla birebir). */
export type KapatmaOnizlemesi = {
  /**
   * Hesap bir firmaya bağlı mı. `false` → firmasız (eski) kayıt; firma
   * cümlelerinin HİÇBİRİ yazılmaz.
   *
   * ⚠ GEREKLİ: sunucu firmasız dalda `ayrilmaKarari`yi HİÇ çağırmadan
   * `{izin:true, firmaKapaniyor:false}` döndürüyor — karar nesnesi "firma
   * devam ediyor" dalıyla AYNI görünür. Bu bayrak olmasaydı firmasız
   * kullanıcıya "teklifleriniz firmanızda kalır" derdik.
   */
  firmaVar: boolean;
  /** Sunucunun `ayrilmaKarari` çıktısı. Ön yüz bunu YENİDEN HESAPLAMAZ. */
  karar: AyrilmaKarariYaniti;
  /**
   * `digerHesap` — kapatan HARİÇ, firmadaki `deletedAt IS NULL` hesap sayısı.
   *
   * ⚠ SUNUCUNUN TANIMI KORUNUR: banlı hesap da sayılır (`ayrilmaKarari`
   * başlığı: "Emre'nin 'firmanın tek kullanıcısı' ölçüsü budur"). Burada
   * ikinci bir sayım yapılsaydı ekrandaki N ile sunucunun kararı ayrı
   * zamanlarda ayrışırdı.
   */
  digerHesap: number;
  /** Saklama süresi — sunucudaki `KAPATMA_SAKLAMA_GUN`. Metnin tek kaynağı. */
  saklamaGun?: number;
};

/** Ekranın çizeceği metin. */
export type KapatmaMetni = {
  /** §8.1 gövdesi. HER ZAMAN doludur ve HER durumda aynıdır. */
  govde: string;
  /**
   * Duruma özel ek cümle; yoksa `null`. Ekran `null` gelince kutuyu
   * ÇİZMEZ (boş çerçeve bırakmaz) — `kisi-metinleri.ts` `altSatir` deseni.
   */
  ek: string | null;
  /**
   * `ek`in tonu: `uyari` = BAŞKALARININ erişimi duruyor (kırmızı kutu),
   * `bilgi` = yalnız kendi verisi (sakin kutu). `ek` yoksa `null`.
   *
   * ⚠ Rengi ekran SEÇMEZ, burada karara bağlanır: iki kutunun rengi iki
   * ayrı yerde seçilseydi biri gün gelir "uyarı"yı sakin renkte çizerdi.
   */
  ekTuru: 'uyari' | 'bilgi' | null;
};

/**
 * §8.1 GÖVDESİ — Emre'nin verdiği metin, birebir.
 *
 * Dört şey söyler ve dördü de ölçülmüş gerçektir:
 *   · kapatma erişimi keser ve aboneliği iptal eder  (bugünkü davranış)
 *   · 30 gün geri dönüş: aynı e-posta + parola + paket   (K1)
 *   · 30 günün sonunda içerik KALICI olarak silinir      (K3, günlük imha işi)
 *   · fatura/ödeme kayıtları saklanır                    (§5.5, yasal saklama)
 */
function govdeMetni(gun: number): string {
  return (
    'Hesabınız kapatılır, oturumunuz sonlandırılır ve varsa aboneliğiniz iptal ' +
    `edilir. Geri dönebilmeniz için verilerinizi ${gun} gün saklıyoruz: bu sürede ` +
    'aynı e-posta ve parolanızla giriş yapıp bir paket seçerek hesabınızı kaldığınız ' +
    `yerden açabilirsiniz. ${gun} günün sonunda teklifleriniz, kütüphaneniz ve ` +
    'yüklediğiniz belgeler kalıcı olarak silinir. Fatura ve ödeme kayıtları yasal ' +
    'süre boyunca saklanır.'
  );
}

/**
 * FİRMA DEVAM EDİYOR (§8.1 son cümle) — kapatan kişi ya üye, ya da firmada
 * başka etkin sahip var. İmha bu kişide yalnız KİŞİSEL bilgileri anonimler
 * (§5.3); teklifler firmada kalır, "Hazırlayan" bağlantısı kırılmaz.
 */
function ekFirmaDevam(gun: number): string {
  return `Hazırladığınız teklifler firmanızda kalır; kişisel bilgileriniz ${gun} gün sonra silinir.`;
}

/**
 * FİRMA KAPANIYOR ve GERİDE İNSAN VAR (§3.3.1) — bu kapatma BAŞKALARININ
 * erişimini de durduruyor. Onay ancak bu sayıyı GÖREREK verilirse
 * bilgilendirilmiş onaydır (`silme-onay-metni.ts` `bilgilendirilmisOnay`
 * aynı gerekçe).
 */
function ekFirmaKapanir(digerHesap: number, gun: number): string {
  return (
    `Firmanızda ${digerHesap} üye var. Hesabınızı kapatırsanız firmanız kapanır ve ` +
    `onların da erişimi durur. ${gun} gün içinde paket seçerek geri açarsanız ` +
    'ekibiniz de geri gelir.'
  );
}

/** Sunucunun günü kullanılabilir mi — değilse yerel yedek. */
function gunSec(onizleme: KapatmaOnizlemesi | null): number {
  const g = onizleme?.saklamaGun;
  // "verilerinizi 0 gün saklıyoruz" ya da "1.5 gün" yazmaktansa yedeğe düş.
  return typeof g === 'number' && Number.isInteger(g) && g > 0 ? g : SAKLAMA_GUN;
}

/**
 * HESAP KAPATMA METNİ.
 *
 * @param onizleme `GET /auth/hesabimi-kapat/onizleme` yanıtı. `null` → uç
 *   cevap vermedi: yalnız gövde yazılır. Sayı UYDURULMAZ, duruma özel cümle
 *   de UYDURULMAZ — gövde her durumda doğrudur.
 *
 * Üç hâl, üçü de sunucunun kararından:
 *   · `firmaKapaniyor` + `digerHesap > 0` → firma kapanıyor, N üye duruyor (uyarı)
 *   · `firmaKapaniyor` + `digerHesap === 0` → firmanın son hesabı; geride kimse
 *      yok, gövde zaten her şeyi söylüyor (ek YOK)
 *   · `firmaKapaniyor === false` → firma devam ediyor (bilgi)
 */
export function hesapKapatmaMetni(onizleme: KapatmaOnizlemesi | null): KapatmaMetni {
  const gun = gunSec(onizleme);
  const duz: KapatmaMetni = { govde: govdeMetni(gun), ek: null, ekTuru: null };
  if (!onizleme || !onizleme.firmaVar) return duz;

  const { karar, digerHesap } = onizleme;

  // ⚠ ULAŞILMAZ AMA DURUYOR: ön izleme ucu bugün `firmayiKapatabilir: true`
  // geçtiği için `izin:false` dönmüyor. Dönerse sunucu kapatmayı REDDEDİYOR
  // demektir; o hâlde "firmanız kapanır" da "teklifleriniz kalır" da yanlış
  // olurdu. Sessizce bir dala düşmek yerine düz metne düşülür.
  if (karar.izin === false) return duz;

  if (karar.firmaKapaniyor) {
    // Firmanın son hesabı: geride kalan kimse yok, ek cümle yanıltıcı olurdu.
    // (Bozuk/eksi sayı da bu dala düşer: "Firmanızda 0 üye var" YAZILMAZ.)
    if (!Number.isInteger(digerHesap) || digerHesap <= 0) return duz;
    return { govde: duz.govde, ek: ekFirmaKapanir(digerHesap, gun), ekTuru: 'uyari' };
  }

  return { govde: duz.govde, ek: ekFirmaDevam(gun), ekTuru: 'bilgi' };
}
