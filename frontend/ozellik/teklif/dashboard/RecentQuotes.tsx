'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import api from '@/ortak/lib/api';

/**
 * ⚠ 09.09 — IKI OLU KUSUR ONARILDI (olcumle bulundu):
 *
 * 1) `totalAmount` alani BACKEND'DE HIC YOKTU. Tum depoda yalniz bu dosyada
 *    geciyordu, yani tutar sutunu HER ZAMAN '—' basiyordu ve kimse fark
 *    etmemisti. Artik toplam, liste sayfasiyla AYNI yoldan (kalemlerin
 *    `finalPrice` toplami) hesaplaniyor. Sunucuya `toplamTutar` diye ayri
 *    bir alan EKLENMEDI: ayni sayi icin iki kaynak, bu depoda tekrarlayan
 *    bir hata sinifi olurdu.
 *
 * 2) `params: { limit: 3 }` OLU bir parametreydi — backend `@Query` almiyordu,
 *    parametre sessizce dusuyor ve bilesen `.slice(0,3)` ile telafi ediyordu.
 *    Yani dashboard 3 teklif gostermek icin TUM teklifleri (her biri `sheets`
 *    ve ham .xlsx binary'siyle) indiriyordu. Uc artik `adet` aliyor.
 */
interface QuoteSummary {
  id: string;
  title: string | null;
  createdAt: string;
  _count?: { items: number };
  items?: { id: string; finalPrice: number }[];
  durum?: string;
}

export default function RecentQuotes() {
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      // ⚠ Ad `adet` — `limit` DEGIL (backend DTO'suyla birebir; yanlis ad
      //   sessizce duser ve widget yine hepsini indirir).
      .get<QuoteSummary[]>('/quotes', { params: { adet: 3 } })
      .then(({ data }) => setQuotes(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmt = (v: number) =>
    v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return d;
    }
  };

  return (
    <div className="flex flex-col rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <span className="text-sm font-semibold">Son Teklifler</span>
        <span className="text-[11px] text-muted-foreground">son 3</span>
      </div>

      <div className="flex-1 px-5 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Henuz teklif olusturulmadi</p>
          </div>
        ) : (
          // `.slice(0,3)` KORUNDU: sunucu artik 3 kayit donuyor ama eski bir
          // sekme (bayat JS) hala parametresiz istek atabilir — o durumda
          // widget yine 3 satir gosterir.
          quotes.slice(0, 3).map((q) => {
            const itemCount = q._count?.items ?? 0;
            const total = (q.items ?? []).reduce((s, i) => s + (i.finalPrice ?? 0), 0);
            return (
              <Link
                key={q.id}
                href={`/quotes/${q.id}`}
                className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0 transition-colors hover:bg-slate-50/50 -mx-5 px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{q.title || 'Isimsiz Teklif'}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{itemCount} kalem</p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-semibold tabular-nums">
                    {total > 0 ? `₺${fmt(total)}` : '—'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtDate(q.createdAt)}</p>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {quotes.length > 0 && (
        <Link
          href="/quotes"
          className="block border-t px-5 py-3 text-center text-[13px] font-medium text-blue-600 transition-colors hover:bg-slate-50"
        >
          Tum teklifleri gor →
        </Link>
      )}
    </div>
  );
}
