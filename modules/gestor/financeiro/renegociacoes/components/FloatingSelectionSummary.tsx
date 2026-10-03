import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RenegociacaoCandidateGroup } from '../renegociacoes.types';
import SelectionFinancialSummary from './SelectionFinancialSummary';

interface FloatingSelectionSummaryProps {
  group: RenegociacaoCandidateGroup;
  selectedIds: string[];
  asOf?: string | null;
  canContinue: boolean;
  onContinue: () => void;
  onClear: () => void;
}

const FloatingSelectionSummary: React.FC<FloatingSelectionSummaryProps> = ({
  group, selectedIds, asOf, canContinue, onContinue, onClear,
}) => {
  const anchorRef = useRef<globalThis.HTMLDivElement>(null);
  const panelRef = useRef<globalThis.HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ left: 8, width: 0, height: 0 });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const width = Math.min(960, rect.width || viewportWidth - 16, viewportWidth - 16);
      const left = Math.max(8, Math.min(rect.right - width, viewportWidth - width - 8));
      const height = panel.getBoundingClientRect().height;
      setPlacement((previous) => previous.left === left && previous.width === width && previous.height === height
        ? previous : { left, width, height });
    };
    const scheduleMeasure = () => {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    };
    const observer = typeof window.ResizeObserver !== 'undefined' ? new window.ResizeObserver(scheduleMeasure) : null;
    observer?.observe(anchor);
    observer?.observe(panel);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    measure();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <>
    <div ref={anchorRef} aria-hidden="true" style={{ height: placement.height + 24 }} />
    {createPortal(
      <div
        ref={panelRef}
        role="region"
        aria-label="Resumo flutuante da seleção"
        className="fixed z-20 overflow-y-auto overscroll-contain rounded-2xl border border-blue-200 bg-white p-3 shadow-[0_8px_40px_rgba(0,26,51,0.22)] sm:p-4"
        style={{ left: placement.left, width: placement.width || 'calc(100vw - 16px)',
          bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', maxHeight: 'min(50dvh, 420px)' }}
      >
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">
              {selectedIds.length} {selectedIds.length === 1 ? 'parcela selecionada' : 'parcelas selecionadas'}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500" title={`${group.alunoNome} · ${group.turmaNome}`}>
              {group.alunoNome} · {group.turmaNome}
            </p>
          </div>
          <button type="button" onClick={onClear}
            className="min-h-10 rounded-xl px-3 text-xs font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            Limpar seleção
          </button>
          <button type="button" onClick={onContinue} disabled={!canContinue}
            className="min-h-10 rounded-xl bg-blue-700 px-4 text-xs font-black uppercase text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            Continuar com {selectedIds.length}
          </button>
        </header>
        <SelectionFinancialSummary group={group} selectedIds={selectedIds} asOf={asOf} compact />
      </div>, document.body,
    )}
  </>;
};

export default FloatingSelectionSummary;
