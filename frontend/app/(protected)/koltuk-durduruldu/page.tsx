'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/ortak/lib/api';

/**
 * FAZ 7 F1b — KİŞİ SINIRI DURDURMA EKRANI (§6.12, Emre kararı E-3).
 *
 * ⚠ Bu sayfa YALNIZ İZİNLİ uçları çağırır (`/auth/me`, veri indirme, hesap
 * kapatma). Başka bir uç çağırsaydı 403 `KOLTUK_ASILDI` alır, `api.ts`
 * yakalayıcısı yeniden buraya yönlendirir ve sonsuz döngü olurdu.
 *
 * ⚠ Kullanıcı ÇIKIŞA ATILMAZ ve verisi silinmez: paket yükseltildiğinde ya
 * da ekip düzenlendiğinde bir sonraki istek kendiliğinden geçer.
 */
type Koltuk = { durduruldu: boolean; hak: number | null; sahipAdi: string | null };

export default function KoltukDurdurulduSayfasi() {
  const router = useRouter();
  const [koltuk, setKoltuk] = useState<Koltuk | null>(null);
  const [firmaAd, setFirmaAd] = useState<string | null>(null);
  const [deneniyor, setDeneniyor] = useState(false);

  const kontrolEt = useCallback(async () => {
    setDeneniyor(true);
    try {
      const { data } = await api.get('/auth/me');
      setKoltuk(data?.koltuk ?? null);
      setFirmaAd(data?.firma?.ad ?? null);
      // Paket yükseltilmiş ya da ekip düzenlenmiş → panoya dön.
      if (data?.koltuk?.durduruldu === false) router.push('/dashboard');
    } finally {
      setDeneniyor(false);
    }
  }, [router]);

  useEffect(() => {
    void kontrolEt();
  }, [kontrolEt]);

  function cikis() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold text-slate-100">Erişiminiz geçici olarak durduruldu</h1>

      <p className="mt-4 text-slate-300">
        Firmanızın paketi {koltuk?.hak ?? '—'} kişilik; yöneticiniz paketi yükseltmeli ya da
        ekibi düzenlemeli.
      </p>

      {firmaAd && <p className="mt-2 text-sm text-slate-400">Firma: {firmaAd}</p>}
      {koltuk?.sahipAdi && (
        <p className="text-sm text-slate-400">Firma sahibi: {koltuk.sahipAdi}</p>
      )}

      <p className="mt-4 text-sm text-slate-400">
        Verileriniz silinmedi; paket yükseltildiğinde ya da ekip düzenlendiğinde kaldığınız
        yerden devam edersiniz.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void kontrolEt()}
          disabled={deneniyor}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Tekrar dene
        </button>
        {/* ⚠ KVKK hakları ödeme/koltuk durumuna BAĞLANAMAZ — iki uç da izinli. */}
        <a
          href="/api/auth/hesabim/verilerim"
          className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-200"
        >
          Verilerimi indir
        </a>
        <a
          href="/profile#hesabi-kapat"
          className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-200"
        >
          Hesabımı kapat
        </a>
        <button
          type="button"
          onClick={cikis}
          className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-200"
        >
          Çıkış
        </button>
      </div>
    </div>
  );
}
