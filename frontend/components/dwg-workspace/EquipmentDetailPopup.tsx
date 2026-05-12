'use client';

/**
 * INSERT (ekipman) tiklaninca acilan popup.
 *
 * Iki mod:
 *  - Kutuphane modu (default): /library/equipment'tan onceden tanımlanmış
 *    kombi/pompa/vana listesinden seçim → güç/kapasite/fiyat otomatik gelir
 *  - Manuel mod: Liste boşsa veya yoksa kullanıcı serbest ad+birim girer
 *
 * Kaydedilen MarkedEquipment artık libraryItemId / specs / unitPrice taşır →
 * "Hesapla / Onayla" sonrası metraj çıktısına bu bilgiler dahil edilir.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, Trash2, Search, Plus, Wrench } from 'lucide-react';
import api from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { MarkedEquipment } from './types';

const COMMON_UNITS = ['adet', 'set', 'm', 'm²', 'kg'];

interface EquipmentLibraryItem {
  id: string;
  materialName: string;
  brandId?: string;
  brand?: { id: string; name: string };
  customPrice?: number;
  listPrice?: number;
  unit?: string;
  specs?: Record<string, string> | null;
}

interface EquipmentDetailPopupProps {
  pending: {
    key: string;
    insertIndex: number;
    layer: string;
    insertName: string;
    position: [number, number];
  };
  existing?: MarkedEquipment;
  onCancel: () => void;
  onSave: (eq: MarkedEquipment) => void;
  onDelete?: () => void;
}

export default function EquipmentDetailPopup({
  pending, existing, onCancel, onSave, onDelete,
}: EquipmentDetailPopupProps) {
  const [mode, setMode] = useState<'library' | 'manual'>(existing?.libraryItemId ? 'library' : 'library');

  const [library, setLibrary] = useState<EquipmentLibraryItem[]>([]);
  const [loadingLib, setLoadingLib] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(existing?.libraryItemId ?? null);

  // Manuel mode fallback
  const [userLabel, setUserLabel] = useState(existing?.userLabel ?? '');
  const [unit, setUnit] = useState(existing?.unit ?? 'adet');

  useEffect(() => {
    (async () => {
      try {
        setLoadingLib(true);
        const res = await api.get<EquipmentLibraryItem[]>('/library/equipment');
        setLibrary(res.data);
      } catch {
        // Sessizce manuel mode'a geç
        setMode('manual');
      } finally {
        setLoadingLib(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter((it) =>
      it.materialName.toLowerCase().includes(q) ||
      it.brand?.name.toLowerCase().includes(q),
    );
  }, [library, search]);

  const selectedItem = useMemo(
    () => library.find((it) => it.id === selectedId) ?? null,
    [library, selectedId],
  );

  const handleSave = () => {
    if (mode === 'library') {
      if (!selectedItem) {
        toast({ title: 'Secim yok', description: 'Listeden bir ekipman secin veya manuel mod kullanin.', variant: 'destructive' });
        return;
      }
      const price = selectedItem.customPrice ?? selectedItem.listPrice;
      onSave({
        key: pending.key,
        insertIndex: pending.insertIndex,
        layer: pending.layer,
        insertName: pending.insertName,
        position: pending.position,
        userLabel: selectedItem.materialName,
        unit: selectedItem.unit ?? 'adet',
        libraryItemId: selectedItem.id,
        brandName: selectedItem.brand?.name ?? null,
        unitPrice: price ?? null,
        specs: selectedItem.specs ?? null,
      });
    } else {
      const label = userLabel.trim();
      if (!label) return;
      onSave({
        key: pending.key,
        insertIndex: pending.insertIndex,
        layer: pending.layer,
        insertName: pending.insertName,
        position: pending.position,
        userLabel: label,
        unit: unit.trim() || 'adet',
        libraryItemId: null,
        brandName: null,
        unitPrice: null,
        specs: null,
      });
    }
  };

  const canSave = mode === 'library' ? !!selectedItem : !!userLabel.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">Ekipman Sec</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Layer: {pending.layer} · Block: {pending.insertName || '(isim yok)'}
            </p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700" title="Iptal">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode('library')}
            className={
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ' +
              (mode === 'library'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900')
            }
          >
            Kutuphaneden Sec
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ' +
              (mode === 'manual'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900')
            }
          >
            Manuel Gir
          </button>
        </div>

        {mode === 'library' ? (
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Ekipman ara (orn: kombi, pompa)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>

            {/* List */}
            <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
              {loadingLib ? (
                <p className="p-4 text-center text-xs text-slate-500">Yukleniyor...</p>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center">
                  <Wrench className="mx-auto h-6 w-6 text-slate-300" />
                  <p className="mt-2 text-xs text-slate-500">
                    {library.length === 0
                      ? 'Kutuphanenizde henuz ekipman yok.'
                      : 'Aramayla eslesen sonuc yok.'}
                  </p>
                  <a
                    href="/library/equipment"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    Ekipman & Sarf kutuphanesine ekle
                  </a>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((it) => {
                    const price = it.customPrice ?? it.listPrice;
                    const isSelected = it.id === selectedId;
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(it.id)}
                          className={
                            'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ' +
                            (isSelected ? 'bg-blue-50' : 'hover:bg-slate-50')
                          }
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-800 truncate">
                                {it.materialName}
                              </span>
                              {isSelected && <Check className="h-3 w-3 shrink-0 text-blue-600" />}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                              {it.brand?.name && <span>{it.brand.name}</span>}
                              {it.specs && Object.keys(it.specs).length > 0 && (
                                <span className="flex gap-1">
                                  {Object.entries(it.specs).slice(0, 3).map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-700 border border-amber-200"
                                    >
                                      {k}: {String(v)}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-mono text-slate-800">
                              {price != null
                                ? `₺${price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                                : '-'}
                            </div>
                            <div className="text-[10px] text-slate-500">{it.unit ?? 'adet'}</div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selectedItem && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 text-xs">
                <p className="font-medium text-blue-900">{selectedItem.materialName}</p>
                {selectedItem.specs && Object.keys(selectedItem.specs).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(selectedItem.specs).map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-700 border border-slate-200"
                      >
                        <span className="font-medium">{k}:</span> {String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Malzeme Adi</label>
              <input
                type="text"
                value={userLabel}
                onChange={(e) => setUserLabel(e.target.value)}
                placeholder="orn: DN50 Kelebek Vana"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Birim</label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={
                      'rounded-lg border px-3 py-1 text-xs transition-colors ' +
                      (unit === u
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-400')
                    }
                  >
                    {u}
                  </button>
                ))}
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="ozel"
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Tip: Sıklıkla kullandığınız ekipmanları{' '}
              <a href="/library/equipment" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Ekipman & Sarf kutuphanesine ekleyin
              </a>{' '}
              — guc/kapasite/fiyat ile birlikte hesaplamaya otomatik dahil edilir.
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-between gap-2">
          {existing && onDelete ? (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Sil
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Iptal
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="h-4 w-4" />
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
