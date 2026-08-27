/**
 * DOSYA TURU SECIMI — TEK KAYNAK (K6, 27.08)
 *
 * QuickStart'ta dosya DORT ayri yoldan giriyor: Excel drop, DWG drop, Excel
 * secici (picker), DWG secici. OLCULDU — uzanti kontrolu yalniz IKI DROP
 * yolunda vardi; SECICI yollari (`handleExcelInput` / `handleDwgInput`) gelen
 * dosyayi sorgusuz ilgili isleyiciye veriyordu.
 *
 * `accept=".xlsx,.xls"` bir IPUCUDUR, GARANTI DEGIL: kullanici secici
 * penceresinde "Tum dosyalar"i secip .dwg gonderebilir — o zaman DWG dosyasi
 * Excel cozumleyicisine gider. Kusur SINIFINI kapatmak icin karar tek saf
 * fonksiyona alindi; dort yol da bunu cagirir.
 *
 * Saf tutuldu (toast yok, yan etki yok) ki testten kosulabilsin.
 */
export type DosyaTuru = 'excel' | 'dwg' | 'gecersiz';

export function dosyaTuruSec(ad: string): DosyaTuru {
  const uzanti = ad.split('.').pop()?.toLowerCase() ?? '';
  if (uzanti === 'xlsx' || uzanti === 'xls') return 'excel';
  if (uzanti === 'dwg' || uzanti === 'dxf') return 'dwg';
  return 'gecersiz';
}
