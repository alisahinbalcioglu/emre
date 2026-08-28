/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Dunning metinleri
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Yazım ilkesi: karşınızdaki taahhüt firmasının muhasebecisi ya da
 *  patronu. Kart limiti dolmuş olabilir, kart yenilenmiş olabilir, ya da
 *  şirket kartı aylık ödeme gününde kapalı olabilir. Bunlar suç değil,
 *  olağan durumlar. Metinler suçlayıcı değil, çözüm gösterici olmalı.
 *
 *  Her metin tek bir şey ister: kartı güncelle. Bağlantı her e-postada var.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface DunningMetni {
  konu: string;
  baslik: string;
  govde: string[];
  dugmeEtiketi: string;
  /** Alt bilgi — havale seçeneğini hatırlatır. */
  altNot?: string;
}

export interface MetinBaglami {
  firmaAdi: string;
  paketAdi: string;
  tutar: string; // "₺1.250,00" biçiminde hazır gelir
  kalanGun?: number;
  kisitTarihi?: string; // "3 Eylül 2026"
}

const HAVALE_NOTU =
  'Kartla ödeme sizin için uygun değilse havale/EFT ile yıllık ödeme de ' +
  'yapabilirsiniz. Faturayı hazırlayıp gönderelim — bu e-postayı yanıtlamanız yeterli.';

export const DUNNING_METINLERI: Record<
  'ilk' | 'ikinci' | 'ucuncu' | 'kisitlandi' | 'sonUyari' | 'askiyaAlindi' | 'toparlandi',
  (b: MetinBaglami) => DunningMetni
> = {
  // ── Gün 0: tahsilat başarısız ─────────────────────────────────────────
  ilk: (b) => ({
    konu: 'MetaPriceX — ödemeniz alınamadı',
    baslik: 'Kayıtlı kartınızdan tahsilat yapılamadı',
    govde: [
      `${b.firmaAdi} için ${b.paketAdi} aboneliğinizin ${b.tutar} tutarındaki ` +
        'ödemesi alınamadı.',
      'Bu genellikle kartın yenilenmiş, limitin geçici olarak dolmuş ya da ' +
        'internetten ödemeye kapalı olmasından kaynaklanır.',
      'Hesabınız şu an normal çalışmaya devam ediyor. Kartınızı ' +
        'güncellerseniz herhangi bir kesinti yaşamazsınız.',
    ],
    dugmeEtiketi: 'Kartımı güncelle',
    altNot: HAVALE_NOTU,
  }),

  // ── Gün 3 ─────────────────────────────────────────────────────────────
  ikinci: (b) => ({
    konu: 'MetaPriceX — ödeme hatırlatması',
    baslik: 'Ödemeniz hâlâ bekliyor',
    govde: [
      `${b.tutar} tutarındaki ödemeyi tekrar denedik, yine alınamadı.`,
      `Hesabınız ${b.kisitTarihi} tarihine kadar normal çalışmaya devam edecek. ` +
        'O tarihten sonra yeni teklif oluşturma ve çıktı indirme geçici olarak kapanır — ' +
        'mevcut teklifleriniz görünmeye devam eder.',
      'Kartınızı güncellemeniz yeterli, gerisini biz hallederiz.',
    ],
    dugmeEtiketi: 'Kartımı güncelle',
    altNot: HAVALE_NOTU,
  }),

  // ── Gün 7 ─────────────────────────────────────────────────────────────
  ucuncu: (b) => ({
    konu: `MetaPriceX — hesabınız ${b.kalanGun} gün sonra kısıtlanacak`,
    baslik: `${b.kalanGun} gün sonra yeni teklif oluşturamayacaksınız`,
    govde: [
      `${b.tutar} tutarındaki ödeme birkaç denemeye rağmen alınamadı.`,
      `${b.kisitTarihi} tarihinde hesabınız salt-okunur moda geçecek: ` +
        'tekliflerinizi görüntülemeye devam edersiniz ama yeni teklif ' +
        'oluşturamaz, Excel ya da teklif formatında indiremezsiniz.',
      'Verilerinizin hiçbiri silinmez. Ödeme tamamlandığı anda her şey ' +
        'olduğu gibi geri açılır.',
    ],
    dugmeEtiketi: 'Şimdi öde',
    altNot: HAVALE_NOTU,
  }),

  // ── Gün 10: kısıtlandı ────────────────────────────────────────────────
  kisitlandi: (b) => ({
    konu: 'MetaPriceX — hesabınız salt-okunur moda alındı',
    baslik: 'Yeni teklif oluşturma geçici olarak kapatıldı',
    govde: [
      `${b.firmaAdi} hesabı salt-okunur moda alındı.`,
      'Şu an yapabilecekleriniz: mevcut tekliflerinizi görüntülemek, ' +
        'fiyat kütüphanenize bakmak.',
      'Şu an kapalı olanlar: yeni teklif oluşturmak, metraj yüklemek, ' +
        'fiyatlı Excel ve teklif formatında çıktı indirmek.',
      'Ödemeyi tamamladığınızda hesabınız birkaç saniye içinde açılır.',
    ],
    dugmeEtiketi: 'Ödemeyi tamamla',
    altNot: HAVALE_NOTU,
  }),

  // ── Gün 20: son uyarı ─────────────────────────────────────────────────
  sonUyari: (b) => ({
    konu: 'MetaPriceX — son hatırlatma',
    baslik: `Hesabınız ${b.kisitTarihi} tarihinde askıya alınacak`,
    govde: [
      'Ödemeniz hâlâ tamamlanmadı.',
      `${b.kisitTarihi} tarihinde hesap erişiminiz tamamen kapanacak.`,
      'Verileriniz silinmez, saklanmaya devam eder — ancak giriş ' +
        'yapamazsınız.',
      'Bir sorun mu var? Bu e-postayı yanıtlayın, birlikte çözelim.',
    ],
    dugmeEtiketi: 'Ödemeyi tamamla',
    altNot: HAVALE_NOTU,
  }),

  // ── Gün 30: askıya alındı ─────────────────────────────────────────────
  askiyaAlindi: (b) => ({
    konu: 'MetaPriceX — hesabınız askıya alındı',
    baslik: 'Hesap erişiminiz kapatıldı',
    govde: [
      `${b.firmaAdi} hesabı askıya alındı.`,
      'Teklifleriniz, fiyat kütüphaneniz ve ayarlarınız olduğu gibi ' +
        'duruyor — hiçbiri silinmedi.',
      'Ödemenizi tamamladığınızda hesabınız kaldığı yerden açılır.',
    ],
    dugmeEtiketi: 'Hesabımı geri aç',
    altNot: HAVALE_NOTU,
  }),

  // ── Toparlandı ────────────────────────────────────────────────────────
  toparlandi: (b) => ({
    konu: 'MetaPriceX — ödemeniz alındı',
    baslik: 'Her şey yolunda',
    govde: [
      `${b.tutar} tutarındaki ödemeniz alındı ve hesabınız tam erişime döndü.`,
      'Faturanız e-posta ile ayrıca iletilecek.',
      'İyi çalışmalar.',
    ],
    dugmeEtiketi: 'Uygulamaya dön',
  }),
};

/** Tutarı Türkçe biçimde yazar: 1250 → "₺1.250,00" */
export function tutarYaz(tutar: number, paraBirimi = 'TRY'): string {
  const simge = { TRY: '₺', USD: '$', EUR: '€' }[paraBirimi] ?? '';
  return (
    simge +
    tutar.toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Tarihi Türkçe biçimde yazar: "3 Eylül 2026" */
export function tarihYaz(t: Date): string {
  return t.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
