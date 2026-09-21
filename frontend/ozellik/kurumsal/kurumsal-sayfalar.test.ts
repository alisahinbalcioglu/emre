import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KURUMSAL_SAYFALAR,
  HAKKIMIZDA,
  ILETISIM,
  HAKKIMIZDA_METNI,
  kisaUnvan,
  merkezIl,
} from './sayfalar';
import { SATICI, GIZLILIK } from '../hukuki/metinler';

/**
 * KURUMSAL SAYFALAR — `/hakkimizda` + `/iletisim` DAVRANIŞ KAPISI
 * (t.21, 21.09.2026 — iyzico canlı üye işyeri başvurusu)
 *
 * iyzico "Başvuru Koşulları" sayfası, ana sayfadan doğrudan erişilebilen bir
 * İletişim başlığı altında ticari unvan, MERSİS, merkez adresi, KEP, e-posta,
 * telefon ve MESLEK ODASI bilgisini şart koşuyor; ayrıca bir Hakkımızda
 * sayfası istiyor. 21 Eylül'de canlı sitede üçü de YOKTU.
 *
 * Ölçülen:
 *   L  liste TEK KAYNAK — bağlantı verilen her sayfa GERÇEKTEN var
 *   S  iki sayfa da kimliği YALNIZ `SATICI`dan okuyor (düz yazım yok)
 *   I  iletişim: `null` kanal satırı HİÇ basılmıyor, künye tam
 *   H  hakkımızda metni BİREBİR — eklenmiş sayı/yıl/iddia YOK
 *   A  altbilgi iki bağlantıyı LİSTEDEN türetiyor + meslek odası basıyor
 *   B  kabuk: telefonda da görünen /fiyatlar yolu (HukukiSayfa'nın ikizi)
 */
const kok = join(__dirname, '..', '..');
const oku = (yol: string) => readFileSync(join(kok, yol), 'utf-8');
/** Yorumsuz kaynak: yorumda eşleşen desen kodu değiştirmez. */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HAKKIMIZDA_SAYFA = 'app/hakkimizda/page.tsx';
const ILETISIM_SAYFA = 'app/iletisim/page.tsx';
const ALTBILGI = 'ortak/kabuk/components/layout/Altbilgi.tsx';
const KABUK = 'ozellik/kurumsal/KurumsalSayfa.tsx';

describe('L — liste tek kaynak, bağlantı verilen sayfa GERÇEKTEN var', () => {
  it('ÖLÇÜT: liste boş değil ve iki sayfayı taşıyor', () => {
    expect(KURUMSAL_SAYFALAR).toHaveLength(2);
    expect(KURUMSAL_SAYFALAR).toContain(HAKKIMIZDA);
    expect(KURUMSAL_SAYFALAR).toContain(ILETISIM);
  });

  // Deponun kuralı: tıklanınca hiçbir şey yapmayan bağlantı, var olmayan bir
  // şey vaat eder. Liste bir rota uydurursa bu assert kırmızı olur.
  it.each(KURUMSAL_SAYFALAR.map((s) => s.yol))('%s rotası diskte var', (yol) => {
    expect(existsSync(join(kok, `app${yol}/page.tsx`))).toBe(true);
  });

  it('hukuki sayfalar listesine KARIŞTIRILMADI (ayrı küme)', () => {
    const kaynak = yorumsuz(oku('ozellik/hukuki/metinler.ts'));
    for (const s of KURUMSAL_SAYFALAR) {
      expect(kaynak).not.toContain(s.yol);
    }
  });

  it('sayfa başlığı da LİSTEDEN okunuyor (metadata elle yazılmıyor)', () => {
    expect(yorumsuz(oku(HAKKIMIZDA_SAYFA))).toContain('title: HAKKIMIZDA.sayfaBasligi');
    expect(yorumsuz(oku(ILETISIM_SAYFA))).toContain('title: ILETISIM.sayfaBasligi');
  });
});

