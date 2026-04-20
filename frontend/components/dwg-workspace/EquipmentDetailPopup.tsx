'use client';

/**
 * INSERT (ekipman) tiklaninca acilan popup.
 * Kullanici "Malzeme Adi" + "Birim" girer, kaydedince ekipman turuncu renklenir.
 */

import React, { useState } from 'react';
import { X, Check, Trash2 } from 'lucide-react';
import type { MarkedEquipment } from './types';

const COMMON_UNITS = ['adet', 'set', 'm', 'm²', 'kg'];

interface EquipmentDetailPopupProps {
  pending: {
    key: string;
    insertIndex: number;
    layer: string;
    insertName: string;
    position: [number, number];
  };
  existing?: MarkedEquipment;  // daha once isaretlendiyse duzenleme
  onCancel: () => void;
  onSave: (eq: MarkedEquipment) => void;
  onDelete?: () => void;
}

export default function EquipmentDetailPopup({
  pending, existing, onCancel, onSave, onDelete,
}: EquipmentDetailPopupProps) {
  const [userLabel, setUserLabel] = useState(existing?.userLabel ?? '');
  const [unit, setUnit] = useState(existing?.unit ?? 'adet');

  const handleSave = () => {
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
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">Ekipman Bilgisi</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Layer: {pending.layer} · Block: {pending.insertName || '(isim yok)'}
            </p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700" title="İptal">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium text-slate-600">Malzeme Adı</label>
          <input
            type="text"
            value={userLabel}
            onChange={(e) => setUserLabel(e.target.value)}
            placeholder="örn: DN50 Kelebek Vana, Kazan 100 kW, Pompa 5.5 HP"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            autoFocus
          />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-slate-600">Birim</label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_UNITS.map((u) => (
              <button
                key={u}
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
              placeholder="özel"
              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-between gap-2">
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
              İptal
            </button>
            <button
              onClick={handleSave}
              disabled={!userLabel.trim()}
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
