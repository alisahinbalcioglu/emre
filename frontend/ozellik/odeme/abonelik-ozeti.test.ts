import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import {
  ASGARI_IPTAL_TIKLAMASI,
  DURUM_ETIKET,
  IPTAL_ADIMLARI,
  abonelikOzeti,
  durumEtiketi,
  iptalYoluYeterinceDerinMi,
  katalogPaketAdi,
  mirasMi,
  paketGorunenAdi,
} from './abonelik-ozeti';
// Hesabım sekmeleri (23.09) — import'suz saf dosya, vitest doğrudan okur.
import { VARSAYILAN_SEKME, hesapSekmeleri } from '../kimlik/hesabim/hesabim';
// ⚠ Kullanım kutusunun GERÇEK cümlesi — iki kutunun aynı günü yazdığını
// varsaymak yerine ÖLÇMEK için birebir aynı fonksiyon çağrılır.
import { kalanKotaCumlesi, type CeviriKotaOzeti } from '../teklif/ceviri-kota';

/** `GET /ai/translate/kota` yanıtının örneği; dönem TR saatiyle 01.10.2026'da biter. */
const KOTA_ORNEGI: CeviriKotaOzeti = {
  paketKodu: 'pro-mek',
  kota: { satir: 9000, dosya: 120 },
  donemBaslangic: '2026-08-30T21:00:00.000Z',
  donemBitis: '2026-09-30T21:00:00.000Z',
  kullanilanSatir: 0,
  kullanilanDosya: 0,
  kalanSatir: 9000,
  kalanDosya: 120,
};

/**
 * Abonelik ozeti + IPTAL YOLUNUN DERINLIGI (03.09 kullanici karari).
 *
 * ⚠ EN KRITIK BLOK "KAYNAK": profildeki abonelik kutusu ESKI
 * `UserSubscription` tablosunu gosteriyordu ve `/abonelik` sayfasindaki
 * GERCEK kayitla CELISIYORDU ("MEP — Suresiz" vs "miras-pro AKTIF").
 * Tasima sirasinda yanlis kaynagi tasimak, yanlis veriyi TEK kaynak
 * yapardi.
 */

describe('abonelikOzeti', () => {
  it('⭐ karar YOKKEN "abonelik yok" DEMEZ (bilmiyoruz ≠ yok)', () => {
    const o = abonelikOzeti(null);
    expect(o.altMetin).toContain('yükleniyor');
    expect(o.iptalEdilebilir).toBe(false);
  });

  it('paket yoksa paket secmeye yonlendirir', () => {
    const o = abonelikOzeti({ paketKodu: null, durum: 'SONA_ERDI', kalanGun: null });
    expect(o.baslik).toBe('Abonelik yok');
    expect(o.iptalEdilebilir).toBe(false);
  });

  it('⭐ 23.09 VİTRİN: paketi HİÇ olmamış yeni hesaba "Sona erdi" rozeti YAZILMAZ', () => {
    // Sunucu "abonelik satırı yok" dalında durumu teknik olarak SONA_ERDI taşır.
    const yeni = abonelikOzeti({ paketKodu: '', durum: 'SONA_ERDI', kalanGun: null, vitrin: true });
    expect(yeni.baslik).toBe('Abonelik yok');
    expect(yeni.durumEtiketi).toBe('');
    // Süresi BİTMİŞ abone (vitrin değil) nedeni rozette okumaya devam eder.
    const biten = abonelikOzeti({ paketKodu: '', durum: 'SONA_ERDI', kalanGun: null });
    expect(biten.durumEtiketi).toBe('Sona erdi');
    expect(abonelikOzeti({ paketKodu: '', durum: 'SONA_ERDI', kalanGun: null, vitrin: false }).durumEtiketi).toBe('Sona erdi');
  });

  it('⭐ goc paketi musteriye TEKNIK KODLA gosterilmez', () => {
    const o = abonelikOzeti({ paketKodu: 'miras-pro', durum: 'AKTIF', kalanGun: 300 });
    expect(o.baslik).toBe('Geçiş paketi');
    expect(o.baslik).not.toContain('miras');
  });

  it('gercek paket kodu oldugu gibi gosterilir', () => {
    expect(abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: 12 }).baslik)
      .toBe('pro-mek');
  });

  it('kalan gun metne cevrilir', () => {
    expect(abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: 23 }).altMetin)
      .toContain('23');
  });

  it('kalan gun bilinmiyorsa UYDURULMAZ', () => {
    const o = abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: null });
    expect(o.altMetin).toContain('belirtilmemiş');
    expect(o.altMetin).not.toMatch(/\d/);
  });

  it('⭐ iptal YALNIZ yasayan abonelikte anlamli', () => {
    for (const d of ['AKTIF', 'DENEME']) {
      expect(abonelikOzeti({ paketKodu: 'pro-mek', durum: d, kalanGun: 5 }).iptalEdilebilir).toBe(true);
    }
    for (const d of ['SONA_ERDI', 'ASKIDA', 'IPTAL']) {
      expect(abonelikOzeti({ paketKodu: 'pro-mek', durum: d, kalanGun: 0 }).iptalEdilebilir).toBe(false);
    }
  });

  it('goc paketi de iptal EDILEBILIR (musteri cikabilmeli)', () => {
    expect(abonelikOzeti({ paketKodu: 'miras-pro', durum: 'AKTIF', kalanGun: 300 }).iptalEdilebilir)
      .toBe(true);
  });

  it('⭐ durum rozeti KOD değil ekran adı gösterir (Faz 6.1 kapanış)', () => {
    const o = abonelikOzeti({ paketKodu: 'pro-mek', durum: 'SONA_ERDI', kalanGun: 0 });
    expect(o.durum).toBe('SONA_ERDI'); // karar kodu değişmedi
    expect(o.durumEtiketi).toBe('Sona erdi');
  });

  it('yedi durumun yedisinin de Türkçe ekran adı var', () => {
    expect(DURUM_ETIKET).toEqual({
      DENEME: 'Deneme',
      AKTIF: 'Aktif',
      ODEME_BEKLIYOR: 'Ödeme bekliyor',
      KISITLI: 'Kısıtlı',
      ASKIDA: 'Askıda',
      IPTAL: 'İptal edildi',
      SONA_ERDI: 'Sona erdi',
    });
  });

  it('tanımsız kod boş rozet olmaz, kod aynen gösterilir; kod yoksa boş', () => {
    expect(durumEtiketi('YENI_DURUM')).toBe('YENI_DURUM');
    expect(durumEtiketi('')).toBe('');
    expect(abonelikOzeti(null).durumEtiketi).toBe('');
  });

  it('mirasMi ayrimi', () => {
    expect(mirasMi('miras-core')).toBe(true);
    expect(mirasMi('pro-mek')).toBe(false);
    expect(mirasMi(null)).toBe(false);
  });
});

