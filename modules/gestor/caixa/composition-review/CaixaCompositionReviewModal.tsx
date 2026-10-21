import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, X } from 'lucide-react';
import { formatCaixaCompetencia, formatCaixaDate, formatCaixaCurrency } from '../caixa.formatters';
import { useReviewDialogFocus } from '../review-pending/useReviewDialogFocus';
import { compositionReviewQueryOptions } from './caixa-composition-review.service';
import { compositionReviewOrigin, compositionReviewPage, compositionReviewReason,
  selectCompositionReviewRows, type CompositionReviewFilter } from './caixa-composition-review.model';
import type { CaixaReportReceipt } from '../report/caixa-report.types';

const money = (value: number | null) => value === null || !Number.isFinite(value) ? 'Não informado' : formatCaixaCurrency(value);
const buttonClass = 'min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40';

function ReceiptCard({ row }: { row: CaixaReportReceipt }) {
  const metrics = [
    ['Base nominal', row.valorBase], ['Recebido', row.valorRecebido],
    ['Juros', row.juros], ['Multa', row.multa], ['Acréscimo', row.acrescimo],
    ['Desconto', row.desconto], ['Diferença a conferir', row.diferencaNaoDiscriminada],
  ] as const;
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="break-words text-sm font-extrabold text-[#001a33]">{row.pagador}</h3>
        <p className="mt-1 break-words text-xs text-slate-600">{row.descricao}</p>
        <p className="mt-1 text-xs text-slate-500">{row.polo} · {row.turma}</p>
        <p className="mt-1 text-xs text-slate-500">Parcela {row.parcelaNumero ?? 'não informada'}{row.totalParcelas === null ? '' : ` de ${row.totalParcelas}`}</p>
      </div>
      <div className="text-xs text-slate-600"><p>Recebido em {formatCaixaDate(row.dataPagamento)}</p>
        <p className="mt-1">Vencimento: {row.dataVencimento ? formatCaixaDate(row.dataVencimento) : 'Não informado'}</p></div>
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {metrics.map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
        <dt className="text-[10px] font-bold uppercase text-slate-500">{label}</dt>
        <dd className={`mt-1 text-sm font-bold ${label === 'Recebido' ? 'text-emerald-700' : 'text-slate-800'}`}>{money(value)}</dd>
      </div>)}
    </dl>
    <p className="mt-3 text-xs leading-5 text-amber-900">{compositionReviewReason(row)}</p>
    <p className="mt-2 text-xs text-slate-500">Composição: {compositionReviewOrigin(row)} · Forma: {row.formaPagamento}</p>
    <p className="mt-1 break-all text-[10px] text-slate-400">Identificador do recebimento: {row.id}</p>
  </article>;
}

interface Props {
  poloId: string | null;
  competencia: string;
  expectedDifferenceCount?: number;
  onClose: () => void;
}

