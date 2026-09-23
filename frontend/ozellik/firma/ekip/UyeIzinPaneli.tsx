'use client';

import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { izinlerAyniMi, type UyeIzni } from './izin-metinleri';
import { basHarfler, uyeSatirMetni } from './kisi-metinleri';
import type { PanelHedefi } from './ekip-tipleri';
import { IzinSecici } from './IzinSecici';
import { CikarmaBolumu } from './CikarmaBolumu';
import { Avatar, DurumRozeti, YoneticiRozeti, uyeDurumu } from './ekip-parcalari';

const tarih = (iso: string) => new Date(iso).toLocaleDateString('tr-TR');

/** Panel başlığındaki kişi bilgisi — aktif üye ile bekleyen davet ayrı alanlardan. */
function kisiBilgisi(hedef: PanelHedefi, yonetici: boolean) {
  if (hedef.tur === 'davet') {
    return {
      baslik: hedef.davet.eposta,
      alt: null,
      harf: basHarfler({ eposta: hedef.davet.eposta }),
      durum: 'davet' as const,
      tarihMetni: `Son geçerlilik: ${tarih(hedef.davet.sonGecerlilik)}`,
      mfa: undefined,
    };
  }
  const metin = uyeSatirMetni(hedef.uye);
  return {
    baslik: metin.baslik,
    alt: metin.altSatir,
    harf: basHarfler(hedef.uye, yonetici ? 1 : 2),
    durum: uyeDurumu(hedef.uye),
    tarihMetni: `Katılım: ${tarih(hedef.uye.katildi)}`,
    mfa: hedef.uye.mfaAcik,
  };
}

/**
 * "Üye izinleri" paneli — sağdan açılır (~480 px; 23.09.2026 ikinci tasarım
 * · ekran 3). Aktif üyede ve bekleyen davette aynı dört anahtar.
 *
 * ⚠ BEKLEYEN DAVETİN İZNİ: sunucuda ayrı bir "davet izni değiştir" ucu YOK
 *   (bu tur API'ye dokunulmadı). Tek yol `POST /firma/davetler { eposta,
 *   izinler }`: sunucu bunu YENİDEN GÖNDERİM sayar — yeni bağlantı gider,
 *   ESKİ BAĞLANTI GEÇERSİZ olur, gönderim sayısı artar (sınır 5). Panel bunu
 *   kaydetmeden ÖNCE söyler; sessizce yapmak davet edilenin elindeki
 *   bağlantıyı habersiz bozardı.
 * ⚠ YÖNETİCİ satırı: izinleri değiştirilemez (sunucu `SAHIP_TAM_YETKILI`);
 *   anahtar çizilmez. Yalnız çoklu yönetici için rol ve çıkarma.
 * ⚠ ROL DEĞİŞTİRME tasarımda yok ama özellik (FAZ 7 F1b) KAYBOLMASIN diye
 *   burada, ONAYLI (sayfadaki `confirm`) duruyor.
 */