/**
 * ⭐ PAKETİN GERÇEK ADI — KATALOGDAN (23.09.2026, Hesabım tasarımı)
 *
 * Başlık, kod katalogda aranmadan KODUN KENDİSİYDİ: satın alınmış paket
 * müşteriye "pro-mek" diye görünüyordu (Hesabım'da ve `/abonelik`teki "Şu
 * anki paketiniz" satırında). Tasarım adı kimlik satırına da taşıdı.
 */
describe('⭐ katalog adı — satın alınan paket kodla gösterilmez', () => {
  const KATALOG = [
    { kod: 'core-mek', ad: 'Basic — Mekanik' },
    { kod: 'pro-mek', ad: 'Pro — Mekanik' },
  ];

  it('kod katalogdaysa ADI döner', () => {
    expect(katalogPaketAdi('pro-mek', KATALOG)).toBe('Pro — Mekanik');
  });

  it('katalogda yoksa / katalog yoksa / kod yoksa null (ad UYDURULMAZ)', () => {
    expect(katalogPaketAdi('miras-pro', KATALOG)).toBeNull();
    expect(katalogPaketAdi('pro-mek', null)).toBeNull();
    expect(katalogPaketAdi(null, KATALOG)).toBeNull();
    expect(katalogPaketAdi('', KATALOG)).toBeNull();
    expect(katalogPaketAdi('x', [{ kod: 'x', ad: '   ' }])).toBeNull();
  });

  it('⭐ özet başlığı katalog adını kullanır', () => {
    const o = abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: null }, null, 'Pro — Mekanik');
    expect(o.baslik).toBe('Pro — Mekanik');
    expect(o.paketKodu).toBe('pro-mek'); // eşleştirme HAM kodla sürer
  });

  it('katalog adı yoksa eski davranış BİREBİR: göç paketi "Geçiş paketi", öbürü kod', () => {
    expect(abonelikOzeti({ paketKodu: 'miras-pro', durum: 'AKTIF', kalanGun: null }, null, null).baslik)
      .toBe('Geçiş paketi');
    expect(abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: null }, null, '  ').baslik)
      .toBe('pro-mek');
  });

  it('paket yokken katalog adı başlığı DEĞİŞTİRMEZ (paket adı uydurulmaz)', () => {
    expect(abonelikOzeti({ paketKodu: null, durum: 'SONA_ERDI', kalanGun: null }, null, 'Pro — Mekanik').baslik)
      .toBe('Abonelik yok');
  });

  /**
   * ⭐ HAM KOD HİÇBİR DURUMDA (23.09 kod incelemesi): yalnız katalog adına
   * bakılsaydı katalog okunamayınca ya da paket satıştan kalkınca rozet yine
   * "pro-mek" derdi — eski ekran o durumda en azından "Pro Plan" diyordu.
   */
  describe('paketGorunenAdi — katalog → seviye adı → (göçte) null', () => {
    it('katalogda varsa katalog adı kazanır', () => {
      expect(paketGorunenAdi('pro-mek', KATALOG, 'Pro')).toBe('Pro — Mekanik');
    });

    it('⭐ katalog OKUNAMADIYSA seviye adına düşer (kod basılmaz)', () => {
      expect(paketGorunenAdi('pro-mek', null, 'Pro')).toBe('Pro');
    });

    it('⭐ paket satıştan KALKTIYSA (katalogda yok) seviye adına düşer', () => {
      expect(paketGorunenAdi('pro-eski', KATALOG, 'Pro')).toBe('Pro');
    });

    it('göç paketinde null → özet onu "Geçiş paketi" diye adlandırır (seviye adı DEĞİL)', () => {
      expect(paketGorunenAdi('miras-pro', KATALOG, 'Pro')).toBeNull();
      const o = abonelikOzeti(
        { paketKodu: 'miras-pro', durum: 'AKTIF', kalanGun: null },
        null,
        paketGorunenAdi('miras-pro', KATALOG, 'Pro'),
      );
      expect(o.baslik).toBe('Geçiş paketi');
    });

    it('⭐ UÇTAN UCA: hiçbir yedekte başlık ham kod DEĞİL', () => {
      for (const katalog of [KATALOG, null, []]) {
        const o = abonelikOzeti(
          { paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: null },
          null,
          paketGorunenAdi('pro-mek', katalog, 'Pro'),
        );
        expect(o.baslik).not.toBe('pro-mek');
      }
    });
  });

  it('⭐ BAĞLANTI: iki ekran da adı KATALOGDAN verir', () => {
    const profil = readFileSync(join(__dirname, '..', '..', 'app', '(protected)', 'profile', 'page.tsx'), 'utf8');
    const abonelik = readFileSync(join(__dirname, '..', '..', 'app', '(protected)', 'abonelik', 'page.tsx'), 'utf8');
    // Hesabım: katalog + SEVİYE yedeği (rozet ile paket kartı aynı adı basar).
    expect(profil).toContain('paketGorunenAdi(erisim?.paketKodu, katalog, tier ? paketRozeti(tier) : null)');
    expect(profil).toContain("api.get<{ kod: string; ad: string }[]>('/abonelik/paketler')");
    // `/abonelik` katalog listesinin KENDİSİNİ çizer; AYNI kural, AYNI yedek.
    expect(abonelik).toContain('paketGorunenAdi(erisim?.paketKodu, paketler, seviye ? paketRozeti(seviye) : null)');
    expect(abonelik).toContain("setSeviye(typeof data?.tier === 'string' ? data.tier : null);");
  });
});

