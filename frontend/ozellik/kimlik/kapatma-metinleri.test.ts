/**
 * HESAP KAPATMA METNİ — saf karar + EKRANA BAĞLANTI + SUNUCU SÖZLEŞMESİ.
 * (veri imhası turu §8.1 · 21.09.2026)
 *
 * ⚠ ÜÇ AYAK, ÜÇÜ DE GEREKLİ:
 *   1. Fonksiyon doğru metni seçiyor mu
 *   2. EKRAN bu fonksiyonu gerçekten kullanıyor ve eski cümle KALMADI mı
 *      (hafıza dersi "Mekanizma var, bağlantı yok" — bu depoda TEK oturumda
 *      6 kez: fonksiyon doğru, çağıran yok)
 *   3. SUNUCU hâlâ bu şekli gönderiyor mu — sözleşme iki depoda ELLE yazılı
 *
 * ⚠ 3. ayak bu turda ÖLÇÜMLE kazanıldı: ilk yazımda karar alanı `sonHesap`
 * sanılmıştı; A görevi `ayrilmaKarari`yi `firmaKapaniyor` olarak değiştirdi
 * ve ön yüz sessizce YANLIŞ dala düşecekti (son sahip "firmanız devam
 * ediyor" metnini görecekti). Sözleşme kapısı bunu kırmızıya çevirir.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  hesapKapatmaMetni,
  SAKLAMA_GUN,
  type KapatmaOnizlemesi,
} from './kapatma-metinleri';

const KOK = path.join(__dirname, '../..');
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), 'utf8');
const okuBackend = (p: string) => fs.readFileSync(path.join(KOK, '..', 'backend', p), 'utf8');
/** Yorumları at: kapı YORUMDA değil KODDA eşleşsin (bu depoda 6. tuzak). */
const kodu = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const G = SAKLAMA_GUN;

/** Firma devam ediyor: üye ayrılıyor ya da firmada ikinci sahip var. */
const FIRMA_DEVAM: KapatmaOnizlemesi = {
  firmaVar: true,
  karar: { izin: true, firmaKapaniyor: false },
  digerHesap: 2,
  saklamaGun: G,
};
/** Firmanın son hesabı: firma kapanıyor ama geride kimse kalmıyor. */
const TEK_HESAP: KapatmaOnizlemesi = {
  firmaVar: true,
  karar: { izin: true, firmaKapaniyor: true },
  digerHesap: 0,
  saklamaGun: G,
};
/** Son sahip, firmada 3 kişi daha var → firma kapanıyor, 3 kişi duruyor. */
const SON_SAHIP: KapatmaOnizlemesi = {
  firmaVar: true,
  karar: { izin: true, firmaKapaniyor: true },
  digerHesap: 3,
  saklamaGun: G,
};

const HEPSI = [null, FIRMA_DEVAM, TEK_HESAP, SON_SAHIP];

describe('hesapKapatmaMetni — gövde HER durumda aynı ve TAM', () => {
  const GOVDE =
    'Hesabınız kapatılır, oturumunuz sonlandırılır ve varsa aboneliğiniz iptal ' +
    'edilir. Geri dönebilmeniz için verilerinizi 30 gün saklıyoruz: bu sürede ' +
    'aynı e-posta ve parolanızla giriş yapıp bir paket seçerek hesabınızı kaldığınız ' +
    'yerden açabilirsiniz. 30 günün sonunda teklifleriniz, kütüphaneniz ve ' +
    'yüklediğiniz belgeler kalıcı olarak silinir. Fatura ve ödeme kayıtları yasal ' +
    'süre boyunca saklanır.';

  it('⭐ Emre metni BİREBİR (§8.1) — Türkçe karakterler dahil', () => {
    // ⚠ Tam eşitlik BİLEREK: bu aynı zamanda Türkçe karakter kapısıdır.
    // "kapatilir/edilir/gunun" gibi karaktersiz bir yazım testi düşürür
    // (`turkce-metin.test.ts` bu yeni dosyayı henüz taramıyor — K'nın dosyası).
    expect(hesapKapatmaMetni(null).govde).toBe(GOVDE);
  });

  it('gövde dört durumda da AYNI (duruma göre değişen yalnız EK cümle)', () => {
    for (const g of HEPSI) expect(hesapKapatmaMetni(g).govde).toBe(GOVDE);
  });

  it('⭐ ESKİ ÜÇ YANLIŞ İDDİA hiçbir metinde YOK', () => {
    const hepsi = HEPSI.map((g) => {
      const m = hesapKapatmaMetni(g);
      return `${m.govde} ${m.ek ?? ''}`;
    }).join(' ');
    expect(hepsi).not.toContain('ayrıca iletmeniz gerekir');
    expect(hepsi).not.toContain('sistemde kalmaya devam eder');
    expect(hepsi).not.toContain('yeniden kayıt olabilirsiniz');
  });

  it('gövde dört şeyi de söylüyor: kesinti · 30 gün geri dönüş · imha · fatura', () => {
    const g = hesapKapatmaMetni(null).govde;
    expect(g).toContain('aboneliğiniz iptal');
    expect(g).toContain(`${G} gün saklıyoruz`);
    expect(g).toContain('bir paket seçerek');
    expect(g).toContain('kalıcı olarak silinir');
    expect(g).toContain('Fatura ve ödeme kayıtları yasal');
  });
});

