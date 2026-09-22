'use client';

import Link from 'next/link';
import { Package, Wrench, FileText } from 'lucide-react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KUTUPHANEM — dagitim sayfasi (yalniz yonlendirme)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ 22.09.2026 — OLU CEKIM KALDIRILDI (olculdu). Bu dosya 635 satirdi ve
 *  mount'ta `/library`, `/materials`, `/brands` uclarina istek atiyordu;
 *  ama RENDER BLOGU o verilerin HICBIRINI kullanmiyordu. Malzeme tablosu
 *  bir ara marka detay sayfalarina tasinmis (22.07 karari: "yalniz Mekanik
 *  + Teklif Formatlari"), geriye tablo degil FETCH kalmis: state,
 *  diyaloglar, gruplama yardimcilari ve `fetchAll` olu koddu.
 *
 *  Iki somut zarari vardi:
 *   · PAKETLI musteride her ziyarette 3 bosuna istek.
 *   · PAKETSIZ hesapta o uclar 403 `ABONELIK_KISITLI` doner ve sayfanin
 *     genel `catch`i kirmizi "Veriler yuklenirken bir hata olustu"
 *     bildirimi basardi — ekranda ZATEN "Aboneliginiz bulunmuyor" seridi
 *     dururken. Kullanicinin bildirdigi goruntu buydu.
 *
 *  Bu sayfa veri GOSTERMEZ; uc karta yonlendirir. Veri cekmesi icin bir
 *  sebep yoktur ve yeniden eklenmemelidir.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function LibraryPage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kütüphanem</h1>
            <p className="mt-1 text-sm text-muted-foreground">Malzeme markaları ve işçilik kalemleri</p>
          </div>
        </div>
      </div>

      {/* Library Navigation — Elektrik Markalar / Ekipman&Sarf / Elektrik Iscilik
          KALDIRILDI (kullanici karari 22.07): yalniz Mekanik + Teklif Formatlari. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Link href="/library/mechanical-brands" className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-6 text-sm font-medium transition-all hover:border-primary hover:bg-primary/5 hover:shadow-md">
          <Package className="h-8 w-8 text-primary" />
          <span className="text-base font-semibold">Mekanik Markalar</span>
          <span className="text-xs text-muted-foreground">Malzeme fiyat listeleri</span>
        </Link>
        <Link href="/labor-firms?discipline=mechanical" className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-6 text-sm font-medium transition-all hover:border-blue-500 hover:bg-blue-50 hover:shadow-md">
          <Wrench className="h-8 w-8 text-blue-500" />
          <span className="text-base font-semibold">Mekanik İşçilik</span>
          <span className="text-xs text-muted-foreground">Firmalar, fiyat listeleri</span>
        </Link>
        <Link href="/quote-formats" className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-6 text-sm font-medium transition-all hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-md">
          <FileText className="h-8 w-8 text-emerald-600" />
          <span className="text-base font-semibold">Teklif Formatlarım</span>
          <span className="text-xs text-muted-foreground">Kapak + icmal şablonları</span>
        </Link>
      </div>
    </div>
  );
}