describe('S — kimlik YALNIZ SATICI\'dan (düz yazım yok)', () => {
  // ⭐ ASIL ÖLÇÜT: `SATICI.eposta`yı değiştirince sayfa da değişmeli. Kaynakta
  // değerin KENDİSİ aranıyor — bulunursa bağlantı kopmuş, düz yazılmış demektir.
  const DUZ_YAZILMAMALI = [
    SATICI.unvan,
    SATICI.adres,
    SATICI.mersis,
    SATICI.vergiNo,
    SATICI.vergiDairesi,
    SATICI.ticaretSicilNo,
    SATICI.eposta,
    SATICI.meslekOdasi,
  ];

  it('ÖLÇÜT: aranan değerler boş değil (boş dizge her yerde bulunurdu)', () => {
    expect(DUZ_YAZILMAMALI.length).toBeGreaterThan(5);
    for (const d of DUZ_YAZILMAMALI) expect(typeof d === 'string' && d.length > 3).toBe(true);
  });

  it.each([HAKKIMIZDA_SAYFA, ILETISIM_SAYFA, 'ozellik/kurumsal/sayfalar.ts'])(
    '%s içinde kimlik DÜZ YAZILMAMIŞ',
    (yol) => {
      const kaynak = yorumsuz(oku(yol));
      for (const deger of DUZ_YAZILMAMALI) {
        expect(kaynak, deger).not.toContain(deger);
      }
    },
  );

  it('iletişim sayfası SATICI sabitini GERÇEKTEN okuyor (bağlantı)', () => {
    const kaynak = yorumsuz(oku(ILETISIM_SAYFA));
    for (const alan of [
      'SATICI.unvan',
      'SATICI.adres',
      'SATICI.mersis',
      'SATICI.ticaretSicilNo',
      'SATICI.meslekOdasi',
      'SATICI.vergiDairesi',
      'SATICI.vergiNo',
      'SATICI.eposta',
      'SATICI.telefon',
      'SATICI.kep',
    ]) {
      expect(kaynak, alan).toContain(alan);
    }
  });

  it('gizlilik bağlantısı da SABİTTEN türüyor (düz "/gizlilik" yok)', () => {
    const kaynak = yorumsuz(oku(ILETISIM_SAYFA));
    expect(kaynak).toContain('GIZLILIK.yol');
    expect(kaynak).not.toContain(`"${GIZLILIK.yol}"`);
    expect(kaynak).not.toContain(`'${GIZLILIK.yol}'`);
  });
});

