import { describe, it, expect } from 'vitest';
import {
  Yetenek,
  yetenekAcikMi,
  seritGosterilsinMi,
  seritSinifi,
  type ErisimKarari,
} from './erisim-durumu';
import { tutarYaz } from './paket-bicim';

/**
 * ADIM 2 — on yuz erisim mantigi.
 *
 * ⚠ EN KRITIK BLOK "SUNUCUYLA ESLIK": on yuzdeki KISITLI_MODDA_ACIK kumesi
 * backend'deki ile BIREBIR AYNI olmali. Ayrisirsa kullanici acik gorunen bir
 * dugmeye basar ve 403 yer — yani hata, duzeltmeye calistigimiz seyden
 * (kisitli mod) daha kotu bir deneyim uretir.
 */

const temel: ErisimKarari = {
  erisimVar: true,
  saltOkunur: false,
  durum: 'AKTIF',
  uyari: null,
  kalanGun: null,
  paketKodu: 'pro-mep',
  kullaniciHakki: 5,
  dwgAktif: true,
};

const karar = (y: Partial<ErisimKarari>): ErisimKarari => ({ ...temel, ...y });

describe('erisim — karar matrisi', () => {
  it('OLCUT: tam erisimde deger ureten yetenekler ACIK', () => {
    expect(yetenekAcikMi(temel, Yetenek.TEKLIF_OLUSTUR)).toBe(true);
    expect(yetenekAcikMi(temel, Yetenek.CIKTI_INDIR)).toBe(true);
  });

  it('KISITLI: goruntuleme acik, deger uretme kapali', () => {
    const k = karar({ durum: 'KISITLI', saltOkunur: true });
    // "veriyi goster"
    expect(yetenekAcikMi(k, Yetenek.TEKLIF_GORUNTULE)).toBe(true);
    expect(yetenekAcikMi(k, Yetenek.KUTUPHANE_GORUNTULE)).toBe(true);
    // "deger uretme"
    expect(yetenekAcikMi(k, Yetenek.TEKLIF_OLUSTUR)).toBe(false);
    expect(yetenekAcikMi(k, Yetenek.CIKTI_INDIR)).toBe(false);
    expect(yetenekAcikMi(k, Yetenek.EXCEL_YUKLE)).toBe(false);
    expect(yetenekAcikMi(k, Yetenek.DWG_YUKLE)).toBe(false);
  });

  it('ASKIDA: goruntuleme bile kapali', () => {
    const k = karar({ durum: 'ASKIDA', erisimVar: false });
    expect(yetenekAcikMi(k, Yetenek.TEKLIF_GORUNTULE)).toBe(false);
    expect(yetenekAcikMi(k, Yetenek.CIKTI_INDIR)).toBe(false);
  });

  it('ODEME_BEKLIYOR: tolerans — erisim TAM (uyari var, kisit yok)', () => {
    const k = karar({ durum: 'ODEME_BEKLIYOR' });
    expect(yetenekAcikMi(k, Yetenek.TEKLIF_OLUSTUR)).toBe(true);
    expect(yetenekAcikMi(k, Yetenek.CIKTI_INDIR)).toBe(true);
  });

  it('dwgAktif=false: yalniz DWG kapanir, digerleri acik kalir', () => {
    const k = karar({ dwgAktif: false });
    expect(yetenekAcikMi(k, Yetenek.DWG_YUKLE)).toBe(false);
    expect(yetenekAcikMi(k, Yetenek.TEKLIF_OLUSTUR)).toBe(true);
  });

  it('★ KILITLENME YASAGI: ABONELIK_YONET 7 durumun 7sinde de ACIK', () => {
    const durumlar: ErisimKarari['durum'][] = [
      'DENEME', 'AKTIF', 'ODEME_BEKLIYOR', 'KISITLI', 'ASKIDA', 'IPTAL', 'SONA_ERDI',
    ];
    for (const d of durumlar) {
      const k = karar({ durum: d, erisimVar: false, saltOkunur: true });
      expect(
        yetenekAcikMi(k, Yetenek.ABONELIK_YONET),
        `${d} durumunda odeme sayfasi kapandi — musteri askidan cikamaz`,
      ).toBe(true);
    }
  });

  it('★ karar YUKLENMEDIYSE kapatmaz (sayfa acilisinda yanip sonme olmaz)', () => {
    // Sunucu zaten gercek kapidir; null'da kapatmak her sayfa acilisinda
    // bir anlik "erisiminiz yok" yanip sonmesi uretirdi.
    expect(yetenekAcikMi(null, Yetenek.TEKLIF_OLUSTUR)).toBe(true);
    expect(yetenekAcikMi(null, Yetenek.CIKTI_INDIR)).toBe(true);
  });
});

describe('erisim — serit', () => {
  it('uyari yoksa serit gosterilmez', () => {
    expect(seritGosterilsinMi(temel)).toBe(false);
    expect(seritGosterilsinMi(null)).toBe(false);
  });

  it('uyari varsa serit gosterilir', () => {
    const k = karar({
      uyari: { seviye: 'uyari', baslik: 'Odemeniz alinamadi', metin: '…' },
    });
    expect(seritGosterilsinMi(k)).toBe(true);
  });

  it('seviye rengi ayrisir (kritik ≠ uyari ≠ bilgi)', () => {
    const kritik = seritSinifi('kritik');
    const uyari = seritSinifi('uyari');
    const bilgi = seritSinifi('bilgi');
    expect(new Set([kritik, uyari, bilgi]).size).toBe(3);
    expect(kritik).toContain('red');
  });
});

describe('paket — tutar bicimleme', () => {
  it('tutar STRING olarak bicimlenir — float"a DUSURULMEZ', () => {
    // Sunucu Decimal.toFixed(2) doner. Number()'a cevirmek kurus kaybinin
    // bilinen kaynagidir (P2 turu, "para 2 ondalik" dersi).
    expect(tutarYaz('1499.90', 'TRY')).toBe('₺1.499,90');
    expect(tutarYaz('999.00', 'TRY')).toBe('₺999,00');
  });

  it('binlik ayraci TR bicimi', () => {
    expect(tutarYaz('12345.67', 'TRY')).toBe('₺12.345,67');
  });

  it('kesirsiz gelirse 2 haneye tamamlanir', () => {
    expect(tutarYaz('250', 'TRY')).toBe('₺250,00');
  });

  it('para birimi sembolu degisir', () => {
    expect(tutarYaz('10.00', 'USD')).toBe('$10,00');
    expect(tutarYaz('10.00', 'EUR')).toBe('€10,00');
  });

  it('★ uzun ondalik JS float yuvarlamasina TAKILMAZ (metin islenir)', () => {
    // 0.1+0.2 tuzagi: metin olarak islendigi icin bozulma YOK.
    expect(tutarYaz('1000000.05', 'TRY')).toBe('₺1.000.000,05');
  });
});
