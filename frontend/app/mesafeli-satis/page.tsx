import type { Metadata } from 'next';
import { HukukiSayfa } from '@/ozellik/hukuki/HukukiSayfa';
import { MESAFELI_SATIS } from '@/ozellik/hukuki/metinler';

// ⚠ Metin BU DOSYADA DEĞİL: dört sayfa da `ozellik/hukuki/metinler.ts`
// tek kaynağını okur. İçeriği sayfaya gömmek, aynı metnin dört kopyasını
// üretir ve biri güncellenip diğerleri geride kalır.
export const metadata: Metadata = { title: 'Mesafeli Satış Sözleşmesi Ön Bilgilendirme — MetaPriceX' };

export default function Sayfa() {
  return <HukukiSayfa metin={MESAFELI_SATIS} />;
}
