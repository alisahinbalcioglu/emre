'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import api from '@/lib/api';
import type { MetrajResult } from './MetrajTable';

interface MetrajRow {
  id: string;
  name: string;
  diameter: string;
  qty: string;
  unit: string;
  source: string; // "project" | "rule" | "user"
  category: string; // "Boru" | "Fitting" | "Vana" | "Otomatik"
  hatTipi?: string; // yangin, sihhi, isitma, vb.
  original?: { name: string; qty: number }; // duzeltme oncesi
  deleted?: boolean;
}

interface MetrajEditorProps {
  data: MetrajResult;
  fileName: string;
  onApprove: (rows: MetrajRow[]) => void;
}

let _nextId = 1;
const nextId = () => `row-${_nextId++}`;

function metrajToRows(data: MetrajResult): MetrajRow[] {
  const rows: MetrajRow[] = [];
  for (const l of data.layers || []) {
    // Segment varsa: her cap icin ayri satir
    if (l.segments && l.segments.length > 0) {
      for (const seg of l.segments) {
        rows.push({
          id: nextId(),
          name: l.hat_tipi || l.layer,
          diameter: seg.diameter || '',
          qty: seg.length.toFixed(2),
          unit: 'm',
          source: 'project',
          category: 'Boru',
          hatTipi: l.hat_tipi ?? '',
        });
      }
    } else {
      // Segment yoksa: layer = satir (eski davranis)
      rows.push({
        id: nextId(),
        name: l.hat_tipi || l.layer,
        diameter: '',
        qty: l.length.toFixed(2),
        unit: 'm',
        source: 'project',
        category: 'Boru',
        hatTipi: l.hat_tipi ?? '',
      });
    }
  }
  return rows;
}

