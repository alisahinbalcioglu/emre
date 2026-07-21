// KULLANICI KARARI (21.07): Cikti Onizleme sayfasi KALDIRILDI — "Teklifi
// Dışa Aktar" DOGRUDAN Excel + PDF indirir. Tek beklenti: "duzgun inmesi".
// (Kapak/format/liste degisimi tamamen backend'de; rev/arsiv otomatik.)
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';

function blobIndir(data: Blob, headers: any, fallback: string) {
  const url = window.URL.createObjectURL(new Blob([data]));
  const a = document.createElement('a');
  a.href = url;
  let filename = fallback;
  const disposition = headers?.['content-disposition'];
  if (disposition) {
    const m = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (m?.[1]) filename = decodeURIComponent(m[1].replace(/['"]/g, ''));
  }
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

/** responseType:'blob' isteklerinde hata govdesi de Blob gelir — mesaji coz. */
async function hataMesaji(e: any): Promise<string> {
  try {
    const d = e?.response?.data;
    if (d instanceof Blob) {
      const j = JSON.parse(await d.text());
      return j?.message ?? 'Çıktı üretilemedi.';
    }
    return d?.message ?? 'Çıktı üretilemedi.';
  } catch {
    return 'Çıktı üretilemedi.';
  }
}

/** Teklifin Excel + PDF ciktisini uretip DOGRUDAN indirir (rev artar, arsivlenir). */
export async function teklifCiktisiniIndir(quoteId: string): Promise<boolean> {
  try {
    toast({ title: 'Çıktı hazırlanıyor…', description: 'Excel ve PDF üretiliyor (PDF birkaç saniye sürebilir).' });
    const x = await api.post(`/quotes/${quoteId}/export`, {}, { responseType: 'blob' });
    blobIndir(x.data, x.headers, 'teklif.xlsx');
    const p = await api.get(`/quotes/${quoteId}/export-pdf`, { responseType: 'blob' });
    blobIndir(p.data, p.headers, 'teklif.pdf');
    toast({ title: 'İndirildi', description: 'Excel + PDF bilgisayarınıza indi.' });
    return true;
  } catch (e: any) {
    toast({ title: 'Dışa aktarım hatası', description: await hataMesaji(e), variant: 'destructive' });
    return false;
  }
}
