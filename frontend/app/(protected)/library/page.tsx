'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, BookOpen, ChevronDown, FolderOpen, Package, Wrench, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Brand {
  id: string;
  name: string;
  logoUrl?: string | null;
}

interface Material {
  id: string;
  name: string;
  materialPrices: unknown[];
}

interface LibraryItem {
  id: string;
  userId: string;
  materialId?: string;
  materialName: string;
  brandId?: string;
  brand?: Brand;
  material?: { id: string; name: string };
  customPrice?: number;
  discountRate?: number;
  listPrice?: number;
  unit?: string;
}

type AddMode = 'global' | 'manual';

interface AddFormState {
  mode: AddMode;
  materialId: string;
  materialName: string;
  brandId: string;
  customPrice: string;
  discountRate: string;
}

interface EditFormState {
  brandId: string;
  customPrice: string;
  discountRate: string;
}

const INITIAL_ADD_FORM: AddFormState = {
  mode: 'global',
  materialId: '',
  materialName: '',
  brandId: '',
  customPrice: '',
  discountRate: '',
};

const INITIAL_EDIT_FORM: EditFormState = {
  brandId: '',
  customPrice: '',
  discountRate: '',
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatPrice(value: number | undefined | null): string {
  if (value == null) return '-';
  return `\u20BA${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDiscount(value: number | undefined | null): string {
  if (value == null) return '-';
  return `%${value}`;
}

function calcNetPrice(listPrice: number | undefined | null, customPrice: number | undefined | null, discountRate: number | undefined | null): number | null {
  const basePrice = customPrice ?? listPrice;
  if (basePrice == null) return null;
  const discount = discountRate ?? 0;
  return basePrice * (1 - discount / 100);
}

/* -------------------------------------------------------------------------- */
/*  Material class + diameter grouping (same logic as brand detail)            */
/* -------------------------------------------------------------------------- */

const DIAMETER_ORDER = [
  '3/8', '1/2', '3/4', '1', '1 1/4', '1 1/2', '2', '2 1/2', '3', '4', '5', '6', '8', '10', '12',
];

function normalizeDiameter(raw: string): string {
  const compact = raw.match(/^(\d)(\d\/\d)$/);
  if (compact) return `${compact[1]} ${compact[2]}`;
  return raw;
}

function parseDiameter(name: string): string {
  const compactFrac = name.match(/(\d)(\d\/\d)/);
  if (compactFrac) return normalizeDiameter(compactFrac[1] + compactFrac[2]);
  const spacedFrac = name.match(/(\d+\s+\d+\/\d+)/);
  if (spacedFrac) return spacedFrac[1].trim();
  const simpleFrac = name.match(/(\d+\/\d+)/);
  if (simpleFrac) return simpleFrac[1];
  const dnMatch = name.match(/(?:DN|Ø)\s*(\d+)/i);
  if (dnMatch) return dnMatch[1];
  const inchMatch = name.match(/\b(\d+)["''″]/);
  if (inchMatch) return inchMatch[1];
  return '';
}

function parseMaterialClass(name: string): string {
  // 1. DIN/EN/ISO standard prefix
  const stdMatch = name.match(
    /^((?:DIN|EN|ISO|TS|ASTM)\s+[\d\-]+(?:\s+\d+°)?\s+[A-Za-zÇçĞğİıÖöŞşÜüâ\-]+(?:\s+[A-Za-zÇçĞğİıÖöŞşÜüâ\-]+)?)/i,
  );
  if (stdMatch) return stdMatch[1].trim();
  // 2. Generic: words before first numeric dimension
  const genericMatch = name.match(
    /^([A-Za-zÇçĞğİıÖöŞşÜüâ\-]+(?:\s+[A-Za-zÇçĞğİıÖöŞşÜüâ\-]+)*?)(?:\s+\d)/,
  );
  if (genericMatch && genericMatch[1].trim().length >= 3) return genericMatch[1].trim();
  // 3. Fallback: first 2-3 words
  const words = name.split(/\s+/).filter(Boolean);
  return words.slice(0, Math.min(3, words.length)).join(' ') || 'Diğer';
}

function diameterSortKey(d: string): number {
  const idx = DIAMETER_ORDER.indexOf(d);
  if (idx >= 0) return idx;
  const num = parseFloat(d);
  if (!isNaN(num)) return 100 + num;
  return 999;
}

interface BrandGroup { brandName: string; brandId: string; logoUrl?: string | null; items: LibraryItem[] }

function groupByBrand(items: LibraryItem[]): BrandGroup[] {
  const brandMap = new Map<string, { brandName: string; brandId: string; logoUrl?: string | null; items: LibraryItem[] }>();

  for (const item of items) {
    const brandName = item.brand?.name ?? 'Markasız';
    const brandId = item.brandId ?? '_none';
    const logoUrl = (item.brand as Brand | undefined)?.logoUrl ?? null;
    if (!brandMap.has(brandId)) brandMap.set(brandId, { brandName, brandId, logoUrl, items: [] });
    brandMap.get(brandId)!.items.push(item);
  }

  // Her marka icinde: teknik sinif + cap siralama
  brandMap.forEach((group) => {
    group.items.sort((a, b) => {
      const clsA = parseMaterialClass(a.materialName);
      const clsB = parseMaterialClass(b.materialName);
      const clsCmp = clsA.localeCompare(clsB, 'tr');
      if (clsCmp !== 0) return clsCmp;
      const da = parseDiameter(a.materialName);
      const db = parseDiameter(b.materialName);
      const diff = diameterSortKey(da) - diameterSortKey(db);
      if (diff !== 0) return diff;
      return a.materialName.localeCompare(b.materialName, 'tr');
    });
  });

  return Array.from(brandMap.values())
    .sort((a, b) => a.brandName.localeCompare(b.brandName, 'tr'));
}

/* -------------------------------------------------------------------------- */
/*  Page Component                                                             */
/* -------------------------------------------------------------------------- */

export default function LibraryPage() {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(INITIAL_ADD_FORM);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>(INITIAL_EDIT_FORM);
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);

  // Brand open/collapse state — only the clicked brand is open (empty = all collapsed)
  const [openBrandId, setOpenBrandId] = useState<string | null>(null);
  // Legacy compat wrapper: collapsedBrands.has(id) returns true when collapsed
  const collapsedBrands = { has: (id: string) => openBrandId !== id };

  // Inline discount editing
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [editingDiscountValue, setEditingDiscountValue] = useState('');

  // Inline price editing
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');

  // Bulk discount
  const [bulkDiscountBrandId, setBulkDiscountBrandId] = useState<string | null>(null);
  const [bulkDiscountValue, setBulkDiscountValue] = useState('');

  // Drag-to-fill discount
  interface DragFillState {
    sourceId: string;
    sourceValue: number;
    brandId: string;
    startIndex: number;
    currentIndex: number;
  }
  const [dragFill, setDragFill] = useState<DragFillState | null>(null);
  const dragFillRef = useRef<DragFillState | null>(null);
  const rowRefsMap = useRef<Map<string, HTMLTableRowElement>>(new Map());

  /* ----------------------------- Fetch ----------------------------------- */

  const fetchAll = useCallback(async () => {
    try {
      setIsLoading(true);
      const [libRes, matRes, brandRes] = await Promise.all([
        api.get('/library'),
        api.get('/materials'),
        api.get('/brands'),
      ]);
      setLibrary(libRes.data);
      setMaterials(matRes.data);
      setBrands(brandRes.data);
    } catch {
      toast({
        title: 'Hata',
        description: 'Veriler yüklenirken bir hata oluştu.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* ----------------------------- Add ------------------------------------- */

  function openAddDialog() {
    setAddForm(INITIAL_ADD_FORM);
    setAddDialogOpen(true);
  }

  async function handleAdd() {
    const { mode, materialId, materialName, brandId, customPrice, discountRate } = addForm;

    if (mode === 'global' && !materialId) {
      toast({ title: 'Uyarı', description: 'Lütfen bir malzeme seçin.', variant: 'destructive' });
      return;
    }
    if (mode === 'manual' && !materialName.trim()) {
      toast({ title: 'Uyarı', description: 'Lütfen malzeme adı girin.', variant: 'destructive' });
      return;
    }

    const discount = discountRate ? Number(discountRate) : undefined;
    if (discount !== undefined && (discount < 0 || discount > 100)) {
      toast({ title: 'Uyarı', description: 'İskonto oranı 0-100 arasında olmalıdır.', variant: 'destructive' });
      return;
    }

    try {
      setIsSubmitting(true);
      await api.post('/library', {
        ...(mode === 'global' ? { materialId } : { materialName: materialName.trim() }),
        ...(brandId ? { brandId } : {}),
        ...(customPrice ? { customPrice: Number(customPrice) } : {}),
        ...(discount !== undefined ? { discountRate: discount } : {}),
      });
      toast({ title: 'Başarılı', description: 'Malzeme kütüphaneye eklendi.' });
      setAddDialogOpen(false);
      await fetchAll();
    } catch {
      toast({ title: 'Hata', description: 'Malzeme eklenirken bir hata oluştu.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }

  /* ----------------------------- Edit ------------------------------------ */

  function openEditDialog(item: LibraryItem) {
    setEditingItem(item);
    setEditForm({
      brandId: item.brandId?.toString() ?? '',
      customPrice: item.customPrice?.toString() ?? '',
      discountRate: item.discountRate?.toString() ?? '',
    });
    setEditDialogOpen(true);
  }

  async function handleEdit() {
    if (!editingItem) return;

    const discount = editForm.discountRate ? Number(editForm.discountRate) : undefined;
    if (discount !== undefined && (discount < 0 || discount > 100)) {
      toast({ title: 'Uyarı', description: 'İskonto oranı 0-100 arasında olmalıdır.', variant: 'destructive' });
      return;
    }

    try {
      setIsSubmitting(true);
      await api.put(`/library/${editingItem.id}`, {
        ...(editForm.brandId ? { brandId: editForm.brandId } : { brandId: null }),
        ...(editForm.customPrice ? { customPrice: Number(editForm.customPrice) } : { customPrice: null }),
        ...(discount !== undefined ? { discountRate: discount } : { discountRate: null }),
      });
      toast({ title: 'Başarılı', description: 'Malzeme güncellendi.' });
      setEditDialogOpen(false);
      setEditingItem(null);
      await fetchAll();
    } catch {
      toast({ title: 'Hata', description: 'Malzeme güncellenirken bir hata oluştu.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }

  /* ----------------------------- Inline Discount ------------------------- */

  function toggleBrand(brandId: string) {
    setOpenBrandId((prev) => (prev === brandId ? null : brandId));
  }

  function startDiscountEdit(item: LibraryItem) {
    setEditingDiscountId(item.id);
    setEditingDiscountValue(item.discountRate?.toString() ?? '');
  }

  async function saveInlineDiscount(item: LibraryItem) {
    setEditingDiscountId(null);
    const newVal = editingDiscountValue.trim() === '' ? 0 : Number(editingDiscountValue);
    if (isNaN(newVal) || newVal < 0 || newVal > 100) {
      toast({ title: 'Uyarı', description: 'İskonto 0-100 arasında olmalı.', variant: 'destructive' });
      return;
    }
    if (newVal === (item.discountRate ?? 0)) return; // degisiklik yok

    try {
      await api.put(`/library/${item.id}`, {
        brandId: item.brandId,
        customPrice: item.customPrice ?? null,
        discountRate: newVal,
      });
      // Optimistic update
      setLibrary((prev) =>
        prev.map((li) => (li.id === item.id ? { ...li, discountRate: newVal } : li)),
      );
    } catch {
      toast({ title: 'Hata', description: 'İskonto kaydedilemedi.', variant: 'destructive' });
    }
  }

  /* ----------------------------- Drag-to-Fill Discount ------------------- */

  function startDragFill(item: LibraryItem, indexInGroup: number, brandId: string) {
    const state: DragFillState = {
      sourceId: item.id,
      sourceValue: item.discountRate ?? 0,
      brandId,
      startIndex: indexInGroup,
      currentIndex: indexInGroup,
    };
    setDragFill(state);
    dragFillRef.current = state;
  }

  // Add/remove drag cursor class on body
  useEffect(() => {
    if (dragFill) {
      document.body.style.cursor = 'crosshair';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragFill]);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const state = dragFillRef.current;
      if (!state) return;
      // Find which row the mouse is over
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const row = el.closest('tr[data-drag-index]');
      if (!row) return;
      const rowBrandId = row.getAttribute('data-drag-brand');
      if (rowBrandId !== state.brandId) return;
      const idx = parseInt(row.getAttribute('data-drag-index') || '', 10);
      if (isNaN(idx) || idx < state.startIndex) return;
      if (idx !== state.currentIndex) {
        const next = { ...state, currentIndex: idx };
        dragFillRef.current = next;
        setDragFill(next);
      }
    }

    async function handleMouseUp() {
      const state = dragFillRef.current;
      if (!state) return;
      dragFillRef.current = null;
      setDragFill(null);

      if (state.currentIndex <= state.startIndex) return;

      // Find the brand group items to get IDs
      const brandGroups = groupByBrand(library);
      const group = brandGroups.find((g) => g.brandId === state.brandId);
      if (!group) return;

      const targetIds: string[] = [];
      for (let i = state.startIndex + 1; i <= state.currentIndex && i < group.items.length; i++) {
        targetIds.push(group.items[i].id);
      }
      if (targetIds.length === 0) return;

      // Optimistic update
      const idsSet = new Set(targetIds);
      setLibrary((prev) =>
        prev.map((li) => (idsSet.has(li.id) ? { ...li, discountRate: state.sourceValue } : li)),
      );

      // API call
      try {
        await api.post('/library/bulk-update-items', {
          ids: targetIds,
          discountRate: state.sourceValue,
        });
        toast({
          title: 'Iskonto kopyalandi',
          description: `%${state.sourceValue} iskonto ${targetIds.length} malzemeye uygulandi.`,
        });
      } catch {
        toast({ title: 'Hata', description: 'Toplu iskonto kopyalanamadi.', variant: 'destructive' });
        await fetchAll(); // rollback
      }
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [library, fetchAll]);

  function isDragHighlighted(brandId: string, indexInGroup: number): boolean {
    if (!dragFill) return false;
    return dragFill.brandId === brandId && indexInGroup > dragFill.startIndex && indexInGroup <= dragFill.currentIndex;
  }

  function isDragSource(brandId: string, indexInGroup: number): boolean {
    if (!dragFill) return false;
    return dragFill.brandId === brandId && indexInGroup === dragFill.startIndex;
  }

  /* ----------------------------- Inline Price ---------------------------- */

  function startPriceEdit(item: LibraryItem) {
    setEditingPriceId(item.id);
    const currentPrice = item.customPrice ?? item.listPrice;
    setEditingPriceValue(currentPrice?.toString() ?? '');
  }

  async function saveInlinePrice(item: LibraryItem) {
    setEditingPriceId(null);
    const newVal = editingPriceValue.trim() === '' ? null : Number(editingPriceValue);
    if (newVal !== null && (isNaN(newVal) || newVal < 0)) {
      toast({ title: 'Uyari', description: 'Fiyat 0 veya ustu olmali.', variant: 'destructive' });
      return;
    }
    const oldVal = item.customPrice ?? item.listPrice ?? null;
    if (newVal === oldVal) return;

    try {
      await api.put(`/library/${item.id}`, {
        ...(newVal !== null ? { customPrice: newVal } : { customPrice: 0 }),
      });
      setLibrary((prev) =>
        prev.map((li) => (li.id === item.id ? { ...li, customPrice: newVal ?? undefined } : li)),
      );
    } catch {
      toast({ title: 'Hata', description: 'Fiyat kaydedilemedi.', variant: 'destructive' });
    }
  }

  /* ----------------------------- Bulk Discount ----------------------------- */

  async function handleBulkDiscount(brandId: string) {
    const val = Number(bulkDiscountValue);
    if (isNaN(val) || val < 0 || val > 100) {
      toast({ title: 'Uyari', description: 'Iskonto 0-100 arasinda olmali.', variant: 'destructive' });
      return;
    }
    try {
      const { data: res } = await api.post('/library/bulk-discount', { brandId, discountRate: val });
      toast({ title: 'Basarili', description: `${res.updated} malzemeye %${val} iskonto uygulandi.` });
      setLibrary((prev) =>
        prev.map((li) => (li.brandId === brandId ? { ...li, discountRate: val } : li)),
      );
      setBulkDiscountBrandId(null);
      setBulkDiscountValue('');
    } catch {
      toast({ title: 'Hata', description: 'Toplu iskonto uygulanamadi.', variant: 'destructive' });
    }
  }

  /* ----------------------------- Delete ---------------------------------- */

  async function handleDelete(item: LibraryItem) {
    const confirmed = window.confirm(
      `"${item.materialName}" malzemesini kütüphaneden silmek istediğinize emin misiniz?`
    );
    if (!confirmed) return;

    try {
      await api.delete(`/library/${item.id}`);
      toast({ title: 'Başarılı', description: 'Malzeme kütüphaneden silindi.' });
      await fetchAll();
    } catch {
      toast({ title: 'Hata', description: 'Malzeme silinirken bir hata oluştu.', variant: 'destructive' });
    }
  }

  /* ----------------------------- Render ---------------------------------- */

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kutuphanem</h1>
            <p className="mt-1 text-sm text-muted-foreground">Malzeme markalari ve iscilik kalemleri</p>
          </div>
        </div>
      </div>

      {/* 4-Way Library Navigation */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link href="/library/mechanical-brands" className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-6 text-sm font-medium transition-all hover:border-primary hover:bg-primary/5 hover:shadow-md">
          <Package className="h-8 w-8 text-primary" />
          <span className="text-base font-semibold">Mekanik Markalar</span>
          <span className="text-xs text-muted-foreground">Malzeme fiyat listeleri</span>
        </Link>
        <Link href="/library/electrical-brands" className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-6 text-sm font-medium transition-all hover:border-amber-500 hover:bg-amber-50 hover:shadow-md">
          <Zap className="h-8 w-8 text-amber-500" />
          <span className="text-base font-semibold">Elektrik Markalar</span>
          <span className="text-xs text-muted-foreground">Kablo, pano, otomat</span>
        </Link>
        <Link href="/labor-firms?discipline=mechanical" className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-6 text-sm font-medium transition-all hover:border-blue-500 hover:bg-blue-50 hover:shadow-md">
          <Wrench className="h-8 w-8 text-blue-500" />
          <span className="text-base font-semibold">Mekanik Iscilik</span>
          <span className="text-xs text-muted-foreground">Firmalar, fiyat listeleri</span>
        </Link>
        <Link href="/labor-firms?discipline=electrical" className="flex flex-col items-center gap-3 rounded-xl border-2 border-muted p-6 text-sm font-medium transition-all hover:border-orange-500 hover:bg-orange-50 hover:shadow-md">
          <Zap className="h-8 w-8 text-orange-500" />
          <span className="text-base font-semibold">Elektrik Iscilik</span>
          <span className="text-xs text-muted-foreground">Firmalar, fiyat listeleri</span>
        </Link>
      </div>
    </div>
  );
}
