import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Printer, RefreshCw, ScrollText, X } from 'lucide-react';
import type { SecretariaAcademicResult } from './academic-results.service';
import type { SecretariaAcademicModule } from './academic-results.modules';
import useMediaQuery from '../hooks/useMediaQuery';

interface AcademicResultsModalProps {
  open: boolean;
  onClose: () => void;
  results: SecretariaAcademicResult[];
  courseName?: string | null;
  classCode?: string | null;
  poloName?: string | null;
  onPrint?: () => void;
  modules?: SecretariaAcademicModule[];
  selectedPeriodId?: string;
  onModuleChange?: (periodId: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

const RESULT_LABELS: Record<string, string> = {
  APROVADO: 'Aprovado',
  APROVADO_DEPENDENCIA: 'Aprovado em dependência',
  APROVEITADO: 'Aproveitado',
  EM_RECUPERACAO: 'Em recuperação',
  REPROVADO: 'Reprovado',
  REPROVADO_FREQUENCIA: 'Reprovado por frequência',
  FREQUENCIA_PENDENTE: 'Frequência pendente',
  SEM_LANCAMENTO: 'Sem lançamento',
};

const formatNumber = (value: number | null, fractionDigits = 1) =>
  value === null ? '—' : value.toFixed(fractionDigits);

const resultClass = (result: string) => {
  if (
    result === 'APROVADO'
    || result === 'APROVADO_DEPENDENCIA'
    || result === 'APROVEITADO'
  ) {
    return 'bg-emerald-100 text-emerald-800';
  }
  if (result === 'EM_RECUPERACAO' || result === 'FREQUENCIA_PENDENTE' || result === 'SEM_LANCAMENTO') {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-rose-100 text-rose-800';
};

const AcademicResultsModal: React.FC<AcademicResultsModalProps> = ({
  open,
  onClose,
  results,
  courseName,
  classCode,
  poloName,
  onPrint,
  modules,
  selectedPeriodId,
  onModuleChange,
  isLoading = false,
  isError = false,
  onRetry,
}) => {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const dialogRef = useRef<React.ElementRef<'section'>>(null);
  const previousFocusRef = useRef<{ focus?: () => void } | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement as unknown as { focus?: () => void };
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector('[data-modal-close]')?.focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll('button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        (last as unknown as { focus: () => void }).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        (first as unknown as { focus: () => void }).focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const selectedModule = modules?.find((module) => module.periodId === selectedPeriodId);
  const emptyMessage = modules === undefined
    ? 'Nenhum resultado acadêmico autoritativo disponível para esta turma.'
    : !modules.length
      ? 'Nenhum módulo foi iniciado para esta turma.'
      : 'Nenhum resultado acadêmico disponível para o módulo selecionado.';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-0 backdrop-blur-sm md:p-4">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="student-bulletin-title" className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl animate-slideUp md:max-h-[85vh] md:rounded-[2.5rem]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-6 md:py-4">
          <div className="flex items-center gap-2">
            <ScrollText className="text-blue-600" size={20} />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600 md:hidden">Vida acadêmica</p>
              <h4 id="student-bulletin-title" className="text-sm font-black uppercase tracking-tight text-[#001a33] md:text-base">Boletim Informativo de Notas</h4>
            </div>
          </div>
          <button data-modal-close type="button" onClick={onClose} aria-label="Fechar boletim" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-rose-500 md:h-auto md:w-auto md:p-2">
            <X className="h-[18px] w-[18px] md:h-4 md:w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-4 custom-scrollbar md:space-y-6 md:bg-white md:p-6">
          <div className={`grid grid-cols-1 gap-4 rounded-2xl border border-slate-150 bg-slate-50 p-4 ${modules ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            {[['Curso', courseName || 'CURSO GERAL'], ['Turma', classCode || 'N/A'], ['Polo Vinculado', poloName || 'Matriz']].map(([label, value]) => (
              <div key={label}>
                <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
                <span className="text-xs font-black uppercase text-slate-800">{value}</span>
              </div>
            ))}
            {modules ? (
              <div>
                <label htmlFor="student-bulletin-module" className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Módulo do boletim
                </label>
                <select
                  id="student-bulletin-module"
                  value={selectedPeriodId || ''}
                  onChange={(event) => onModuleChange?.(event.target.value)}
                  disabled={isLoading || !modules.length}
                  className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-base font-black uppercase text-slate-800 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:text-slate-400 md:min-h-0 md:text-xs"
                >
                  {!modules.length ? <option value="">Nenhum módulo iniciado</option> : null}
                  {modules.map((module) => (
                    <option key={module.periodId} value={module.periodId}>
                      {module.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          {selectedModule ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-blue-700">
              Exibindo somente {selectedModule.name}. Módulos ainda planejados não são liberados no boletim.
            </div>
          ) : null}
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-xs font-bold uppercase tracking-wider text-slate-400">
              <Loader2 className="animate-spin text-blue-600" size={18} />
              Carregando módulo do boletim...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 py-12 text-center">
              <p className="text-xs font-bold text-rose-700">Não foi possível carregar o módulo do boletim.</p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white"
                >
                  <RefreshCw size={13} /> Tentar novamente
                </button>
              ) : null}
            </div>
          ) : isMobile && !results.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center text-xs font-medium leading-relaxed text-slate-400">
              {emptyMessage}
            </div>
          ) : isMobile ? (
            <div className="space-y-3" aria-label="Resultados por disciplina">
              {results.map((result) => {
                const grades = [
                  ['P', result.notaP], ['TI', result.notaTi], ['TG', result.notaTg], ['S', result.notaS],
                  ['CQ', result.notaCq], ['O', result.notaO], ['REC', result.notaRec],
                ] as const;
                return (
                  <article key={result.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Disciplina</p>
                        <h5 className="mt-1 text-sm font-black leading-snug text-[#001a33]">{result.disciplinaNome}</h5>
                      </div>
                      <span className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black uppercase ${resultClass(result.resultadoFinal)}`}>
                        {RESULT_LABELS[result.resultadoFinal] || result.resultadoFinal.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-slate-100">
                      <div className="bg-white px-4 py-3">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Média final</span>
                        <strong className="mt-1 block font-mono text-xl text-[#001a33]">{formatNumber(result.mediaFinal)}</strong>
                      </div>
                      <div className="bg-white px-4 py-3">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Frequência</span>
                        <strong className="mt-1 block font-mono text-xl text-[#001a33]">{result.frequenciaPercent === null ? '—' : `${formatNumber(result.frequenciaPercent, 0)}%`}</strong>
                      </div>
                    </div>
                    <details className="group border-t border-slate-100">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-[10px] font-black uppercase tracking-wider text-blue-600">
                        Ver composição das notas <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
                      </summary>
                      <div className="grid grid-cols-4 gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
                        {grades.map(([label, value]) => (
                          <div key={label} className="rounded-lg bg-white px-2 py-2 text-center ring-1 ring-slate-100">
                            <span className="block text-[8px] font-black uppercase text-slate-400">{label}</span>
                            <strong className="mt-0.5 block font-mono text-xs text-slate-700">{formatNumber(value)}</strong>
                          </div>
                        ))}
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full border-collapse text-left text-xs">
              <thead><tr className="border-b border-slate-200 text-[9px] font-black uppercase tracking-wider text-slate-400">
                <th className="py-2.5">Disciplina</th>
                {['P', 'TI', 'TG', 'S', 'CQ', 'O', 'REC', 'Média', 'Frequência', 'Resultado'].map((label) => <th key={label} className="py-2.5 text-center">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                {!results.length ? <tr><td colSpan={11} className="py-12 text-center font-medium text-slate-400">{emptyMessage}</td></tr> : results.map((result) => (
                  <tr key={result.id} className="hover:bg-slate-50/50">
                    <td className="py-3.5 text-slate-900">{result.disciplinaNome}</td>
                    {[result.notaP, result.notaTi, result.notaTg, result.notaS, result.notaCq, result.notaO, result.notaRec, result.mediaFinal].map((value, index) => <td key={index} className="py-3.5 text-center font-mono">{formatNumber(value)}</td>)}
                    <td className="py-3.5 text-center font-mono">{result.frequenciaPercent === null ? '—' : `${formatNumber(result.frequenciaPercent, 0)}%`}</td>
                    <td className="py-3.5 text-center"><span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase ${resultClass(result.resultadoFinal)}`}>{RESULT_LABELS[result.resultadoFinal] || result.resultadoFinal.replaceAll('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
        {onPrint ? <div className="border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 print:hidden md:flex md:justify-end md:bg-slate-50 md:p-4"><button type="button" onClick={onPrint} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg hover:bg-blue-900 md:min-h-0 md:w-auto"><Printer size={14} /> Imprimir Boletim</button></div> : null}
      </section>
    </div>,
    document.body,
  );
};

export default AcademicResultsModal;