describe('hesapKapatmaMetni — duruma özel EK cümle', () => {
  it('⭐ FİRMA KAPANIYOR + geride üye VAR → UYARI, sayı SUNUCUDAN (§3.3.1)', () => {
    const m = hesapKapatmaMetni(SON_SAHIP);
    expect(m.ekTuru).toBe('uyari');
    expect(m.ek).toBe(
      'Firmanızda 3 üye var. Hesabınızı kapatırsanız firmanız kapanır ve ' +
        'onların da erişimi durur. 30 gün içinde paket seçerek geri açarsanız ' +
        'ekibiniz de geri gelir.',
    );
  });

  it('sayı SABİT DEĞİL — sunucunun `digerHesap` değeri yazılır', () => {
    expect(hesapKapatmaMetni({ ...SON_SAHIP, digerHesap: 1 }).ek).toContain('Firmanızda 1 üye var.');
    expect(hesapKapatmaMetni({ ...SON_SAHIP, digerHesap: 17 }).ek).toContain('Firmanızda 17 üye var.');
  });

  it('⭐ FİRMA DEVAM EDİYOR → teklifler firmada kalır (bilgi)', () => {
    const m = hesapKapatmaMetni(FIRMA_DEVAM);
    expect(m.ekTuru).toBe('bilgi');
    expect(m.ek).toBe(
      'Hazırladığınız teklifler firmanızda kalır; kişisel bilgileriniz 30 gün sonra silinir.',
    );
  });

  it('⭐ FİRMANIN SON HESABI → ek cümle YOK (geride kalan kimse yok)', () => {
    const m = hesapKapatmaMetni(TEK_HESAP);
    expect(m.ek).toBeNull();
    expect(m.ekTuru).toBeNull();
  });

  it('⭐ ÖN İZLEME YOK (uç 404/500) → düz metin, sayı UYDURULMAZ', () => {
    const m = hesapKapatmaMetni(null);
    expect(m.ek).toBeNull();
    expect(m.ekTuru).toBeNull();
  });

  it('FİRMASIZ hesap → firma cümlesi YAZILMAZ', () => {
    // ⚠ Sunucu firmasız dalda `ayrilmaKarari`yi çağırmadan
    // `{izin:true, firmaKapaniyor:false}` döndürüyor — "firma devam ediyor"
    // dalıyla AYNI görünür. `firmaVar` olmasaydı firmasız kullanıcıya
    // "teklifleriniz firmanızda kalır" derdik.
    const m = hesapKapatmaMetni({
      firmaVar: false,
      karar: { izin: true, firmaKapaniyor: false },
      digerHesap: 0,
      saklamaGun: G,
    });
    expect(m.ek).toBeNull();
  });

  it('BOZUK SAYI: firma kapanıyor ama digerHesap 0/eksi/kesirli → "0 üye var" YAZILMAZ', () => {
    for (const n of [0, -1, 1.5, NaN]) {
      expect(hesapKapatmaMetni({ ...SON_SAHIP, digerHesap: n }).ek, String(n)).toBeNull();
    }
  });

  it('`izin:false` (sunucu reddediyor) → hiçbir firma cümlesi yazılmaz', () => {
    const m = hesapKapatmaMetni({
      firmaVar: true,
      karar: { izin: false, kod: 'SON_SAHIP' },
      digerHesap: 3,
      saklamaGun: G,
    });
    expect(m.ek).toBeNull();
  });

  it('üç hâl ÜÇ AYRI sonuç üretir (hiçbir dal ötekine çökmüyor)', () => {
    const s = [SON_SAHIP, FIRMA_DEVAM, TEK_HESAP].map((g) => JSON.stringify(hesapKapatmaMetni(g)));
    expect(new Set(s).size).toBe(3);
  });
});

