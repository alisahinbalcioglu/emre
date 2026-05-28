'use client';

/**
 * Hesaplanmis layer'lar + isaretlenmis ekipmanlarin ozet panel'i.
 * Her layer item'inda inline "Onayla" butonu: layer'i tek tek onaylamak icin.
 * "Tumunu Onayla & Fiyatlandirmaya Gec" header'a tasindi (DwgProjectWorkspace).
 */

import React from 'react';
import { Ruler, Wrench, Trash2, Check } from 'lucide-react';
import type { CalculatedLayer, MarkedEquipment } from './types';
import { diameterToColor } from '@/components/dwg-metraj/diameter-colors';
import { isUnassignedDiameter, UNASSIGNED_LABEL } from '@/components/dwg-metraj/constants';

interface MetrajSummaryPanelProps {
  calculatedLayers: Record<string, CalculatedLayer>;
  markedEquipments: Record<string, MarkedEquipment>;
  onRemoveLayer: (layer: string) => void;
  onRemoveEquipment: (key: string) => void;
  onEditEquipment: (key: string) => void;
  /** Tek bir layer'i onayla — Excel'e dahil olur, baska layer'a gecilebilir. */
  onApproveLayer: (layer: string) => void;
  /** Layer kartina tikla -> o layer'i sec (revize). Onayli ise onay
   *  otomatik kalkar, cap renkleri geri gelir. */
  onSelectLayerCard: (layer: string) => void;
}

export default function MetrajSummaryPanel({
  calculatedLayers,
  markedEquipments,
  onRemoveLayer,
  onRemoveEquipment,
  onEditEquipment,
  onApproveLayer,
  onSelectLayerCard,
}: MetrajSummaryPanelProps) {
  const layerList = Object.values(calculatedLayers).sort((a, b) => a.computedAt - b.computedAt);
  const equipmentList = Object.values(markedEquipments);

  // Ekipmanlari userLabel'a gore grupla (adet say)
  const equipmentGroups = equipmentList.reduce<Record<string, { label: string; unit: string; count: number; keys: string[] }>>((acc, eq) => {
    const groupKey = `${eq.userLabel}__${eq.unit}`;
    if (!acc[groupKey]) acc[groupKey] = { label: eq.userLabel, unit: eq.unit, count: 0, keys: [] };
    acc[groupKey].count += 1;
    acc[groupKey].keys.push(eq.key);
    return acc;
  }, {});

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex items-center gap-1.5 border-b px-3 py-2 bg-slate-50">
        <Ruler className="h-3.5 w-3.5 text-slate-500" />
        <h4 className="text-xs font-semibold text-slate-700">Hesaplanmış Metraj</h4>
      </div>

      <div className="max-h-[50vh] overflow-y-auto">
        {layerList.length === 0 && equipmentList.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Henüz hesaplama yapılmadı.
          </p>
        )}

        {/* BORU LAYER'LARI */}
        {layerList.map((cl) => {
          // Cap dagilimi — atanmamis cap'lar tek 'Capi Belirlenemeyenler' grubuna toplanir
          // (backend "" veya "Belirtilmemis" sentinel'lerini ayni grubu yansitir).
          const capTotals: Record<string, number> = {};
          for (const es of cl.edgeSegments) {
            const k = isUnassignedDiameter(es.diameter) ? UNASSIGNED_LABEL : es.diameter;
            capTotals[k] = (capTotals[k] ?? 0) + es.length;
          }
          return (
            <div
              key={cl.layer}
              className="border-b last:border-0 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => onSelectLayerCard(cl.layer)}
              title={cl.approved ? 'Tıkla → bu layer\'a geri dön (onay kalkar, revize edebilirsin)' : 'Tıkla → bu layer\'ı aktif yap'}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-800">{cl.hatIsmi || cl.layer}</p>
                  {cl.materialType && (
                    <p className="text-[10px] text-slate-500">{cl.materialType}</p>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveLayer(cl.layer); }}
                  className="shrink-0 text-slate-300 hover:text-red-500"
                  title="Kaldır"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-0.5">
                {Object.entries(capTotals)
                  .sort((a, b) => b[1] - a[1])
                  .map(([dia, len]) => {
                    const color = diameterToColor(dia === UNASSIGNED_LABEL ? '' : dia);
                    return (
                      <div key={dia} className="flex items-center justify-between text-[11px] gap-2">
                        <span className="flex items-center gap-1.5 min-w-0 flex-1 font-mono text-slate-600">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-slate-200"
                            style={{ backgroundColor: color }}
                            aria-hidden
                          />
                          <span className="truncate">{dia}</span>
                        </span>
                        <span className="tabular-nums text-slate-800">{len.toFixed(2)} m</span>
                      </div>
                    );
                  })}
              </div>
              <div className="mt-1 border-t pt-1 flex items-center justify-between text-[11px] font-medium">
                <span className="text-slate-500">Toplam</span>
                <span className="tabular-nums text-slate-900">{cl.totalLength.toFixed(2)} m</span>
              </div>
              {/* Inline ONAYLA butonu — her layer kendi onayini alir */}
              <button
                onClick={(e) => { e.stopPropagation(); onApproveLayer(cl.layer); }}
                disabled={cl.approved}
                className={[
                  'mt-2 w-full rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5',
                  cl.approved
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                ].join(' ')}
              >
                {cl.approved ? (
                  <>
                    <Check className="h-3 w-3" />
                    Onayli
                  </>
                ) : (
                  'Onayla'
                )}
              </button>
            </div>
          );
        })}

        {/* EKIPMANLAR */}
        {equipmentList.length > 0 && (
          <div className="border-t bg-orange-50/30">
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
              <Wrench className="h-3 w-3 text-orange-600" />
              <span className="text-[10px] font-semibold text-orange-800 uppercase tracking-wide">Ekipmanlar</span>
            </div>
            {Object.values(equipmentGroups).map((group) => (
              <div key={`${group.label}-${group.unit}`} className="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-orange-50/50 cursor-pointer"
                   onClick={() => onEditEquipment(group.keys[0])}>
                <p className="min-w-0 flex-1 truncate text-[12px] text-slate-800">{group.label}</p>
                <span className="tabular-nums text-[11px] font-medium text-slate-600">
                  {group.count} {group.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