/**
 * ⭐ İKİ PANELİN ÇELİŞKİSİ (21.09.2026 — t.10)
 *
 * Hesap sayfasında kullanım kutusu "yenilenme 01.10.2026" derken abonelik
 * kutusu "Yenileme tarihi belirtilmemiş" diyordu.
 *
 * ÖLÇÜM (kaynak koddan, tahmin değil):
 *  · Kullanım: `/ai/translate/kota` → `donemBitis` = `kotaDonemi(Abonelik.olusturuldu,
 *    PaketSurumu.periyot, periyotAdedi)` — "abonelik dönemi, TAKVİM AYI DEĞİL".
 *  · Abonelik: `/auth/me` → `erisim.kalanGun` = deneme/tolerans geri sayımı;
 *    `case AKTIF` dalında sunucu BİLEREK `null` döndürür.
 *  → İki dönem yok, TEK dönem var; ikinci kutu yanlış alanı okuyordu.
 */
describe('⭐ yenilenme günü — kullanım kutusuyla TEK kaynak', () => {
  const ISO = '2026-09-30T21:00:00.000Z'; // TR saatiyle 01.10.2026

  it('ÖLÇÜT: kullanım kutusunun cümlesi bu ISO için "01.10.2026" diyor', () => {
    expect(kalanKotaCumlesi(KOTA_ORNEGI)).toContain('yenilenme 01.10.2026');
  });

  it('⭐ AKTIF + kalanGun null → artık "belirtilmemiş" DEMİYOR, günü yazıyor', () => {
    const o = abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: null }, ISO);
    // 23.09: iki nokta tasarımdan ("Yenilenme: 01.10.2026").
    expect(o.altMetin).toBe('Yenilenme: 01.10.2026');
    expect(o.altMetin).not.toContain('belirtilmemiş');
  });

  it('⭐ İKİ KUTU AYNI GÜNÜ YAZIYOR (çelişki kapandı)', () => {
    const abonelik = abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: null }, ISO);
    const kullanim = kalanKotaCumlesi(KOTA_ORNEGI);
    expect(abonelik.yenilenmeGunu).toBe('01.10.2026');
    expect(kullanim).toContain(abonelik.yenilenmeGunu!);
  });

  it('dönem bilinmiyorsa UYDURULMAZ (eski cümle korunur)', () => {
    const o = abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: null }, null);
    expect(o.altMetin).toContain('belirtilmemiş');
    expect(o.altMetin).not.toMatch(/\d/);
    expect(o.yenilenmeGunu).toBeNull();
  });

  it('geçersiz ISO tarih UYDURMAZ', () => {
    expect(abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: null }, 'abc').yenilenmeGunu)
      .toBeNull();
  });

  it('⭐ GERİ SAYIM VARSA O KAZANIR (deneme/iptal günü ≠ yenilenme günü)', () => {
    // DENEME'de `kalanGun` deneme bitişine kalan gündür; dönem bitişiyle
    // birlikte yazmak ekranda YENİ bir çelişki üretirdi.
    const o = abonelikOzeti({ paketKodu: 'pro-mek', durum: 'DENEME', kalanGun: 7 }, ISO);
    expect(o.altMetin).toBe('7 gün kaldı');
    expect(o.altMetin).not.toContain('01.10.2026');
    // Gün yine de taşınır: ekran isterse ayrı etiketle gösterebilir.
    expect(o.yenilenmeGunu).toBe('01.10.2026');
  });

  it('abonelik yokken yenilenme günü YOK (dönem gelse bile)', () => {
    expect(abonelikOzeti({ paketKodu: null, durum: 'SONA_ERDI', kalanGun: null }, ISO).yenilenmeGunu)
      .toBeNull();
    expect(abonelikOzeti(null, ISO).yenilenmeGunu).toBeNull();
  });

  it('ikinci argüman VERİLMEZSE davranış eskisiyle birebir aynı', () => {
    expect(abonelikOzeti({ paketKodu: 'pro-mek', durum: 'AKTIF', kalanGun: null }).altMetin)
      .toBe('Yenileme tarihi belirtilmemiş');
  });
});

