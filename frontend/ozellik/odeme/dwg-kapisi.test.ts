import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  dwgKapisi,
  dwgTiklanabilir,
  dwgRozetMetni,
  dwgIpucu,
} from './dwg-kapisi';

/**
 * ADIM 2 — DWG kapisi: "Pro'da aktif, Core'da sonuk" (kullanici karari 02.09).
 *
 * ⚠ EN KRITIK IKI BLOK:
 *
 * (1) "YUKLEME ANI" — `loading` durumu ayri olmak ZORUNDA. Yetenekler
 *     `/auth/me`'den geliyor; ilk render'da yok. Iki durumlu bir kapi o anda
 *     "yetenek yok" okur ve Pro musteriye bir an "Pro paket gerekli" yazar.
 *
 * (2) "GIRIS NOKTALARI BAGLI MI" — kusurun kendisi mantik degil BAGLANTI
 *     eksikligiydi: `hasAnyDwg` TANIMLIYDI ama hicbir bilesen OKUMUYORDU.
 *     Saf fonksiyonu test etmek bu kusuru YAKALAMAZ; giris noktalarinin
 *     fonksiyonu gercekten cagirdigini ayrica olcmek gerekir.
 */

describe('dwgKapisi', () => {
  it('Pro (dwg var) → acik', () => {
    expect(dwgKapisi({ loading: false, dwgVar: true })).toBe('acik');
  });

  it('Core (dwg yok) → sonuk', () => {
    expect(dwgKapisi({ loading: false, dwgVar: false })).toBe('sonuk');
  });

  it('⭐ yukleme aninda "sonuk" DEGIL "yukleniyor" doner', () => {
    // Pro musteri de ilk render'da dwgVar=false ile gelir. Burada 'sonuk'
    // donersek kutu bir an "Pro paket gerekli" yazip sonra acilir.
    expect(dwgKapisi({ loading: true, dwgVar: false })).toBe('yukleniyor');
  });

  it('⭐ yukleme, dwgVar true olsa bile once gelir (sira korunur)', () => {
    expect(dwgKapisi({ loading: true, dwgVar: true })).toBe('yukleniyor');
  });
});

describe('dwgTiklanabilir', () => {
  it('yalniz acik durumda tiklanabilir', () => {
    expect(dwgTiklanabilir('acik')).toBe(true);
    expect(dwgTiklanabilir('sonuk')).toBe(false);
  });

  it('⭐ yukleme aninda da tiklanamaz (403 yiyecek tiklama olusmasin)', () => {
    expect(dwgTiklanabilir('yukleniyor')).toBe(false);
  });
});

describe('dwgRozetMetni / dwgIpucu', () => {
  it('acik → PRO rozeti, ipucu yok', () => {
    expect(dwgRozetMetni('acik')).toBe('PRO');
    expect(dwgIpucu('acik')).toBeUndefined();
  });

  it('sonuk → NEDEN kapali oldugunu soyler', () => {
    expect(dwgRozetMetni('sonuk')).toBe('Pro paket gerekli');
    expect(dwgIpucu('sonuk')).toContain('Pro');
  });

  it('⭐ yukleme aninda hicbir sey IDDIA ETMEZ', () => {
    expect(dwgRozetMetni('yukleniyor')).toBeNull();
    expect(dwgIpucu('yukleniyor')).toBeUndefined();
  });
});

describe('⭐ GIRIS NOKTALARI — kapi gercekten bagli mi', () => {
  const oku = (...parcalar: string[]) =>
    readFileSync(join(__dirname, '..', '..', ...parcalar), 'utf8');

  const quickStart = oku('ortak', 'kabuk', 'components', 'dashboard', 'QuickStart.tsx');
  const workspace = oku('app', '(protected)', 'dwg-workspace', 'page.tsx');

  it('OLCUT: iki dosya da okunabildi', () => {
    expect(quickStart.length).toBeGreaterThan(0);
    expect(workspace.length).toBeGreaterThan(0);
  });

  it('OLCUT: ikisi de hala bir DWG giris noktasi (bosa dusme kapisi)', () => {
    // Dosyalar yeniden duzenlenip DWG baska yere tasinirsa asagidaki
    // assert'ler sessizce anlamsizlasir. Once konunun burada oldugunu
    // dogruluyoruz.
    expect(quickStart).toContain('.dwg,.dxf');
    expect(workspace).toContain('DwgUploader');
  });

  it('⭐ dashboard kutusu yetenegi OKUYOR (kusurun ta kendisi buydu)', () => {
    expect(quickStart).toContain('useCapabilities');
    expect(quickStart).toContain('dwgKapisi');
    expect(quickStart).toContain('hasAnyDwg');
  });

  it('⭐ dashboard kutusunun tiklamasi kapiya BAGLI (kosulsuz degil)', () => {
    // Onceki hali: onClick={() => dwgInputRef.current?.click()} — kosulsuz.
    // Simdi tiklama `dwgAcik` kosuluna baglanmis olmali.
    const i = quickStart.indexOf('dwgInputRef.current?.click()');
    expect(i).toBeGreaterThan(-1);
    // Tiklamanin bulundugu satirin basindaki onClick blogunda kosul olmali.
    const satirBasi = quickStart.lastIndexOf('onClick', i);
    expect(satirBasi).toBeGreaterThan(-1);
    const blok = quickStart.slice(satirBasi, i);
    expect(blok).toContain('dwgAcik');
  });

  it('⭐ gizli dosya secici de devre disi (klavyeyle tetiklenmesin)', () => {
    const i = quickStart.indexOf("accept=\".dwg,.dxf\"");
    expect(i).toBeGreaterThan(-1);
    const kapanis = quickStart.indexOf('/>', i);
    expect(quickStart.slice(i, kapanis)).toContain('disabled');
  });

  it('⭐ /dwg-workspace rotasi da kapiyi uyguluyor (dogrudan adres)', () => {
    expect(workspace).toContain('useCapabilities');
    expect(workspace).toContain('dwgKapisi');
    // ⚠ Yalniz `'sonuk'` aramak YETMEZ — kelime dosyanin YORUMUNDA da
    // geciyor, yani render dali `false ?` ile olduruldugunde bile assert
    // yesil kalirdi (mutasyon M5 tam boyle hayatta kaldi). Dal ifadesinin
    // KENDISINI ariyoruz.
    expect(workspace).toContain("dwgDurum === 'sonuk'");
    expect(workspace).toContain("dwgDurum === 'yukleniyor'");
  });

  it('⭐ core kullanicisi yukseltme yolunu goruyor (cikmaz sokak yok)', () => {
    expect(quickStart).toContain('/abonelik');
    expect(workspace).toContain('/abonelik');
  });
});
