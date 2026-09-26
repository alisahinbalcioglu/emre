import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KART_METINLERI,
  ODEME_DENEMESI_ZAMAN_ASIMI_MS,
  kartHatasi,
  kartIstekGovdesi,
  kartSayfasiGirdisi,
  odemeDenemesiGorunumu,
  odemeDenemesiHatasi,
  odemeDenemesiOku,
  yenidenAcmaAdresi,
  type OdemeDenemesi,
} from './kart-guncelleme';
import { icerikDurdurulsunMu, type ErisimKarari } from './erisim-durumu';

/**
 * KART GÜNCELLEME SAYFASI KAPISI (25.09.2026)
 *
 * `/abonelik/kart` yokken dunning e-postalarının ve uygulama içi şeridin
 * düğmesi 404 veriyordu (canlıda ölçüldü). Render altyapısı (jsdom/RTL) bu
 * depoda YOK: kurallar saf modülde ölçülür, sayfanın onları GERÇEKTEN
 * çağırdığı kaynaktan (yorumlar soyularak) ölçülür. Görsel doğrulama taklit
 * API ile önizlemede yapıldı. Sunucu tarafı: `backend/test/kart-guncelleme-test.ts`.
 */

const kok = join(__dirname, '..', '..');
const SAYFA = 'app/(protected)/abonelik/kart/page.tsx';
const oku = (p: string) => readFileSync(join(kok, p), 'utf8').replace(/\r\n/g, '\n');
/** Yorumları soyar: kapı yorumdaki ibareyi değil KODU ölçsün. */
const yorumsuz = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ABONELIK = '6f1c2b3a-9d8e-4f70-8a1b-2c3d4e5f6a7b';

describe('G · sorgu dizesi (e-posta ?a= ve sunucu dönüşü ?sonuc=)', () => {
  it('G1 e-posta bağlantısı: abonelik kimliği okunur, FORM kipi', () => {
    expect(kartSayfasiGirdisi(`?a=${ABONELIK}`)).toEqual({ abonelikId: ABONELIK, sonuc: null });
  });
  it('G2 uygulama içi şerit (sorgusuz): kimlik yok, FORM kipi', () => {
    expect(kartSayfasiGirdisi('')).toEqual({ abonelikId: null, sonuc: null });
  });
  it('G3 boş / boşluklu ?a= kimlik sayılmaz', () => {
    expect(kartSayfasiGirdisi('?a=').abonelikId).toBeNull();
    expect(kartSayfasiGirdisi('?a=%20%20').abonelikId).toBeNull();
  });
  it('G4 sunucu dönüşü: guncellendi / hata', () => {
    expect(kartSayfasiGirdisi('?sonuc=guncellendi').sonuc).toBe('guncellendi');
    expect(kartSayfasiGirdisi('?sonuc=hata').sonuc).toBe('hata');
  });
  it('G5 tanınmayan sonuç HATA sayılır — bozuk değerle sessizce form açılmaz', () => {
    expect(kartSayfasiGirdisi('?sonuc=GUNCELLENDI').sonuc).toBe('hata');
    expect(kartSayfasiGirdisi('?sonuc=').sonuc).toBe('hata');
  });
});

describe('İ · istek gövdesi', () => {
  it('İ1 ?a= varsa gövdeye abonelikId olarak gider', () => {
    expect(kartIstekGovdesi({ abonelikId: ABONELIK, sonuc: null })).toEqual({ abonelikId: ABONELIK });
  });
  it('İ2 ?a= yoksa alan HİÇ gönderilmez (undefined anahtar bile yok)', () => {
    const g = kartIstekGovdesi({ abonelikId: null, sonuc: null });
    expect(g).toEqual({});
    expect('abonelikId' in g).toBe(false);
  });
});

