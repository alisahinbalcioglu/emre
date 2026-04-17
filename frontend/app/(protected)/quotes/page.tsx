'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Eye, Trash2, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';

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
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchQuotes() {
      try {
        const { data } = await api.get<Quote[]>('/quotes');
        setQuotes(data);
      } catch {
        setError('Teklifler yüklenirken bir hata oluştu.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchQuotes();
  }, []);

  async function handleDelete(id: string, title: string) {
    const confirmed = window.confirm(
      `"${title}" teklifini silmek istediğinize emin misiniz?`,
    );
    if (!confirmed) return;

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
      <div className="mb-6">
        <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Teklifler</h1>
        <Button asChild>
          <Link href="/quotes/new">
            <Plus className="mr-2 h-4 w-4" />
            Yeni Teklif
          </Link>
        </Button>
        </div>
      </div>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-lg font-medium text-muted-foreground">
              Henüz teklif oluşturmadınız.
            </p>
            <p className="text-sm text-muted-foreground">
              &apos;Yeni Teklif&apos; butonuna tıklayarak başlayın.
            </p>
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
                        <td className="px-4 py-3 font-medium">{quote.title}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(quote.createdAt).toLocaleDateString('tr-TR')}
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
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              onClick={() => handleDelete(quote.id, quote.title)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Sil
                            </Button>
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