export function UyeIzinPaneli({
  hedef,
  islemde,
  onKaydet,
  onCikar,
  onRolDegistir,
  onKapat,
}: {
  hedef: PanelHedefi;
  islemde: boolean;
  onKaydet: (izinler: UyeIzni[]) => Promise<boolean>;
  onCikar: () => void;
  onRolDegistir: () => void;
  onKapat: () => void;
}) {
  const baslangic: UyeIzni[] =
    hedef.tur === 'uye' ? [...(hedef.uye.izinler ?? [])] : [...(hedef.davet.izinler ?? [])];
  const [secili, setSecili] = useState<UyeIzni[]>(baslangic);
  const yonetici = hedef.tur === 'uye' && hedef.uye.firmaRol === 'sahip';
  const degisti = !izinlerAyniMi(secili, baslangic);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !islemde) onKapat();
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [islemde, onKapat]);

  async function kaydet() {
    if (!degisti || islemde) return;
    const tamam = await onKaydet(secili);
    if (tamam) onKapat();
  }

  const kisi = kisiBilgisi(hedef, yonetici);

  return (
    // ⚠ z-[60], z-50 DEĞİL (önizlemede ÖLÇÜLDÜ): çerez şeridi `fixed bottom-0
    //   z-50` ve DOM'da sonra geliyor — eşit katmanda panelin "Kaydet"
    //   düğmesini örtüyordu. Onay kutusu ve bildirimler z-100'de, üstte kalır.
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-[rgba(15,23,42,0.35)] animate-in fade-in-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !islemde) onKapat();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="izin-baslik"
        className="flex h-full w-full max-w-[480px] flex-col bg-white shadow-[-16px_0_48px_rgba(15,23,42,0.18)] animate-in slide-in-from-right duration-200"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#eef0f3] pl-6 pr-5">
          <h2 id="izin-baslik" className="text-[17px] font-semibold text-gray-900">
            Üye izinleri
          </h2>
          <button
            type="button"
            aria-label="Kapat"
            autoFocus
            onClick={onKapat}
            disabled={islemde}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-auto p-6">
          <div className="flex items-center gap-3.5">
            <Avatar metin={kisi.harf} yonetici={yonetici} buyuk />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-gray-900">{kisi.baslik}</div>
              {kisi.alt && <div className="truncate text-[13px] text-gray-500">{kisi.alt}</div>}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {yonetici ? <YoneticiRozeti /> : <DurumRozeti durum={kisi.durum} />}
                <span className="text-xs text-gray-500">{kisi.tarihMetni}</span>
                {/* FAZ 7 F2b: sahip, zorunlu kılmadan önce kimin korumalı
                    olduğunu görebilmeli (eski tablodaki bilgi buraya taşındı). */}
                {kisi.mfa !== undefined && (
                  <span className="text-xs text-gray-500">
                    · İki adımlı giriş {kisi.mfa ? 'açık' : 'kapalı'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-semibold text-gray-900">Erişim</div>
            {yonetici ? (
              <p className="rounded-[10px] border border-[#e5e7eb] px-3.5 py-3 text-[13px] text-gray-600">
                Yönetici tüm bölümlere erişir; izinleri kapatılamaz.
              </p>
            ) : (
              <>
                <IzinSecici secili={secili} onDegis={setSecili} pasif={islemde} />
                <div className="mt-2.5 flex items-start gap-2 text-xs text-gray-500">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {hedef.tur === 'uye' ? (
                    <span>Kaydettiğin anda geçerli olur.</span>
                  ) : (
                    <span>
                      Kaydedince davet e-postası yeni izinlerle yeniden gider; önceki davet
                      bağlantısı geçersiz olur.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {hedef.tur === 'uye' && (
            <div className="rounded-[10px] border border-[#e5e7eb] p-4">
              <div className="text-sm font-semibold text-gray-900">
                {yonetici ? 'Üye yap' : 'Yönetici yap'}
              </div>
              <div className="mt-1 text-xs leading-normal text-gray-500">
                {yonetici
                  ? 'Erişimi kayıtlı izinlerine göre daralır; ekibi ve aboneliği yönetemez.'
                  : 'Tüm bölümlere erişir; ekibi, aboneliği ve izinleri yönetebilir.'}
              </div>
              <button
                type="button"
                onClick={onRolDegistir}
                disabled={islemde}
                className="mt-3 inline-flex h-9 items-center rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {yonetici ? 'Üye yap' : 'Yönetici yap'}
              </button>
            </div>
          )}

          <CikarmaBolumu tur={hedef.tur} islemde={islemde} onOnayla={onCikar} />
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[#eef0f3] px-6 py-4">
          <button
            type="button"
            onClick={onKapat}
            disabled={islemde}
            className="inline-flex h-10 items-center rounded-lg border border-[#e5e7eb] bg-white px-4 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {yonetici ? 'Kapat' : 'Vazgeç'}
          </button>
          {!yonetici && (
            <button
              type="button"
              onClick={() => void kaydet()}
              disabled={islemde || !degisti}
              className="inline-flex h-10 items-center rounded-lg bg-[#0f172a] px-[18px] text-sm font-semibold text-white transition-colors hover:bg-[#1e293b] disabled:opacity-50"
            >
              Kaydet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
