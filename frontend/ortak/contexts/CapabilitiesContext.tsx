'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import api from '@/ortak/lib/api';
import type { ErisimKarari } from '@/ozellik/odeme/erisim-durumu';

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
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    if (!token) {
      setCapabilities(EMPTY_CAPABILITIES);
      setErisim(null);
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

      // Satin alma sonrasi PAKET TAZELENMESI: Sidebar paketi
      // localStorage'daki donmus kopyadan okuyor (login aninda yazilir).
      // Bu satir olmadan kullanici odeme yapip da cikis/giris yapmadan
      // eski paketini gormeye devam ederdi.
      if (data?.tier) {
        try {
          const ham = localStorage.getItem('user');
          if (ham) {
            const u = JSON.parse(ham);
            if (u?.tier !== data.tier) {
              localStorage.setItem('user', JSON.stringify({ ...u, tier: data.tier }));
            }
          }
        } catch {
          /* bozuk kopya akisi bozmamali — bir sonraki giriste duzelir */
        }
      }
    } catch {
      setCapabilities(EMPTY_CAPABILITIES);
      setErisim(null);
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

  return (
    <CapabilitiesContext.Provider
      value={{ capabilities, erisim, loading, refresh, hasAnyMaterial, hasAnyLabor, hasAnyDwg, hasDiscipline, hasLaborFor }}
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
