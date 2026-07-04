'use client';

/**
 * BucketPanel — Manuel Etiketleme "Çap Kalemleri" paneli.
 *
 * Akis:
 *   1. Kullanici cap yazar (Ø50, DN100, 2", 1 1/4"...) → "Ekle"
 *   2. Kalem chip'i olusur (renk = diameterToColor, lejantla birebir)
 *   3. Chip'e tikla → AKTIF kalem (ring vurgusu). Cizimde boruya tikla → atanir.
 *   4. "Boş segmentlere uygula" → seçili/tüm bekleyen layer'ların çapsız
 *      borularına aktif kalemi toplu basar (eski backend layer-default
 *      fallback'inin kullanıcı-tetikli karşılığı).
 */

import React, { useState } from 'react';
import { Tag, Plus, X, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useTaggingStore, useActiveBucket } from './useTaggingStore';

interface BucketPanelProps {
  /** Bekleyen (onaysiz) layer'lardaki çapsız segment sayısı — rozet + uygula butonu. */
  unassignedCount: number;
  /** Aktif kalemin capini çapsız segmentlere toplu uygular (workspace callback'i). */
  onApplyToUnassigned: (diameter: string) => void;
}

export default function BucketPanel({ unassignedCount, onApplyToUnassigned }: BucketPanelProps) {
  const buckets = useTaggingStore((s) => s.buckets);
  const addBucket = useTaggingStore((s) => s.addBucket);
  const removeBucket = useTaggingStore((s) => s.removeBucket);
  const toggleActiveBucket = useTaggingStore((s) => s.toggleActiveBucket);
  const activeBucket = useActiveBucket();

  const [input, setInput] = useState('');

  const handleAdd = () => {
    const r = addBucket(input);
    if (!r.ok) {
      toast({ title: 'Kalem eklenemedi', description: r.reason, variant: 'destructive' });
      return;
    }
    setInput('');
  };

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Tag className="h-3.5 w-3.5 text-blue-600" />
          Çap Kalemleri (Etiketleme)
        </h4>
        {unassignedCount > 0 && (
          <span
            className="rounded-full bg-lime-100 px-2 py-0.5 text-[10px] font-bold text-lime-700 ring-1 ring-lime-400"
            title="Çapı atanmamış boru segmenti sayısı — çizimde neon yeşil"
          >
            {unassignedCount} çapsız
          </span>
        )}
      </div>

      {/* Cap girisi */}
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder={'Ø50 · DN100 · 2" · 1 1/4"'}
          className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-blue-400"
        />
        <button
          onClick={handleAdd}
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" /> Ekle
        </button>
      </div>

      {/* Kalem chip'leri */}
      {buckets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {buckets.map((b) => {
            const active = activeBucket?.id === b.id;
            return (
              <button
                key={b.id}
                onClick={() => toggleActiveBucket(b.id)}
                className={cn(
                  'group flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-all',
                  active
                    ? 'border-transparent text-white shadow-md ring-2 ring-offset-1'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300',
                )}
                style={active ? { backgroundColor: b.color, ['--tw-ring-color' as any]: b.color } : undefined}
                title={active ? 'Aktif kalem — kapatmak için tekrar tıkla' : 'Aktifleştir'}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full border border-white/60"
                  style={{ backgroundColor: b.color }}
                />
                {b.diameter}
                <X
                  className={cn('h-3 w-3 opacity-40 hover:opacity-100', active && 'opacity-70')}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBucket(b.id);
                  }}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Durum + toplu uygula */}
      {activeBucket ? (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-slate-600">
            Aktif kalem: <strong style={{ color: activeBucket.color }}>{activeBucket.diameter}</strong>{' '}
            — çizimde boruya tıkla, çap atansın.
          </p>
          {unassignedCount > 0 && (
            <button
              onClick={() => onApplyToUnassigned(activeBucket.diameter)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-lime-300 bg-lime-50 px-2 py-1.5 text-[11px] font-medium text-lime-800 hover:bg-lime-100"
              title="Neon (çapsız) segmentlerin tümüne aktif kalemi uygula"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {unassignedCount} boş segmente {activeBucket.diameter} uygula
            </button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-400">
          {buckets.length === 0
            ? 'Önce bir çap kalemi ekle (örn. Ø50). Sonra kalemi seçip borulara tıkla.'
            : 'Kalem seç → çizimde boruya tıkla. Kalem seçili değilken tıklama popup açar.'}
        </p>
      )}
    </div>
  );
}
