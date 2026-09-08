'use client';

/**
 * PAROLA SIFIRLAMA İSTEĞİ (Faz 3.3).
 *
 * ⚠ EKRAN, SUNUCUNUN TEKDÜZE CEVABINI OLDUĞU GİBİ GÖSTERİR ve "bu e-posta
 * kayıtlı değil" gibi bir şey ASLA söylemez. Sunucu numaralandırmaya karşı
 * özenle tek cevap dönüyor; ön yüzün burada "bulunamadı" demesi o savunmayı
 * TEK SATIRDA çöpe atardı.
 */

import { useState } from 'react';
import api from '@/ortak/lib/api';
import { KimlikKabugu, KimlikDugmesi } from '@/ortak/ui/kimlik-kabugu';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setYukleniyor(true);
    setHata(null);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setSonuc(data?.mesaj ?? 'İstek alındı.');
    } catch (err: any) {
      // 429 = hız sınırı. Bunu ayrı söylemek numaralandırma sızdırmaz:
      // sınır e-postanın kayıtlı olup olmamasından bağımsız işler.
      setHata(
        err.response?.status === 429
          ? 'Çok fazla deneme yaptınız. Lütfen bir süre sonra tekrar deneyin.'
          : err.response?.data?.message || 'İstek gönderilemedi, tekrar deneyin.',
      );
    } finally {
      setYukleniyor(false);
    }
  }

  if (sonuc) {
    return (
      <KimlikKabugu
        baslik="Bağlantı gönderildi"
        altBaglanti={{ metin: 'Hatırladınız mı?', baglantiMetni: 'Giriş yapın', href: '/login' }}
      >
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs leading-relaxed text-emerald-800">
          {sonuc}
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Bağlantı 1 saat geçerlidir ve yalnızca bir kez kullanılabilir.
        </p>
      </KimlikKabugu>
    );
  }

  return (
    <KimlikKabugu
      baslik="Parolanızı mı unuttunuz?"
      aciklama="Hesabınızın e-posta adresini girin; parolanızı sıfırlamanız için bir bağlantı gönderelim."
      altBaglanti={{ metin: 'Hatırladınız mı?', baglantiMetni: 'Giriş yapın', href: '/login' }}
    >
      <form onSubmit={gonder} className="space-y-4">
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

        {hata && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{hata}</p>
        )}

        <KimlikDugmesi yukleniyor={yukleniyor}>
          {yukleniyor ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
        </KimlikDugmesi>
      </form>
    </KimlikKabugu>
  );
}
