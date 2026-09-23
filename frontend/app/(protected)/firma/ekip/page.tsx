'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import api from '@/ortak/lib/api';
import { confirm } from '@/ortak/hooks/use-confirm';
import { toast } from '@/ortak/hooks/use-toast';
import { kimlikHataMetni } from '@/ortak/lib/kimlik-hata-metinleri';
import { koltukKarti, koltukSayaciMetni } from '@/ozellik/firma/ekip/koltuk-metinleri';
import { uyeSatirMetni } from '@/ozellik/firma/ekip/kisi-metinleri';
import type { UyeIzni } from '@/ozellik/firma/ekip/izin-metinleri';
import type { EkipYaniti, PanelHedefi, Uye } from '@/ozellik/firma/ekip/ekip-tipleri';
import { UyeListesi } from '@/ozellik/firma/ekip/UyeListesi';
import { DavetPenceresi } from '@/ozellik/firma/ekip/DavetPenceresi';
import { UyeIzinPaneli } from '@/ozellik/firma/ekip/UyeIzinPaneli';
import { Anahtar } from '@/ozellik/firma/ekip/ekip-parcalari';

/**
 * EKİP SAYFASI — FAZ 7 F1b (§6.5) · 23.09.2026 ikinci tasarım (ekran 1–3).
 *
 * Başlık "Ekip" + "Üye davet et" · "Kullanıcı hakkı" kartı · "Üyeler"
 * listesi (etiketli izinler) · davet PENCERESİ · sağdan açılan izin PANELİ.
 * Her işlemin sonucu sağ altta bildirim (toast) olarak çıkar; `alert()` yok.
 *
 * Tasarımda OLMAYAN ama KAYBOLMAMASI gereken üç şey korundu: firma geneli
 * iki adımlı giriş zorunluluğu ve kurumsal giriş bağlantısı ("Güvenlik ve
 * giriş" kartı), rol değiştirme (panelde, onaylı).
 *
 * ⚠ `sahipMi` FAIL-CLOSED: `firmaRol === 'sahip'`. `profile/page.tsx`teki
 * eski `(firmaRol ?? 'sahip') === 'sahip'` deseni KOPYALANMADI — alan
 * yanittan dustugunde herkesi sahip sayardi.
 *
 * ⚠ KOLTUK/YETENEK KARARI ON YUZDE YENIDEN HESAPLANMAZ: sunucu
 * `davet: { acik, nedenKodu }` doner; "Üye davet et" onunla PASİF olur ve
 * karttaki kırmızı metin sozlukten cikar. Ikiz karar, bu depoda olculmus bir
 * hata sinifidir (`erisim-durumu.ts`).
 *
 * ⚠ IZINLER SUNUCUDA UYGULANIR (`ErisimGuard` dorduncu eksen + teklif
 * kapsami). Bu ekran yalniz secimi gosterir ve gonderir.
 *
 * ⚠ Sayfa `ErisimGuard` arkasinda DEGIL: odemesi geciken firma listeyi gorur,
 * davet dugmesi sunucu nedeniyle kapalidir.
 */

/** FAZ 7 F2b: sahip anahtari icin gereken iki bilgi `/auth/me`den gelir. */
type GuvenlikDurumu = {
  mfaZorunlu: boolean;
  /** Sahibin KENDI MFA'si kapaliysa anahtar PASIF (sunucu da reddeder). */
  sahipMfaAcik: boolean;
};

