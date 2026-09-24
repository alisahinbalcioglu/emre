import { AbonelikDurumu, OdemeYontemi } from '@prisma/client';
import { trTarih } from '../ceviri-kotasi';
import {
  paketDegisimYolu,
  paketHakKayiplari,
  type DegisimAboneligi,
  type DegisimSurumu,
  type HakKaybi,
  type PaketDegisimRedKodu,
} from '../paket-degisimi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YONETICI PAKET ISLEMI — SAF KARAR (24.09.2026, yonetici paneli turu A2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Emre (23.09): yonetici YUKSELTIRSE musteriye onay baglantisi gider;
 *  DUSURME onaysiz dogrudan uygulanir; kartsiz musteriye SURELI paket.
 *
 *  Bu modul, yonetici panelinde her satistaki paket icin "ne yapilabilir?"
 *  sorusunu cevaplar. Karar A1'in `paketDegisimYolu`nun USTUNE kurulur — ayri
 *  bir kural yazilmaz: musterinin gecemeyecegi yere yonetici de gecemez.
 *
 *  ── DOGRUDAN DUSURME: DORT KOSULUN HEPSI ─────────────────────────────────
 *    1. hak KAYBI var,
 *    2. hak KAZANCI yok (kazanc = ters yonde kayip; simetrik, bilinmeyen
 *       degerde kapali — `paketHakKayiplari` iki yonde de kayip der),
 *    3. yeni aylik ucret mevcuttan FAZLA DEGIL (ayni para birimi),
 *    4. abonelik AKTIF (denemede degil).
 *  Digerleri (yukseltme, yatay gecis, fiyati artan "dusurme", denemedeki
 *  firma) MUSTERI ONAYLI ONERI olur. Gerekce: onay, musteriyi istemedigi
 *  urun ya da ucret degisikliginden korur.
 *  ⚠ Neden fiyat da bakilir: YON hakla belirlenir (A1), ama kur farkiyla yeni
 *  surumun Basic'i eski Pro'dan PAHALI olabilir. Hak kaybeden musteriden
 *  habersiz DAHA FAZLA cekmek "dusurme" degildir.
 *  ⚠ Neden deneme haric: iyzico'nun deneme icindeki `NEXT_PERIOD` davranisi
 *  OLCULMEDI (A1 notu). Yonetici o olculmemis yolu musterinin haberi olmadan
 *  kullanmasin; musteri onaylarsa A1 ile ayni risk.
 *
 *  ── SURELI PAKET (kartsiz) ───────────────────────────────────────────────
 *  Yalniz aboneligi OLMAYAN ya da HAVALE ile odeyen (miras dahil) firma. Kart
 *  satiri — sona ermis gorunse bile — HARIC: iyzico'nun tahsilati durdurdugu
 *  kanitlanmiyor ve satirin iyzico baglari (webhook, iptal, kart formu) dururdu.
 *
 *  Metinler YONETICIYE yazilir (ucuncu sahis). A1'in mesajlari musteriye
 *  ("Zaten bu paketi kullaniyorsunuz") — yonetici ekraninda yaniltirdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type YoneticiIslemTuru = 'oneri' | 'dogrudan-dusur' | 'sureli-paket' | 'yok';

/** Kararin okudugu surum yuzeyi: A1'inki + fiyat. */
export interface YoneticiSurumu extends DegisimSurumu {
  /** Prisma `Decimal` (ya da metni). Float'a DUSURULMEZ — kurusla karsilastirilir. */
  tutar: { toString(): string } | string;
  paraBirimi: string;
}

export interface YoneticiAboneligi extends DegisimAboneligi {
  paketSurumu: YoneticiSurumu;
}

export interface YoneticiIslemi {
  tur: YoneticiIslemTuru;
  /** Yonetici ekraninda gosterilecek aciklama. */
  aciklama: string;
  /** Yeni paketin geri aldigi haklar (mevcut → yeni). */
  kayiplar: HakKaybi[];
  /** Yeni paketin EKLEDIGI haklar (yeni → mevcut yonunde kayip). */
  kazanclar: HakKaybi[];
}

