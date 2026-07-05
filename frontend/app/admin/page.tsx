'use client';

/** /admin → ilk modul olan Kullanicilar sayfasina yonlendir. */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/users');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
