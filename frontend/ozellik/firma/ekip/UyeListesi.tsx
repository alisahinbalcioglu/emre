'use client';

import type { ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import type { Davet, PanelHedefi, Uye } from './ekip-tipleri';
import { IZIN_TANIMLARI, type UyeIzni } from './izin-metinleri';
import { basHarfler, uyeSatirMetni } from './kisi-metinleri';
import {
  Avatar,
  DurumRozeti,
  IzinEtiketi,
  SenRozeti,
  YoneticiRozeti,
  uyeDurumu,
} from './ekip-parcalari';

/**
 * 23.09.2026 — "Üyeler" kartı (Ekip & İzinler, ikinci tasarım · ekran 1).
 *
 * Satır türleri: yönetici (sahip) · üye · bekleyen davet. Eski izin sütunlu
 * tablo (`EkipTablosu.tsx`) bu dosyaya dönüştü: izinler artık satırın altında
 * dört ETİKET (açık = yeşil tik, kapalı = gri kilit), düzenleme sağdan açılan
 * panelde (`UyeIzinPaneli.tsx`).
 *
 * ⚠ KARARLAR SUNUCUDAN: etiketler sunucunun ETKİN listesinden çizilir
 *   (sahip → dördü; burada "sahipse hepsi açık" diye YENİDEN hesaplanmaz);
 *   `durduruldu` da sunucunun hesapladığı değer (FAZ 7 F1b §3.12).
 * ⚠ `izinler === null` → bu satırın izinleri SANA gösterilmiyor (üye yalnız
 *   kendi satırını ve yöneticiyi görür) → etiket ÇİZİLMEZ. Boş dizi "hiç
 *   izni yok" demektir: dört gri kilit. İkisi aynı çizilmez.
 * ⚠ Düğmeler `sahipMi` ile — değer sayfadan gelir, burada yeniden hesaplanmaz.
 */
export function UyeListesi({
  uyeler,
  bekleyenDavetler,
  sahipMi,
  benimId,
  islemde,
  onDuzenle,
  onYenidenGonder,
}: {
  uyeler: Uye[];
  bekleyenDavetler: Davet[];
  sahipMi: boolean;
  benimId: string | null;
  islemde: boolean;
  onDuzenle: (hedef: PanelHedefi) => void;
  onYenidenGonder: (d: Davet) => void;
}) {
  const kisiSayisi = uyeler.length + bekleyenDavetler.length;
  return (
    <section
      aria-labelledby="uyeler-baslik"
      className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white"
    >
      <div className="flex items-center justify-between border-b border-[#eef0f3] px-5 py-4">
        <h2 id="uyeler-baslik" className="text-[15px] font-semibold text-gray-900">
          Üyeler
        </h2>
        <span className="text-xs text-gray-500">{kisiSayisi} kişi</span>
      </div>

      {uyeler.map((u) => {
        const kisi = uyeSatirMetni(u);
        const yonetici = u.firmaRol === 'sahip';
        const ben = u.id === benimId;
        const durum = uyeDurumu(u);
        return (
          <Satir
            key={u.id}
            avatar={<Avatar metin={basHarfler(u, yonetici ? 1 : 2)} yonetici={yonetici} />}
            ust={
              <>
                <span className="min-w-0 truncate text-sm font-semibold text-gray-900">{kisi.baslik}</span>
                {/* Alt satır YALNIZ ad varsa: aynı e-postayı ikinci kez yazmamak
                    için karar `uyeSatirMetni`nde (21.09 ölçülen kusur). */}
                {kisi.altSatir && (
                  <span className="min-w-0 truncate text-[13px] text-gray-500">{kisi.altSatir}</span>
                )}
                {ben && <SenRozeti />}
                {/* Yöneticide "Aktif" yazılmaz (tasarım); durdurulmuş/askıdaysa yazılır. */}
                {(!yonetici || durum !== 'aktif') && <DurumRozeti durum={durum} />}
              </>
            }
            alt={
              yonetici ? (
                <div className="mt-1 text-[13px] text-gray-500">
                  Tüm bölümlere erişir, ekibi ve aboneliği yönetir
                </div>
              ) : (
                <IzinEtiketleri izinler={u.izinler} />
              )
            }
            sag={
              yonetici ? (
                <>
                  {/* Başka bir yönetici (çoklu yönetici) için rol/çıkarma yolu
                      KAYBOLMASIN; kendi satırın DÜZENLENEMEZ (tasarım). */}
                  {sahipMi && !ben && (
                    <IkincilDugme onClick={() => onDuzenle({ tur: 'uye', uye: u })} disabled={islemde}>
                      Yönet
                    </IkincilDugme>
                  )}
                  <YoneticiRozeti />
                </>
              ) : sahipMi ? (
                <IkincilDugme onClick={() => onDuzenle({ tur: 'uye', uye: u })} disabled={islemde}>
                  İzinleri düzenle
                </IkincilDugme>
              ) : null
            }
          />
        );
      })}

      {/* Bekleyen davetler — yalnız sahibe gelir (sunucu üyeye boş liste döner). */}
      {bekleyenDavetler.map((d) => (
        <Satir
          key={`davet-${d.id}`}
          avatar={<Avatar metin={basHarfler({ eposta: d.eposta })} />}
          ust={
            <>
              <span className="min-w-0 truncate text-sm font-semibold text-gray-900">{d.eposta}</span>
              <DurumRozeti durum="davet" />
            </>
          }
          alt={<IzinEtiketleri izinler={d.izinler ?? null} />}
          sag={
            sahipMi ? (
              <>
                <button
                  type="button"
                  onClick={() => onYenidenGonder(d)}
                  disabled={islemde}
                  className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                >
                  <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Yeniden gönder
                </button>
                <IkincilDugme onClick={() => onDuzenle({ tur: 'davet', davet: d })} disabled={islemde}>
                  İzinleri düzenle
                </IkincilDugme>
              </>
            ) : null
          }
        />
      ))}
    </section>
  );
}

/**
 * Tek satır iskeleti. Dar ekranda (telefon) düğmeler içeriğin ALTINA iner;
 * yan yana sıkışsalar e-posta ve etiketler okunmaz hale gelirdi.
 */
function Satir({
  avatar,
  ust,
  alt,
  sag,
}: {
  avatar: ReactNode;
  ust: ReactNode;
  alt: ReactNode;
  sag: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 border-b border-[#eef0f3] px-5 py-4 last:border-b-0 sm:flex-nowrap">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">{ust}</div>
        {alt}
      </div>
      {sag && (
        <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">{sag}</div>
      )}
    </div>
  );
}

function IzinEtiketleri({ izinler }: { izinler: UyeIzni[] | null | undefined }) {
  if (izinler == null) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {IZIN_TANIMLARI.map((t) => (
        <IzinEtiketi key={t.anahtar} tanim={t} acik={izinler.includes(t.anahtar)} />
      ))}
    </div>
  );
}

function IkincilDugme({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center whitespace-nowrap rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
