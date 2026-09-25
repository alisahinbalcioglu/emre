/**
 * FAZ 7 F1b — OTURUM YAZIMI TEK YERDE (§6.1)
 *
 * ÖLÇÜLMÜŞ KUSUR: `login/page.tsx:30` yanıttaki `data.token`ı doğrulamadan
 * yazıyordu. Faz 7'de giriş yanıtı dallanıyor (MFA adımında `token` alanı
 * YOK) — o durumda `localStorage.setItem('token', undefined)` **"undefined"
 * DİZGESİNİ** yazar, kullanıcı her istekte `Bearer undefined` gönderir ve
 * sonsuz 401 döngüsüne girer.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  gecerliTokenMi,
  girisDonusunuAl,
  girisDonusunuSakla,
  girisSonrasiYol,
  izinliDonusYolu,
  oturumuYaz,
} from './oturum';

function sahteDepo() {
  const kutu = new Map<string, string>();
  const yazimlar: string[] = [];
  return {
    kutu,
    yazimlar,
    getItem: (k: string) => (kutu.has(k) ? (kutu.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      yazimlar.push(k);
      kutu.set(k, String(v));
    },
    removeItem: (k: string) => void kutu.delete(k),
    clear: () => kutu.clear(),
    key: (i: number) => Array.from(kutu.keys())[i] ?? null,
    get length() { return kutu.size; },
  };
}

const g = globalThis as any;
const ONCEKI = Object.prototype.hasOwnProperty.call(g, 'localStorage') ? g.localStorage : undefined;
let depo: ReturnType<typeof sahteDepo>;

beforeEach(() => {
  depo = sahteDepo();
  g.localStorage = depo;
});
afterAll(() => {
  if (ONCEKI === undefined) delete g.localStorage; else g.localStorage = ONCEKI;
});

const GECERLI = 'aaa.bbb.ccc';

describe('oturumuYaz — geçersiz yanıtta HİÇBİR ŞEY yazmaz', () => {
  it('token yoksa fırlatır ve setItem ÇAĞRILMAZ', () => {
    expect(() => oturumuYaz({ user: { id: 'u1' } })).toThrow();
    expect(depo.yazimlar).toEqual([]);
  });

  it('token undefined ise fırlatır ("undefined" dizgesi YAZILMAZ)', () => {
    expect(() => oturumuYaz({ token: undefined, user: {} })).toThrow();
    expect(depo.getItem('token')).toBeNull();
  });

  it('token JWT biçiminde değilse ("abc") fırlatır', () => {
    expect(() => oturumuYaz({ token: 'abc', user: {} })).toThrow();
    expect(depo.yazimlar).toEqual([]);
  });

  it('data null/undefined → fırlatır', () => {
    expect(() => oturumuYaz(null)).toThrow();
    expect(() => oturumuYaz(undefined)).toThrow();
    expect(depo.yazimlar).toEqual([]);
  });
});

describe('oturumuYaz — geçerli yanıtta İKİ anahtar yazılır (FIXTURE KANITI)', () => {
  it('token + user', () => {
    oturumuYaz({ token: GECERLI, user: { id: 'u1', email: 'a@b.c', role: 'user' } });
    expect(depo.getItem('token')).toBe(GECERLI);
    expect(JSON.parse(depo.getItem('user') as string)).toMatchObject({ id: 'u1' });
    expect(depo.yazimlar.sort()).toEqual(['token', 'user']);
  });
});

describe('gecerliTokenMi', () => {
  it('üç parçalı base64url dizge geçer', () => expect(gecerliTokenMi(GECERLI)).toBe(true));
  it('iki parça geçmez', () => expect(gecerliTokenMi('aaa.bbb')).toBe(false));
  it('boş parça geçmez', () => expect(gecerliTokenMi('aaa..ccc')).toBe(false));
  it('sayı geçmez', () => expect(gecerliTokenMi(123 as unknown)).toBe(false));
});

describe('girisSonrasiYol — kişi sınırı aşılmışsa panoya GİTMEZ', () => {
  it('koltukDurduruldu: true → /koltuk-durduruldu', () => {
    expect(girisSonrasiYol({ token: GECERLI, user: { id: 'u', email: 'e', role: 'user', koltukDurduruldu: true } }))
      .toBe('/koltuk-durduruldu');
  });
  it('koltukDurduruldu: false → /dashboard', () => {
    expect(girisSonrasiYol({ token: GECERLI, user: { id: 'u', email: 'e', role: 'user', koltukDurduruldu: false } }))
      .toBe('/dashboard');
  });
  it('alan yoksa → /dashboard (eski sunucu yanıtı)', () => {
    expect(girisSonrasiYol({ token: GECERLI, user: { id: 'u', email: 'e', role: 'user' } })).toBe('/dashboard');
  });
});

// ---------------------------------------------------------------------------
// PLAN 5.8 §4.4 — KAPALI HESAP, KOLTUKTAN ÖNCE
// ---------------------------------------------------------------------------
describe('girisSonrasiYol — kapalı hesap geri dönüş ekranına gider', () => {
  it('hesapKapali: true → /abonelik (ayrı ekran 22.09`da kaldırıldı)', () => {
    expect(girisSonrasiYol({ token: GECERLI, user: { id: 'u', email: 'e', role: 'user', hesapKapali: true } }))
      .toBe('/abonelik');
  });
  // ⚠ SIRA ÖLÇÜLÜYOR: sunucu da aynı sırayla karar verir
  // (`jwt-auth.guard.ts` önce HESAP_KAPALI, sonra KOLTUK_ASILDI). Ters
  // sıralansaydı kullanıcı "yöneticiniz paketi yükseltmeli" ekranına düşer
  // ve hesabının KAPALI olduğunu hiç öğrenemezdi.
  it('ikisi birden → /abonelik (koltuk değil)', () => {
    expect(girisSonrasiYol({
      token: GECERLI,
      user: { id: 'u', email: 'e', role: 'user', hesapKapali: true, koltukDurduruldu: true },
    })).toBe('/abonelik');
  });
  it('hesapKapali: false → bugünkü davranış değişmedi', () => {
    expect(girisSonrasiYol({ token: GECERLI, user: { id: 'u', email: 'e', role: 'user', hesapKapali: false } }))
      .toBe('/dashboard');
  });
});

// ---------------------------------------------------------------------------
// KAYNAK KAPISI — `localStorage.setItem('token'` YALNIZ bu dosyada
// ---------------------------------------------------------------------------
describe('kaynak kapısı — token yazımı tek yerde', () => {
  const KOK = path.join(__dirname, '../..');
  function gez(dizin: string, bulunan: string[] = []): string[] {
    for (const g2 of fs.readdirSync(dizin, { withFileTypes: true })) {
      const tam = path.join(dizin, g2.name);
      if (g2.isDirectory()) {
        if (g2.name === 'node_modules' || g2.name === '.next') continue;
        gez(tam, bulunan);
      } else if (/\.(ts|tsx)$/.test(g2.name) && !/\.test\.tsx?$/.test(g2.name)) {
        // ⚠ YORUMLAR ATILIR: kapı YORUMDA değil KODDA eşleşmeli (bu depoda
        // ölçülmüş tuzak — yorumda geçen desen yalancı kırmızı üretir).
        const icerik = fs.readFileSync(tam, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/.*$/gm, '$1');
        if (icerik.includes("localStorage.setItem('token'")) {
          bulunan.push(path.relative(KOK, tam).replace(/\\/g, '/'));
        }
      }
    }
    return bulunan;
  }

  /**
   * ⚠ İKİ DOSYA, GEREKÇELİ: `profile/page.tsx` → `tokenTazele` parola
   * değiştirme ve iki adımlı giriş yanıtındaki TAZE token'ı yazar — o yanıt
   * `user` TAŞIMAZ, `oturumuYaz` iki anahtarı birden yazıp `user`i null'a
   * çevirirdi. Orada da biçim doğrulaması `gecerliTokenMi` ile YAPILIR (aynı
   * kural, tek kaynak). 23.09: formlar Hesabım sekmelerine taşındı ama yazım
   * SAYFADA kaldı; sekmeler token'ı `onTokenTazele` ile sayfaya verir.
   * Listeye ÜÇÜNCÜ bir dosya eklemek bilinçli bir karar olmalıdır.
   */
  it("`localStorage.setItem('token'` yalnız iki gerekçeli yerde (e2e ve testler HARİÇ)", () => {
    const hepsi = [
      ...gez(path.join(KOK, 'app')),
      ...gez(path.join(KOK, 'ozellik')),
      ...gez(path.join(KOK, 'ortak')),
    ];
    expect(hepsi.sort()).toEqual(['app/(protected)/profile/page.tsx', 'ortak/lib/oturum.ts']);
  });

  it('ÖLÇÜT: tarayıcı gezgini gerçekten dosya buluyor (boş küme yalancı yeşili yok)', () => {
    const hepsi = gez(path.join(KOK, 'ortak'));
    expect(hepsi.length).toBeGreaterThan(0);
  });
});

