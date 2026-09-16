import type { Metadata } from 'next';
import { HukukiSayfa } from '@/ozellik/hukuki/HukukiSayfa';
import { MESAFELI_SATIS, MESAFELI_SATIS_SOZLESMESI } from '@/ozellik/hukuki/metinler';

// ⚠ Metin BU DOSYADA DEĞİL: dört sayfa da `ozellik/hukuki/metinler.ts`
// tek kaynağını okur. İçeriği sayfaya gömmek, aynı metnin dört kopyasını
// üretir ve biri güncellenip diğerleri geride kalır.
export const metadata: Metadata = { title: 'Mesafeli Satış Sözleşmesi Ön Bilgilendirme — MetaPriceX' };

// Faz 6.4 (16.09): ön bilgilendirme formu ile sözleşme AYNI sayfada, alt
// alta. Satın alma onayındaki iki bağlantı da buraya gelir; sözleşme
// `#sozlesme` çıpasıyla açılır.
export default function Sayfa() {
  return <HukukiSayfa metin={MESAFELI_SATIS} ekMetin={MESAFELI_SATIS_SOZLESMESI} />;
}
