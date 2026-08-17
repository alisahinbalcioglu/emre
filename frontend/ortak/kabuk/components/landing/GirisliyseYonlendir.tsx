'use client';

/**
 * Giris yapmis kullaniciyi `/` uzerinden dashboard'a gecirir (17.08).
 *
 * NEDEN AYRI DOSYA: `/` artik bir TANITIM sayfasi ve sayfanin tamami sunucuda
 * uretilir — arama motorlari ve ilk boyama icin sart. Token ise `localStorage`
 * icinde, yani yalniz tarayicida okunabilir. Butun sayfayi `'use client'`
 * yapmak, tanitim metnini sunucu ciktisindan silerdi; bu yuzden yalniz BU
 * kucuk parca istemcide kosar, sayfanin geri kalani statik kalir.
 *
 * ⚠ Bu bir GUVENLIK kapisi DEGIL, yalnizca kolaylik. Korumali sayfalari
 * `(protected)` kabugu ve backend'in JWT dogrulamasi korur. Burada token'in
 * yalnizca VARLIGINA bakilir, gecerliligine degil.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function GirisliyseYonlendir() {
  const router = useRouter();

  useEffect(() => {
    if (localStorage.getItem('token')) {
      router.replace('/dashboard');
    }
  }, [router]);

  return null;
}