/**
 * A2 Blok 2 (24.09.2026) — GİRİŞ DÖNÜŞ YOLU. Firma sahibine giden öneri
 * e-postası `/abonelik?oneri=<kimlik>` açar; oturum yoksa korumalı alan
 * `/login`e yollar ve adres sekmede saklanır. AÇIK YÖNLENDİRME YOK.
 */
describe('giriş dönüş yolu — yalnız izin listesi, bir kez', () => {
  const OTURUM = { token: GECERLI, user: { id: 'u', email: 'e', role: 'user' } };
  const KIMLIK = '11111111-2222-4333-8444-555555555555';
  const ONCEKI_OTURUM_DEPOSU = Object.prototype.hasOwnProperty.call(g, 'sessionStorage') ? g.sessionStorage : undefined;
  let oturumDeposu: ReturnType<typeof sahteDepo>;
  beforeEach(() => {
    oturumDeposu = sahteDepo();
    g.sessionStorage = oturumDeposu;
  });
  afterAll(() => {
    if (ONCEKI_OTURUM_DEPOSU === undefined) delete g.sessionStorage;
    else g.sessionStorage = ONCEKI_OTURUM_DEPOSU;
  });

  it('izinli: `/abonelik` ve `/abonelik?oneri=<uuid>`', () => {
    expect(izinliDonusYolu('/abonelik')).toBe('/abonelik');
    expect(izinliDonusYolu(`/abonelik?oneri=${KIMLIK}`)).toBe(`/abonelik?oneri=${KIMLIK}`);
  });

  it.each([
    '//dis.site/abonelik',
    'https://dis.site/abonelik',
    'javascript:alert(1)',
    '/abonelikx',
    '/abonelik/../admin',
    '/admin',
    '/dashboard',
    `/abonelik?oneri=${KIMLIK}&donus=//dis.site`,
    `/abonelik?oneri=${KIMLIK}#x`,
    '/abonelik?oneri=kimlik-degil',
    '/abonelik\n', // `$` satır sonundan önce eşleşmemeli (güvenlik incelemesi notu)
    '/\\dis.site', // ters bölü: tarayıcı `/\` → `//` sayar
    '',
  ])('⭐ reddedilir (açık yönlendirme yok): %s', (yol) => {
    expect(izinliDonusYolu(yol)).toBeNull();
  });

  it('saklanan izinli yol girişten sonra kullanılır ve BİR KEZ okunur', () => {
    girisDonusunuSakla(`/abonelik?oneri=${KIMLIK}`);
    expect(girisSonrasiYol(OTURUM)).toBe(`/abonelik?oneri=${KIMLIK}`);
    expect(girisSonrasiYol(OTURUM)).toBe('/dashboard');
  });

  it('izinsiz yol SAKLANMAZ ve ESKİ kaydı siler (başka sayfadan düşen oturum eski öneriye gitmesin)', () => {
    girisDonusunuSakla(`/abonelik?oneri=${KIMLIK}`);
    girisDonusunuSakla('/dashboard');
    expect(girisDonusunuAl()).toBeNull();
  });

  it('depoya elle yazılmış izinsiz değer OKURKEN de reddedilir', () => {
    oturumDeposu.setItem('girisDonusu', '//dis.site');
    expect(girisSonrasiYol(OTURUM)).toBe('/dashboard');
  });

  it('⭐ AÇIKÇA verilen izinsiz dönüş de reddedilir (süzgeç `girisSonrasiYol`un KENDİSİNDE)', () => {
    expect(girisSonrasiYol(OTURUM, '//dis.site')).toBe('/dashboard');
    expect(girisSonrasiYol(OTURUM, 'https://dis.site/abonelik')).toBe('/dashboard');
  });

  it('hesap/koltuk durumu dönüş yolundan ÖNCE gelir', () => {
    expect(girisSonrasiYol({ ...OTURUM, user: { ...OTURUM.user, hesapKapali: true } }, `/abonelik?oneri=${KIMLIK}`)).toBe('/abonelik');
    expect(girisSonrasiYol({ ...OTURUM, user: { ...OTURUM.user, koltukDurduruldu: true } }, `/abonelik?oneri=${KIMLIK}`)).toBe(
      '/koltuk-durduruldu',
    );
  });

  it('korumalı alan ve 401 yakalayıcısı `/login`den ÖNCE adresi saklıyor', () => {
    const onyuz = path.join(__dirname, '../..');
    const kabuk = fs.readFileSync(path.join(onyuz, 'app/(protected)/layout.tsx'), 'utf8');
    const api = fs.readFileSync(path.join(onyuz, 'ortak/lib/api.ts'), 'utf8');
    const sakla = 'girisDonusunuSakla(window.location.pathname + window.location.search);';
    expect(kabuk.split(sakla).length - 1).toBe(2);
    expect(api.indexOf(sakla)).toBeGreaterThan(-1);
    expect(api.indexOf(sakla)).toBeLessThan(api.indexOf("window.location.href = '/login';"));
  });
});
