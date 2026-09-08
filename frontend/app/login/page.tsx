'use client';

/**
 * GIRIS EKRANI — MetaPriceX marka kimligi (16.08).
 *
 * "Parolamı unuttum" baglantisi 08.09'da EKLENDI (Faz 3.3). 16.08'de bilerek
 * konmamisti: o gun ne `/forgot-password` sayfasi ne de bir backend ucu vardi
 * ve tiklanip hicbir sey yapmayan bir baglanti, ekranin var olmayan bir sey
 * vaat etmesi olurdu. Artik ikisi de var — soz tutuluyor.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/ortak/lib/api';
import { ParolaAlani } from '@/ortak/ui/parola-alani';
import { toast } from '@/ortak/hooks/use-toast';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/dashboard');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Giriş başarısız',
        description: err.response?.data?.message || 'E-posta veya parola hatalı.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      {/* Marka bloğu — kartın DIŞINDA */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-2xl font-black text-white shadow-lg shadow-blue-500/30">
          M
        </div>
        <h1 className="flex items-center gap-0.5 text-2xl font-extrabold tracking-tight text-slate-900">
          MetaPrice<span className="text-blue-600">X</span>
        </h1>
        <p className="mt-1 text-xs text-slate-500">Teklif ve metraj yönetim merkeziniz</p>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-700">
              E-posta Adresi
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="ornek@sirket.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 transition-all focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
                Parola
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
              >
                Parolamı unuttum
              </Link>
            </div>
            <ParolaAlani
              id="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-[#0B1528] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500">
          Hesabınız yok mu?{' '}
          <Link href="/register" className="font-bold text-blue-600 hover:text-blue-700">
            Kayıt Olun
          </Link>
        </div>
      </div>
    </div>
  );
}