describe('⭐ BAĞLANTI — hesap sayfası dönemi kotadan okuyor', () => {
  const profil = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'profile', 'page.tsx'),
    'utf8',
  );
  // 23.09.2026: kullanım kartı Hesabım › Abonelik sekmesine taşındı.
  const abonelikSekmesi = readFileSync(
    join(__dirname, '..', 'kimlik', 'hesabim', 'AbonelikSekmesi.tsx'),
    'utf8',
  );

  it('ÖLÇÜT: dosyalar okundu ve kullanım kartı yenilenme gününü ÖZETTEN basıyor', () => {
    // Eskiden kanıt `kalanKotaCumlesi(kota)` idi; tasarımdaki kart günü tek
    // cümleyle söylüyor ve gün paket kartıyla AYNI alandan (`ozet.yenilenmeGunu`).
    expect(abonelikSekmesi).toContain('Kotalar {ozet.yenilenmeGunu} tarihinde yenilenir.');
    expect(abonelikSekmesi).toContain('{paketliMi ? ozet.altMetin :');
  });

  it('⭐ dönem bitişi kota yanıtından türetilip özete VERİLİYOR', () => {
    expect(profil).toContain('ceviriKota.kota?.donemBitis');
    // Çağrı çok satırlı yazılabilir; kapı boşluğa değil ARGÜMAN SIRASINA bakar.
    expect(profil).toMatch(/abonelikOzeti\(\s*erisim,\s*donemBitisi[,)]/);
    // Özet sekmeye GEÇİYOR (sekme ikinci bir özet kurmuyor).
    expect(profil).toContain('ozet={ozet}');
    expect(abonelikSekmesi).not.toContain('abonelikOzeti(');
  });

  it('⭐ ekran tarihi KENDİ biçimlemiyor (ikiz biçimleyici yok)', () => {
    // İkinci bir `trTarih`/`toLocaleDateString` çağrısı, aynı ISO'dan farklı
    // gün yazabilirdi. Tarih biçimi TEK yerde: `ceviri-kota.ts` → `trTarih`.
    for (const kaynak of [profil, abonelikSekmesi]) {
      expect(kaynak).not.toContain('trTarih(');
      expect(kaynak).not.toContain('donemBitis)');
    }
    expect(abonelikSekmesi).not.toContain('toLocaleDateString');
  });
});

describe('iptal yolunun derinligi', () => {
  it('ilan edilen adimlar asgari tiklamayi saglar', () => {
    expect(iptalYoluYeterinceDerinMi()).toBe(true);
    expect(IPTAL_ADIMLARI.length).toBeGreaterThanOrEqual(ASGARI_IPTAL_TIKLAMASI);
  });

  it('kural sinirinin ALTI reddedilir', () => {
    expect(iptalYoluYeterinceDerinMi(['a', 'b'])).toBe(false);
  });
});

