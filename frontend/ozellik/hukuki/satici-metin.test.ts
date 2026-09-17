import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GIZLILIK,
  KULLANIM_KOSULLARI,
  CEREZ_POLITIKASI,
  MESAFELI_SATIS,
  MESAFELI_SATIS_SOZLESMESI,
  HUKUKI_SAYFALAR,
  HUKUKI_KARARLAR,
  SATICI,
  saticiDolduMu,
  type HukukiMetin,
} from './metinler';

/**
 * SATICI KİMLİĞİ + HUKUKİ KARARLAR — DAVRANIŞ KAPISI (Faz 6.4, 16.09).
 *
 * ⚠ NEDEN BURADA, ARKA YÜZDE DEĞİL: `test:faz5` metinleri KAYNAK METNİ
 * olarak okur (dosyayı açar, regex çalıştırır). Şablon dizgeye çevrilmiş bir
 * metinde kaynak "`${SATICI.unvan}`" yazar — yani kaynak kapısı, ziyaretçinin
 * EKRANDA gerçekten ne gördüğünü ölçemez. Burada metinler GERÇEKTEN
 * değerlendirilip çizilen dizgeler sınanıyor.
 *
 * Ölçülen:
 *   T1  dört metinde + sözleşmede satıcı yer tutucusu KALMADI
 *   T2  kalan yer tutucular yalnız açık hukuki/muhasebe kararları
 *   T3  `dolduruldu` TÜRETİLİYOR (bayrak elle tutulamaz)
 *   T4  KEP yokken satır HİÇ basılmıyor (boş "KEP:" yok)
 *   T5  iade ve mahkeme cümleleri iki metinde de AYNI sabitten
 *   T6  ürün-metin çelişkisi yok (hesap kapatma)
 *   T7  Mesafeli Satış Sözleşmesi ayrı metin, sayfada, listede DEĞİL
 *   T8  kota cümlesi var ve RAKAMSIZ
 *   T9  elektrik kapsamı: metin satılan ürünle çelişmiyor (17.09)
 */

/** Bir metnin ekranda GÖRÜNEN tüm dizgeleri (HukukiSayfa'nın çizdiği sıra). */
function cizilen(m: HukukiMetin): string[] {
  const out = [m.baslik, m.girisNotu];
  for (const b of m.bolumler) {
    out.push(b.baslik, ...b.paragraflar, ...(b.madde ?? []));
  }
  return out;
}

const DORT_METIN = [GIZLILIK, KULLANIM_KOSULLARI, CEREZ_POLITIKASI, MESAFELI_SATIS];
const HEPSI = [...DORT_METIN, MESAFELI_SATIS_SOZLESMESI];
const TUM_METIN = HEPSI.flatMap(cizilen).join('\n');

/** Köşeli parantezli, BÜYÜK HARFLE başlayan yer tutucular. */
function yerTutucular(s: string): string[] {
  // ⚠ Yayılma (`[...matchAll]`) YOK: tsconfig hedefi eski ve `downlevelIteration`
  // kapalı — `npx tsc --noEmit` kapısı orada kırmızı oluyordu.
  const bulunan: string[] = [];
  const kalip = /\[([A-ZÇĞİÖŞÜ][^\]\n]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = kalip.exec(s)) !== null) bulunan.push(m[1]);
  return bulunan;
}

/**
 * Avukat / muhasebe kararı beklediği için BİLEREK açık bırakılanlar.
 * ⚠ Bu listeye yeni madde eklemek, "doldurulmadı"yı gizlemenin kolay yolu —
 * her ekleme raporda gerekçesiyle anılır.
 */
const IZINLI_KALAN = [
  'YASAL SAKLAMA SURESI',
  'DENEME KAYDI SAKLAMA SÜRESİ',
  'FATURA İLETİM YÖNTEMİ',
];

describe('T-ÖLÇÜT — fixture gerçekten metin taşıyor', () => {
  // Boş küme her assert'i tesadüfen yeşil yapardı (bkz. bos_dizi_yalanci_yesil).
  it('beş metin de çiziliyor ve gövde yeterince uzun', () => {
    expect(HEPSI).toHaveLength(5);
    for (const m of HEPSI) expect(cizilen(m).length).toBeGreaterThan(8);
    expect(TUM_METIN.length).toBeGreaterThan(20000);
  });
});

