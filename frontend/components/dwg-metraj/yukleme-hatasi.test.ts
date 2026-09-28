/**
 * DWG YÜKLEME HATASI (28.09.2026) — 429'da dosya YENİDEN GÖNDERİLMEZ.
 *
 * Eskiden motorun "hat dolu" yanıtı (Nest'te 503'e çevrilmiş) ve firma sınırının 429'u
 * otomatik yeniden deneniyordu; her deneme dosyanın TAMAMINI taşır (250 MB'ta 4 ek deneme
 * ~1 GB). Kilitlenen: kural (yogunMu / yuklemeYenidenGonderilir / yuklemeHataMetni) ve
 * DwgUploader.tsx'in bu saf modülü GERÇEKTEN kullanması (bağlantı): yükleme döngüsü yeni
 * kuralla; 429'da "Tekrar dene" son yüklemeyi aynı seçenekle yineler.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { YOGUN_METNI, yogunMu, yuklemeHataMetni, yuklemeYenidenGonderilir } from './yukleme-hatasi';

const yanit = (status: number, data?: unknown) => ({ response: { status, data } });

const FIRMA_SINIRI = 'Firmanizin 2 DWG yuklemesi zaten suruyor; biri bitince yeniden deneyin.';
const MOTOR_DOLU = 'DWG motoru su an cok sayida projeyi isliyor; birkac dakika sonra tekrar deneyin.';

describe('yuklemeYenidenGonderilir — dosyanın tamamı yeniden taşınır mı', () => {
  it('429 (firma sınırı ya da motor hattı dolu) YENİDEN GÖNDERİLMEZ', () => {
    expect(yuklemeYenidenGonderilir(yanit(429, { statusCode: 429, message: FIRMA_SINIRI }))).toBe(false);
    expect(yuklemeYenidenGonderilir(yanit(429, { statusCode: 429, message: MOTOR_DOLU }))).toBe(false);
    expect(yuklemeYenidenGonderilir(yanit(429))).toBe(false);
  });

  it.each([500, 502, 503, 504])('%i (soğuk başlangıç) yeniden gönderilir', (durum) => {
    expect(yuklemeYenidenGonderilir(yanit(durum))).toBe(true);
  });

  it('ağ hatası, zaman aşımı ve yanıtsız hata yeniden gönderilir', () => {
    expect(yuklemeYenidenGonderilir({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(true);
    expect(yuklemeYenidenGonderilir({ code: 'ECONNABORTED', message: 'timeout of 120000ms exceeded' })).toBe(true);
    expect(yuklemeYenidenGonderilir(new Error('baglanti koptu'))).toBe(true);
  });

  it.each([400, 401, 403, 404, 413, 422])('%i kalıcı: yeniden gönderilmez', (durum) => {
    expect(yuklemeYenidenGonderilir(yanit(durum))).toBe(false);
  });
});

describe('yogunMu', () => {
  it('yalnız 429 yoğunluktur', () => {
    expect(yogunMu(yanit(429))).toBe(true);
    expect(yogunMu(yanit(503))).toBe(false);
    expect(yogunMu(new Error('x'))).toBe(false);
    expect(yogunMu(undefined)).toBe(false);
    expect(yogunMu(null)).toBe(false);
  });
});

describe('yuklemeHataMetni', () => {
  it('429: sunucunun metni — firma sınırı ile motor hattı ayrı söylenir', () => {
    expect(yuklemeHataMetni(yanit(429, { statusCode: 429, message: FIRMA_SINIRI }))).toBe(FIRMA_SINIRI);
    expect(yuklemeHataMetni(yanit(429, { statusCode: 429, message: MOTOR_DOLU }))).toBe(MOTOR_DOLU);
  });

  it('429 metinsiz (vekil sayfası, boş gövde): sabit metin', () => {
    expect(yuklemeHataMetni(yanit(429, '<html>Too Many Requests</html>'))).toBe(YOGUN_METNI);
    expect(yuklemeHataMetni(yanit(429))).toBe(YOGUN_METNI);
    expect(yuklemeHataMetni(yanit(429, { message: '   ' }))).toBe(YOGUN_METNI);
  });

  it('diğer hatalar eski sırayla: message → detail → hata metni → sabit', () => {
    expect(yuklemeHataMetni(yanit(422, { message: 'Upload hatasi: bozuk DWG' }))).toBe('Upload hatasi: bozuk DWG');
    expect(yuklemeHataMetni(yanit(400, { detail: 'Desteklenmeyen format' }))).toBe('Desteklenmeyen format');
    expect(yuklemeHataMetni(new Error('Parse zaman asimi (600sn)'))).toBe('Parse zaman asimi (600sn)');
    expect(yuklemeHataMetni({})).toBe('Proje yuklenemedi');
  });
});

describe('DwgUploader.tsx bağlantısı', () => {
  const kaynak = readFileSync(join(__dirname, 'DwgUploader.tsx'), 'utf8');
  const kod = kaynak.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const dongu = kod.slice(kod.indexOf('attempt <= UPLOAD_RETRY_DELAYS.length'), kod.indexOf('if (!uploadRes)'));

  it('yükleme döngüsü yeni kuralı kullanır (429\'u da deneyen isTransient DEĞİL)', () => {
    expect(dongu.length).toBeGreaterThan(50); // ÖLÇÜT: döngü bulundu
    expect(dongu).toContain('yuklemeYenidenGonderilir(err)');
    expect(dongu).not.toContain('isTransient(');
  });

  it('hata metni ve yoğunluk saf modülden', () => {
    expect(kod).toContain('yuklemeHataMetni(e)');
    expect(kod).toContain('yogunMu(e)');
  });

  it('"Tekrar dene" son yüklemeyi aynı seçenekle yineler', () => {
    const bas = kod.indexOf('{yogun && sonYukleme.current');
    const dugme = kod.slice(bas, kod.indexOf('Tekrar dene', bas));
    expect(bas).toBeGreaterThan(0); // ÖLÇÜT: düğme yalnız yoğunlukta
    expect(dugme).toContain('extractLayers(son.f, son.opts)');
    expect(kod).toContain('sonYukleme.current = { f, opts }');
  });
});