/** Parent keys the dialog by scope/month so navigation cannot retain an old page. */
export function CaixaCompositionReviewModal({ poloId, competencia, expectedDifferenceCount, onClose }: Props) {
  const [filter, setFilter] = useState<CompositionReviewFilter>('DIFFERENCE');
  const [page, setPage] = useState(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useReviewDialogFocus(dialogRef, closeRef, onClose);
  const query = useQuery(compositionReviewQueryOptions(poloId, competencia));
  const rows = query.data ? selectCompositionReviewRows(query.data.recebimentos, filter) : [];
  const differences = query.data ? selectCompositionReviewRows(query.data.recebimentos, 'DIFFERENCE').length : 0;
  const missing = query.data ? selectCompositionReviewRows(query.data.recebimentos, 'MISSING_DETAIL').length : 0;
  const pageCount = Math.max(1, Math.ceil(rows.length / 20));
  const activePage = Math.min(page, pageCount);
  const loading = query.isPending || query.isFetching;
  const changePage = (next: number) => { setPage(next); contentRef.current?.scrollTo({ top: 0 }); };
  const changeFilter = (next: CompositionReviewFilter) => { setFilter(next); setPage(1); contentRef.current?.scrollTo({ top: 0 }); };
  return createPortal(<div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="composition-review-title"
    aria-describedby="composition-review-description" aria-busy={loading}
    className="fixed inset-0 z-[150] flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50">
    <header className="flex shrink-0 items-start justify-between gap-4 bg-[#001a33] px-4 py-5 text-white sm:px-8">
      <div className="flex min-w-0 items-start gap-3"><ClipboardList size={24} className="mt-1 shrink-0 text-amber-200" aria-hidden="true" />
        <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200">Caixa · conferência somente leitura</p>
          <h2 id="composition-review-title" className="mt-1 text-lg font-extrabold sm:text-2xl">Conferência da composição dos recebimentos</h2>
          <p id="composition-review-description" className="mt-2 text-xs leading-5 text-slate-300">
            {poloId === null ? 'Todos os polos autorizados' : 'Polo selecionado'} · {formatCaixaCompetencia(competencia)} · Mês do pagamento</p>
        </div>
      </div>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar conferência da composição"
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X size={22} aria-hidden="true" /></button>
    </header>
    <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8">
      <p className="mb-4 text-xs leading-5 text-slate-600">Os valores vêm do relatório canônico. Componentes ausentes aparecem como “Não informado”. A diferença já faz parte do recebido e não deve ser descontada novamente do saldo.</p>
      {loading ? <p role="status" className="py-8 text-sm text-slate-600">Carregando os recebimentos completos do mês…</p>
        : query.isError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-950">Não foi possível obter a lista completa. Nenhuma lista parcial será apresentada.</p>
          <button type="button" className={`${buttonClass} mt-3`} onClick={() => { void query.refetch(); }}>Tentar novamente</button>
        </div> : <>
          {expectedDifferenceCount !== undefined && differences !== expectedDifferenceCount ? <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">A consulta atual encontrou {differences} recebimento(s) com diferença; o cartão mostrava {expectedDifferenceCount}. Os dados podem ter sido atualizados após a leitura do cartão.</p> : null}
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Filtrar recebimentos para conferência">
            <button type="button" aria-pressed={filter === 'DIFFERENCE'} className={buttonClass} onClick={() => changeFilter('DIFFERENCE')}>Com diferença ({differences})</button>
            <button type="button" aria-pressed={filter === 'MISSING_DETAIL'} className={buttonClass} onClick={() => changeFilter('MISSING_DETAIL')}>Sem detalhamento, sem diferença ({missing})</button>
          </div>
          <p role="status" className="mb-3 text-xs font-semibold text-slate-600">{rows.length} recebimento(s) · Página {activePage} de {pageCount}</p>
          {rows.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Nenhum recebimento neste filtro.</p>
            : <div className="space-y-3">{compositionReviewPage(rows, activePage).map(row => <ReceiptCard key={row.id} row={row} />)}</div>}
          <nav aria-label="Páginas da conferência" className="mt-4 flex items-center justify-between gap-3">
            <button type="button" className={buttonClass} disabled={activePage <= 1} onClick={() => changePage(activePage - 1)}>Anterior</button>
            <span className="text-xs text-slate-500">{activePage} / {pageCount}</span>
            <button type="button" className={buttonClass} disabled={activePage >= pageCount} onClick={() => changePage(activePage + 1)}>Próxima</button>
          </nav>
        </>}
    </div>
    <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-[10px] text-slate-500 sm:px-8">
      Somente consulta. Nenhuma cobrança, baixa, desconto ou saldo é alterado.
      {query.data ? ` Consulta em ${new Date(query.data.geradoEm).toLocaleString('pt-BR', { timeZone: 'America/Maceio' })}.` : ''}
    </footer>
  </div>, document.body);
}
