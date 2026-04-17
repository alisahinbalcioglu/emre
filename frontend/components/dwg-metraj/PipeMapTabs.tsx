'use client';

import React, { useState, useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import PipeMapViewer, { type EdgeSegment, type BranchPoint } from './PipeMapViewer';

interface PipeMapTabsProps {
  segments: EdgeSegment[];
  branchPoints: BranchPoint[];
  backgroundLines?: number[][];
  /** Seçilen layer isimleri — tab oluşturmak için */
  layerNames: string[];
  /** Tüm layer'lar onaylandığında çağrılır, düzeltilmiş segments birleşik döner */
  onAllApproved: (correctedSegments: EdgeSegment[]) => void;
  onBack: () => void;
}

/**
 * Çoklu layer için sekme yapısı.
 * Her layer ayrı bir tab'da kendi PipeMapViewer'ını gösterir.
 * Her tab kendi segments subset'ini alır ve ayrı onaylanır.
 */
export default function PipeMapTabs({
  segments,
  branchPoints,
  backgroundLines,
  layerNames,
  onAllApproved,
  onBack,
}: PipeMapTabsProps) {
  // layerNames'e göre sekmeler
  const tabs = useMemo(
    () => layerNames.filter((n) => n && n.trim().length > 0),
    [layerNames],
  );

  const [activeTab, setActiveTab] = useState<string>(tabs[0] ?? '');
  const [approvedTabs, setApprovedTabs] = useState<Record<string, EdgeSegment[]>>({});

  // Aktif tab'in segments'leri (sadece o layer)
  const activeSegments = useMemo(
    () => segments.filter((s) => s.layer === activeTab),
    [segments, activeTab],
  );

  const handleTabApprove = (corrected: EdgeSegment[]) => {
    setApprovedTabs((prev) => ({ ...prev, [activeTab]: corrected }));
  };

  const approvedCount = Object.keys(approvedTabs).length;
  const allApproved = approvedCount === tabs.length && tabs.length > 0;

  const handleFinalApprove = () => {
    // Tüm onaylanmış layer segments'lerini birleştir
    const all: EdgeSegment[] = [];
    for (const tab of tabs) {
      const corrected = approvedTabs[tab];
      if (corrected) {
        all.push(...corrected);
      } else {
        // Onaylanmamış layer — orijinal segments kullan
        all.push(...segments.filter((s) => s.layer === tab));
      }
    }
    onAllApproved(all);
  };

  if (tabs.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-5 py-8 text-center text-sm text-slate-500">
        Hiçbir layer bulunamadı.
      </div>
    );
  }

  // Tek layer ise sekme gösterme
  if (tabs.length === 1) {
    return (
      <PipeMapViewer
        segments={activeSegments}
        branchPoints={branchPoints}
        backgroundLines={backgroundLines}
        layerName={tabs[0]}
        onApprove={(corrected) => {
          handleTabApprove(corrected);
          onAllApproved(corrected);
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {tabs.map((name) => {
          const isActive = name === activeTab;
          const isApproved = approvedTabs[name] !== undefined;
          const layerSegCount = segments.filter((s) => s.layer === name).length;
          const unmatched = segments.filter((s) => s.layer === name && (s.diameter === '' || s.diameter === 'Belirtilmemis')).length;

          return (
            <button
              key={name}
              onClick={() => setActiveTab(name)}
              className={cn(
                'inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50',
              )}
              title={`${layerSegCount} segment${unmatched > 0 ? `, ${unmatched} belirtilmemis` : ''}`}
            >
              <span>{name}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-600">
                {layerSegCount}
              </span>
              {unmatched > 0 && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  {unmatched} boş
                </span>
              )}
              {isApproved && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              )}
            </button>
          );
        })}
      </div>

      {/* Üst bar: onay durumu + final buton */}
      <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2">
        <div className="text-xs text-slate-600">
          <span className="font-semibold">{approvedCount}</span>
          <span className="text-slate-400 mx-1">/</span>
          <span>{tabs.length}</span>
          <span className="ml-1">hat onaylı</span>
        </div>
        <button
          onClick={handleFinalApprove}
          disabled={!allApproved}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-colors',
            allApproved
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-slate-300 cursor-not-allowed',
          )}
          title={!allApproved ? 'Önce tüm hatları onaylayın' : 'Metraj listesine geç'}
        >
          Tümünü Onayla — Metraj Listesine Geç
        </button>
      </div>

      {/* Aktif tab — PipeMapViewer */}
      <PipeMapViewer
        key={activeTab}
        segments={activeSegments}
        branchPoints={branchPoints}
        backgroundLines={backgroundLines}
        layerName={activeTab}
        onApprove={handleTabApprove}
        onBack={onBack}
      />
    </div>
  );
}
