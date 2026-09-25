import { describe, it, expect } from 'vitest';
import {
  Yetenek,
  yetenekAcikMi,
  seritEylemiGosterilsinMi,
  seritGosterilsinMi,
  seritSinifi,
  icerikDurdurulsunMu,
  type ErisimKarari,
} from './erisim-durumu';
import { tutarYaz, vitrinFiyati } from './paket-bicim';

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

  // 25.09.2026 (inceleme L1): ayni yola `Link` tiklamasi sayfayi yeniden
  // kurmaz — kullanici zaten eylemin sayfasindayken dugme OLU kalirdi.
  it('eylem dugmesi, kullanici ZATEN o sayfadaysa cizilmez; baska her yerde cizilir', () => {
    const kart = { etiket: 'Karti guncelle', yol: '/abonelik/kart' };
    expect(seritEylemiGosterilsinMi(kart, '/abonelik/kart')).toBe(false);
    expect(seritEylemiGosterilsinMi(kart, '/dashboard')).toBe(true);
    expect(seritEylemiGosterilsinMi(kart, '/abonelik')).toBe(true);
    const paket = { etiket: 'Paket sec', yol: '/abonelik' };
    expect(seritEylemiGosterilsinMi(paket, '/abonelik')).toBe(false);
    expect(seritEylemiGosterilsinMi(paket, '/abonelik/kart')).toBe(true);
    // Sorgu dizesi karsilastirmaya girmez (`usePathname` onu tasimaz).
    expect(seritEylemiGosterilsinMi({ etiket: 'x', yol: '/abonelik?oneri=1' }, '/abonelik')).toBe(false);
    expect(seritEylemiGosterilsinMi(undefined, '/dashboard')).toBe(false);
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

describe('paket — vitrin fiyati (dolar capa, TL sozlesme)', () => {
  const temelSurum = {
    paketSurumuId: 'ps1',
    tutar: '1649.00',
    paraBirimi: 'TRY',
    referansTutar: '28.00',
    referansParaBirimi: 'USD',
    periyot: 'MONTHLY',
    periyotAdedi: 1,
    denemeGunu: 30,
  };

  it('capa VARSA dolar buyuk, TL altta', () => {
    const v = vitrinFiyati(temelSurum);
    expect(v.ana).toBe('$28,00');
    expect(v.alt).toContain('₺1.649,00');
  });

  it('★ alt satir TAHSILATIN TL oldugunu ACIKCA soyler', () => {
    // Musteri neyin cekilecegini net gormeli; "≈" ve "tahsil edilir"
    // ifadesi bilincli — sonradan surpriz olmamali.
    const v = vitrinFiyati(temelSurum);
    expect(v.alt).toMatch(/tahsil edilir/);
    expect(v.alt).toMatch(/KDV dahil/);
  });

  it('★ capa YOKSA dolar UYDURULMAZ — yalniz TL gosterilir', () => {
    const v = vitrinFiyati({
      ...temelSurum,
      referansTutar: null,
      referansParaBirimi: null,
    });
    expect(v.ana).toBe('₺1.649,00');
    expect(v.alt).toBeNull();
  });

  it('★ capa SOZLESME TUTARINI GIZLEMEZ (ikisi de ekranda)', () => {
    // En tehlikeli tasarim hatasi: yalniz dolari gosterip TL'yi saklamak.
    // Musteri 28 dolar sanip 1649 TL cekilince guven kaybi olur.
    const v = vitrinFiyati(temelSurum);
    expect(v.alt).not.toBeNull();
    expect(v.alt).toContain('1.649');
  });
});

/**
 * 22.09.2026 — KABUK DURDURMA KARARI.
 *
 * OLCULEN KUSUR: paketsiz hesapta sunucu dogru davraniyordu (403
 * `ABONELIK_KISITLI`), ama 19 korumali sayfanin 18'i bunu GENEL hata sanip
 * kirmizi "Veriler yuklenirken bir hata olustu" basiyordu. Karar artik
 * kabukta tek yerde veriliyor (`ErisimKapisi`); bu blok o kararin KENDISINI
 * olcer — kablolamasini `backend/test/erisim-kapisi-test.ts` Q2/Q3 olcer.
 */
describe('erisim — kabuk durdurma karari', () => {
  const kapali = karar({ erisimVar: false, saltOkunur: false, durum: 'SONA_ERDI' });

  it('paketsiz hesap sayfa icerigini GORMEZ', () => {
    expect(icerikDurdurulsunMu(kapali, '/library')).toBe(true);
    expect(icerikDurdurulsunMu(kapali, '/quotes/abc')).toBe(true);
  });

  it('★ KILITLENME YASAGI: /abonelik her zaman acik', () => {
    // Kapanirsa kullanici odeyemez ve kapali durumdan CIKAMAZ — duzeltmenin
    // tek yolu elle DB mudahalesi olurdu.
    expect(icerikDurdurulsunMu(kapali, '/abonelik')).toBe(false);
    expect(icerikDurdurulsunMu(kapali, '/abonelik/kart')).toBe(false);
  });

  it('★ KVKK haklari odeme durumuna BAGLANMAZ: /profile acik', () => {
    expect(icerikDurdurulsunMu(kapali, '/profile')).toBe(false);
  });

  it('★ salt-okunur (KISITLI) firma DURDURULMAZ — veriyi gormeye devam eder', () => {
    const k = karar({ durum: 'KISITLI', erisimVar: true, saltOkunur: true });
    expect(icerikDurdurulsunMu(k, '/library')).toBe(false);
    expect(icerikDurdurulsunMu(k, '/quotes')).toBe(false);
  });

  it('karar HENUZ YUKLENMEDIYSE (null) durdurmaz', () => {
    // Her sayfa acilisinda bir anlik "erisiminiz yok" yanip sonmesi olurdu;
    // ayrica firmasiz hesapta karar kalici olarak null'dir.
    expect(icerikDurdurulsunMu(null, '/library')).toBe(false);
  });

  it('muafiyet YOL ON-EKI ile eslesir, dizge icerigiyle degil', () => {
    // '/abonelik' muaf diye '/aboneliksiz-...' muaf sayilmamali.
    expect(icerikDurdurulsunMu(kapali, '/aboneliksiz-bir-sayfa')).toBe(true);
    expect(icerikDurdurulsunMu(kapali, '/dashboard/abonelik')).toBe(true);
  });
});
