'use client';

import { useState } from 'react';
import { MailX, UserMinus } from 'lucide-react';

/**
 * İZİN PANELİNİN KIRMIZI BÖLÜMÜ — "Ekipten çıkar" / "Daveti iptal et"
 * (23.09.2026 ikinci tasarım · ekran 3). İkisi de önce "Emin misin?" sorar.
 *
 * ⚠ ESKİ AKIŞ (FAZ 7 F1b §3.8, `CikarmaDiyalogu.tsx`): sahip üyenin
 * e-postasını ELLE yazıyordu. Tasarım bunu panel bağlamı (başlıkta hedefin
 * adresi) + "Emin misin?" ile değiştirdi. Sunucu kapısı AYNEN duruyor:
 * `DELETE /firma/uyeler/:id` hâlâ `epostaOnayi` ister ve uyuşmazsa
 * `ONAY_UYUSMADI` döner — sayfa onayı panelin HEDEFİNİN adresiyle gönderir,
 * yani istek yalnız ekranda gösterilen kişiyi çıkarabilir.
 */
export function CikarmaBolumu({
  tur,
  islemde,
  onOnayla,
}: {
  tur: 'uye' | 'davet';
  islemde: boolean;
  onOnayla: () => void;
}) {
  const [soruluyor, setSoruluyor] = useState(false);
  const metin =
    tur === 'uye'
      ? {
          baslik: 'Ekipten çıkar',
          aciklama: 'Erişimi hemen kapanır. E-posta adresi ve kullanıcı hakkı boşa çıkar.',
          dugme: 'Ekipten çıkar',
          onay: 'Evet, çıkar',
          Simge: UserMinus,
        }
      : {
          baslik: 'Daveti iptal et',
          aciklama: 'Davet bağlantısı hemen geçersiz olur, kullanıcı hakkı boşa çıkar.',
          dugme: 'Daveti iptal et',
          onay: 'Evet, iptal et',
          Simge: MailX,
        };
  const { Simge } = metin;

  return (
    <div className="rounded-[10px] border border-red-100 p-4">
      <div className="text-sm font-semibold text-red-700">{metin.baslik}</div>
      <div className="mt-1 text-xs leading-normal text-gray-500">{metin.aciklama}</div>
      {soruluyor ? (
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Onay">
          <span className="mr-1 text-[13px] font-semibold text-gray-900">Emin misin?</span>
          <button
            type="button"
            disabled={islemde}
            onClick={onOnayla}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {metin.onay}
          </button>
          <button
            type="button"
            disabled={islemde}
            onClick={() => setSoruluyor(false)}
            className="inline-flex h-9 items-center rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Vazgeç
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={islemde}
          onClick={() => setSoruluyor(true)}
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 bg-white px-3.5 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          <Simge className="h-4 w-4" aria-hidden="true" />
          {metin.dugme}
        </button>
      )}
    </div>
  );
}