describe('H · sunucu retleri kullanıcı cümlesine + yeniden açma kararı', () => {
  const ret = (status: number, data: unknown) => ({ response: { status, data } });
  it('H1 sahip olmayan üye (403 FIRMA_SAHIBI_GEREKLI) — kalıcı, yeniden açma YOK', () => {
    expect(kartHatasi(ret(403, { kod: 'FIRMA_SAHIBI_GEREKLI', message: 'x' }))).toEqual({
      metin: KART_METINLERI.sahipGerekli, yenidenAcma: null,
    });
  });
  it('H2 ⭐ başka firmanın bağlantısı (409) — yeniden açma YOK: kendi firmasının formu yanlış firmayı güncellediğini sandırırdı', () => {
    expect(kartHatasi(ret(409, { kod: 'ABONELIK_ESLESMIYOR', message: 'x' }))).toEqual({
      metin: KART_METINLERI.eslesmiyor, yenidenAcma: null,
    });
  });
  it('H3 kartı güncellenemeyen abonelik (400 KART_ABONELIGI_YOK) — kalıcı', () => {
    expect(kartHatasi(ret(400, { kod: 'KART_ABONELIGI_YOK', message: 'x' }))).toEqual({
      metin: KART_METINLERI.kartAboneligiYok, yenidenAcma: null,
    });
  });
  it('H4 gövde doğrulaması (kodsuz 400, DİZİ ileti = bozulmuş ?a=): İngilizce ileti GÖSTERİLMEZ, bağlantısız açılır', () => {
    expect(kartHatasi(ret(400, { message: ['abonelikId must be a UUID'], error: 'Bad Request' }))).toEqual({
      metin: KART_METINLERI.baglantiGecersiz, yenidenAcma: 'baglantisiz',
    });
  });
  it('H4b ⭐ iyzico reddi (kodlu 400) doğrulama DEĞİL: iyzico\'nun iletisi gösterilir, döngü kurulmaz (inceleme M1)', () => {
    const iyzico = ret(400, {
      statusCode: 400, kod: '10201', kaynak: 'iyzico', message: 'Abonelik kart güncellemeye uygun değil (iyzico kodu: 10201)',
    });
    expect(kartHatasi(iyzico)).toEqual({
      metin: 'Abonelik kart güncellemeye uygun değil (iyzico kodu: 10201)', yenidenAcma: null,
    });
  });
  it('H4c kodsuz ama DİZİ olmayan 400 de doğrulama sayılmaz (sunucu iletisi, kalıcı)', () => {
    expect(kartHatasi(ret(400, { message: 'Geçersiz istek' }))).toEqual({ metin: 'Geçersiz istek', yenidenAcma: null });
  });
  it('H5 geçici arıza (5xx, ağ): sunucu iletisi ya da genel cümle; AYNI bağlantıyla yeniden açılır', () => {
    expect(kartHatasi(ret(502, { message: 'iyzico yanıt vermedi' }))).toEqual({
      metin: 'iyzico yanıt vermedi', yenidenAcma: 'ayniBaglanti',
    });
    expect(kartHatasi(new Error('Network Error'))).toEqual({ metin: KART_METINLERI.genel, yenidenAcma: 'ayniBaglanti' });
    expect(kartHatasi(null).metin).toBe(KART_METINLERI.genel);
  });
  it('H6 hız sınırı (429): kendi cümlemiz — sunucunun İngilizce iletisi gösterilmez; sonra yeniden açılabilir', () => {
    expect(kartHatasi(ret(429, { statusCode: 429, message: 'ThrottlerException: Too Many Requests' }))).toEqual({
      metin: KART_METINLERI.cokSik, yenidenAcma: 'ayniBaglanti',
    });
  });
});

describe('Y · "Formu yeniden aç" hedefi', () => {
  const eposta = kartSayfasiGirdisi(`?a=${ABONELIK}`);
  const serit = kartSayfasiGirdisi('');
  it('Y1 ⭐ geçici arızada e-postadaki ?a= KORUNUR — sahiplik denetimi yeniden yapılır (inceleme L2)', () => {
    expect(yenidenAcmaAdresi(eposta, 'ayniBaglanti')).toBe(`/abonelik/kart?a=${ABONELIK}`);
  });
  it('Y2 şeritten gelen (bağlantısız) açılış bağlantısız kalır', () => {
    expect(yenidenAcmaAdresi(serit, 'ayniBaglanti')).toBe('/abonelik/kart');
  });
  it('Y3 bozulmuş bağlantı ve iyzico dönüş hatası bağlantısız açılır', () => {
    expect(yenidenAcmaAdresi(eposta, 'baglantisiz')).toBe('/abonelik/kart');
  });
  it('Y4 kalıcı ret → düğme YOK', () => {
    expect(yenidenAcmaAdresi(eposta, null)).toBeNull();
  });
  it('Y5 kimlik adrese kodlanarak yazılır (sorgu dizesi bölünmez)', () => {
    expect(yenidenAcmaAdresi(kartSayfasiGirdisi('?a=x%26sonuc%3Dhata'), 'ayniBaglanti')).toBe(
      '/abonelik/kart?a=x%26sonuc%3Dhata',
    );
  });
});

