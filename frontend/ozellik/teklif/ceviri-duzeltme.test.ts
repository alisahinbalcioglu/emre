/**
 * FİRMA ÇEVİRİ DÜZELTMESİ — istemci modülü + ekran kaynak kapıları (Faz 6.9).
 *
 * Kapılar: gövde yalnız izin verilen alanları taşır (firma oturumdan gelir),
 * hata metinleri Türkçe ve duruma göre, çeviri KURALI bu dosyada yeniden
 * belirmez (K21), işaret ExcelGrid'e prop'la gelir ve anahtar KÜMESİNDEN kurulur.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { duzeltmeHataMetni, duzeltmeKaldir, duzeltmeKaydet, duzeltmeleriGetir } from './ceviri-duzeltme';

const kok = join(__dirname, '../..');
const oku = (yol: string) => readFileSync(join(kok, yol), 'utf8');
/** Yorumlar atılır: kapı yorumda geçen metinle yeşil yanmasın. */
const kodu = (m: string) => m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const hataNesnesi = (durum: number, data: Record<string, unknown> = {}) => ({ response: { status: durum, data }, message: 'ağ' });

describe('ceviri-duzeltme istemci modülü', () => {
  it('GET yanıtını anahtar kümesi + düzeltme haritasına çevirir; bozuk satır atlanır', async () => {
    const cagrilar: unknown[] = [];
    const g = await duzeltmeleriGetir('q-1', {
      get: async (url, ayar) => {
        cagrilar.push([url, ayar]);
        return {
          data: {
            anahtarlar: ['KÜRESEL VANA', 'PVC BORU'],
            duzeltmeler: [
              { id: 'd1', kaynak: 'KÜRESEL VANA', ceviri: 'SPHERICAL VALVE' },
              { id: 'd2', kaynak: 'PVC BORU' },
            ],
            duzeltmeAcik: true,
          },
        };
      },
    });
    expect(cagrilar).toEqual([['/ai/translate/duzeltmeler', { params: { quoteId: 'q-1' } }]]);
    expect(Array.from(g.anahtarlar)).toEqual(['KÜRESEL VANA', 'PVC BORU']);
    expect(g.duzeltmeler.get('KÜRESEL VANA')).toEqual({ id: 'd1', ceviri: 'SPHERICAL VALVE' });
    expect(g.duzeltmeler.has('PVC BORU')).toBe(false);
    expect(g.duzeltmeAcik).toBe(true);
  });

  it('`duzeltmeAcik` yalnız true ise açık (eksik alan kapalı sayılır)', async () => {
    const g = await duzeltmeleriGetir('q-1', { get: async () => ({ data: { anahtarlar: [] } }) });
    expect(g.duzeltmeAcik).toBe(false);
    expect(g.anahtarlar.size).toBe(0);
  });

  it('PUT gövdesi YALNIZ quoteId, kaynak, ceviri, hedefDil taşır (firma istemciden gelmez)', async () => {
    const govdeler: unknown[] = [];
    const r = await duzeltmeKaydet({ quoteId: 'q-1', kaynak: 'KÜRESEL VANA', ceviri: 'SPHERICAL VALVE' }, {
      put: async (url, govde) => {
        govdeler.push([url, govde]);
        return { data: { id: 'd1', kaynak: 'KÜRESEL VANA', ceviri: 'SPHERICAL VALVE', degisti: true } };
      },
    });
    expect(govdeler).toEqual([['/ai/translate/duzeltmeler', { quoteId: 'q-1', kaynak: 'KÜRESEL VANA', ceviri: 'SPHERICAL VALVE', hedefDil: 'en' }]]);
    expect(Object.keys((govdeler[0] as any[])[1])).toEqual(['quoteId', 'kaynak', 'ceviri', 'hedefDil']);
    expect(r.degisti).toBe(true);
  });

  it('DELETE kimliği yola koyar', async () => {
    const yollar: string[] = [];
    await duzeltmeKaldir('d1', { delete: async (url) => { yollar.push(url); return { data: { kaldirildi: true, kaynak: 'KÜRESEL VANA' } }; } });
    expect(yollar).toEqual(['/ai/translate/duzeltmeler/d1']);
  });

  it('hata metinleri: 413 uzunluk · 429 hız · günlük tavan sunucunun cümlesi · 403/400/409 sunucudan', () => {
    expect(duzeltmeHataMetni(hataNesnesi(413))).toMatch(/2\.000 karakter/);
    expect(duzeltmeHataMetni(hataNesnesi(429))).toMatch(/bir dakika sonra/);
    expect(duzeltmeHataMetni(hataNesnesi(429, { kod: 'DUZELTME_GUNLUK_TAVAN', mesaj: 'Bugünkü çeviri düzeltme sınırına ulaşıldı', aciklama: 'Firmanız günde en fazla 500 düzeltme kaydedebilir; yarın tekrar deneyin.' })))
      .toBe('Bugünkü çeviri düzeltme sınırına ulaşıldı. Firmanız günde en fazla 500 düzeltme kaydedebilir; yarın tekrar deneyin.');
    expect(duzeltmeHataMetni(hataNesnesi(403, { kod: 'EPOSTA_DOGRULANMADI', mesaj: 'Çeviri düzeltmesi için e-posta adresinizi doğrulayın', aciklama: 'Bağlantıya tıklayın.' })))
      .toBe('Çeviri düzeltmesi için e-posta adresinizi doğrulayın. Bağlantıya tıklayın.');
    expect(duzeltmeHataMetni(hataNesnesi(400, { kod: 'KAYNAK_TEKLIFTE_YOK', mesaj: 'Bu metin seçili teklifte bulunmuyor' })))
      .toBe('Bu metin seçili teklifte bulunmuyor');
    expect(duzeltmeHataMetni(hataNesnesi(409, { kod: 'DUZELTME_TAVANI', mesaj: 'Firma sözlüğü dolu' }))).toBe('Firma sözlüğü dolu');
  });

  it('K21: çeviri KURALI (dokunulmaz ölçü/kod ayrımı) bu dosyada YOK', () => {
    const kod = kodu(oku('ozellik/teklif/ceviri-duzeltme.ts'));
    expect(kod).not.toMatch(/dokunulmaz|olcuyuSoy|ÇĞİÖŞÜ/);
  });
});

