/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  YONETICI E-POSTA KODU — ON YUZ KAPISI (23.09.2026, Emre karari)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Arka yuz kapisi `backend/test/yonetici-eposta-kodu-test.ts`te. Bu dosya
 *  ON YUZDEKI UC HALKAYI olcer ve uculu de sessizce kirilabilir:
 *
 *   E1 `girisDaliCoz` sunucunun `yontemler` demetini OKUYOR (tahmin etmiyor)
 *   E2 `GirisDaliEkrani` `yontem`i GERCEKTEN geciriyor
 *       ⚠ EN KRITIK ASSERT. Prop varsayilani `uygulama`; gecirilmezse
 *         yonetici "Dogrulama uygulamanizdaki kodu girin" yazan bir ekran
 *         gorur ve kod HIC gonderilmez. tsc bunu YAKALAMAZ cunku prop
 *         opsiyonel. Deponun tekrarlayan hata sinifi.
 *   E3 `MfaKodAdimi` e-posta yolunda kodu ISTIYOR ve ekran dogru konusuyor
 *
 *  ⚠ DOM YOK: bu depoda RTL/jsdom kurulu degil. Olcum KAYNAK uzerinden
 *    yapilir; bu yuzden her assert mutasyonla ayrica sinandi.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// ⚠ GORELI import: vitest `@/…` cozmuyor (depoda olculmus tuzak).
import { girisDaliCoz } from '../../ortak/lib/oturum';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const EKRAN = oku('ozellik/kimlik/GirisDaliEkrani.tsx');
const ADIM = oku('ozellik/kimlik/MfaKodAdimi.tsx');

describe('ÖLÇÜT — kaynaklar okundu', () => {
  it('iki dosya da dolu', () => {
    expect(EKRAN.length).toBeGreaterThan(400);
    expect(ADIM.length).toBeGreaterThan(1000);
  });
});

describe('E1 — yöntem SUNUCUDAN okunur, tahmin edilmez', () => {
  it('⭐ `yontemler: ["eposta"]` → e-posta dalı', () => {
    const d = girisDaliCoz({ mfaGerekli: true, meydanOkuma: 'a.b.c', yontemler: ['eposta'] });
    expect(d).toEqual({ tip: 'kod', meydanOkuma: 'a.b.c', yontem: 'eposta' });
  });

  it('⭐ `["kod","kurtarma"]` → uygulama dalı (eski davranış korundu)', () => {
    const d = girisDaliCoz({ mfaGerekli: true, meydanOkuma: 'a.b.c', yontemler: ['kod', 'kurtarma'] });
    expect(d).toEqual({ tip: 'kod', meydanOkuma: 'a.b.c', yontem: 'uygulama' });
  });

  it('demet YOKSA uygulama varsayılır (eski sunucu yanıtı ekranı bozmaz)', () => {
    const d = girisDaliCoz({ mfaGerekli: true, meydanOkuma: 'a.b.c' });
    expect(d).toEqual({ tip: 'kod', meydanOkuma: 'a.b.c', yontem: 'uygulama' });
  });

  it('kurulum ve oturum dalları bozulmadı', () => {
    expect(girisDaliCoz({ mfaKurulumGerekli: true, meydanOkuma: 'x.y.z', neden: 'yonetici' }))
      .toEqual({ tip: 'kurulum', meydanOkuma: 'x.y.z', neden: 'yonetici' });
    expect(girisDaliCoz({ token: 'a.b.c' })).toEqual({ tip: 'oturum' });
    // Bayrak var ama meydan okuma yoksa kod ekranı GÖSTERİLMEZ.
    expect(girisDaliCoz({ mfaGerekli: true, yontemler: ['eposta'] })).toEqual({ tip: 'oturum' });
  });
});

