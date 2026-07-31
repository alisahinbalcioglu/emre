/**
 * PK8 — GÖLGE KAYNAK KURALI (31.07.2026)
 *
 * GS6b'nin kök nedeni satırların İKİ kaynağı olmasıydı:
 *   - `multiSheet.sheets[i].rowData`  (tazelenen)
 *   - `liveRowDataBySheet[i]`          (grid'in GERÇEKTEN okuduğu — page.tsx:1663)
 * `handleNameFieldChange` yalnız birincisini güncelliyordu; ikincisi
 * yüklemede doldurulduğu için (page.tsx:345-347) fallback hiç çalışmıyor ve
 * ekran hiç değişmiyordu.
 *
 * Aynı bug sınıfı 24.07'de kalem eklemede de yaşandı (`liveRows` race).
 * Bu kaynak-seviyesi kilit, kuralın bir daha sessizce bozulmasını engeller:
 * satır listesini yeniden yazan fonksiyon, gölge kaynağı da tazelemek zorunda.
 *
 * NOT: bu, GS6b'nin E2E assert'inin YERİNE geçmez — E2E davranışı, bu ise
 * kuralı kilitler. (Bir assert birden fazla kritere sayılamaz; ikisi ayrı
 * şeyleri ispatlar.)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const sayfa = fs.readFileSync(
  path.resolve(__dirname, '../app/(protected)/quotes/new/page.tsx'), 'utf-8',
);

/** Bir fonksiyonun govdesini kaba ama yeterli bicimde ayikla. */
function govde(kaynak: string, imza: string): string {
  const bas = kaynak.indexOf(imza);
  if (bas < 0) return '';
  let derinlik = 0, i = kaynak.indexOf('{', bas);
  const basla = i;
  for (; i < kaynak.length; i++) {
    if (kaynak[i] === '{') derinlik++;
    else if (kaynak[i] === '}') { derinlik--; if (derinlik === 0) return kaynak.slice(basla, i + 1); }
  }
  return '';
}

describe('PK8 — satır listesini yeniden yazan işlem gölge kaynağı da tazeler', () => {
  it('handleNameFieldChange liveRowDataBySheet’i günceller', () => {
    const g = govde(sayfa, 'function handleNameFieldChange');
    expect(g, 'handleNameFieldChange bulunamadı (yeniden adlandırıldıysa bu testi güncelle)').not.toBe('');
    expect(
      /setLiveRowDataBySheet/.test(g),
      'handleNameFieldChange `liveRowDataBySheet`i güncellemiyor → grid rowData’yı '
      + 'page.tsx:1663’te oradan okuduğu için ekran DEĞİŞMEZ (GS6b nüksetti).',
    ).toBe(true);
  });

  it('grid rowData’sı hâlâ liveRowDataBySheet’ten okunuyor (kuralın dayanağı)', () => {
    // Bu satır değişirse yukarıdaki kuralın gerekçesi de değişir — test o zaman
    // kırmızı olup gözden geçirilmeyi zorlar (sessizce bayatlamaz).
    expect(
      /rowData:\s*liveRowDataBySheet\[active\.index\]\s*\?\?\s*active\.rowData/.test(sayfa),
      'grid rowData kaynağı değişmiş — PK8 kuralının gerekçesini yeniden değerlendir.',
    ).toBe(true);
  });
});
