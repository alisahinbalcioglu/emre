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
  mirasMi,
} from './abonelik-ozeti';
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
    expect(o.altMetin).toBe('Yenilenme 01.10.2026');
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

  it('ÖLÇÜT: dosya okundu ve kullanım kutusu hâlâ kota cümlesini basıyor', () => {
    expect(profil).toContain('kalanKotaCumlesi(kota)');
  });

  it('⭐ dönem bitişi kota yanıtından türetilip özete VERİLİYOR', () => {
    expect(profil).toContain('ceviriKota.kota?.donemBitis');
    expect(profil).toContain('abonelikOzeti(erisim, donemBitisi)');
  });

  it('⭐ sayfa tarihi KENDİ biçimlemiyor (ikiz biçimleyici yok)', () => {
    // İkinci bir `trTarih`/`toLocaleDateString` çağrısı, aynı ISO'dan farklı
    // gün yazabilirdi. Tarih biçimi TEK yerde: `ceviri-kota.ts` → `trTarih`.
    expect(profil).not.toContain('trTarih(');
    expect(profil).not.toContain('donemBitis)');
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
    const profil = readFileSync(join(__dirname, '..', '..', 'app', '(protected)', 'profile', 'page.tsx'), 'utf8');
    expect(ekranMetni(profil)).toMatch(/Aboneli(ğ|g)i iptal et/);
    expect(ekranMetni(sayfa)).not.toMatch(/Aboneli(ğ|g)i iptal et/);
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

  it('⭐ mevcut paket SUNUCUDAN okunur, ön yüzde yeniden hesaplanmaz', () => {
    expect(sayfa).toContain('data?.erisim');
    expect(sayfa).toContain('abonelikOzeti(erisim)');
    expect(sayfa).toContain('p.kod === mevcutPaketKodu');
  });

  it('⭐ bilgi gelmeden HİÇBİR kart işaretlenmez (yanlış kart = yanlış yükseltme)', () => {
    expect(sayfa).toContain('!!mevcutPaketKodu &&');
  });

  it('⭐ mevcut paketin düğmesi EYLEM ÜRETMEZ (disabled + ikinci kapı)', () => {
    expect(sayfa).toContain('disabled={mevcutMu}');
    // Düğme kapalıyken de satın alma başlamasın (klavye/eski durum).
    expect(sayfa).toMatch(/onClick=\{\(\) => \{[\s\S]{0,300}if \(mevcutMu\) return;/);
  });

  it('⭐ düğme metni pakete göre değişiyor, "seç" demiyor', () => {
    expect(sayfa).toContain("{mevcutMu ? 'Mevcut paketiniz' : 'Bu paketi seç'}");
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

  it('ÖLÇÜT: sözleşme iptali Profil sayfası + "Abonelik yönetimi" diye tarif ediyor', () => {
    expect(hukuki).toContain('Profil sayfasını açın, Abonelik kartındaki');
    expect(hukuki).toContain('Abonelik yönetimi');
  });

  it('⭐ tarif edilen adım GERÇEKTEN var (hesap sayfasında)', () => {
    expect(ekranMetni(profil)).toContain('Abonelik yönetimi');
    expect(profil).toContain("api.post('/abonelik/iptal'");
  });

  it('⭐ /abonelik ekranı AYNI yolu gösteriyor (düğme değil, yol)', () => {
    expect(ekranMetni(sayfa)).toContain('Abonelik yönetimi');
    expect(sayfa).toContain('href="/profile"');
  });
});

describe('⭐ BAGLANTI — hesap sayfasi GERCEK kaynagi okuyor', () => {
  const profil = readFileSync(
    join(__dirname, '..', '..', 'app', '(protected)', 'profile', 'page.tsx'),
    'utf8',
  );

  it('OLCUT: dosya okundu', () => {
    expect(profil.length).toBeGreaterThan(0);
  });

  it('⭐ rozet ekran adını basıyor, ham durum KODUNU basmıyor', () => {
    expect(profil).toContain('{ozet.durumEtiketi}');
    expect(profil).not.toContain('{ozet.durum}');
  });

  it('⭐ abonelik ozeti `erisim`den turetiliyor (ESKI tablodan DEGIL)', () => {
    // ⚠ 21.09: ikinci argüman (dönem bitişi) eklendi; kapı İLK argümana bakar.
    // Birebir `abonelikOzeti(erisim)` araması, doğru kaynak korunduğu hâlde
    // yalancı kırmızı verirdi.
    expect(profil).toMatch(/abonelikOzeti\(erisim[,)]/);
    expect(profil).not.toContain('profile.subscriptions');
  });

  it('⭐ ESKI `subscriptions` listesi artik ABONELIK olarak gosterilmiyor', () => {
    expect(profil).not.toContain('Aktif Abonelikler');
    expect(profil).not.toContain('profile.subscriptions.map');
  });

  it('⭐ iptal bagi ACILIR bolumun ICINDE (dogrudan gorunmuyor)', () => {
    // ⚠ Kelime aramak YETMEZ: ayni ifade bu bolumun ACIKLAMA yorumunda da
    // geciyor ve o yorum acilir bloktan ONCE. Gercek DUGMEYE bag: `onClick`
    // yalnizca calisan elemanda bulunur.
    const yonetim = profil.indexOf('yonetimAcik &&');
    const iptal = profil.indexOf('onClick={iptalEt}');
    expect(yonetim).toBeGreaterThan(-1);
    expect(iptal).toBeGreaterThan(yonetim);
  });

  it('⭐ yonetim bolumu YALNIZ iptal edilebilir abonelikte cikar', () => {
    // Yoksa sona ermis/askidaki abonelikte de "Abonelik yonetimi" gorunur
    // ve tiklayan kullanici bos bir bolum bulur.
    // ⚠ 21.09: kosula `sahipMi` eklendi; kapi IKI kosulu da olcer.
    expect(profil).toContain('{ozet.iptalEdilebilir && sahipMi && (');
  });

  it('⭐ iptal DÜĞMESİ yalnız SAHİPTE; üye düğmesiz tek satır bilgi görür', () => {
    // ÖLÇÜLDÜ: sunucu `POST /abonelik/iptal`i `@FirmaRolu('sahip')` ile
    // kapatıyor (abonelik.controller.ts). Bölüm role bakmadığı için üye
    // bağı görüyor, basıyor ve "İptal işlemi tamamlanamadı" alıyordu —
    // tıklanabilir ama ÇALIŞMAYAN bağ.
    const uyeDali = profil.indexOf('{ozet.iptalEdilebilir && !sahipMi && (');
    const sahipDali = profil.indexOf('{ozet.iptalEdilebilir && sahipMi && (');
    expect(uyeDali).toBeGreaterThan(-1);
    expect(sahipDali).toBeGreaterThan(uyeDali);
    // Düğme SAHİP dalının içinde: üye dalında `onClick` YOK.
    expect(profil.indexOf('onClick={iptalEt}')).toBeGreaterThan(sahipDali);
    // Üye boş bakmasın: ne yapması gerektiğini söyleyen TEK satır kalır.
    expect(ekranMetni(profil)).toContain('Aboneliği yalnız firma sahibi iptal edebilir');
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
    expect(profil).toContain('confirm(');
  });

  it('paket sayfasina yol var (iptal degil, YUKSELTME gorunur olsun)', () => {
    expect(profil).toContain("router.push('/abonelik')");
  });
});
