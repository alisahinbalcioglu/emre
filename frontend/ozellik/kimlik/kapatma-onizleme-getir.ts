/**
 * HESAP KAPATMA ÖN İZLEMESİ — ucu çağıran ince sarmal (veri imhası turu §8.1).
 *
 * `kapatma-metinleri.ts` bilerek SAF tutuldu (vitest node ortamında, ağ
 * olmadan sınanıyor). Ağ çağrısı bu ayrı dosyada durur —
 * `lib/silme-etkisi-getir.ts` ile AYNI desen ve aynı gerekçe.
 *
 * ⚠ HATA YUTULUR — ve bu bilinçli: ön izleme bir KOLAYLIK, kapatmanın ön
 * koşulu değil. Uç 500 dönüyor diye kullanıcı hesabını kapatamaz hâle
 * gelmemeli (KVKK). Yanıt alınamazsa `null` döner; `hesapKapatmaMetni` bunu
 * görünce sayı UYDURMAZ, duruma özel cümleyi yazmaz. Asıl koruma zaten
 * sunucuda: `POST /auth/hesabimi-kapat` kararı KİLİT İÇİNDE yeniden verir
 * (`hesap.servisi.ts:440-470`), yani ön izleme bayatlasa bile yanlış bir
 * kapatma OLMAZ.
 *
 * ⚠ UÇ: `auth.controller.ts` `@Get('hesabimi-kapat/onizleme')`. Yol iki
 * tarafta da ELLE yazılı olduğu için sözleşme kapısı
 * (`kapatma-metinleri.test.ts`) ikisinin aynı dizgeyi taşıdığını ölçer —
 * yol kayarsa 404 SESSİZCE düz metne düşerdi ve kimse fark etmezdi.
 */
import api from '@/ortak/lib/api';
import type { KapatmaOnizlemesi } from './kapatma-metinleri';

/** Yanıtın gerçekten ön izleme olduğunu doğrular (eski sürüm uç, proxy HTML'i). */
function onizlemeMi(d: unknown): d is KapatmaOnizlemesi {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  if (typeof o.firmaVar !== 'boolean' || typeof o.digerHesap !== 'number') return false;
  const k = o.karar as Record<string, unknown> | undefined;
  if (typeof k !== 'object' || k === null) return false;
  // ⚠ `izin` iki dalı da AYRI AYRI doğrulanır. `izin:true` dalında
  // `firmaKapaniyor` alanı yoksa `undefined` "falsy" sayılır ve son sahip
  // SESSİZCE "firmanız devam ediyor" metnini görürdü — firması kapanırken.
  if (k.izin === true) return typeof k.firmaKapaniyor === 'boolean';
  if (k.izin === false) return k.kod === 'SON_SAHIP';
  return false;
}

export async function kapatmaOnizlemesiGetir(): Promise<KapatmaOnizlemesi | null> {
  try {
    const { data } = await api.get<unknown>('/auth/hesabimi-kapat/onizleme');
    return onizlemeMi(data) ? data : null;
  } catch {
    return null;
  }
}
