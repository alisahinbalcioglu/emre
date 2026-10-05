import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { havuzaDonusAdaylari, havuzFiyatinaDondur } from './havuza-donus';
import { HAVUZA_DON_EYLEMI, kutuphaneFiyatAyrisimi } from '../tablo/excel-grid/isaret';

/**
 * «Havuz fiyatına dön» (P4b Parti 3, 05.10) — kural `havuza-donus.ts`.
 *  (1) ADAYLAR: yalnız ayrışan KAYITLI satırlar; ipucuyla AYNI okuyucu.
 *  (2) DÖNÜŞ: sırayla, bir satırın hatası diğerlerini durdurmaz ve YUTULMAZ.
 *  (3) BAĞLANTI: marka sayfası adayları ızgaradan alır, özel fiyatı
 *      `PUT /library/:id {customPrice: null}` ile siler, listeyi yeniden yükler;
 *      düğme ve pencere hücre ipucundaki ADLA aynı (`HAVUZA_DON_EYLEMI`).
 * Sunucu tarafı (özel fiyat + birimi silinir): backend `test:p4b-kutuphane` F3/F3b.
 */

const KOK = join(__dirname, '../..');
const sayfa = readFileSync(join(KOK, 'app/(protected)/library/brand/[brandId]/page.tsx'), 'utf8');
const diyalog = readFileSync(join(KOK, 'ozellik/kutuphane/library/HavuzaDonusDiyalogu.tsx'), 'utf8');
const kod = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const veri = (ek: Record<string, unknown>) => ({ _isDataRow: true, col1: 'Küresel Vana', _currency: 'TRY', ...ek });

describe('havuzaDonusAdaylari — yalnız ayrışan kayıtlı satırlar', () => {
  const satirlar = [
    veri({ _libraryItemId: 'ul-1', _fiyatAyrisik: { ozel: 100, havuz: 120 } }),
    veri({ _libraryItemId: 'ul-2', col1: 'Kelebek Vana', _fiyatAyrisik: { ozel: 2400, havuz: 50, ozelBirim: 'TRY', havuzBirim: 'EUR' } }),
    veri({ _libraryItemId: 'ul-3', col1: 'PPR Boru' }), // ayrışmamış
    veri({ _libraryItemId: undefined, _fiyatAyrisik: { ozel: 1, havuz: 2 } }), // kaydı yok
    { _isGroupRow: true, _fiyatAyrisik: { ozel: 1, havuz: 2 }, _libraryItemId: 'grup' }, // veri satırı değil
    veri({ _libraryItemId: 'ul-4', _fiyatAyrisik: { ozel: 5 } }), // bozuk sinyal
  ];
  const adaylar = havuzaDonusAdaylari(satirlar, 'col1');

  it('⭐ yalnız ayrışan iki kayıtlı satır aday', () => {
    expect(adaylar.map((a) => a.id)).toEqual(['ul-1', 'ul-2']);
  });

  it('tutarlar hücre ipucuyla AYNI metin (tek okuyucu)', () => {
    expect(adaylar[1]).toEqual({ id: 'ul-2', ad: 'Kelebek Vana', ayrinti: '', ozel: '₺2.400,00', havuz: '€50,00', birimFarkli: true });
    expect(kutuphaneFiyatAyrisimi(satirlar[1])?.ipucu.startsWith(`Özel fiyat ${adaylar[1].ozel} · havuz liste fiyatı ${adaylar[1].havuz}`)).toBe(true);
    expect(adaylar[0].birimFarkli).toBe(false);
  });

  it('⭐ aynı adlı satırlar (farklı çap) ayrıntıyla ayırt edilir (inceleme MEDIUM)', () => {
    const vanalar = havuzaDonusAdaylari([
      veri({ _libraryItemId: 'v-12', col_cins: 'Pirinç', col_cap: '1/2"', _fiyatAyrisik: { ozel: 100, havuz: 120 } }),
      veri({ _libraryItemId: 'v-34', col_cins: 'Pirinç', col_cap: '3/4"', col_kod: 'KV-34', _fiyatAyrisik: { ozel: 150, havuz: 180 } }),
    ], 'col1');
    expect(vanalar.map((a) => a.ad)).toEqual(['Küresel Vana', 'Küresel Vana']);
    expect(vanalar.map((a) => a.ayrinti)).toEqual(['Pirinç · 1/2"', 'Pirinç · 3/4" · KV-34']);
  });

  it('adı boş satır listede adsız görünür (kimlik yine taşınır)', () => {
    expect(havuzaDonusAdaylari([veri({ _libraryItemId: 'ul-9', col1: ' ', _fiyatAyrisik: { ozel: 1, havuz: 2 } })], 'col1')[0].ad).toBe('Adsız malzeme');
  });
});

