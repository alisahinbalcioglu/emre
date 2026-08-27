/**
 * K6 (27.08) — DOSYA TURU SECIMI TEK KAYNAK.
 *
 * OLCULDU: QuickStart'ta uzanti denetimi yalniz IKI DROP yolundaydi; SECICI
 * yollari (`handleExcelInput` / `handleDwgInput`) dosyayi sorgusuz isleyiciye
 * veriyordu. `accept=".xlsx,.xls"` bir IPUCUDUR — kullanici secici penceresinde
 * "Tum dosyalar"i secebilir. Karar bu saf fonksiyona alindi; dort yol da onu
 * cagirir, boylece kusur SINIFI kapanir (tek yola yama atmak yetmezdi).
 */
import { describe, it, expect } from 'vitest';
import { dosyaTuruSec } from './dosya-turu';

describe('dosyaTuruSec', () => {
  it('Excel uzantilarini taniyor', () => {
    expect(dosyaTuruSec('kesif.xlsx')).toBe('excel');
    expect(dosyaTuruSec('kesif.xls')).toBe('excel');
  });

  it('DWG/DXF uzantilarini taniyor', () => {
    expect(dosyaTuruSec('proje.dwg')).toBe('dwg');
    expect(dosyaTuruSec('proje.dxf')).toBe('dwg');
  });

  it('BUYUK HARF uzanti da taninir (Windows dosya adlari)', () => {
    expect(dosyaTuruSec('KESIF.XLSX')).toBe('excel');
    expect(dosyaTuruSec('PROJE.DWG')).toBe('dwg');
  });

  it('ASIL KUSUR: secici yolundan gelen yanlis tur GECERSIZ sayilir', () => {
    // Kullanici Excel secicisinde "Tum dosyalar"i secip bunlari gonderebilir.
    expect(dosyaTuruSec('proje.pdf')).toBe('gecersiz');
    expect(dosyaTuruSec('resim.png')).toBe('gecersiz');
    expect(dosyaTuruSec('veri.csv')).toBe('gecersiz');
  });

  it('uzantisiz ve tuzak adlar gecersiz', () => {
    expect(dosyaTuruSec('uzantisiz')).toBe('gecersiz');
    // Ad ICINDE 'xlsx' gecmesi yetmez — SON uzanti belirler.
    expect(dosyaTuruSec('xlsx-donusturucu.exe')).toBe('gecersiz');
    expect(dosyaTuruSec('rapor.xlsx.exe')).toBe('gecersiz');
  });

  it('cok noktali adda SON uzanti belirler', () => {
    expect(dosyaTuruSec('2026.08.27 kesif.xlsx')).toBe('excel');
  });
});
