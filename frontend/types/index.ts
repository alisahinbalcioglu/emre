export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  createdAt?: string;
}

export interface Brand {
  id: string;
  name: string;
}

export interface MaterialPrice {
  id: string;
  materialId: string;
  brandId: string;
  price: number;
  brand: Brand;
}

export interface Material {
  id: string;
  name: string;
  materialPrices: MaterialPrice[];
}

export interface LibraryItem {
  id: string;
  userId: string;
  materialId?: string;
  materialName?: string;
  brandId: string;
  customPrice?: number;
  discountRate?: number;
  listPrice?: number;
  unit?: string;
  material?: Material;
  brand: Brand;
}

export interface QuoteItem {
  id: string;
  quoteId: string;
  materialName: string;
  brandId?: string;
  brand?: Brand;
  quantity: number;
  unitPrice: number;
  discount: number;
  netPrice: number;
  profitMargin: number;
  finalPrice: number;
}

export interface Quote {
  id: string;
  userId: string;
  title?: string;
  createdAt: string;
  items: QuoteItem[];
  _count?: { items: number };
}

export interface ParsedRow {
  materialName: string;
  quantity: number;
  brandId: string | null;
  brandName: string | null;
  unitPrice: number;
  discount: number;
  profitMargin: number;
  availableBrands: { id: string; name: string; price: number }[];
  matched: boolean;
}
