import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { usePlanoCursoDocumento } from '../../../../../../shared/plano-curso/plano-curso.hooks';
import PlanoCursoPdfPreview from '../../../../../../shared/plano-curso/PlanoCursoPdfPreview';
import type { PlanoCursoGestaoStatus } from '../../../../../../shared/plano-curso/plano-curso.types';

interface PlanoCursoPreviewState {
  planoId: string;
  revisao: number;
  templateRevision: number;
  documentoFingerprint: string;
}

export const useTurmaGradePlanoCursoPreview = (
  planosCurso: Record<string, PlanoCursoGestaoStatus>,
) => {
  const [planoCursoPreview, setPlanoCursoPreview] = useState<PlanoCursoPreviewState | null>(null);
  const planoCursoDialogRef = useRef<HTMLDivElement>(null);
  const planoCursoDocumentQuery = usePlanoCursoDocumento(
    planoCursoPreview?.planoId || '',
    planoCursoPreview?.revisao || 0,
    planoCursoPreview?.templateRevision ?? null,
    planoCursoPreview?.documentoFingerprint || '',
  );
  const isPlanoCursoPreparationOpen = Boolean(
    planoCursoPreview && !planoCursoDocumentQuery.data,
  );
  const openPlanoCurso = useCallback((disciplinaId: string) => {
    const plano = planosCurso[disciplinaId];
    if (
      !plano?.planoId
      || plano.status !== 'CONCLUIDO'
      || plano.templateRevision === null
      || !plano.documentoFingerprint
    ) return;
    setPlanoCursoPreview({
      planoId: plano.planoId,
      revisao: plano.revisao,
      templateRevision: plano.templateRevision,
      documentoFingerprint: plano.documentoFingerprint,
    });
  }, [planosCurso]);

  useEffect(() => {
    if (!isPlanoCursoPreparationOpen) return undefined;
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      const initial = planoCursoDialogRef.current?.querySelector<HTMLElement>('[data-plano-initial-focus]');
      (initial || planoCursoDialogRef.current)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPlanoCursoPreview(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(planoCursoDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])];
      if (focusable.length === 0) {
        event.preventDefault();
        planoCursoDialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [isPlanoCursoPreparationOpen]);

  return { openPlanoCurso, preview: <>
      {isPlanoCursoPreparationOpen ? (
        <div ref={planoCursoDialogRef} tabIndex={-1} className="fixed inset-0 z-[2147482999] flex items-center justify-center bg-slate-950/80 p-4 outline-none" role="dialog" aria-modal="true" aria-busy={planoCursoDocumentQuery.isLoading} aria-label={planoCursoDocumentQuery.isError ? 'Plano de Curso indisponível' : 'Preparando Plano de Curso'}>
          {planoCursoDocumentQuery.isError ? (
            <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
              <AlertTriangle size={32} className="mx-auto text-amber-500" />
              <h4 className="mt-3 text-sm font-black uppercase tracking-wide text-[#001a33]">Prévia indisponível</h4>
              <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500">O servidor não retornou um Plano de Curso canônico pronto para visualização.</p>
              <div className="mt-5 flex justify-center gap-2">
                <button type="button" data-plano-initial-focus onClick={() => { void planoCursoDocumentQuery.refetch(); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-700">Tentar novamente</button>
                <button type="button" onClick={() => setPlanoCursoPreview(null)} className="rounded-xl bg-[#001a33] px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-white">Fechar</button>
              </div>
            </div>
          ) : (
          <div className="relative rounded-3xl border border-white/10 bg-slate-900 px-10 py-9 text-center text-white shadow-2xl">
            <button type="button" data-plano-initial-focus onClick={() => setPlanoCursoPreview(null)} aria-label="Cancelar prévia" className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X size={16} /></button>
            <Loader2 size={34} className="mx-auto animate-spin text-emerald-300" />
            <p className="mt-4 text-xs font-black uppercase tracking-wider">Preparando PDF vetorial...</p>
          </div>
          )}
        </div>
      ) : null}
      {planoCursoPreview && planoCursoDocumentQuery.data ? (
        <PlanoCursoPdfPreview payload={planoCursoDocumentQuery.data} onClose={() => setPlanoCursoPreview(null)} />
      ) : null}
  </> };
};
