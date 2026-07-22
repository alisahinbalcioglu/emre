'use client';

// Malzeme Havuzu — Elektrik havuz KALDIRILDI (kullanici karari 22.07): yalniz
// Mekanik kaldigi icin ara kart sayfasi atlanir, dogrudan mekanik havuz
// listesine yonlendirilir ("ana sayfadan girildiginde direkt listeler gelsin").

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function MaterialsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/materials/mechanical');
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
