'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import api from '@/lib/api';

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
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    if (!token) {
      setCapabilities(EMPTY_CAPABILITIES);
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
    } catch {
      setCapabilities(EMPTY_CAPABILITIES);
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
      value={{ capabilities, loading, refresh, hasAnyMaterial, hasAnyLabor, hasAnyDwg, hasDiscipline, hasLaborFor }}
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
