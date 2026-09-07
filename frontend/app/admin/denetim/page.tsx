'use client';

/**
 * Admin → Denetim Kaydı.
 *
 * GET /admin/denetim (JwtAuthGuard + RolesGuard('admin')) — yönetici
 * işlemlerinin SALT OKUNUR dökümü. Yazma yolu yoktur: kayıtlar yalnızca
 * `admin.service.ts` içindeki `denetimYaz` tarafından üretilir.
 *
 * ⚠ BU EKRAN TAMLIK İDDİA ETMEZ. Uç sayfalama sunmuyor; yalnız `take` ile
 * son N kaydı döndürüyor ve backend'de sert tavan 500. Tavana değdiğimizde
 * bunu AÇIKÇA yazarız — yoksa denetçi "böyle bir olay yok" sonucunu
 * yanlışlıkla çıkarır ki bir denetim ekranında bu yanılgının bedeli ağırdır.
 *
 * ⚠ `tip` alanı şemada String, enum DEĞİL. Bugün altı değer yazılıyor ama
 * yarın yedincisi eklenebilir; bu yüzden süzgeç seçenekleri YÜKLENEN VERİDEN
 * türetilir, sabit listeye kilitlenmez.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, Search, ScrollText, RefreshCw, AlertCircle, ArrowLeft,
} from 'lucide-react';
import api from '@/ortak/lib/api';
import { Input } from '@/ortak/ui/input';
import { Button } from '@/ortak/ui/button';
import { Badge } from '@/ortak/ui/badge';
import { Card, CardContent } from '@/ortak/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/ortak/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/ortak/ui/select';

interface YoneticiOlayi {
  id: string;
  yoneticiId: string;
  yoneticiEpsta: string;
  hedefKullaniciId: string | null;
  hedefEposta: string | null;
  tip: string;
  oncekiDeger: string | null;
  yeniDeger: string | null;
  veri: Record<string, unknown> | null;
  olusturuldu: string;
}

/** Backend'deki sert tavan (admin.service.ts `denetimKaydiGetir`). */
const TAVAN = 500;
const ISTENEN = 200;
const HEPSI = 'hepsi';

/** Bilinen tipler için okunur etiket. Bilinmeyen tip HAM gösterilir. */
const TIP_ETIKET: Record<string, string> = {
  'rol.degisti': 'Rol değişti',
  'durum.degisti': 'Durum değişti',
  'paket.degisti': 'Paket değişti',
  'kullanici.silindi': 'Hesap kapatıldı',
  'abonelik.eklendi': 'Abonelik eklendi',
  'abonelik.kaldirildi': 'Abonelik kaldırıldı',
};

const TIP_RENK: Record<string, 'destructive' | 'info' | 'success' | 'secondary'> = {
  'kullanici.silindi': 'destructive',
  'durum.degisti': 'destructive',
  'rol.degisti': 'info',
  'paket.degisti': 'info',
  'abonelik.eklendi': 'success',
  'abonelik.kaldirildi': 'secondary',
};

export default function AdminDenetimPage() {
  const arananParametreler = useSearchParams();
  const hedefParam = arananParametreler?.get('hedef') ?? null;

  const [olaylar, setOlaylar] = useState<YoneticiOlayi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tipSuzgec, setTipSuzgec] = useState<string>(HEPSI);

  async function fetchOlaylar() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: String(ISTENEN) };
      if (hedefParam) params.hedef = hedefParam;
      const { data } = await api.get<YoneticiOlayi[]>('/admin/denetim', { params });
      setOlaylar(data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Denetim kaydı yüklenemedi');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOlaylar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hedefParam]);

  /** Süzgeç seçenekleri VERİDEN türetilir — sabit liste yeni tipi gizlerdi. */
  const tipler = useMemo(
    () => Array.from(new Set(olaylar.map((o) => o.tip))).sort(),
    [olaylar],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return olaylar.filter((o) => {
      if (tipSuzgec !== HEPSI && o.tip !== tipSuzgec) return false;
      if (!q) return true;
      return (
        o.yoneticiEpsta.toLowerCase().includes(q) ||
        (o.hedefEposta ?? '').toLowerCase().includes(q) ||
        o.tip.toLowerCase().includes(q) ||
        (o.oncekiDeger ?? '').toLowerCase().includes(q) ||
        (o.yeniDeger ?? '').toLowerCase().includes(q)
      );
    });
  }, [olaylar, query, tipSuzgec]);

  /** Tavana değdiysek listenin EKSİK olduğunu söylemek zorundayız. */
  const tavanaDegildi = olaylar.length >= ISTENEN;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
            <ScrollText className="h-5 w-5 text-blue-600" />
            Denetim Kaydı
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {olaylar.length} kayıt
            {filtered.length !== olaylar.length ? ` · ${filtered.length} gösteriliyor` : ''}
            {hedefParam ? ' · tek kullanıcı süzgeci etkin' : ' · yönetici işlemleri, en yeniden eskiye'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hedefParam && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/denetim">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Tümü
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchOlaylar} disabled={loading}>
            <RefreshCw className={loading ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} />
            Yenile
          </Button>
        </div>
      </div>

      {tavanaDegildi && (
        <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Bu liste eksik olabilir</p>
            <p className="mt-0.5 text-xs">
              En son {ISTENEN} kayıt gösteriliyor ve tavana değildi; daha eski işlemler
              bu ekranda GÖRÜNMÜYOR. &quot;Böyle bir işlem yok&quot; sonucunu bu listeye
              bakarak çıkarmayın. Uç sayfalama sunmuyor, sert tavan {TAVAN}.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Yönetici, hedef, tip veya değer ara..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-white pl-8"
          />
        </div>
        <Select value={tipSuzgec} onValueChange={setTipSuzgec}>
          <SelectTrigger className="w-[13rem] bg-white"><SelectValue placeholder="İşlem tipi" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={HEPSI}>Tüm işlemler</SelectItem>
            {tipler.map((t) => (
              <SelectItem key={t} value={t}>{TIP_ETIKET[t] ?? t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 p-6 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Denetim kaydı yüklenemedi</p>
                <p className="mt-0.5 text-xs text-red-500">{error}</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead>Ne zaman</TableHead>
                  <TableHead>Kim</TableHead>
                  <TableHead>İşlem</TableHead>
                  <TableHead>Kime</TableHead>
                  <TableHead>Değişiklik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-400">
                      {olaylar.length === 0
                        ? 'Henüz yönetici işlemi kaydedilmemiş.'
                        : 'Süzgeçlerle eşleşen kayıt yok'}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap text-xs text-slate-500">
                      {new Date(o.olusturuldu).toLocaleString('tr-TR')}
                    </TableCell>
                    <TableCell className="text-sm text-slate-900">{o.yoneticiEpsta}</TableCell>
                    <TableCell>
                      <Badge variant={TIP_RENK[o.tip] ?? 'secondary'}>
                        {TIP_ETIKET[o.tip] ?? o.tip}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {o.hedefEposta ?? <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {o.oncekiDeger || o.yeniDeger ? (
                        <span className="tabular-nums">
                          {o.oncekiDeger ?? '—'} <span className="text-slate-400">→</span>{' '}
                          <span className="font-medium text-slate-900">{o.yeniDeger ?? '—'}</span>
                        </span>
                      ) : o.veri ? (
                        <span
                          className="text-xs text-slate-500"
                          title={JSON.stringify(o.veri)}
                        >
                          {Object.entries(o.veri)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(' · ')}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
