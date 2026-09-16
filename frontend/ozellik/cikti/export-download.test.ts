/**
 * İNDİRME HATASI BİLDİRİMİ (Faz 6.10, 15.09.2026).
 *
 * `responseType: 'blob'` isteğinde hata gövdesi Blob gelir. Eski çözüm yalnız
 * `message`'ı okuyordu: kota/erişim/çeviri kapısı reddinin Türkçe metni
 * (`mesaj` + `aciklama`) kullanıcıya "Çıktı üretilemedi." olarak iniyordu.
 * Kilitlenen: gövde çözümü, başlık kuralı ve `export-download.ts`'in bu saf
 * modülü GERÇEKTEN kullanması (bağlantı).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hataBasligi, hataMesaji, indirmeHatasi } from './indirme-hatasi';

const blobHata = (govde: unknown) => ({ response: { status: 403, data: new Blob([typeof govde === 'string' ? govde : JSON.stringify(govde)], { type: 'application/json' }) } });

describe('hataMesaji — Blob gövde', () => {
  it('mesaj + aciklama birleşir (çeviri kapısı reddi)', async () => {
    expect(await hataMesaji(blobHata({ message: 'x', mesaj: 'Bu teklifin çevirisi eksik', aciklama: 'İngilizce dosya için İngilizceye Çevir düğmesine basın; kotadan düşmez.', kod: 'CEVIRI_EKSIK' })))
      .toBe('Bu teklifin çevirisi eksik. İngilizce dosya için İngilizceye Çevir düğmesine basın; kotadan düşmez.');
  });

  it('yalnız message taşıyan gövde', async () => {
    expect(await hataMesaji(blobHata({ statusCode: 400, message: 'Bu teklifte sayfa verisi yok' }))).toBe('Bu teklifte sayfa verisi yok');
  });

  it('message dizisi (ValidationPipe) birleşir', async () => {
    expect(await hataMesaji(blobHata({ message: ['dil must be a string', 'x'] }))).toBe('dil must be a string · x');
  });

  it('bozuk Blob → "Çıktı üretilemedi."', async () => {
    expect(await hataMesaji(blobHata('{bozuk'))).toBe('Çıktı üretilemedi.');
  });

  it('mesajsız gövde (ör. yalnız kod) → "Çıktı üretilemedi."', async () => {
    expect(await hataMesaji(blobHata({ kod: 'BILINMEYEN' }))).toBe('Çıktı üretilemedi.');
  });

  it('Blob olmayan nesne gövde de çözülür', async () => {
    expect(await hataMesaji({ response: { data: { mesaj: 'Aboneliğiniz bulunmuyor', aciklama: 'Çeviri için bir paket seçin.' } } })).toBe('Aboneliğiniz bulunmuyor. Çeviri için bir paket seçin.');
  });
});

describe('hataBasligi — İngilizce dosya kapısı', () => {
  it.each(['CEVIRI_GEREKLI', 'CEVIRI_EKSIK', 'CEVIRI_SURUYOR'])('%s → "İngilizce dosya indirilemedi"', (kod) => {
    expect(hataBasligi({ kod })).toBe('İngilizce dosya indirilemedi');
  });

  it('başka kod ya da gövde yok → "Dışa aktarım hatası"', () => {
    expect([hataBasligi({ kod: 'CIKTI_INDIR' }), hataBasligi(null)]).toEqual(['Dışa aktarım hatası', 'Dışa aktarım hatası']);
  });

  it('indirmeHatasi Blob gövdeden başlık ve metni birlikte çıkarır', async () => {
    expect(await indirmeHatasi(blobHata({ mesaj: 'Bu teklifin güncel hâli İngilizceye çevrilmemiş', aciklama: 'Önce teklif ekranında İngilizceye Çevir düğmesine basın.', kod: 'CEVIRI_GEREKLI', neden: 'CEVIRI_YOK' })))
      .toEqual({ baslik: 'İngilizce dosya indirilemedi', mesaj: 'Bu teklifin güncel hâli İngilizceye çevrilmemiş. Önce teklif ekranında İngilizceye Çevir düğmesine basın.' });
  });
});

describe('export-download.ts bağlantısı', () => {
  const kaynak = readFileSync(join(__dirname, 'export-download.ts'), 'utf8');
  const kod = kaynak.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

  it('iki indirme yolu da hatayı saf modülle bildirir (eski yalnız-message çözümü kalmadı)', () => {
    expect(kod.split('await hataBildir(e)').length - 1).toBe(2);
    expect(kod).toMatch(/indirmeHatasi\(e\)/);
    expect(kod).not.toMatch(/j\?\.message \?\?/);
  });

  it('uyarı başlığı "Dikkat" (dil uyarısı da taşır)', () => {
    expect(kod).toContain("title: 'Dikkat',");
    expect(kod).not.toContain('eksik değer');
  });
});
