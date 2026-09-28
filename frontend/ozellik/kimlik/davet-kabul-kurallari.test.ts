/**
 * DAVET KABUL EKRANI — SAF KURALLAR (27-28.09.2026).
 *
 * 26.09 canlı vakası: davet edilen adresin başka firmada hesabı vardı, sunucu
 * `BASKA_FIRMADA_KAYITLI` döndü ve ekran bunu okunmayan bir kutuda gösterdi
 * ("düğmeye basılmıyor"). Bu kapı ekranın KARAR veren parçalarını ölçer:
 * hangi hata "davet geçersiz", hangisi "tekrar dene"; hangi metin; giriş
 * bağlantısı nerede çizilir.
 */
import { describe, expect, it } from 'vitest';
import {
  COK_SIK_DENEME_METNI,
  SUNUCU_HATASI_METNI,
  ULASILAMADI_METNI,
  davetBilgiHataDurumu,
  davetHataMetni,
  gecerlilikMetni,
  girisBaglantisiGosterilirMi,
  hataKodu,
} from './davet-kabul-kurallari';
import { KIMLIK_HATA_METINLERI } from '../../ortak/lib/kimlik-hata-metinleri';

const yanit = (status: number, data: Record<string, unknown> = {}) => ({ response: { status, data } });

describe('davetBilgiHataDurumu — "davet açılamadı" mı, "tekrar dene" mi?', () => {
  it('yanıtsız hata (ağ, zaman aşımı) → ulasilamadi', () => {
    expect(davetBilgiHataDurumu(new Error('Network Error'))).toBe('ulasilamadi');
  });

  it('⭐ 5xx (deploy anında Caddy 502) ve 429 (hız sınırı) davet hakkında bir şey söylemez → ulasilamadi', () => {
    expect(davetBilgiHataDurumu(yanit(502))).toBe('ulasilamadi');
    expect(davetBilgiHataDurumu(yanit(500))).toBe('ulasilamadi');
    expect(davetBilgiHataDurumu(yanit(429))).toBe('ulasilamadi');
  });

  it('sunucunun verdiği ret (4xx) → gecersiz', () => {
    expect(davetBilgiHataDurumu(yanit(400, { kod: 'DAVET_GECERSIZ' }))).toBe('gecersiz');
    expect(davetBilgiHataDurumu(yanit(404))).toBe('gecersiz');
  });
});

describe('davetHataMetni — kullanıcıya giden cümle', () => {
  it('yanıtsız hata → ulaşılamadı metni', () => {
    expect(davetHataMetni(new Error('Network Error'))).toBe(ULASILAMADI_METNI);
  });

  it("429'da çerçevenin İngilizce ham metni GÖSTERİLMEZ", () => {
    const m = davetHataMetni(yanit(429, { message: 'ThrottlerException: Too Many Requests' }));
    expect(m).toBe(COK_SIK_DENEME_METNI);
    expect(m).not.toContain('Throttler');
  });

  it('mesajsız 5xx → Türkçe sunucu metni; mesajlı 5xx → sunucunun mesajı', () => {
    expect(davetHataMetni(yanit(500, { message: 'Internal server error' }))).toBe(SUNUCU_HATASI_METNI);
    expect(davetHataMetni(yanit(503, { mesaj: 'Bakım var.' }))).toBe('Bakım var.');
  });

  it('4xx: sunucunun `mesaj`ı öncelikli, yoksa kod sözlüğü', () => {
    expect(davetHataMetni(yanit(400, { kod: 'ZATEN_EKIPTE', mesaj: 'Sunucu metni.' }))).toBe('Sunucu metni.');
    expect(davetHataMetni(yanit(400, { kod: 'DAVET_GECERSIZ' }))).toBe(KIMLIK_HATA_METINLERI.DAVET_GECERSIZ);
  });

  it('hataKodu sunucunun kodunu okur', () => {
    expect(hataKodu(yanit(400, { kod: 'BASKA_FIRMADA_KAYITLI' }))).toBe('BASKA_FIRMADA_KAYITLI');
    expect(hataKodu(new Error('x'))).toBeUndefined();
  });
});

describe('girisBaglantisiGosterilirMi — "giriş yapın" yalnız işe yarayacağı yerde', () => {
  it('ZATEN_EKIPTE: kişi bu ekibin üyesi, girişi açık → bağlantı VAR', () => {
    expect(girisBaglantisiGosterilirMi('ZATEN_EKIPTE')).toBe(true);
  });

  it('⭐ KAPALI_HESAP_VAR (giriş nedene göre kapalı olabilir) ve BASKA_FIRMADA_KAYITLI → bağlantı YOK', () => {
    expect(girisBaglantisiGosterilirMi('KAPALI_HESAP_VAR')).toBe(false);
    expect(girisBaglantisiGosterilirMi('BASKA_FIRMADA_KAYITLI')).toBe(false);
    expect(girisBaglantisiGosterilirMi(undefined)).toBe(false);
  });
});

describe('gecerlilikMetni', () => {
  it('ISO tarih → "3 Ekim 2026" (İstanbul saati)', () => {
    expect(gecerlilikMetni('2026-10-03T16:59:32.252Z')).toBe('3 Ekim 2026');
    // UTC 22:30 = İstanbul ertesi gün 01:30 — gün İstanbul'a göre yazılır.
    expect(gecerlilikMetni('2026-10-03T22:30:00.000Z')).toBe('4 Ekim 2026');
  });

  it('boş ya da bozuk değer → null (satır çizilmez)', () => {
    expect(gecerlilikMetni(undefined)).toBeNull();
    expect(gecerlilikMetni('tarih-degil')).toBeNull();
  });
});

describe('BASKA_FIRMADA_KAYITLI yedek metni', () => {
  it('⭐ hesabı KAPATMAYI önermez — kapatılan adres saklama süresi boyunca davetle katılamaz', () => {
    // 26-27.09 canlı: eski metin "önce mevcut hesabınızı kapatmanız gerekir"
    // diyordu; hesap kapatıldı, davet KAPALI_HESAP_VAR ile yine reddedildi.
    expect(KIMLIK_HATA_METINLERI.BASKA_FIRMADA_KAYITLI).not.toMatch(/kapatman/i);
    expect(KIMLIK_HATA_METINLERI.BASKA_FIRMADA_KAYITLI).toContain('başka bir e-posta adresinize');
  });
});
