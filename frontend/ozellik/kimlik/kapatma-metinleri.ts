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

/** Maddenin tonu: `uyari` = BAŞKALARININ erişimi de duruyor; öbürleri düz. */
export type KapatmaMaddesi = { metin: string; ton: 'duz' | 'uyari' };

/**
 * ── 23.09.2026 — HESABIM TASARIMI: METİN MADDE MADDE ──────────────────────
 * §8.1 metni (21.09) tek paragraftı ve duruma özel cümle ALTINDA ayrı bir
 * kutuda duruyordu. Emre'nin Hesabım tasarımı kapatmanın sonuçlarını madde
 * madde yazıyor ve "alt kullanıcıların erişimi de kapanır" maddesini ekliyor.
 *
 * ⚠ YENİ İDDİA YOK — §8.1'in dört olgusu aynen duruyor, yalnız biçim değişti:
 *   · kapatma oturumu keser, varsa aboneliği iptal eder   (bugünkü davranış)
 *   · 30 gün geri dönüş: aynı e-posta + parola + paket    (K1)
 *   · 30 günün sonunda içerik KALICI olarak silinir       (K3, günlük imha işi)
 *   · fatura/ödeme kayıtları saklanır                     (§5.5, yasal saklama)
 *
 * ⚠ "ALT KULLANICILARIN ERİŞİMİ KAPANIR" HER HESAPTA DOĞRU DEĞİL: yalnız firma
 * GERÇEKTEN kapanıyorsa ve geride insan varsa yazılır — kararı sunucu verir
 * (`ayrilmaKarari`). İkinci sahibi olan firmada bu cümle yalan olurdu.
 *
 * ⚠ FİRMA DEVAM EDİYORSA İKİ MADDE DEĞİŞİR, ikisi de ÖLÇÜLDÜ:
 *   · abonelik iptali YALNIZ `firmaKapaniyor` dalında çalışır
 *     (`hesap.servisi.ts`: `if (karar.izin && karar.firmaKapaniyor …)
 *     iptalEt`) — ikinci sahibe "aboneliğiniz iptal edilir" demek yanlıştı;
 *   · imha bu kişide yalnız KİŞİSEL bilgileri anonimler (§5.3), teklifler
 *     firmada kalır — "teklifleriniz silinir" maddesi o kişi için yanlıştı.
 *     21.09 metninde bu iki çelişki gövde + altındaki "bilgi" kutusuyla yan
 *     yana duruyordu; maddeler hâlinde ikisini birden yazmak onu göze sokardı.
 */
function kesintiMaddesi(): string {
  return 'Oturumunuz sonlanır, varsa aboneliğiniz iptal edilir.';
}

function geriDonusMaddesi(gun: number): string {
  return (
    `${gun} gün içinde aynı e-posta ve parolayla giriş yapıp bir paket seçerek ` +
    'kaldığınız yerden devam edebilirsiniz.'
  );
}

function imhaMaddesi(gun: number): string {
  return `${gun} günün sonunda teklifleriniz, kütüphaneniz ve yüklediğiniz belgeler kalıcı olarak silinir.`;
}

const FATURA_MADDESI = 'Fatura ve ödeme kayıtları yasal süre boyunca saklanır.';

/**
 * FİRMA KAPANIYOR ve GERİDE İNSAN VAR (§3.3.1) — bu kapatma BAŞKALARININ
 * erişimini de durduruyor. Onay ancak bu sayıyı GÖREREK verilirse
 * bilgilendirilmiş onaydır (`silme-onay-metni.ts` `bilgilendirilmisOnay`
 * aynı gerekçe).
 */
function ekipMaddesi(digerHesap: number): string {
  return (
    `Firmanız kapanır; ekibinizdeki ${digerHesap} kişinin erişimi de kapanır. ` +
    'Geri dönerseniz ekibiniz de geri gelir.'
  );
}

/**
 * FİRMA DEVAM EDİYOR — kapatan kişi ya üye, ya da firmada başka etkin sahip
 * var. İmha bu kişide yalnız KİŞİSEL bilgileri anonimler (§5.3); teklifler
 * firmada kalır, "Hazırlayan" bağlantısı kırılmaz.
 */
function firmadaKalirMaddesi(gun: number): string {
  return `Hazırladığınız teklifler firmanızda kalır; kişisel bilgileriniz ${gun} gün sonra silinir.`;
}

/** Sunucunun günü kullanılabilir mi — değilse yerel yedek. */
function gunSec(onizleme: KapatmaOnizlemesi | null): number {
  const g = onizleme?.saklamaGun;
  // "0 gün içinde" ya da "1.5 günün sonunda" yazmaktansa yedeğe düş.
  return typeof g === 'number' && Number.isInteger(g) && g > 0 ? g : SAKLAMA_GUN;
}

const duz = (metin: string): KapatmaMaddesi => ({ metin, ton: 'duz' });

/**
 * HESAP KAPATMA MADDELERİ — "Hesabınızı kapattığınızda:" başlığının altı.
 *
 * @param onizleme `GET /auth/hesabimi-kapat/onizleme` yanıtı. `null` → uç
 *   cevap vermedi: yalnız her durumda doğru olan dört madde yazılır. Sayı
 *   UYDURULMAZ, duruma özel madde de UYDURULMAZ.
 *
 * Üç hâl, üçü de sunucunun kararından:
 *   · `firmaKapaniyor` + `digerHesap > 0`  → + ekip maddesi (uyarı)
 *   · `firmaKapaniyor` + `digerHesap === 0` → firmanın son hesabı; geride kimse
 *      yok, dört madde her şeyi söylüyor
 *   · `firmaKapaniyor === false`            → firma devam ediyor: abonelik
 *      sürer, teklifler firmada kalır
 */
export function hesapKapatmaMaddeleri(onizleme: KapatmaOnizlemesi | null): KapatmaMaddesi[] {
  const gun = gunSec(onizleme);
  const temel = [
    duz(kesintiMaddesi()),
    duz(geriDonusMaddesi(gun)),
    duz(imhaMaddesi(gun)),
    duz(FATURA_MADDESI),
  ];
  if (!onizleme || !onizleme.firmaVar) return temel;

  const { karar, digerHesap } = onizleme;

  // ⚠ ULAŞILMAZ AMA DURUYOR: ön izleme ucu bugün `firmayiKapatabilir: true`
  // geçtiği için `izin:false` dönmüyor. Dönerse sunucu kapatmayı REDDEDİYOR
  // demektir; o hâlde "firmanız kapanır" da "teklifleriniz kalır" da yanlış
  // olurdu. Sessizce bir dala düşmek yerine temel maddelere düşülür.
  if (karar.izin === false) return temel;

  if (karar.firmaKapaniyor) {
    // Firmanın son hesabı: geride kalan kimse yok, ekip maddesi yanıltıcı olurdu.
    // (Bozuk/eksi sayı da bu dala düşer: "0 kişinin erişimi" YAZILMAZ.)
    if (!Number.isInteger(digerHesap) || digerHesap <= 0) return temel;
    return [temel[0], { metin: ekipMaddesi(digerHesap), ton: 'uyari' }, ...temel.slice(1)];
  }

  return [
    duz('Oturumunuz sonlanır; firmanızın aboneliği sürer.'),
    duz(geriDonusMaddesi(gun)),
    duz(firmadaKalirMaddesi(gun)),
    duz(FATURA_MADDESI),
  ];
}
