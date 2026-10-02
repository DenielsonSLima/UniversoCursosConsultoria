import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, X } from 'lucide-react';
import { formatCaixaCompetencia, formatCaixaDate } from '../caixa.formatters';
import { caixaReviewQueryOptions } from './caixa-review-pending.service';
import type { CaixaReviewContext } from './caixa-review-pending.contract';
import { CaixaReviewPendingPanel } from './CaixaReviewPendingPanel';
import { useReviewDialogFocus } from './useReviewDialogFocus';

export interface CaixaReviewPendingModalProps {
  poloId: string | null;
  poloLabel: string;
  competencia: string;
  context: CaixaReviewContext;
  onClose: () => void;
}

/** Montado por chave de polo/competência/contexto; nunca reaproveita página de outro recorte. */
export const CaixaReviewPendingModal: React.FC<CaixaReviewPendingModalProps> = ({ poloId, poloLabel, competencia, context, onClose }) => {
  const [page, setPage] = useState(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<globalThis.HTMLButtonElement>(null);
  useReviewDialogFocus(dialogRef, closeRef, onClose);
  const query = useQuery(caixaReviewQueryOptions({ poloId, competencia, context, page, pageSize: 20 }));
  return createPortal(<div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="caixa-review-title"
    aria-describedby="caixa-review-description" aria-busy={query.isFetching}
    className="fixed inset-0 z-[150] flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50">
    <header className="flex shrink-0 items-start justify-between gap-4 bg-[#001a33] px-4 py-5 text-white sm:px-8">
      <div className="flex min-w-0 items-start gap-3"><ClipboardList size={24} className="mt-1 shrink-0 text-amber-200" aria-hidden="true" />
        <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200">Caixa · conferência somente leitura</p>
          <h2 id="caixa-review-title" className="mt-1 text-lg font-extrabold sm:text-2xl">{context === 'MONTHLY' ? 'Registros em conferência — mês' : 'Registros em conferência — carteira'}</h2>
          <p id="caixa-review-description" className="mt-2 text-xs leading-5 text-slate-300">{poloLabel} · {formatCaixaCompetencia(competencia)}
            {query.data ? ` · Corte ${formatCaixaDate(query.data.dataCorte)}` : ''}</p>
          <p className="mt-1 text-[10px] text-slate-400">{context === 'MONTHLY' ? 'Registros com vencimento cadastrado na competência selecionada.' : 'Carteira cadastrada, reexpressa na data de corte, incluindo outros meses.'}</p>
        </div>
      </div>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar conferência de dados do Caixa"
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X size={22} aria-hidden="true" /></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <CaixaReviewPendingPanel data={query.data} loading={query.isPending || query.isFetching}
        error={query.isError ? query.error.message : null}
        onRetry={() => { void query.refetch(); }} onPage={setPage} />
    </div>
    <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-[10px] text-slate-500 sm:px-8">
      Nenhuma baixa, cancelamento ou consulta ao Proesc é executada por este painel.
      {' '}Posição baseada nas evidências atuais; não representa um cadastro histórico congelado.
      {query.data ? ` Posição consultada em ${new Date(query.data.geradoEm).toLocaleString('pt-BR', { timeZone: 'America/Maceio' })}.` : ''}
    </footer>
  </div>, document.body);
};
