'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  FileText,
  Database,
  BookOpen,
  CreditCard,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
// collapsed state layout'tan gelir
import { cn } from '@/ortak/lib/utils';
import { paketRozeti } from '@/ozellik/odeme/paket-bicim';

interface SidebarProps {
  // ⚠ `hesapKapali` 22.09'da EKLENDI: kapali hesapta calismayan menu
  //   baglantilari gizleniyor (asagidaki `items` suzgeci).
  user: { email: string; role: string; tier?: string | null; hesapKapali?: boolean } | null;
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS = [
  // 16.08 marka kimligi: menu Turkcelestirildi.
  { href: '/dashboard', label: 'Ana Sayfa', icon: Home },
  { href: '/quotes', label: 'Teklifler', icon: FileText },
  'divider' as const,
  { href: '/materials', label: 'Malzeme Havuzu', icon: Database },
  { href: '/library', label: 'Kütüphanem', icon: BookOpen },
  // FAZ 7 F1b: ekip sayfasi HERKESE gorunur. Uye listeyi salt okunur gorur;
  // dugmeler sunucunun verdigi role gore cizilir. Kosullu gizlemek, tek
  // kisilik firmadaki sahibin ekip ozelligini hic kesfetmemesine yol acardi.
  { href: '/firma/ekip', label: 'Ekip', icon: Users },
  'divider' as const,
  // ADIM 2: abonelik menude DAIMA gorunur. Erisimi kapali firmanin
  // odeme yapabilecegi tek yol burasi; kosullu gizlemek askidaki
  // musteriyi urunun disinda kilitlerdi (kilitlenme yasagi).
  { href: '/abonelik', label: 'Abonelik', icon: CreditCard },
];

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  core: { bg: 'bg-slate-700', text: 'text-slate-300' },
  pro: { bg: 'bg-blue-900/60', text: 'text-blue-400' },
  suite: { bg: 'bg-purple-900/60', text: 'text-purple-400' },
};

/**
 * ETKIN PAKET YOKKEN rozet rengi (2.15). `TIER_COLORS` icine `yok: {...}`
 * diye KOYULMADI: o harita seviye KODLARIYLA anahtarli ve 'yok' bir seviye
 * kodu degil — koymak, seviye sanilan sahte bir kod uretirdi.
 *
 * Renk bilerek amber: gri (core) "en ucuz paketteyim" demek, amber "bir
 * seyin ilgilenmesi gerekiyor" demek. Rozet zaten /profile'a link.
 */
const PAKET_YOK_RENGI = { bg: 'bg-amber-900/50', text: 'text-amber-400' };