describe('saklama günü — TEK KAYNAK sunucu, yerel sabit YEDEK', () => {
  it('⭐ sunucunun günü METNE GİRİYOR (yerel sabit ezilir)', () => {
    const m = hesapKapatmaMetni({ ...FIRMA_DEVAM, saklamaGun: 45 });
    expect(m.govde).toContain('verilerinizi 45 gün saklıyoruz');
    expect(m.govde).toContain('45 günün sonunda');
    expect(m.ek).toContain('kişisel bilgileriniz 45 gün sonra silinir');
    expect(m.govde).not.toContain('30 gün');
  });

  it('sunucu günü göndermezse / bozuksa YEDEK kullanılır', () => {
    for (const g of [undefined, 0, -3, 2.5, NaN]) {
      const m = hesapKapatmaMetni({ ...FIRMA_DEVAM, saklamaGun: g as number | undefined });
      expect(m.govde, String(g)).toContain(`${SAKLAMA_GUN} gün saklıyoruz`);
    }
  });

  it('30 sayısı metin gövdelerinde ELLE yazılı DEĞİL', () => {
    const kaynak = kodu(oku('ozellik/kimlik/kapatma-metinleri.ts'));
    expect(kaynak).not.toMatch(/'[^']*\b30 gün/);
    expect(kaynak).not.toMatch(/`[^`]*\b30 gün/);
  });
});

