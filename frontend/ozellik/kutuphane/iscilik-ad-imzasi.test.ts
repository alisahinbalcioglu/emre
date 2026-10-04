import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adDegistiMi, adImzalari, adImzasi } from './iscilik-ad-imzasi';

/**
 * İşçilik ızgarası — ad YALNIZ değiştiyse gönderilir (inceleme 2. tur, 01.10).
 *
 * İKİ AYRI ŞEY ÖLÇÜLÜR:
 *  (1) MANTIK — yalnız fiyatı/birimi değişen satır "ad değişti" sayılmaz;
 *      ad · cins · çap hücresindeki değişiklik sayılır.
 *  (2) BAĞLANTI — firma detay sayfası imzaları yüklemede alıyor ve kayıtta
 *      `laborItemName`i bu kurala bağlıyor ("mekanizma var, bağlantı yok").
 */

const KOK = join(__dirname, '../..');
const sayfa = readFileSync(join(KOK, 'app/(protected)/labor-firms/[firmaId]/page.tsx'), 'utf8');
/** Desen KODDA aranır: yorumlar soyulur (yorumdaki ibare kodu ölçmez). */
const sayfaKodu = sayfa.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const satir = (ek: Record<string, unknown> = {}) => ({
  _rowIdx: 3, _isDataRow: true, _laborPriceId: 'lp-1', ad: 'Küresel vana montajı', cins: 'flanşlı', cap: 'DN50', fiyat: 100, birim: 'Adet', ...ek,
});

describe('adDegistiMi — mantık', () => {
  const ilk = adImzalari([satir()], 'ad');

  it('hiçbir hücre değişmediyse HAYIR', () => {
    expect(adDegistiMi(satir(), 'ad', ilk)).toBe(false);
  });

  it('⭐ yalnız fiyat / birim / not değiştiyse HAYIR (eskiden ad yine gidiyordu)', () => {
    expect(adDegistiMi(satir({ fiyat: 125, birim: 'mt', not: 'yeni not' }), 'ad', ilk)).toBe(false);
  });

  it('ad, cins ya da çap hücresi değiştiyse EVET', () => {
    expect(adDegistiMi(satir({ ad: 'Kelebek vana montajı' }), 'ad', ilk)).toBe(true);
    expect(adDegistiMi(satir({ cins: 'dişli' }), 'ad', ilk)).toBe(true);
    expect(adDegistiMi(satir({ cap: 'DN65' }), 'ad', ilk)).toBe(true);
  });

  it('yalnız baş/son boşluk farkı değişiklik sayılmaz', () => {
    expect(adDegistiMi(satir({ ad: '  Küresel vana montajı ' }), 'ad', ilk)).toBe(false);
  });

  it('içe aktarılan sayfada ad SÜTUNU (nameField) da imzada', () => {
    const iceAktarim = { _laborPriceId: 'lp-9', col2: 'Pis su borusu montajı', col4: '120' };
    const ilkIce = adImzalari([iceAktarim], 'col2');
    expect(adDegistiMi({ ...iceAktarim, col4: '130' }, 'col2', ilkIce)).toBe(false);
    expect(adDegistiMi({ ...iceAktarim, col2: 'Temiz su borusu montajı' }, 'col2', ilkIce)).toBe(true);
  });

  it('yüklemede imzası olmayan satır için EVET (ad sessizce düşmez)', () => {
    expect(adDegistiMi(satir({ _laborPriceId: 'lp-yok' }), 'ad', ilk)).toBe(true);
    expect(adDegistiMi(satir({ _laborPriceId: undefined }), 'ad', ilk)).toBe(true);
  });

  it('aynı kimlik iki satırda: her satır KENDİ yüklenen hâline göre ölçülür', () => {
    const ikiz = adImzalari([satir(), satir({ _rowIdx: 4, cap: 'DN65' })], 'ad');
    expect(adDegistiMi(satir({ _rowIdx: 4, cap: 'DN65', fiyat: 1 }), 'ad', ikiz)).toBe(false);
    expect(adDegistiMi(satir(), 'ad', ikiz)).toBe(false);
  });

  it('kimliksiz (yeni) satırlar imzaya girmez', () => {
    expect(adImzalari([satir({ _laborPriceId: undefined }), satir({ _laborPriceId: '' })], 'ad').size).toBe(0);
  });

  it('imza hücre sırasına duyarlı: ad↔cins yer değiştirmesi değişikliktir', () => {
    expect(adImzasi(satir({ ad: 'flanşlı', cins: 'Küresel vana montajı' }), 'ad'))
      .not.toBe(adImzasi(satir(), 'ad'));
  });
});

describe('⭐ BAĞLANTI: firma detay sayfası bu kuralı gerçekten kullanıyor', () => {
  it('FIXTURE: sayfa dosyası okundu ve ızgara kaydı ucunu içeriyor', () => {
    expect(sayfa.length).toBeGreaterThan(1000);
    expect(sayfa).toContain('/save-sheets');
  });

  it('sayfa kuralı içe aktarıyor', () => {
    expect(sayfa).toContain("from '@/ozellik/kutuphane/iscilik-ad-imzasi'");
  });

  it('⭐ imzalar yüklemede SUNUCU satırlarından alınıyor', () => {
    expect(sayfaKodu).toContain('ilkAdImzalariRef.current = adImzalari(sheet.rowData, sheet.columnRoles?.nameField)');
  });

  it('⭐ kayıtta ad YALNIZ değiştiyse gönderiliyor (koşulsuz `laborItemName: buildLaborName(r)` yok)', () => {
    expect(sayfaKodu).toContain('laborItemName: adDegistiMi(r, nameField, ilkAdImzalariRef.current) ? buildLaborName(r) : undefined');
    expect(sayfaKodu).not.toMatch(/laborItemName:\s*buildLaborName\(r\)\s*,/);
  });

  it('liste yüklenemezse eski imzalar temizleniyor (başka listenin imzası kullanılmaz)', () => {
    expect(sayfaKodu.split('ilkAdImzalariRef.current = new Map()').length - 1).toBe(2);
  });
});
