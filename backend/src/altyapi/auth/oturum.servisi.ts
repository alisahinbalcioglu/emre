import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../db/prisma.service';
import { tokenImzala } from './token-imza';
import { firmaPaketSeviyesi } from './seviye';
import {
  koltukDurumuHesapla,
  type FirmaRol,
} from '../../ozellik/firma/uyelik-kurallari';

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
export type KapiKullanicisi = {
  status?: string | null;
  deletedAt?: Date | null;
};

/**
 * HESAP KAPISI — banli ya da kapatilmis hesap oturum ALAMAZ.
 *
 * ⚠ METINLER `auth.service.ts:85-95`ten BIREBIR tasindi (degistirilmedi):
 * `faz2-kullanici-yonetimi-test.ts` ve `guvenlik-turu-2-test.ts` kaynak
 * kapilari bu metni ariyor.
 *
 * ⚠ TEK BASINA YETMEZ: mevcut token'lar 7 gun daha gecerlidir. Ikinci kapi
 * `strategies/jwt.strategy.ts`tedir; ikisi BIRLIKTE anlamlidir.
 */
export function hesapKapisi(user: KapiKullanicisi): void {
  if (user.status === 'banned') {
    throw new UnauthorizedException('Hesabiniz askiya alinmis.');
  }
  if (user.deletedAt) {
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
      tier: string;
      koltukDurduruldu: boolean;
    };
  }> {
    const token = tokenImzala(
      this.jwtService,
      user.id,
      user.email,
      user.role,
      secenek.authAt,
    );
    const tier = (await firmaPaketSeviyesi(this.prisma, user.firmaId)) ?? 'core';
    const koltukDurduruldu = await this.koltukDurduruldu(user);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tier,
        koltukDurduruldu,
      },
    };
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
