import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PAKET_YOK_METNI, SEVIYE_AD, paketRozeti, seviyeAdi } from './paket-bicim';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  2.15 — ETKİN PAKET YOKKEN EKRAN PAKET ADI UYDURMAZ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ÖLÇÜLEN KUSUR (2.13 kapatılırken): `etkinSeviye` abonelik yürümüyorsa
 *  `null` dönüyor ama sunucu ve ekranlar bunu `?? 'core'` ile yedekliyordu.
 *  Sonuç: **süresi dolmuş bir PRO müşteri kenar çubuğunda "Basic" rozeti
 *  görüyordu** — sahip olmadığı bir paket. Yetki vermiyor (yanlış yönde bir
 *  yalan değil) ama yine de yalan.
 *
 *  ── BU DOSYA İKİ ŞEYİ AYRI AYRI ÖLÇER ─────────────────────────────────
 *  1) MANTIK: saf `paketRozeti` boş seviyede paket adı basmıyor.
 *  2) BAĞLANTI: o fonksiyonun ÇAĞRILDIĞI ve `?? 'core'` yedeğinin GERİ
 *     GELMEDİĞİ. Bu deponun ölçülmüş hata sınıfı "mekanizma var, bağlantı
 *     yok" (feedback_mekanizma_var_baglanti_yok): doğru fonksiyonu yazıp
 *     çağırmamak tek başına sessiz bir kusurdur.
 *
 *  ⚠ YEDEK BEŞ YERDEYDİ, GÖREVDE BİRİ ADLANDIRILMIŞTI. İkisi sunucuda ve
 *  AYNI localStorage alanını besliyor (giriş yanıtı YAZAR, `/auth/me`
 *  TAZELER). Yalnız birini düzeltmek ÖLÇÜLDÜ: etkisiz kalırdı.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const FE = join(__dirname, '../..');
const BE = resolve(FE, '../backend/src/altyapi/auth');
const oku = (p: string) => readFileSync(join(FE, p), 'utf8');
const okuBE = (p: string) => readFileSync(join(BE, p), 'utf8');

const sidebar = oku('ortak/kabuk/components/layout/Sidebar.tsx');
const profil = oku('app/(protected)/profile/page.tsx');
const baglam = oku('ortak/contexts/CapabilitiesContext.tsx');
const oturumServisi = okuBE('oturum.servisi.ts');
const authService = okuBE('auth.service.ts');

/**
 * YORUMLARI ATAR — kapı KODU ölçer, kendi açıklamasını DEĞİL.
 *
 * ⚠ BU SATIR ÖLÇÜMLE GELDİ: ilk hâlde `not.toContain("?? 'core'")` KIRMIZIYDI
 * ve sebebi koddaki bir yedek değil, yedeği ANLATAN yorumlardı ("ESKİ HÂL
 * `?? 'core'` idi"). Deponun yazılı dersi: *mutasyon/arama deseni KODDA
 * benzersiz olmalı; yorumda eşleşen desen kodu değiştirmez.* Yorum süzülmese
 * kapı, düzeltmeyi belgeleyen her satırda yalancı kırmızı verir ve ilk
 * tepki yorumu SİLMEK olurdu — yani kapı, belgeyi cezalandırırdı.
 */
function kodu(kaynak: string): string {
  return kaynak
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // /* ... */ ve JSX {/* ... */}
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // // ... ( `://` korunur )
}

const KAYNAKLAR = {
  Sidebar: sidebar,
  profil,
  CapabilitiesContext: baglam,
  'oturum.servisi.ts': oturumServisi,
  'auth.service.ts': authService,
} as const;

/** Yorumsuz hâller — `not.toContain` ölçümleri YALNIZ bunlar üzerinde. */
const KOD = Object.fromEntries(
  Object.entries(KAYNAKLAR).map(([ad, icerik]) => [ad, kodu(icerik)]),
) as Record<keyof typeof KAYNAKLAR, string>;

