'use client';

/**
 * KAYIT EKRANI — MetaPriceX marka kimliği (17.08).
 *
 * Giriş ekranı 16.08'de yenilendi ama kayıt ekranı eski shadcn kartında
 * ve İngilizce kaldı: "Kayıt Olun"a basan kullanıcı bambaşka bir uygulamaya
 * düşmüş gibi oluyordu. İki ekran AYNI kabuğu paylaşır — birini değiştiren
 * diğerine de bakmalı.
 *
 * Parola alanı `ParolaAlani` bileşenidir; göz düğmesi iki ekranda ortaktır.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/ortak/lib/api';
import { ParolaAlani } from '@/ortak/ui/parola-alani';
import { toast } from '@/ortak/hooks/use-toast';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // ── FAZ 5.3 · ONAY KUTULARI ──────────────────────────────────────
  // ⚠ İKİSİ AYRI OLMAK ZORUNDA. Ticari ileti iznini sözleşme onayına
  // yedirmek (tek kutu) izni ETK/İYS açısından geçersiz kılar. Ticari
  // ileti kutusu ÖNCEDEN İŞARETSİZ başlar — `useState(false)`.
  const [sozlesmeOnayi, setSozlesmeOnayi] = useState(false);
  const [ticariIletiOnayi, setTicariIletiOnayi] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Onaylar SUNUCUYA gönderilir ve orada ZAMAN DAMGASI olarak kaydedilir.
      // ⚠ Buradaki `required` yalnızca tarayıcı kolaylığıdır; isteği elle atan
      // biri onu hiç görmez. Asıl kapı sunucuda (`@Equals(true)`).
      const { data } = await api.post('/auth/register', {
        email,
        password,
        sozlesmeOnayi,
        ticariIletiOnayi,
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/dashboard');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Kayıt başarısız',
        description: err.response?.data?.message || 'Bir sorun oluştu, lütfen tekrar deneyin.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      {/* Marka bloğu — kartın DIŞINDA (giriş ekranıyla birebir aynı) */}
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
            <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Parola
            </label>
            <ParolaAlani
              id="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={6}
            />
            <p className="mt-1.5 text-[11px] text-slate-500">En az 6 karakter.</p>
          </div>

          {/* ── FAZ 5.3 · ONAYLAR ──────────────────────────────────────
              Sözleşme onayı ZORUNLU ve işaretsiz başlar; ticari ileti izni
              AYRI, opsiyonel ve ÖNCEDEN İŞARETSİZ. */}
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={sozlesmeOnayi}
                onChange={(e) => setSozlesmeOnayi(e.target.checked)}
                required
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-600/30"
              />
              <span className="text-[11px] leading-relaxed text-slate-600">
                <Link href="/kullanim-kosullari" target="_blank" className="font-semibold text-blue-600 hover:text-blue-700">
                  Kullanım Koşulları
                </Link>
                {' '}ve{' '}
                <Link href="/gizlilik" target="_blank" className="font-semibold text-blue-600 hover:text-blue-700">
                  Gizlilik ve KVKK Aydınlatma Metni
                </Link>
                {''}ni okudum, kabul ediyorum.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={ticariIletiOnayi}
                onChange={(e) => setTicariIletiOnayi(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-600/30"
              />
              <span className="text-[11px] leading-relaxed text-slate-600">
                Kampanya ve yenilik duyurularının e-posta ile gönderilmesine izin
                veriyorum. <span className="text-slate-400">(isteğe bağlı — bu kutu
                işaretlenmese de hesabınız açılır)</span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-[#0B1528] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Hesap oluşturuluyor…' : 'Hesap Oluştur'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500">
          Zaten hesabınız var mı?{' '}
          <Link href="/login" className="font-bold text-blue-600 hover:text-blue-700">
            Giriş Yapın
          </Link>
        </div>
      </div>
    </div>
  );
}
