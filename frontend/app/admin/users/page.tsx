'use client';

/**
 * Admin → Kullanıcılar — ilk admin modulu.
 *
 * GET /admin/users (JwtAuthGuard + RolesGuard('admin')) ile kayitli tum
 * kullanicilari shadcn Data Table'da listeler. Sade + veri odakli:
 * client-side arama, rol/tier/durum rozetleri, teklif/kutuphane sayilari,
 * aktif abonelikler. Aksiyonlar (rol/tier/ban) sonraki iterasyonda —
 * backend endpoint'leri hazir.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Users as UsersIcon, RefreshCw, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'banned';
  tier: 'core' | 'pro' | 'suite';
  createdAt: string;
  _count: { quotes: number; library: number };
  subscriptions: Array<{
    id: string;
    level: 'core' | 'pro';
    scope: 'mechanical' | 'electrical' | 'mep';
    active: boolean;
    endsAt: string | null;
  }>;
}

const TIER_VARIANT = { core: 'secondary', pro: 'info', suite: 'purple' } as const;
const SCOPE_LABEL = { mechanical: 'Mek', electrical: 'Elk', mep: 'MEP' } as const;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<AdminUser[]>('/admin/users');
      setUsers(data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Kullanıcılar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.role.includes(q) ||
        u.tier.includes(q) ||
        u.status.includes(q),
    );
  }, [users, query]);

  return (
    <div className="space-y-4">
      {/* Baslik */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
            <UsersIcon className="h-5 w-5 text-blue-600" />
            Kullanıcılar
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {users.length} kayıtlı kullanıcı · rol, paket ve abonelik yönetimi
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
          <RefreshCw className={loading ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} />
          Yenile
        </Button>
      </div>

      {/* Arama */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="E-posta, rol, paket veya durum ara..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-white pl-8"
        />
      </div>

      {/* Data Table */}
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
                <p className="font-medium">Kullanıcılar yüklenemedi</p>
                <p className="mt-0.5 text-xs text-red-500">{error}</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead>E-posta</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="text-right">Teklif</TableHead>
                  <TableHead className="text-right">Kütüphane</TableHead>
                  <TableHead>Abonelikler</TableHead>
                  <TableHead>Kayıt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-slate-400">
                      {query ? `"${query}" ile eşleşen kullanıcı yok` : 'Kayıtlı kullanıcı yok'}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium text-slate-900">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'admin' ? 'purple' : 'secondary'}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={TIER_VARIANT[u.tier] ?? 'secondary'}>{u.tier}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.status === 'active' ? 'success' : 'destructive'}>
                        {u.status === 'active' ? 'aktif' : 'yasaklı'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u._count.quotes}</TableCell>
                    <TableCell className="text-right tabular-nums">{u._count.library}</TableCell>
                    <TableCell>
                      {u.subscriptions.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.subscriptions.map((s) => (
                            <Badge key={s.id} variant="info">
                              {s.level}·{SCOPE_LABEL[s.scope] ?? s.scope}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-slate-500">
                      {new Date(u.createdAt).toLocaleDateString('tr-TR')}
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
