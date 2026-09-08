'use client';

/**
 * E-POSTA DOĞRULAMA (Faz 3.4).
 *
 * Bağlantıya tıklayan kullanıcı oturum açmamış olabilir (bağlantıyı
 * telefonundan açar) — bu yüzden sayfa korumasız ve uç guard'sız.
 * Kimlik, token'ın kendisidir.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/ortak/lib/api';
import { KimlikKabugu } from '@/ortak/ui/kimlik-kabugu';

export default function VerifyEmailPage() {
  const [durum, setDurum] = useState<'bekliyor' | 'tamam' | 'hata' | 'tokensiz'>('bekliyor');
  const [mesaj, setMesaj] = useState('');
  // React 18 StrictMode geliştirmede effect'i İKİ KEZ koşturur. Token TEK
  // KULLANIMLIK olduğu için ikinci çağrı "geçersiz" döner ve kullanıcı
  // başarılı bir doğrulamayı HATA olarak görürdü.
  const kosuldu = useRef(false);

  useEffect(() => {
    if (kosuldu.current) return;
    kosuldu.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token || !token.trim()) {
      setDurum('tokensiz');
      return;
    }
    api
      .post('/auth/verify-email', { token })
      .then(({ data }) => {
        setDurum('tamam');
        setMesaj(data?.mesaj ?? 'E-posta adresiniz doğrulandı.');
      })
      .catch((err) => {
        setDurum('hata');
        setMesaj(
          err.response?.data?.message ||
            'Doğrulama bağlantısı geçersiz ya da süresi dolmuş.',
        );
      });
  }, []);

  return (
    <KimlikKabugu
      baslik={
        durum === 'tamam'
          ? 'E-postanız doğrulandı'
          : durum === 'bekliyor'
            ? 'Doğrulanıyor…'
            : 'Doğrulanamadı'
      }
      altBaglanti={{ metin: 'Hesabınıza dönün:', baglantiMetni: 'Giriş yapın', href: '/login' }}
    >
      {durum === 'bekliyor' && (
        <p className="text-xs text-slate-500">Bağlantınız kontrol ediliyor…</p>
      )}
      {durum === 'tamam' && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs leading-relaxed text-emerald-800">
          {mesaj}
        </p>
      )}
      {durum === 'hata' && (
        <div className="space-y-3">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
            {mesaj}
          </p>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Giriş yaptıktan sonra hesap sayfanızdan yeni bir doğrulama bağlantısı
            isteyebilirsiniz.
          </p>
        </div>
      )}
      {durum === 'tokensiz' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900">
          Bu sayfaya e-postanızdaki doğrulama bağlantısıyla gelmeniz gerekiyor.
        </p>
      )}
      {durum !== 'bekliyor' && (
        <Link
          href="/login"
          className="mt-4 block w-full rounded-xl bg-[#0B1528] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800"
        >
          Giriş ekranına git
        </Link>
      )}
    </KimlikKabugu>
  );
}
