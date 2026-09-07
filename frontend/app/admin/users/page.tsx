'use client';

/**
 * Admin → Kullanıcılar.
 *
 * GET /admin/users (JwtAuthGuard + RolesGuard('admin')) ile kayıtlı tüm
 * kullanıcıları listeler; rol/paket/durum satır içinde değiştirilir, hesap
 * yumuşak silinir. Her mutasyon backend'de denetim kaydına yazılır.
 *
 * ── 07.09.2026 · FAZ 2.2 + 2.3 ────────────────────────────────────────────
 * Bu sayfa 13.08'den beri vardı ama SALT-OKUNURDU: altı mutasyon ucu backend'de
 * hazır dururken ön yüzde tek bir `api.patch`/`api.delete` çağrısı yoktu
 * (dosyanın eski başlığı da bunu "sonraki iterasyonda" diye kabul ediyordu).
 *
 * SİLME YUMUŞAKTIR. Eskiden `prisma.user.delete` çağrılıyordu ve `Quote` ile
 * `UserLibrary` `onDelete: Cascade` olduğu için kullanıcının BÜTÜN teklifleri
 * geri dönüşü olmadan gidiyordu. Bu yüzden silme düğmesi, arka uçtaki yumuşak
 * silme yazılmadan ÖNCE eklenmedi.
 *
 * KENDİNİ KİLİTLEME KORUMASI iki katmanlıdır: burada düğme kapatılır (niyet
 * belli olsun), backend'de de reddedilir (asıl kapı orası — bu dosya atlanabilir).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Search, Users as UsersIcon, RefreshCw, AlertCircle, Trash2,
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
import { confirm, promptValue } from '@/ortak/hooks/use-confirm';
import { toast } from '@/ortak/hooks/use-toast';

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

const ROLLER = ['admin', 'user'] as const;
const PAKETLER = ['core', 'pro', 'suite'] as const;
const DURUMLAR = ['active', 'banned'] as const;
const DURUM_ETIKET: Record<string, string> = { active: 'aktif', banned: 'yasaklı' };

/** Süzgeç kutularında "hepsi" seçeneği — boş string Select'te kullanılamaz. */
const HEPSI = 'hepsi';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [rolSuzgec, setRolSuzgec] = useState<string>(HEPSI);
  const [paketSuzgec, setPaketSuzgec] = useState<string>(HEPSI);
  const [durumSuzgec, setDurumSuzgec] = useState<string>(HEPSI);
  /** Kaydediliyor olan satır — aynı anda iki istek gitmesin. */
  const [islemdeki, setIslemdeki] = useState<string | null>(null);
  /** Oturumu açık yöneticinin kendi id'si; kendi satırını kilitlemek için. */
  const [kendiId, setKendiId] = useState<string | null>(null);

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
    try {
      const ham = localStorage.getItem('user');
      if (ham) setKendiId((JSON.parse(ham) as { id?: string }).id ?? null);
    } catch {
      /* bozuk kayıt: kendi satırını kilitleyemeyiz, backend yine de reddeder */
    }
  }, []);

  /**
   * Tek mutasyon yolu. Üç uç da aynı şekle sahip olduğu için tek fonksiyon:
   * PATCH → listeyi tazele → sonucu söyle.
   *
   * Hata mesajı SUNUCUDAN gelir, uydurulmaz: backend "Sistemdeki son yönetici"
   * ya da "Kendi rolünüzü değiştiremezsiniz" gibi gerekçeleri kendisi yazıyor.
   */
  async function alanDegistir(
    u: AdminUser,
    alan: 'role' | 'status' | 'tier',
    yeni: string,
  ) {
    const eski = u[alan];
    if (eski === yeni) return;
    setIslemdeki(u.id);
    try {
      await api.patch(`/admin/users/${u.id}/${alan}`, { [alan]: yeni });
      await fetchUsers();
      toast({
        title: 'Güncellendi',
        description: `${u.email} · ${alan} ${eski} → ${yeni}`,
      });
    } catch (e: any) {
      toast({
        title: 'Güncellenemedi',
        description: e?.response?.data?.message ?? e?.message ?? 'Bilinmeyen hata',
        variant: 'destructive',
      });
    } finally {
      setIslemdeki(null);
    }
  }

  /**
   * Yumuşak silme. İKİ aşamalı onay: önce ne olacağı anlatılır, sonra
   * kullanıcının e-postası ELLE yazdırılır. Yanlış yazılırsa istek GİTMEZ.
   */
  async function kullaniciSil(u: AdminUser) {
    const onay = await confirm({
      title: 'Hesabı kapat',
      description:
        `${u.email} hesabı kapatılacak: listeden kalkar, giriş yapamaz ve ` +
        `açık oturumu da geçersizleşir. ${u._count.quotes} teklifi ve ` +
        `${u._count.library} kütüphane satırı SİLİNMEZ, kayıtta kalır. ` +
        `İşlem denetim kaydına yazılır.`,
      confirmText: 'Devam et',
    });
    if (!onay) return;

    const yazilan = await promptValue({
      title: 'Onay için e-postayı yazın',
      description: `Kapatmayı onaylamak için ${u.email} adresini birebir yazın.`,
      confirmText: 'Hesabı kapat',
      input: { yerTutucu: u.email },
    });
    if (yazilan === null) return;
    if (yazilan.trim().toLowerCase() !== u.email.toLowerCase()) {
      toast({
        title: 'Eşleşmedi',
        description: 'Yazılan e-posta hesabın adresiyle aynı değil — hiçbir şey yapılmadı.',
        variant: 'destructive',
      });
      return;
    }

    setIslemdeki(u.id);
    try {
      await api.delete(`/admin/users/${u.id}`);
      await fetchUsers();
      toast({ title: 'Hesap kapatıldı', description: u.email });
    } catch (e: any) {
      toast({
        title: 'Kapatılamadı',
        description: e?.response?.data?.message ?? e?.message ?? 'Bilinmeyen hata',
        variant: 'destructive',
      });
    } finally {
      setIslemdeki(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (rolSuzgec !== HEPSI && u.role !== rolSuzgec) return false;
      if (paketSuzgec !== HEPSI && u.tier !== paketSuzgec) return false;
      if (durumSuzgec !== HEPSI && u.status !== durumSuzgec) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.role.includes(q) ||
        u.tier.includes(q) ||
        u.status.includes(q)
      );
    });
  }, [users, query, rolSuzgec, paketSuzgec, durumSuzgec]);

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
            {users.length} kayıtlı kullanıcı
            {filtered.length !== users.length ? ` · ${filtered.length} gösteriliyor` : ''}
            {' · rol, paket ve abonelik yönetimi'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
          <RefreshCw className={loading ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} />
          Yenile
        </Button>
      </div>

      {/* Arama + suzgecler */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="E-posta, rol, paket veya durum ara..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-white pl-8"
          />
        </div>
        <Select value={rolSuzgec} onValueChange={setRolSuzgec}>
          <SelectTrigger className="w-[8.5rem] bg-white"><SelectValue placeholder="Rol" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={HEPSI}>Tüm roller</SelectItem>
            {ROLLER.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={paketSuzgec} onValueChange={setPaketSuzgec}>
          <SelectTrigger className="w-[9rem] bg-white"><SelectValue placeholder="Paket" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={HEPSI}>Tüm paketler</SelectItem>
            {PAKETLER.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={durumSuzgec} onValueChange={setDurumSuzgec}>
          <SelectTrigger className="w-[9rem] bg-white"><SelectValue placeholder="Durum" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={HEPSI}>Tüm durumlar</SelectItem>
            {DURUMLAR.map((d) => <SelectItem key={d} value={d}>{DURUM_ETIKET[d]}</SelectItem>)}
          </SelectContent>
        </Select>
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
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-slate-400">
                      {query || rolSuzgec !== HEPSI || paketSuzgec !== HEPSI || durumSuzgec !== HEPSI
                        ? 'Süzgeçlerle eşleşen kullanıcı yok'
                        : 'Kayıtlı kullanıcı yok'}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((u) => {
                  const kendisi = u.id === kendiId;
                  const kilitli = islemdeki === u.id;
                  return (
                    <TableRow key={u.id} className={kilitli ? 'opacity-60' : undefined}>
                      <TableCell className="font-medium text-slate-900">
                        {u.email}
                        {kendisi && (
                          <span className="ml-1.5 text-xs font-normal text-slate-400">(siz)</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Select
                          value={u.role}
                          disabled={kilitli || kendisi}
                          onValueChange={(v) => alanDegistir(u, 'role', v)}
                        >
                          <SelectTrigger className="h-7 w-[6.5rem] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLLER.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell>
                        <Select
                          value={u.tier}
                          disabled={kilitli}
                          onValueChange={(v) => alanDegistir(u, 'tier', v)}
                        >
                          <SelectTrigger className="h-7 w-[6.5rem] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAKETLER.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell>
                        <Select
                          value={u.status}
                          disabled={kilitli || kendisi}
                          onValueChange={(v) => alanDegistir(u, 'status', v)}
                        >
                          <SelectTrigger className="h-7 w-[6.5rem] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DURUMLAR.map((d) => (
                              <SelectItem key={d} value={d}>{DURUM_ETIKET[d]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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

                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={kilitli || kendisi}
                          onClick={() => kullaniciSil(u)}
                          title={kendisi ? 'Kendi hesabınızı kapatamazsınız' : 'Hesabı kapat'}
                          className="h-7 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          {kilitli ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
