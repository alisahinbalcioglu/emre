import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { AbonelikDurumu } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Erişim kararı — tek doğru kaynak
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  "Bu firma şu an ne yapabilir?" sorusunun cevabı YALNIZCA burada verilir.
 *  iyzico'ya sorulmaz; iyzico'nun durumu bizim tablomuzu günceller, kararı
 *  bizim tablomuz verir. Sebebi basit: iyzico'ya giden her istek gecikme ve
 *  arıza noktasıdır, üstelik havale ile ödeyen firmaların iyzico'da kaydı
 *  bile yoktur.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Ürün içindeki yetenekler. Kısıtlı modda hangilerinin kapanacağını belirler. */
export enum Yetenek {
  TEKLIF_GORUNTULE = 'teklif.goruntule',
  TEKLIF_OLUSTUR = 'teklif.olustur',
  TEKLIF_DUZENLE = 'teklif.duzenle',
  EXCEL_YUKLE = 'excel.yukle',
  DWG_YUKLE = 'dwg.yukle',
  CIKTI_INDIR = 'cikti.indir', // fiyatlı Excel / teklif formatı
  KUTUPHANE_GORUNTULE = 'kutuphane.goruntule',
  KUTUPHANE_DUZENLE = 'kutuphane.duzenle',
  KULLANICI_DAVET = 'kullanici.davet',
  ABONELIK_YONET = 'abonelik.yonet', // her zaman açık — ödeme sayfası
}

/**
 * Salt-okunur modda AÇIK kalanlar.
 *
 * Tasarım kararı: veriyi göstermeye devam ediyoruz, değer üretmeyi
 * durduruyoruz. Müşterinin hazırladığı teklifleri rehin almak, ödeme
 * yaptırmaktan çok öfke üretir; ama yeni teklif çıkaramamak gerçek bir
 * baskıdır. Çıktı indirmeyi de kapatıyoruz — asıl değer orada.
 */
const KISITLI_MODDA_ACIK: ReadonlySet<Yetenek> = new Set([
  Yetenek.TEKLIF_GORUNTULE,
  Yetenek.KUTUPHANE_GORUNTULE,
  Yetenek.ABONELIK_YONET,
]);

/** Askıdayken yalnızca ödeme sayfası. */
const ASKIDA_ACIK: ReadonlySet<Yetenek> = new Set([Yetenek.ABONELIK_YONET]);

export interface ErisimKarari {
  erisimVar: boolean;
  saltOkunur: boolean;
  durum: AbonelikDurumu;
  /** Kullanıcıya gösterilecek uyarı — null ise uyarı yok. */
  uyari: {
    seviye: 'bilgi' | 'uyari' | 'kritik';
    baslik: string;
    metin: string;
    eylem?: { etiket: string; yol: string };
  } | null;
  /** Deneme ya da tolerans süresinin bitmesine kaç gün kaldı. */
  kalanGun: number | null;
  paketKodu: string;
  kullaniciHakki: number;
  dwgAktif: boolean;
}

@Injectable()
export class ErisimServisi {
  constructor(private readonly prisma: PrismaService) {}

  private gunFarki(hedef: Date, simdi: Date): number {
    return Math.ceil((hedef.getTime() - simdi.getTime()) / 86_400_000);
  }

