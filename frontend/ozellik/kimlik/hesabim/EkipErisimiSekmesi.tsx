'use client';

/**
 * HESABIM › EKİP ERİŞİMİM — alt kullanıcının salt okunur görünümü (23.09.2026).
 *
 * Alt kullanıcı firmayı, aboneliği ve faturayı görmez (`hesabim.ts`); onun
 * yerine kime başvuracağını görür: firma yöneticisinin e-postası ve "E-posta
 * gönder" bağlantısı. Altında dört bölüm izni: hangisi açık, hangisi kapalı.
 *
 * ⚠ YÖNETİCİ E-POSTASI `/firma/uyeler`DEN okunur: `/auth/me`deki
 * `firma.yetkiliEposta` üyeye GİZLİDİR (`firma-maskele.ts`
 * `UYEDEN_GIZLI_ALANLAR`) ve zaten giriş e-postası olmayabilir. Üye listesi
 * üyeye salt okunur açık bir uçtur (Ekip sayfası da onu okur). Kimin yönetici
 * olduğu `firmaYoneticileri`nden: kapalı bölüm sayfasındaki "Firma yöneticin"
 * adresiyle AYNI kural.
 *
 * ⚠ İZİNLER İÇİN AYRI İSTEK YOK: sağlayıcı onları aynı `/auth/me` yanıtından
 * okuyor. Karar TEK çağrıda (`izinSatirlari`: metin ve sıra Ekip & İzinler
 * sözlüğünden); satırları `IzinDurumListesi` çizer, bu dosyada ikinci bir
 * etiket sözlüğü YOK. `izinler === null` (eski sunucu, düşen istek) → satır
 * ÇİZİLMEZ, giriş cümlesi eski hâlinde kalır: bilinmeyen durum "Açık" ya da
 * "Kapalı" diye beyan edilmez.
 */
import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import api from '@/ortak/lib/api';
import { useCapabilities } from '@/ortak/contexts/CapabilitiesContext';
import { izinSatirlari } from '@/ozellik/firma/ekip/izin-metinleri';
import { firmaYoneticileri } from '@/ozellik/firma/ekip/kisi-metinleri';
import { basHarfler } from './hesabim';
import { IKINCIL_DUGME } from './hesabim-ui';
import { IzinDurumListesi } from './IzinDurumListesi';

type UyeSatiri = { id: string; eposta: string; ad: string | null; soyad: string | null; firmaRol: string };

type YoneticiDurumu =
  | { durum: 'yukleniyor' }
  | { durum: 'hata' }
  | { durum: 'hazir'; yoneticiler: UyeSatiri[] };

export function EkipErisimiSekmesi() {
  const [yonetici, setYonetici] = useState<YoneticiDurumu>({ durum: 'yukleniyor' });
  const { izinler } = useCapabilities();
  const satirlar = izinSatirlari(izinler);

  useEffect(() => {
    let iptal = false;
    api
      .get<{ uyeler?: UyeSatiri[] }>('/firma/uyeler')
      .then(({ data }) => {
        if (iptal) return;
        // Rol sunucudan gelir; ekranda yeniden hesaplanmaz.
        setYonetici({ durum: 'hazir', yoneticiler: firmaYoneticileri(data?.uyeler) });
      })
      .catch(() => {
        if (!iptal) setYonetici({ durum: 'hata' });
      });
    return () => {
      iptal = true;
    };
  }, []);

  return (
    <section aria-labelledby="erisim-baslik" className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 id="erisim-baslik" className="text-base font-semibold text-gray-900">Ekip erişiminiz</h2>
      <p id="erisim-aciklama" className="mt-1 text-[13px] leading-normal text-gray-500">
        {satirlar
          ? 'Hangi bölümleri görebileceğinizi firma yöneticiniz belirler.'
          : 'Firma bilgilerini, aboneliği ve faturayı firma yöneticiniz yönetir.'}
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {yonetici.durum === 'yukleniyor' && (
          <p className="text-[13px] text-gray-500">Yükleniyor…</p>
        )}
        {(yonetici.durum === 'hata' || (yonetici.durum === 'hazir' && yonetici.yoneticiler.length === 0)) && (
          <p className="rounded-[10px] border border-[#eef0f3] bg-neutral-50 px-4 py-3.5 text-[13px] text-gray-500">
            Firma yöneticinizin bilgisi şu an okunamadı.
          </p>
        )}
        {yonetici.durum === 'hazir' &&
          yonetici.yoneticiler.map((y) => (
            <div
              key={y.id}
              className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#eef0f3] bg-neutral-50 px-4 py-3.5"
            >
              <div
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white"
              >
                {basHarfler({ email: y.eposta, ad: y.ad, soyad: y.soyad })}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">Firma yöneticiniz</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-gray-900">{y.eposta}</p>
              </div>
              <a href={`mailto:${y.eposta}`} className={IKINCIL_DUGME}>
                <Mail className="h-3.5 w-3.5" aria-hidden />
                E-posta gönder
              </a>
            </div>
          ))}
      </div>

      <IzinDurumListesi satirlar={satirlar} etiketId="erisim-aciklama" />
    </section>
  );
}