export default function Sidebar({ user, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  // ⚠ 2.15: `?? 'core'` KALDIRILDI. Sunucu etkin paket yokken `tier: null`
  // doner (2.13) ve yedek, musteriye SAHIP OLMADIGI paketi ("Basic")
  // rozet olarak gosteriyordu. Bos hali `paketRozeti` karsilar.
  const tier = user?.tier ?? null;
  const tierStyle = tier ? (TIER_COLORS[tier] ?? TIER_COLORS.core) : PAKET_YOK_RENGI;
  const initial = user?.email?.charAt(0).toUpperCase() ?? 'U';

  // ── 22.09.2026: KAPALI HESAPTA MENU — CALISANLAR KALIR ────────────────
  // Silinen `/hesap-kapali` sayfasi BILEREK `(protected)` kabugunun
  // disindaydi; kendi basliginda gerekcesi yaziliydi: "o kabuk kenar
  // cubugu, ekmek kirintisi ve pano baglantilari cizer — HEPSI kapali
  // hesapta 403 doner." Emre ayri ekrani kaldirtti ve kapali hesap artik
  // kabugun ICINE dusuyor; gerekce ortadan kalkmadi, YER DEGISTIRDI.
  //
  // ⚠⚠ ILK YAZIMDA MENU YALNIZ `/abonelik` BIRAKILDI VE BU YANLISTI.
  //   Emre'nin duzeltmesi (22.09, canli ekrana bakarak): "kullanici neden
  //   sayfaya girip goremiyor — sadece KULLANAMAYACAK dedik." Karar:
  //   "kaydedilmis tekliflerini gorebilecek, indirebilecek, girebilecek
  //   ancak islem yapamayacak"; kutuphane de "gorunsun ama orada da islem
  //   yapamasin". Menuyu tek maddeye indirmek, kisinin 30 gun icinde
  //   emegini yanina almasinin YOLUNU KAPATIYORDU.
  //
  // ⚠ OLCUT "calisiyor mu", "yazabiliyor mu" DEGIL: burada duran her yol
  //   arka yuzde `@KapaliHesapIzinli` tasiyan OKUMA uclariyla ikizdir
  //   (`api.ts` KAPALI_HESABIN_KALABILECEGI_YOL ve `erisim-durumu.ts`
  //   KAPALI_HESABIN_OKUYABILECEGI_YOL ile birlikte UC yerde ayni liste).
  //   Birine yol eklenip otekilere eklenmezse kullanici menude gordugu
  //   sayfada 403 yer ya da `/abonelik`e firlatilir.
  //
  // ⚠ AYRAC ('divider') da elenir: elenen ogelerin arasinda kalan cizgi
  //   menuyu bozuk gosterirdi.
  const KAPALI_HESAPTA_GORUNEN = ['/dashboard', '/quotes', '/library', '/abonelik'];
  const items = user?.hesapKapali === true
    ? NAV_ITEMS.filter(
        (i) => typeof i !== 'string' && KAPALI_HESAPTA_GORUNEN.includes(i.href),
      )
    : NAV_ITEMS;

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 z-40 flex flex-col transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
      // Marka lacivertti (16.08) — eski #0f172a'dan bir ton derin.
      style={{ background: '#0B1528' }}
    >
      {/* Logo — Dashboard'a yonlendirir */}
      <Link href="/dashboard" className="flex h-14 items-center gap-2.5 border-b border-slate-800 px-4 transition-colors hover:bg-slate-800/50">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xl font-black text-white shadow-lg shadow-blue-500/30">
          M
        </div>
        {!collapsed && (
          <span className="text-xl font-extrabold tracking-tight text-white">
            MetaPrice<span className="text-blue-500">X</span>
          </span>
        )}
      </Link>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {items.map((item, i) => {
          if (item === 'divider') {
            return <div key={`div-${i}`} className="my-3 h-px bg-slate-800" />;
          }
          const Icon = item.icon;
          const active = isActive(item.href);
          const section = 'section' in item ? (item as any).section : null;
          return (
            <div key={item.href}>
              {section && !collapsed && (
                <p className="mb-2 mt-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {section}
                </p>
              )}
            <Link
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'mb-1 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all',
                active
                  ? 'border-l-4 border-blue-500 bg-blue-600/20 pl-[10px] font-semibold text-blue-400'
                  : 'font-medium text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
                collapsed && 'justify-center px-0',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
            </div>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="mx-3 mb-2 flex items-center justify-center rounded-lg py-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {/* User — Profil sayfasina yonlendirir.
          16.08: kendi kutusu olan bir kart (koyu zemin + ince cerceve).
          ⚠ Daralmis halde (`collapsed`) kart cercevesi VERILMEZ: 16px'lik
          seritte kutu, avatarin etrafinda kirpilmis bir cerceveye donuyordu. */}
      <Link
        href="/profile"
        className="block border-t border-slate-800 px-3 py-3 transition-colors hover:bg-slate-800/50"
      >
        <div
          className={cn(
            'flex items-center gap-3',
            !collapsed && 'rounded-xl border border-slate-800/60 bg-slate-900/60 p-2',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {initial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-xs font-semibold text-white">
                {user?.email?.split('@')[0] ?? 'Kullanıcı'}
              </p>
              {/* ⚠ TIER RENGI KORUNDU: kullanicinin tasarimi PRO ornegini
                  mavi gosteriyor ama renk burada BILGI tasiyor — core gri,
                  pro mavi, suite mor. Hepsini maviye sabitlemek paket
                  ayrimini ekrandan silerdi. */}
              {/* ⚠ 15.09 (Emre karari): KOD degil AD basilir. `{tier}` + uppercase
                  musteriye "CORE" gosteriyordu; paketin adi "Basic". Renk koddan,
                  yazi adindan (paket-bicim.ts SEVIYE_AD, tek kaynak).
                  ⚠ 2.15: ad `paketRozeti` uzerinden okunur — seviye `null` iken
                  `seviyeAdi` cagrilamaz ve YEDEKLENEMEZ; uydurma ad yerine
                  "Paket yok". Sozluk yine SEVIYE_AD, ikinci esleme YOK. */}
              <span
                className={cn(
                  'inline-block text-[10px] font-bold uppercase tracking-wider',
                  tierStyle.text,
                )}
              >
                {paketRozeti(tier)}
              </span>
            </div>
          )}
        </div>
      </Link>
    </aside>
  );
}
