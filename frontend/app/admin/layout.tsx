'use client';

/**
 * AdminLayout — /admin altindaki TUM rotalarin AuthGuard'i + iskeleti.
 *
 * GUVENLIK (PRD):
 *  - Token yok → /login.
 *  - Giris yapan kullanicinin e-postasi admin@metapricex.com DEGILSE →
 *    /dashboard'a yonlendirilir. (Basit e-posta tabanli guard — karmasik
 *    auth provider bilerek YOK; asil kritik guvenlik ileride Odeme Yontemi
 *    modulunde kurulacak.)
 *  - Ek savunma katmani backend'de zaten var: /admin API'lari
 *    JwtAuthGuard + RolesGuard('admin') ile korunur — frontend guard'i
 *    asilsa bile veri sizmasi olmaz.
 *
 * Iskelet: solda sabit AdminSidebar (w-60), sagda icerik alani.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';

/** Admin paneline erisebilen tek hesap (PRD karari). */
const ADMIN_EMAIL = 'admin@metapricex.com';

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
      if (user.email !== ADMIN_EMAIL) {
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
      </main>
    </div>
  );
}