export default function MetrajEditor({ data, fileName, onApprove }: MetrajEditorProps) {
  const [rows, setRows] = useState<MetrajRow[]>(() => metrajToRows(data));
  const [saving, setSaving] = useState(false);

  // Yeni satir ekleme formu
  const [newName, setNewName] = useState('');
  const [newDiameter, setNewDiameter] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('ad');
  const [showAddForm, setShowAddForm] = useState(false);

  const handleDelete = (id: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, deleted: true } : r));
  };

  const handleRestore = (id: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, deleted: false } : r));
  };

  const handleQtyChange = (id: string, newQty: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (!r.original) {
        return { ...r, qty: newQty, original: { name: r.name, qty: parseFloat(r.qty) || 0 } };
      }
      return { ...r, qty: newQty };
    }));
  };

  const handleNameChange = (id: string, newName: string) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (!r.original) {
        return { ...r, name: newName, original: { name: r.name, qty: parseFloat(r.qty) || 0 } };
      }
      return { ...r, name: newName };
    }));
  };

  const handleAddRow = () => {
    if (!newName.trim()) return;
    setRows((prev) => [...prev, {
      id: nextId(),
      name: newName.trim(),
      diameter: newDiameter.trim(),
      qty: newQty || '1',
      unit: newUnit,
      source: 'user',
      category: 'Elle Eklenen',
    }]);
    setNewName('');
    setNewDiameter('');
    setNewQty('');
    setNewUnit('ad');
    setShowAddForm(false);
  };

  const handleApprove = async () => {
    setSaving(true);
    try {
      // Duzeltmeleri DB'ye kaydet
      const corrections: any[] = [];

      for (const row of rows) {
        if (row.deleted) {
          corrections.push({
            correctionType: 'delete',
            originalName: row.name,
            originalDiameter: row.diameter,
            originalQty: parseFloat(row.qty) || 0,
            originalUnit: row.unit,
          });
        } else if (row.original) {
          corrections.push({
            correctionType: 'update',
            originalName: row.original.name,
            originalQty: row.original.qty,
            correctedName: row.name,
            correctedQty: parseFloat(row.qty) || 0,
            correctedUnit: row.unit,
            correctedDiameter: row.diameter,
          });
        } else if (row.source === 'user') {
          corrections.push({
            correctionType: 'add',
            correctedName: row.name,
            correctedDiameter: row.diameter,
            correctedQty: parseFloat(row.qty) || 0,
            correctedUnit: row.unit,
          });
        }
      }

      // Aktif (silinmemis) satirlari gonder
      const activeRows = rows.filter((r) => !r.deleted);
      onApprove(activeRows);
      toast({ title: 'Metraj onaylandi', description: `${activeRows.length} kalem, ${corrections.length} duzeltme kaydedildi` });
    } catch (e: any) {
      toast({ title: 'Hata', description: 'Duzeltmeler kaydedilemedi', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const activeRows = rows.filter((r) => !r.deleted);
  const deletedRows = rows.filter((r) => r.deleted);
  const modifiedCount = rows.filter((r) => r.original || r.deleted || r.source === 'user').length;

  return (
    <div>
      {/* Uyarilar */}
      {data.warnings.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <div>
            {data.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700">{w}</p>
            ))}
          </div>
        </div>
      )}

      {/* Tablo */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-8">#</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Malzeme Adi</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-20">Cap</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 w-24">Miktar</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-16">Birim</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-20">Kaynak</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((row, i) => (
              <tr key={row.id} className={cn(
                'border-b border-slate-100 last:border-0 hover:bg-slate-50/50',
                row.original && 'bg-blue-50/30',
                row.source === 'user' && 'bg-emerald-50/30',
              )}>
                <td className="px-4 py-2 text-xs text-slate-400">{i + 1}</td>
                <td className="px-4 py-1.5">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => handleNameChange(row.id, e.target.value)}
                    className="w-full bg-transparent text-[13px] font-medium outline-none border-b border-transparent hover:border-slate-200 focus:border-blue-400 py-1 transition-colors"
                  />
                </td>
                <td className="px-4 py-1.5">
                  <input
                    type="text"
                    value={row.diameter}
                    onChange={(e) => setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, diameter: e.target.value } : r))}
                    className="w-20 bg-transparent text-xs text-slate-500 outline-none border-b border-transparent hover:border-slate-200 focus:border-blue-400 py-1 transition-colors"
                    placeholder="DN..."
                  />
                </td>
                <td className="px-4 py-1.5 text-right">
                  <input
                    type="text"
                    value={row.qty}
                    onChange={(e) => handleQtyChange(row.id, e.target.value)}
                    className="w-20 bg-transparent text-[13px] font-medium text-right outline-none border-b border-transparent hover:border-slate-200 focus:border-blue-400 py-1 tabular-nums transition-colors"
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={row.unit}
                    onChange={(e) => setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, unit: e.target.value } : r))}
                    className="bg-transparent text-xs text-slate-500 outline-none cursor-pointer"
                  >
                    <option value="m">m</option>
                    <option value="ad">ad</option>
                    <option value="tk">tk</option>
                    <option value="kg">kg</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <span className={cn(
                    'inline-block rounded px-1.5 py-0.5 text-[10px] font-medium',
                    row.source === 'project' && 'bg-slate-100 text-slate-500',
                    row.source === 'rule' && 'bg-amber-50 text-amber-600',
                    row.source === 'user' && 'bg-emerald-50 text-emerald-600',
                  )}>
                    {row.source === 'project' ? 'proje' : row.source === 'rule' ? 'kural' : 'elle'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleDelete(row.id)}
                    className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                    title="Sil"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Silinen satirlar */}
      {deletedRows.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-100 bg-red-50/30 px-4 py-2">
          <p className="text-[11px] font-medium text-red-400 mb-1">Silinen kalemler ({deletedRows.length})</p>
          {deletedRows.map((row) => (
            <div key={row.id} className="flex items-center justify-between py-1">
              <span className="text-xs text-red-400 line-through">{row.name} — {row.qty} {row.unit}</span>
              <button onClick={() => handleRestore(row.id)} className="text-[10px] text-blue-500 hover:underline">Geri al</button>
            </div>
          ))}
        </div>
      )}

      {/* Yeni satir ekle */}
      {showAddForm ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
          <p className="text-xs font-semibold text-emerald-700 mb-3">Yeni Malzeme Ekle</p>
          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Malzeme adi"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-400"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAddRow()}
              />
            </div>
            <input
              type="text"
              value={newDiameter}
              onChange={(e) => setNewDiameter(e.target.value)}
              placeholder="Cap (DN50)"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <input
              type="text"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="Miktar"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <div className="flex gap-2">
              <select
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                className="rounded-lg border px-2 py-2 text-sm outline-none"
              >
                <option value="ad">ad</option>
                <option value="m">m</option>
                <option value="tk">tk</option>
                <option value="kg">kg</option>
              </select>
              <button onClick={handleAddRow} disabled={!newName.trim()} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
                <Plus className="h-4 w-4" />
              </button>
              <button onClick={() => setShowAddForm(false)} className="rounded-lg border px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">
                Iptal
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-3 text-sm text-slate-400 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Malzeme Ekle
        </button>
      )}

      {/* Alt bar — ozet + onayla */}
      <div className="mt-4 flex items-center justify-between rounded-xl border bg-card px-5 py-3">
        <div className="text-sm">
          <span className="font-semibold">{activeRows.length}</span>
          <span className="text-slate-500 ml-1">kalem</span>
          {modifiedCount > 0 && (
            <span className="ml-2 text-xs text-blue-600">({modifiedCount} duzeltme)</span>
          )}
        </div>
        <button
          onClick={handleApprove}
          disabled={saving || activeRows.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Kaydediliyor...' : (
            <><Check className="h-4 w-4" /> Onayla — Fiyatlandirmaya Gec</>
          )}
        </button>
      </div>
    </div>
  );
}