/**
 * Ö — BEKLEYEN ÖDEMENİN ANLIK DENEMESİ (26.09.2026, Emre kararı). Kart
 * dönüşünde sayfa sunucuya BİR KEZ sorar; ekran yalnız sunucunun söylediğini
 * söyler. Tam bir kez sunucudadır (kira): `backend/test/aninda-tahsilat-test.ts`.
 */
describe('Ö · anında ödeme denemesi: yanıt, hata, görünüm', () => {
  const SIMDI = Date.parse('2026-09-26T10:00:00Z');
  const gor = (o: OdemeDenemesi | null) => odemeDenemesiGorunumu(o, SIMDI);

  it('Ö1 sunucu yanıtı doğrulanır; tanınmayan biçim "yapılamadı" — sonuç uydurulmaz', () => {
    for (const sonuc of ['alindi', 'iletildi', 'belirsiz', 'gerekmiyor', 'yapilamadi'] as const) {
      expect(odemeDenemesiOku({ sonuc })).toEqual({ sonuc });
    }
    expect(odemeDenemesiOku({ sonuc: 'reddedildi', mesaj: '  Kart limiti yetersiz ' })).toEqual({
      sonuc: 'reddedildi', mesaj: 'Kart limiti yetersiz',
    });
    expect(odemeDenemesiOku({ sonuc: 'zaten-deneniyor', kiraBitis: '2026-09-26T10:05:00.000Z' })).toEqual({
      sonuc: 'zaten-deneniyor', kiraBitis: '2026-09-26T10:05:00.000Z',
    });
    for (const bozuk of [null, 'alindi', {}, { sonuc: 'ALINDI' }, { sonuc: 'zaten-deneniyor', kiraBitis: 'dün' }]) {
      expect(odemeDenemesiOku(bozuk)).toEqual({ sonuc: 'yapilamadi' });
    }
  });

  it('Ö2 ⭐ istek hatası: yanıt YOKSA çekim olmuş olabilir (bağlantı koptu), yanıt VARSA çekim yok', () => {
    expect(odemeDenemesiHatasi(new Error('timeout of 75000ms exceeded'))).toEqual({ sonuc: 'baglantiKoptu' });
    expect(odemeDenemesiHatasi({ response: { status: 429 } })).toEqual({ sonuc: 'sinir' });
    expect(odemeDenemesiHatasi({ response: { status: 403, data: { kod: 'FIRMA_SAHIBI_GEREKLI' } } })).toEqual({
      sonuc: 'gerekmiyor',
    });
    expect(odemeDenemesiHatasi({ response: { status: 500 } })).toEqual({ sonuc: 'yapilamadi' });
  });

  it('Ö3 ⭐ "alındı" YALNIZ sunucu alındı dediğinde; "iletildi" ödemenin alındığını SÖYLEMEZ', () => {
    expect(gor({ sonuc: 'alindi' })).toMatchObject({ ton: 'basari', metin: KART_METINLERI.odemeAlindi });
    expect(KART_METINLERI.odemeAlindi).toContain('alındı');
    for (const o of [{ sonuc: 'iletildi' }, { sonuc: 'belirsiz' }, { sonuc: 'baglantiKoptu' }] as OdemeDenemesi[]) {
      expect(gor(o).metin).not.toMatch(/ödemeniz[^.]*alındı\./i);
    }
    expect(gor({ sonuc: 'gerekmiyor' })).toMatchObject({ ton: 'basari', metin: KART_METINLERI.guncellendiMetin });
  });

  it('Ö4 ⭐ belirsiz sonuç: çift çekim olmaması için BUGÜN yeniden denenmeyeceği söylenir', () => {
    expect(gor({ sonuc: 'belirsiz' }).metin).toContain('bugün yeniden denenmeyecek');
  });

  it('Ö5 kart reddetti: iyzico iletisi gösterilir, başka kartla "Formu yeniden aç"', () => {
    const g = gor({ sonuc: 'reddedildi', mesaj: 'Kart limiti yetersiz (iyzico kodu: 10051).' });
    expect(g).toMatchObject({ ton: 'hata', baslik: KART_METINLERI.odemeReddedildiBaslik, yenidenAc: true });
    expect(g.metin).toBe(
      `${KART_METINLERI.odemeReddedildi}: Kart limiti yetersiz (iyzico kodu: 10051). ${KART_METINLERI.odemeReddedildiSonu}`,
    );
    expect(gor({ sonuc: 'reddedildi', mesaj: '' }).metin).toBe(
      `${KART_METINLERI.odemeReddedildi}. ${KART_METINLERI.odemeReddedildiSonu}`,
    );
  });

  it('Ö6 kira başkasında: kısa kira (ret sonrası) → "birkaç dakika sonra", uzun kira → "şimdilik denenmeyecek"', () => {
    const kira = (dk: number) => new Date(SIMDI + dk * 60_000).toISOString();
    expect(gor({ sonuc: 'zaten-deneniyor', kiraBitis: kira(10) }).metin).toBe(KART_METINLERI.odemeKisaSureOnce);
    expect(gor({ sonuc: 'zaten-deneniyor', kiraBitis: kira(20 * 60) }).metin).toBe(KART_METINLERI.odemeSonucBekleniyor);
    expect(gor({ sonuc: 'sinir' }).metin).toBe(KART_METINLERI.odemeKisaSureOnce);
  });

  it('Ö7 deneme sürerken (null) bekleme metni; "Formu yeniden aç" yalnız ret sonrası', () => {
    expect(gor(null)).toMatchObject({ ton: 'bilgi', metin: KART_METINLERI.odemeDeneniyor, yenidenAc: false });
    const hepsi: OdemeDenemesi[] = [
      { sonuc: 'alindi' }, { sonuc: 'iletildi' }, { sonuc: 'belirsiz' }, { sonuc: 'gerekmiyor' },
      { sonuc: 'yapilamadi' }, { sonuc: 'sinir' }, { sonuc: 'baglantiKoptu' },
      { sonuc: 'zaten-deneniyor', kiraBitis: new Date(SIMDI).toISOString() },
    ];
    for (const o of hepsi) expect(gor(o).yenidenAc, o.sonuc).toBe(false);
  });

  it('Ö8 erişim yalnız ödeme işlenebilecekken tazelenir (alındı, iletildi, belirsiz, bağlantı koptu)', () => {
    const tazelenen = (['alindi', 'iletildi', 'belirsiz', 'baglantiKoptu'] as const).map((sonuc) => gor({ sonuc }).erisimiTazele);
    expect(tazelenen).toEqual([true, true, true, true]);
    for (const sonuc of ['gerekmiyor', 'yapilamadi', 'sinir'] as const) expect(gor({ sonuc }).erisimiTazele).toBe(false);
  });

  it('Ö9 istemci bekleme süresi sunucunun üç iyzico çağrısından uzun (her biri IYZICO_ZAMAN_ASIMI_MS)', () => {
    const istemci = readFileSync(join(kok, '..', 'backend', 'src', 'ozellik', 'odeme', 'iyzico', 'iyzico.client.ts'), 'utf8');
    const iyzicoMs = Number(istemci.match(/export const IYZICO_ZAMAN_ASIMI_MS = ([\d_]+);/)?.[1].replace(/_/g, ''));
    expect(iyzicoMs).toBeGreaterThan(0);
    expect(ODEME_DENEMESI_ZAMAN_ASIMI_MS).toBeGreaterThan(3 * iyzicoMs);
  });
});

