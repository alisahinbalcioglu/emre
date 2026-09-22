import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../db/prisma.service';
import { tokenImzala } from './token-imza';
import { firmaPaketSeviyesi } from './seviye';
import {
  koltukDurumuHesapla,
  type FirmaRol,
} from '../../ozellik/firma/uyelik-kurallari';
import {
  girisKarariSaf,
  type GirisYolu,
  type MfaZorunlulukNedeni,
} from './mfa/mfa-karari';
import { meydanOkumaImzala } from './mfa/meydan-okuma';
import {
  geriDonusPenceresinde,
  kapaliHesapDurumu,
  type KapaliHesapGirdisi,
} from './kapali-hesap';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F1b — TEK OTURUM KAPISI (§3.11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Token veren yollar cogaliyor: bugun `login` + `register`, F1b ile
 *  `davet-kabul`, F2b ile `mfa/dogrula`, F3b ile `sso/degis` + `sso/katil`.
 *  Her yeni yol kendi kapisini kendi yazarsa biri mutlaka ban ya da yumusak
 *  silme kontrolunu unutur — bu depoda o hata sinifi olculdu (ban dugmesi
 *  yonetici panelinde calisip HICBIR SEY YAPMIYORDU, 28.08 G1).
 *
 *  Bu yuzden: kapi TEK (`hesapKapisi`), yanit TEK (`oturumYaniti`).
 *  F2b bunun onune `girisKarari`yi koyacak (MFA/kurumsal dallanma).
 */

/** `hesapKapisi`nin okudugu en dar kullanici sekli. */
export type KapiKullanicisi = KapaliHesapGirdisi & {
  status?: string | null;
  deletedAt?: Date | null;
};

/**
 * HESAP KAPISI — banli hesap oturum ALAMAZ; kapatilmis hesap YALNIZ geri
 * donus penceresindeyse alabilir.
 *
 * ⚠ METINLER `auth.service.ts:85-95`ten BIREBIR tasindi (degistirilmedi):
 * `faz2-kullanici-yonetimi-test.ts` ve `guvenlik-turu-2-test.ts` kaynak
 * kapilari bu metni ariyor.
 *
 * ── PLAN 5.8 §4.1 (K1): 30 GUNLUK GERI DONUS ─────────────────────────────
 * Eskiden `deletedAt` dolu olan HER hesap reddediliyordu. K1 ile musteri,
 * kendi kapattigi hesabina 30 gun boyunca AYNI adres ve parolayla girip
 * paket satin alarak geri donebiliyor. Kosul `kapali-hesap.ts`te TEK yerde:
 * neden `kendi` OLACAK ve `imhaTarihi` HENUZ GECMEMIS olacak.
 *
 * ⚠ GEVSEME YALNIZ GIRISTEDIR, ERISIMDE DEGIL. Giren hesap "askida" kipine
 * duser (`erisim.servisi.ts` `kapaliKarar`) ve `JwtAuthGuard` teklif /
 * kutuphane / cikti / ceviri dahil her ucu 403 `HESAP_KAPALI` ile kapatir.
 * Girise izin vermek, veriyi acmak DEGIL; odeme sayfasina ve KVKK veri
 * indirmesine ulasmayi acmaktir.
 *
 * ⚠ BAN KONTROLU ONCE: banli VE kapali bir hesap "askiya alinmis" gormeli.
 * Sirayi degistirmek, banli birine geri donus ekrani gosterirdi.
 *
 * ⚠ TEK BASINA YETMEZ: mevcut token'lar 7 gun daha gecerlidir. Ikinci kapi
 * `strategies/jwt.strategy.ts`tedir; ikisi BIRLIKTE anlamlidir ve ikisi de
 * AYNI `geriDonusPenceresinde` yuklemini okur (ikiz kural yok).
 */
export function hesapKapisi(user: KapiKullanicisi, simdi = new Date()): void {
  if (user.status === 'banned') {
    throw new UnauthorizedException('Hesabiniz askiya alinmis.');
  }
  if (user.deletedAt && !geriDonusPenceresinde(user, simdi)) {
    throw new UnauthorizedException('Hesabiniz kapatilmis.');
  }
}

/**
 * YAKIN ZAMANDA GIRIS YAPILDI MI (R1-Y1) — saf.
 *
 * ⚠ `authAt === null` → **false**. Eski (Faz 7 oncesi) token yakin zaman
 * kaniti SAYILMAZ; onu tasiyan kullanici hassas islem icin yeniden giris
 * yapar (`YENIDEN_GIRIS_GEREKLI`). Fail-closed: `true` donmek, 7 gunluk her
 * eski token'i "az once giris yapti" saymak olurdu.
 *
 * Tuketicileri F2b/F3b (parolasiz hesapta MFA kurulumu, hesap kapatma,
 * kurumsal baglanti kaldirma). F1b yalnizca kurar ve olcer.
 */
export function yakinZamandaGirisMi(
  authAt: number | null | undefined,
  simdiSn: number,
  esikSn = 600,
): boolean {
  if (typeof authAt !== 'number') return false;
  return simdiSn - authAt <= esikSn;
}

/** Oturum yanitina giren kullanici sekli. */
export type OturumKullanicisi = {
  id: string;
  email: string;
  role: string;
  firmaId?: string | null;
  firmaRol?: FirmaRol | string | null;
  createdAt?: Date | null;
  /** FAZ 7 F2b — `girisKarari` okur; `oturumYaniti` kullanmaz. */
  mfaAcikAt?: Date | null;
  mfaKaynagi?: string | null;
  status?: string | null;
  deletedAt?: Date | null;
  /** PLAN 5.8 §4 — geri donus penceresi ve kapali hesap ekrani icin. */
  kapatmaNedeni?: string | null;
  imhaTarihi?: Date | null;
};

/**
 * FAZ 7 F2b — `girisKarari`nin UC cevabindan biri (§4.4).
 *
 * ⚠ MFA dallarinda `token` ANAHTARI YOKTUR. Bugunku `login/page.tsx:30`
 * `setItem('token', data.token)` yaziyordu; token alani `undefined` olsa
 * tarayiciya `"undefined"` DIZGESI yazilir ve sonraki her istek
 * `Bearer undefined` ile 401 alirdi. Sekil TIPTE de ayri tutuluyor ki
 * ileride biri yanlislikla token eklemesin.
 */
export type GirisKarariYaniti =
  | Awaited<ReturnType<OturumServisi['oturumYaniti']>>
  | { mfaGerekli: true; meydanOkuma: string; yontemler: ['kod', 'kurtarma'] }
  | {
      mfaKurulumGerekli: true;
      meydanOkuma: string;
      neden: MfaZorunlulukNedeni | null;
    };

@Injectable()
export class OturumServisi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * OTURUM YANITI — `login` sekli (`{ token, user }`).
   *
   * ⚠ `tier` SAKLANAN `User.tier` DEGIL, firmanin aboneliginden TURETILIR
   * (2.12/F1a). Alan ADI korunur: on yuz bu degeri localStorage kopyasina
   * yaziyor.
   *
   * ⚠ `koltukDurduruldu` BURADA da hesaplanir cunku giris aninda
   * `JwtStrategy` HIC KOSMAZ (token daha yeni basildi). On yuz girişten
   * hemen sonra `/koltuk-durduruldu`ya gidebilmeli. Hesap AYNI saf
   * fonksiyondan gelir (`koltukDurumuHesapla`) — ikiz kural yok.
   *
   * ⚠ PLAN 5.8 §4.4: `hesapKapali` de AYNI gerekceyle burada hesaplanir.
   * Kapali hesap giristen sonra panoya DEGIL `/hesap-kapali` ekranina
   * gitmeli — panoya gitse her istegi 403 alirdi (koltuk deseninin aynisi).
   */
  async oturumYaniti(
    user: OturumKullanicisi,
    secenek: { authAt: number | null },
  ): Promise<{
    token: string;
    user: {
      id: string;
      email: string;
      role: string;
      tier: string | null;
      koltukDurduruldu: boolean;
      hesapKapali: boolean;
    };
  }> {
    const token = tokenImzala(
      this.jwtService,
      user.id,
      user.email,
      user.role,
      secenek.authAt,
    );
    // ⚠ 2.15: `?? 'core'` YEDEGI KALDIRILDI. 2.13'ten sonra `etkinSeviye`
    // abonelik yurumuyorsa `null` doner; yedek, suresi dolmus bir PRO
    // musteriye kenar cubugunda "Basic" rozeti gosteriyordu — sahip
    // OLMADIGI bir paket. Bos hali ekran karsilar (`paketRozeti`).
    const tier = await firmaPaketSeviyesi(this.prisma, user.firmaId);
    const koltukDurduruldu = await this.koltukDurduruldu(user);
    const hesapKapali = await this.hesapKapaliMi(user);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tier,
        koltukDurduruldu,
        hesapKapali,
      },
    };
  }

  /**
   * PLAN 5.8 §4 — "bu oturum kapali bir hesabin mi?"
   *
   * IKI kapanma da sayilir (`kapaliHesapDurumu`): kisi kendi kapatti ya da
   * FIRMASI kapandi (K2). Ikincisi icin firma satirina bakmak SART: uyenin
   * kendi `deletedAt`i bos olabilir ve o hesap bugun sorunsuz giris yapardi.
   *
   * ⚠ Firma sorgusu YALNIZ gerektiginde atilir: hesabin kendisi kapaliysa
   * karar zaten kesindir, firmasiz hesapta da sorulacak bir sey yoktur.
   * Giris/kayit basina EN FAZLA bir ek `findUnique` — istek basina degil.
   */
  private async hesapKapaliMi(user: OturumKullanicisi): Promise<boolean> {
    if (user.deletedAt) return true;
    if (!user.firmaId) return false;
    const firma = await this.prisma.firma.findUnique({
      where: { id: user.firmaId },
      select: { imhaTarihi: true },
    });
    return kapaliHesapDurumu({
      deletedAt: user.deletedAt ?? null,
      kapatmaNedeni: user.kapatmaNedeni ?? null,
      imhaTarihi: user.imhaTarihi ?? null,
      firmaImhaTarihi: firma?.imhaTarihi ?? null,
    }).kapali;
  }

  /**
   * GIRIS KARARI (F2b, §4.6) — TOKEN VEREN HER YOLUN TEK KAPISI.
   *
   * ⚠ R1-O1: `login`, `register` ve `davet-kabul` artik DOGRUDAN
   * `oturumYaniti` CAGIRMAZ. Gerekce olculdu: davet kabulu kendi yanitini
   * kurdugu surece firma zorunlulugu o yolda SESSIZCE atlaniyordu — yeni
   * uye MFA'siz giriyordu. Kapi tek olunca yeni bir giris yolu eklemek
   * kurali unutmayi imkansiz kilar.
   *
   * ⚠ Firma YALNIZ gerektiginde okunur (`mfaZorunlu`): MFA'si acik olan
   * kullanicida karar firmadan bagimsizdir, ek sorgu atilmaz.
   */
  async girisKarari(
    user: OturumKullanicisi,
    yol: GirisYolu,
  ): Promise<GirisKarariYaniti> {
    hesapKapisi(user);
    // MFA zaten acikken zorunluluk kararsizdir → firma sorgusu GEREKSIZ.
    const firma =
      !user.mfaAcikAt && user.firmaId
        ? await this.prisma.firma.findUnique({
            where: { id: user.firmaId },
            select: { mfaZorunlu: true },
          })
        : null;
    const { tip, neden } = girisKarariSaf({ user, firma, yol });
    if (tip === 'mfa') {
      return {
        mfaGerekli: true,
        meydanOkuma: meydanOkumaImzala({
          userId: user.id,
          amac: 'mfa-dogrula',
          yol,
        }),
        yontemler: ['kod', 'kurtarma'],
      };
    }
    if (tip === 'mfa-kurulum') {
      return {
        mfaKurulumGerekli: true,
        meydanOkuma: meydanOkumaImzala({
          userId: user.id,
          amac: 'mfa-kurulum',
          yol,
        }),
        neden,
      };
    }
    return this.oturumYaniti(user, { authAt: Math.floor(Date.now() / 1000) });
  }

  /** Firmasiz ya da eksik alanli kullanicida sorgu ATILMAZ (fail-open: calisir). */
  private async koltukDurduruldu(user: OturumKullanicisi): Promise<boolean> {
    if (!user.firmaId || !user.createdAt || !user.firmaRol) return false;
    const { durduruldu } = await koltukDurumuHesapla(this.prisma as any, {
      id: user.id,
      firmaId: user.firmaId,
      firmaRol: user.firmaRol as FirmaRol,
      createdAt: user.createdAt,
    });
    return durduruldu;
  }
}
