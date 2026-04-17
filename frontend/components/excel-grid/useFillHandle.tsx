'use client';

import { useCallback, useRef, useEffect } from 'react';
import type { AgGridReact } from 'ag-grid-react';
import type { IRowNode } from 'ag-grid-community';

/**
 * Custom fill handle hook — AG-Grid Community Edition icin
 * Alt kenar cizgisi yaklasimi: hucrenin alt ~6px alanina
 * mousedown yapildiginda surukle-doldur baslar.
 */

export interface FillHandleResult {
  field: string;
  value: any;
  sourceRowIndex: number;
  targetRowNodes: IRowNode[];
}

interface UseFillHandleOptions {
  gridRef: React.RefObject<AgGridReact | null>;
  fillableFields: Set<string>;
  onFillComplete: (result: FillHandleResult) => void;
  enabled?: boolean;
}

const BOTTOM_ZONE_PX = 8; // alt kenardan kac px icinde mousedown tetiklenir

export function useFillHandle({
  gridRef,
  fillableFields,
  onFillComplete,
  enabled = true,
}: UseFillHandleOptions) {
  const isDragging = useRef(false);
  const sourceField = useRef<string | null>(null);
  const sourceValue = useRef<any>(null);
  const sourceRowIdx = useRef<number>(-1);
  const highlightedCells = useRef<HTMLElement[]>([]);
  const lastTargetRowIdx = useRef<number>(-1);
  const sourceCellEl = useRef<HTMLElement | null>(null);

  const clearHighlights = useCallback(() => {
    for (const el of highlightedCells.current) {
      el.classList.remove('fill-handle-highlight');
    }
    highlightedCells.current = [];
    if (sourceCellEl.current) {
      sourceCellEl.current.classList.remove('fill-handle-source');
      sourceCellEl.current = null;
    }
    document.body.classList.remove('fill-handle-dragging');
  }, []);

  const getCellElement = useCallback((rowIdx: number, colId: string): HTMLElement | null => {
    const rowEl = document.querySelector(`[row-index="${rowIdx}"]`);
    if (!rowEl) return null;
    return rowEl.querySelector(`[col-id="${colId}"]`) as HTMLElement;
  }, []);

  const getTargetNodes = useCallback((startIdx: number, endIdx: number): IRowNode[] => {
    const api = gridRef.current?.api;
    if (!api) return [];
    const nodes: IRowNode[] = [];
    const [from, to] = startIdx < endIdx ? [startIdx + 1, endIdx] : [endIdx, startIdx - 1];
    for (let i = from; i <= to; i++) {
      const node = api.getDisplayedRowAtIndex(i);
      if (!node) continue;
      if (!node.data?._isDataRow) continue;
      if (node.rowPinned) continue;
      nodes.push(node);
    }
    return nodes;
  }, [gridRef]);

  // mousedown — hucrenin alt kenar bolgesinde (.fill-handle-cell icinde)
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!enabled) return;

    // En yakin .fill-handle-cell'i bul
    const target = e.target as HTMLElement;
    const cell = target.closest('.fill-handle-cell') as HTMLElement | null;
    if (!cell) return;

    // Alt kenar kontrolu — hucrenin alt BOTTOM_ZONE_PX'i icinde mi?
    const rect = cell.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    if (relativeY < rect.height - BOTTOM_ZONE_PX) return; // alt kenar degil

    // AG-Grid hucresini bul — col-id ve row-index
    const agCell = cell.closest('.ag-cell') as HTMLElement | null;
    if (!agCell) return;
    const colId = agCell.getAttribute('col-id');
    if (!colId || !fillableFields.has(colId)) return;

    const agRow = agCell.closest('.ag-row') as HTMLElement | null;
    if (!agRow) return;
    const rowIdx = parseInt(agRow.getAttribute('row-index') ?? '', 10);
    if (isNaN(rowIdx)) return;

    // Kaynak hucre degerini oku
    const api = gridRef.current?.api;
    if (!api) return;
    const rowNode = api.getDisplayedRowAtIndex(rowIdx);
    if (!rowNode?.data) return;
    const value = rowNode.data[colId];

    e.preventDefault();
    e.stopPropagation();

    isDragging.current = true;
    sourceField.current = colId;
    sourceValue.current = value;
    sourceRowIdx.current = rowIdx;
    lastTargetRowIdx.current = rowIdx;

    // Kaynak hucreye class ekle
    sourceCellEl.current = cell;
    cell.classList.add('fill-handle-source');

    document.body.classList.add('fill-handle-dragging');
  }, [enabled, fillableFields, gridRef]);

  // mousemove — hedef satirlari highlight
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !sourceField.current) return;

    const gridEl = document.querySelector('.ag-body-viewport');
    if (!gridEl) return;
    const gridRect = gridEl.getBoundingClientRect();
    const relativeY = e.clientY - gridRect.top + gridEl.scrollTop;
    const rowHeight = 28;
    const approxRowIdx = Math.floor(relativeY / rowHeight);

    if (approxRowIdx === lastTargetRowIdx.current) return;
    lastTargetRowIdx.current = approxRowIdx;

    // Onceki highlight'lari temizle
    for (const el of highlightedCells.current) {
      el.classList.remove('fill-handle-highlight');
    }
    highlightedCells.current = [];

    // Yeni hedef hucreleri highlight
    const targetNodes = getTargetNodes(sourceRowIdx.current, approxRowIdx);
    for (const node of targetNodes) {
      const displayIdx = node.rowIndex;
      if (displayIdx == null) continue;
      const cellEl = getCellElement(displayIdx, sourceField.current!);
      if (cellEl) {
        cellEl.classList.add('fill-handle-highlight');
        highlightedCells.current.push(cellEl);
      }
    }
  }, [getTargetNodes, getCellElement]);

  // mouseup — doldurmayi uygula
  const handleMouseUp = useCallback(() => {
    if (!isDragging.current || !sourceField.current) {
      isDragging.current = false;
      clearHighlights();
      return;
    }

    const targetNodes = getTargetNodes(sourceRowIdx.current, lastTargetRowIdx.current);

    if (targetNodes.length > 0) {
      onFillComplete({
        field: sourceField.current,
        value: sourceValue.current,
        sourceRowIndex: sourceRowIdx.current,
        targetRowNodes: targetNodes,
      });
    }

    isDragging.current = false;
    sourceField.current = null;
    sourceValue.current = null;
    sourceRowIdx.current = -1;
    lastTargetRowIdx.current = -1;
    clearHighlights();
  }, [getTargetNodes, onFillComplete, clearHighlights]);

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      clearHighlights();
    };
  }, [enabled, handleMouseDown, handleMouseMove, handleMouseUp, clearHighlights]);
}

/**
 * FillHandleIndicator artik kullanilmiyor — backward compat icin bos div.
 * fill-handle-cell class'i uzerinden CSS ::after ile alt cizgi gorunur.
 */
export function FillHandleIndicator(_props: {
  field: string;
  value: any;
  rowIdx: number;
}) {
  return null;
}
