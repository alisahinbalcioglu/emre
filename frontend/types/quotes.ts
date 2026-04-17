/**
 * Quote creation page'e ozgu tip tanimlari.
 * frontend/app/(protected)/quotes/new/page.tsx icindeki inline interface'lerden tasindi.
 */

import type { Brand } from './index';

export type UploadMode = 'excel' | 'pdf' | 'dwg';
export type Currency = 'TRY' | 'USD' | 'EUR';

export interface LaborFirm {
  id: string;
  name: string;
  discipline: 'mechanical' | 'electrical';
}

export interface AvailableBrand {
  id: string;
  name: string;
  price: number;
}

export interface UploadResponse {
  headers: string[];
  rows: Record<string, any>[];
  brands: Brand[];
  columnRoles?: Record<string, string>;
  usedProvider?: string;
}

export interface MatchCandidate {
  materialName: string;
  netPrice: number;
  listPrice: number;
  discount: number;
  tags: string[];
  popular: boolean;
  label: string;
  surfaceLevel: boolean;
}

export interface EditableRow {
  _key: string;
  cells: Record<string, any>;
  materialKar: number;
  laborKar: number;
  brandId: string | null;
  laborFirmaId: string | null;
  _matNetPrice: number;
  _labNetPrice: number;
  /** Birden fazla aday varsa */
  _candidates?: MatchCandidate[] | null;
  /** "Digerleri" acik mi */
  _showAllCandidates?: boolean;
}

export interface ExchangeRates {
  TRY: number;
  USD: number;
  EUR: number;
}