describe('ekran bağlantısı — kalem işareti', () => {
  const EKRANLAR = ['app/(protected)/quotes/[id]/page.tsx', 'app/(protected)/quotes/new/page.tsx'];

  it.each(EKRANLAR)('%s: `ceviriKalemi` ExcelGrid\'e verilir ve `goster` SUNUCUNUN anahtar kümesinden kurulur', (yol) => {
    const kod = kodu(oku(yol));
    expect(kod).toMatch(/ceviriKalemi=\{ceviriKalemi\}/);
    expect(kod).toMatch(/goster: \(row: any\) => \{[\s\S]*?duzeltmeGorunumu\.anahtarlar\.has\(ceviriAnahtari\(satirKaynagi\(row, adAlan\)\)\)/);
    // İşaret `_ceviriKaynak`a BAĞLANMAZ (K-T2: Türkçe kalmış / aynen dönmüş satırda da görünür).
    expect(kod).not.toMatch(/goster: \(row: any\) => \{[\s\S]*?_ceviriKaynak/);
  });

  it.each(EKRANLAR)('%s: diyalog bileşeni kullanılır (hata sessiz kapanmaz, kural sayfada)', (yol) => {
    expect(kodu(oku(yol))).toMatch(/<CeviriDuzeltmeDialog/);
  });

  it('ExcelGrid çeviri kuralını BİLMEZ: `_ceviriKaynak` metni yok, işaret yalnız prop ile çizilir', () => {
    const kod = kodu(oku('ozellik/tablo/excel-grid/ExcelGrid.tsx'));
    expect(kod).not.toMatch(/_ceviriKaynak/);
    expect(kod).toMatch(/ceviriKalemiRef\.current\?\.goster\(d\)/);
    expect(kod).toMatch(/className="ceviri-kalem"/);
  });

  it('denetim ekranı ortak çeviri düzeltmesini ADIYLA gösterir (ham tip değil)', () => {
    const kod = kodu(oku('app/admin/denetim/page.tsx'));
    expect(kod).toMatch(/'ceviri\.ortak\.duzeltildi': 'Ortak çeviri düzeltildi'/);
    expect(kod).toMatch(/'ceviri\.ortak\.duzeltildi': 'info'/);
  });
});
