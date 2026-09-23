'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Send, X } from 'lucide-react';
import { VARSAYILAN_DAVET_IZINLERI, type UyeIzni } from './izin-metinleri';
import { DAVET_EPOSTA_HATA_METNI, davetEpostaHatasi } from './davet-kurallari';
import type { Davet, Uye } from './ekip-tipleri';
import { IzinSecici } from './IzinSecici';

/**
 * "Ekibe üye davet et" penceresi (23.09.2026 ikinci tasarım · ekran 2).
 *
 * ⚠ İzinler GÖNDERİLİR (`onGonder(eposta, izinler)` → `POST /firma/davetler
 * { eposta, izinler }`); açılış seçimi tasarımdaki gibi Excel + DWG.
 * ⚠ E-posta denetimi KOLAYLIK (`davet-kurallari.ts`): biçim ve "zaten
 * ekipte". Son söz sunucuda (`@IsEmail`, `ZATEN_EKIPTE`, koltuk kapısı).
 * ⚠ Pencere başarıda KAPANIR; hata olursa açık kalır (sayfa bildirim basar),
 * yazılan adres ve seçim kaybolmaz.
 */
export function DavetPenceresi({
  ekip,
  hakMetni,
  islemde,
  onGonder,
  onKapat,
}: {
  ekip: { uyeler: Uye[]; bekleyenDavetler: Davet[] };
  /** Alt şeritteki "Kullanıcı hakkı: 4 / 5" — sayfanın kartıyla AYNI kaynaktan. */
  hakMetni: string;
  islemde: boolean;
  onGonder: (eposta: string, izinler: UyeIzni[]) => Promise<boolean>;
  onKapat: () => void;
}) {
  const [eposta, setEposta] = useState('');
  const [izinler, setIzinler] = useState<UyeIzni[]>([...VARSAYILAN_DAVET_IZINLERI]);
  const [denetle, setDenetle] = useState(false);

  // Esc kapatır (işlem sürerken değil — yarım kalan istek görünmez olmasın).
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !islemde) onKapat();
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [islemde, onKapat]);

  const hata = davetEpostaHatasi(eposta, ekip);
  const hataGoster = denetle && hata !== null;

  async function gonder(e: FormEvent) {
    e.preventDefault();
    setDenetle(true);
    if (hata !== null || islemde) return;
    const tamam = await onGonder(eposta.trim(), izinler);
    if (tamam) onKapat();
  }

  return (
    // ⚠ z-[60]: çerez şeridi (`z-50`, DOM'da sonra) eşit katmanda pencerenin
    //   alt şeridini örtebiliyor — izin paneliyle aynı ölçüm.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4 animate-in fade-in-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !islemde) onKapat();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="davet-baslik"
        className="w-full max-w-[540px] overflow-hidden rounded-[14px] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.28)] animate-in zoom-in-95"
      >
        <form onSubmit={gonder} noValidate>
          <div className="flex items-start justify-between gap-4 px-6 pt-[22px]">
            <div>
              <h2 id="davet-baslik" className="text-lg font-semibold text-gray-900">
                Ekibe üye davet et
              </h2>
              <p className="mt-1.5 text-[13px] leading-normal text-gray-500">
                Davet bağlantısı bu adrese e-postayla gider. Üye parolasını kendisi belirler.
              </p>
            </div>
            <button
              type="button"
              aria-label="Kapat"
              onClick={onKapat}
              disabled={islemde}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-5 px-6 pb-6 pt-5">
            <div>
              <label htmlFor="davet-eposta" className="mb-1.5 block text-[13px] font-semibold text-gray-900">
                E-posta adresi
              </label>
              <input
                id="davet-eposta"
                type="email"
                autoFocus
                autoComplete="off"
                value={eposta}
                onChange={(e) => setEposta(e.target.value)}
                onBlur={() => eposta.trim() !== '' && setDenetle(true)}
                placeholder="ornek@firmaniz.com"
                aria-invalid={hataGoster}
                aria-describedby={hataGoster ? 'davet-eposta-hata' : undefined}
                className={`h-10 w-full rounded-lg border bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                  hataGoster
                    ? 'border-red-300 focus:ring-red-200'
                    : 'border-gray-300 focus:border-[#2563eb] focus:ring-blue-100'
                }`}
              />
              {hataGoster && hata && (
                <p id="davet-eposta-hata" role="alert" className="mt-1.5 text-xs text-red-600">
                  {DAVET_EPOSTA_HATA_METNI[hata]}
                </p>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold text-gray-900">Neleri görebilsin?</span>
                <span className="text-xs text-gray-500">Sonradan değiştirebilirsin</span>
              </div>
              <IzinSecici secili={izinler} onDegis={setIzinler} pasif={islemde} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f3] bg-[#fafafa] px-6 py-4">
            <span className="text-xs text-gray-500">Kullanıcı hakkı: {hakMetni}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onKapat}
                disabled={islemde}
                className="inline-flex h-10 items-center rounded-lg border border-[#e5e7eb] bg-white px-4 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={islemde}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0f172a] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1e293b] disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Davet gönder
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
