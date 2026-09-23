'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { vitrinBolumBasligi, vitrinBolumu } from './vitrin-metinleri';

/**
 * 23.09.2026 — VİTRİN BÖLÜM KARTI (kabukta, `ErisimKapisi` çizer).
 *
 * Paketsiz yeni hesap gezilemeyen bir bölüme girerse (Kütüphanem alt
 * sayfaları, İşçilik, Teklif formatları, yeni teklif…) sayfa içeriği yerine
 * bu kart çizilir. DUVAR DEĞİL: bölümün ne işe yaradığını söyler, üstteki
 * şerit durur, menü açık kalır ("yalnızca gezsin" kararı).
 *
 * ⚠ Sayfa HİÇ mount olmaz → yüklenirken yetenekli uca gidecek istekler yola
 *   çıkmaz, kırmızı 403 bildirimi doğmaz (`UyeIzniKapisi` ile aynı desen).
 * ⚠ ÇIKMAZ SOKAK YASAK: her zaman `/abonelik`e ve Ana Sayfa'ya yol verir.
 * ⚠ Deneme satırı ("30 gün ücretsiz…") BURADA YOK: üstteki şerit vitrinde
 *   her sayfada o satırı zaten taşır; kart tekrar ederse aynı cümle iki kez.
 */
export function VitrinBolumKarti({ yol }: { yol: string }) {
  const bolum = vitrinBolumu(yol);

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center px-4 py-14 text-center">
      <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <Lock className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-gray-900">
        {vitrinBolumBasligi(yol)}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{bolum.aciklama}</p>
      <Link
        href="/abonelik"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Paketleri gör
      </Link>
      <Link href="/dashboard" className="mt-4 text-[13px] font-medium text-[#1d4ed8] hover:underline">
        Ana Sayfa’ya dön
      </Link>
    </div>
  );
}
