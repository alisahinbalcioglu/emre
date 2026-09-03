'use client';

import { useEffect, useRef } from 'react';
import { iyzicoFormunuBas } from './iyzico-form';

/**
 * iyzico'nun barindirilan kart formunu CALISIR halde basar.
 *
 * ⚠ NEDEN AYRI BILESEN, NEDEN `dangerouslySetInnerHTML` DEGIL
 * 02.09 canli turunda "Odeme" ekrani BOMBOS geldi. Sayfa formu
 * `dangerouslySetInnerHTML` ile basiyordu ve yanindaki yorum "kendi
 * script'ini calistirir" diyordu — yorum YANLISTI. HTML spesifikasyonu
 * geregi `innerHTML` ile eklenen `<script>` yurutulmez. iyzico'nun icerigi
 * ise neredeyse tamamen bir betik; formu o cizer. Sonuc: DOM'a metin girdi,
 * hicbir sey calismadi ve kullaniciya bos bir sayfa gorundu.
 *
 * Isin olculebilir kismi `iyzico-form.ts` icinde SAF fonksiyonlarda
 * (projede jsdom yok, vitest ortami `node`). Burasi yalnizca kabi tutar.
 */
export function IyzicoFormu({ html }: { html: string }) {
  const kap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = kap.current;
    if (!el || !html) return;
    iyzicoFormunuBas(el, html);
    // Ayrilirken kabi bosalt: iyzico betigi kendi dinleyicilerini kurar,
    // ikinci kez basilirsa mukerrer form olusabilir.
    return () => {
      el.innerHTML = '';
    };
  }, [html]);

  return <div ref={kap} />;
}
