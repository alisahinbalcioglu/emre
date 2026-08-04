import { describe, it, expect } from 'vitest';
import { kaynakKolonEtiketi } from '../ozellik/giris/kaynak-kolon';

/**
 * KULLANICI BULGUSU (canlı, 02.08.2026): "Malzeme Adı sütunu" kutusunda
 * `MALZEME ADI — ör: 2000 GPM 9,5 bar 1 E+ 1 D` yazıyordu. O kutu tek bir
 * soruyu cevaplar — "malzeme isimleri hangi sütunda?" — ve o sütunun adı
 * zaten `MALZEME ADI`. Örnek değer gürültüydü.
 *
 * Bu suite iki AYRI aileyi birden korur; biri düzeltilirken diğeri bozulmasın:
 *   AİLE 1 — başlığı OLAN dosya  → yalnız başlık yazılır (kullanıcının isteği)
 *   AİLE 2 — başlığı OLMAYAN dosya → örnek KALIR (yoksa `col1` yazardı)
 */
describe('kaynakKolonEtiketi', () => {
  // ── AİLE 1: gerçek başlık var → yalnız başlık ───────────────────────────
  it('gerçek başlık varsa örnek değer GÖSTERİLMEZ', () => {
    // FIRMA-D (PANOVA) fixture'ından birebir ölçülmüş gerçek değerler.
    expect(kaynakKolonEtiketi({
      field: 'col1', headerName: 'MALZEME ADI', ornek: '2000 GPM 9,5 bar 1 E+ 1 D',
    })).toBe('MALZEME ADI');
  });

  it('başlığı olan ikinci sütunda da yalnız başlık yazar', () => {
    // Aynı dosyanın ikinci seçeneği — ters başlık olsa bile ADI yazılır,
    // içeriği düzeltmek bu etiketin işi değil.
    expect(kaynakKolonEtiketi({
      field: 'col3', headerName: 'MİKTAR', ornek: 'SET',
    })).toBe('MİKTAR');
  });

  // ── AİLE 2: başlık yok → örnek tek ipucu, KALMALI ───────────────────────
  it('başlık yoksa (headerName = sütun kimliği) örnek KALIR', () => {
    // Backend `basligi()` başlık bulamazsa alan adına düşer (standart-sema.ts:299).
    expect(kaynakKolonEtiketi({
      field: 'col4', headerName: 'col4', ornek: '8" Yükselen Milli Vana',
    })).toBe('col4 — ör: 8" Yükselen Milli Vana');
  });

  it('başlık da örnek de yoksa sütun kimliği yazılır', () => {
    expect(kaynakKolonEtiketi({ field: 'col7', headerName: 'col7', ornek: '' })).toBe('col7');
    expect(kaynakKolonEtiketi({ field: 'col7', headerName: '' })).toBe('col7');
  });

  it('boşluklu başlık gerçek başlık sayılmaz', () => {
    expect(kaynakKolonEtiketi({ field: 'col2', headerName: '   ', ornek: 'mt' }))
      .toBe('col2 — ör: mt');
  });
});
