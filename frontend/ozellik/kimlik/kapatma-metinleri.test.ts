/**
 * HESAP KAPATMA METNİ — saf karar + EKRANA BAĞLANTI + SUNUCU SÖZLEŞMESİ.
 * (veri imhası turu §8.1 · 21.09.2026; madde madde biçim · 23.09.2026)
 *
 * ⚠ ÜÇ AYAK, ÜÇÜ DE GEREKLİ:
 *   1. Fonksiyon doğru maddeleri seçiyor mu
 *   2. EKRAN bu fonksiyonu gerçekten kullanıyor ve eski cümle KALMADI mı
 *      (hafıza dersi "Mekanizma var, bağlantı yok" — bu depoda TEK oturumda
 *      6 kez: fonksiyon doğru, çağıran yok)
 *   3. SUNUCU hâlâ bu şekli gönderiyor mu — sözleşme iki depoda ELLE yazılı
 *
 * ⚠ 3. ayak bu turda ÖLÇÜMLE kazanıldı: ilk yazımda karar alanı `sonHesap`
 * sanılmıştı; A görevi `ayrilmaKarari`yi `firmaKapaniyor` olarak değiştirdi
 * ve ön yüz sessizce YANLIŞ dala düşecekti (son sahip "firmanız devam
 * ediyor" metnini görecekti). Sözleşme kapısı bunu kırmızıya çevirir.
 *
 * ⚠ 23.09.2026 — Hesabım tasarımı §8.1 paragrafını MADDELERE böldü ve
 * "alt kullanıcıların erişimi de kapanır" maddesini ekledi. Öncül "gövde her
 * durumda AYNI" çürüdü: firma devam ederken iki madde (abonelik iptali,
 * tekliflerin silinmesi) o kişi için YANLIŞTI ve ölçüldü (`hesap.servisi.ts`).
 * Kapılar amaçlarıyla korunuyor; sayılar ve kararlar yine sunucudan.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  hesapKapatmaMaddeleri,
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
const metinler = (g: KapatmaOnizlemesi | null) => hesapKapatmaMaddeleri(g).map((m) => m.metin);

/** Firmanın kaderinden bağımsız DÖRT temel madde — Emre'nin tasarımı, birebir. */
const TEMEL = [
  'Oturumunuz sonlanır, varsa aboneliğiniz iptal edilir.',
  '30 gün içinde aynı e-posta ve parolayla giriş yapıp bir paket seçerek kaldığınız yerden devam edebilirsiniz.',
  '30 günün sonunda teklifleriniz, kütüphaneniz ve yüklediğiniz belgeler kalıcı olarak silinir.',
  'Fatura ve ödeme kayıtları yasal süre boyunca saklanır.',
];

describe('hesapKapatmaMaddeleri — her durumda doğru olan dört madde', () => {
  it('⭐ ön izleme YOKKEN (uç 404/500) tasarımdaki dört madde BİREBİR — Türkçe karakterler dahil', () => {
    // ⚠ Tam eşitlik BİLEREK: bu aynı zamanda Türkçe karakter kapısıdır.
    expect(metinler(null)).toEqual(TEMEL);
    expect(hesapKapatmaMaddeleri(null).every((m) => m.ton === 'duz')).toBe(true);
  });

  it('firmanın son hesabı (geride kimse yok) → yalnız dört temel madde', () => {
    expect(metinler(TEK_HESAP)).toEqual(TEMEL);
  });

  it('⭐ ESKİ ÜÇ YANLIŞ İDDİA hiçbir maddede YOK', () => {
    const hepsi = HEPSI.map((g) => metinler(g).join(' ')).join(' ');
    expect(hepsi).not.toContain('ayrıca iletmeniz gerekir');
    expect(hepsi).not.toContain('sistemde kalmaya devam eder');
    expect(hepsi).not.toContain('yeniden kayıt olabilirsiniz');
  });

  it('dört olgu da söyleniyor: kesinti · 30 gün geri dönüş · imha · fatura', () => {
    const m = metinler(null).join(' ');
    expect(m).toContain('aboneliğiniz iptal');
    expect(m).toContain(`${G} gün içinde`);
    expect(m).toContain('bir paket seçerek');
    expect(m).toContain('kalıcı olarak silinir');
    expect(m).toContain('Fatura ve ödeme kayıtları yasal');
  });

  it('geri dönüş ve fatura maddesi DÖRT durumda da var', () => {
    for (const g of HEPSI) {
      const m = metinler(g);
      expect(m, JSON.stringify(g)).toContain(TEMEL[1]);
      expect(m, JSON.stringify(g)).toContain(TEMEL[3]);
    }
  });
});

