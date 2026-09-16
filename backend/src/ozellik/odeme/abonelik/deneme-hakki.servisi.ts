import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../altyapi/db/prisma.service';
import { epostaDogrulandiMi } from '../../../altyapi/auth/eposta-dogrulama';
import {
  DenemeKarari,
  denemeAnahtarlari,
  denemeKaydiKosulu,
  mirasPaketiMi,
} from './deneme-hakki';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DENEME HAKKI KARARI — veritabani sorusu (FAZ 6.12a, 15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Kural ve anahtarlar: deneme-hakki.ts. Iki cagiran var:
 *    · SatinAlmaServisi.baslat  — form e-postasi ve telefonla (tam karar)
 *    · AbonelikController.paketler — form verisi YOK, yalniz firma + hesap
 *      e-postasi (kartta gosterilecek metin). Kartta "deneme var" gorunup
 *      formdaki telefon eslesirse karar baslat'ta degisir; o durumda baslat
 *      yaniti `denemeHakki: false` doner ve odeme ekrani notu gosterir —
 *      musteri karti girmeden ONCE ogrenir.
 *
 *  ⚠ GIRISSIZ /fiyatlar UCU BUNU CAGIRMAZ (karar K-P7): o uc 60 sn bellekte
 *  onbellekler; firma bazli cevap onbellege girerse bir firmanin karari
 *  herkese sizar.
 *
 *  SIRA (her adimin gerekcesi):
 *    1. Anahtar eslesmesi (firma / e-posta / form e-postasi / telefon)
 *       → "kullanildi". Once bu: dogrulanmamis e-postali biri zaten hakki
 *       yoksa ona "e-postanizi dogrulayin" demek, dogrulayinca deneme
 *       alacagi yalanini soylerdi.
 *    2. Miras (gecis) firmasi (karar K-P3) → "kullanildi". Migration miras
 *       firmalara kayit da yazar; bu dal kayit yazilmadan once acilmis ya da
 *       kaydi eksik firma icin ikinci emniyettir.
 *    3. E-posta dogrulanmamis (karar K-P4) → "eposta-dogrulanmadi".
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class DenemeHakkiServisi {
  constructor(private readonly prisma: PrismaService) {}

  async karar(p: {
    firmaId: string;
    kullaniciId: string;
    formEposta?: string | null;
    telefon?: string | null;
  }): Promise<DenemeKarari> {
    const kullanici = await this.prisma.user.findUnique({
      where: { id: p.kullaniciId },
      select: { email: true },
    });
    const anahtarlar = denemeAnahtarlari({
      hesapEposta: kullanici?.email,
      formEposta: p.formEposta,
      telefon: p.telefon,
    });

    const onceki = await this.prisma.denemeKullanimi.findFirst({
      where: denemeKaydiKosulu(p.firmaId, anahtarlar),
      select: { id: true },
    });
    if (onceki) return { hak: false, gerekce: 'kullanildi', anahtarlar };

    const abonelik = await this.prisma.abonelik.findUnique({
      where: { firmaId: p.firmaId },
      select: { paketSurumu: { select: { paket: { select: { kod: true } } } } },
    });
    if (abonelik && mirasPaketiMi(abonelik.paketSurumu.paket.kod)) {
      return { hak: false, gerekce: 'kullanildi', anahtarlar };
    }

    // ⚠ TEK OKUMA YERI (16.09 birlestirme): `emailVerified` alanina `src/ozellik`
    // altinda BAKILMAZ — ayni kapiyi ceviri kotasi ve firma ceviri duzeltmesi de
    // soruyor; kopyalanan sorgu bir gun baska alana (`emailVerifiedAt`) bakip
    // ayrisirdi. Kapi: `ceviri-duzeltme-test.ts` K7 kaynak kapisi.
    // Sorgu EN SONA konur: daha once elenen istekte hic kosmaz.
    if (!(await epostaDogrulandiMi(this.prisma, p.kullaniciId))) {
      return { hak: false, gerekce: 'eposta-dogrulanmadi', anahtarlar };
    }
    return { hak: true, gerekce: 'var', anahtarlar };
  }
}
