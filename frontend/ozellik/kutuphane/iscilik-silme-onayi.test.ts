import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { iscilikFirmasiSilmeOnayi, iscilikListesiSilmeOnayi } from './iscilik-silme-onayi';

/**
 * LOW-4 (P4b Parti 3, 05.10) — işçilik sayfaları:
 *  · firma sayfasında liste silme onayı KAÇ kalemin gideceğini söyler, silinen
 *    etkin listenin yerine kalan ilk liste açılır, sayaçlar/rozet `fetchFirma`
 *    ile tazelenir;
 *  · üç sayfada yalın "Hata" bildirimi sunucunun metnini (`hataMetni`) gösterir.
 * Sayfa JSX'i jsdom'suz koşulamaz: kural saf fonksiyonda ölçülür, BAĞLANTI
 * kaynak taramasıyla (bkz. hata-metni.test.ts K1-d).
 */

const KOK = join(__dirname, '../..');
const oku = (yol: string) => readFileSync(join(KOK, yol), 'utf8');
/** Desen KODDA aranır: yorumlar soyulur. */
const kod = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const FIRMA = kod(oku('app/(protected)/labor-firms/[firmaId]/page.tsx'));
const FIRMALAR = kod(oku('app/(protected)/labor-firms/page.tsx'));
const KATALOG = kod(oku('app/(protected)/labor/page.tsx'));

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

/** Yalın "Hata" bildirimi: başlık 'Hata', sebep yok ya da çıplak catch. */
const yalinHata = (s: string) => /title:\s*'Hata'/.test(s);

describe('iscilikListesiSilmeOnayi — metin', () => {
  it('⭐ kaç kalemin fiyatı ve iskontosuyla gideceğini söyler', () => {
    const o = iscilikListesiSilmeOnayi('Mekanik 2026', 37);
    expect(o.title).toBe('"Mekanik 2026" fiyat listesi silinsin mi?');
    expect(o.description).toBe('Listedeki 37 kalem fiyatı ve iskontosuyla silinir; geri alınamaz.');
    expect(o.confirmText).toBe('Sil');
  });
  it('boş liste için kayıp yok', () => {
    expect(iscilikListesiSilmeOnayi('Boş', 0).description).toBe('Listede kalem yok; yalnız liste silinir.');
  });
  it('sayı bilinmiyorsa uydurulmaz', () => {
    for (const n of [undefined, null, Number.NaN, -1]) {
      expect(iscilikListesiSilmeOnayi('X', n as any).description).toBe('Listedeki tüm kalemler fiyatları ve iskontolarıyla silinir; geri alınamaz.');
    }
  });
  it('ad yoksa tırnaklı boş ad yazılmaz', () => {
    expect(iscilikListesiSilmeOnayi(' ', 3).title).toBe('Fiyat listesi silinsin mi?');
  });
});

describe('iscilikFirmasiSilmeOnayi — metin', () => {
  it('⭐ kaç liste ve kaç fiyatın gideceğini söyler', () => {
    const o = iscilikFirmasiSilmeOnayi('Usta Tesisat', 2, 140);
    expect(o.title).toBe('"Usta Tesisat" silinsin mi?');
    expect(o.description).toBe('2 fiyat listesi ve 140 kalem fiyatı da silinir; geri alınamaz.');
  });
  it('sayılardan biri bilinmiyorsa genel cümle (uydurma yok)', () => {
    expect(iscilikFirmasiSilmeOnayi('U', 2, undefined).description).toBe('Firmanın tüm fiyat listeleri ve fiyatları da silinir; geri alınamaz.');
  });
  it('listesi olmayan firmada kayıp yok ("0 fiyat listesi ve 0 kalem" yazılmaz)', () => {
    expect(iscilikFirmasiSilmeOnayi('Yeni Firma', 0, 0).description).toBe('Firmanın fiyat listesi yok; yalnız firma silinir.');
  });
});

describe('⭐ BAĞLANTI: firma sayfası liste silme', () => {
  const sil = govde(FIRMA, 'async function deletePriceList');
  it('FIXTURE: fonksiyon bulundu ve silme ucunu çağırıyor', () => {
    expect(sil).toContain('/labor-firms/price-lists/');
  });
  it('onay sayılı (sekmenin `_count.prices` sayımı)', () => {
    expect(sil).toContain('confirm(iscilikListesiSilmeOnayi(liste?.name ??');
    expect(sil).toContain('liste?._count?.prices');
  });
  it('silinen etkin listenin yerine kalan ilk liste açılır, sayacı sıfırlanır', () => {
    expect(sil).toContain('setActiveListId(kalan[0]?.id ?? null)');
    expect(sil).toContain('setDirtyCount(0)');
  });
  it('⭐ sayaçlar ve bekleyen rozeti sunucudan tazelenir — HER silmede (etkin olmayan listede efekt koşmaz)', () => {
    expect(sil).toContain('await sayaclariTazele()');
    expect(sil.indexOf('await sayaclariTazele()')).toBeGreaterThan(sil.indexOf("toast({ title: 'Silindi'"));
  });
  it('tazeleme SESSİZ: hata sayfadan atmaz (fetchFirma gibi yönlendirmez)', () => {
    const t = govde(FIRMA, 'const sayaclariTazele = useCallback(async () =>');
    expect(t).toContain('/labor-firms/${firmaId}/price-lists');
    expect(t).toContain('catch (e: unknown)');
    expect(t).not.toContain('router.push');
  });
  it('tek satır silmede de sekme sayacı tazelenir (onaydaki sayı bayat kalmaz)', () => {
    const satirSil = govde(FIRMA, 'const handleRowDelete = useCallback(async');
    expect(satirSil).toContain('void sayaclariTazele()');
    expect(satirSil).toContain('hataMetni(e,');
  });
  it('hata sunucu metniyle; çıplak catch / yalın "Hata" yok', () => {
    expect(sil).toContain('hataMetni(e,');
    expect(sil).not.toContain('catch {');
    expect(yalinHata(sil)).toBe(false);
  });
});

describe('⭐ BAĞLANTI: firmalar ve katalog sayfalarında yalın "Hata" kalmadı', () => {
  it('ÖLÇÜT ayırt ediyor: eski bildirim satırı yakalanır', () => {
    expect(yalinHata("} catch { toast({ title: 'Hata', variant: 'destructive' }); }")).toBe(true);
  });
  it('firmalar sayfası: ekleme ve silme sunucu metniyle, silme onayı sayılı', () => {
    expect(yalinHata(FIRMALAR)).toBe(false);
    expect(govde(FIRMALAR, 'async function createFirm')).toContain('hataMetni(e,');
    const sil = govde(FIRMALAR, 'async function deleteFirm');
    expect(sil).toContain('hataMetni(e,');
    expect(sil).toContain('iscilikFirmasiSilmeOnayi(firm.name, firm._count?.priceLists, firm._count?.laborPrices)');
    expect(sil).not.toContain('catch {');
  });
  it('katalog sayfası: kaydetme ve silme sunucu metniyle', () => {
    expect(yalinHata(KATALOG)).toBe(false);
    for (const imza of ['async function handleSave', 'async function handleDelete']) {
      const g = govde(KATALOG, imza);
      expect(g.length, imza).toBeGreaterThan(50);
      expect(g, imza).toContain('hataMetni(e,');
      expect(g, imza).not.toContain('catch {');
    }
  });
});
