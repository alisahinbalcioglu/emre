import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASGARI_IPTAL_TIKLAMASI,
  IPTAL_ADIMLARI,
  abonelikOzeti,
  iptalYoluYeterinceDerinMi,
  mirasMi,
} from './abonelik-ozeti';

/**
 * Abonelik ozeti + IPTAL YOLUNUN DERINLIGI (03.09 kullanici karari).
 *
 * ⚠ EN KRITIK BLOK "KAYNAK": profildeki abonelik kutusu ESKI
 * `UserSubscription` tablosunu gosteriyordu ve `/abonelik` sayfasindaki
 * GERCEK kayitla CELISIYORDU ("MEP — Suresiz" vs "miras-pro AKTIF").
 * Tasima sirasinda yanlis kaynagi tasimak, yanlis veriyi TEK kaynak
 * yapardi.
 */

describe('abonelikOzeti', () => {
  it('⭐ karar YOKKEN "abonelik yok" DEMEZ (bilmiyoruz ≠ yok)', () => {
    const o = abonelikOzeti(null);
    expect(o.altMetin).toContain('yukleniyor');
    expect(o.iptalEdilebilir).toBe(false);
  });

  it('paket yoksa paket secmeye yonlendirir', () => {
    const o = abonelikOzeti({ paketKodu: null, durum: 'SONA_ERDI', kalanGun: null });
    expect(o.baslik).toBe('Abonelik yok');
    expect(o.iptalEdilebilir).toBe(false);
  });

  it('⭐ goc paketi musteriye TEKNIK KODLA gosterilmez', () => {
    const o = abonelikOzeti({ paketKodu: 'miras-pro', durum: 'AKTIF', kalanGun: 300 });
    expect(o.baslik).toBe('Gecis paketi');
    expect(o.baslik).not.toContain('miras');
  });

  it('gercek paket kodu oldugu gibi gosterilir', () => {
    expect(abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: 12 }).baslik)
      .toBe('pro-mek');
  });

  it('kalan gun metne cevrilir', () => {
    expect(abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: 23 }).altMetin)
      .toContain('23');
  });

  it('kalan gun bilinmiyorsa UYDURULMAZ', () => {
    const o = abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: null });
    expect(o.altMetin).toContain('belirtilmemis');
    expect(o.altMetin).not.toMatch(/\d/);
  });

  it('⭐ iptal YALNIZ yasayan abonelikte anlamli', () => {
    for (const d of ['AKTIF', 'DENEME']) {
      expect(abonelikOzeti({ paketKodu: 'pro-mek', durum: d, kalanGun: 5 }).iptalEdilebilir).toBe(true);
    }
    for (const d of ['SONA_ERDI', 'ASKIDA', 'IPTAL']) {
      expect(abonelikOzeti({ paketKodu: 'pro-mek', durum: d, kalanGun: 0 }).iptalEdilebilir).toBe(false);
    }
  });

  it('goc paketi de iptal EDILEBILIR (musteri cikabilmeli)', () => {
    expect(abonelikOzeti({ paketKodu: 'miras-pro', durum: 'AKTIF', kalanGun: 300 }).iptalEdilebilir)
      .toBe(true);
  });

  it('mirasMi ayrimi', () => {
    expect(mirasMi('miras-core')).toBe(true);
    expect(mirasMi('pro-mek')).toBe(false);
    expect(mirasMi(null)).toBe(false);
  });
});

describe('iptal yolunun derinligi', () => {
  it('ilan edilen adimlar asgari tiklamayi saglar', () => {
    expect(iptalYoluYeterinceDerinMi()).toBe(true);
    expect(IPTAL_ADIMLARI.length).toBeGreaterThanOrEqual(ASGARI_IPTAL_TIKLAMASI);
  });

  it('kural sinirinin ALTI reddedilir', () => {
    expect(iptalYoluYeterinceDerinMi(['a', 'b'])).toBe(false);
  });
});

describe('⭐ BAGLANTI — iptal /abonelik sayfasindan KALKTI', () => {
  const sayfa = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'abonelik', 'page.tsx'),
    'utf8',
  );

  it('OLCUT: sayfa okundu ve hala paket seciyor', () => {
    expect(sayfa).toContain('Bu paketi sec');
  });

  it('⭐ iptal DUGMESI yok', () => {
    // Not: aciklama yorumunda kelime gecebilir; JSX metnini ariyoruz.
    expect(sayfa).not.toContain('>Aboneligi iptal et<');
  });

  it('⭐ iptal UCU bu sayfadan cagrilmiyor', () => {
    expect(sayfa).not.toContain("'/abonelik/iptal'");
  });

  it('⭐ "Mevcut durum" karti kalkti (bilgi hesap sayfasinda)', () => {
    expect(sayfa).not.toContain('Mevcut durum</p>');
  });

  it('sayfa erisim kapisi TASIMAMAYA devam ediyor (odeme kapisi)', () => {
    // Askidaki firma buradan odeyebilmeli; kapatilirsa kilitlenir.
    expect(sayfa).not.toContain('GerekliYetenek');
  });
});

describe('⭐ BAGLANTI — hesap sayfasi GERCEK kaynagi okuyor', () => {
  const profil = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'profile', 'page.tsx'),
    'utf8',
  );

  it('OLCUT: dosya okundu', () => {
    expect(profil.length).toBeGreaterThan(0);
  });

  it('⭐ abonelik ozeti `erisim`den turetiliyor (ESKI tablodan DEGIL)', () => {
    expect(profil).toContain('abonelikOzeti(erisim)');
  });

  it('⭐ ESKI `subscriptions` listesi artik ABONELIK olarak gosterilmiyor', () => {
    expect(profil).not.toContain('Aktif Abonelikler');
    expect(profil).not.toContain('profile.subscriptions.map');
  });

  it('⭐ iptal bagi ACILIR bolumun ICINDE (dogrudan gorunmuyor)', () => {
    // ⚠ Kelime aramak YETMEZ: ayni ifade bu bolumun ACIKLAMA yorumunda da
    // geciyor ve o yorum acilir bloktan ONCE. Gercek DUGMEYE bag: `onClick`
    // yalnizca calisan elemanda bulunur.
    const yonetim = profil.indexOf('yonetimAcik &&');
    const iptal = profil.indexOf('onClick={iptalEt}');
    expect(yonetim).toBeGreaterThan(-1);
    expect(iptal).toBeGreaterThan(yonetim);
  });

  it('⭐ yonetim bolumu YALNIZ iptal edilebilir abonelikte cikar', () => {
    // Yoksa sona ermis/askidaki abonelikte de "Abonelik yonetimi" gorunur
    // ve tiklayan kullanici bos bir bolum bulur.
    expect(profil).toContain('{ozet.iptalEdilebilir && (');
  });

  it('⭐ iptal ONAY ister (dorduncu emniyet)', () => {
    expect(profil).toContain('confirm(');
  });

  it('paket sayfasina yol var (iptal degil, YUKSELTME gorunur olsun)', () => {
    expect(profil).toContain("router.push('/abonelik')");
  });
});
