'use client';

/**
 * YENİ PAROLA BELİRLEME (Faz 3.3).
 *
 * ⚠ TOKEN `window.location.search`'ten okunur, `useSearchParams`'tan DEĞİL:
 * App Router'da `useSearchParams` kullanan bir istemci bileşeni Suspense
 * sınırı istemez ise `next build` sırasında prerender hatası verir. Bu sayfa
 * derleme kırmadan çalışmak zorunda — token zaten yalnız tarayıcıda gerekli.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/ortak/lib/api';
import { ParolaAlani } from '@/ortak/ui/parola-alani';
import { KimlikKabugu, KimlikDugmesi } from '@/ortak/ui/kimlik-kabugu';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [parola, setParola] = useState('');
  const [tekrar, setTekrar] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bitti, setBitti] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    setToken(t && t.trim() ? t : '');
  }, []);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    if (parola !== tekrar) {
      setHata('Parolalar eşleşmiyor.');
      return;
    }
    setYukleniyor(true);
    setHata(null);
    try {
      await api.post('/auth/reset-password', { token, yeniParola: parola });
      setBitti(true);
      // Eski oturum artık geçersiz (sunucu passwordChangedAt damgaladı) —
      // tarayıcıdaki bayat token'ı da temizle, yoksa /login'e giderken
      // araya giren korumalı bir sayfa 401 döngüsü yaratır.
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: any) {
      setHata(
        err.response?.data?.message ||
          'Parola güncellenemedi. Bağlantının süresi dolmuş olabilir.',
      );
    } finally {
      setYukleniyor(false);
    }
  }

  if (token === '') {
    return (
      <KimlikKabugu
        baslik="Bağlantı geçersiz"
        altBaglanti={{ metin: 'Yeni bağlantı mı lazım?', baglantiMetni: 'Buradan isteyin', href: '/forgot-password' }}
      >
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
          Bu sayfaya bir sıfırlama bağlantısıyla gelmeniz gerekiyor. Bağlantıyı
          e-postanızdan tekrar açmayı deneyin.
        </p>
      </KimlikKabugu>
    );
  }

  if (bitti) {
    return (
      <KimlikKabugu baslik="Parolanız güncellendi">
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs leading-relaxed text-emerald-800">
          Yeni parolanızla giriş yapabilirsiniz. Güvenlik için diğer
          cihazlardaki oturumlar kapatıldı. Giriş ekranına yönlendiriliyorsunuz…
        </p>
      </KimlikKabugu>
    );
  }

  return (
    <KimlikKabugu
      baslik="Yeni parolanızı belirleyin"
      aciklama="En az 8 karakter olmalı. Kaydettiğinizde diğer cihazlardaki oturumlar kapanır."
      altBaglanti={{ metin: 'Vazgeçtiniz mi?', baglantiMetni: 'Giriş yapın', href: '/login' }}
    >
      <form onSubmit={gonder} className="space-y-4">
        <div>
          <label htmlFor="parola" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Yeni Parola
          </label>
          <ParolaAlani
            id="parola"
            value={parola}
            onChange={setParola}
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        <div>
          <label htmlFor="tekrar" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Yeni Parola (tekrar)
          </label>
          <ParolaAlani
            id="tekrar"
            value={tekrar}
            onChange={setTekrar}
            autoComplete="new-password"
            minLength={8}
          />
        </div>

        {hata && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{hata}</p>
        )}

        <KimlikDugmesi yukleniyor={yukleniyor || token === null}>
          {yukleniyor ? 'Kaydediliyor…' : 'Parolamı güncelle'}
        </KimlikDugmesi>
      </form>
    </KimlikKabugu>
  );
}
