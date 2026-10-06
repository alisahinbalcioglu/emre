'use client';

import { Info } from 'lucide-react';
import {
  EN_AZ_BIR_YETKI_METNI,
  IZIN_TANIMLARI,
  izinDegistir,
  izinSecimiGecerli,
  type UyeIzni,
} from './izin-metinleri';
import { IZIN_SIMGELERI } from './izin-simgeleri';
import { Anahtar, FiyatBilgisiRozeti } from './ekip-parcalari';

/**
 * Yetki ANAHTARLARI (23.09.2026 ikinci tasarım; 06.10'dan beri iki yetki) —
 * davet penceresi ve üye izinleri paneli AYNI bileşeni kullanır: simge
 * kutusu · başlık (+ "Fiyat bilgisi") · açıklama · açma/kapama anahtarı.
 *
 * ⚠ Kontrollü bileşen: seçim üst bileşende durur, burada DEĞİŞTİRİLMEZ;
 * `izinDegistir` her tıklamada YENİ dizi üretir (kanonik sırada).
 * ⚠ Hiç yetki seçili değilse altında "En az bir yetki seçin" yazar. Düğmeyi
 * pasif yapan üst bileşendir (AYNI `izinSecimiGecerli` ile); `ipucuId`
 * verilirse düğme `aria-describedby` ile bu satırı anar. `aria-live`: son
 * anahtar kapatıldığında ekran okuyucu ipucunu duyurur.
 */
export function IzinSecici({
  secili,
  onDegis,
  pasif = false,
  ipucuId,
}: {
  secili: readonly UyeIzni[];
  onDegis: (yeni: UyeIzni[]) => void;
  pasif?: boolean;
  ipucuId?: string;
}) {
  const bos = !izinSecimiGecerli(secili);
  return (
    <>
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
      {/* Canlı bölge HEP takılı (boşken yer kaplamaz): içerik sonradan
          gelince duyurulsun diye koşullu çizilmez. */}
      <p
        id={ipucuId}
        aria-live="polite"
        className={bos ? 'mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700' : undefined}
      >
        {bos && (
          <>
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {EN_AZ_BIR_YETKI_METNI}
          </>
        )}
      </p>
    </>
  );
}