/** JSX metni + dizgeler; yorumlar AST'de dugum olmadigi icin girmez. */
function ekranMetni(kaynak: string): string {
  const sf = ts.createSourceFile('s.tsx', kaynak, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const gez = (n: ts.Node): void => {
    if (ts.isJsxText(n) || ts.isStringLiteral(n)) out.push(n.text.replace(/\s+/g, ' ').trim());
    n.forEachChild(gez);
  };
  gez(sf);
  return out.join(' | ');
}

/**
 * `<button>` / `<Button>` ogelerinin ICINDEKI metin (JSX metni + dizgeler),
 * dugme basina bir kayit. Bir ifadenin DUGME mi yoksa yol tarifi mi oldugunu
 * ayirmak icin (23.09).
 */
function dugmeMetinleri(kaynak: string): string[] {
  const sf = ts.createSourceFile('s.tsx', kaynak, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  // ⚠ Yalnız ÇOCUKLAR okunur: öznitelik dizgeleri (`type="button"`,
  // `className`) düğmenin METNİ değildir ve ölçütü kirletirdi.
  const metni = (n: ts.JsxElement): string => {
    const parca: string[] = [];
    const gez = (m: ts.Node): void => {
      if (ts.isJsxAttributes(m)) return;
      if (ts.isJsxText(m) || ts.isStringLiteral(m)) parca.push(m.text.replace(/\s+/g, ' ').trim());
      m.forEachChild(gez);
    };
    n.children.forEach(gez);
    return parca.filter(Boolean).join(' ');
  };
  const gez = (n: ts.Node): void => {
    if (ts.isJsxElement(n) && /^(button|Button)$/.test(n.openingElement.tagName.getText())) {
      out.push(metni(n));
    }
    n.forEachChild(gez);
  };
  gez(sf);
  return out;
}

describe('⭐ BAGLANTI — iptal /abonelik sayfasindan KALKTI', () => {
  const sayfa = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'abonelik', 'page.tsx'),
    'utf8',
  );

  it('OLCUT: sayfa okundu ve hala paket seciyor', () => {
    expect(sayfa).toContain('Bu paketi seç');
  });

  it('⭐ iptal DUGMESI yok', () => {
    // ⚠ 15.09: eski assert ham metinde `>Aboneligi iptal et<` ariyordu. Gercek
    // JSX'te metin kendi satirinda girintili durdugu icin dugme geri gelse de
    // ESLESMEZDI (yalanci yesil). Yorum dugum degildir: ekran metni AST'den
    // okunur, pozitif kontrol hesap sayfasindaki GERCEK dugmeyi gorur.
    // ⚠ 23.09: olcut METINDEN DUGMEYE daraldi. Bu sayfa artik iptalin NEREDE
    // oldugunu adiyla soyluyor ("Hesabım → Abonelik sekmesi → “Aboneliği iptal
    // et”"); aranan sey o ifade degil, o ifadeyi TASIYAN DUGME. Olcut dugme
    // metnini okur — metin eslesmesi yol tarifini de dugme sanardi.
    const abonelikSekmesi = readFileSync(join(__dirname, '..', 'kimlik', 'hesabim', 'AbonelikSekmesi.tsx'), 'utf8');
    expect(dugmeMetinleri(abonelikSekmesi).join(' | ')).toMatch(/Aboneli(ğ|g)i iptal et/);
    expect(dugmeMetinleri(sayfa).length, 'OLCUT: sayfada dugme bulunamadi').toBeGreaterThan(0);
    expect(dugmeMetinleri(sayfa).join(' | ')).not.toMatch(/iptal et/i);
  });

  it('⭐ iptal UCU bu sayfadan cagrilmiyor', () => {
    expect(sayfa).not.toContain("'/abonelik/iptal'");
  });

  it('⭐ "Mevcut durum" karti kalkti (bilgi hesap sayfasinda)', () => {
    expect(sayfa).not.toContain('Mevcut durum</p>');
  });

  it('sayfa erisim kapisi TASIMAMAYA devam ediyor (odeme kapisi)', () => {
    // Askidaki firma buradan odeyebilmeli; kapatilirsa kilitlenir.
    expect(sayfa).not.toContain('GerekliYetenek');
  });
});

/**
 * ⭐ MEVCUT PAKET İŞARETİ (21.09.2026 — t.9)
 *
 * PRO hesapta `/abonelik` beş kartı da aynı gösteriyordu ve beşinde de
 * "Bu paketi seç" vardı: kullanıcı zaten kullandığı pakete basabiliyordu.
 */
