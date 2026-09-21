'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * KIRINTI ETİKET DEFTERİ — adres parçasının yerine gösterilecek insan metni.
 *
 * ── KUSUR (t.8, 21.09.2026, ölçüldü) ───────────────────────────────────────
 * Teklif detayının kırıntı yolu ham kimlik basıyordu:
 *   Ana Sayfa › Teklifler › 84597204-70f0-4c31-…
 * Sebep `Breadcrumb.tsx`te: etiket YALNIZ `usePathname()`den türetiliyor
 * (`LABEL_MAP[seg] ?? decodeURIComponent(seg)`), son parça bir UUID olduğu için
 * olduğu gibi yazılıyor. Kırıntı, kimliğin ne olduğunu bilmiyor — bilemez de:
 * UUID'nin adı ancak o kaydı ÇEKEN sayfada bilinir.
 *
 * ── NEDEN DEFTER, NEDEN CONTEXT DEĞİL ──────────────────────────────────────
 * Kırıntı korumalı düzenin başlığında (`app/(protected)/layout.tsx`), sayfa ise
 * `<main>` içinde çizilir; sayfadan kırıntıya giden bir React ağacı yolu YOK.
 * Bir Context, düzen dosyasını sarmalayıcıyla değiştirmeyi gerektirirdi (o
 * dosya bu turda başka bir işin kapsamında). Modül düzeyinde küçük bir defter
 * + `useSyncExternalStore` aynı işi DÜZEN DOSYASINA DOKUNMADAN yapar.
 *
 * ── SÖZLEŞME ────────────────────────────────────────────────────────────────
 *  · Yalnız GÖSTERİM. Adres çubuğundaki kimlik DEĞİŞMEZ, bağlantılar aynı.
 *  · Etiketi bilen sayfa yazar, sayfa kapanınca kendi kaydını siler
 *    (bayat etiket bir sonraki kaydın kırıntısında görünmesin).
 *  · Etiket yoksa kırıntı eski davranışına düşer (parçanın kendisi).
 */

/** Boş anlık görüntü — kimliği SABİT olmalı (useSyncExternalStore sonsuz döngü). */
const BOS: Readonly<Record<string, string>> = Object.freeze({});

let defter: Readonly<Record<string, string>> = BOS;
const dinleyiciler = new Set<() => void>();

function abone(f: () => void): () => void {
  dinleyiciler.add(f);
  return () => { dinleyiciler.delete(f); };
}

/** Anlık görüntü — DEĞİŞMEDİKÇE aynı nesne döner (React referans karşılaştırır). */
function anlik(): Readonly<Record<string, string>> {
  return defter;
}

function yaz(parca: string, etiket: string | null) {
  const mevcut = defter[parca];
  if (etiket === null) {
    if (mevcut === undefined) return;
    const y = { ...defter };
    delete y[parca];
    defter = Object.freeze(y);
  } else {
    if (mevcut === etiket) return;
    defter = Object.freeze({ ...defter, [parca]: etiket });
  }
  dinleyiciler.forEach((f) => f());
}

/** Kırıntının okuduğu defter. */
export function useKirintiEtiketleri(): Readonly<Record<string, string>> {
  return useSyncExternalStore(abone, anlik, () => BOS);
}

/**
 * Sayfa, adres parçasının insan metnini bildirir (ör. UUID → "MP-2026-001").
 * `etiket` boş/eksikse kayıt YAZILMAZ; sayfa kapanınca kayıt silinir.
 */
export function useKirintiEtiketi(parca: string | undefined, etiket: string | null | undefined): void {
  useEffect(() => {
    if (!parca) return;
    const metin = typeof etiket === 'string' ? etiket.trim() : '';
    if (!metin) return;
    yaz(parca, metin);
    return () => { yaz(parca, null); };
  }, [parca, etiket]);
}

/** Yalnız test içindir — defteri sıfırlar. */
export function kirintiDefteriniSifirla(): void {
  defter = BOS;
  dinleyiciler.forEach((f) => f());
}
