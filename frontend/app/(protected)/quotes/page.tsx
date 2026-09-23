'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, Trash2, FileText, Loader2, Search } from 'lucide-react';
import { Button } from '@/ortak/ui/button';
import { GeriButonu } from '@/ortak/ui/geri-butonu';
import { Card, CardContent, CardHeader, CardTitle } from '@/ortak/ui/card';
import api from '@/ortak/lib/api';
import { toast } from '@/ortak/hooks/use-toast';
import { confirm } from '@/ortak/hooks/use-confirm';
import { Badge } from '@/ortak/ui/badge';
import { teklifDurumGorunumu } from '@/ozellik/teklif/durum';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';

interface QuoteItem {
  id: string;
  finalPrice: number;
}

interface Quote {
  id: string;
  title: string;
  createdAt: string;
  _count: { items: number };
  items: QuoteItem[];
  // FAZ 4.6 — sunucu artik bunlari da donuyor (quotes.service `select`).
  durum?: string;
  quoteNo?: string | null;
  musteri?: string | null;
  proje?: string | null;
  // FAZ 7 F1b (§3.8): firmalar cok kisili — "bunu kim hazirladi".
  // ⚠ `Quote.hazirlayan` SEMADA AYRI bir metin alanidir (antete elle yazilan
  // ad); bu liste ucunda o alan DONMEZ, buradaki `hazirlayan` FIRMA UYESIDIR.
  userId?: string | null;
  hazirlayan?: { gorunenAd: string; ayrildi: boolean } | null;
}

