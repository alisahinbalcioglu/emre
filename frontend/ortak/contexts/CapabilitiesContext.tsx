'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import api from '@/ortak/lib/api';
import type { ErisimKarari } from '@/ozellik/odeme/erisim-durumu';
import {
  kapaliDurumCoz,
  type KapaliDurum,
} from '@/ortak/kabuk/components/layout/kapali-durum';
import { izinSirala, type UyeIzni } from '@/ozellik/firma/ekip/izin-metinleri';

export interface DisciplineCapability {
  material: boolean;
  labor: boolean;
  dwg: boolean;
}

export interface UserCapabilities {
  mechanical: DisciplineCapability;
  electrical: DisciplineCapability;
}

export const EMPTY_CAPABILITIES: UserCapabilities = {
  mechanical: { material: false, labor: false, dwg: false },
  electrical: { material: false, labor: false, dwg: false },
};

interface CapabilitiesContextValue {
  capabilities: UserCapabilities;
  /**
   * ADIM 2 — ABONELIK SAGLIGI. `capabilities` ile DIK bir eksendir:
   * capabilities "NE SATIN ALINDI" (disiplin + seviye), erisim "SU AN
   * KULLANILABILIR MI" (odeme gecikti mi, askida mi, deneme bitti mi).
   *
   * Ikisini tek alanda birlestirmek cazipti ama YANLIS olurdu: odemesi
   * geciken firmanin yetenekleri sifirlansaydi ekran "Pro paketiniz askida"
   * diyemezdi — cunku paketin Pro oldugunu artik bilemezdi.
   *
   * null = henuz yuklenmedi VEYA firmasiz hesap.
   */
  erisim: ErisimKarari | null;
  /**
   * FAZ 3.4 — e-posta dogrulandi mi. AYNI `/auth/me` yanitindan gelir, AYRI
   * istek atilmaz (erisim karariyla ayni gerekce: /auth/me on yuzun tek
   * besleme noktasidir). null = henuz yuklenmedi.
   */
  emailVerified: boolean | null;
  /**
   * 22.09.2026 — HESAP KAPALI MI (kapatma cümlesi + imha tarihi + tip).
   * `emailVerified` ile BİREBİR AYNI gerekçe: AYNI `/auth/me` yanıtından
   * gelir, AYRI istek ATILMAZ. `KapaliHesapSeridi` önce kendi isteğini
   * atıyordu; bu sağlayıcı zaten aynı ucu çağırdığı için her kabuk
   * mount'unda İKİ `/auth/me` gidiyordu ve iki ayrı gerçek kaynağı
   * oluşuyordu — biri günün birinde ötekinden sapardı.
   * null = henüz yüklenmedi VEYA hesap kapalı değil.
   */
  kapali: KapaliDurum | null;
  /**
   * 23.09.2026 — ALT KULLANICI IZINLERI (Ekip & Izinler). AYNI `/auth/me`
   * yanitindan (sunucu ETKIN listeyi doner: sahip → dordu). Ayri istek YOK.
   * `null` = sunucu SOYLEMEDI (yukleniyor / eski sunucu / istek dustu).
   */
  izinler: UyeIzni[] | null;
  /**
   * Menu ve yukleme alanlari icin KOLAYLIK sorusu — KAPI DEGIL (kapi
   * sunucuda, `ErisimGuard`). ⚠ `null` → `true`: sunucu bilgi vermediginde
   * ekrani bosaltmayiz; uc zaten reddeder. Tersi (null → false) eski bir
   * sunucuyla ya da tek bir dusen istekte SAHIBIN menusunu bosaltirdi.
   */
  izinVar: (izin: UyeIzni) => boolean;
  /**
   * 23.09.2026 (ikinci tasarim) — FIRMA ROLU, AYNI `/auth/me` yanitindan.
   * Menu "Ekip" ve "Abonelik"i YALNIZ `'uye'` iken gizler: `null`
   * (bilinmiyor) sahip sayilmaz ama menu de BOSALTILMAZ — sahibin tek
   * odeme yolu (`/abonelik`) bir dusen istekle kaybolmasin.
   */
  firmaRol: 'sahip' | 'uye' | null;
  loading: boolean;
  refresh: () => Promise<void>;
  // Helper'lar
  hasAnyMaterial: () => boolean;
  hasAnyLabor: () => boolean;
  hasAnyDwg: () => boolean;
  hasDiscipline: (d: 'mechanical' | 'electrical') => boolean;
  hasLaborFor: (d: 'mechanical' | 'electrical') => boolean;
}

