import type { Metadata } from 'next';
import { HukukiSayfa } from '@/ozellik/hukuki/HukukiSayfa';
import { KULLANIM_KOSULLARI } from '@/ozellik/hukuki/metinler';

// ⚠ Metin BU DOSYADA DEĞİL: dört sayfa da `ozellik/hukuki/metinler.ts`
// tek kaynağını okur. İçeriği sayfaya gömmek, aynı metnin dört kopyasını
// üretir ve biri güncellenip diğerleri geride kalır.
export const metadata: Metadata = { title: 'Kullanım Koşulları — MetaPriceX' };

export default function Sayfa() {
  return <HukukiSayfa metin={KULLANIM_KOSULLARI} />;
}