describe('T1/T2 — satıcı kimliği metinlerde GERÇEKTEN dolu', () => {
  it('satıcı kimliği yer tutucusu KALMADI', () => {
    const kalan = yerTutucular(TUM_METIN);
    // Asıl ölçüt: satıcıya ait hiçbir yer tutucu kalmamış olmalı.
    expect(kalan.filter((ad) => !IZINLI_KALAN.includes(ad))).toEqual([]);
  });

  it('kalan yer tutucular YALNIZ açık hukuki/muhasebe kararları', () => {
    const kalan = yerTutucular(TUM_METIN)
      .filter((ad, i, hepsi) => hepsi.indexOf(ad) === i)
      .sort();
    expect(kalan).toEqual([...IZINLI_KALAN].sort());
  });

  it('sicil bilgileri metinlerde ADIYLA geçiyor (bağlantı koparsa kırmızı)', () => {
    for (const deger of [
      SATICI.unvan,
      SATICI.adres,
      SATICI.mersis,
      SATICI.ticaretSicilNo,
      SATICI.vergiNo,
      SATICI.vergiDairesi,
      SATICI.eposta,
      SATICI.telefon,
    ]) {
      expect(TUM_METIN).toContain(deger);
    }
  });

  it('dört hukuki sayfanın HER BİRİ satıcı unvanını basıyor', () => {
    for (const m of DORT_METIN) expect(cizilen(m).join('\n')).toContain(SATICI.unvan);
  });
});

describe('T3 — dolduruldu TÜRETİLİYOR', () => {
  it('bugün dolu', () => {
    expect(SATICI.dolduruldu).toBe(true);
  });

  // ⚠ ASIL MEKANİZMA TESTİ: bir alanda yer tutucu kalırsa bayrak DÜŞMELİ.
  // Elle tutulan bir bayrak bunu yapamazdı — 5.7'de altbilgiye yarım kimlik
  // sızma riski tam buydu.
  it('tek bir alanda yer tutucu kalsa bayrak FALSE olur', () => {
    expect(saticiDolduMu({ unvan: 'X', adres: '[ADRES]' })).toBe(false);
    expect(saticiDolduMu({ unvan: 'X', adres: 'Y' })).toBe(true);
  });

  it('null alan (KEP yok) EKSİK sayılmaz', () => {
    expect(saticiDolduMu({ unvan: 'X', kep: null })).toBe(true);
  });
});

describe('T4 — KEP yokken satır HİÇ basılmıyor', () => {
  it('boş "KEP:" satırı yok', () => {
    expect(SATICI.kep).toBeNull();
    expect(TUM_METIN).not.toMatch(/KEP adresi:\s*(\n|$)/);
    expect(TUM_METIN).not.toContain('KEP');
  });
});

describe('T5 — iade ve yetkili mahkeme TEK sabitten, İKİ metinde', () => {
  it('iade cümlesi hem Kullanım Koşulları hem Ön Bilgilendirme/Sözleşme içinde', () => {
    const tasiyan = HEPSI.filter((m) => cizilen(m).join('\n').includes(HUKUKI_KARARLAR.iade));
    expect(tasiyan.map((m) => m.kisaAd).length).toBeGreaterThanOrEqual(3);
  });

  it('yetkili mahkeme cümlesi en az iki metinde', () => {
    const tasiyan = HEPSI.filter((m) =>
      cizilen(m).join('\n').includes(HUKUKI_KARARLAR.yetkiliMahkeme),
    );
    expect(tasiyan.length).toBeGreaterThanOrEqual(2);
  });

  it('eski yer tutucu yazımları hiçbir metinde YOK', () => {
    for (const eski of ['İADE POLİTİKASI', 'YETKİLİ MAHKEME']) {
      expect(TUM_METIN).not.toContain(eski);
    }
  });
});

describe('T6 — ürün ile metin çelişmiyor', () => {
  it('"hesabı kapatan düğme yok" cümlesi KALDIRILDI', () => {
    expect(TUM_METIN).not.toContain('doğrudan kapatan bir düğme uygulama içinde bulunmamaktadır');
  });

  it('metin profildeki kapatma bölümünü ANLATIYOR', () => {
    expect(TUM_METIN).toContain('Hesabımı kapat');
  });
});

