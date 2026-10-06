'use client';

/**
 * COKLU PARA BIRIMI F6c (karar K2) — teklifin para gorunumu anahtari.
 *
 * Yeni teklif ve detay sayfasinin ORTAK dugme grubu (ikiz ayrismasin):
 * dovizli karisik teklifte [Karisik | TL | USD | EUR] (varsayilan Karisik),
 * degilse bugunku [TL | USD | EUR]. Durum ve gecis saf kurallarda
 * (`tumu-gorunum.ts`: `anahtarDurumu`, `gorunumSecimi`); bu bilesen yalniz cizer.
 */
import { cn } from '@/ortak/lib/utils';
import { gorunumSecenekleri, anahtarDurumu, type GorunumSecenegi } from './tumu-gorunum';
import type { ParaBirimi } from './taraf-para-birimi';

const etiket = (s: GorunumSecenegi) => (s === 'karisik' ? 'Karışık' : s === 'TRY' ? 'TL' : s);

export function ParaGorunumAnahtari({ dovizli, karisikSecili, birim, kurVar, onSec }: {
  dovizli: boolean;
  karisikSecili: boolean;
  birim: ParaBirimi;
  kurVar: boolean;
  onSec: (s: GorunumSecenegi) => void;
}) {
  return (
    <div className="flex rounded-lg border bg-white p-0.5" role="group" aria-label="Para birimi görünümü">
      {gorunumSecenekleri(dovizli).map((s) => {
        const { secili, kapali } = anahtarDurumu(s, dovizli, karisikSecili, birim, kurVar);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onSec(s)}
            aria-pressed={secili}
            disabled={kapali}
            title={dovizli && s !== 'karisik'
              ? `Tümünü ${etiket(s)} olarak göster — fiyatlar salt okunur; kayıt ve Excel birim başına kalır`
              : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              secili
                ? 'bg-blue-600 text-white shadow-sm' /* v1 spec .mpx-para .sec: secili para birimi MAVI dolgulu */
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {etiket(s)}
          </button>
        );
      })}
    </div>
  );
}
