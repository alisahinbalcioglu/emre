/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAZ 7 F2b — GIRIS DALI ve IKI ADIMLI GIRIS EKRANLARI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ NE OLCULUR, NE OLCULMEZ (durust sinir): bu depoda React test
 *  kutuphanesi (`@testing-library/react`) KURULU DEGIL — bilesenler
 *  RENDER EDILEREK olculemez. Bu yuzden burada (a) SAF kararlar ve
 *  (b) KAYNAK KAPILARI olculur. Ekranlarin gorsel dogrulugu raporun
 *  "Olculemeyenler" bolumunde ACIKCA yazilidir.
 *
 *  Kaynak kapilari zayif degildir: bu dosyanin olctugu her satir, gecmiste
 *  ayrisan bir ikizin ya da unutulan bir dalin yerine gecer.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { gecerliTokenMi, girisDaliCoz } from '../../ortak/lib/oturum';
import { anahtariGrupla } from './KurulumAnahtari';

const KOK = path.join(__dirname, '../..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');
/** Yorumlari atar: kapi YORUMDA degil KODDA eslessin. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SAYFALAR = [
  'app/login/page.tsx',
  'app/register/page.tsx',
  'app/davet-kabul/page.tsx',
];
const BILESENLER = [
  'ozellik/kimlik/GirisDaliEkrani.tsx',
  'ozellik/kimlik/MfaKodAdimi.tsx',
  'ozellik/kimlik/ZorunluKurulumSihirbazi.tsx',
  'ozellik/kimlik/KurtarmaKodlariEkrani.tsx',
  'ozellik/kimlik/KurulumAnahtari.tsx',
  'ozellik/kimlik/IkiAdimliGirisKarti.tsx',
];

// ---------------------------------------------------------------------------
// 1 — SAF KARAR: yanit uc bicimden hangisinde?
// ---------------------------------------------------------------------------
describe('girisDaliCoz — giris yanitinin dallanmasi', () => {
  it('token"lu yanit → oturum', () => {
    expect(girisDaliCoz({ token: 'a.b.c', user: { id: 'u' } })).toEqual({ tip: 'oturum' });
  });

  it('⭐ `mfaGerekli` → kod adimi (meydan okuma tasinir)', () => {
    expect(girisDaliCoz({ mfaGerekli: true, meydanOkuma: 'jwt', yontemler: ['kod', 'kurtarma'] }))
      .toEqual({ tip: 'kod', meydanOkuma: 'jwt' });
  });

  it('⭐ `mfaKurulumGerekli` → kurulum sihirbazi (neden tasinir)', () => {
    expect(girisDaliCoz({ mfaKurulumGerekli: true, meydanOkuma: 'jwt', neden: 'firma' }))
      .toEqual({ tip: 'kurulum', meydanOkuma: 'jwt', neden: 'firma' });
    expect(girisDaliCoz({ mfaKurulumGerekli: true, meydanOkuma: 'jwt', neden: 'yonetici' }))
      .toEqual({ tip: 'kurulum', meydanOkuma: 'jwt', neden: 'yonetici' });
  });

  it('bilinmeyen `neden` → null (uydurma yok)', () => {
    expect(girisDaliCoz({ mfaKurulumGerekli: true, meydanOkuma: 'j', neden: 'baska' }))
      .toEqual({ tip: 'kurulum', meydanOkuma: 'j', neden: null });
  });

  it('⭐ bayrak VAR ama meydan okuma YOK → oturum (sessiz cikmaz ekran YASAK)', () => {
    // `oturumuYaz` bu yanitta GURULTUYLE firlatir; "kod ekrani" gostermek
    // kullaniciyi asla ilerleyemeyecegi bir ekranda birakirdi.
    expect(girisDaliCoz({ mfaGerekli: true })).toEqual({ tip: 'oturum' });
    expect(girisDaliCoz({ mfaKurulumGerekli: true, meydanOkuma: '' })).toEqual({ tip: 'oturum' });
  });

  it('null/undefined/bos → oturum', () => {
    expect(girisDaliCoz(null).tip).toBe('oturum');
    expect(girisDaliCoz(undefined).tip).toBe('oturum');
    expect(girisDaliCoz({}).tip).toBe('oturum');
  });
});

// ---------------------------------------------------------------------------
// 2 — LAYOUT SERTLESTIRMESI: "undefined" DIZGESI TOKEN DEGILDIR
// ---------------------------------------------------------------------------
describe('token bicimi — korunan yerlesim kapisi', () => {
  it('⭐ `gecerliTokenMi("undefined") === false`', () => {
    expect(gecerliTokenMi('undefined')).toBe(false);
    expect(gecerliTokenMi('null')).toBe(false);
    expect(gecerliTokenMi('')).toBe(false);
    expect(gecerliTokenMi(undefined)).toBe(false);
  });

  it('OLCUT: gercek bicimdeki token GECER (kural kor degil)', () => {
    expect(gecerliTokenMi('aaa.bbb.ccc')).toBe(true);
  });

  it('⭐ korunan yerlesim VARLIK degil BICIM sinar', () => {
    const s = kodu(oku('app/(protected)/layout.tsx'));
    expect(s).toContain('gecerliTokenMi(token)');
    // Eski hal: `if (!token || !storedUser)` — "undefined" dizgesini GECIRIRDI.
    expect(s).not.toMatch(/if\s*\(\s*!token\s*\|\|/);
  });
});

// ---------------------------------------------------------------------------
// 3 — UC SAYFA DA AYNI DALI KULLANIR (R1-O1)
// ---------------------------------------------------------------------------
describe.each(SAYFALAR)('%s — iki adimli giris dali', (yol) => {
  const s = kodu(oku(yol));

  it('⭐ `girisDaliCoz` cagriyor ve `GirisDaliEkrani` ciziyor', () => {
    expect(s).toContain('girisDaliCoz(');
    expect(s).toContain('GirisDaliEkrani');
  });

  it('⭐ dal karari `oturumuYaz`DAN ONCE veriliyor', () => {
    // `oturumuYaz` gecersiz token'da FIRLATIR; MFA yanitinda `token`
    // ANAHTARI YOKTUR. Once yazmaya kalkmak kullaniciya "Sunucudan gecerli
    // bir oturum anahtari gelmedi" gibi YANILTICI bir hata gosterirdi.
    expect(s.indexOf('girisDaliCoz(')).toBeLessThan(s.indexOf('oturumuYaz('));
  });

  it('F1b kapisi KORUNDU: `oturumuYaz` + `girisSonrasiYol`, dogrudan token yazimi YOK', () => {
    expect(s).toContain('oturumuYaz(');
    expect(s).toContain('girisSonrasiYol(');
    expect(s).not.toContain("localStorage.setItem('token'");
  });
});

// ---------------------------------------------------------------------------
// 4 — BILESEN KAYNAK KAPILARI
// ---------------------------------------------------------------------------
describe('iki adimli giris bilesenleri', () => {
  it('⭐ hicbiri token YAZMAZ (kaynak kapisi: yalniz iki dosya yazabilir)', () => {
    for (const b of BILESENLER) {
      expect({ dosya: b, yaziyor: kodu(oku(b)).includes("localStorage.setItem('token'") })
        .toEqual({ dosya: b, yaziyor: false });
    }
  });

  it('⭐ hicbirinde `dangerouslySetInnerHTML` YOK (QR eklenirse de olmayacak)', () => {
    // ⚠ YORUMLAR ATILIR: `KurulumAnahtari.tsx` bu deseni bir YORUMDA (QR
    // kararinin gerekcesinde) aniyor — yorumda eslesen desen kodu
    // degistirmez ve yalanci kirmizi uretirdi.
    for (const b of BILESENLER) {
      expect({ dosya: b, html: kodu(oku(b)).includes('dangerouslySetInnerHTML') })
        .toEqual({ dosya: b, html: false });
    }
  });

  it('⭐ kod adimi 401"de 1. adima DONER ("Sure doldu")', () => {
    const s = kodu(oku('ozellik/kimlik/MfaKodAdimi.tsx'));
    expect(s).toMatch(/status\s*===\s*401/);
    expect(s).toContain('onSuresiDoldu(');
    expect(oku('ozellik/kimlik/MfaKodAdimi.tsx')).toContain('Süre doldu');
  });

  it('⭐ kurtarma kodlari ekrani ONAY KUTUSU olmadan GECILEMEZ', () => {
    const s = kodu(oku('ozellik/kimlik/KurtarmaKodlariEkrani.tsx'));
    expect(s).toContain('disabled={!kaydettim}');
  });

  it('⭐ profil karti "Ac" dediginde ONCE PAROLA ister (R1-Y1)', () => {
    const s = kodu(oku('ozellik/kimlik/IkiAdimliGirisKarti.tsx'));
    // Parola adimi kurulum isteginden ONCE gelir ve istek `parola` tasir.
    expect(s).toContain("setAdim('parola')");
    expect(s).toContain("api.post('/auth/mfa/kurulum/baslat', { parola })");
  });

  it('⭐ profil karti hata metnini KARTTA gosterir, YONLENDIRME yapmaz', () => {
    const s = kodu(oku('ozellik/kimlik/IkiAdimliGirisKarti.tsx'));
    expect(s).toContain('kimlikHataMetni(err)');
    expect(s).not.toContain('window.location');
    expect(s).not.toContain('router.push');
  });

  it('⭐ `kaynak !== "kisisel"` ve sirket girisi varsa "Sirket girisinde de sor"', () => {
    const ham = oku('ozellik/kimlik/IkiAdimliGirisKarti.tsx');
    expect(kodu(ham)).toContain("mfa.kaynak !== 'kisisel' && sirketGirisiVar");
    expect(ham).toContain('Şirket girişinde de sor');
    expect(kodu(ham)).toContain("api.post('/auth/mfa/sirket-girisinde-de-sor'");
  });

  it('zorunlu MFA"da kart KAPATMA dugmesi yerine GEREKCE gosterir', () => {
    const ham = oku('ozellik/kimlik/IkiAdimliGirisKarti.tsx');
    expect(kodu(ham)).toContain('mfa.zorunlu ?');
    expect(ham).toContain('kapatılamaz');
  });
});

// ---------------------------------------------------------------------------
// 5 — ELLE ANAHTAR OKUNABILIRLIGI (saf)
// ---------------------------------------------------------------------------
describe('anahtariGrupla', () => {
  it('32 karakteri 4"lu sekiz gruba boler', () => {
    expect(anahtariGrupla('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'))
      .toBe('ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567');
  });

  it('artan karakterler kaybolmaz (son grup kisa olabilir)', () => {
    expect(anahtariGrupla('ABCDE')).toBe('ABCD E');
    expect(anahtariGrupla('')).toBe('');
  });

  it('OLCUT: cikti girdinin harflerini AYNEN tasir', () => {
    const anahtar = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    expect(anahtariGrupla(anahtar).replace(/ /g, '')).toBe(anahtar);
  });
});

// ---------------------------------------------------------------------------
// 6 — HATA SOZLUGU: HER SUNUCU KODUNUN BIR METNI VAR
// ---------------------------------------------------------------------------
describe('kimlik hata sozlugu — MFA kodlari', () => {
  it('⭐ servisteki her MFA kodunun on yuzde karsiligi var', () => {
    const sozluk = oku('ortak/lib/kimlik-hata-metinleri.ts');
    for (const k of [
      'MFA_KOD_HATALI', 'MFA_KILITLI', 'MFA_ZATEN_ACIK', 'MFA_ZORUNLU',
      'MFA_ZORUNLU_DEGIL', 'MFA_KAPALI', 'KURULUM_SURESI_DOLDU',
      'PAROLA_HATALI', 'YENIDEN_GIRIS_GEREKLI', 'ONCE_KENDINIZ_ACIN',
      'MEYDAN_OKUMA_GECERSIZ', 'KIMLIK_SIFRELEME_YOK',
    ]) {
      expect({ kod: k, var: sozluk.includes(`${k}:`) }).toEqual({ kod: k, var: true });
    }
  });

  it('⭐ `/auth/mfa/*` guardsiz uclarin UCU de `KIMLIK_UCLARI`"nda', () => {
    const s = kodu(oku('ortak/lib/api.ts'));
    expect(s).toContain("'/auth/mfa/dogrula'");
    expect(s).toContain("'/auth/mfa/zorunlu-kurulum/baslat'");
    expect(s).toContain("'/auth/mfa/zorunlu-kurulum/onayla'");
  });

  it('⭐ NEGATIF: oturumlu MFA uclari `KIMLIK_UCLARI`"nda YOK', () => {
    const s = kodu(oku('ortak/lib/api.ts'));
    const liste = s.slice(s.indexOf('const KIMLIK_UCLARI'), s.indexOf('];', s.indexOf('const KIMLIK_UCLARI')));
    expect(liste).not.toContain('/auth/mfa/kapat');
    expect(liste).not.toContain('/auth/mfa/kurulum');
  });
});