describe('B · sayfa BAĞLANTISI (kaynak, yorumsuz)', () => {
  it('B0 sayfa dosyası VAR (rota /abonelik/kart)', () => {
    expect(existsSync(join(kok, SAYFA))).toBe(true);
  });
  const kod = existsSync(join(kok, SAYFA)) ? yorumsuz(oku(SAYFA)) : '';
  it('B1 sorguyu saf modülle okur (window.location.search)', () => {
    expect(kod).toMatch(/const girdi = kartSayfasiGirdisi\(\s*window\.location\.search\s*\)/);
  });
  it("B2 formu sunucudan ister ve ?a='yı gövdeye koyar", () => {
    expect(kod).toMatch(/api\.post<[^>]*>\(\s*'\/abonelik\/kart-guncelle',\s*kartIstekGovdesi\(girdi\)/);
  });
  it('B3 iyzico formunu IyzicoFormu ile basar (dangerouslySetInnerHTML YOK)', () => {
    expect(kod).toMatch(/<IyzicoFormu html=\{formHtml\}/);
    expect(kod).not.toMatch(/dangerouslySetInnerHTML/);
  });
  it('B4 ret iletisi ve yeniden açma hedefi saf eşlemeden gelir', () => {
    expect(kod).toMatch(/const ret = kartHatasi\(e\);/);
    expect(kod).toMatch(/setRetMetni\(ret\.metin\)/);
    expect(kod).toMatch(/setYenidenAcYolu\(yenidenAcmaAdresi\(girdi, ret\.yenidenAcma\)\)/);
  });
  it('B4b "Formu yeniden aç" YALNIZ hedef varken çizilir ve hedefi elle yazılmaz', () => {
    expect(kod).toMatch(/setYenidenAcYolu\(yenidenAcmaAdresi\(girdi, 'baglantisiz'\)\);\s*setKip\('donusHatasi'\)/);
    expect(kod).toMatch(
      /const formuYenidenAc = odemeGorunumu \? \(odemeGorunumu\.yenidenAc \? '\/abonelik\/kart' : null\) : yenidenAcYolu;/,
    );
    expect(kod).toMatch(/\{formuYenidenAc && \(\s*<a href=\{formuYenidenAc\}/);
    expect(kod).not.toMatch(/href="\/abonelik\/kart/);
  });
  it("B5 ⭐ 'guncellendi' dönüşünde form İSTENMEZ; bekleyen ödeme sunucuya BİR KEZ sorulur ve sonuç saf eşlemeden okunur", () => {
    const dal = kod.match(/if \(girdi\.sonuc === 'guncellendi'\) \{([\s\S]*?)\n {4}\}/)?.[1] ?? '';
    expect(dal).toMatch(/setKip\('guncellendi'\);/);
    expect(dal).toMatch(
      /api\.post\('\/abonelik\/odeme-tekrar-dene', \{\}, \{ timeout: ODEME_DENEMESI_ZAMAN_ASIMI_MS \}\)/,
    );
    expect(dal).toMatch(/setOdeme\(odemeDenemesiOku\(data\)\)/);
    expect(dal).toMatch(/setOdeme\(odemeDenemesiHatasi\(e\)\)/);
    expect(dal).toMatch(/return;\s*$/);
    expect(dal).not.toMatch(/kart-guncelle'/);
  });
  it('B7 ödeme işlenebilecekse erişim (şerit, yetenekler) sınırlı kez tazelenir — karar saf görünümden', () => {
    expect(kod).toMatch(/const tazele = odeme !== null && odemeGorunumu\?\.erisimiTazele === true;/);
    expect(kod).toMatch(/if \(!tazele\) return;/);
    expect(kod).toMatch(/\[15_000, 40_000, 75_000\]\.map\(\(ms\) => setTimeout\(\(\) => void refresh\(\), ms\)\)/);
    expect(kod).toMatch(/return \(\) => zamanlayicilar\.forEach\(clearTimeout\);/);
  });
  it('B6 ⭐ para çeken istek sayfada TEK yerde (dönüş dalı) — form kipi ve hata dalları çekim istemez', () => {
    expect(kod.match(/odeme-tekrar-dene/g) ?? []).toHaveLength(1);
    expect(kod).toMatch(/const odemeGorunumu = kip === 'guncellendi' \? odemeDenemesiGorunumu\(odeme, Date\.now\(\)\) : null;/);
  });
});

describe('K · kapalı / kısıtlı firmada sayfa GÖRÜNÜR', () => {
  // Sunucunun GERÇEK değerleri (`abonelik-erisim.ts`): ASKIDA erişimsiz,
  // KISITLI erişimli ama salt-okunur.
  const karar = (durum: string, erisimVar: boolean, saltOkunur: boolean): ErisimKarari =>
    ({ erisimVar, saltOkunur, durum, uyari: null, kalanGun: null } as unknown as ErisimKarari);
  it('K1 ASKIDA (erişim kapalı) firmada /abonelik/kart içeriği durdurulmaz', () => {
    expect(icerikDurdurulsunMu(karar('ASKIDA', false, false), '/abonelik/kart')).toBe(false);
  });
  it('K1b KISITLI (salt-okunur) firmada da durdurulmaz', () => {
    expect(icerikDurdurulsunMu(karar('KISITLI', true, true), '/abonelik/kart')).toBe(false);
  });
  it('K2 ÖLÇÜT kör değil: aynı ASKIDA kararıyla /quotes durdurulur', () => {
    expect(icerikDurdurulsunMu(karar('ASKIDA', false, false), '/quotes')).toBe(true);
  });
});

describe('Ş · şeridin eylemi kendi sayfasında çizilmez (inceleme L1)', () => {
  it('Ş1 BAĞLANTI: AbonelikSeridi düğmeyi seritEylemiGosterilsinMi(eylem, yol) ile koşullar', () => {
    const serit = yorumsuz(oku('ozellik/odeme/AbonelikSeridi.tsx'));
    expect(serit).toMatch(/\{uyari\.eylem && seritEylemiGosterilsinMi\(uyari\.eylem, yol\) && \(\s*<Link/);
  });
});