describe('E2 — ⭐⭐ ekran yöntemi GEÇİRİYOR (mekanizma var, bağlantı yok)', () => {
  it('`yontem={dal.yontem}` MfaKodAdimi çağrısında', () => {
    const kod = kodu(EKRAN);
    const i = kod.indexOf('<MfaKodAdimi');
    expect(i, 'MfaKodAdimi çağrısı yok').toBeGreaterThan(-1);
    // ⚠ Çağrının KENDİ bloğuna bakılıyor: dosyanın herhangi bir yerinde
    //   `yontem` geçmesi yetmez, PROP olarak verilmiş olmalı.
    const blok = kod.slice(i, kod.indexOf('/>', i));
    expect(blok, 'yöntem geçirilmiyor — ekran varsayılan `uygulama`ya düşer')
      .toMatch(/yontem=\{dal\.yontem\}/);
  });
});

describe('E3 — e-posta yolunda ekran kodu İSTİYOR ve doğru konuşuyor', () => {
  const kod = kodu(ADIM);

  it('⭐⭐ gönderme ucu ÇAĞRILIYOR (yoksa kod hiç gitmez)', () => {
    expect(kod).toMatch(/api\.post\('\/auth\/mfa\/eposta\/gonder', \{ meydanOkuma \}\)/);
  });

  it('⭐⭐ çağrı MOUNT’ta GERÇEKTEN yapılıyor (etkinin içinde çağrılıyor)', () => {
    // ⚠ MUTASYONLA BULUNDU (23.09): assert önce yalnız `api.post(...)`ın
    //   dosyada geçtiğini ve koşulun varlığını ölçüyordu. `void kodIste(true)`
    //   satırını SİLEN mutant hayatta kaldı — `api.post` hâlâ `kodIste`
    //   gövdesinde duruyordu, ama onu ÇAĞIRAN kimse kalmamıştı. Ekran açılır,
    //   kullanıcı bekler, kod HİÇ gelmez. Ölçüt artık etkinin GÖVDESİNE bakıyor.
    const i = kod.indexOf('useEffect(');
    expect(i, 'useEffect yok').toBeGreaterThan(-1);
    const govde = kod.slice(i, kod.indexOf('}, [epostaYolu]);', i));
    expect(govde, 'etki e-posta yoluna bağlı değil')
      .toContain('if (!epostaYolu || istendi.current) return;');
    expect(govde, 'etki kodu İSTEMİYOR — çağrı silinmiş').toContain('void kodIste(true);');
  });

  it('⭐ İKİ KEZ istenmiyor (React 18 çift efekt kilidi)', () => {
    expect(kod).toMatch(/istendi\.current = true;/);
    expect(kod).toMatch(/useRef\(false\)/);
  });

  it('⭐ yöntem propu var ve varsayılanı `uygulama`', () => {
    expect(kod).toMatch(/yontem = 'uygulama'/);
    expect(kod).toMatch(/const epostaYolu = yontem === 'eposta';/);
  });

  it('⭐ kurtarma kodu seçeneği e-posta yolunda GÖSTERİLMİYOR', () => {
    // O hesapta kurtarma kodu hiç üretilmedi (kurulum adımı yok) — düğme
    // kullanıcıyı asla ilerleyemeyeceği bir ekrana götürürdü.
    expect(kod).toMatch(/\{kurtarmaModu && !epostaYolu \? \(/);
    expect(kod).toMatch(/\{epostaYolu \? \(/);
  });

  it('⭐ "yeniden gönder" var ve AYNI ucu çağırıyor', () => {
    expect(kod).toMatch(/Kodu yeniden gönder/);
    expect((kod.match(/api\.post\('\/auth\/mfa\/eposta\/gonder'/g) ?? []).length,
      'gönderme tek yerden yapılmalı').toBe(1);
  });

  it('⭐ metin e-postayı ve SPAM’i söylüyor (bu turda yaşanmış bir kusur)', () => {
    expect(ADIM).toContain('E-posta adresinize gönderdiğimiz 6 haneli kodu girin');
    expect(ADIM).toContain('spam');
  });
});
