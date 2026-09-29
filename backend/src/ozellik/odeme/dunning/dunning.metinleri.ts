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
  /**
   * 26.09 — MİRAS HAKKI (göç firması): ödeme alınamazsa kısıt günü hesap
   * salt-okunur OLMAZ, geçiş (miras) paketine döner (`miras-hakki.ts`,
   * `DunningServisi.tekAbonelik`). Doluysa kısıt cümleleri bunu söyler.
   */
  mirasPaketAdi?: string;
  mirasBitisi?: string; // "1 Eylül 2027"
  /**
   * 29.09 — o basamakta ÇEKİMİN gerçeği (merdiven verir; 3. ve 7. gün ilk
   * cümlesi buna göre). Eskiden her yolda "tekrar denedik, yine alınamadı" /
   * "birkaç denemeye rağmen" yazılıyordu — kart hiç çekilmeden de (hedef
   * doğrulanamadı, bildirim yok, iyzico kodu yok). Yoksa çekim İDDİA EDİLMEZ.
   */
  deneme?: DenemeSonucu;
}

/**
 * Merdiven basamağında çekimin sonucu: `reddedildi` kart bugün yeniden
 * çekildi ve reddetti · `denenmedi` bu basamakta hiç çekim gönderilmedi ·
 * `belirsiz` çekim gönderildi ama yanıt gelmedi (sonuç bilinmiyor).
 */
export type DenemeSonucu = 'reddedildi' | 'denenmedi' | 'belirsiz';

// "bu kez" (Emre, 29.09 inceleme): 3. gün gerçekten çekilip reddedilen müşteriye
// 7. gün "tekrar çekim denemedik" gitmesi önceki e-postayla çelişir gibi okunurdu.
const DENENMEDI_EKI = 'kayıtlı kartınızdan bu kez tekrar çekim denemedik.';
const belirsizCumlesi = (b: MetinBaglami) =>
  `${b.tutar} tutarındaki ödemeyi tekrar denedik ancak bankadan sonuç alamadık; ödeme henüz bize ulaşmadı.`;

/** 3. gün ilk cümlesi — çekimin gerçeğine göre (Emre onayı 29.09, metin birebir). */
function ikinciIlkCumle(b: MetinBaglami): string {
  switch (b.deneme) {
    case 'reddedildi':
      return `${b.tutar} tutarındaki ödemeyi tekrar denedik, yine alınamadı.`;
    case 'belirsiz':
      return belirsizCumlesi(b);
    default:
      return `${b.tutar} tutarındaki ödemeniz hâlâ alınamadı; ${DENENMEDI_EKI}`;
  }
}

/** 7. gün ilk cümlesi (normal ve miras) — çekimin gerçeğine göre. */
function ucuncuIlkCumle(b: MetinBaglami): string {
  switch (b.deneme) {
    case 'reddedildi':
      return `${b.tutar} tutarındaki ödeme birkaç denemeye rağmen alınamadı.`;
    case 'belirsiz':
      return belirsizCumlesi(b);
    default:
      return `${b.tutar} tutarındaki ödeme hâlâ alınamadı; ${DENENMEDI_EKI}`;
  }
}

const HAVALE_NOTU =
  'Kartla ödeme sizin için uygun değilse havale/EFT ile yıllık ödeme de ' +
  'yapabilirsiniz. Faturayı hazırlayıp gönderelim — bu e-postayı yanıtlamanız yeterli.';

/** Miras firmada kısıt günü olan şey — salt-okunur mod DEĞİL, geçiş paketine dönüş. */
const mirasaDonusCumlesi = (b: MetinBaglami) =>
  `ödeme alınamazsa ${b.paketAdi} aboneliğiniz sona erer ve hesabınız geçiş paketinize ` +
  `(${b.mirasPaketAdi}) döner; bu paketi ${b.mirasBitisi} tarihine kadar kullanabilirsiniz.`;

