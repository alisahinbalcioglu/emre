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
import Link from 'next/link';
import {
  Loader2, Search, Users as UsersIcon, RefreshCw, AlertCircle, Trash2, ScrollText,
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
  firmaId: string | null;
  firma: { id: string; ad: string } | null;
  /// YETKILI KAYNAK (Abonelik -> PaketSurumu -> Paket). null = firma ya da
  /// abonelik yok.
  gercekPaket: {
    kod: string;
    ad: string;
    kapsam: string;
    seviye: 'core' | 'pro';
    durum: string;
    erisimSonu: string | null;
  } | null;
  /// `User.tier` ile yetkili kaynak AYRISIYOR MU.
  paketAyrismasi: boolean;
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
  /** Sunucunun bildirdiği TOPLAM kayıt — `users.length` yalnız sayfayı sayar. */
  const [toplam, setToplam] = useState(0);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      // Suzgecler SUNUCUYA gider (2.1). Donen sekil hala DUZ DIZI — bilerek:
      // `{veri, toplam}` sekline gecmek `users.filter` cagrisini render
      // sirasinda cokertirdi ve kullanici hata kutusu degil BOS SAYFA gorurdu.
      // Toplam kayit `X-Toplam-Kayit` basliginda gelir.
      const params: Record<string, string> = {};
      if (query.trim()) params.arama = query.trim();
      if (rolSuzgec !== HEPSI) params.rol = rolSuzgec;
      if (paketSuzgec !== HEPSI) params.paket = paketSuzgec;
      if (durumSuzgec !== HEPSI) params.durum = durumSuzgec;
      const yanit = await api.get<AdminUser[]>('/admin/users', { params });
      setUsers(yanit.data);
      const basliktaki = yanit.headers?.['x-toplam-kayit'];
      setToplam(basliktaki !== undefined ? Number(basliktaki) : yanit.data.length);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Kullanıcılar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }

  // Süzgeç değişince sunucudan yeniden çekilir. Metin araması için 300 ms
  // gecikme: her tuşta istek atmak sunucuyu gereksiz yorar.
  useEffect(() => {
    const t = setTimeout(fetchUsers, query ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, rolSuzgec, paketSuzgec, durumSuzgec]);

  useEffect(() => {
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

  // Süzgeçler artık SUNUCUDA uygulanıyor; gelen liste zaten süzülmüştür.
  // `filtered` bilerek bırakıldı: aşağıdaki tablo ve boş-durum metni ona
  // bağlı ve ileride istemci tarafı bir inceltme gerekirse yeri hazır.
  const filtered = users;

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
            {toplam} kayıtlı kullanıcı
            {users.length !== toplam ? ` · ${users.length} gösteriliyor` : ''}
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
                  <TableHead>Paket (tier)</TableHead>
                  <TableHead>Gerçek paket</TableHead>
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
                    <TableCell colSpan={10} className="py-10 text-center text-sm text-slate-400">
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

                      <TableCell>
                        {u.gercekPaket ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge variant={u.gercekPaket.seviye === 'pro' ? 'info' : 'secondary'}>
                              {u.gercekPaket.ad}
                            </Badge>
                            {u.paketAyrismasi && (
                              <span
                                className="text-[11px] font-medium text-amber-600"
                                title={
                                  'Soldaki tier alanı ile satın alınan paket ayrışıyor. ' +
                                  'Ödeme yolu tier yazmadığı için bu normaldir; erişim ' +
                                  'kararında YÜKSEK olan kullanılır.'
                                }
                              >
                                ⚠ tier ile ayrışıyor
                              </span>
                            )}
                          </div>
                        ) : (
                          <span
                            className="text-xs text-slate-400"
                            title={
                              u.firmaId
                                ? 'Firması var ama aboneliği yok'
                                : 'Hesap bir firmaya bağlı değil — ürünün hiçbir yerini kullanamaz'
                            }
                          >
                            {u.firmaId ? 'abonelik yok' : 'firma yok'}
                          </span>
                        )}
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
                        {/* Bu kullanicinin denetim gecmisi. Uc ?hedef=<id>
                            destekliyor; ekran onu okuyor. */}
                        <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                          <Link href={`/admin/denetim?hedef=${u.id}`} title="Bu hesabın işlem geçmişi">
                            <ScrollText className="h-3.5 w-3.5 text-slate-500" />
                          </Link>
                        </Button>
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