describe('havuzFiyatinaDondur — sırayla, hata yutulmaz', () => {
  it('⭐ hepsi döner; istekler seçim sırasıyla', async () => {
    const giden: string[] = [];
    const s = await havuzFiyatinaDondur(['a', 'b', 'c'], async (id) => { giden.push(id); });
    expect(giden).toEqual(['a', 'b', 'c']);
    expect(s).toEqual({ donen: 3, donmeyen: 0, ilkHata: undefined });
  });

  it('⭐ bir satırın hatası diğerlerini DURDURMAZ; sayılır ve İLK sebep döner', async () => {
    const h1 = new Error('404 Library item not found');
    const h2 = new Error('ikinci');
    const giden: string[] = [];
    const s = await havuzFiyatinaDondur(['a', 'b', 'c', 'd'], async (id) => {
      giden.push(id);
      if (id === 'b') throw h1;
      if (id === 'd') throw h2;
    });
    expect(giden).toEqual(['a', 'b', 'c', 'd']);
    expect(s.donen).toBe(2);
    expect(s.donmeyen).toBe(2);
    expect(s.ilkHata).toBe(h1);
  });

  it('istekler EŞZAMANLI değil (biri bitmeden sıradaki başlamaz)', async () => {
    let acik = 0;
    let enCok = 0;
    await havuzFiyatinaDondur(['a', 'b', 'c'], async () => {
      acik++; enCok = Math.max(enCok, acik);
      await new Promise((r) => setTimeout(r, 5));
      acik--;
    });
    expect(enCok).toBe(1);
  });

  it('boş seçim istek atmaz', async () => {
    let n = 0;
    expect(await havuzFiyatinaDondur([], async () => { n++; })).toEqual({ donen: 0, donmeyen: 0, ilkHata: undefined });
    expect(n).toBe(0);
  });
});

describe('⭐ BAĞLANTI: marka sayfası ve pencere', () => {
  const s = kod(sayfa);
  const d = kod(diyalog);

  it('FIXTURE: sayfa ve pencere okundu', () => {
    expect(s.length).toBeGreaterThan(1000);
    expect(d).toContain('export function HavuzaDonusDiyalogu');
  });

  it('adaylar ızgaranın canlı satırlarından; yeni liste kipinde yok', () => {
    expect(s).toContain('newListMode ? [] : havuzaDonusAdaylari(liveRows as any[], nameField)');
  });

  it('⭐ özel fiyat `PUT /library/:id {customPrice: null}` ile silinir, sonra liste yeniden yüklenir', () => {
    expect(s).toContain("havuzFiyatinaDondur(idler, (id) => api.put(`/library/${id}`, { customPrice: null }))");
    expect(s).toMatch(/if \(s\.donen > 0\) await fetchData\(activeListId\)/);
  });

  it('başarısız satır sunucu metniyle bildirilir', () => {
    expect(s).toContain('hataMetni(s.ilkHata,');
  });

  it('⭐ düğme ve pencere başlığı hücre ipucundaki ADLA aynı (inceleme LOW-3)', () => {
    expect(s).toMatch(/onClick=\{havuzaDonusuAc\}>\s*\{HAVUZA_DON_EYLEMI\}…/);
    expect(d).toContain('<DialogTitle>{HAVUZA_DON_EYLEMI}</DialogTitle>');
    expect(kutuphaneFiyatAyrisimi({ _fiyatAyrisik: { ozel: 1, havuz: 2 } })?.ipucu).toContain(`«${HAVUZA_DON_EYLEMI}»`);
  });

  it('kaydedilmemiş değişiklik varken düğme yerine "önce kaydedin" (yeniden yükleme onları silerdi)', () => {
    expect(s).toContain('pendingCount === 0 ? (');
    expect(s).toContain('«{HAVUZA_DON_EYLEMI}» için önce değişiklikleri kaydedin');
  });

  it('⭐ denetim TIKLAMA anında da: açık düzenleyici işlenir, açılışta VE dönüşten önce bakılır (inceleme LOW)', () => {
    const govde = s.slice(s.indexOf('function kaydedilmemisVar'), s.indexOf('function havuzaDonusuAc'));
    expect(govde).toContain('gridRef.current?.stopEditing();');
    expect(s.split('if (kaydedilmemisVar()) {').length - 1).toBe(2);
    const don = s.slice(s.indexOf('async function havuzaDon('));
    expect(don.indexOf('if (kaydedilmemisVar())')).toBeLessThan(don.indexOf('havuzFiyatinaDondur('));
  });

  it('pencere seçimi kapanışta sıfırlanır — her açılış BOŞ başlar (karar kullanıcının)', () => {
    expect(d).toContain('useEffect(() => { if (!acik) setSecili(new Set()); }, [acik]);');
  });

  it('erişilebilirlik: satır etiketi ayrıntıyı taşır, "tümünü seç" kısmi seçimi gösterir', () => {
    expect(d).toContain("aria-label={`${a.ad}${a.ayrinti ? ` (${a.ayrinti})` : ''} seç`}");
    expect(d).toContain('el.indeterminate = kismen');
  });
});
