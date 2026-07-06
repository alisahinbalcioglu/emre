'use client';

/**
 * AdminSidebar — Admin panel sol menusu.
 *
 * Sade + veri odakli: koyu zemin (uygulamanin ana Sidebar'iyla ayni dil),
 * aktif rota vurgusu, "yakinda" modulleri gorunur ama disabled — yol haritasi
 * kullaniciya sezdirilir (Odeme Yontemi guvenlik odagi ileride).
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Users,
  Package,
  Sparkles,
  BarChart3,
  CreditCard,
  ArrowLeft,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Henuz insa edilmedi — tiklanamaz, "yakinda" rozetli */
  soon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin/users', label: 'Kullanıcılar', icon: Users },
  { href: '/admin/brands', label: 'Marka & Fiyat Listeleri', icon: Package },
  { href: '/admin/ai', label: 'AI Ayarları', icon: Sparkles, soon: true },
  { href: '/admin/stats', label: 'İstatistikler', icon: BarChart3, soon: true },
  { href: '/admin/payments', label: 'Ödeme Yöntemleri', icon: CreditCard, soon: true },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.replace('/login');
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-800 bg-slate-950 text-slate-300">
      {/* Logo / baslik */}
      <div className="flex h-[52px] items-center gap-2 border-b border-slate-800 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
          M
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">MetaPriceX</p>
          <p className="flex items-center gap-1 text-[10px] text-blue-400">
            <ShieldCheck className="h-3 w-3" />
            Admin Panel
          </p>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          if (item.soon) {
            return (
              <div
                key={item.href}
                className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600"
                title="Yakında"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                  yakında
                </span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-blue-600/15 font-medium text-blue-400'
                  : 'hover:bg-slate-800/70 hover:text-white',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Alt aksiyonlar */}
      <div className="space-y-0.5 border-t border-slate-800 px-2 py-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-800/70 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Uygulamaya Dön
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Çıkış Yap
        </button>
      </div>
    </aside>
  );
}
