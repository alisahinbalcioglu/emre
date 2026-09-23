'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HESABIM — kimlik satırı + sekmeler (23.09.2026, Emre'nin tasarımı)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Tek uzun sayfa (on bir kart, büyük mavi kapak, en altta çıkış) kısa bir
 *  kimlik satırına ve sekmelere bölündü. Açık sekme adreste durur
 *  (`/profile?sekme=firma`); bağlantı doğrudan o sekmeyi açar, varsayılan
 *  Profil'dir. Kim hangi sekmeyi görür: `ozellik/kimlik/hesabim/hesabim.ts`.
 *
 *  Bu dosya kabuktur: veriyi yükler, kimlik satırını ve sekme çubuğunu çizer.
 *  Kartlar `ozellik/kimlik/hesabim/*Sekmesi.tsx` dosyalarındadır.
 *
 *  ⚠ BACKEND, API ve ALANLAR DEĞİŞMEDİ — değişen yalnız sayfanın düzeni.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Crown, Loader2 } from 'lucide-react';
import api from '@/ortak/lib/api';
import { cn } from '@/ortak/lib/utils';
import { gecerliTokenMi } from '@/ortak/lib/oturum';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { abonelikOzeti, paketGorunenAdi } from '@/ozellik/odeme/abonelik-ozeti';
import { paketRozeti } from '@/ozellik/odeme/paket-bicim';
import type { CeviriKotaOzeti } from '@/ozellik/teklif/ceviri-kota';
import type { KapatmaOnizlemesi } from '@/ozellik/kimlik/kapatma-metinleri';
import { kapatmaOnizlemesiGetir } from '@/ozellik/kimlik/kapatma-onizleme-getir';
import {
  SEKME_ADI, basHarfler, capadanSekme, gorunenAd, hesapSekmeleri, sekmeAdresi, sekmeCoz,
  type HesapSekmesi,
} from '@/ozellik/kimlik/hesabim/hesabim';
import type { HesapProfili, KotaDurumu } from '@/ozellik/kimlik/hesabim/hesap-tipleri';
import { ProfilSekmesi } from '@/ozellik/kimlik/hesabim/ProfilSekmesi';
import { FirmaSekmesi } from '@/ozellik/kimlik/hesabim/FirmaSekmesi';
import { AbonelikSekmesi } from '@/ozellik/kimlik/hesabim/AbonelikSekmesi';
import { GuvenlikSekmesi } from '@/ozellik/kimlik/hesabim/GuvenlikSekmesi';
import { VerilerSekmesi } from '@/ozellik/kimlik/hesabim/VerilerSekmesi';
import { EkipErisimiSekmesi } from '@/ozellik/kimlik/hesabim/EkipErisimiSekmesi';

// ── SABİT LİMİTLER KALDIRILDI (Faz 6, 14.09.2026) ─────────────────────────
// Eskiden burada `CORE_LIMITS { quotes: 10, materials: 500 }` ve `PRO_LIMITS`
// vardı; hiçbiri sunucuda UYGULANMIYORDU. Paketin GERÇEK tek kotası çeviri
// kotasıdır ve sunucudan (`GET /ai/translate/kota`) okunur.

