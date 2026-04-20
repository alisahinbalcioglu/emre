'use client';

import React, { useState, useMemo } from 'react';
import { Check, Download, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import MetrajEditor from './MetrajEditor';
import type { MetrajResult, LayerMetraj } from './MetrajTable';
import { exportMetrajToExcel, type MetrajSheet } from '@/lib/metraj-excel';

interface MetrajRow {
  id: string;
  name: string;
  qty: string;
  unit: string;
  diameter: string;
  source: string;
  category: string;
  hatTipi?: string;
  materialType?: string;
  original?: { name: string; qty: number };
  deleted?: boolean;
}

interface MetrajTabsProps {
  data: MetrajResult;
  fileName: string;
  /** Tüm sekmeler onaylandıktan sonra çağrılır — fiyatlandırmaya geçiş */
  onAllApproved: (rows: MetrajRow[]) => void;
}

type ApprovalStatus = 'pending' | 'approved';

/**
 * Layer key üretimi: hat_tipi varsa onu, yoksa layer adını kullan.
 * Tek bir DXF katmanı birden fazla hat_tipi üretebilir (nadir), bu yüzden
 * (layer + hat_tipi) kombinasyonunu benzersiz anahtar yap.
 */
function tabKeyOf(l: LayerMetraj): string {
  return l.hat_tipi ? `${l.layer}::${l.hat_tipi}` : l.layer;
}

function tabLabelOf(l: LayerMetraj): string {
  return l.hat_tipi || l.layer;
}

export default function MetrajTabs({ data, fileName, onAllApproved }: MetrajTabsProps) {
  // layers[] boş olabilir → erken dön
  const layers = data.layers || [];

  // Her layer için bir tab key
  const tabKeys = useMemo(() => layers.map(tabKeyOf), [layers]);

  const [activeTab, setActiveTab] = useState<string>(() => tabKeys[0] || '');
  const [approval, setApproval] = useState<Record<string, ApprovalStatus>>({});
  const [tabRows, setTabRows] = useState<Record<string, MetrajRow[]>>({});

  // Tek bir layer varsa sekme göstermeden direkt MetrajEditor
  const singleLayer = layers.length === 1;

  if (layers.length === 0) {
    return (
      <div className="rounded-xl border bg-card px-5 py-8 text-center text-sm text-slate-500">
        Hiçbir hat/layer bulunamadı.
      </div>
    );
  }

  // Aktif tab verisini süz
  const activeLayer = layers.find((l) => tabKeyOf(l) === activeTab) || layers[0];
  const activeLabel = tabLabelOf(activeLayer);
  const materialType =
    activeLayer.segments?.find((s) => s.material_type)?.material_type || '';

  // Aktif tab için MetrajResult subset
  const activeData: MetrajResult = {
    ...data,
    layers: [activeLayer],
    total_length: activeLayer.length,
    total_layers: 1,
  };

  const handleRowsChange = (key: string) => (rows: MetrajRow[]) => {
    setTabRows((prev) => ({ ...prev, [key]: rows }));
  };

  const handleApproveTab = (key: string) => {
    setApproval((prev) => ({ ...prev, [key]: 'approved' }));
    toast({
      title: 'Hat onaylandı',
      description: `${tabLabelOf(layers.find((l) => tabKeyOf(l) === key)!)}`,
    });
  };

  const approvedCount = Object.values(approval).filter((s) => s === 'approved').length;
  const allApproved = approvedCount === layers.length;

  const handleExportAll = async () => {
    try {
      const sheets: MetrajSheet[] = [];
      for (const l of layers) {
        const key = tabKeyOf(l);
        const rows = tabRows[key] || [];
        const activeRows = rows.filter((r) => !r.deleted);
        if (activeRows.length === 0) continue;

        const mat =
          l.segments?.find((s) => s.material_type)?.material_type || '';
        sheets.push({
          sheetName: tabLabelOf(l),
          materialType: mat,
          rows: activeRows.map((r) => ({
            name: r.name,
            qty: r.qty,
            unit: r.unit,
            diameter: r.diameter,
            materialType: r.materialType,
          })),
          totalLength: activeRows
            .filter((r) => r.unit === 'm')
            .reduce((sum, r) => sum + (parseFloat(r.qty) || 0), 0),
        });
      }

      if (sheets.length === 0) {
        toast({
          title: 'Veri yok',
          description: 'Excel için veri bulunamadı',
          variant: 'destructive',
        });
        return;
      }

      const result = await exportMetrajToExcel(sheets, fileName);
      if (result.success) {
        toast({
          title: 'Excel indirildi',
          description: `${result.sheetCount} sayfa, ${result.totalItems} kalem`,
        });
      }

      // Tüm onaylı ise pricing akışına gönder
      if (allApproved) {
        const allRows: MetrajRow[] = [];
        for (const l of layers) {
          const rows = tabRows[tabKeyOf(l)] || [];
          allRows.push(...rows.filter((r) => !r.deleted));
        }
        onAllApproved(allRows);
      }
    } catch (e) {
      toast({
        title: 'Hata',
        description: 'Excel oluşturulamadı',
        variant: 'destructive',
      });
    }
  };

  // Tek layer: sekme gösterme
  if (singleLayer) {
    const key = tabKeyOf(layers[0]);
    return (
      <div>
        {materialType && (
          <h2 className="mb-3 text-lg font-semibold text-slate-700">
            {materialType} Metrajı
          </h2>
        )}
        <MetrajEditor
          key={key}
          data={activeData}
          fileName={fileName}
          onApprove={onAllApproved}
          onRowsChange={handleRowsChange(key)}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {layers.map((l) => {
          const key = tabKeyOf(l);
          const isActive = key === activeTab;
          const isApproved = approval[key] === 'approved';
          const label = tabLabelOf(l);
          const mat =
            l.segments?.find((s) => s.material_type)?.material_type || '';

          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50',
              )}
            >
              <span>{label}</span>
              {mat && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-600">
                  {mat}
                </span>
              )}
              {isApproved && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              )}
            </button>
          );
        })}
      </div>

      {/* Aktif tab başlığı */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-700">
          {materialType ? `${materialType} Metrajı` : `${activeLabel} Metrajı`}
        </h2>
        <span className="text-xs text-slate-500">
          {approvedCount} / {layers.length} onaylı
        </span>
      </div>

      {/* Aktif tab editörü */}
      <MetrajEditor
        key={activeTab}
        data={activeData}
        fileName={fileName}
        onApprove={() => handleApproveTab(activeTab)}
        hideFooterActions
        onRowsChange={handleRowsChange(activeTab)}
      />

      {/* Alt bar: per-tab approve + global export */}
      <div className="mt-4 flex items-center justify-between rounded-xl border bg-card px-5 py-3">
        <div className="text-sm">
          <span className="font-semibold">{approvedCount}</span>
          <span className="text-slate-500 ml-1">hat onaylı</span>
          <span className="text-slate-300 mx-1.5">·</span>
          <span className="font-semibold">{layers.length}</span>
          <span className="text-slate-500 ml-1">toplam</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleApproveTab(activeTab)}
            disabled={approval[activeTab] === 'approved'}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              approval[activeTab] === 'approved'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 cursor-default'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50',
            )}
          >
            {approval[activeTab] === 'approved' ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Onaylandı
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Bu Hattı Onayla
              </>
            )}
          </button>
          <button
            onClick={handleExportAll}
            disabled={!allApproved}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors',
              allApproved
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-slate-300 cursor-not-allowed',
            )}
            title={!allApproved ? 'Önce tüm hatları onaylayın' : 'Excel indir ve fiyatlandırmaya geç'}
          >
            <Download className="h-4 w-4" />
            Tümünü Onayla ve Excel'e Aktar
          </button>
        </div>
      </div>
    </div>
  );
}