describe('ÖLÇÜTÜN KENDİSİ — yorum süzgeci doğru çalışıyor', () => {
  it('yorumdaki desen atılır, koddaki desen KALIR', () => {
    const ornek = [
      "const a = x ?? 'core'; // eski hâl: ?? 'core'",
      "/* ?? 'core' */ const b = 1;",
      "{/* ?? 'core' */}",
      "const u = 'https://x/y';",
    ].join('\n');
    const cikti = kodu(ornek);
    // Koddaki TEK gerçek geçiş hayatta kalmalı...
    expect(cikti.match(/\?\? 'core'/g)).toHaveLength(1);
    expect(cikti).toContain("const a = x ?? 'core';");
    // ...URL'deki `//` yanlışlıkla yorum sanılmamalı.
    expect(cikti).toContain("'https://x/y'");
  });

  it('süzgeç gerçek dosyalarda kodu YUTMUYOR (boş dize yalancı yeşil vermesin)', () => {
    for (const [ad, icerik] of Object.entries(KOD)) {
      expect(icerik.length, ad).toBeGreaterThan(500);
    }
    expect(KOD.Sidebar).toContain('export default function Sidebar');
    expect(KOD['oturum.servisi.ts']).toContain('async oturumYaniti(');
  });
});

describe('FIXTURE — beş kaynağın beşi de gerçekten okundu', () => {
  it('dosyalar boş değil (boş dize her `not.toContain`ı yeşil yapardı)', () => {
    for (const [ad, icerik] of Object.entries(KAYNAKLAR)) {
      expect(icerik.length, ad).toBeGreaterThan(1000);
    }
  });

  it('FIXTURE KANITI: dedektör gerçek metinde çalışıyor', () => {
    // Bu dize dosyalarda VAR; olmasaydı aşağıdaki `not.toContain`lar
    // "aradığım şey zaten hiç yoktu" diye yalancı yeşil verirdi.
    expect(sidebar).toContain('user?.tier');
    expect(profil).toContain('profile.tier');
    expect(oturumServisi).toContain('firmaPaketSeviyesi');
    expect(authService).toContain('firmaPaketSeviyesi');
    expect(baglam).toContain("localStorage.setItem('user'");
  });
});

describe('MANTIK — paketRozeti boş seviyede paket adı UYDURMAZ', () => {
  it('null / undefined / boş dize → hiçbir paket adı basılmıyor', () => {
    const paketAdlari = Object.values(SEVIYE_AD); // ['Basic','Pro','Suite']
    expect(paketAdlari.length).toBeGreaterThan(0); // boş küme yeşil vermesin
    for (const bos of [null, undefined, ''] as const) {
      const cikti = paketRozeti(bos);
      expect(cikti, String(bos)).toBe(PAKET_YOK_METNI);
      expect(paketAdlari, String(bos)).not.toContain(cikti);
    }
  });

  it('⭐ ÖLÇÜLEN VAKA: süresi dolmuş PRO müşteri "Basic" GÖRMEZ', () => {
    // 2.13 sonrası sunucunun dönüşü: etkinSeviye = null (paketSeviyesi 'pro').
    expect(paketRozeti(null)).not.toBe(SEVIYE_AD.core);
    expect(paketRozeti(null)).not.toBe('Basic');
  });

  it('"Paket yok" metni bir paket ADI değil (sözlükle çakışmıyor)', () => {
    expect(Object.values(SEVIYE_AD)).not.toContain(PAKET_YOK_METNI);
    expect(Object.keys(SEVIYE_AD)).not.toContain(PAKET_YOK_METNI);
  });

  it('seviye DOLU iken doğru ad — sözlük yine SEVIYE_AD (ikinci eşleme yok)', () => {
    expect(paketRozeti('core')).toBe('Basic');
    expect(paketRozeti('pro')).toBe('Pro');
    expect(paketRozeti('suite')).toBe('Suite');
    // Devretme kanıtı: tanınmayan kod `seviyeAdi` ile AYNI davranır.
    expect(paketRozeti('platin')).toBe(seviyeAdi('platin'));
    expect(paketRozeti('platin')).toBe('platin');
  });
});

