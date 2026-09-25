'use client';

/**
 * DWG Analiz sayfasinin yukleme / kapi ekranlari icin cerceve: "Geri" +
 * "DWG Analiz" basligi. Calisma alani ACILINCA bu cerceve cizilmez — 25.09
 * tasariminda baslik satiri calisma alaninin kendisidir (dosya adi, sayaclar,
 * Birim, Yeni DWG, Fiyatlandirmaya gec) ve cizim ekranin tamamini kullanir.
 */

import React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function DwgSayfaCercevesi({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-[1800px] px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/quotes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Geri
        </Link>
        <h1 className="text-2xl font-semibold">DWG Analiz</h1>
      </div>
      {children}
    </div>
  );
}
