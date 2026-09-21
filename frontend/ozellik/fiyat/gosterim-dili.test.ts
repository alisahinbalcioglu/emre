/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GÖRÜNÜR KUSURLAR TURU — G2 · t.4 (para sütunu genişliği) + t.5 (sayı dili)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * KAPATILAN İKİ VAKA (21.09.2026, 1920 px'te ölçüldü):
 *  t.4 — teklif detayında para hücreleri kırpılıyordu (`₺9.568.938,…`);
 *        sığan tek sayı en kısası olan `₺7.366.828,10` idi. Sütun başlıkları
 *        da kesikti (`Malz. Birim …`).
 *  t.5 — aynı satırda Miktar `220227,39` (ayraçsız) · Para `₺9.568.938,40`
 *        (ayraçlı): iki sütun iki ayrı sayı dili konuşuyordu.
 *
 * Bu dosya SAF kuralları kilitler. Izgara BAĞLANTISI (hangi hücre hangi
 * fonksiyonu çağırıyor) ayrı bir kaynak kapısındadır:
 * `ozellik/tablo/excel-grid/gosterim-baglantisi.test.ts` — "mekanizma var,
 * bağlantı yok" tuzağı bu iki dosyanın birlikte durmasıyla kapanır.
 */
import { describe, expect, it } from 'vitest';
import {
  BASLIK_EN_COK, BASLIK_KERNING_PAYI, BASLIK_KROMU, GLIF, HUCRE_KROMU, PARA_SUTUN_EN_AZ,
  baslikMetniGenisligi, baslikSutunuEnAz, paraMetniGenisligi, paraSutunGenisligi,
  paraSutunuEnAz, sutunGenisligi,
} from './para-sutun-genisligi';
import { hucreGosterimMetni, miktarGosterimMetni, sayiOku, trSayi } from './sayi-alani';
import { paraBicim } from './pricing';

// ════════════════════════════════════════════════════════════════════════════
// t.5 — TEK SAYI DİLİ
// ════════════════════════════════════════════════════════════════════════════
describe('t.5 · TR sayı dili tek kaynaktan (trSayi)', () => {
  it('binlik NOKTA, ondalık VİRGÜL', () => {
    expect(trSayi(220227.39)).toBe('220.227,39');
    expect(trSayi(1234567.89)).toBe('1.234.567,89');
  });

  it('para ve miktar AYNI biçimlendiriciden geçer — ayraç kuralı ayrışamaz', () => {
    // Para 2 hane sabit, miktar yazıldığı kadar; GRUPLAMA ikisinde de aynı.
    expect(paraBicim(9568938.4, 1)).toBe('9.568.938,40');
    expect(miktarGosterimMetni('9568938.4')).toBe('9.568.938,4');
    const ayrac = (s: string) => s.replace(/[\d,]/g, '');
    expect(ayrac(paraBicim(9568938.4, 1))).toBe(ayrac(miktarGosterimMetni('9568938.4')));
  });
});

describe('t.5 · miktarGosterimMetni — saf kural', () => {
  it('sıfır', () => {
    expect(miktarGosterimMetni(0)).toBe('0');
    expect(miktarGosterimMetni('0')).toBe('0');
  });

  it('negatif — işaret korunur (kelepçe YOK, gösterim gerçeği gizlemez)', () => {
    expect(miktarGosterimMetni(-1250.5)).toBe('-1.250,5');
  });

  it('dört haneden küçük: ayraç YOK', () => {
    expect(miktarGosterimMetni(3)).toBe('3');
    expect(miktarGosterimMetni('999')).toBe('999');
    expect(miktarGosterimMetni('12,5')).toBe('12,5');
  });

  it('dokuz haneli', () => {
    expect(miktarGosterimMetni(123456789)).toBe('123.456.789');
    expect(miktarGosterimMetni('123456789,25')).toBe('123.456.789,25');
  });

  it('ondalıksız değer ondalık UYDURMAZ', () => {
    expect(miktarGosterimMetni(1250)).toBe('1.250');
    expect(miktarGosterimMetni('13713')).toBe('13.713');
  });

  it('çok ondalıklı değer YUVARLANMAZ (toLocaleString varsayılanı 3 hanede keser)', () => {
    expect(miktarGosterimMetni(3123.6449)).toBe('3.123,6449');
    expect(miktarGosterimMetni('0,123456')).toBe('0,123456');
  });

  it('makine metnindeki nokta ondalıktır — 1000 kat hatası yok', () => {
    // sayi-alani MAKİNE sınırı: "12.375" sistemin yazdığı ondalıktır.
    expect(sayiOku('12.375')).toBe(12.375);
    expect(miktarGosterimMetni('12.375')).toBe('12,375');
  });

  it('sayı OLMAYAN hücre aynen geçer (fitting oranı, eski serbest metin)', () => {
    expect(miktarGosterimMetni('%35')).toBe('%35');
    expect(miktarGosterimMetni('35x240mm kanal')).toBe('35x240mm kanal');
    expect(miktarGosterimMetni('')).toBe('');
    expect(miktarGosterimMetni(null)).toBe('');
  });
});

describe('t.5 · GİRDİ yolu değişmedi — ayraç DAYATILMAZ', () => {
  it('kullanıcı "13713,01" da "13.713,01" da yazabilir (insan kuralı dokunulmadı)', async () => {
    const { insanSayiOku } = await import('./sayi-alani');
    expect(insanSayiOku('13713,01', 'miktar')).toEqual({ tur: 'sayi', deger: 13713.01 });
    expect(insanSayiOku('13.713,01', 'miktar')).toEqual({ tur: 'sayi', deger: 13713.01 });
  });

  it('PANO metni GRUPLAMASIZ kalır — "1.250" yapıştırmada belirsiz olurdu', async () => {
    const { insanSayiOku } = await import('./sayi-alani');
    // Ekranda gruplı, panoda gruplamasız: iki metin AYRI fonksiyondan gelir.
    expect(miktarGosterimMetni(1250)).toBe('1.250');
    expect(hucreGosterimMetni(1250)).toBe('1250');
    // Ekran metni panoya gitseydi gidiş-dönüş BELİRSİZ olurdu (kanıt):
    expect(insanSayiOku('1.250', 'miktar').tur).toBe('belirsiz');
    // Pano metni tek anlamlıdır:
    expect(insanSayiOku('1250', 'miktar')).toEqual({ tur: 'sayi', deger: 1250 });
    expect(insanSayiOku(hucreGosterimMetni(12.375), 'miktar')).toEqual({ tur: 'sayi', deger: 12.375 });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// t.4 — PARA SÜTUNU GENİŞLİĞİ
// ════════════════════════════════════════════════════════════════════════════
describe('t.4 · ölçülen glif modeli bildirilen kusuru üretir', () => {
  // 120 px sütun → metne kalan 90 px (dolgu 14+14 + kenarlık 1+1).
  const ICERIK_120 = 120 - HUCRE_KROMU;

  it('hücre kromu 30 px (ölçüldü: padding 14+14, border 1+1)', () => {
    expect(HUCRE_KROMU).toBe(30);
  });

  /**
   * TARAYICIDA ÖLÇÜLEN metin genişlikleri (px) — pinned GENEL TOPLAM bağlamı
   * 13px/800, Alpine'ın sistem yazı yığını, tabular-nums.
   * Kaynak: `scratchpad/tur-gorunur/olcum/olc2.mjs` (gerçek Chromium, gerçek
   * `.ag-cell` düğümü, uygulamanın kendi CSS'i). Metinler görev dosyasından
   * birebir alındı.
   */
  const OLCULDU: Record<string, number> = {
    '₺7.366.828,10': 88.86,     // görev dosyası: "sığan tek sayı"
    '₺9.568.938,40': 90.64,     // ekranda ₺9.568.938,…
    '₺12.071.664,50': 95.42,    // ekranda ₺12.071.66…
    '₺17.208.977,55': 96.66,    // ekranda ₺17.208.977…
    '₺123.456.789,00': 104.72,  // hedef: 9 haneli + kuruş + ₺
    '₺-123.456.789,00': 110.02, // hedef + KÂR satırı zararı
  };

  it('ÖLÇÜM bildirilen kusuru üretir: 90 px içerikte yalnız en kısa sayı sığar', () => {
    // Bağımsız kanıt: görev dosyası bu dört sayıdan üçünün KESİLDİĞİNİ,
    // birinin SIĞDIĞINI söylüyor. Ölçüm aynı ayrımı veriyor.
    expect(OLCULDU['₺7.366.828,10']).toBeLessThan(ICERIK_120);
    for (const kesik of ['₺9.568.938,40', '₺12.071.664,50', '₺17.208.977,55']) {
      expect(OLCULDU[kesik], kesik).toBeGreaterThan(ICERIK_120);
    }
  });

  it('model ÜST SINIRDIR — ölçümün altına ASLA düşmez (sütun dar çıkamaz)', () => {
    // Doğrusal toplam kerning'i yok sayar, bu yüzden hep biraz FAZLA sayar.
    // Yön önemlidir: eksik sayan bir model sütunu dar keserdi.
    for (const [metin, olculen] of Object.entries(OLCULDU)) {
      const model = paraMetniGenisligi(metin);
      // 0,05 px pay: kayan nokta gurultusu (olcumler 2 ondalikla yuvarlandi).
      expect(model + 0.05, metin).toBeGreaterThanOrEqual(olculen);
      expect(model - olculen, metin + ' sapma').toBeLessThan(6);
    }
  });

  it('145 px taban ÖLÇÜLEN hedef metni tam okutur', () => {
    expect(OLCULDU['₺123.456.789,00']).toBeLessThanOrEqual(145 - HUCRE_KROMU);
    expect(OLCULDU['₺-123.456.789,00']).toBeLessThanOrEqual(145 - HUCRE_KROMU);
    // 120 px ile aynı metin KESİLİRDİ — düzeltmenin gerektiğinin kanıtı
    expect(OLCULDU['₺123.456.789,00']).toBeGreaterThan(ICERIK_120);
  });

  it('para simgesi genişliği DEĞİŞTİRMEZ (₺ $ € aynı ilerleme — ölçüldü)', () => {
    const t = paraMetniGenisligi('₺123.456.789,00');
    expect(paraMetniGenisligi('$123.456.789,00')).toBe(t);
    expect(paraMetniGenisligi('€123.456.789,00')).toBe(t);
  });

  it('eksi işareti yer kaplar — KÂR satırı zarar yazabilir', () => {
    expect(paraMetniGenisligi('₺-123.456.789,00'))
      .toBeCloseTo(paraMetniGenisligi('₺123.456.789,00') + GLIF.isaret, 6);
  });
});

describe('t.4 · taban genişlik', () => {
  it('HEDEF "9 haneli + kuruş + ₺" (eksi dahil) → 145 px', () => {
    expect(paraSutunuEnAz(9)).toBe(145);
    expect(PARA_SUTUN_EN_AZ).toBe(145);
    // Hedef metnin kendisi de bu genişliğe sığmalı (tutarlılık, tekrar DEĞİL:
    // formül hane sayar, bu satır gerçek metni ölçer).
    expect(paraMetniGenisligi('₺-123.456.789,00') + HUCRE_KROMU).toBeLessThanOrEqual(145);
  });

  it('hane arttıkça taban artar, azaldıkça azalır (formül gerçekten hane okur)', () => {
    expect(paraSutunuEnAz(6)).toBeLessThan(paraSutunuEnAz(9));
    expect(paraSutunuEnAz(12)).toBeGreaterThan(paraSutunuEnAz(9));
    // 3'lü gruplama: 6 hanede 1, 9 hanede 2 binlik noktası
    expect(paraSutunuEnAz(9) - paraSutunuEnAz(6)).toBeGreaterThan(3 * GLIF.rakam);
  });

  it('kullanıcının DAHA GENİŞ yaptığı sütun korunur, DAR olan yükseltilir', () => {
    expect(paraSutunGenisligi(120)).toBe(145);   // şema varsayılanı → taban
    expect(paraSutunGenisligi(130)).toBe(145);   // Genel Toplam varsayılanı → taban
    expect(paraSutunGenisligi(260)).toBe(260);   // kullanıcı genişletmiş → dokunulmaz
    expect(paraSutunGenisligi(undefined)).toBe(145);
    expect(paraSutunGenisligi(null)).toBe(145);
    expect(paraSutunGenisligi(Number.NaN)).toBe(145);
  });

});

// ════════════════════════════════════════════════════════════════════════════
// t.4 EKİ — SÜTUN KENDİ BAŞLIĞINDAN DAR KALMASIN
// ════════════════════════════════════════════════════════════════════════════
describe('t.4 eki · başlık genişliği', () => {
  /**
   * TARAYICIDA ÖLÇÜLEN başlık metni genişlikleri (px) — gerçek
   * `.ag-header-cell` kaskadı, 11,5px / 750 / letter-spacing 0.01em.
   * Kaynak: `scratchpad/tur-gorunur/olcum/olc5-baslik.mjs`.
   * `Malz. Kar %` = 64,91 px; koordinatörün 1920 px'te gerçek AG Grid'de
   * ölçtüğü "içerik 65 px" ile AYNI sayı (iki bağımsız ölçüm).
   */
  const OLCULEN_BASLIK: Record<string, number> = {
    No: 16.36, 'Malzeme Adı': 71.88, Miktar: 36.58, Birim: 29.64,
    'Malz. Kar %': 64.91, 'Malz. Marka': 67.92, 'Malz. Birim Fiyat': 92.56,
    'Malz. Toplam': 73.50, 'İşç. Kar %': 53.05, 'İşç. Firma': 52.25,
    'İşç. Birim Fiyat': 80.70, 'İşç. Toplam': 61.64, 'Genel Toplam': 75.27,
    'Liste Fiyatı': 58.78, 'İskonto %': 54.61, 'Net Fiyat': 50.09,
    'Çapı': 24.23, 'Malzeme Cinsi': 79.36, 'Açıklama': 50.41,
  };

  /** Standart şema (backend/.../standart-sema.ts:59-73) — başlık + şema genişliği + para mı. */
  const STANDART: Array<[string, number, boolean]> = [
    ['No', 70, false], ['Malzeme Adı', 380, false], ['Miktar', 90, false],
    ['Birim', 80, false], ['Malz. Kar %', 90, false], ['Malz. Marka', 150, false],
    ['Malz. Birim Fiyat', 120, true], ['Malz. Toplam', 120, true],
    ['İşç. Kar %', 90, false], ['İşç. Firma', 150, false],
    ['İşç. Birim Fiyat', 120, true], ['İşç. Toplam', 120, true],
    ['Genel Toplam', 130, true],
  ];

  it('başlık kromu 30 px (dolgu 15+15, kenarlık 0 — iki ölçüm aynı)', () => {
    expect(BASLIK_KROMU).toBe(30);
    // Koordinatörün ölçümü: 90 px sütun → 60 px iç kutu.
    expect(90 - BASLIK_KROMU).toBe(60);
  });

  it('BİLDİRİLEN KUSUR: `Malz. Kar %` 90 px sütuna sığmıyor, 96 px ister', () => {
    expect(OLCULEN_BASLIK['Malz. Kar %']).toBeGreaterThan(90 - BASLIK_KROMU); // 64,91 > 60
    expect(baslikSutunuEnAz('Malz. Kar %')).toBe(96);
    // İkizi aynı 90 px'te SIĞIYOR — kusur "Kar %" değil, "Malz." ön ekiydi.
    expect(baslikSutunuEnAz('İşç. Kar %')).toBeLessThanOrEqual(90);
  });

  it('model ÜST SINIRDIR — 19 gerçek başlığın hiçbirinde ölçümün altına düşmez', () => {
    for (const [metin, olculen] of Object.entries(OLCULEN_BASLIK)) {
      expect(baslikMetniGenisligi(metin), metin).toBeGreaterThanOrEqual(olculen);
    }
  });

  it('kerning payı SIFIR OLAMAZ — payız model "Malz. Birim Fiyat"ı dar keserdi', () => {
    const paysiz = baslikMetniGenisligi('Malz. Birim Fiyat') - 17 * BASLIK_KERNING_PAYI;
    expect(paysiz).toBeLessThan(OLCULEN_BASLIK['Malz. Birim Fiyat']);
    expect(BASLIK_KERNING_PAYI).toBeGreaterThan(0);
  });

  it('⭐ KABUL ÖLÇÜTÜ: 13 standart başlığın hepsinde taşma YOK', () => {
    const tasanlar = STANDART
      .map(([baslik, semaW, paraMi]) => {
        const w = sutunGenisligi(semaW, baslik, paraMi);
        const tasma = OLCULEN_BASLIK[baslik] - (w - BASLIK_KROMU);
        return { baslik, w, tasma: +tasma.toFixed(2) };
      })
      .filter((x) => x.tasma > 0);
    expect(tasanlar).toEqual([]);
  });

  it('YALNIZ `Malz. Kar %` genişledi — kural gereksiz yere sütun büyütmüyor', () => {
    const degisen = STANDART
      .filter(([baslik, semaW, paraMi]) => sutunGenisligi(semaW, baslik, paraMi) !== Math.max(semaW, paraMi ? PARA_SUTUN_EN_AZ : 0))
      .map(([b]) => b);
    expect(degisen).toEqual(['Malz. Kar %']);
  });

  it('kullanıcının genişlettiği sütun korunur; boş/eksik başlık taban üretmez', () => {
    expect(sutunGenisligi(260, 'Malz. Kar %', false)).toBe(260);
    expect(sutunGenisligi(90, '', false)).toBe(90);
    expect(sutunGenisligi(90, undefined, false)).toBe(90);
    expect(sutunGenisligi(90, null, false)).toBe(90);
    expect(baslikSutunuEnAz('   ')).toBe(0);
  });

  it('para tabanı ve başlık tabanı BİRLİKTE uygulanır (en büyüğü kazanır)', () => {
    expect(sutunGenisligi(120, 'Malz. Birim Fiyat', true)).toBe(PARA_SUTUN_EN_AZ); // 145 > 124
    expect(sutunGenisligi(120, 'Çok Uzun Bir Para Başlığı Daha', true))
      .toBeGreaterThan(PARA_SUTUN_EN_AZ);
  });

  it('bilinmeyen karakter EN GENİŞ glifle sayılır (dar kesmez)', () => {
    // Kiril/CJK gibi tablo dışı bir karakter; 'W' yedeği kullanılır.
    expect(baslikMetniGenisligi('Ж')).toBeGreaterThan(baslikMetniGenisligi('W') - 0.001);
  });

  it('TAVAN: patolojik uzun başlık düzeni bozmaz', () => {
    const uzun = 'BİRİM FİYAT İŞÇİLİK MONTAJ DAHİL (TL) 2026 REVİZYON';
    expect(baslikMetniGenisligi(uzun) + BASLIK_KROMU).toBeGreaterThan(BASLIK_EN_COK);
    expect(baslikSutunuEnAz(uzun)).toBe(BASLIK_EN_COK);
  });
});