describe('⭐ /abonelik — mevcut paket işareti', () => {
  const sayfa = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'abonelik', 'page.tsx'),
    'utf8',
  );

  it('ÖLÇÜT: sayfa okundu ve hâlâ kart ızgarası çiziyor', () => {
    expect(sayfa).toContain('paketler.map');
  });

  it('⭐ eşleşme HAM KODLA yapılır — başlık "Geçiş paketi" olsa bile', () => {
    // Ekran `ozet.paketKodu` ile eşleştirir; `baslik` göç paketinde farklıdır.
    const o = abonelikOzeti({ paketKodu: 'miras-pro', durum: 'AKTIF', kalanGun: null });
    expect(o.baslik).toBe('Geçiş paketi');
    expect(o.paketKodu).toBe('miras-pro');
  });

  // ⚠ 23.09 (paket değişimi): "mevcut mu" kararı `paket-degisimi.ts` →
  // `mevcutPaketMi`e TAŞINDI ve SUNUCU KAYNAKLI oldu (`degisim.kod ===
  // 'AYNI_PAKET'`). Eski eşitlik kuralı yalnız sunucu `degisim` göndermezse
  // (eski sunucu) geçerli. Aşağıdaki kapılar AYNI kuralları yeni yerlerinde
  // ölçer; biri gevşetilmedi. Neden taşındı: eski kural SÜRESİ BİTMİŞ
  // aboneliğin paketini de kilitliyordu (`ErisimKarari.paketKodu` SONA_ERDI'de
  // de doludur) — müşteri eski paketini yeniden satın alamıyordu.
  const degisimModulu = readFileSync(join(__dirname, 'paket-degisimi.ts'), 'utf8');

  it('⭐ mevcut paket SUNUCUDAN okunur, ön yüzde yeniden hesaplanmaz', () => {
    expect(sayfa).toContain('data?.erisim');
    // ⚠ 23.09: üçüncü argüman (katalog adı) eklendi; kapı İLK argümana bakar
    // (çağrı çok satırlı yazılabilir — boşluk serbest).
    expect(sayfa).toMatch(/abonelikOzeti\(\s*erisim[,)]/);
    expect(sayfa).toContain('const mevcutMu = mevcutPaketMi(p, mevcutPaketKodu);');
    // Sunucu söylüyorsa sunucu; eşitlik yalnız geriye dönük yedek.
    expect(degisimModulu).toContain("if (p.degisim) return p.degisim.yol === 'yok' && p.degisim.kod === 'AYNI_PAKET';");
    expect(degisimModulu).toContain('p.kod === mevcutPaketKodu');
  });

  it('⭐ bilgi gelmeden HİÇBİR kart işaretlenmez (yanlış kart = yanlış yükseltme)', () => {
    // Yedek dal (sunucu `degisim` göndermedi) bilgi yokken işaretlemez; sunucu
    // dalı yalnız `AYNI_PAKET` der — o da firmanın aboneliğinden hesaplanan
    // BİLGİNİN KENDİSİDİR.
    expect(degisimModulu).toContain('return !!mevcutPaketKodu && p.kod === mevcutPaketKodu;');
  });

  it('⭐ mevcut paketin düğmesi EYLEM ÜRETMEZ (disabled + ikinci kapı)', () => {
    expect(sayfa).toContain("disabled={eylem.tur === 'mevcut' || eylem.tur === 'kapali'}");
    // Düğme kapalıyken de hiçbir işlem başlamasın (klavye/eski durum).
    expect(sayfa).toMatch(/onClick=\{\(\) => \{[\s\S]{0,300}if \(eylem\.tur === 'mevcut' \|\| eylem\.tur === 'kapali'\) return;/);
    // Mevcut paket → 'mevcut' eylemi (rol ne olursa olsun): kural modülde.
    expect(degisimModulu).toContain("if (g.mevcutMu) return { tur: 'mevcut' };");
  });

  it('⭐ düğme metni pakete göre değişiyor, "seç" demiyor', () => {
    expect(sayfa).toMatch(
      /\{eylem\.tur === 'mevcut'\s*\?\s*'Mevcut paketiniz'\s*:\s*eylem\.tur === 'satin-al'\s*\?\s*'Bu paketi seç'\s*:\s*'Bu pakete geç'\}/,
    );
  });

  it('kart rozeti + düğme metni "Mevcut paketiniz" diyor', () => {
    expect((sayfa.match(/Mevcut paketiniz/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('⭐ kart vurgusu ızgara sınıflarını BOZMUYOR (className düz dizge)', () => {
    // Faz 6.1 kart hizası kapısı sınıfları AST'den okur; şablon dizge
    // kullanılsaydı ızgara "yok" sanılır ve o kapı kırmızı olurdu.
    expect(sayfa).toContain('data-mevcut={mevcutMu ?');
    expect(sayfa).toMatch(/className="row-span-5 grid grid-rows-subgrid/);
  });
});

/**
 * ⭐ İPTAL YOLU — EKRAN ile SÖZLEŞME AYNI YOLU SÖYLÜYOR MU?
 *
 * Ölçüldü: iptal akışı VAR (hesap sayfası) ve sözleşme onu tarif ediyor.
 * `/abonelik` ekranı ise iptalden hiç söz etmiyordu. Düğme BURAYA KONMAZ
 * (03.09 kararı), yalnız sözleşmedeki yol gösterilir.
 */
describe('⭐ iptal yolu — sözleşme metniyle tutarlılık', () => {
  const hukuki = readFileSync(join(__dirname, '..', 'hukuki', 'metinler.ts'), 'utf8');
  const sayfa = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'abonelik', 'page.tsx'),
    'utf8',
  );
  const profil = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'profile', 'page.tsx'),
    'utf8',
  );
  // 23.09.2026: Hesabım sekmelere bölündü; iptal düğmesi Abonelik sekmesinde.
  const abonelikSekmesi = readFileSync(
    join(__dirname, '..', 'kimlik', 'hesabim', 'AbonelikSekmesi.tsx'),
    'utf8',
  );
  const sekmeler = readFileSync(join(__dirname, '..', 'kimlik', 'hesabim', 'hesabim.ts'), 'utf8');

  it('ÖLÇÜT: sözleşme iptali Hesabım › Abonelik sekmesi › düğme diye tarif ediyor', () => {
    expect(hukuki).toContain(
      'Hesabım sayfasını açın, Abonelik sekmesine geçin ve \\"Aboneliği iptal et\\" düğmesine basın.',
    );
    // Eski tarif (artık ekranda OLMAYAN açılır bölüm) KALMADI. Yorumlar
    // soyulur: değişikliği ANLATAN not metnin parçası değildir.
    const metin = hukuki.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(metin).not.toContain('Abonelik kartındaki');
    expect(metin).not.toContain('Abonelik yönetimi');
  });

  it('⭐ tarif edilen adımlar GERÇEKTEN var (hesap sayfasında)', () => {
    // 1) "Abonelik" adında bir sekme var ve sayfa onu çiziyor.
    expect(sekmeler).toContain("abonelik: 'Abonelik',");
    expect(profil).toMatch(/\babonelik: \(\) => \(?\s*<AbonelikSekmesi\b/);
    // 2) O sekmede "Aboneliği iptal et" DÜĞMESİ ve gerçek uç çağrısı var.
    expect(dugmeMetinleri(abonelikSekmesi)).toContain('Aboneliği iptal et');
    expect(abonelikSekmesi).toContain("api.post('/abonelik/iptal'");
  });

  it('⭐ /abonelik ekranı AYNI yolu gösteriyor (düğme değil, yol)', () => {
    // JSX metni `&quot;` varlığını çözülmemiş taşır; ölçüt ikisini de kabul eder.
    expect(ekranMetni(sayfa)).toMatch(/Abonelik sekmesi → (&quot;|")Aboneliği iptal et(&quot;|")\./);
    // ⚠ Bağ Hesabım'ın KAPISINA gider, Abonelik sekmesine DEĞİL: sekmeyi
    // doğrudan açan bağ iptali bir tık öne çekerdi (03.09 derinlik kararı —
    // "iptal en az üç tıklama"). Yol yazıyla tarif edilir, kısaltılmaz.
    expect(sayfa).toContain('href="/profile"');
    // Yorum soyulur (`ekranMetni` = JSX metni + dizgeler): kararı ANLATAN
    // not "`?sekme=abonelik` DEĞİL" diye geçer ve ölçütü kirletirdi.
    expect(ekranMetni(sayfa)).not.toContain('sekme=abonelik');
    expect(ekranMetni(sayfa)).not.toContain('Abonelik yönetimi');
  });
});

describe('⭐ BAGLANTI — hesap sayfasi GERCEK kaynagi okuyor', () => {
  const profil = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'profile', 'page.tsx'),
    'utf8',
  );
  // 23.09.2026: abonelik kartları Hesabım › Abonelik sekmesine taşındı. Kapılar
  // aynı kuralı ölçer; ölçülen dosya kartın YENİ yeridir.
  const sekme = readFileSync(join(__dirname, '..', 'kimlik', 'hesabim', 'AbonelikSekmesi.tsx'), 'utf8');
  const ekipErisimi = readFileSync(join(__dirname, '..', 'kimlik', 'hesabim', 'EkipErisimiSekmesi.tsx'), 'utf8');

  it('OLCUT: dosyalar okundu', () => {
    expect(profil.length).toBeGreaterThan(0);
    expect(sekme).toContain('export function AbonelikSekmesi');
  });

  it('⭐ rozet ekran adını basıyor, ham durum KODUNU basmıyor', () => {
    expect(sekme).toContain('{ozet.durumEtiketi}');
    expect(sekme).not.toContain('{ozet.durum}');
    expect(profil).not.toContain('{ozet.durum}');
  });

  it('⭐ abonelik ozeti `erisim`den turetiliyor (ESKI tablodan DEGIL)', () => {
    // ⚠ 21.09: ikinci argüman (dönem bitişi) eklendi; kapı İLK argümana bakar.
    // Birebir `abonelikOzeti(erisim)` araması, doğru kaynak korunduğu hâlde
    // yalancı kırmızı verirdi.
    // 23.09: çağrı çok satırlı yazıldı; kapı boşluğa takılmaz.
    expect(profil).toMatch(/abonelikOzeti\(\s*erisim[,)]/);
    expect(profil).not.toContain('profile.subscriptions');
    expect(sekme).not.toContain('profile.subscriptions');
  });

  it('⭐ ESKI `subscriptions` listesi artik ABONELIK olarak gosterilmiyor', () => {
    for (const kaynak of [profil, sekme]) {
      expect(kaynak).not.toContain('Aktif Abonelikler');
      expect(kaynak).not.toContain('profile.subscriptions.map');
    }
  });

  it('⭐ iptal düğmesi Abonelik SEKMESİNDE — Hesabım açılınca doğrudan görünmüyor', () => {
    // 03.09 kararı "en az üç tıklama". Eskiden ikinci adım "Abonelik yönetimi ▾"
    // açılır bölümüydü; 23.09'dan beri ABONELİK SEKMESİ. Ölçülen:
    //   · Hesabım varsayılan olarak Profil sekmesinde açılır,
    //   · Abonelik kartı yalnız PANEL haritasının `abonelik` girdisidir (sekme
    //     açılmadan çizilmez — `hesabim.test.ts` BAĞLANTI bloğu ölçer),
    //   · çalışan düğme (`onClick={iptalEt}`) sayfada DEĞİL sekmededir.
    expect(VARSAYILAN_SEKME).toBe('profil');
    expect(profil).toMatch(/\babonelik: \(\) => \(?\s*<AbonelikSekmesi\b/);
    expect(profil).not.toContain('onClick={iptalEt}');
    expect(sekme).toContain('onClick={iptalEt}');
    // İlan edilen yol ekranla aynı adı taşıyor.
    expect(IPTAL_ADIMLARI[1]).toBe('abonelik-sekmesi');
  });

  it('⭐ iptal satırı YALNIZ iptal edilebilir abonelikte çıkar', () => {
    // Yoksa sona ermiş/askıdaki abonelikte de iptal satırı görünür ve
    // tıklayan kullanıcı çalışmayan bir düğme bulur.
    // ⚠ 21.09: kosula `sahipMi` eklendi; kapi IKI kosulu da olcer.
    const sahipDali = sekme.indexOf('{ozet.iptalEdilebilir && sahipMi && (');
    expect(sahipDali).toBeGreaterThan(-1);
    expect(sekme.indexOf('onClick={iptalEt}')).toBeGreaterThan(sahipDali);
  });

  it('⭐ iptal DÜĞMESİ yalnız SAHİPTE; üye ne yapacağını bilir', () => {
    // ÖLÇÜLDÜ: sunucu `POST /abonelik/iptal`i `@FirmaRolu('sahip')` ile
    // kapatıyor (abonelik.controller.ts). 21.09'a kadar üye bağı görüyor,
    // basıyor ve "İptal işlemi tamamlanamadı" alıyordu — ÇALIŞMAYAN bağ.
    // 23.09: üye Abonelik sekmesini HİÇ görmez (sekme kararı tek yerde).
    expect(hesapSekmeleri(false)).not.toContain('abonelik');
    expect(hesapSekmeleri(true)).toContain('abonelik');
    // Sekme başka yerde kullanılırsa diye bileşen de sahipliğe bakıyor ve
    // değer sayfadan geçiyor (yeniden hesaplanmıyor).
    expect(profil).toContain('sahipMi={sahipMi}');
    // Üye boş bakmasın: ne yapması gerektiğini Ekip erişimim sekmesi söyler.
    expect(ekranMetni(ekipErisimi)).toContain('Firma bilgilerini, aboneliği ve faturayı firma yöneticiniz yönetir.');
  });

  it('⭐ sahiplik kararı FAIL-CLOSED kaynaktan (üyeye düğme açılmasın)', () => {
    // `sahipMi` fail-open olursa (`firmaRol ?? 'sahip'`) alan yanıttan
    // düştüğünde HERKES sahip sayılır ve düğme yine üyeye açılır.
    // ⚠ Fail-open desenin YOKLUĞU burada ölçülmez: desen bu dosyada
    // YORUMDA geçiyor ve ham metin araması yalancı kırmızı verir. O kapı
    // yorumları ayıklayarak ölçülüyor: `ozellik/firma/ekip/ekip-ekranlari.test.ts`
    // → describe('profil — fail-open düzeltmesi'). Burada yalnız POZİTİF
    // kaynak ölçülür.
    expect(profil).toContain("profile.firmaRol === 'sahip'");
  });

  it('⭐ iptal ONAY ister (dorduncu emniyet)', () => {
    expect(sekme).toContain('confirm(');
  });

  it('paket sayfasina yol var (iptal degil, YUKSELTME gorunur olsun)', () => {
    expect(sekme).toContain('href="/abonelik"');
    expect(sekme).toContain('Paketleri gör');
  });
});