export const DUNNING_METINLERI: Record<
  'ilk' | 'ikinci' | 'ucuncu' | 'kisitlandi' | 'sonUyari' | 'askiyaAlindi' | 'toparlandi' | 'mirasaDonuldu',
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
        'güncellediğinizde bekleyen ödeme hemen yeni kartınızdan denenir; ' +
        'herhangi bir kesinti yaşamazsınız.',
    ],
    dugmeEtiketi: 'Kartımı güncelle',
    altNot: HAVALE_NOTU,
  }),

  // ── Gün 3 ─────────────────────────────────────────────────────────────
  ikinci: (b) => ({
    konu: 'MetaPriceX — ödeme hatırlatması',
    baslik: 'Ödemeniz hâlâ bekliyor',
    govde: [
      ikinciIlkCumle(b),
      b.mirasPaketAdi
        ? `Hesabınız ${b.kisitTarihi} tarihine kadar normal çalışmaya devam edecek. O tarihe kadar ` +
          mirasaDonusCumlesi(b)
        : `Hesabınız ${b.kisitTarihi} tarihine kadar normal çalışmaya devam edecek. ` +
          'O tarihten sonra yeni teklif oluşturma ve çıktı indirme geçici olarak kapanır — ' +
          'mevcut teklifleriniz görünmeye devam eder.',
      'Kartınızı güncellemeniz yeterli: bekleyen ödeme hemen yeni kartınızdan denenir.',
    ],
    dugmeEtiketi: 'Kartımı güncelle',
    altNot: HAVALE_NOTU,
  }),

  // ── Gün 7 ─────────────────────────────────────────────────────────────
  ucuncu: (b) =>
    b.mirasPaketAdi
      ? {
          konu: `MetaPriceX — ${b.kalanGun} gün sonra geçiş paketinize dönüyorsunuz`,
          baslik: `${b.kalanGun} gün sonra ${b.paketAdi} aboneliğiniz sona erecek`,
          govde: [
            ucuncuIlkCumle(b),
            `${b.kisitTarihi} tarihine kadar ${mirasaDonusCumlesi(b)}`,
            'Verilerinizin hiçbiri silinmez. Kartınızı güncellediğinizde bekleyen ödeme hemen ' +
              'yeniden denenir; ödeme alınırsa aboneliğiniz kesintisiz sürer.',
          ],
          dugmeEtiketi: 'Şimdi öde',
          altNot: HAVALE_NOTU,
        }
      : {
    konu: `MetaPriceX — hesabınız ${b.kalanGun} gün sonra kısıtlanacak`,
    baslik: `${b.kalanGun} gün sonra yeni teklif oluşturamayacaksınız`,
    govde: [
      ucuncuIlkCumle(b),
      `${b.kisitTarihi} tarihinde hesabınız salt-okunur moda geçecek: ` +
        'tekliflerinizi görüntülemeye devam edersiniz ama yeni teklif ' +
        'oluşturamaz, Excel ya da teklif formatında indiremezsiniz.',
      'Verilerinizin hiçbiri silinmez. Kartınızı güncellediğinizde bekleyen ' +
        'ödeme hemen yeniden denenir; ödeme alındığında her şey birkaç dakika içinde ' +
        'olduğu gibi geri açılır.',
    ],
    dugmeEtiketi: 'Şimdi öde',
    altNot: HAVALE_NOTU,
  },

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
      'Kartınızı güncellediğinizde bekleyen ödeme hemen yeniden denenir; ödeme ' +
        'alındığında hesabınız birkaç dakika içinde açılır.',
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
      'Kartınızı güncellediğinizde bekleyen ödeme hemen yeniden denenir; ödeme ' +
        'alındığında hesabınız kaldığı yerden açılır.',
    ],
    dugmeEtiketi: 'Hesabımı geri aç',
    altNot: HAVALE_NOTU,
  }),

  // ── Kısıt günü, MİRAS firma: geçiş paketine dönüldü (26.09) ───────────
  // Salt-okunur mod YOK: miras hakkı süren firma kısıt günü geçiş (miras)
  // paketine döner, kart aboneliği iyzico'da kapatılır. `paketAdi`/`tutar`
  // SONA EREN ücretli paketindir — satır artık mirasta, çağıran verir.
  mirasaDonuldu: (b) => ({
    konu: 'MetaPriceX — geçiş paketinize döndünüz',
    baslik: 'Ödemeniz alınamadı: hesabınız geçiş paketinize döndü',
    govde: [
      `${b.paketAdi} aboneliğinizin ${b.tutar} tutarındaki ödemesi alınamadığı için bu abonelik ` +
        'sona erdi; kartınızdan yeni ücret çekilmeyecek.',
      `${b.firmaAdi} hesabı geçiş paketinize (${b.mirasPaketAdi}) döndü; bu paketi ${b.mirasBitisi} ` +
        'tarihine kadar kullanabilirsiniz. Verilerinizin hiçbiri silinmedi.',
      `${b.paketAdi} paketine yeniden geçmek için Abonelik sayfasından yeniden abone olabilirsiniz.`,
    ],
    dugmeEtiketi: 'Abonelik sayfasına git',
    altNot: HAVALE_NOTU,
  }),

  // ── Toparlandı ────────────────────────────────────────────────────────
  toparlandi: (b) => ({
    konu: 'MetaPriceX — ödemeniz alındı',
    baslik: 'Her şey yolunda',
    govde: [
      // 28.09: tutar iyzico'nun ÇEKTİĞİ (`tahsilEdilenTutar`, faturayla aynı);
      // boşsa okunamadı — paket fiyatı UYDURULMAZ, cümle tutarsız kurulur.
      b.tutar
        ? `${b.tutar} tutarındaki ödemeniz alındı ve hesabınız tam erişime döndü.`
        : 'Ödemeniz alındı ve hesabınız tam erişime döndü.',
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

/**
 * Tarihi Türkçe biçimde yazar: "3 Eylül 2026". ⚠ 25.09: GÜN İSTANBUL'A GÖRE
 * — konteyner saati UTC (Dockerfile/compose `TZ` vermez); 00:00-02:59 arası
 * bir an (ör. ilk çekim) müşteriye bir GÜN ÖNCESİ olarak yazılıyordu.
 */
export function tarihYaz(t: Date): string {
  return t.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  });
}

const GUN_MS = 24 * 60 * 60 * 1000;
/** İstanbul UTC+3 — 2016'dan beri yaz saati uygulaması YOK. */
const ISTANBUL_MS = 3 * 60 * 60 * 1000;

/**
 * `t`nin İstanbul takvim gününün SON anı — `tarihYaz`ın yazdığı GÜNÜN sonu.
 * Gün sayan kurallar (deneme hatırlatmasının "3 gün kala"sı, NES faturasının
 * son düzenleme günü) bu TEK tanımı okur (28.09'da deneme-hatirlatmasi.
 * servisi.ts'ten taşındı; orada yeniden dışa verilir).
 */
export function istanbulGunSonu(t: Date): Date {
  const gunBasi = Math.floor((t.getTime() + ISTANBUL_MS) / GUN_MS) * GUN_MS;
  return new Date(gunBasi + GUN_MS - 1 - ISTANBUL_MS);
}
