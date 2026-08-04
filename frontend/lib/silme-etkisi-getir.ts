/**
 * A-1 — SILME ETKISI UCUNU CAGIRAN INCE SARMAL
 *
 * `lib/silme-onay-metni.ts` bilerek SAF tutuldu (vitest node ortaminda, ag
 * olmadan sinaniyor). Ag cagrisi bu ayri dosyada durur.
 *
 * ⚠ HATA YUTULUR — ve bu bilincli: sayim ucu bir KOLAYLIK, silmenin on kosulu
 * degil. Uc 500 dondu diye admin listeyi silemez hale gelmemeli. Yanit
 * alinamazsa `null` doner; `silmeOnayMetni` bunu gorunce sayi UYDURMAZ,
 * "hesaplanamadı" yazar. Asil koruma zaten backend'de: ekonomi tasiyan
 * satirlarda onaysiz DELETE 409 ile durur.
 */
import api from '@/ortak/lib/api';
import type { SilmeEtkisi } from './silme-onay-metni';

export async function silmeEtkisiGetir(url: string): Promise<SilmeEtkisi | null> {
  try {
    const { data } = await api.get<SilmeEtkisi>(url);
    // Uc beklenmedik bir sey donduyse (eski surum backend, proxy HTML'i)
    // sayi gibi davranan bir nesneye guvenme — null'a dus.
    return typeof data?.ulSatiri === 'number' && typeof data?.etki === 'string' ? data : null;
  } catch {
    return null;
  }
}