/**
 * "1649.00" → 164900. ⚠ Float YOK: `Number("1649.1") * 100` gibi hesaplar
 * kurus kaydirabilir. Tanimsiz bicim → NaN (karsilastirma kapali doner).
 */
export function kurusa(deger: { toString(): string } | string): number {
  const metin = String(deger).trim();
  const eslesme = /^(\d+)(?:\.(\d{1,2}))?$/.exec(metin);
  if (!eslesme) return Number.NaN;
  const kesir = (eslesme[2] ?? '').padEnd(2, '0');
  return Number(eslesme[1]) * 100 + Number(kesir);
}

/** Paket kucultulurse kac etkin uye durur (en eski sahip her zaman kalir). */
export function durdurulacakUye(aktifUye: number, yeniHak: number): number {
  return Math.max(0, aktifUye - Math.max(yeniHak, 1));
}

function redAciklamasi(kod: PaketDegisimRedKodu, ab: YoneticiAboneligi, simdi: Date): string {
  switch (kod) {
    case 'AYNI_PAKET':
      return 'Firmanın mevcut paketi.';
    case 'SATISTA_DEGIL':
      return 'Bu sürüm satışta değil.';
    case 'HAVALE':
      return 'Havale ile ödenen abonelik; süreli paket yolunu kullanın.';
    case 'KART_BAGI_YOK':
      return 'Kart aboneliği iyzico kaydına bağlı görünmüyor; önce iyzico kaydı incelenmeli.';
    case 'ODEME_SORUNU':
      return 'Firmanın bekleyen bir ödemesi var; ödeme tamamlanmadan paket değişmez.';
    case 'IPTAL_EDILDI':
      return `Abonelik iptal edildi, ${trTarih(ab.erisimSonu)} tarihinde sona erecek.`;
    case 'SURESI_DOLDU':
      return 'Abonelik dönemi yenileniyor; birkaç dakika sonra yeniden bakın.';
    case 'DEGISIM_BEKLIYOR':
      return ab.paketGecisTarihi && ab.paketGecisTarihi.getTime() > simdi.getTime()
        ? `Bu dönem için bir paket değişikliği zaten yapıldı (geçiş ${trTarih(ab.paketGecisTarihi)}).`
        : 'Paket değişikliği işleniyor; yeni dönemin ilk ödemesi bekleniyor.';
    case 'PERIYOT_FARKLI':
      return 'Ödeme sıklığı farklı; iyzico bu geçişe izin vermez.';
    case 'URUN_FARKLI':
      return (
        'Abonelik eski paket yapısında (farklı iyzico ürünü); iyzico üzerinden değiştirilemez. ' +
        'Müşteri aboneliğini iptal edip dönem sonunda yeni paketi satın alabilir.'
      );
  }
}

/** Kart satiri "satin al" kovasina dustuyse (sona ermis / askida) yonetici ne yapamaz? */
function kartSatinAlAciklamasi(ab: YoneticiAboneligi): string {
  if (ab.durum === AbonelikDurumu.SONA_ERDI) {
    return 'Kart aboneliği sona ermiş; müşteri yeni paketi kendisi satın alabilir.';
  }
  if (ab.durum === AbonelikDurumu.ASKIDA) {
    return 'Kart aboneliği askıda (ödeme alınamadı); önce ödeme sorunu çözülmeli.';
  }
  return 'Bu abonelik için yönetici paket işlemi yok; müşteri satın alma yolunu kullanır.';
}

/**
 * Yonetici bu firmayi bu surume NASIL tasiyabilir? SAF — panel verisi de
 * (`GET /yonetim/abonelik/:firmaId`) sunucudaki uygulama kontrolu de
 * (`YoneticiDusurmeServisi.dusur` → islemci `kontrol`u, kuyrukta TAZE satirla)
 * bunu okur.
 */