describe('hesapKapatmaMaddeleri — duruma özel maddeler (karar SUNUCUDAN)', () => {
  it('⭐ FİRMA KAPANIYOR + geride insan VAR → ekip maddesi UYARI, sayı SUNUCUDAN (§3.3.1)', () => {
    const m = hesapKapatmaMaddeleri(SON_SAHIP);
    expect(m[1]).toEqual({
      metin: 'Firmanız kapanır; ekibinizdeki 3 kişinin erişimi de kapanır. Geri dönerseniz ekibiniz de geri gelir.',
      ton: 'uyari',
    });
    // Temel dört madde yerinde; ekip maddesi kesinti maddesinin HEMEN ardında.
    expect(m.map((x) => x.metin)).toEqual([TEMEL[0], m[1].metin, ...TEMEL.slice(1)]);
    expect(m.filter((x) => x.ton === 'uyari')).toHaveLength(1);
  });

  it('sayı SABİT DEĞİL — sunucunun `digerHesap` değeri yazılır', () => {
    expect(metinler({ ...SON_SAHIP, digerHesap: 1 }).join(' ')).toContain('ekibinizdeki 1 kişinin');
    expect(metinler({ ...SON_SAHIP, digerHesap: 17 }).join(' ')).toContain('ekibinizdeki 17 kişinin');
  });

  it('⭐ FİRMA DEVAM EDİYOR → abonelik SÜRER, teklifler firmada KALIR', () => {
    const m = metinler(FIRMA_DEVAM);
    expect(m).toEqual([
      'Oturumunuz sonlanır; firmanızın aboneliği sürer.',
      TEMEL[1],
      'Hazırladığınız teklifler firmanızda kalır; kişisel bilgileriniz 30 gün sonra silinir.',
      TEMEL[3],
    ]);
    // ⚠ Bu kişi için YANLIŞ olan iki iddia YOK (ölçüm aşağıdaki SÖZLEŞME bloğunda).
    expect(m.join(' ')).not.toContain('aboneliğiniz iptal');
    expect(m.join(' ')).not.toContain('teklifleriniz, kütüphaneniz');
    expect(hesapKapatmaMaddeleri(FIRMA_DEVAM).every((x) => x.ton === 'duz')).toBe(true);
  });

  it('FİRMASIZ hesap → firma maddesi YAZILMAZ', () => {
    // ⚠ Sunucu firmasız dalda `ayrilmaKarari`yi çağırmadan
    // `{izin:true, firmaKapaniyor:false}` döndürüyor — "firma devam ediyor"
    // dalıyla AYNI görünür. `firmaVar` olmasaydı firmasız kullanıcıya
    // "teklifleriniz firmanızda kalır" derdik.
    expect(
      metinler({ firmaVar: false, karar: { izin: true, firmaKapaniyor: false }, digerHesap: 0, saklamaGun: G }),
    ).toEqual(TEMEL);
  });

  it('BOZUK SAYI: firma kapanıyor ama digerHesap 0/eksi/kesirli → "0 kişinin erişimi" YAZILMAZ', () => {
    for (const n of [0, -1, 1.5, NaN]) {
      expect(metinler({ ...SON_SAHIP, digerHesap: n }), String(n)).toEqual(TEMEL);
    }
  });

  it('`izin:false` (sunucu reddediyor) → hiçbir firma maddesi yazılmaz', () => {
    expect(
      metinler({ firmaVar: true, karar: { izin: false, kod: 'SON_SAHIP' }, digerHesap: 3, saklamaGun: G }),
    ).toEqual(TEMEL);
  });

  it('üç hâl ÜÇ AYRI sonuç üretir (hiçbir dal ötekine çökmüyor)', () => {
    const s = [SON_SAHIP, FIRMA_DEVAM, TEK_HESAP].map((g) => JSON.stringify(hesapKapatmaMaddeleri(g)));
    expect(new Set(s).size).toBe(3);
  });
});

