'use client';

/**
 * AdminLayout — /admin altindaki TUM rotalarin AuthGuard'i + iskeleti.
 *
 * GUVENLIK (PRD):
 *  - Token yok → /login.
 *  - Kullanicinin ROLU 'admin' DEGILSE → /dashboard'a yonlendirilir.
 *    (07.09.2026'da e-posta olcutunden ROL olcutune cevrildi; gerekce
 *    asagida, ADMIN_EMAIL'in kaldirildigi yerde.)
 *  - Ek savunma katmani backend'de zaten var: /admin API'lari
 *    JwtAuthGuard + RolesGuard('admin') ile korunur — frontend guard'i
 *    asilsa bile veri sizmasi olmaz.
 *
 * Iskelet: solda sabit AdminSidebar (w-60), sagda icerik alani.
 */

import { Altbilgi } from '@/ortak/kabuk/components/layout/Altbilgi';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/ozellik/kutuphane/admin/AdminSidebar';

// KAPI OLCUTU: ROL — e-posta DEGIL.
//
// Onceki hal sabit bir e-posta ile karar veriyordu ('admin@metapricex.com').
// Sistemde bes yetki kapisi var ve DORDU rol okuyor: (protected)/layout.tsx
// (Admin Panel baglantisi), profile, dashboard, admin/users tablosu — ve en
// onemlisi BACKEND (roles.guard.ts: `user?.role === role`). Yalniz bu dosya
// e-postaya bakiyordu.
//
// Sonuc: ikinci bir admin acildiginda (Faz 2'nin rol degistirme ekraniyla)
// backend onu admin sayar, menude "Admin Panel" baglantisini GORUR, ama bu
// satir onu sessizce /dashboard'a atardi. Bugun kirilmis degil — canlida tek
// admin var ve e-postasi tutuyor (olculdu) — ama rol degistirme ozelligi
// acilir acilmaz kirilirdi. Bu yuzden 2.2'den ONCE tekillestirildi.

interface StoredUser {
  id: string;
  email: string;
  role: string;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!token || !storedUser) {
      router.replace('/login');
      return;
    }

    try {
      const user = JSON.parse(storedUser) as StoredUser;
      if (user.role !== 'admin') {
        // Admin degil — sessizce uygulamaya geri gonder (PRD: /dashboard)
        router.replace('/dashboard');
        return;
      }
      setAuthorized(true);
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      router.replace('/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guard karari verilene kadar icerik SIZDIRMA — spinner goster
  if (!authorized) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar />
      {/* Icerik — sidebar genisligi kadar sola bosluk */}
      <main className="flex-1 pl-60">
        <div className="px-8 py-8">{children}</div>
        {/* ⚠ ÜÇÜNCÜ DÜZEN — kolayca gözden kaçar. Yalnız kök ve korumalı
            düzene eklenen bir altbilgi admin ekranlarında GÖRÜNMEZ. */}
        <Altbilgi />
      </main>
    </div>
  );
}