function formatCurrencyTR(value: number): string {
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function calculateTotal(items: QuoteItem[]): number {
  return items.reduce((sum, item) => sum + (item.finalPrice ?? 0), 0);
}

export default function QuotesPage() {
  const router = useRouter();
  /**
   * SALT-OKUNUR MOD — kapatılmış hesap (22.09.2026, Emre kararı).
   * "kaydedilmiş tekliflerini görebilecek, indirebilecek, girebilecek ancak
   * işlem yapamayacak."
   * ⚠ Bu satır KAPI DEĞİL, yalnız ekranı dürüst tutar: gerçek kapı sunucuda
   *   (`@KapaliHesapIzinli` yalnız OKUYAN uçlarda). Düğmeyi gizlemek
   *   kapatmak değildir; ama açık bırakmak da kullanıcıya 403 yedirmektir.
   */
  const { kapali, izinVar } = useCapabilities();
  const saltOkunur = kapali?.kapali === true;
  // 23.09.2026 — "Son teklifler & tutar" izni kapali alt kullanici: sunucu
  // listeyi YALNIZ kendi tekliflerine daraltir (`teklifKosulu`). Not, neden
  // az teklif gordugunu soyler; kapi degildir.
  const yalnizKendi = !izinVar('firmaTeklifleri');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  // FAZ 7 F1b: kendi teklifimde "Hazırlayan" satırı GÖSTERİLMEZ (tek kişilik
  // firmada hiç görünmesin). Kimlik localStorage kopyasından okunur —
  // `/auth/me` için ek bir istek atmaya değmez.
  const [benimId, setBenimId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const ham = localStorage.getItem('user');
      setBenimId(ham ? (JSON.parse(ham)?.id ?? null) : null);
    } catch {
      setBenimId(null);
    }
  }, []);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [arama, setArama] = useState('');
  const [toplam, setToplam] = useState(0);

  // Süzgeçler SUNUCUYA gider (admin listesindeki desenin aynısı). Dönen şekil
  // DÜZ DİZİ kalır — `{veri, toplam}`a geçmek aşağıdaki `quotes.map` çağrısını
  // RENDER sırasında çökertirdi ve fetch'in try/catch'i onu YAKALAMAZ.
  // Toplam kayıt `X-Toplam-Kayit` başlığından okunur.
  async function fetchQuotes() {
    try {
      const params: Record<string, string> = {};
      if (arama.trim()) params.arama = arama.trim();
      const yanit = await api.get<Quote[]>('/quotes', { params });
      setQuotes(yanit.data);
      const basliktaki = yanit.headers?.['x-toplam-kayit'];
      setToplam(basliktaki !== undefined ? Number(basliktaki) : yanit.data.length);
    } catch {
      setError('Teklifler yüklenirken bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  }

  // Metin aramasında 300 ms gecikme: her tuşta istek atmak sunucuyu yorar.
  useEffect(() => {
    const t = setTimeout(fetchQuotes, arama ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arama]);

  async function handleDelete(id: string, title: string) {
    if (!(await confirm(`"${title}" teklifi silinsin mi?`))) return;

    try {
      await api.delete(`/quotes/${id}`);
      setQuotes((prev) => prev.filter((q) => q.id !== id));
      toast({ title: 'Teklif silindi', description: `"${title}" başarıyla silindi.` });
    } catch {
      toast({
        title: 'Hata',
        description: 'Teklif silinirken bir hata oluştu.',
        variant: 'destructive',
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* GERI (14.08 kullanici istegi) — kutuphane/iscilik sayfalariyla ayni desen */}
      <GeriButonu hedef="/dashboard" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Teklifler
            {toplam > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">({toplam})</span>
            )}
          </h1>
          {/* Not başlığın DIŞINDA: içinde olsaydı ekran okuyucu başlığı
              "TekliflerYalnız kendi…" diye okurdu (önizlemede ölçüldü). */}
          {yalnizKendi && (
            <p className="mt-1 text-xs text-muted-foreground">
              Yalnız kendi hazırladığınız teklifler gösteriliyor.
            </p>
          )}
        </div>
        {/* Arama SUNUCUYA gider (liste büyüdüğünde istemcide filtrelemek
            tüm kayıtları indirmek demektir).
            ⚠ 23.09.2026 — DURUM SÜZGECİ KALDIRILDI (Emre kararı, canlı ekrana
            bakarak). Yerli `<select>` işletim sisteminin kendi menüsünü
            çiziyordu ve uygulamanın geri kalanına benzemiyordu. Sunucu tarafı
            `durum` parametresini HÂLÂ destekliyor (`TekliflerSorgusuDto`);
            kaldırılan yalnız ön yüzdeki giriştir. Durum bilgisi listede rozet
            olarak GÖRÜNMEYE devam eder. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Başlık, müşteri, proje, teklif no…"
              aria-label="Tekliflerde ara"
              className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            {/* ⚠ SÜZGEÇ AÇIKKEN "hiç teklif yok" DEMEK YANLIŞ olur:
                kullanıcı teklifleri silinmiş sanır. İki durum ayrılır. */}
            {arama.trim() ? (
              <>
                <p className="mb-2 text-lg font-medium text-muted-foreground">
                  Bu süzgece uyan teklif yok.
                </p>
                <p className="text-sm text-muted-foreground">
                  Süzgeci değiştirin ya da aramayı temizleyin.
                </p>
              </>
            ) : (
              <>
                <p className="mb-2 text-lg font-medium text-muted-foreground">
                  Henüz teklif oluşturmadınız.
                </p>
                <p className="text-sm text-muted-foreground">
                  Dashboard&apos;dan keşif dosyanızı (Excel/DWG) yükleyerek başlayın.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      #
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Başlık
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Oluşturma Tarihi
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Durum
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Kalem Sayısı
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Toplam Tutar
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      İşlemler
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote, index) => {
                    const total = calculateTotal(quote.items);

                    return (
                      <tr
                        key={quote.id}
                        className="border-b transition-colors hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 text-muted-foreground">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {quote.title}
                          {/* Müşteri/proje/teklif no ALTINDA: bu alanlar şemada
                              vardı ama 06.08'den beri hiçbir ekran yazmıyordu,
                              dolayısıyla hiç görünmüyorlardı da (FAZ 4.5). */}
                          {(quote.quoteNo || quote.musteri || quote.proje) && (
                            <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                              {[quote.quoteNo, quote.musteri, quote.proje]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                          {/* ⚠ YALNIZ BASKASININ teklifinde: tek kisilik
                              firmada bu satir HIC gorunmez. */}
                          {quote.hazirlayan && quote.userId !== benimId && (
                            <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                              Hazırlayan: {quote.hazirlayan.gorunenAd}
                              {quote.hazirlayan.ayrildi ? ' (ayrıldı)' : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(quote.createdAt).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={teklifDurumGorunumu(quote.durum).rozet}>
                            {teklifDurumGorunumu(quote.durum).etiket}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {quote._count.items}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          ₺{formatCurrencyTR(total)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/quotes/${quote.id}`)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              Detay
                            </Button>
                            {/* 22.09: kapali hesap "islem yapamaz" — silme
                                arka yuzde de kapali (`@Delete` izin TASIMAZ),
                                dugmeyi birakmak 403 uretirdi. */}
                            {!saltOkunur && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              onClick={() => handleDelete(quote.id, quote.title)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Sil
                            </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
