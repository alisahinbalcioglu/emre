'use client';

import { IZIN_TANIMLARI, izinDegistir, type UyeIzni } from './izin-metinleri';
import { IZIN_SIMGELERI } from './izin-simgeleri';
import { Anahtar, FiyatBilgisiRozeti } from './ekip-parcalari';

/**
 * Dört izin ANAHTARI (23.09.2026 ikinci tasarım) — davet penceresi ve üye
 * izinleri paneli AYNI bileşeni kullanır: simge kutusu · başlık (+ "Fiyat
 * bilgisi") · açıklama · açma/kapama anahtarı.
 *
 * ⚠ Kontrollü bileşen: seçim üst bileşende durur, burada DEĞİŞTİRİLMEZ;
 * `izinDegistir` her tıklamada YENİ dizi üretir (kanonik sırada).
 */
export function IzinSecici({
  secili,
  onDegis,
  pasif = false,
}: {
  secili: readonly UyeIzni[];
  onDegis: (yeni: UyeIzni[]) => void;
  pasif?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-[#e5e7eb]">
      {IZIN_TANIMLARI.map((t, i) => {
        const Simge = IZIN_SIMGELERI[t.anahtar];
        const acik = secili.includes(t.anahtar);
        return (
          <div
            key={t.anahtar}
            className={`flex items-center gap-3 px-3.5 py-1.5 ${
              i < IZIN_TANIMLARI.length - 1 ? 'border-b border-[#eef0f3]' : ''
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Simge className="h-[18px] w-[18px]" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold text-gray-900">{t.baslik}</span>
                {t.fiyatBilgisi && <FiyatBilgisiRozeti />}
              </div>
              <div className="mt-0.5 text-xs text-gray-500">{t.aciklama}</div>
            </div>
            <Anahtar
              acik={acik}
              etiket={t.baslik}
              pasif={pasif}
              onDegis={(yeni) => onDegis(izinDegistir(secili, t.anahtar, yeni))}
            />
          </div>
        );
      })}
    </div>
  );
}
