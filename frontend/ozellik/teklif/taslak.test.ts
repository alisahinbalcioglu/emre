/**
 * KAYITTAN TASLAK — revizyon yolunun sozlesmesi (14.08).
 *
 * ★ Kullanici bildirimi: "teklifi revize etmek istiyorum ancak bu kisimda
 * herhangi bir islem yapilamiyor." Kayitli teklifi Duzenle ekraninda acan yol
 * HIC YOKTU. Bu donusturucu o yolun tek kapisi; bozulursa kullanici ya bos bir
 * ekran gorur ya da FARKINDA OLMADAN teklifin KOPYASINI olusturur.
 *
 * ⚠ BIR ASSERT TEK KRITERE (proje kurali).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kayittanTaslak, TASLAK_SURUMU, TASLAK_ANAHTARI, taslakUyarisiGerekirMi, TASLAK_YAZILAMADI_UYARISI } from './taslak';

const KAYIT = {
  id: 'q-1',
  title: 'Bahçeçicler Mobilya Metraj',
  sheets: [
    {
      name: 'Sayfa1', index: 0, isEmpty: false, discipline: 'mechanical',
      rowData: [{ _isDataRow: true, ad: 'DN 20' }],
      columnRoles: { nameField: 'ad' },
      columnConfig: { hidden: ['_iscKar'], widths: { ad: 240 }, floors: ['K1'] },
    },
    { name: 'Sayfa2', index: 1, isEmpty: true, rowData: [] },
  ],
};

describe('kayittanTaslak', () => {
  // ⚠ EN KRITIK KRITER: kimlik tasinmazsa "Teklifi Kaydet" YENI kayit acar ve
  // kullanici revize ettigini sanirken teklif listesi kopyalarla dolar.
  it('quoteId tasir — revizyon KOPYA olmaz', () => {
    expect(kayittanTaslak(KAYIT, []).quoteId).toBe('q-1');
  });

  it('surum ORTAK sabitten gelir (uyusmayan taslak Duzenle ekraninda atilir)', () => {
    expect(kayittanTaslak(KAYIT, []).v).toBe(TASLAK_SURUMU);
  });

  // ⚠ Marka listesi bos gecilirse kullanici kendi sectigi markalari
  // "Marka sec..." gorur ve secimlerinin gittigini sanir — C4 kusurunun (11.08)
  // birebir tekrari.
  it('allBrands taslaga KONUR (marka etiketleri cozulebilsin)', () => {
    const markalar = [{ id: 'b1', name: 'TRAKYA DÖKÜM' }];
    expect(kayittanTaslak(KAYIT, markalar).allBrands).toEqual(markalar);
  });

  // ⚠ Bos sayfa ELENMEZ: Duzenle ekrani sayfa tercihlerini `index` uzerinden
  // kurar. Filtrelenseydi kayitli index'ler ile dizi konumlari ayrisir ve
  // kolon genislikleri YANLIS sayfaya uygulanirdi.
  it('bos sayfa ELENMEZ (index hizasi korunur)', () => {
    expect(kayittanTaslak(KAYIT, []).multiSheet.sheets).toHaveLength(2);
  });

  it('ilk DOLU sayfa acilir (bos sayfayla baslamaz)', () => {
    const bosIlk = { ...KAYIT, sheets: [{ index: 0, isEmpty: true }, { index: 1, isEmpty: false }] };
    expect(kayittanTaslak(bosIlk, []).activeSheetIndex).toBe(1);
  });

  it('gizli sutun tercihi sayfa index ile tasinir', () => {
    expect(kayittanTaslak(KAYIT, []).colHiddenBySheet[0]).toEqual(['_iscKar']);
  });

  it('kolon genislikleri sayfa index ile tasinir', () => {
    expect(kayittanTaslak(KAYIT, []).colWidthsBySheet[0]).toEqual({ ad: 240 });
  });

  it('disiplin sayfa index ile tasinir', () => {
    expect(kayittanTaslak(KAYIT, []).sheetDisciplines[0]).toBe('mechanical');
  });

  // ⚠ Eski kayitlarda `index` alani olmayabilir — dizi konumuna DUSULUR.
  // Duselmeseydi `undefined` anahtarli tercihler olusur ve hicbir sayfaya
  // uygulanmazdi (sessiz kayip).
  it('index yoksa dizi konumuna duser', () => {
    const indexsiz = { id: 'q-2', title: 'X', sheets: [{ isEmpty: false, columnConfig: { hidden: ['a'] } }] };
    expect(kayittanTaslak(indexsiz, []).colHiddenBySheet[0]).toEqual(['a']);
  });

  it('sheets yoksa cokmez (bos taslak uretir)', () => {
    expect(kayittanTaslak({ id: 'q-3' }, []).multiSheet.sheets).toEqual([]);
  });

  // Anahtar Duzenle ekraninin okudugu anahtarla AYNI olmali — iki taraf
  // farkli anahtar kullansaydi taslak yazilir ama HIC okunmazdi.
  it('taslak anahtari sabit ve tek kaynakta', () => {
    expect(TASLAK_ANAHTARI).toBe('metaprice_quote_draft');
  });
});

describe('TASLAK YAZILAMAZSA (Emre karari 02.10) — kural', () => {
  it('★ ilk basarisiz yazim uyarir (onceki durum yok)', () => {
    expect(taslakUyarisiGerekirMi(null, 'yazilamadi')).toBe(true);
  });
  it('★ yazildi → yazilamadi gecisi uyarir', () => {
    expect(taslakUyarisiGerekirMi('yazildi', 'yazilamadi')).toBe(true);
  });
  it('★★ art arda basarisiz yazim TEKRAR uyarmaz (tost seli yok)', () => {
    expect(taslakUyarisiGerekirMi('yazilamadi', 'yazilamadi')).toBe(false);
  });
  it('basarili yazim hic uyarmaz', () => {
    expect(taslakUyarisiGerekirMi(null, 'yazildi')).toBe(false);
    expect(taslakUyarisiGerekirMi('yazilamadi', 'yazildi')).toBe(false);
  });
  it('uyari metni tek kaynakta', () => {
    expect(TASLAK_YAZILAMADI_UYARISI.title).toBe('Taslak kaydedilemedi');
  });
});

describe('TASLAK YAZILAMAZSA — BAGLANTI (quotes/new)', () => {
  // Yorumlar soyulur: yorumdaki ibare kodu olcmez (kapi-ibaresi dersi).
  const sayfa = readFileSync(join(__dirname, '..', '..', 'app', '(protected)', 'quotes', 'new', 'page.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
  const bas = sayfa.indexOf('sessionStorage.setItem(DRAFT_KEY');
  const c = sayfa.indexOf('catch (e)', bas);
  const yakala = c > bas && bas >= 0 ? sayfa.slice(c, sayfa.indexOf('};', c)) : '';

  it('★★ catch dali taslagi SILMEZ', () => {
    expect(yakala.length, 'taslak yazim catch dali bulunamadi').toBeGreaterThan(0);
    expect(yakala).not.toMatch(/removeItem\(DRAFT_KEY\)/);
  });
  it('★ catch dali uyariyi KURALDAN gecirerek gosterir', () => {
    expect(yakala).toMatch(/taslakUyarisiGerekirMi\(/);
    expect(yakala).toMatch(/TASLAK_YAZILAMADI_UYARISI/);
  });
});

// ══ F6b (06.10): "Revize Et" zinciri karisik SAYFA ISARETINI tasir ══
// Fiyatsiz kaydedilmis yeni karisik teklifte kip YALNIZ sayfa isaretindedir
// (`paraKipi: 'karisik'`); detay sayfasi taslagi ceviri gorunumunden gecen
// sayfalarla kurar. Isaret dusseydi revizyon TL acilir, $ fiyat ₺ olurdu.
import { ingilizceGorunum, turkceGorunum } from './ceviri';
import { karisikKipMi } from '../fiyat/taraf-para-birimi';

describe('F6b — kayittan taslak karisik sayfa isaretini korur', () => {
  const sayfa = { name: 'Mekanik', index: 0, isEmpty: false, paraKipi: 'karisik', columnRoles: { nameField: 'ad' },
    rowData: [{ _rowIdx: 0, _isDataRow: true, ad: 'Vana' }] };
  it('★★ kayittanTaslak isareti tasir; taslagin sayfalari karisik sayilir', () => {
    const t = kayittanTaslak({ id: 'q1', sheets: [sayfa] }, []);
    expect((t.multiSheet.sheets[0] as any).paraKipi).toBe('karisik');
    expect(karisikKipMi(t.multiSheet.sheets as any)).toBe(true);
  });
  it('★ detay sayfasinin ceviri gorunumlerinden (TR / EN) gecen sayfa da tasir', () => {
    const tr = turkceGorunum([sayfa] as any);
    const en = ingilizceGorunum([sayfa] as any, {} as any).sayfalar;
    for (const g of [tr, en]) {
      const t = kayittanTaslak({ id: 'q1', sheets: g as any[] }, []);
      expect((t.multiSheet.sheets[0] as any).paraKipi).toBe('karisik');
    }
  });
});
