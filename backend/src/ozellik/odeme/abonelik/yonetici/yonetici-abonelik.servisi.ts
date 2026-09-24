import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../altyapi/db/prisma.service';
import { etkinHesapKosulu } from '../../../firma/uyelik-kurallari';
import { beklenenGecisTarihi, type HakKaybi } from '../paket-degisimi';
import { ONERI_DURUM_METNI, oneriDurumu, type OneriEtkinDurumu } from './paket-onerisi';
import { oneriGecmisiOku } from './paket-onerisi.servisi';
import { durdurulacakUye, yoneticiIslemi, type YoneticiIslemTuru } from './yonetici-islemi';

/** `GET /yonetim/abonelik/:firmaId` yaniti — yonetici "Paket islemleri" penceresi. */
export interface YoneticiPaneli {
  firma: { id: string; ad: string; kapali: boolean };
  /** Etkin hesaplar (sahip dahil) — paket kuculurse kimin duracagi bundan. */
  aktifUye: number;
  /** Bildirimlerin gidecegi etkin sahiplerin e-postalari. */
  sahipler: string[];
  abonelik: null | {
    durum: string;
    odemeYontemi: string;
    paket: { kod: string; ad: string };
    surumNo: number;
    tutar: string;
    paraBirimi: string;
    kullaniciHakki: number;
    erisimSonu: string;
    denemeSonu: string | null;
    /** Kart aboneliginin iyzico baglantisi var mi (kodun kendisi DONMEZ). */
    iyzicoBagli: boolean;
    planliPaket: { kod: string; ad: string } | null;
    paketGecisTarihi: string | null;
    /** Kartta bir sonraki cekim — "donem sonu" dusurmenin uygulanacagi an. */
    beklenenGecis: string;
  };
  secenekler: Array<{
    paketSurumuId: string;
    paket: { kod: string; ad: string; kullaniciHakki: number };
    tutar: string;
    paraBirimi: string;
    islem: YoneticiIslemTuru;
    aciklama: string;
    kayiplar: HakKaybi[];
    kazanclar: HakKaybi[];
    durdurulacakUye: number;
  }>;
  /**
   * Firmanin SON onerisi (A2 Blok 2), durumu ne olursa olsun. `durum`
   * HESAPLANMIS etkin durumdur (`oneriDurumu`): satir BEKLIYOR olsa da suresi
   * dolmus ya da abonelik degismisse "bekliyor" DEGILDIR.
   */
  oneri: null | {
    id: string;
    hedef: { kod: string; ad: string };
    durum: OneriEtkinDurumu;
    durumMetni: string;
    sonGecerlilik: string;
    olusturuldu: string;
    olusturanEposta: string;
    gerekce: string;
    musteriNotu: string | null;
    sonuclandi: string | null;
  };
}

/**
 * Yonetici panelinin OKUMA yuzu (24.09.2026, A2). Karar `yoneticiIslemi`nden
 * — uygulama (`YoneticiDusurmeServisi`) ayni fonksiyonu kuyrukta TAZE satirla
 * yeniden calistirir; bu yanit yalniz ekranin dugmelerini kurar.
 */
@Injectable()
export class YoneticiAbonelikServisi {
  constructor(private readonly prisma: PrismaService) {}

  async panel(firmaId: string, simdi = new Date()): Promise<YoneticiPaneli> {
    const firma = await this.prisma.firma.findUnique({
      where: { id: firmaId },
      select: { id: true, ad: true, imhaTarihi: true },
    });
    if (!firma) throw new NotFoundException('Firma bulunamadı.');

    const [ab, surumler, aktifUye, sahipler, sonOneri] = await Promise.all([
      this.prisma.abonelik.findUnique({
        where: { firmaId },
        include: {
          paketSurumu: { include: { paket: true } },
          planliPaketSurumu: { include: { paket: true } },
        },
      }),
      this.prisma.paketSurumu.findMany({
        where: { satistaMi: true },
        include: { paket: true },
        orderBy: [{ paket: { sira: 'asc' } }, { surumNo: 'asc' }],
      }),
      this.prisma.user.count({ where: { firmaId, ...etkinHesapKosulu() } }),
      this.prisma.user.findMany({
        where: { firmaId, firmaRol: 'sahip', ...etkinHesapKosulu() },
        select: { email: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.paketDegisimOnerisi.findFirst({
        where: { firmaId },
        orderBy: [{ olusturuldu: 'desc' }, { id: 'desc' }],
        include: { hedefPaketSurumu: { include: { paket: true } } },
      }),
    ]);
    const firmaKapali = firma.imhaTarihi !== null;
    const oneriEtkin = sonOneri
      ? oneriDurumu(sonOneri, ab, simdi, await oneriGecmisiOku(this.prisma, sonOneri, ab?.id ?? null))
      : null;

    return {
      firma: { id: firma.id, ad: firma.ad, kapali: firmaKapali },
      aktifUye,
      sahipler: sahipler.map((s) => s.email),
      abonelik: ab
        ? {
            durum: ab.durum,
            odemeYontemi: ab.odemeYontemi,
            paket: { kod: ab.paketSurumu.paket.kod, ad: ab.paketSurumu.paket.ad },
            surumNo: ab.paketSurumu.surumNo,
            tutar: ab.paketSurumu.tutar.toFixed(2),
            paraBirimi: ab.paketSurumu.paraBirimi,
            kullaniciHakki: ab.paketSurumu.paket.kullaniciHakki,
            erisimSonu: ab.erisimSonu.toISOString(),
            denemeSonu: ab.denemeSonu?.toISOString() ?? null,
            iyzicoBagli: !!ab.iyzicoAbonelikKodu,
            planliPaket: ab.planliPaketSurumu
              ? { kod: ab.planliPaketSurumu.paket.kod, ad: ab.planliPaketSurumu.paket.ad }
              : null,
            paketGecisTarihi: ab.paketGecisTarihi?.toISOString() ?? null,
            beklenenGecis: beklenenGecisTarihi(ab, simdi).toISOString(),
          }
        : null,
      secenekler: surumler.map((s) => {
        const islem = yoneticiIslemi({ ab, yeni: s, simdi, firmaKapali });
        return {
          paketSurumuId: s.id,
          paket: { kod: s.paket.kod, ad: s.paket.ad, kullaniciHakki: s.paket.kullaniciHakki },
          tutar: s.tutar.toFixed(2),
          paraBirimi: s.paraBirimi,
          islem: islem.tur,
          aciklama: islem.aciklama,
          kayiplar: islem.kayiplar,
          kazanclar: islem.kazanclar,
          // Satiri olmayan firmada da hesaplanir: sureli paket verildigi
          // anda kisi siniri DEVREYE GIRER (satir yokken kural uygulanmaz).
          durdurulacakUye: durdurulacakUye(aktifUye, s.paket.kullaniciHakki),
        };
      }),
      oneri:
        sonOneri && oneriEtkin
          ? {
              id: sonOneri.id,
              hedef: { kod: sonOneri.hedefPaketSurumu.paket.kod, ad: sonOneri.hedefPaketSurumu.paket.ad },
              durum: oneriEtkin,
              durumMetni: ONERI_DURUM_METNI[oneriEtkin],
              sonGecerlilik: sonOneri.sonGecerlilik.toISOString(),
              olusturuldu: sonOneri.olusturuldu.toISOString(),
              olusturanEposta: sonOneri.olusturanEposta,
              gerekce: sonOneri.gerekce,
              musteriNotu: sonOneri.musteriNotu,
              sonuclandi: sonOneri.sonuclandi?.toISOString() ?? null,
            }
          : null,
    };
  }
}