export default function EkipSayfasi() {
  const [veri, setVeri] = useState<EkipYaniti | null>(null);
  const [guvenlik, setGuvenlik] = useState<GuvenlikDurumu | null>(null);
  const [firmaRol, setFirmaRol] = useState<string | null>(null);
  const [benimId, setBenimId] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [davetAcik, setDavetAcik] = useState(false);
  const [panel, setPanel] = useState<PanelHedefi | null>(null);
  const [islemde, setIslemde] = useState(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const [ekip, me] = await Promise.all([
        api.get('/firma/uyeler'),
        api.get('/auth/me'),
      ]);
      setVeri(ekip.data);
      setFirmaRol(me.data?.firmaRol ?? null);
      setBenimId(me.data?.id ?? null);
      // FAZ 7 F2b: anahtarin durumu ve sahibin kendi MFA'si AYNI yanittan.
      setGuvenlik({
        mfaZorunlu: me.data?.firma?.mfaZorunlu === true,
        sahipMfaAcik: me.data?.mfa?.acik === true,
      });
      setHata(null);
    } catch (e) {
      setHata(kimlikHataMetni(e, 'Ekip bilgisi alınamadı.'));
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const sahipMi = firmaRol === 'sahip';
  const davetiKapat = useCallback(() => setDavetAcik(false), []);
  const paneliKapat = useCallback(() => setPanel(null), []);

  /**
   * Tek yazma kalıbı: sonucu BİLDİRİMLE söyler, sonra listeyi tazeler.
   * Hata metni sunucunun `mesaj`ından (yoksa kod sözlüğünden) gelir.
   */
  async function calistir(fn: () => Promise<unknown>, basariMetni: string): Promise<boolean> {
    setIslemde(true);
    try {
      await fn();
      toast({ title: basariMetni });
      await yukle();
      return true;
    } catch (e) {
      toast({ variant: 'destructive', title: 'İşlem tamamlanamadı', description: kimlikHataMetni(e) });
      return false;
    } finally {
      setIslemde(false);
    }
  }

  /**
   * FAZ 7 F2b — firma geneli zorunluluk anahtari.
   *
   * ⚠ KARAR SUNUCUDA: sahibin kendi MFA'si kapaliysa `ONCE_KENDINIZ_ACIN`
   * doner. On yuzdeki `disabled` yalniz KOLAYLIK.
   */
  function guvenligiDegistir(yeni: boolean) {
    void calistir(
      () => api.patch('/firma/guvenlik', { mfaZorunlu: yeni }),
      yeni
        ? 'Firmanda iki adımlı giriş zorunlu kılındı.'
        : 'Firma geneli zorunluluk kaldırıldı.',
    );
  }

  function davetGonder(eposta: string, izinler: UyeIzni[]): Promise<boolean> {
    return calistir(
      () => api.post('/firma/davetler', { eposta, izinler }),
      `${eposta} adresine davet gönderildi.`,
    );
  }

  /**
   * Paneldeki "Kaydet". Aktif üye → izin ucu. Bekleyen davet → AYNI adrese
   * yeniden davet (sunucuda ayrı "davet izni" ucu yok; yeni bağlantı gider —
   * panel bunu kaydetmeden önce yazar).
   */
  function izinKaydet(hedef: PanelHedefi, izinler: UyeIzni[]): Promise<boolean> {
    if (hedef.tur === 'uye') {
      const u = hedef.uye;
      return calistir(
        () => api.patch(`/firma/uyeler/${u.id}/izinler`, { izinler }),
        `${uyeSatirMetni(u).baslik} için izinler kaydedildi.`,
      );
    }
    const d = hedef.davet;
    return calistir(
      () => api.post('/firma/davetler', { eposta: d.eposta, izinler }),
      `İzinler kaydedildi; davet ${d.eposta} adresine yeni izinlerle yeniden gönderildi.`,
    );
  }

  /**
   * Paneldeki "Ekipten çıkar" / "Daveti iptal et" ("Emin misin?" panelde).
   * ⚠ `epostaOnayi` PANELİN HEDEFİNDEN: sunucu hâlâ `ONAY_UYUSMADI` ile
   * sınar; istek yalnız ekranda gösterilen kişiyi çıkarabilir.
   */
  async function cikar(hedef: PanelHedefi) {
    const tamam =
      hedef.tur === 'uye'
        ? await calistir(
            () => api.delete(`/firma/uyeler/${hedef.uye.id}`, { data: { epostaOnayi: hedef.uye.eposta } }),
            `${uyeSatirMetni(hedef.uye).baslik} ekipten çıkarıldı.`,
          )
        : await calistir(
            () => api.delete(`/firma/davetler/${hedef.davet.id}`),
            `${hedef.davet.eposta} daveti iptal edildi.`,
          );
    if (tamam) setPanel(null);
  }

  /**
   * Rol değişimi ONAY ister: yönetici ekibi, aboneliği ve izinleri yönetir —
   * tek tıkla verilmemeli. Son yöneticiyi düşürmeyi sunucu reddeder
   * (`SON_SAHIP`); metin sözlükten gelir.
   */
  async function rolDegistir(u: Uye) {
    const yeniRol = u.firmaRol === 'sahip' ? 'uye' : 'sahip';
    const ad = uyeSatirMetni(u).baslik;
    const onay = await confirm(
      yeniRol === 'sahip'
        ? {
            title: 'Yönetici yap',
            description: `${ad} yönetici olacak: tüm bölümlere erişir; ekibi, aboneliği ve izinleri yönetebilir.`,
            confirmText: 'Yönetici yap',
          }
        : {
            title: 'Üye yap',
            description: `${ad} üye olacak; erişimi kayıtlı izinlerine göre daralır.`,
            confirmText: 'Üye yap',
          },
    );
    if (!onay) return;
    const tamam = await calistir(
      () => api.patch(`/firma/uyeler/${u.id}/rol`, { firmaRol: yeniRol }),
      yeniRol === 'sahip' ? `${ad} artık yönetici.` : `${ad} artık üye.`,
    );
    if (tamam) setPanel(null);
  }

  function davetYenidenGonder(eposta: string, id: string) {
    void calistir(
      () => api.post(`/firma/davetler/${id}/yeniden-gonder`),
      `Davet ${eposta} adresine yeniden gönderildi.`,
    );
  }

  if (yukleniyor && !veri) return <div className="p-6 text-sm text-gray-500">Yükleniyor…</div>;
  if (!veri) {
    return (
      <div className="p-6">
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {hata ?? 'Ekip bilgisi alınamadı.'}
        </p>
      </div>
    );
  }

  const kart = koltukKarti(veri.koltuk);
  const { uyari } = koltukSayaciMetni(veri.koltuk);
  const davetKapaliMetni = veri.davet.nedenKodu
    ? kimlikHataMetni({ response: { data: { kod: veri.davet.nedenKodu } } })
    : null;
  const mfasizlar = veri.uyeler.filter((u) => u.mfaAcik === false);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 text-gray-900">
      {/* ── Başlık ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Ekip</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            {sahipMi
              ? 'Alt kullanıcıları davet et, hangi bölümleri görebileceklerine sen karar ver.'
              : 'Erişimini firma yöneticin belirler.'}
          </p>
        </div>
        {sahipMi && (
          /* ⚠ Pasiflik SUNUCU kararından (`veri.davet.acik`): hak dolu,
             paket ekip içermiyor ya da abonelik kısıtlı. Nedeni kartta yazar. */
          <button
            type="button"
            onClick={() => setDavetAcik(true)}
            disabled={!veri.davet.acik || islemde}
            className="inline-flex h-10 items-center gap-2 self-start rounded-lg bg-[#0f172a] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1e293b] disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Üye davet et
          </button>
        )}
      </div>

      {/* ── Kullanıcı hakkı (yalnız yönetici) ──────────────────────────── */}
      {sahipMi && (
        <div className="flex flex-col gap-4 rounded-xl border border-[#e5e7eb] bg-white px-5 py-[18px] sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between text-[13px] font-semibold">
              <span>Kullanıcı hakkı</span>
              <span>{kart.deger}</span>
            </div>
            {kart.oran !== null && (
              <div
                className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={kart.oran}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Kullanıcı hakkı doluluğu"
              >
                <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${kart.oran}%` }} />
              </div>
            )}
            <div className="mt-2.5 text-xs text-gray-500">{kart.aciklama}</div>
            {/* ⚠ Metin SUNUCUNUN neden kodundan gelir; ön yüz karar vermez. */}
            {!veri.davet.acik && davetKapaliMetni && (
              <div className="mt-1.5 text-xs font-medium text-red-600">{davetKapaliMetni}</div>
            )}
            {uyari && <div className="mt-1.5 text-xs font-medium text-amber-700">{uyari}</div>}
          </div>
          <Link
            href="/abonelik"
            className="inline-flex h-9 shrink-0 items-center self-start rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-gray-900 transition-colors hover:bg-gray-50 sm:self-auto"
          >
            Paketleri gör
          </Link>
        </div>
      )}

      {/* ── Üyeler ─────────────────────────────────────────────────────── */}
      <UyeListesi
        uyeler={veri.uyeler}
        bekleyenDavetler={veri.bekleyenDavetler}
        sahipMi={sahipMi}
        benimId={benimId}
        islemde={islemde}
        onDuzenle={setPanel}
        onYenidenGonder={(d) => davetYenidenGonder(d.eposta, d.id)}
      />

      {/* ── Güvenlik ve giriş (yalnız yönetici) ────────────────────────── */}
      {sahipMi && guvenlik && (
        <section
          aria-labelledby="guvenlik-baslik"
          className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white"
        >
          <div className="border-b border-[#eef0f3] px-5 py-4">
            <h2 id="guvenlik-baslik" className="text-[15px] font-semibold">
              Güvenlik ve giriş
            </h2>
          </div>
          {/* FAZ 7 F2b · FIRMA GENELI IKI ADIMLI GIRIS */}
          <div className="flex items-start gap-4 border-b border-[#eef0f3] px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Ekipteki herkes iki adımlı giriş kullansın</div>
              <p className="mt-1 text-xs leading-normal text-gray-500">
                Açınca parolayla giren herkes bir sonraki girişinde iki adımlı girişi kurmak zorunda
                kalır ve açık oturumları kapanır. Şirket hesabıyla (kurumsal giriş) girenlere
                uygulanmaz.
              </p>
              {!guvenlik.sahipMfaAcik && (
                <p className="mt-1.5 text-xs font-medium text-amber-700">
                  Önce kendi hesabında iki adımlı girişi aç (Hesabım → İki adımlı giriş).
                </p>
              )}
              {mfasizlar.length > 0 && (
                <p className="mt-1.5 text-xs text-gray-500">
                  İki adımlı girişi kapalı: {mfasizlar.map((u) => uyeSatirMetni(u).baslik).join(', ')}
                </p>
              )}
            </div>
            <Anahtar
              acik={guvenlik.mfaZorunlu}
              etiket="Ekipte iki adımlı giriş zorunlu"
              pasif={islemde || (!guvenlik.sahipMfaAcik && !guvenlik.mfaZorunlu)}
              onDegis={guvenligiDegistir}
            />
          </div>
          {/* FAZ 7 F3b: kurumsal giris ayarina giris */}
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Kurumsal giriş</div>
              <p className="mt-1 text-xs leading-normal text-gray-500">
                Ekibin Microsoft ya da Google şirket hesabıyla giriş yapsın; istersen parolayla girişi
                tamamen kapat.
              </p>
            </div>
            <Link
              href="/firma/ekip/kurumsal-giris"
              className="inline-flex h-9 shrink-0 items-center self-start rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-gray-900 transition-colors hover:bg-gray-50 sm:self-auto"
            >
              Ayarlar
            </Link>
          </div>
        </section>
      )}

      {!sahipMi && (
        <p className="text-sm text-gray-500">
          Ekibi ve izinleri firma yöneticin yönetir. Ekipten ayrılmak için{' '}
          <a href="/profile#hesabi-kapat" className="font-medium text-[#2563eb] hover:underline">
            Hesabım → Hesabımı kapat
          </a>{' '}
          adımını kullan.
        </p>
      )}

      {sahipMi && davetAcik && (
        <DavetPenceresi
          ekip={veri}
          hakMetni={kart.deger}
          islemde={islemde}
          onGonder={davetGonder}
          onKapat={davetiKapat}
        />
      )}

      {sahipMi && panel && (
        <UyeIzinPaneli
          key={panel.tur === 'uye' ? `u-${panel.uye.id}` : `d-${panel.davet.id}`}
          hedef={panel}
          islemde={islemde}
          onKaydet={(izinler) => izinKaydet(panel, izinler)}
          onCikar={() => void cikar(panel)}
          onRolDegistir={() => {
            if (panel.tur === 'uye') void rolDegistir(panel.uye);
          }}
          onKapat={paneliKapat}
        />
      )}
    </div>
  );
}
