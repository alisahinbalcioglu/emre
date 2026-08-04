/**
 * A-1 (frontend) — SILME ONAY METNI KARAR FONKSIYONU
 *   npx vitest run lib/silme-onay-metni.test.ts
 *
 * NEDEN SAF FONKSIYON: onay metni bugun iki ayri sayfanin JSX'ine gomulu
 * (`app/admin/brands/page.tsx:206` ve `:237`, `app/(protected)/materials/[brandId]/page.tsx:262`)
 * ve jsdom KURULU DEGIL (vitest ortami node) — gomulu haliyle test edilemez.
 * `lib/indeks-sagligi.ts` ile ayni desen: karar saf fonksiyona alinir,
 * sayfa yalniz cagirir.
 *
 * ── ★ BU TESTIN ASIL DERDI: METIN YANLIS SEY VAAT ETMESIN ────────────────
 * B isinden sonra `UserLibrary.productIndexId` SetNull. Fiyat listesi silmek
 * kutuphane satirini OLDURMUYOR (backend `test/a1-silme-etkisi-test.ts`
 * A0-a/A0-b canli DB'de olctu: satir yasiyor, iskonto aynen duruyor, yalniz
 * bag kopuyor). Bu yuzden fiyat listesi onayinda "N satir silinecek" demek
 * YANLIS olur. Marka yolunda ise satirlar GERCEKTEN siliniyor
 * (brands.service.ts `remove` icindeki elle `deleteMany`).
 * Ayni sema, IKI FARKLI gercek → metin `etki` alanina gore ayrilmali.
 *
 * BU TEST KIRMIZI OLMAK ICIN YAZILDI (`lib/silme-onay-metni.ts` henuz yok).
 */
import { describe, it, expect } from 'vitest';
import { silmeOnayMetni, type SilmeEtkisi } from './silme-onay-metni';

/** Marka yolu — satirlar GERCEKTEN silinir. */
const markaEtkisi: SilmeEtkisi = {
  ad: 'CAYIROVA', etki: 'satir-silinir',
  ulSatiri: 4, iskontoluSatir: 2, ozelFiyatliSatir: 1, etkilenenKullanici: 2,
};

/** Fiyat listesi yolu — satirlar YASAR, yalniz bag kopar. */
const listeEtkisi: SilmeEtkisi = {
  ad: 'Aralik 2023', etki: 'bag-kopar',
  ulSatiri: 4, iskontoluSatir: 2, ozelFiyatliSatir: 1, etkilenenKullanici: 2,
};

/** Hicbir kutuphane satirini etkilemeyen liste. */
const bosEtki: SilmeEtkisi = {
  ad: 'Bos Liste', etki: 'bag-kopar',
  ulSatiri: 0, iskontoluSatir: 0, ozelFiyatliSatir: 0, etkilenenKullanici: 0,
};

/** Satir VAR ama ekonomi YOK — "geri getirilemez" uyarisi cikmamali. */
const ekonomisizEtki: SilmeEtkisi = {
  ad: 'Ekonomisiz Liste', etki: 'bag-kopar',
  ulSatiri: 3, iskontoluSatir: 0, ozelFiyatliSatir: 0, etkilenenKullanici: 1,
};

describe('★ BOS-KUME KAPISI — fixture DOLU ve dogru KIRILIMDA mi', () => {
  // Saf fonksiyon testinde "bos kume" riski fixture'in sifirlarla dolu
  // olmasidir: o zaman her assert "0 gecti" der ve HICBIR SEY olculmez.
  // Uc kirilim AYRI AYRI kanitlanir (tek birlesik assert gizler).
  it('marka fixture\'inda etkilenen satir sayisi > 0', () => {
    expect(markaEtkisi.ulSatiri).toBe(4);
  });
  it('marka fixture\'inda ISKONTOLU satir sayisi > 0', () => {
    expect(markaEtkisi.iskontoluSatir).toBe(2);
  });
  it('marka fixture\'inda OZEL FIYATLI satir sayisi > 0', () => {
    expect(markaEtkisi.ozelFiyatliSatir).toBe(1);
  });
  it('liste fixture\'i marka fixture\'iyla AYNI sayilarda (fark yalniz `etki`)', () => {
    // Metin farki sayilardan degil, YALNIZ `etki` alanindan dogmali.
    expect({ ...listeEtkisi, ad: markaEtkisi.ad, etki: markaEtkisi.etki }).toEqual(markaEtkisi);
  });
});

describe('MARKA yolu (etki: satir-silinir) — satirlar gercekten olur', () => {
  const m = silmeOnayMetni({ tur: 'marka', ad: 'CAYIROVA', etki: markaEtkisi });

  it('baslikta silinecek nesnenin adi gecer', () => {
    expect(m.title).toContain('CAYIROVA');
  });
  it('aciklama SILINECEK der (satirlar gercekten gidiyor)', () => {
    expect(m.description).toContain('SİLİNECEK');
  });
  it('aciklama etkilenen satir sayisini gosterir', () => {
    expect(m.description).toContain('4 kütüphane satırı');
  });
  it('aciklama etkilenen kullanici sayisini gosterir', () => {
    expect(m.description).toContain('2 kullanıcı');
  });
  it('aciklama iskontolu satir sayisini gosterir', () => {
    expect(m.description).toContain('2 iskonto');
  });
  it('aciklama ozel fiyatli satir sayisini gosterir', () => {
    expect(m.description).toContain('1 özel fiyat');
  });
  it('aciklama geri getirilemezligi soyler', () => {
    expect(m.description).toContain('geri getirilemez');
  });
  it('ekonomiVar true (cagiran taraf sert onay isteyebilsin)', () => {
    expect(m.ekonomiVar).toBe(true);
  });
});

