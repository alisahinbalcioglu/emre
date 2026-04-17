'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LogOut,
  User,
  TrendingUp,
  ChevronDown,
  Settings,
} from 'lucide-react';
import { CapabilitiesProvider } from '@/contexts/CapabilitiesContext';
import Sidebar from '@/components/layout/Sidebar';
import Breadcrumb from '@/components/layout/Breadcrumb';

/* ------------------------------------------------------------------ */
/*  Currency Widget                                                    */
/* ------------------------------------------------------------------ */

interface ExchangeRates {
  usdTry: number | null;
  eurTry: number | null;
}

function useCurrencyRates(): ExchangeRates {
  const [rates, setRates] = useState<ExchangeRates>({ usdTry: null, eurTry: null });

  useEffect(() => {
    async function fetchRates() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!res.ok) return;
        const data = await res.json();
        const tryRate: number = data.rates?.TRY;
        const eurRate: number = data.rates?.EUR;
        if (!tryRate || !eurRate) return;
        setRates({ usdTry: tryRate, eurTry: tryRate / eurRate });
      } catch {
        // sessizce gec
      }
    }
    fetchRates();
  }, []);

  return rates;
}

function CurrencyWidget() {
  const { usdTry, eurTry } = useCurrencyRates();
  if (!usdTry || !eurTry) return null;
  const fmt = (v: number) =>
    v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-2.5 py-1 text-xs">
      <TrendingUp className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="flex items-center gap-1">
        <span className="font-semibold">USD</span>
        <span className="text-emerald-600 font-medium">₺{fmt(usdTry)}</span>
      </span>
      <span className="text-muted-foreground/40">|</span>
      <span className="flex items-center gap-1">
        <span className="font-semibold">EUR</span>
        <span className="text-emerald-600 font-medium">₺{fmt(eurTry)}</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  User Dropdown                                                      */
/* ------------------------------------------------------------------ */

interface StoredUser {
  id: string;
  email: string;
  role: string;
  tier?: string;
}

function UserDropdown({ user, onLogout }: { user: StoredUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
      >
        <User className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden max-w-[140px] truncate sm:inline">{user.email}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border bg-popover shadow-lg">
            <div className="border-b px-4 py-3">
              <p className="text-xs text-muted-foreground">Giris yapildi</p>
              <p className="mt-0.5 truncate text-sm font-medium">{user.email}</p>
            </div>
            {user.role === 'admin' && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 border-b px-4 py-2.5 text-sm transition-colors hover:bg-accent"
              >
                <Settings className="h-4 w-4" />
                Admin Panel
              </Link>
            )}
            <button
              type="button"
              onClick={() => { setOpen(false); onLogout(); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              Cikis Yap
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!token || !storedUser) {
      router.replace('/login');
      return;
    }

    try {
      setUser(JSON.parse(storedUser) as StoredUser);
      setIsChecking(false);
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      router.replace('/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.replace('/login');
  }

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <CapabilitiesProvider>
      <div className="flex min-h-screen bg-background">
        {/* Sidebar */}
        <Sidebar user={user} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />

        {/* Main content area — padding sidebar genisligine gore */}
        <div className="flex flex-1 flex-col transition-all duration-200" style={{ paddingLeft: sidebarCollapsed ? 64 : 240 }}>
          {/* Top Header — compact */}
          <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between border-b bg-background/95 px-8 backdrop-blur">
            <Breadcrumb />
            <div className="flex items-center gap-3">
              <CurrencyWidget />
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 px-8 py-8">
            {children}
          </main>
        </div>
      </div>
    </CapabilitiesProvider>
  );
}
