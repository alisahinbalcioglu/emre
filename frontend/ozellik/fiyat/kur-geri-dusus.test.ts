/**
 * KUR-01 — KUR ALINAMAYINCA ÖN YÜZ AYNI KARARI VERİR (para doğruluğu turu, 14.09.2026)
 *
 * NEDEN: backend kur servisi TCMB ve yedek kaynak düşüp önbellek boşken
 * `usdTry = 1` (source 'fallback') döner. Eşleştirme artık dövizli satıra
 * fiyat YAZMIYOR ve `kurAlinamadi: true` ile nedenini söylüyor
 * (backend `test:kur` E-K blokları). Bu dosya ön yüzün iki ayağını ölçer:
 *
 *  1. GÖSTERİM — kayıtlı USD teklif, kur yüklenmeden "$4.735,00" diye TL
 *     tutar gösteriyordu (14.09 ölçüldü: detay sayfası `setCurrency`'yi kur
 *     gelmeden uyguluyor, çarpan 1 kalıyordu). Kur yoksa TL gösterilir.
 *  2. BAĞLANTI — bayrak motor cevabından satır işaretine kadar TAŞINMALI.
 *     `page.tsx` motoru backend sonucunu yeni bir nesneye kopyalıyor; bayrak
 *     orada düşseydi satır kırmızı "yok" boyanır ve kur dönünce taslak geri
 *     yüklemesi onu "cevaplanmış" sayıp yeniden FİYATLAMAZDI.
 *
 * AG Grid ve sayfa bileşenleri bu depoda jsdom olmadan koşulamıyor; bağlantı
 * ayağı KAYNAĞI ölçer (kar-tek-suzgec.test.ts deseni). Ölçütün kendisi de
 * sınanır: desen yorum satırında geçse bile kod değişmediyse yakalanmalı.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { gosterimParaBirimi, donusumCarpani, paraSimgesi, kurKullanilabilir } from './para-gosterim';

const KOK = path.resolve(__dirname, '../..');
const oku = (goreli: string) => fs.readFileSync(path.join(KOK, goreli), 'utf8');

/** Yorumları at: `/* … *\/`, JSX `{/* … *\/}` ve satır yorumları (URL'deki `://` korunur). */
function kodOnly(metin: string): string {
  return metin
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('KUR-01 gösterim: kur yüklenmeden döviz gösterilmez', () => {
  const RATES = { TRY: 47.35, USD: 1, EUR: 47.35 / 54.1 };

  it('kayıtlı USD, kur YÜKLENMEDİ → gösterim TL', () => {
    expect(gosterimParaBirimi('USD', false)).toBe('TRY');
    expect(gosterimParaBirimi('EUR', false)).toBe('TRY');
  });

  it('kur yüklendi → gösterim seçili birime geçer (kayıt değişmez)', () => {
    expect(gosterimParaBirimi('USD', true)).toBe('USD');
    expect(gosterimParaBirimi('EUR', true)).toBe('EUR');
    expect(gosterimParaBirimi('TRY', false)).toBe('TRY');
  });

  it('TL gösterimde çarpan 1 — TL tutar kendi simgesiyle basılır', () => {
    expect(donusumCarpani('TRY', RATES)).toBe(1);
    expect(paraSimgesi(gosterimParaBirimi('USD', false))).toBe('₺');
  });

  it('USD / EUR çarpanı TCMB kurundan (₺4.735 → $100, ₺5.410 → €100)', () => {
    expect(4735 * donusumCarpani('USD', RATES)).toBeCloseTo(100, 10);
    expect(5410 * donusumCarpani('EUR', RATES)).toBeCloseTo(100, 10);
  });
});

describe('C10 bayat kur: backend "geçersiz" derse ekran da kuru kullanmaz (ekran = dosya)', () => {
  // Backend `kurGecerli` 5 iş gününden eski kuru geçersiz sayar: eşleştirme döviz
  // satırına fiyat yazmaz, teklif çıktısı TL iner. Ekran aynı yanıtın `gecerli`
  // alanını okumazsa bayat kurla "$" gösterirdi (inceleme P4a M1).
  const KUR = { usdTry: 47.35, eurTry: 54.1 };

  it('gecerli: false → kullanılmaz (kur > 1 olsa da)', () => {
    expect(kurKullanilabilir({ ...KUR, gecerli: false })).toBe(false);
  });

  it('gecerli: true ya da alan YOK (eski backend) → kur > 1 ise kullanılır', () => {
    expect(kurKullanilabilir({ ...KUR, gecerli: true })).toBe(true);
    expect(kurKullanilabilir({ ...KUR })).toBe(true);
  });

  it('KUR-01 korunur: 1:1 geri düşüş, eksik EUR ya da boş yanıt → kullanılmaz', () => {
    expect(kurKullanilabilir({ usdTry: 1, eurTry: 1 })).toBe(false);
    // Her kur KENDİ sınırında ölçülür (diğeri geçerli) — "> 0" ya da koşulun
    // silinmesi ancak böyle yakalanır (yeniden inceleme P4a L2).
    expect(kurKullanilabilir({ usdTry: 1, eurTry: 54.1 })).toBe(false);
    expect(kurKullanilabilir({ usdTry: 47.35, eurTry: 1 })).toBe(false);
    expect(kurKullanilabilir({ eurTry: 54.1 })).toBe(false);
    expect(kurKullanilabilir({ usdTry: 47.35, eurTry: 0 })).toBe(false);
    expect(kurKullanilabilir(null)).toBe(false);
    expect(kurKullanilabilir(undefined)).toBe(false);
  });
});

describe('KUR-01 bağlantı: bayrak motordan satır işaretine kadar taşınır', () => {
  const excelGrid = kodOnly(oku('ozellik/tablo/excel-grid/ExcelGrid.tsx'));
  const yeniTeklif = kodOnly(oku('app/(protected)/quotes/new/page.tsx'));
  const detay = kodOnly(oku('app/(protected)/quotes/[id]/page.tsx'));
  const kanca = kodOnly(oku('ozellik/fiyat/use-currency.ts'));

  it('ExcelGrid malzeme dalı: kurAlinamadi → _matStatus "hata"', () => {
    // ⚠ ARAÇ DEĞİŞTİ (29.09), BAĞLANTI AYNI: işaret artık `yazVeri` ile
    // yazılır. Eski `setDataValue`, grid KOLONU olmayan `_matStatus` için
    // çağrıyı SESSİZCE düşürüyordu — turuncu 'hata' işareti ekrana hiç
    // gelmiyordu (e2e `isaret-yazimi.spec.ts` IY1 ile ölçüldü; düzeltmeden
    // önce kırmızıydı). İşçilik ikizi (aşağıda) zaten `yazVeriLab`
    // kullanıyordu; geride kalan malzeme dalıydı. Kapının ölçtüğü şey
    // KURALIN TAŞINMASI: motordan gelen bayrak → satırda 'hata'.
    expect(excelGrid).toMatch(/yazVeri\(node, '_matStatus',[^\n]*kurAlinamadi \? 'hata' : 'yok'/);
  });

  it('ExcelGrid işçilik dalı (ikiz): kurAlinamadi → _labStatus "hata"', () => {
    expect(excelGrid).toMatch(/yazVeriLab\(node, '_labStatus',[^\n]*kurAlinamadi \? 'hata' : 'yok'/);
  });

  it('quotes/new motorları bayrağı DÜŞÜRMEZ: malzeme ve işçilik yolu kurAlinamadi taşır', () => {
    const tasiyan = yeniTeklif.match(/if \(match\.kurAlinamadi\)[\s\S]{0,260}?return \{ netPrice: 0, kurAlinamadi: true/g) ?? [];
    expect(tasiyan.length).toBe(2);
  });

  it('iki teklif sayfası da simgeyi GÖSTERİM biriminden alır (kayıtlı birimden değil)', () => {
    for (const [ad, kaynak] of [['new', yeniTeklif], ['[id]', detay]] as const) {
      expect(kaynak, `${ad}: simge gösterim biriminden gelmeli`).toMatch(/currencySymbol=\{paraSimgesi\(gosterimCurrency\)\}/);
      expect(kaynak, `${ad}: kayıtlı birimle kurulan eski simge üçlüsü kalmamalı`).not.toMatch(/currencySymbol=\{currency === 'USD'/);
    }
  });

  it('kanca: çarpan ve fiyat metni gösterim biriminden türer', () => {
    expect(kanca).toMatch(/donusumCarpani\(gosterimCurrency, exchangeRates\)/);
    expect(kanca).toMatch(/formatPrice\(valueTRY \* conversionRate, gosterimCurrency\)/);
  });

  it('C10 BAĞLANTI: kanca ve üst çubuk kur kutusu AYNI kuralı çağırır; ayrı kur eşiği kalmadı', () => {
    const ustCubuk = kodOnly(oku('app/(protected)/layout.tsx'));
    for (const [ad, kaynak] of [['use-currency', kanca], ['layout', ustCubuk]] as const) {
      expect(kaynak, `${ad}: kurKullanilabilir(data) çağrılmalı`).toMatch(/kurKullanilabilir\(data\)/);
      expect(kaynak, `${ad}: kendi "usdTry > 1" eşiği kalmamalı`).not.toMatch(/usdTry\s*(?:>|<=)\s*1\b/);
    }
  });

  it('ÖLÇÜTÜN KENDİSİ: desen yalnız YORUMDA geçerse kapı yakalar (yorum kanıt değildir)', () => {
    const sahte = "// yazVeri(node, '_matStatus', r?.kurAlinamadi ? 'hata' : 'yok')\nyazVeri(node, '_matStatus', 'yok');";
    expect(kodOnly(sahte)).not.toMatch(/kurAlinamadi \? 'hata' : 'yok'/);
  });
});