describe('BAĞLANTI — `?? \'core\'` yedeği beş yerin hiçbirinde geri gelmedi', () => {
  it('⭐ sunucu: giriş yanıtı etkin seviyeyi YEDEKLEMİYOR', () => {
    expect(KOD['oturum.servisi.ts']).not.toContain("?? 'core'");
    expect(oturumServisi).toContain('const tier = await firmaPaketSeviyesi(this.prisma, user.firmaId);');
    expect(oturumServisi).toContain('tier: string | null;');
  });

  it('⭐ sunucu İKİZİ: /auth/me (`etkinSeviye`) de yedeklemiyor', () => {
    expect(KOD['auth.service.ts']).not.toContain("?? 'core'");
    expect(authService).toContain('Promise<string | null>');
  });

  it('⭐ localStorage tazelemesi `null`ı YUTMUYOR (bayat paket kalmaz)', () => {
    // Eski hâl: `if (data?.tier)` — null falsy olduğu için kopya hiç
    // güncellenmiyordu ve süresi dolmuş müşterinin 'pro' değeri kalıyordu.
    expect(KOD.CapabilitiesContext).not.toContain('if (data?.tier) {');
    expect(baglam).toContain("'tier' in data");
  });

  it('⭐ kenar çubuğu rozeti: yedek yok, ad tek sözlükten', () => {
    expect(KOD.Sidebar).not.toContain("?? 'core'");
    expect(sidebar).toContain('{paketRozeti(tier)}');
    expect(sidebar).toContain("from '@/ozellik/odeme/paket-bicim'");
    // Eski hâl: `{tier}` ham kod basımı (15.09'da kapatıldı) — geri gelmesin.
    expect(KOD.Sidebar).not.toContain('>{tier}<');
  });

  it('⭐ hesap sayfası: yedek yok, rozet metni tek yerden', () => {
    expect(KOD.profil).not.toContain("?? 'core'");
    expect(profil).toContain('const paketRozetMetni =');
    expect(profil).toContain('{paketRozetMetni}');
    // Etiket artık `tierConfig.label`dan BASILMIYOR (o alan yalnız ikon/renk
    // yedeği için duruyor); basılsaydı paket yokken "Basic Plan" derdi.
    expect(KOD.profil).not.toContain('{tierConfig.label} Plan');
  });
});

/**
 * ⚠ 23.09.2026 — Hesabım sekmelere bölündü: paket kartı Abonelik sekmesinde
 * (`AbonelikSekmesi.tsx`). Karar (`paketliMi`, `ustPaketteMi`) sayfada
 * hesaplanır ve sekmeye GEÇER; kapılar kartı YENİ yerinde ölçer ve aradaki
 * bağlantıyı da ölçer — biri koparsa kart eski kararla çizilirdi.
 */
describe('BAĞLANTI — müşteri ne yapması gerektiğini anlıyor', () => {
  const sekme = oku('ozellik/kimlik/hesabim/AbonelikSekmesi.tsx');
  const sekmeKod = kodu(sekme);

  it('ÖLÇÜT: karar sayfadan sekmeye geçiyor (sekme ikinci kez hesaplamıyor)', () => {
    expect(profil).toContain('paketliMi={paketliMi}');
    expect(profil).toContain('ustPaketteMi={ustPaketteMi}');
    expect(sekmeKod).not.toContain('profile.tier');
  });

  it('⭐ paket YOKKEN paket seçme çağrısı KAYBOLMUYOR', () => {
    // Eski koşul `tier === 'core'` idi: seviye null olunca düğme yok olurdu —
    // tam da ona en çok ihtiyacı olan müşteride.
    expect(KOD.profil).not.toContain("{tier === 'core' && (");
    expect(sekmeKod).not.toContain("tier === 'core'");
    expect(sekme).toContain('{!ustPaketteMi && (');
    expect(sekme).toContain('Devam etmek için bir paket seçin');
  });

  it('⭐ paket YOKKEN hak listesi (yeşil tik) gösterilmiyor', () => {
    // "Paket yok" başlığının altında "✓ Sınırsız teklif" yazmak, adı
    // basmayıp HAKLARI basmak olurdu — aynı yalanın devamı.
    const kosul = sekmeKod.indexOf('{paketliMi && (');
    expect(kosul).toBeGreaterThan(-1);
    expect(sekmeKod.indexOf('Sınırsız teklif')).toBeGreaterThan(kosul);
  });

  it('paket yokken paket TARİFİ yazılmıyor', () => {
    expect(profil).toContain('const paketliMi =');
    // Eski üç yollu alt satır ("Profesyonel özellikler" / "Başlangıç paketi" /
    // paketsiz) kalktı; tasarımda alt satır yenilenme günü. Paketsiz hâl
    // tarif değil DURUM yazar.
    expect(sekme).toContain("{paketliMi ? ozet.altMetin : 'Etkin aboneliğiniz yok'}");
    expect(sekme).not.toContain('Başlangıç paketi');
  });
});
