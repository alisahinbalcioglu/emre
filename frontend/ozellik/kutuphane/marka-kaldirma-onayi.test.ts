import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { markaKaldirmaOnayi } from './marka-kaldirma-onayi';

/**
 * "Markayı kütüphaneden kaldır" onayı KAYBI söyler (P4b Parti 3, 05.10 — P2
 * önerisi). Sunucu `removeBrandFromLibrary` markanın tüm kütüphane satırlarını
 * siler; iskonto / özel fiyat / ad düzeltmesi onlarla gider, yeniden aktarım
 * geri getirmez. Eski onay: `"X" kütüphanenizden tamamen kaldırılsın mı?`.
 */

const KOK = join(__dirname, '../..');
const sayfa = readFileSync(join(KOK, 'app/(protected)/library/brand/[brandId]/page.tsx'), 'utf8');
const sayfaKodu = sayfa.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** Sayfadaki fonksiyonun gövdesi (bkz. hata-metni.test.ts `govde`). */
function govde(kaynak: string, imza: string): string {
  const bas = kaynak.indexOf(imza);
  if (bas < 0) return '';
  let derinlik = 0;
  let i = kaynak.indexOf('{', bas);
  const basla = i;
  for (; i < kaynak.length; i++) {
    if (kaynak[i] === '{') derinlik++;
    else if (kaynak[i] === '}') { derinlik--; if (derinlik === 0) return kaynak.slice(basla, i + 1); }
  }
  return '';
}

describe('markaKaldirmaOnayi — metin', () => {
  const o = markaKaldirmaOnayi('Havuz Vana', 12);

  it('başlık markayı adıyla sorar', () => {
    expect(o.title).toBe('"Havuz Vana" kütüphanenizden kaldırılsın mı?');
  });

  it('⭐ kaybı söyler: iskonto, özel fiyat, ad düzeltmesi, elle eklenen malzeme', () => {
    expect(o.description).toContain('iskontolar');
    expect(o.description).toContain('özel fiyatlar');
    expect(o.description).toContain('ad düzeltmeleri');
    expect(o.description).toContain('elle eklediğiniz malzemeler');
  });

  it('⭐ yeniden aktarımın geri getirmediğini söyler', () => {
    expect(o.description).toContain('Markayı yeniden aktarmak bunları geri getirmez.');
  });

  it('silinecek satır sayısını söyler', () => {
    expect(o.description.startsWith('12 malzeme silinir — ')).toBe(true);
  });

  it('sayı bilinmiyorsa uydurulmaz', () => {
    for (const n of [0, null, undefined, Number.NaN]) {
      expect(markaKaldirmaOnayi('Havuz Vana', n as any).description.startsWith('Bu markadaki tüm malzemeler silinir — ')).toBe(true);
    }
  });

  it('onay düğmesi eylemi adlandırır (varsayılan "Sil" değil)', () => {
    expect(o.confirmText).toBe('Kaldır');
  });

  it('marka adı yoksa tırnaklı boş ad yazılmaz', () => {
    expect(markaKaldirmaOnayi('  ', 3).title).toBe('Marka kütüphanenizden kaldırılsın mı?');
  });
});

describe('⭐ BAĞLANTI: marka sayfası onayı ve hata metnini kullanıyor', () => {
  const kaldir = govde(sayfaKodu, 'async function handleRemoveBrand');

  it('FIXTURE: kaldırma fonksiyonu bulundu', () => {
    expect(kaldir.length).toBeGreaterThan(50);
    expect(kaldir).toContain('/library/brand/');
  });

  it('onay ortak metinden, sekme sayımıyla', () => {
    expect(kaldir).toContain('confirm(markaKaldirmaOnayi(brandName, malzemeSayisi))');
    expect(kaldir).toContain('l._count?.items');
  });

  it('eski çıplak onay cümlesi kalmadı', () => {
    expect(sayfaKodu).not.toContain('kütüphanenizden tamamen kaldırılsın mı?');
  });

  it('hata sunucu metniyle (çıplak `catch {` + "Hata" yok)', () => {
    expect(kaldir).not.toContain('catch {');
    expect(kaldir).toContain('hataMetni(e,');
  });
});
