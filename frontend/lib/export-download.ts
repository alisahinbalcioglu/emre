// KULLANICI KARARI (24.07): PDF kaldirildi — cikti IKIYE ayrildi:
//   1. Fiyatlandirilmis Excel — musterinin yukledigi kesif dosyasi, fiyatlar
//      yazilmis (teklif formati YOK; "teklif formatinda gondermek
//      istemeyebilir").
//   2. Teklif Formati — kapak/icmal/format tabanli tam cikti (rev artar).
// Her tik TEK dosya indirir → Chrome coklu-indirme blogu tetiklenmez (KE12).
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
  document.body.appendChild(a);
  a.click();
  a.remove();
  // KE13: revoke'u geciktir — indirme baslamadan URL olmesin; her cagri
  // YENI blob URL uretir, ikinci tik boşa dusmez.
  setTimeout(() => window.URL.revokeObjectURL(url), 10_000);
}

/** KF6: backend self-check uyarisi (X-Export-Warning) — sessiz veri kaybi
 *  YASAK; dosya inse bile eksik deger varsa kullanici GORUR. */
/** PANO 21a: basarida GORUNUR self-check ozeti ("34 değer aktarıldı ✓ …") */
function ozetMetni(headers: any, varsayilan: string): string {
  const o = headers?.['x-export-summary'];
  if (!o) return varsayilan;
  try { return decodeURIComponent(String(o)); } catch { return varsayilan; }
}

function uyariGoster(headers: any) {
  const u = headers?.['x-export-warning'];
  if (!u) return;
  let mesaj = String(u);
  try { mesaj = decodeURIComponent(mesaj); } catch { /* ham haliyle goster */ }
  toast({ title: 'Dikkat — eksik değer', description: mesaj, variant: 'destructive' });
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

/** Teklif Formati ciktisini (.xlsx) uretip indirir (rev artar, arsivlenir). */
export async function teklifCiktisiniIndir(quoteId: string): Promise<boolean> {
  try {
    toast({ title: 'Çıktı hazırlanıyor…', description: 'Teklif formatında Excel üretiliyor.' });
    const x = await api.post(`/quotes/${quoteId}/export`, {}, { responseType: 'blob' });
    blobIndir(x.data, x.headers, 'teklif.xlsx');
    uyariGoster(x.headers);
    toast({ title: 'İndirildi', description: ozetMetni(x.headers, 'Teklif Excel dosyası bilgisayarınıza indi.') });
    return true;
  } catch (e: any) {
    // KE14: hata gorunur + buton tekrar denemeye hazir (caller finally ile acar)
    toast({ title: 'Dışa aktarım hatası', description: await hataMesaji(e), variant: 'destructive' });
    return false;
  }
}

/** Fiyatlandirilmis kesif Excel'ini indirir — musterinin orijinal dosyasi,
 *  fiyatlar yazilmis; teklif formati YOK, rev ARTMAZ. */
export async function fiyatliExceliIndir(quoteId: string): Promise<boolean> {
  try {
    toast({ title: 'Çıktı hazırlanıyor…', description: 'Fiyatlandırılmış keşif Excel\'i üretiliyor.' });
    const x = await api.get(`/quotes/${quoteId}/export-priced`, { responseType: 'blob' });
    blobIndir(x.data, x.headers, 'fiyatlandirilmis-kesif.xlsx');
    uyariGoster(x.headers);
    toast({ title: 'İndirildi', description: ozetMetni(x.headers, 'Fiyatlandırılmış keşif bilgisayarınıza indi.') });
    return true;
  } catch (e: any) {
    toast({ title: 'Dışa aktarım hatası', description: await hataMesaji(e), variant: 'destructive' });
    return false;
  }
}