export default function ProfilePage() {
  const router = useRouter();
  const arama = useSearchParams();
  const [profile, setProfile] = useState<HesapProfili | null>(null);
  const [teklifSayisi, setTeklifSayisi] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [ceviriKota, setCeviriKota] = useState<KotaDurumu>({ durum: 'yukleniyor' });
  // Veri imhası turu §8.1/§3.3.1 — kapatmanın BAŞKALARINI etkileyip
  // etkilemediğini kullanıcı ONAYDAN ÖNCE görmeli. `null` = ölçülemedi;
  // maddeler o zaman her durumda doğru olanlara düşer, sayı uydurmaz.
  const [kapatmaOnizleme, setKapatmaOnizleme] = useState<KapatmaOnizlemesi | null>(null);
  // Paket adı KATALOGDAN (`/abonelik/paketler`); okunamazsa başlık eskisi gibi.
  const [katalog, setKatalog] = useState<{ kod: string; ad: string }[] | null>(null);
  // Sekmelerden önce yazılmış `/profile#hesabi-kapat` bağlantısı (Ekip sayfası).
  const [capaSekmesi, setCapaSekmesi] = useState<HesapSekmesi | null>(null);
  /**
   * ── AÇILMIŞ SEKME SÖKÜLMEZ, GİZLENİR (23.09.2026) ────────────────────
   * İlk yazımda yalnız etkin sekme çiziliyordu; kod incelemesi ölçtü: iki
   * adımlı giriş kurulurken kurtarma kodları ekrandayken sekme değişince
   * kart sökülüyor, kodlar BİR DAHA GÖSTERİLMEDEN kayboluyor ve "kaydettim"
   * onayı atlanıyordu; yazılmış ama kaydedilmemiş form da siliniyordu. Bir
   * kez açılan sekme artık yerinde kalır; açılmamış sekme hiç çizilmez (boşa
   * istek atmaz).
   */
  const [acilanlar, setAcilanlar] = useState<ReadonlySet<HesapSekmesi>>(() => new Set());
  const { erisim } = useCapabilities();

  /**
   * ── YENİLENME GÜNÜ TEK KAYNAKTAN (21.09.2026) ────────────────────────
   * Kota dönemi `Abonelik.olusturuldu` çapası + paketin periyodudur, yani
   * abonelik dönemiyle AYNI dönemdir. Gün TEK yerden okunur: kota yanıtının
   * `donemBitis`i özete verilir, iki kart da `ozet.yenilenmeGunu`nü basar.
   */
  const donemBitisi =
    ceviriKota.durum === 'hazir' ? (ceviriKota.kota?.donemBitis ?? null) : null;

  useEffect(() => {
    Promise.all([
      api.get<HesapProfili>('/auth/me'),
      /**
       * ⚠ TOPLAM BAŞLIKTAN (23.09.2026): `/quotes` SAYFALIDIR (varsayılan 100
       * kayıt) ve toplamı `X-Toplam-Kayit` başlığında verir (`quotes/page.tsx`
       * aynı deseni kullanır). Eski sayfa dizinin UZUNLUĞUNU sayıyordu: 100'den
       * fazla teklifi olan firma "100" görüyordu. `adet: 1` — sayı için yüz
       * kaydı indirmeye gerek yok. Başlık okunamazsa sayı UYDURULMAZ (`null`).
       */
      api.get<unknown>('/quotes', { params: { adet: 1 } })
        .then((r) => {
          const toplam = Number(r.headers?.['x-toplam-kayit']);
          return Number.isInteger(toplam) && toplam >= 0 ? toplam : null;
        })
        .catch(() => null),
      // Kota okunamazsa sayfa yine açılır; kutu "okunamadı" der, uydurmaz.
      api.get<CeviriKotaOzeti | null>('/ai/translate/kota')
        .then((r) => ({ ok: true as const, data: r.data }))
        .catch(() => ({ ok: false as const, data: null })),
      // Kapatma ön izlemesi: hata KENDİ İÇİNDE yutulur (`kapatma-onizleme-getir.ts`),
      // bu yüzden `Promise.all`ı düşürmez.
      kapatmaOnizlemesiGetir(),
      api.get<{ kod: string; ad: string }[]>('/abonelik/paketler')
        .then((r) => (Array.isArray(r.data) ? r.data : null))
        .catch(() => null),
    ]).then(([profileRes, toplamTeklif, kotaRes, onizleme, paketler]) => {
      setProfile(profileRes.data);
      setTeklifSayisi(toplamTeklif);
      setCeviriKota(kotaRes.ok ? { durum: 'hazir', kota: kotaRes.data ?? null } : { durum: 'hata' });
      setKapatmaOnizleme(onizleme);
      setKatalog(paketler);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setCapaSekmesi(capadanSekme(window.location.hash));
  }, []);

  /**
   * ⚠ TOKEN YAZIMININ TEK YERİ (bu ekranda). Parola değiştirme ve iki adımlı
   * giriş `passwordChangedAt` damgalar; elimizdeki ESKİ token o anda
   * geçersizleşir. Yanıt `user` TAŞIMADIĞI için `oturumuYaz` değil, yalnız
   * TOKEN tazelenir — biçim `gecerliTokenMi` ile sınanır (tek kural).
   * Kaynak kapısı: `ortak/lib/oturum.test.ts`.
   */
  const tokenTazele = useCallback((token: unknown) => {
    if (gecerliTokenMi(token)) localStorage.setItem('token', token);
  }, []);

  const profiliYenile = useCallback(() => {
    api.get<HesapProfili>('/auth/me').then(({ data }) => setProfile(data)).catch(() => {});
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.replace('/login');
  }, [router]);

  // `#hesabi-kapat` ile gelen kişi kartın kendisini görsün.
  useEffect(() => {
    if (!profile || capaSekmesi !== 'veriler') return;
    document.getElementById('hesabi-kapat')?.scrollIntoView({ block: 'start' });
  }, [profile, capaSekmesi]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Profil bilgileri yüklenemedi.
      </div>
    );
  }

  // ⚠ `firmaRol` FAIL-CLOSED (FAZ 7 F1b): eski `(firmaRol ?? 'sahip')` alan
  // yanıttan düşünce HERKESİ sahip sayıyordu. Rol bilinmiyorsa kişi ÜYE
  // sekmelerini görür; sunucu da firma düzenlemeyi `sahip` ile kapıyor.
  const sahipMi = profile.firmaRol === 'sahip';
  const sekmeler = hesapSekmeleri(sahipMi);
  const aktifSekme = sekmeCoz(arama.get('sekme') ?? capaSekmesi, sekmeler);

  /**
   * ── 2.15: PAKET ADI UYDURULMAZ ────────────────────────────────────────
   * Etkin paket yoksa sunucu `tier: null` döner; `?? 'core'` YEDEKLENMEZ.
   * Müşteri sahip OLMADIĞI bir paketi görmemeli.
   *
   * ── 23.09 (Hesabım tasarımı): ROZET PAKETİN GERÇEK ADINI YAZAR ────────
   * Eski başlık "PRO PLAN" derken abonelik kutusu aynı paketi "Geçiş paketi"
   * diye adlandırıyordu — iki ad, tek paket. Rozet artık abonelik kartıyla
   * AYNI adı basar (`ozet.baslik`): katalog adı, göç paketinde "Geçiş
   * paketi", katalog okunamazsa ya da paket satıştan kalkmışsa SEVİYE adı
   * (`paketGorunenAdi`) — ham paket kodu ("pro-mek") hiçbir durumda basılmaz.
   * Özet henüz gelmediyse seviye adına düşer.
   */
  const tier = profile.tier ?? null;
  const paketliMi = tier !== null;
  const ustPaketteMi = tier === 'pro' || tier === 'suite';
  // Abonelik özeti GERÇEK kaynaktan (`/auth/me` → `erisim`) türetilir.
  const ozet = abonelikOzeti(
    erisim,
    donemBitisi,
    paketGorunenAdi(erisim?.paketKodu, katalog, tier ? paketRozeti(tier) : null),
  );
  const paketRozetMetni = !paketliMi
    ? paketRozeti(tier)
    : ozet.paketKodu
      ? ozet.baslik
      : paketRozeti(tier);
  const uyelikTarihi = new Date(profile.createdAt).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  function sekmeSec(sekme: HesapSekmesi) {
    // Çapa yalnız İLK açılışı yönlendirir; yoksa `/profile` (Profil) adresi
    // yine çapanın sekmesine düşer ve Profil'e geçilemezdi.
    setCapaSekmesi(null);
    // Ayrılınan sekme yerinde kalsın (gizlenir): kurtarma kodları, yazılmış form.
    setAcilanlar((onceki) => new Set(onceki).add(aktifSekme).add(sekme));
    router.replace(sekmeAdresi(sekme), { scroll: false });
  }

  /**
   * Sekme → kart. ⚠ YALNIZ `sekmeler` (kişinin rol listesi) üzerinden çizilir:
   * üyenin listesinde `firma`/`abonelik` yoktur, o kartlar üyede HİÇ mount
   * edilmez — gizli bile değil.
   */
  const PANEL: Record<HesapSekmesi, () => ReactNode> = {
    profil: () => <ProfilSekmesi profile={profile} onGuncellendi={setProfile} />,
    firma: () => <FirmaSekmesi profile={profile} onGuncellendi={setProfile} />,
    abonelik: () => (
      <AbonelikSekmesi
        profile={profile}
        ozet={ozet}
        paketliMi={paketliMi}
        ustPaketteMi={ustPaketteMi}
        sahipMi={sahipMi}
        ceviriKota={ceviriKota}
        teklifSayisi={teklifSayisi}
      />
    ),
    guvenlik: () => (
      <GuvenlikSekmesi
        profile={profile}
        onTokenTazele={tokenTazele}
        onYenile={profiliYenile}
        onCikis={handleLogout}
      />
    ),
    veriler: () => <VerilerSekmesi sahipMi={sahipMi} kapatmaOnizleme={kapatmaOnizleme} />,
    erisim: () => <EkipErisimiSekmesi />,
  };

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-gray-900">Hesabım</h1>

      {/* ── KİMLİK SATIRI ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div
          aria-hidden
          className={cn(
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white',
            sahipMi ? 'bg-blue-600' : 'bg-indigo-600',
          )}
        >
          {basHarfler(profile)}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="truncate text-lg font-semibold text-gray-900">{gorunenAd(profile)}</span>
            {sahipMi ? (
              <span
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
                  paketliMi ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700',
                )}
              >
                {paketliMi && <Crown className="h-[13px] w-[13px]" aria-hidden />}
                {paketRozetMetni}
              </span>
            ) : (
              <span className="inline-flex h-6 items-center rounded-full bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-800">
                Ekip üyesi
              </span>
            )}
            {profile.role === 'admin' && (
              <span className="inline-flex h-6 items-center rounded-full bg-violet-50 px-2.5 text-xs font-semibold text-violet-700">
                Admin
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[13px] text-gray-500">
            {profile.email} · {sahipMi ? 'Üye' : 'Katılım'}: {uyelikTarihi}
          </p>
        </div>
      </div>

      <SekmeCubugu sekmeler={sekmeler} aktif={aktifSekme} onSec={sekmeSec} />

      {sekmeler
        .filter((s) => s === aktifSekme || acilanlar.has(s))
        .map((s) => (
          // ⚠ `hidden` ÖZNİTELİĞİ YETMEZ: `.flex` aynı özgüllükte ve sonra
          // geldiği için `[hidden]`ı ezer; gizleme sınıfla da yapılır.
          <div
            key={s}
            role="tabpanel"
            id={`panel-${s}`}
            aria-labelledby={`sekme-${s}`}
            hidden={s !== aktifSekme}
            className={s === aktifSekme ? 'flex flex-col gap-5' : 'hidden'}
          >
            {PANEL[s]()}
          </div>
        ))}
    </div>
  );
}

/**
 * Sekme çubuğu — WAI-ARIA sekme deseni: ok tuşları ve Home/End sekmeler
 * arasında gezer, yalnız seçili sekme Tab sırasındadır.
 */
function SekmeCubugu({
  sekmeler,
  aktif,
  onSec,
}: {
  sekmeler: readonly HesapSekmesi[];
  aktif: HesapSekmesi;
  onSec: (s: HesapSekmesi) => void;
}) {
  const dugmeler = useRef<Partial<Record<HesapSekmesi, HTMLButtonElement | null>>>({});

  function tus(e: React.KeyboardEvent, sira: number) {
    const son = sekmeler.length - 1;
    const hedef =
      e.key === 'ArrowRight' ? (sira === son ? 0 : sira + 1)
        : e.key === 'ArrowLeft' ? (sira === 0 ? son : sira - 1)
          : e.key === 'Home' ? 0
            : e.key === 'End' ? son
              : null;
    if (hedef === null) return;
    e.preventDefault();
    const sekme = sekmeler[hedef];
    onSec(sekme);
    dugmeler.current[sekme]?.focus();
  }

  return (
    // ⚠ Alt çizgi KENARLIK değil İÇ GÖLGE: `overflow-x-auto` ile `-mb-px`
    // birleşince 1 px dikey taşma oluşuyor ve Windows'ta sekmelerin yanında
    // dikey kaydırma çubuğu beliriyordu (tarayıcıda görüldü). Gölge yer
    // kaplamaz; seçili sekmenin 2 px çizgisi onun üstüne boyanır.
    <div
      role="tablist"
      aria-label="Hesap bölümleri"
      className="mt-1 flex gap-7 overflow-x-auto shadow-[inset_0_-1px_0_0_#e5e7eb]"
    >
      {sekmeler.map((s, i) => {
        const secili = s === aktif;
        return (
          <button
            key={s}
            ref={(d) => { dugmeler.current[s] = d; }}
            id={`sekme-${s}`}
            type="button"
            role="tab"
            aria-selected={secili}
            aria-controls={secili ? `panel-${s}` : undefined}
            tabIndex={secili ? 0 : -1}
            onClick={() => onSec(s)}
            onKeyDown={(e) => tus(e, i)}
            className={cn(
              'h-11 shrink-0 whitespace-nowrap border-b-2 px-0.5 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30',
              secili
                ? 'border-slate-900 font-semibold text-gray-900'
                : 'border-transparent font-medium text-gray-500 hover:text-gray-900',
            )}
          >
            {SEKME_ADI[s]}
          </button>
        );
      })}
    </div>
  );
}
