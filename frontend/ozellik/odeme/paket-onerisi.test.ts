import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Paket } from './paket-bicim';
import { GECERSIZ_ONERI_METNI, baglantidakiOneri, bekleyenOneriSatiri, oneriSeridi } from './paket-onerisi';

/**
 * Yönetici paket önerisi — MÜŞTERİ tarafı (24.09.2026, A2 Blok 2).
 *
 * Karar SUNUCUDA: öneri yalnız GEÇERLİYSE hedef paketin satırında gelir
 * (`Paket.oneri`). Burada ölçülen: (1) şeridin saf kararı (sahip / üye /
 * bağlantı geçersiz / kabul edilemez + neden), (2) abonelik sayfasının,
 * şerit bileşeninin ve Hesabım sekmesinin doğru uçlara BAĞLI olduğu.
 */
const kok = join(__dirname, '..', '..');
const oku = (p: string) => readFileSync(join(kok, p), 'utf8').replace(/\r\n/g, '\n');
const kodu = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const paket = (kod: string, o: Partial<Paket> = {}): Paket => ({
  paketId: `p-${kod}`,
  kod,
  ad: `Paket ${kod}`,
  aciklama: null,
  kapsam: 'mechanical',
  seviye: 'pro',
  kullaniciHakki: 2,
  aylikTeklifHakki: null,
  dwgAktif: true,
  surum: {} as Paket['surum'],
  ...o,
});
const ONERI = { id: '11111111-2222-4333-8444-555555555555', sonGecerlilik: '2026-10-01T09:00:00.000Z', not: 'Pro size uygun.' };
const DEGISTIR = { yol: 'degistir' as const, zamanlama: 'hemen' as const, beklenenTarih: '2026-10-14T09:00:00.000Z' };
const g = (o: Partial<Parameters<typeof oneriSeridi>[1]> = {}) => ({
  sahipMi: true,
  mevcutPaketKodu: 'basic-mek',
  baglantidakiOneri: null,
  ...o,
});

describe('şerit kararı (saf)', () => {
  it('öneri yoksa ve bağlantı da yoksa şerit YOK', () => {
    expect(oneriSeridi([paket('pro-mek', { degisim: DEGISTIR })], g())).toEqual({ tur: 'yok' });
  });

  it('bağlantıda `?oneri=` var ama geçerli öneri gelmedi → "artık geçerli değil"', () => {
    expect(oneriSeridi([paket('pro-mek')], g({ baglantidakiOneri: 'x' }))).toEqual({ tur: 'gecersiz-baglanti' });
    expect(GECERSIZ_ONERI_METNI).toMatch(/artık geçerli değil/);
  });

  it('SAHİP: hedef, not, son gün; A1 kararı "geç" diyorsa kabul AÇIK', () => {
    const s = oneriSeridi([paket('basic-mek'), paket('pro-mek', { degisim: DEGISTIR, oneri: ONERI })], g());
    expect(s.tur).toBe('sahip');
    if (s.tur !== 'sahip') return;
    expect(s.oneriId).toBe(ONERI.id);
    expect(s.hedef.kod).toBe('pro-mek');
    expect(s.not).toBe('Pro size uygun.');
    expect(s.sonGun).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(s.kabul).toEqual({ acik: true });
  });

  it('SAHİP: A1 "geçilemez" diyorsa (ör. ödeme sorunu) kabul KAPALI ve sunucunun NEDENİ yazılı', () => {
    const s = oneriSeridi(
      [paket('pro-mek', { degisim: { yol: 'yok', kod: 'ODEME_SORUNU', mesaj: 'Önce ödemenizi tamamlayın.' }, oneri: ONERI })],
      g(),
    );
    expect(s.tur === 'sahip' && s.kabul).toEqual({ acik: false, neden: 'Önce ödemenizi tamamlayın.' });
  });

  it('ÜYE: yalnız bilgi — not ve kabul/ret YOK', () => {
    const s = oneriSeridi([paket('pro-mek', { degisim: DEGISTIR, oneri: { ...ONERI, not: null } })], g({ sahipMi: false }));
    expect(s).toEqual({ tur: 'uye', hedefAdi: 'Paket pro-mek', sonGun: expect.stringMatching(/^\d{2}\.\d{2}\.\d{4}$/) });
  });

  it('Hesabım satırı: hedef adı, son gün ve şeridi açan bağlantı; öneri yoksa null', () => {
    expect(bekleyenOneriSatiri([paket('pro-mek')])).toBeNull();
    expect(bekleyenOneriSatiri([paket('pro-mek', { oneri: ONERI })])).toEqual({
      ad: 'Paket pro-mek',
      sonGun: expect.stringMatching(/^\d{2}\.\d{2}\.\d{4}$/),
      baglanti: `/abonelik?oneri=${ONERI.id}`,
    });
  });

  it('bağlantı okuma: `?oneri=` değeri; yoksa ya da boşsa null', () => {
    expect(baglantidakiOneri(`?oneri=${ONERI.id}`)).toBe(ONERI.id);
    expect(baglantidakiOneri('?oneri=')).toBeNull();
    expect(baglantidakiOneri('')).toBeNull();
  });
});

