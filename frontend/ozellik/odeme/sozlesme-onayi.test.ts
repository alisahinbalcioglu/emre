import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SOZLESME_ONAYI_BASLANGIC,
  SOZLESME_ONAY_METNI,
  ON_BILGILENDIRME_YOLU,
  SOZLESME_YOLU,
  sozlesmeOnayiHatasi,
} from './sozlesme-onayi';

/**
 * SATIN ALMADA SÖZLEŞME ONAYI — ön yüz kapısı (Faz 6.4, 16.09).
 *
 * ⚠ İKİ AYRI ŞEY ÖLÇÜLÜYOR (bu deponun "mekanizma var, bağlantı yok"
 * dersi): kuralın DOĞRU olması ve kuralın ekrana GERÇEKTEN bağlı olması.
 * Sunucudaki asıl kapı (`@Equals(true)`) `npm run test:satinalma`de.
 */
const SAYFA = readFileSync(
  join(__dirname, '../../app/(protected)/abonelik/page.tsx'),
  'utf-8',
);

describe('O-ÖLÇÜT — fixture doğru dosyayı okuyor', () => {
  it('abonelik sayfası okundu ve fatura adımını içeriyor', () => {
    expect(SAYFA.length).toBeGreaterThan(3000);
    expect(SAYFA).toContain('Fatura bilgileri');
    expect(SAYFA).toContain('Ödemeye geç');
  });
});

describe('O1 — kural', () => {
  it('kutu ÖNCEDEN İŞARETSİZ başlar', () => {
    expect(SOZLESME_ONAYI_BASLANGIC).toBe(false);
  });

  it('işaretsizken gerekçeli hata döner (sessiz dal yok)', () => {
    const h = sozlesmeOnayiHatasi(false);
    expect(h).toBeTruthy();
    expect(h).toContain('Mesafeli Satış Sözleşmesi');
  });

  it('işaretliyken engel yok', () => {
    expect(sozlesmeOnayiHatasi(true)).toBeNull();
  });

  it('onay metni iki belgeyi de ADIYLA anıyor', () => {
    expect(SOZLESME_ONAY_METNI).toContain('Ön Bilgilendirme Formu');
    expect(SOZLESME_ONAY_METNI).toContain('Mesafeli Satış Sözleşmesi');
    expect(SOZLESME_ONAY_METNI).toContain('onaylıyorum');
  });

  it('bağlantı yolları gerçek sayfaya gider (sözleşme çıpalı)', () => {
    expect(ON_BILGILENDIRME_YOLU).toBe('/mesafeli-satis');
    expect(SOZLESME_YOLU).toBe('/mesafeli-satis#sozlesme');
  });
});

describe('O2 — BAĞLANTI: kural ekrana gerçekten bağlı', () => {
  it('kutu sayfada var ve başlangıç değeri sabitten geliyor', () => {
    expect(SAYFA).toContain('id="sozlesme-onayi"');
    expect(SAYFA).toContain('type="checkbox"');
    expect(SAYFA).toContain('checked={sozlesmeOnayi}');
    expect(SAYFA).toContain('useState<boolean>(SOZLESME_ONAYI_BASLANGIC)');
  });

  // ⚠ ASIL MUTANT HEDEFİ: `!sozlesmeOnayi` düşerse düğme onaysız da basılır.
  it('düğme onay işaretlenmeden İLERLEMEZ', () => {
    expect(SAYFA).toContain('disabled={gonderiliyor || !sozlesmeOnayi}');
  });

  it('gönderim yolunda ikinci kapı var ve gövdeye onay konuyor', () => {
    expect(SAYFA).toContain('sozlesmeOnayiHatasi(sozlesmeOnayi)');
    expect(SAYFA).toMatch(/musteri: govdeyeCevir\(fatura\),\s*sozlesmeOnayi,/);
  });

  it('iki metne de YENİ SEKMEDE açılan bağlantı var', () => {
    expect(SAYFA).toContain('href={ON_BILGILENDIRME_YOLU}');
    expect(SAYFA).toContain('href={SOZLESME_YOLU}');
    expect(SAYFA).toContain('rel="noopener noreferrer"');
  });
});
