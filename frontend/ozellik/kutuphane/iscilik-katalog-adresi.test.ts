import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { iscilikKatalogAdresi } from './iscilik-katalog-adresi';

/**
 * Faz 7 · F1a — Y7b (ön yüz kanadı).
 *
 * İKİ AYRI ŞEY ÖLÇÜLÜR:
 *  (1) MANTIK — yönetici başka uca gider, kullanıcı bugünkü uca.
 *  (2) BAĞLANTI — katalog sayfası bu fonksiyonu GERÇEKTEN çağırıyor ve
 *      adresi elle kurmuyor. Bu depoda tekrarlayan kusur "mekanizma var,
 *      bağlantı yok"tur: kural doğru yazılır, çağıran hiç eklenmez.
 */

const KOK = join(__dirname, '../..');
const sayfa = readFileSync(join(KOK, 'app/(protected)/labor/page.tsx'), 'utf8');
/**
 * ⚠ Desen KODDA benzersiz olmalı: dosyanın yorumları da bu uçların adını
 * anıyor ve "elle kurulmuş adres" araması yorumda eşleşirse kapı hiçbir
 * zaman yeşile dönmezdi (ölçüldü, bu testin ilk koşumunda oldu).
 */
const sayfaKodu = sayfa.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('iscilikKatalogAdresi — mantık', () => {
  it('yönetici paket/yetenek kapısı taşımayan uca gider', () => {
    expect(iscilikKatalogAdresi('admin', 'mechanical'))
      .toBe('/labor/yonetici-katalog?discipline=mechanical');
  });

  it('normal kullanıcı bugünkü uca gider (davranış değişmedi)', () => {
    expect(iscilikKatalogAdresi('user', 'electrical'))
      .toBe('/labor?discipline=electrical');
  });

  it('rol bilinmiyorsa (null/undefined) yönetici ucu AÇILMAZ — fail-closed', () => {
    expect(iscilikKatalogAdresi(null, 'mechanical')).toBe('/labor?discipline=mechanical');
    expect(iscilikKatalogAdresi(undefined, 'mechanical')).toBe('/labor?discipline=mechanical');
    expect(iscilikKatalogAdresi('Admin', 'mechanical')).toBe('/labor?discipline=mechanical');
  });

  it('disiplin adresi kaçışlanır (sorgu dizesi bozulmaz)', () => {
    expect(iscilikKatalogAdresi('admin', 'a&b')).toBe('/labor/yonetici-katalog?discipline=a%26b');
  });
});

describe('⭐ BAĞLANTI: katalog sayfası bu kuralı gerçekten kullanıyor', () => {
  it('FIXTURE: sayfa dosyası okundu ve liste çağrısını içeriyor', () => {
    expect(sayfa.length).toBeGreaterThan(500);
    expect(sayfa).toContain('api.get<LaborItem[]>');
  });

  it('sayfa iscilikKatalogAdresi`ni içe aktarıp çağırıyor', () => {
    expect(sayfa).toContain("from '@/ozellik/kutuphane/iscilik-katalog-adresi'");
    expect(sayfa).toContain('iscilikKatalogAdresi(');
  });

  it('⭐ sayfa adresi ELLE kurmuyor (ikinci sözlük açılmadı)', () => {
    // Şablon dizesiyle `/labor?discipline=` ya da `/labor/yonetici-katalog?`
    // yazılmışsa kural iki yerde yaşıyor demektir; biri güncellenir, öteki
    // bayat kalır. Yazma uçları (`/labor/${id}`) bu kuralın dışındadır.
    expect(sayfaKodu).not.toContain('`/labor?discipline=');
    expect(sayfaKodu).not.toContain('`/labor/yonetici-katalog');
    // ÖLÇÜT: yorum soyma gerçekten çalıştı (kod hâlâ dolu).
    expect(sayfaKodu).toContain('iscilikKatalogAdresi(');
  });

  it('⭐ rol localStorage`taki `user` kaydından okunuyor (bugünkü desen)', () => {
    expect(sayfa).toContain("localStorage.getItem('user')");
    expect(sayfa).toContain("=== 'admin'");
  });
});
