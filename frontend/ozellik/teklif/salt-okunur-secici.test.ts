/**
 * D9 + Y1 (30.09, P1) — KAYITLI TEKLİF DETAYINDA MARKA/FİRMA SEÇİCİSİ ETKİN
 *
 * `quotes/[id]` kaydedilmiş teklifi GÖRÜNTÜLEME sayfasıdır; kullanıcı oraya
 * bakmak için girer. Ama satırların Marka ve İşç. Firma hücreleri gerçek
 * açılır listeydi ve seçim satır nesnesini DEĞİŞTİRİYORDU:
 *
 *   MALZEME: `onBrandChange={SALT_OKUNUR_MARKA}` (null dönen stub) veriliyor.
 *     `handleChange` önce `_marka`yı YAZIYOR, sonra stub'ı çağırıyor; null
 *     dönünce "bu markada yok" dalına düşüyor → fiyat SİLİNİYOR, satır
 *     kırmızıya boyanıyor. Yıkıcı ama GÖRÜNÜR.
 *
 *   İŞÇİLİK (Y1 — daha kötü): `onFirmaChange` HİÇ verilmiyor. `handleChange`
 *     önce `_firma`yı yazıyor, sonra `if (!currentName || !onFirmaChange)
 *     return;` ile çıkıyor. Firma B görünür, fiyat A'nınki KALIR. Hiçbir
 *     işaret yok — SESSİZ DOLU (SD2'nin "sessiz boş" yasağının tersi).
 *     `laborEnabled` Pro kullanıcıda true geçtiği için liste gerçekten açılır.
 *
 * ÇÖZÜM: sayfa niyetini AÇIKÇA bildirir (`seciciSaltOkunur`), ExcelGrid de
 * hücreyi düz etiket çizer — "özelliği açmak = yolu açmaktır" kuralının tersi:
 * tıklanamayan hücre seçim üretmez. Üstüne savunma katmanı olarak iki
 * `handleChange` da bayrağı satıra DOKUNMADAN ÖNCE kontrol eder.
 *
 * ── BU DOSYA NEYİ ÖLÇER ─────────────────────────────────────────────────────
 * BAĞLANTIYI. Mekanizmayı (tıklanınca ne oluyor) `test/e2e/salt-okunur-secici
 * .spec.ts` gerçek tarayıcıda ölçer. İkisi ayrı: "mekanizma var, bağlantı yok"
 * dersi — doğru yazılmış bir ExcelGrid, sayfa bayrağı geçirmezse işe yaramaz.
 * ExcelGrid jsdom'suz koşulamadığı için kaynak kapısı bu bağlantının
 * ölçülebilir tek yeridir.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KOK = join(__dirname, '..', '..');
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

const EXCEL_GRID = 'ozellik/tablo/excel-grid/ExcelGrid.tsx';
const DETAY_SAYFA = 'app/(protected)/quotes/[id]/page.tsx';
const DUZENLEME_SAYFA = 'app/(protected)/quotes/new/page.tsx';

/** Yorumları soyar: yorumda geçen ibare KODU ölçmez (kapı-ibaresi dersi). */
const kodu = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

/** `baslangic` ibaresinden sonraki `n` karakter — fonksiyon gövdesi dilimi. */
function dilim(src: string, baslangic: string, n = 900): string {
  const i = src.indexOf(baslangic);
  expect(i, `kod çapası bulunamadı: ${baslangic}`).toBeGreaterThan(-1);
  return src.slice(i, i + n);
}

describe('D9 — kayıtlı teklif detayı seçiciyi SALT OKUNUR geçirir (bağlantı)', () => {
  it('★ detay sayfası ExcelGrid\'e `seciciSaltOkunur` geçirir', () => {
    // Bu assert olmadan ExcelGrid doğru yazılsa bile kusur CANLIDA kalır.
    expect(kodu(oku(DETAY_SAYFA))).toMatch(/seciciSaltOkunur/);
  });

  it('★ KONTROL GRUBU: düzenleme sayfası (quotes/new) GEÇİRMEZ', () => {
    // Bayrak yanlışlıkla düzenleme sayfasına da konsaydı kullanıcı teklif
    // hazırlarken marka seçemezdi — ürünün ana işi dururdu.
    expect(kodu(oku(DUZENLEME_SAYFA))).not.toMatch(/seciciSaltOkunur/);
  });

  it('ExcelGrid bu prop\'u tanır', () => {
    expect(kodu(oku(EXCEL_GRID))).toMatch(/seciciSaltOkunur\?: boolean/);
  });
});

describe('D9 + Y1 — iki dal da satıra DOKUNMADAN ÖNCE kapıyı geçer (ikiz)', () => {
  const src = kodu(oku(EXCEL_GRID));

  it('★ MALZEME: kapı `_marka` yazımından ÖNCE gelir', () => {
    const govde = dilim(src, 'const handleChange = async (brandId: string) => {');
    const kapi = govde.indexOf('seciciSaltOkunur');
    const yazim = govde.indexOf("setDataValue('_marka'");
    expect(kapi, 'kapı yok').toBeGreaterThan(-1);
    expect(yazim, 'yazım çapası yok').toBeGreaterThan(-1);
    expect(kapi, 'kapı yazımdan SONRA — satır zaten değişmiş olur').toBeLessThan(yazim);
  });

  it('★ İŞÇİLİK İKİZİ: kapı `_firma` yazımından ÖNCE gelir', () => {
    const govde = dilim(src, 'const handleChange = async (firmaId: string) => {');
    const kapi = govde.indexOf('seciciSaltOkunur');
    const yazim = govde.indexOf("setDataValue('_firma'");
    expect(kapi, 'kapı yok').toBeGreaterThan(-1);
    expect(yazim, 'yazım çapası yok').toBeGreaterThan(-1);
    expect(kapi, 'kapı yazımdan SONRA — firma değişir, eski fiyat kalır').toBeLessThan(yazim);
  });
});

describe('D9 + Y1 — bayrak açıkken hücre AÇILIR LİSTE çizmez (ikiz)', () => {
  const src = kodu(oku(EXCEL_GRID));

  it('★ MALZEME renderer bayrağı okur', () => {
    // `_ozet`/`_fitting` satırlarında zaten düz etiket çiziliyor; aynı desen.
    expect(dilim(src, "if (c.cellRenderer === 'brandRenderer') {", 1800)).toMatch(/seciciSaltOkunur/);
  });

  it('★ İŞÇİLİK renderer bayrağı okur', () => {
    expect(dilim(src, "} else if (c.cellRenderer === 'firmaRenderer') {", 1800)).toMatch(/seciciSaltOkunur/);
  });

  it('bayrak kolon tanımı bağımlılığında — yoksa hiç uygulanmaz', () => {
    // useMemo bağımlılığı unutulursa bayrak değişse bile kolonlar yeniden
    // kurulmaz (sessiz ölü kod sınıfı).
    const i = src.lastIndexOf('seciciSaltOkunur');
    expect(i, 'prop hiç kullanılmamış').toBeGreaterThan(-1);
    expect(src.slice(i).slice(0, 4000)).toMatch(/seciciSaltOkunur[\s\S]{0,4000}\]\)/);
  });
});