export function yoneticiIslemi(g: {
  ab: YoneticiAboneligi | null;
  yeni: YoneticiSurumu;
  simdi: Date;
  /** `Firma.imhaTarihi` dolu: hesap kapatilmis, geri acma ayri is (D). */
  firmaKapali: boolean;
}): YoneticiIslemi {
  const { ab, yeni, simdi } = g;
  const kayiplar = ab ? paketHakKayiplari(ab.paketSurumu.paket, yeni.paket) : [];
  const kazanclar = ab ? paketHakKayiplari(yeni.paket, ab.paketSurumu.paket) : [];
  const sonuc = (tur: YoneticiIslemTuru, aciklama: string): YoneticiIslemi => ({
    tur,
    aciklama,
    kayiplar,
    kazanclar,
  });

  if (g.firmaKapali) {
    return sonuc('yok', 'Hesap kapatılmış; paket işlemi için önce hesabın geri açılması gerekir.');
  }
  if (!yeni.satistaMi) return sonuc('yok', 'Bu sürüm satışta değil.');

  // ── KARTSIZ: satir yok ya da HAVALE (miras dahil) ─────────────────────
  if (!ab) {
    return sonuc('sureli-paket', 'Firmanın aboneliği yok; kartsız süreli paket tanımlanabilir.');
  }
  if (ab.odemeYontemi !== OdemeYontemi.KART) {
    return sonuc(
      'sureli-paket',
      ab.paketSurumu.paket.kod === yeni.paket.kod
        ? 'Mevcut paket; süresi süreli paketle uzatılabilir.'
        : 'Kartsız firma (havale/miras); süreli paket tanımlanabilir.',
    );
  }

  // ── KART: A1'in karari ────────────────────────────────────────────────
  const yol = paketDegisimYolu(ab, yeni, simdi);
  if (yol.yol === 'satin-al') return sonuc('yok', kartSatinAlAciklamasi(ab));
  if (yol.yol === 'yok') return sonuc('yok', redAciklamasi(yol.kod, ab, simdi));

  const mevcutKurus = kurusa(ab.paketSurumu.tutar);
  const yeniKurus = kurusa(yeni.tutar);
  // NaN her karsilastirmada false → "fiyat artmaz" KANITLANAMAZ → oneri.
  const fiyatArtmaz =
    yeni.paraBirimi === ab.paketSurumu.paraBirimi && yeniKurus <= mevcutKurus;
  const yalnizKayip = kayiplar.length > 0 && kazanclar.length === 0;
  // ⚠ DENEME TARIHE GORE (inceleme bulgusu H1, 24.09): etiket yalniz degil.
  // Gece mutabakati deneme satirini AKTIF'e cekebiliyordu (iyzico'da TRIAL
  // durumu yok) — o satir `durum=AKTIF` ama `denemeSonu` gelecekte tasir.
  // A1'in `beklenenGecisTarihi` ile ayni okuma.
  const denemede =
    ab.durum === AbonelikDurumu.DENEME ||
    (!!ab.denemeSonu && ab.denemeSonu.getTime() > simdi.getTime());

  if (yalnizKayip && fiyatArtmaz && ab.durum === AbonelikDurumu.AKTIF && !denemede) {
    return sonuc('dogrudan-dusur', 'Düşürme: dönem sonunda uygulanır, müşteri onayı gerekmez.');
  }
  if (yalnizKayip && fiyatArtmaz) {
    return sonuc('oneri', 'Firma deneme süresinde: değişiklik müşteri onayıyla yapılır.');
  }
  if (yalnizKayip) {
    return sonuc(
      'oneri',
      'Haklar azalıyor ama yeni aylık ücret daha yüksek (ya da karşılaştırılamıyor): müşteri onayı gerekir.',
    );
  }
  if (kazanclar.length > 0 && kayiplar.length > 0) {
    return sonuc('oneri', 'Yatay geçiş (hem kazanç hem kayıp): müşteri onayı gerekir.');
  }
  if (kazanclar.length > 0) return sonuc('oneri', 'Yükseltme: müşteri onayı gerekir.');
  return sonuc('oneri', 'Hak farkı yok: değişiklik müşteri onayıyla yapılır.');
}