describe('bağlantı (kaynak kapısı)', () => {
  const sayfa = kodu(oku('app/(protected)/abonelik/page.tsx'));
  const serit = kodu(oku('ozellik/odeme/OneriSeridi.tsx'));
  const sekme = kodu(oku('ozellik/kimlik/hesabim/AbonelikSekmesi.tsx'));

  it('⭐ KABUL aynı uçtan: önerilen paketin değişimi `oneriId` taşır (kart ya da şerit fark etmez)', () => {
    expect(sayfa).toMatch(/api\.post<\{ mesaj\?: string \}>\('\/abonelik\/degistir', \{[\s\S]*?\.\.\.\(degisimHedefi\.oneri \? \{ oneriId: degisimHedefi\.oneri\.id \} : \{\}\)/);
  });

  it('şerit sayfada; "İncele ve onayla" A1 onay penceresini açan AYNI fonksiyonu çağırır', () => {
    expect(sayfa).toMatch(/<OneriSeridi[\s\S]*?onIncele=\{degisimPenceresiniAc\}/);
    const kart = sayfa.slice(sayfa.indexOf("if (eylem.tur === 'degistir')"), sayfa.indexOf("if (eylem.tur === 'degistir')") + 120);
    expect(kart).toMatch(/degisimPenceresiniAc\(p\)/);
  });

  it('ret ucu doğru; bağlantı `window.location`tan (useSearchParams DEĞİL — Next 14 Suspense ister)', () => {
    expect(serit).toMatch(/api\.post\(`\/abonelik\/oneri\/\$\{oneriId\}\/reddet`\)/);
    expect(serit).toMatch(/baglantidakiOneri\(window\.location\.search\)/);
    expect(serit).not.toMatch(/useSearchParams/);
  });

  it('yüklenirken, liste BOŞKEN (yükleme hatası — D3) ve geçerli öneri görüldükten sonra "bağlantı geçersiz" ÇİZİLMEZ', () => {
    expect(serit).toMatch(/if \(props\.yukleniyor \|\| props\.paketler\.length === 0 \|\| g\.tur === 'yok'\) return null;/);
    expect(serit).toMatch(/return gecerliGoruldu \? null : \(/);
  });

  it('⭐ öneri geçersiz hatası (409 ONERI_*) pencereyi KAPATIR; eski öneriyle yeniden denenmez (D4)', () => {
    const dal = sayfa.slice(sayfa.indexOf("kod.startsWith('ONERI_')"), sayfa.indexOf("kod.startsWith('ONERI_')") + 300);
    expect(dal).toMatch(/setDegisimHedefi\(null\);/);
    expect(dal).toMatch(/return;/);
  });

  it('"satın al" kolunda gerekçe "sayfayı yenileyin" DEĞİL (işe yaramayan eylem önermez — D6)', () => {
    const s = oneriSeridi([paket('pro-mek', { oneri: ONERI })], g({ mevcutPaketKodu: null }));
    expect(s.tur === 'sahip' && s.kabul).toEqual({ acik: false, neden: 'Aboneliğiniz şu an etkin olmadığı için öneri kabul edilemiyor.' });
  });

  it('Hesabım satırı şeritle AYNI kaynaktan (`/abonelik/paketler`), hata sekmeyi bozmaz', () => {
    expect(sekme).toMatch(/\.get<Paket\[\]>\('\/abonelik\/paketler'\)/);
    expect(sekme).toMatch(/bekleyenOneriSatiri\(data\)/);
    expect(sekme).toMatch(/\.catch\(\(\) => undefined\)/);
  });
});
