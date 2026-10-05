import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { degisenMalzemeAdi, malzemeAdlari } from './malzeme-ad-imzasi';

/**
 * Malzeme kütüphanesi ızgarası — ad YALNIZ değiştiyse gönderilir (P4b Parti 3,
 * 05.10). İşçilik ikizi: `iscilik-ad-imzasi.test.ts`.
 *
 * İKİ AYRI ŞEY ÖLÇÜLÜR:
 *  (1) MANTIK — yalnız fiyatı/iskontosu değişen satırın adı gönderilmez; ad
 *      hücresindeki değişiklik gönderilir.
 *  (2) BAĞLANTI — marka sayfası adları yüklemede SUNUCU satırlarından alıyor ve
 *      kayıtta `materialName`i bu kurala bağlıyor ("mekanizma var, bağlantı yok").
 * Uçtan uca (sayfanın kayıt yükü + gerçek LibraryService, eski ekran senaryosu):
 * backend `test:kb-fiyat` K0c + K7.
 */

const KOK = join(__dirname, '../..');
const sayfa = readFileSync(join(KOK, 'app/(protected)/library/brand/[brandId]/page.tsx'), 'utf8');
/** Desen KODDA aranır: yorumlar soyulur (yorumdaki ibare kodu ölçmez). */
const sayfaKodu = sayfa.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const satir = (ek: Record<string, unknown> = {}) => ({
  _rowIdx: 3, _isDataRow: true, _libraryItemId: 'ul-1', col1: 'Küresel Vana', col2: 'Adet', col3: 100, _libraryDiscountRate: 0, ...ek,
});

describe('degisenMalzemeAdi — mantık', () => {
  const ilk = malzemeAdlari([satir()], 'col1');

  it('hiçbir hücre değişmediyse ad GİTMEZ', () => {
    expect(degisenMalzemeAdi(satir(), 'col1', ilk)).toBeUndefined();
  });

  it('⭐ yalnız fiyat / birim / iskonto değiştiyse ad GİTMEZ (eskiden kirli her satırda gidiyordu)', () => {
    expect(degisenMalzemeAdi(satir({ col3: '125', col2: 'mt', _draftDiscount: 15, _dirty: true }), 'col1', ilk)).toBeUndefined();
  });

  it('ad hücresi değiştiyse yeni ad (kırpılmış) gider', () => {
    expect(degisenMalzemeAdi(satir({ col1: '  Küresel Vana Tam Geçişli ' }), 'col1', ilk)).toBe('Küresel Vana Tam Geçişli');
  });

  it('yalnız baş/son boşluk farkı değişiklik sayılmaz', () => {
    expect(degisenMalzemeAdi(satir({ col1: ' Küresel Vana  ' }), 'col1', ilk)).toBeUndefined();
  });

  it('harf değişikliği değişikliktir (sunucu C7 kuralı kararı verir)', () => {
    expect(degisenMalzemeAdi(satir({ col1: 'KÜRESEL VANA' }), 'col1', ilk)).toBe('KÜRESEL VANA');
  });

  it('boş ad hücresi gönderilmez (sunucu da yazmaz)', () => {
    expect(degisenMalzemeAdi(satir({ col1: '   ' }), 'col1', ilk)).toBeUndefined();
  });

  it('yüklemede adı olmayan satır için hücredeki ad gider (ad sessizce düşmez)', () => {
    expect(degisenMalzemeAdi(satir({ _libraryItemId: 'ul-yok' }), 'col1', ilk)).toBe('Küresel Vana');
    expect(degisenMalzemeAdi(satir({ _libraryItemId: undefined }), 'col1', ilk)).toBe('Küresel Vana');
  });

  it('her satır KENDİ yüklenen adıyla ölçülür', () => {
    const iki = malzemeAdlari([satir(), satir({ _libraryItemId: 'ul-2', col1: 'Kelebek Vana' })], 'col1');
    expect(degisenMalzemeAdi(satir({ _libraryItemId: 'ul-2', col1: 'Küresel Vana' }), 'col1', iki)).toBe('Küresel Vana');
    expect(degisenMalzemeAdi(satir(), 'col1', iki)).toBeUndefined();
  });

  it('kimliksiz (yeni / boş) satırlar haritaya girmez', () => {
    expect(malzemeAdlari([satir({ _libraryItemId: undefined }), satir({ _libraryItemId: '' }), { _isGroupRow: true }], 'col1').size).toBe(0);
  });

  it('ad sütunu bilinmiyorsa (rol yok) ad gönderilmez', () => {
    expect(degisenMalzemeAdi(satir(), undefined, ilk)).toBeUndefined();
  });
});

describe('⭐ BAĞLANTI: kütüphane marka sayfası bu kuralı gerçekten kullanıyor', () => {
  it('FIXTURE: sayfa dosyası okundu ve kayıt ucunu içeriyor', () => {
    expect(sayfa.length).toBeGreaterThan(1000);
    expect(sayfa).toContain('/save-sheets');
  });

  it('sayfa kuralı içe aktarıyor', () => {
    expect(sayfa).toContain("from '@/ozellik/kutuphane/malzeme-ad-imzasi'");
  });

  it('⭐ adlar yüklemede SUNUCU satırlarından alınıyor (boş satırlar eklenmeden)', () => {
    expect(sayfaKodu).toContain('ilkAdlarRef.current = malzemeAdlari(existing, firstSheet.columnRoles?.nameField)');
  });

  it('⭐ kayıtta ad YALNIZ değiştiyse gönderiliyor (koşulsuz `materialName: String(r[nameField]…` yok)', () => {
    expect(sayfaKodu).toContain('materialName: degisenMalzemeAdi(r, nameField, ilkAdlarRef.current)');
    expect(sayfaKodu).not.toMatch(/materialName:\s*String\(r\[nameField\]/);
  });

  it('yükleme hatasında ve yeni listede eski adlar temizleniyor (başka listenin adı kullanılmaz)', () => {
    expect(sayfaKodu.split('ilkAdlarRef.current = new Map()').length - 1).toBe(2);
  });
});