describe('★ FIYAT LISTESI yolu (etki: bag-kopar) — satirlar YASAR', () => {
  const l = silmeOnayMetni({ tur: 'liste', ad: 'Aralik 2023', etki: listeEtkisi });

  it('baslikta silinecek listenin adi gecer', () => {
    expect(l.title).toContain('Aralik 2023');
  });
  it('⭐ aciklama kutuphane satirlarinin SILINMEDIGINI soyler', () => {
    expect(l.description).toContain('SİLİNMEZ');
  });
  it('⭐ aciklama kutuphane satiri icin SILINECEK demez (yanlis vaat yasagi)', () => {
    // A0 olctu: bu yolda satir olmuyor. "silinecek" kelimesi kutuphane
    // satirinin gectigi cumlede GECEMEZ.
    const kutuphaneCumlesi = l.description.split('.').find((c) => c.includes('kütüphane satırı')) ?? '';
    expect(kutuphaneCumlesi.toLocaleUpperCase('tr-TR')).not.toContain('SİLİNECEK');
  });
  it('⭐ aciklama bagin koptugunu soyler', () => {
    expect(l.description).toContain('bağı kopar');
  });
  it('⭐ aciklama iskonto/ozel fiyatin KORUNDUGUNU soyler', () => {
    expect(l.description).toContain('korunur');
  });
  it('aciklama etkilenen satir sayisini yine de gosterir', () => {
    expect(l.description).toContain('4 kütüphane satırı');
  });
  it('aciklama etkilenen kullanici sayisini gosterir', () => {
    expect(l.description).toContain('2 kullanıcı');
  });
  it('ekonomiVar true (etkilenen satirlarda ekonomi var)', () => {
    expect(l.ekonomiVar).toBe(true);
  });
});

describe('SIFIR ETKI — korkutucu sayi uydurulmaz', () => {
  const b = silmeOnayMetni({ tur: 'liste', ad: 'Bos Liste', etki: bosEtki });

  it('hicbir kutuphane satiri etkilenmiyorsa kutuphaneden BAHSEDILMEZ', () => {
    expect(b.description).not.toContain('kütüphane satırı');
  });
  it('ekonomiVar false', () => {
    expect(b.ekonomiVar).toBe(false);
  });
  it('baslik yine de nesnenin adini tasir', () => {
    expect(b.title).toContain('Bos Liste');
  });
});

describe('SATIR VAR ama EKONOMI YOK', () => {
  const e = silmeOnayMetni({ tur: 'liste', ad: 'Ekonomisiz Liste', etki: ekonomisizEtki });

  it('satir sayisi yine gosterilir', () => {
    expect(e.description).toContain('3 kütüphane satırı');
  });
  it('"geri getirilemez" uyarisi CIKMAZ (kaybedilecek ekonomi yok)', () => {
    expect(e.description).not.toContain('geri getirilemez');
  });
  it('ekonomiVar false', () => {
    expect(e.ekonomiVar).toBe(false);
  });
});

describe('ETKI HESAPLANAMADI (uc 4xx/5xx dondu) — durust geri dusus', () => {
  const y = silmeOnayMetni({ tur: 'liste', ad: 'Bilinmeyen', etki: null });

  it('sayi UYDURULMAZ — kutuphane satiri sayisi iddia edilmez', () => {
    expect(y.description).not.toContain('kütüphane satırı');
  });
  it('hesaplanamadigi ACIKCA soylenir (sessiz kalmaz)', () => {
    expect(y.description).toContain('hesaplanamadı');
  });
  it('ekonomiVar false (bilinmiyor → iddia yok)', () => {
    expect(y.ekonomiVar).toBe(false);
  });
  it('baslik yine de nesnenin adini tasir', () => {
    expect(y.title).toContain('Bilinmeyen');
  });
  // ⭐ Onay, GORULEN sayilara dayanir. Sayilar gosterilemediyse kullanicinin
  // "Onayla"si bilgilendirilmis bir onay DEGILDIR — bu durumda cagiran taraf
  // `?onaylandi=true` GONDERMEMELI, backend'in 409'u devreye girsin ve hata
  // metnindeki gercek rakamlar ekrana dussun.
  it('⭐ bilgilendirilmisOnay false (kullanici hicbir sayi gormedi)', () => {
    expect(y.bilgilendirilmisOnay).toBe(false);
  });
});

describe('BILGILENDIRILMIS ONAY — sayilar gosterildiyse true', () => {
  it('marka yolunda sayilar gosterildi → true', () => {
    expect(silmeOnayMetni({ tur: 'marka', ad: 'CAYIROVA', etki: markaEtkisi }).bilgilendirilmisOnay).toBe(true);
  });
  it('liste yolunda sayilar gosterildi → true', () => {
    expect(silmeOnayMetni({ tur: 'liste', ad: 'Aralik 2023', etki: listeEtkisi }).bilgilendirilmisOnay).toBe(true);
  });
  it('etkilenen satir 0 olsa bile olcum YAPILDI → true', () => {
    // "Sayi yok" ile "olculemedi" AYRI seyler; ikisini tek bayrakta birlestirmek
    // bos listeyi gereksizce 409'a sokardi.
    expect(silmeOnayMetni({ tur: 'liste', ad: 'Bos Liste', etki: bosEtki }).bilgilendirilmisOnay).toBe(true);
  });
});