describe('I — iletişim: null kanal satırı HİÇ basılmıyor', () => {
  it('telefon ve KEP bugün null', () => {
    expect(SATICI.telefon).toBeNull();
    expect(SATICI.kep).toBeNull();
  });

  // Değerler `null` iken satır hiç üretilmemeli; değer gelince üretilmeli.
  // Sayfa bir React bileşeni olduğu için KURAL kaynaktan ölçülür: koşullu
  // yayılma deseni (KEP'in deseni) kullanılıyor mu?
  it('kanal satırları koşullu yayılma ile kuruluyor (boş "Telefon:" yok)', () => {
    const kaynak = yorumsuz(oku(ILETISIM_SAYFA));
    expect(kaynak).toMatch(/\.\.\.\(SATICI\.telefon\s*\?/);
    expect(kaynak).toMatch(/\.\.\.\(SATICI\.kep\s*\?/);
  });

  it('künye iyzico\'nun saydığı ALTI alanı da taşıyor', () => {
    const kaynak = yorumsuz(oku(ILETISIM_SAYFA));
    for (const etiket of [
      'Ticari unvan',
      'Merkez adresi',
      'MERSİS numarası',
      'Ticaret sicil numarası',
      'Meslek odası',
      'Vergi dairesi / numarası',
    ]) {
      expect(kaynak, etiket).toContain(etiket);
    }
  });

  it('e-posta mailto: bağlantısı (tıklanınca istemci açılır)', () => {
    expect(yorumsuz(oku(ILETISIM_SAYFA))).toContain('mailto:${SATICI.eposta}');
  });

  // İş emri: "İletişim formu YAPILMAYACAK" — form, gelen iletileri saklamak ve
  // ayrıca KVKK aydınlatması demek.
  it('İLETİŞİM FORMU YOK (veri toplayan alan yok)', () => {
    const kaynak = yorumsuz(oku(ILETISIM_SAYFA));
    for (const oge of ['<form', '<textarea', '<Input', 'onSubmit']) {
      expect(kaynak, oge).not.toContain(oge);
    }
  });
});

describe('H — hakkımızda metni BİREBİR, eklenmiş rakam yok', () => {
  const GOVDE = [
    ...HAKKIMIZDA_METNI.girisParagraflari,
    HAKKIMIZDA_METNI.ilkeBasligi,
    ...HAKKIMIZDA_METNI.ilkeParagraflari,
  ].join('\n');

  it('ÖLÇÜT: gövde gerçekten metin taşıyor', () => {
    expect(HAKKIMIZDA_METNI.girisParagraflari).toHaveLength(3);
    expect(HAKKIMIZDA_METNI.ilkeParagraflari).toHaveLength(2);
    expect(GOVDE.length).toBeGreaterThan(1200);
  });

  it('iş emrindeki cümleler BİREBİR duruyor', () => {
    for (const cumle of [
      'MetaPriceX, teklif hazırlayan bir mühendislik firmasının kendi ihtiyacından doğdu.',
      'mekanik tesisat ile yangın algılama ve söndürme sistemleri alanında çalışır',
      'Üstelik bir teklifteki tek bir yanlış çap, bütün işin kârını götürebilir.',
      'DWG projelerindeki hat boylarını katman ve koordinat üzerinden ölçer.',
      'Çok sayfalı Excel keşiflerini tek seferde, hiçbir sekmeyi atlamadan okur.',
      'TCMB kurunu ve İngilizce çıktıyı teklife işler.',
      'Çapı siz atarsınız, sistem çap tahmin etmez.',
      'Bir kalem için birden fazla fiyat adayı çıkarsa sistem seçmez, size sorar.',
      'Bulamadığı kalemi işaretler, sessizce geçmez.',
      'Hesap kuralları testlerle kilitlenir; her sürüm yayına çıkmadan doğrulanır.',
    ]) {
      expect(GOVDE, cumle).toContain(cumle);
    }
    expect(HAKKIMIZDA_METNI.ilkeBasligi).toBe('Yazılım tahmin etmez');
  });

  // ⭐ EN ÖNEMLİ KAPI: doğrulanmamış bir rakam, ödeme sağlayıcısının
  // inceleyicisine karşı bir tanıtım sayfasının yapabileceği en kötü şey.
  // "3x2.5mm" gibi ürün ölçüsü de dahil HİÇBİR rakam metinde olmamalı.
  it('METİNDE RAKAM YOK (müşteri/proje/yıl sayısı eklenmemiş)', () => {
    expect(GOVDE).not.toMatch(/\d/);
  });

  it('şişirme iddiası sözcükleri yok', () => {
    for (const kelime of [
      'lider',
      'en iyi',
      'yılı aşkın',
      'binlerce',
      'yüzlerce',
      'müşterimiz',
      'ödüllü',
      'Türkiye\'nin',
    ]) {
      expect(GOVDE.toLocaleLowerCase('tr'), kelime).not.toContain(kelime.toLocaleLowerCase('tr'));
    }
  });

  it('unvan ve şehir SATICI\'dan TÜRETİLİYOR (imza + metin içi kısa ad)', () => {
    expect(HAKKIMIZDA_METNI.imza).toBe(`${SATICI.unvan} · İstanbul`);
    expect(HAKKIMIZDA_METNI.girisParagraflari[1].startsWith(kisaUnvan(SATICI.unvan))).toBe(true);
  });

  it('kisaUnvan/merkezIl: türetme MEKANİZMASI çalışıyor, tanınmazsa BOZMUYOR', () => {
    expect(kisaUnvan('X MÜHENDİSLİK LİMİTED ŞİRKETİ')).toBe('X MÜHENDİSLİK');
    expect(kisaUnvan('Y İNŞAAT ANONİM ŞİRKETİ')).toBe('Y İNŞAAT');
    // Ek tanınmazsa TAM unvan döner — uzun ama DOĞRU cümle, yanlış değil.
    expect(kisaUnvan('Z Teknoloji Kollektif')).toBe('Z Teknoloji Kollektif');
    expect(merkezIl('A Mah. B Sk. No: 1 Maltepe/İstanbul')).toBe('İstanbul');
    expect(merkezIl('Ayıraçsız adres')).toBe('Ayıraçsız adres');
  });

  it('sayfa alt kısmında İletişim bağlantısı var (iş emri şartı)', () => {
    const kaynak = yorumsuz(oku(HAKKIMIZDA_SAYFA));
    expect(kaynak).toContain('href={ILETISIM.yol}');
  });
});

describe('A — altbilgi: bağlantılar LİSTEDEN, meslek odası basılıyor', () => {
  const altbilgi = yorumsuz(oku(ALTBILGI));

  it('iki liste de map ile türetiliyor (elle yazılmış <Link> yok)', () => {
    expect(altbilgi).toContain('KURUMSAL_SAYFALAR.map');
    expect(altbilgi).toContain('HUKUKI_SAYFALAR.map');
    // Elle yazılmış rota: `href="/iletisim"` gibi bir düz dizge OLMAMALI.
    for (const s of KURUMSAL_SAYFALAR) {
      expect(altbilgi, s.yol).not.toContain(`"${s.yol}"`);
      expect(altbilgi, s.yol).not.toContain(`'${s.yol}'`);
    }
  });

  it('kimlik satırında meslek odası SABİTTEN basılıyor', () => {
    expect(altbilgi).toContain('SATICI.meslekOdasi');
    expect(altbilgi).not.toContain(SATICI.meslekOdasi);
  });

  it('kimlik yarım doldurulmuşken hiç gösterilmiyor (mevcut kural korundu)', () => {
    expect(altbilgi).toContain('SATICI.dolduruldu &&');
  });
});

describe('B — kurumsal kabuk: telefonda da görünen /fiyatlar yolu', () => {
  const kabuk = yorumsuz(oku(KABUK));

  // `telefon-menusu.test.ts` bu ölçütü `HukukiSayfa.tsx` için kuruyor; kurumsal
  // kabuk onun ikizi. İkizi ölçmezsek biri düzelip öteki geride kalır.
  it('/fiyatlar ve /login bağlantıları var, genişlikle gizlenmiyor', () => {
    expect(kabuk).toContain('href="/fiyatlar"');
    expect(kabuk).toContain('href="/login"');
    expect(kabuk).not.toMatch(/(sm|md|lg|xl):(hidden|invisible)/);
  });

  it('altbilgi kabukta mount edilmiş (iyzico: ana sayfadan erişim)', () => {
    expect(kabuk).toContain('<Altbilgi />');
  });

  // Taslak şeridi HUKUKİ metinlere aittir; buraya kopyalanırsa tanıtım sayfası
  // onay bekleyen bir sözleşme gibi görünür.
  it('taslak şeridi kurumsal kabukta YOK', () => {
    expect(kabuk).not.toContain('HUKUKI_METIN_DURUMU');
    expect(kabuk).not.toContain('Taslak metin');
  });
});