const CapabilitiesContext = createContext<CapabilitiesContextValue | null>(null);

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const [capabilities, setCapabilities] = useState<UserCapabilities>(EMPTY_CAPABILITIES);
  const [erisim, setErisim] = useState<ErisimKarari | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [kapali, setKapali] = useState<KapaliDurum | null>(null);
  const [izinler, setIzinler] = useState<UyeIzni[] | null>(null);
  const [firmaRol, setFirmaRol] = useState<'sahip' | 'uye' | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    if (!token) {
      setCapabilities(EMPTY_CAPABILITIES);
      setErisim(null);
      setEmailVerified(null);
      setKapali(null);
      setIzinler(null);
      setFirmaRol(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      if (data?.capabilities) {
        setCapabilities(data.capabilities);
      } else {
        setCapabilities(EMPTY_CAPABILITIES);
      }
      // ADIM 2: erisim karari AYNI yanittan gelir — ayri istek ATILMAZ.
      // /auth/me on yuzun tek besleme noktasidir (login yaniti bunlari
      // TASIMAZ: auth.service login yalniz {id,email,role,tier} doner).
      setErisim(data?.erisim ?? null);
      setEmailVerified(typeof data?.emailVerified === 'boolean' ? data.emailVerified : null);
      // 22.09: kapali hesap durumu da AYNI yanittan — `KapaliHesapSeridi`
      // artik kendi istegini atmaz. Cozucu ayri ve import'suz bir dosyada
      // (`kapali-durum.ts`) cunku vitest bu depoda `@/…` cozmuyor.
      setKapali(kapaliDurumCoz(data));
      // 23.09: izinler de AYNI yanittan. Alan YOKSA (eski sunucu) `null` —
      // "hic izni yok" (`[]`) ile karistirilmaz.
      setIzinler(Array.isArray(data?.izinler) ? izinSirala(data.izinler) : null);
      // 23.09 (ikinci tasarim): firma rolu de AYNI yanittan; yalniz iki
      // bilinen deger kabul edilir, gerisi `null` (bilinmiyor).
      setFirmaRol(data?.firmaRol === 'sahip' || data?.firmaRol === 'uye' ? data.firmaRol : null);

      // Satin alma sonrasi PAKET TAZELENMESI: Sidebar paketi
      // localStorage'daki donmus kopyadan okuyor (login aninda yazilir).
      // Bu satir olmadan kullanici odeme yapip da cikis/giris yapmadan
      // eski paketini gormeye devam ederdi.
      //
      // ⚠ 2.15: KAPI ARTIK `null`I DA GECIRIYOR. Eski hal `if (data?.tier)`
      // idi; sunucu 2.13'ten sonra etkin paket yokken `tier: null` donuyor ve
      // `null` FALSY oldugu icin kopya HIC guncellenmiyordu — aboneligi sona
      // ermis musterinin localStorage'indaki `'pro'` sonsuza kadar kalir,
      // kenar cubugu Pro rozetini gostermeye devam ederdi. Yani sunucu
      // duzeltilse bile ekran eski yalani tasirdi (mekanizma var, baglanti
      // yok). Olcut "deger dolu mu" DEGIL, "sunucu bu alani soyledi mi".
      if (data && typeof data === 'object' && 'tier' in data) {
        try {
          const yeniTier = (data as { tier?: string | null }).tier ?? null;
          const ham = localStorage.getItem('user');
          if (ham) {
            const u = JSON.parse(ham);
            if ((u?.tier ?? null) !== yeniTier) {
              localStorage.setItem('user', JSON.stringify({ ...u, tier: yeniTier }));
            }
          }
        } catch {
          /* bozuk kopya akisi bozmamali — bir sonraki giriste duzelir */
        }
      }
    } catch {
      setCapabilities(EMPTY_CAPABILITIES);
      setErisim(null);
      setEmailVerified(null);
      setKapali(null);
      setIzinler(null);
      setFirmaRol(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasAnyMaterial = () => capabilities.mechanical.material || capabilities.electrical.material;
  const hasAnyLabor = () => capabilities.mechanical.labor || capabilities.electrical.labor;
  const hasAnyDwg = () => capabilities.mechanical.dwg || capabilities.electrical.dwg;
  const hasDiscipline = (d: 'mechanical' | 'electrical') => capabilities[d].material;
  const hasLaborFor = (d: 'mechanical' | 'electrical') => capabilities[d].labor;
  const izinVar = (izin: UyeIzni) => (izinler === null ? true : izinler.includes(izin));

  return (
    <CapabilitiesContext.Provider
      value={{ capabilities, erisim, emailVerified, kapali, izinler, izinVar, firmaRol, loading, refresh, hasAnyMaterial, hasAnyLabor, hasAnyDwg, hasDiscipline, hasLaborFor }}
    >
      {children}
    </CapabilitiesContext.Provider>
  );
}

export function useCapabilities(): CapabilitiesContextValue {
  const ctx = useContext(CapabilitiesContext);
  if (!ctx) {
    // Fallback — eger provider yoksa, capability yok demek (defensive)
    return {
      capabilities: EMPTY_CAPABILITIES,
      erisim: null,
      emailVerified: null,
      // ⚠ `null` = "kapali degil" DEGIL, "bilmiyoruz". Saglayicisiz bir
      //   agacta serit CIZILMEZ; kapali hesabi yanlislikla ACIK gostermek
      //   yerine hic sey gostermemek dogru yon — gercek kapi sunucuda.
      kapali: null,
      // Saglayicisiz agac: bilgi yok → ekran bosaltilmaz (gercek kapi sunucuda).
      izinler: null,
      izinVar: () => true,
      firmaRol: null,
      loading: false,
      refresh: async () => {},
      hasAnyMaterial: () => false,
      hasAnyLabor: () => false,
      hasAnyDwg: () => false,
      hasDiscipline: () => false,
      hasLaborFor: () => false,
    };
  }
  return ctx;
}
