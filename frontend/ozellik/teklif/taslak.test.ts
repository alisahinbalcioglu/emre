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
import { kayittanTaslak, TASLAK_SURUMU, TASLAK_ANAHTARI } from './taslak';

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