describe('⭐ SÖZLEŞME — sunucu hâlâ bu şekli gönderiyor', () => {
  const servis = okuBackend('src/altyapi/auth/hesap.servisi.ts');
  const kurallar = okuBackend('src/ozellik/firma/uyelik-kurallari.ts');
  const controller = okuBackend('src/altyapi/auth/auth.controller.ts');

  it('ÖLÇÜT: backend dosyaları gerçekten okundu', () => {
    expect(servis).toContain('kapatmaOnizlemesi');
    expect(kurallar).toContain('export function ayrilmaKarari');
  });

  it('⭐ UÇ YOLU iki tarafta AYNI', () => {
    const sarmal = kodu(oku('ozellik/kimlik/kapatma-onizleme-getir.ts'));
    expect(sarmal).toContain("'/auth/hesabimi-kapat/onizleme'");
    expect(controller).toContain("@Get('hesabimi-kapat/onizleme')");
  });

  it('⭐ YANIT ALANLARI: firmaVar · karar · digerHesap · saklamaGun', () => {
    // `kapatmaOnizlemesi`nin dönüş tipi bildirimi.
    expect(servis).toContain('firmaVar: boolean;');
    expect(servis).toContain('karar: ReturnType<typeof ayrilmaKarari>;');
    expect(servis).toContain('digerHesap: number;');
    expect(servis).toContain('saklamaGun: number;');
  });

  it('⭐ KARAR ALANI `firmaKapaniyor` (eski `sonHesap` DEĞİL)', () => {
    // İlk yazımda `sonHesap` sanılmıştı; bu kapı o kaymayı yakalar.
    expect(kurallar).toContain('firmaKapaniyor: boolean');
    expect(kurallar).toContain("kod: 'SON_SAHIP'");
    expect(kurallar).not.toMatch(/\{ izin: true; sonHesap: boolean \}/);
  });

  it('⭐ SAKLAMA GÜNÜ iki tarafta AYNI sayı', () => {
    const m = kurallar.match(/KAPATMA_SAKLAMA_GUN\s*=\s*(\d+)/);
    expect(m, 'KAPATMA_SAKLAMA_GUN bulunamadı').not.toBeNull();
    expect(Number(m![1])).toBe(SAKLAMA_GUN);
  });

  it('⭐ ÖN İZLEME, KAPATMANIN AYNI YOLU (`firmayiKapatabilir` geçiyor)', () => {
    // Geçirilmezse ön izleme "yapamazsınız" (SON_SAHIP) der, kapatma ise
    // çalışır: ekran işlemle çelişir.
    expect(servis).toContain('firmayiKapatabilir: true');
    expect((servis.match(/firmayiKapatabilir: true/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('⭐ BAĞLANTI — profil ekranı bu kararı kullanıyor', () => {
  const ham = oku('app/(protected)/profile/page.tsx');
  const sayfa = kodu(ham);

  it('ÖLÇÜT: dosya okundu ve hâlâ hesap kapatma bölümünü çiziyor', () => {
    expect(sayfa).toContain('/auth/hesabimi-kapat');
    expect(sayfa).toContain('kapatmaParola');
  });

  it('saf fonksiyon içe aktarılıp çağrılıyor', () => {
    expect(sayfa).toContain("from '@/ozellik/kimlik/kapatma-metinleri'");
    expect(sayfa).toContain('hesapKapatmaMetni(');
  });

  it('⭐ ESKİ CÜMLE KALMADI — yorumda da, kodda da', () => {
    // ⚠ HAM metinde aranıyor: bu cümle bir daha "açıklama yorumu" olarak
    // bile geri gelmemeli; geri gelirse birisi onu kopyalayıp JSX'e taşır.
    // (Bu depoda `faz5` G4 kapısı tam tersi tuzağa düşmüştü: yasakladığı
    // cümleyi kendi yorumunda bulup yanlış kırmızı veriyordu.)
    expect(ham).not.toContain('ayrıca iletmeniz gerekir');
    expect(ham).not.toContain('sistemde kalmaya devam eder');
    expect(ham).not.toContain('Aynı e-posta adresiyle yeniden kayıt olabilirsiniz');
    expect(ham).not.toContain('Bu işlemin geri alma yolu yoktur');
  });

  it('⭐ METİN JSX İÇİNE GÖMÜLÜ DEĞİL — fonksiyondan geliyor', () => {
    expect(sayfa).toContain('{kapatmaMetni.govde}');
    expect(sayfa).toContain('{kapatmaMetni.ek}');
    // Gövdenin ayırt edici parçası sayfada ELLE yazılı olmamalı (ikiz metin).
    expect(sayfa).not.toContain('Geri dönebilmeniz için verilerinizi');
  });

  it('⭐ ek cümle KOŞULLU çiziliyor (boş kutu bırakılmıyor)', () => {
    expect(sayfa).toContain('kapatmaMetni.ek &&');
  });

  it('⭐ İKİNCİ "son sahip mi" HESABI YOK — karar sunucudan', () => {
    // Ön yüzde üye/sahip sayan bir hesap belirirse ikiz kural doğar.
    expect(sayfa).not.toMatch(/digerEtkinSahip/);
    expect(sayfa).not.toMatch(/uyeler\.filter/);
    expect(sayfa).toContain('kapatmaOnizlemesiGetir(');
  });

  it('⭐ FAZ 7 İKİ ADIMLI GİRİŞ KARTI BOZULMADI (aynı dosyada)', () => {
    expect(sayfa).toContain("from '@/ozellik/kimlik/IkiAdimliGirisKarti'");
    expect(sayfa).toContain('<IkiAdimliGirisKarti');
    expect(sayfa).toContain('profile.mfa &&');
    expect(sayfa).toContain('onTokenTazele');
    // Şirket hesabı kartı da aynı bölgede — o da yerinde.
    expect(sayfa).toContain('<SirketHesabiKarti');
  });

  it('ön izleme hatası sayfayı DÜŞÜRMÜYOR (sarmal kendi içinde yutuyor)', () => {
    const sarmal = kodu(oku('ozellik/kimlik/kapatma-onizleme-getir.ts'));
    expect(sarmal).toContain('catch');
    expect(sarmal).toContain('return null');
  });
});