  /**
   * Firmanın güncel erişim durumunu döndürür.
   *
   * Not: `erisimSonu` geçmişse durum ne olursa olsun erişim kapanır.
   * Bu, bir zamanlanmış işin geç çalışması hâlinde bile ücretsiz
   * kullanımı engelleyen ikinci bir emniyet kemeridir.
   */
  async karar(firmaId: string, simdi = new Date()): Promise<ErisimKarari> {
    const ab = await this.prisma.abonelik.findUnique({
      where: { firmaId },
      include: { paketSurumu: { include: { paket: true } } },
    });

    if (!ab) {
      return {
        erisimVar: false,
        saltOkunur: false,
        durum: AbonelikDurumu.SONA_ERDI,
        uyari: {
          seviye: 'kritik',
          baslik: 'Aboneliğiniz bulunmuyor',
          metin: 'Devam etmek için bir paket seçin.',
          eylem: { etiket: 'Paketleri gör', yol: '/abonelik' },
        },
        kalanGun: null,
        paketKodu: '',
        kullaniciHakki: 0,
        dwgAktif: false,
      };
    }

    const paket = ab.paketSurumu.paket;
    const temel = {
      durum: ab.durum,
      paketKodu: paket.kod,
      kullaniciHakki: paket.kullaniciHakki,
      dwgAktif: paket.dwgAktif,
    };

    const suresiDoldu = ab.erisimSonu.getTime() <= simdi.getTime();

    switch (ab.durum) {
      case AbonelikDurumu.DENEME: {
        if (suresiDoldu) {
          return {
            ...temel,
            erisimVar: false,
            saltOkunur: false,
            kalanGun: 0,
            uyari: {
              seviye: 'kritik',
              baslik: 'Deneme süreniz doldu',
              metin:
                'Tekliflerinize erişmeye devam etmek için bir paket seçin. ' +
                'Verileriniz duruyor, silinmedi.',
              eylem: { etiket: 'Paket seç', yol: '/abonelik' },
            },
          };
        }
        const kalan = this.gunFarki(ab.erisimSonu, simdi);
        return {
          ...temel,
          erisimVar: true,
          saltOkunur: false,
          kalanGun: kalan,
          uyari:
            kalan <= 5
              ? {
                  seviye: kalan <= 2 ? 'uyari' : 'bilgi',
                  baslik: `Deneme sürenizin bitmesine ${kalan} gün kaldı`,
                  metin: 'Kesintisiz devam etmek için paketinizi seçebilirsiniz.',
                  eylem: { etiket: 'Paket seç', yol: '/abonelik' },
                }
              : null,
        };
      }

      case AbonelikDurumu.AKTIF:
        return {
          ...temel,
          erisimVar: !suresiDoldu,
          saltOkunur: false,
          kalanGun: null,
          uyari: suresiDoldu
            ? {
                seviye: 'uyari',
                baslik: 'Abonelik döneminiz doğrulanıyor',
                metin:
                  'Ödemeniz kontrol ediliyor. Sorun sürerse bizimle ' +
                  'iletişime geçin.',
              }
            : null,
        };

      case AbonelikDurumu.ODEME_BEKLIYOR: {
        // Tolerans süresi: erişim tam açık ama uyarı görünür.
        return {
          ...temel,
          erisimVar: true,
          saltOkunur: false,
          kalanGun: ab.kisitlandi ? null : this.gunFarki(ab.erisimSonu, simdi),
          uyari: {
            seviye: 'uyari',
            baslik: 'Ödemeniz alınamadı',
            metin:
              'Kayıtlı kartınızdan tahsilat yapılamadı. Kartınızı ' +
              'güncellerseniz kesinti yaşamazsınız.',
            eylem: { etiket: 'Kartı güncelle', yol: '/abonelik/kart' },
          },
        };
      }

      case AbonelikDurumu.KISITLI:
        return {
          ...temel,
          erisimVar: true,
          saltOkunur: true,
          kalanGun: null,
          uyari: {
            seviye: 'kritik',
            baslik: 'Hesabınız salt-okunur modda',
            metin:
              'Mevcut tekliflerinizi görebilirsiniz, ancak yeni teklif ' +
              'oluşturma ve çıktı indirme kapalı. Ödemenizi tamamladığınızda ' +
              'anında açılır.',
            eylem: { etiket: 'Ödemeyi tamamla', yol: '/abonelik/kart' },
          },
        };

      case AbonelikDurumu.ASKIDA:
        return {
          ...temel,
          erisimVar: false,
          saltOkunur: false,
          kalanGun: null,
          uyari: {
            seviye: 'kritik',
            baslik: 'Aboneliğiniz askıya alındı',
            metin:
              'Verileriniz duruyor. Ödemenizi tamamladığınızda hesabınız ' +
              'olduğu gibi geri açılır.',
            eylem: { etiket: 'Ödemeyi tamamla', yol: '/abonelik/kart' },
          },
        };

      case AbonelikDurumu.IPTAL: {
        // İptal edildi ama ödenmiş dönem sürüyor — sonuna kadar tam erişim.
        const kalan = this.gunFarki(ab.erisimSonu, simdi);
        return {
          ...temel,
          erisimVar: !suresiDoldu,
          saltOkunur: false,
          kalanGun: Math.max(0, kalan),
          uyari: {
            seviye: 'bilgi',
            baslik: `Aboneliğiniz ${kalan > 0 ? `${kalan} gün sonra` : 'bugün'} sona eriyor`,
            metin: 'İsterseniz bu tarihe kadar aboneliğinizi geri alabilirsiniz.',
            eylem: { etiket: 'Aboneliği sürdür', yol: '/abonelik' },
          },
        };
      }

      case AbonelikDurumu.SONA_ERDI:
      default:
        return {
          ...temel,
          erisimVar: false,
          saltOkunur: false,
          kalanGun: null,
          uyari: {
            seviye: 'kritik',
            baslik: 'Aboneliğiniz sona erdi',
            metin: 'Verileriniz saklanıyor. Yeni bir paket seçerek devam edebilirsiniz.',
            eylem: { etiket: 'Paket seç', yol: '/abonelik' },
          },
        };
    }
  }

  /** Tek bir yeteneğin şu an açık olup olmadığını söyler. */
  async yetenekAcikMi(firmaId: string, yetenek: Yetenek): Promise<boolean> {
    const k = await this.karar(firmaId);
    return this.yetenekKararla(k, yetenek);
  }

  /** Karar nesnesi elinizdeyse tekrar sorgu atmadan değerlendirin. */
  yetenekKararla(k: ErisimKarari, yetenek: Yetenek): boolean {
    if (yetenek === Yetenek.ABONELIK_YONET) return true; // her zaman açık
    if (!k.erisimVar) return ASKIDA_ACIK.has(yetenek);
    if (k.saltOkunur) return KISITLI_MODDA_ACIK.has(yetenek);
    if (yetenek === Yetenek.DWG_YUKLE && !k.dwgAktif) return false;
    return true;
  }
}