describe('T7 — Mesafeli Satış Sözleşmesi', () => {
  it('ayrı bir metin olarak var ve taraf/konu/bedel/süre/iade/uyuşmazlık taşıyor', () => {
    const basliklar = MESAFELI_SATIS_SOZLESMESI.bolumler.map((b) => b.baslik).join(' | ');
    for (const beklenen of ['Taraflar', 'konusu', 'Bedel', 'yenileme', 'Cayma', 'iade', 'Uyuşmazlık']) {
      expect(basliklar).toContain(beklenen);
    }
  });

  // ⚠ Listeye eklenirse altbilgi 404 veren bir bağlantı basar (ayrı rotası yok).
  it('HUKUKI_SAYFALAR listesine EKLENMEDİ', () => {
    expect(HUKUKI_SAYFALAR).toHaveLength(4);
    expect(HUKUKI_SAYFALAR).not.toContain(MESAFELI_SATIS_SOZLESMESI);
  });

  // BAĞLANTI TESTİ: metin tanımlı olup sayfaya bağlanmazsa kimse göremez.
  it('/mesafeli-satis sayfası sözleşmeyi ikinci bölüm olarak çiziyor', () => {
    const sayfa = readFileSync(join(__dirname, '../../app/mesafeli-satis/page.tsx'), 'utf-8');
    expect(sayfa).toContain('ekMetin={MESAFELI_SATIS_SOZLESMESI}');
    const kabuk = readFileSync(join(__dirname, 'HukukiSayfa.tsx'), 'utf-8');
    expect(kabuk).toContain('ekMetin &&');
    expect(kabuk).toContain('id="sozlesme"');
  });
});

describe('T8 — çeviri kotası cümlesi RAKAMSIZ', () => {
  const mesafeli = cizilen(MESAFELI_SATIS).join('\n');

  it('kota anlatılıyor', () => {
    expect(mesafeli).toContain('çeviri kotası');
    expect(mesafeli).toContain('Fiyatlar sayfasında');
  });

  // Tablo (ceviri-kotasi.ts) değişince metin yalan söylemesin diye rakam YOK.
  it('satır/dosya rakamı YOK', () => {
    expect(mesafeli).not.toMatch(/[\d.]+\s*satır/);
    expect(mesafeli).not.toMatch(/[\d.]+\s*dosya/);
  });
});

/**
 * T9 — METİN SATILAN ÜRÜNÜ ANLATIR (17.09, Emre kararı)
 *
 * 16.09'da elektrik paketleri satıştan çekilecek diye hukuki metinler
 * mekaniğe daraltılmış ve iki yere "elektrik paketleri şu an satışta
 * değildir" cümlesi konmuştu. Karar TERSİNE döndü: üç elektrik paketi
 * (basic-elk, pro-elk, pro-mep) satın alınabiliyor.
 *
 * Kapının ölçtüğü şey "elektrik kelimesi geçiyor mu" DEĞİL, metnin bugün
 * satılan ürünle ÇELİŞMEMESİ: sözleşme müşteriye satamayacağımız bir şeyi
 * vaat etmemeli, satabildiğimiz bir şeyi de yok saymamalı. Yalnız
 * `cizilen()` ile ÇİZİLEN gövde okunur — yorumda kalan eski cümle
 * "yerinde" sayılmaz.
 */
describe('T9 — elektrik kapsamı: metin satılan ürünle çelişmiyor', () => {
  it('ÖLÇÜT: fixture gerçekten bu üç metni taşıyor', () => {
    for (const m of [GIZLILIK, KULLANIM_KOSULLARI, MESAFELI_SATIS]) {
      expect(cizilen(m).join('\n').length).toBeGreaterThan(500);
    }
  });

  it('gizlilik ve kullanım koşulları iki disiplini birden anlatıyor', () => {
    expect(cizilen(GIZLILIK).join('\n')).toContain('mekanik ve elektrik tesisat işleri');
    expect(cizilen(KULLANIM_KOSULLARI).join('\n')).toContain('mekanik ve elektrik tesisat işi');
  });

  it('paketlerin DİSİPLİNE göre ayrıldığı iki metinde de yazılı', () => {
    expect(cizilen(KULLANIM_KOSULLARI).join('\n')).toContain(
      'Paketler hem seviyeye hem de çalıştığınız disipline göre farklılaşır (mekanik, elektrik veya her ikisi birlikte)',
    );
    expect(cizilen(MESAFELI_SATIS).join('\n')).toContain(
      'Paketler disipline (mekanik, elektrik ya da ikisi birden) ve seviyeye göre ayrılır',
    );
  });

  it('hiçbir metin "elektrik paketleri satışta değil" DEMİYOR', () => {
    expect(TUM_METIN).not.toMatch(/[Ee]lektrik[^.]*satışta değil/);
    expect(TUM_METIN).not.toMatch(/satışta değil[^.]*elektrik/i);
  });
});
