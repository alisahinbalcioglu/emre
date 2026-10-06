/**
 * COKLU PARA BIRIMI F2 — BAGLANTI: teklif sayfasinin eslestirme sarmalayicilari
 * motorun `kaynakFiyat`ini izgaraya TASIR.
 *
 * Sarmalayicilar tek-eslesme donusunu ELLE kuruyor (alan alan); `kaynakKur`
 * eklenirken unutulsaydi oldugu gibi `kaynakFiyat` da dusurulurdu ve karisik
 * kip (F6'da uretimde acilinca) dovizli kalemi SESSIZCE ₺ yazardi — izgara
 * kaynak fiyati goremeyince TL nete duser. Aday ve oneri listeleri ham gecer.
 * ("mekanizma var, baglanti yok" dersi; yorumlar soyulur.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sayfa = readFileSync(join(__dirname, '..', '..', 'app', '(protected)', 'quotes', 'new', 'page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

describe('kaynakFiyat sarmalayicidan izgaraya tasinir', () => {
  it('★★ kur tasiyan HER tek-eslesme donusu kaynak fiyati da tasir (malzeme + iscilik)', () => {
    const kurlu = sayfa.split('\n').filter((l) => /return \{ netPrice,.*kaynakKur:/.test(l));
    expect(kurlu.length, 'tek-eslesme donusleri bulunamadi').toBeGreaterThanOrEqual(2);
    for (const l of kurlu) expect(l).toMatch(/kaynakFiyat: \(match as any\)\.kaynakFiyat/);
  });
});

// ── F4 (05.10): kip KAYITTAN turetilir, kayit ve geri yukleme kipi tasir ──────
const detay = readFileSync(join(__dirname, '..', '..', 'app', '(protected)', 'quotes', '[id]', 'page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

describe('F4 BAGLANTI — karisik kip sayfalara ve kayda ulasir', () => {
  it('★★ duzenleme sayfasi izgaraya kayittan turetilen kipi verir', () => {
    expect(sayfa).toMatch(/karisikKipMi\(/);
    expect(sayfa).toMatch(/paraBirimiKipi=\{karisikKip \? 'karisik' : 'tl'\}/);
  });
  it('★★ kayit kalemleri karisik kipte TL karsiligi secenegiyle uretilir', () => {
    expect(sayfa).toMatch(/kalemUret\(r, roles as any, karisikKip \? \{ tlKuru: tlKurlari \} : undefined\)/);
  });
  it('★ taslak geri yuklemesi karisik kipi iletir', () => {
    // F6b: taslagin kendi kip alani da (fiyatlanmamis yeni karisik taslak)
    expect(sayfa).toMatch(/restoreRematch\([\s\S]{0,500}?\{ karisik: draft\.paraKipi === KARISIK_PARA_KIPI\s*\|\| karisikKipMi\(/);
  });
  it('★★ goruntuleme sayfasi da kipi kayittan turetir', () => {
    expect(detay).toMatch(/paraBirimiKipi=\{karisikKipMi\(sheets\) \? 'karisik' : 'tl'\}/);
  });
});

// ── F6a (06.10): gorunum teklif genelinde tek duzen — baska sayfanin dovizi izgaraya ulasir ──
describe('F6a BAGLANTI — baska sayfadaki doviz izgaraya gecer (iki sayfa)', () => {
  it('★★ duzenleme sayfasi: aktif sayfanin KENDI index alaniyla, canli satirlarla hesaplar ve gecirir', () => {
    expect(sayfa).toMatch(/karisikKip && multiSheet\?\.sheets[\s\S]{0,80}digerSayfalardaDovizVar\(multiSheet\.sheets, multiSheet\.sheets\[activeSheetIndex\]\?\.index \?\? -1, liveRowDataBySheet\)/);
    expect(sayfa).toMatch(/digerSayfalardaDoviz=\{digerSayfalardaDoviz\}/);
  });
  it('★★ goruntuleme sayfasi (ikiz) da gecirir', () => {
    expect(detay).toMatch(/karisikKipMi\(sheets\)[\s\S]{0,40}digerSayfalardaDovizVar\(sheets\.map\(\(s: any, i: number\) => \(\{ index: i, rowData: s\.rowData \}\)\), activeSheetIndex\)/);
    expect(detay).toMatch(/digerSayfalardaDoviz=\{digerSayfaDovizDetay\}/);
  });
});

// ── F6b (06.10): yeni teklif karisik YAZIM kipinde acilir; kip taslakta ve kayitta tasinir ──
const izgara = readFileSync(join(__dirname, '..', 'tablo', 'excel-grid', 'ExcelGrid.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

describe('F6b BAGLANTI — kip, taslak, kayit, kur eksik, yapistirma', () => {
  it('★★ yeni teklif varsayilani karisik; kip = acik durum YA DA kayittan turetilen', () => {
    expect(sayfa).toMatch(/useState<'karisik' \| 'tl'>\(KARISIK_PARA_KIPI\)/);
    expect(sayfa).toMatch(/paraKipiAcik === KARISIK_PARA_KIPI\s*\|\| karisikKipMi\(multiSheet\?\.sheets\.map\(\(s\) => \(\{ paraKipi: \(s as any\)\.paraKipi,/);
  });
  it('★★ taslak kipi YAZAR ve geri yuklerken OKUR (alan yoksa kayitli sayfalardan)', () => {
    expect(sayfa).toMatch(/paraKipi: karisikKip \? KARISIK_PARA_KIPI : 'tl',/);
    expect(sayfa).toMatch(/setParaKipiAcik\(draft\.paraKipi === KARISIK_PARA_KIPI \|\| draft\.paraKipi === 'tl'[\s\S]{0,120}karisikKipMi\(draft\.multiSheet\.sheets\)/);
  });
  it('★★ kayit yuku sayfaya isaret yazar YALNIZ karisikta (TL yuku degismez)', () => {
    expect(sayfa).toMatch(/\.\.\.\(karisikKip \? \{ paraKipi: KARISIK_PARA_KIPI \} : \{\}\),/);
  });
  it('★★ kur eksik dovizli kalem fiyatsiz uyarisina GIRMEZ, ayri uyari sayilir', () => {
    expect(sayfa).toMatch(/const kurEksik = karisikKip \? kurEksikTarafSayisi\(r, roles as any, tlKurlari\) : 0;\s*if \(kurEksik > 0\) kurEksikKalem\+\+;\s*else if \(uyariyaGirerMi\(r\)\) uyariAdaylari\.push\(kalem\);/);
    expect(sayfa).toMatch(/const kurNotu = kurEksikKalem > 0[\s\S]{0,800}\+ kurNotu,/);
  });
  it('★ eslesme balonu karisikta tutari KAYNAK biriminde gosterir (malzeme + iscilik, otomatik dahil)', () => {
    expect((sayfa.match(/fiyatBalonu\(netPrice, \(match as any\)\.kaynakFiyat\)/g) ?? []).length).toBe(4);
    expect(sayfa).toMatch(/balonTutari\(netPrice, kaynakFiyat, karisikKipRef\.current, displayPrice\)/);
  });
  it('★ izgara: isaretli fiyat TEK kurala bagli (kendi birimleri kur 1 iken) — yazim + yapistirma; kanal elle yazimla ayni', () => {
    // W1: cevrilmis TL gorunumunde ("$12,50" = ₺500) isaret birim SECMEZ
    expect(izgara).toMatch(/const isaretliFiyatKabul = useCallback\(\s*\(\) => karisik && \(birimBasinaGorunum\(\) \|\| kurOraniRef\.current === 1\)/);
    expect(izgara).toMatch(/const karisikYapistirma = isaretliFiyatKabul\(\);[\s\S]{0,120}const dovizIsareti = karisikYapistirma \? null : \/\[\$€\]\/\.exec\(text\);/);
    expect(izgara).toMatch(/planYapistir\(text, kolonlar, basKolonField, satirlar, hedefSatirSayisi, hedefKolonSayisi, \{ karisik: karisikYapistirma \}\)/);
    // W2: HUCRE BASINA kanal (olay eszamansiz); olay sonunda girdi her durumda silinir
    expect(izgara).toMatch(/const elleBirimRef = useRef<Map<string, ParaBirimi>>\(new Map\(\)\);/);
    expect(izgara).toMatch(/if \(yazilacak !== String\(n\.data\?\.\[h\.field\] \?\? ''\)\) elleBirimiKoy\(n, h\.field, h\.pb\);\s*n\.setDataValue\(h\.field, yazilacak, 'edit'\);/);
    expect(izgara).toMatch(/try \{ handleCellValueChangedIc\(e\); \} finally \{ elleBirimRef\.current\.delete\(elleBirimAnahtari\(e\.node, e\.colDef\?\.field\)\); \}/);
    expect(izgara).toMatch(/const pb = isaretliFiyatKabul\(\) \? elleGirilenPB\(ham\) : null;\s*elleBirimiKoy\(p\.node, c\.field, pb\);/);
    expect(izgara).toMatch(/onCellEditingStopped=\{duzenlemeBitti\}/);
  });
});