describe('saklama günü — TEK KAYNAK sunucu, yerel sabit YEDEK', () => {
  it('⭐ sunucunun günü MADDELERE GİRİYOR (yerel sabit ezilir)', () => {
    const hepsi = [...metinler({ ...SON_SAHIP, saklamaGun: 45 }), ...metinler({ ...FIRMA_DEVAM, saklamaGun: 45 })].join(' ');
    expect(hepsi).toContain('45 gün içinde');
    expect(hepsi).toContain('45 günün sonunda');
    expect(hepsi).toContain('kişisel bilgileriniz 45 gün sonra silinir');
    expect(hepsi).not.toContain('30 gün');
  });

  it('sunucu günü göndermezse / bozuksa YEDEK kullanılır', () => {
    for (const g of [undefined, 0, -3, 2.5, NaN]) {
      const m = metinler({ ...TEK_HESAP, saklamaGun: g as number | undefined }).join(' ');
      expect(m, String(g)).toContain(`${SAKLAMA_GUN} gün içinde`);
      expect(m, String(g)).toContain(`${SAKLAMA_GUN} günün sonunda`);
    }
  });

  it('30 sayısı metinlerde ELLE yazılı DEĞİL', () => {
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

  it('⭐ ABONELİK İPTALİ YALNIZ FİRMA KAPANIRKEN — "firma devam ediyor" maddesinin dayanağı', () => {
    // Firma devam ederken ekran "aboneliğiniz iptal edilir" DEMİYOR; bunun
    // doğru olması, sunucunun iptali bu koşula bağlamasına dayanır.
    expect(kodu(servis)).toMatch(/if \(karar\.izin && karar\.firmaKapaniyor && user\.firmaId\) \{\s*try \{\s*await this\.satinAlma\.iptalEt\(/);
  });
});

describe('⭐ BAĞLANTI — Hesabım › Veriler sekmesi bu kararı kullanıyor', () => {
  const SAYFA = 'app/(protected)/profile/page.tsx';
  const VERILER = 'ozellik/kimlik/hesabim/VerilerSekmesi.tsx';
  const GUVENLIK = 'ozellik/kimlik/hesabim/GuvenlikSekmesi.tsx';
  const hamSayfa = oku(SAYFA);
  const hamVeriler = oku(VERILER);
  const sayfa = kodu(hamSayfa);
  const veriler = kodu(hamVeriler);

  it('ÖLÇÜT: dosyalar okundu ve Veriler sekmesi hâlâ hesap kapatmayı çiziyor', () => {
    expect(veriler).toContain("api.post('/auth/hesabimi-kapat'");
    expect(veriler).toContain('kapatmaParola');
    // Sayfa sekmeyi PANEL haritasından çizer (sekme ↔ kart birebir); haritanın
    // YALNIZ rol listesinden çizildiği `hesabim.test.ts` BAĞLANTI bloğunda.
    expect(sayfa).toMatch(/\bveriler: \(\) => \(?\s*<VerilerSekmesi\b/);
  });

  it('saf fonksiyon içe aktarılıp çağrılıyor', () => {
    expect(veriler).toContain("from '../kapatma-metinleri'");
    expect(veriler).toContain('hesapKapatmaMaddeleri(kapatmaOnizleme)');
  });

  it('⭐ ön izleme SAYFADAN geliyor ve Veriler sekmesine GEÇİYOR', () => {
    expect(sayfa).toContain('kapatmaOnizlemesiGetir(');
    expect(sayfa).toContain('kapatmaOnizleme={kapatmaOnizleme}');
  });

  it('⭐ ESKİ CÜMLE KALMADI — yorumda da, kodda da (iki dosyada)', () => {
    // ⚠ HAM metinde aranıyor: bu cümle bir daha "açıklama yorumu" olarak
    // bile geri gelmemeli; geri gelirse birisi onu kopyalayıp JSX'e taşır.
    for (const [ad, ham] of [[SAYFA, hamSayfa], [VERILER, hamVeriler]] as const) {
      expect(ham, ad).not.toContain('ayrıca iletmeniz gerekir');
      expect(ham, ad).not.toContain('sistemde kalmaya devam eder');
      expect(ham, ad).not.toContain('Aynı e-posta adresiyle yeniden kayıt olabilirsiniz');
      expect(ham, ad).not.toContain('Bu işlemin geri alma yolu yoktur');
    }
  });

  it('⭐ METİN JSX İÇİNE GÖMÜLÜ DEĞİL — fonksiyondan geliyor', () => {
    expect(veriler).toContain('maddeler.map((m) =>');
    expect(veriler).toContain('{m.metin}');
    // Maddelerin ayırt edici parçaları ekranda ELLE yazılı olmamalı (ikiz metin).
    for (const kod of [sayfa, veriler]) {
      expect(kod).not.toContain('kalıcı olarak silinir');
      expect(kod).not.toContain('gün içinde aynı e-posta');
    }
  });

  it('⭐ uyarı tonu fonksiyondan (renk ekranda KARAR VERMEZ)', () => {
    expect(veriler).toContain("m.ton === 'uyari'");
  });

  it('⭐ İKİNCİ "son sahip mi" HESABI YOK — karar sunucudan', () => {
    // Ön yüzde üye/sahip sayan bir hesap belirirse ikiz kural doğar.
    for (const kod of [sayfa, veriler]) {
      expect(kod).not.toMatch(/digerEtkinSahip/);
      expect(kod).not.toMatch(/uyeler\.filter/);
    }
  });

  it('⭐ FAZ 7 İKİ ADIMLI GİRİŞ KARTI BOZULMADI (Güvenlik sekmesinde)', () => {
    const guvenlik = kodu(oku(GUVENLIK));
    expect(guvenlik).toContain("from '../IkiAdimliGirisKarti'");
    expect(guvenlik).toContain('<IkiAdimliGirisKarti');
    expect(guvenlik).toContain('profile.mfa &&');
    expect(guvenlik).toContain('onTokenTazele={onTokenTazele}');
    // Şirket hesabı kartı da aynı bölgede — o da yerinde.
    expect(guvenlik).toContain('<SirketHesabiKarti');
    // Sayfa, token yazan fonksiyonu Güvenlik sekmesine GEÇİRİYOR.
    expect(sayfa).toContain('onTokenTazele={tokenTazele}');
  });

  it('ön izleme hatası sayfayı DÜŞÜRMÜYOR (sarmal kendi içinde yutuyor)', () => {
    const sarmal = kodu(oku('ozellik/kimlik/kapatma-onizleme-getir.ts'));
    expect(sarmal).toContain('catch');
    expect(sarmal).toContain('return null');
  });
});
