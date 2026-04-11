'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface PipeSegment {
  segment_id: number;
  layer: string;
  diameter: string;
  length: number;
  line_count: number;
}

export interface LayerMetraj {
  layer: string;
  length: number;
  line_count: number;
  hat_tipi?: string;
  segments?: PipeSegment[];
}

export interface MetrajResult {
  layers: LayerMetraj[];
  total_length: number;
  total_layers: number;
  warnings: string[];
}

interface MetrajTableProps {
  data: MetrajResult;
  onApprove?: (data: MetrajResult) => void;
}

export default function MetrajTable({ data, onApprove }: MetrajTableProps) {
  return (
    <div className="flex flex-col h-full">
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

      {/* Layer Tablosu */}
      <div className="flex-1 overflow-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 w-8">#</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Layer Adi</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 w-28">Uzunluk (m)</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 w-24">Cizgi Sayisi</th>
            </tr>
          </thead>
          <tbody>
            {data.layers.map((layer, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                <td className="px-4 py-2 text-xs text-slate-400">{i + 1}</td>
                <td className="px-4 py-2 text-[13px] font-medium">{layer.layer}</td>
                <td className="px-4 py-2 text-right text-[13px] font-medium tabular-nums">{layer.length.toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-xs text-slate-500">{layer.line_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alt Ozet + Onayla */}
      <div className="mt-4 flex items-center justify-between rounded-xl border bg-card px-5 py-3">
        <div className="text-sm">
          <span className="font-semibold">{data.total_layers}</span>
          <span className="text-slate-500 ml-1">layer,</span>
          <span className="font-semibold ml-2">{data.total_length.toFixed(2)}</span>
          <span className="text-slate-500 ml-1">metre toplam</span>
        </div>
        {onApprove && (
          <button
            onClick={() => onApprove(data)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Onayla → Duzenlemeye Gec
          </button>
        )}
      </div>
    </div>
  );
}
