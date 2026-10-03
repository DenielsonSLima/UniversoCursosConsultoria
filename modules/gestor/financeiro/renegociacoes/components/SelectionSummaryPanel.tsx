import React, { useId } from 'react';
import { AlertCircle, CheckSquare2, Info, Loader2, RefreshCw } from 'lucide-react';
import { formatCents, formatRenegociacaoDate, renegociacaoErrorMessage } from '../renegociacoes.presentation';
import type { RenegociacaoSelectionSummary } from '../renegociacoes.selection-summary';

interface SelectionSummaryPanelProps {
  summary: RenegociacaoSelectionSummary | undefined;
  count: number;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  compact?: boolean;
}

const SelectionSummaryPanel: React.FC<SelectionSummaryPanelProps> = ({ summary, count, loading, error, onRetry, compact = false }) => {
  const headingId = useId();
  if (count === 0) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-500">
        <CheckSquare2 size={16} className="shrink-0" /> Selecione as parcelas para conferir os valores.
      </p>
    );
  }
  if (loading) {
    return (
      <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-4 text-xs font-bold text-slate-500">
        <Loader2 size={16} className="shrink-0 animate-spin" /> Conferindo valores das parcelas selecionadas...
      </p>
    );
  }
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
        <p className="flex items-center gap-2 font-bold"><AlertCircle size={16} className="shrink-0" /> Não foi possível conferir os valores.</p>
        <p className="mt-1 font-medium">{renegociacaoErrorMessage(error)}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 font-bold"
        >
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }
  if (!summary) {
    return (
      <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-xs font-medium text-slate-500">
        <Info size={16} className="shrink-0" /> Aguardando a conferência das parcelas selecionadas.
      </p>
    );
  }
  const discountKnown = summary.discount.status === 'KNOWN';
  const discountedPrincipal = discountKnown && summary.totals.discountedPrincipalCents !== null
    ? formatCents(summary.totals.discountedPrincipalCents)
    : 'A conferir';
  const discountDeducted = discountKnown && summary.totals.punctualDiscountCents !== null
    ? formatCents(summary.totals.punctualDiscountCents)
    : 'A conferir';

  const details = (
    <>
      {compact ? <p className="text-[11px] text-slate-500">Data-base: {formatRenegociacaoDate(summary.asOf)}</p> : null}
      <dl className="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
        <DetailValue label="Desconto de pontualidade deduzido" value={discountDeducted} />
        <DetailValue label="Juros apurados" value={formatCents(summary.totals.interestCents)} />
        <DetailValue label="Multa apurada" value={formatCents(summary.totals.penaltyCents)} />
      </dl>
      {summary.discount.message ? <p className="text-[11px] font-medium leading-relaxed text-slate-500">{summary.discount.message}</p> : null}
      {summary.payableStatus === 'UNAVAILABLE' && summary.payableMessage ? (
        <p className="text-[11px] font-medium leading-relaxed text-slate-500">{summary.payableMessage}</p>
      ) : null}
      <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-medium leading-relaxed text-slate-600">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>Resumo dos títulos originais. O desconto de pontualidade não é concedido automaticamente à proposta. Estes valores não substituem a conferência da cobrança para pagamento.</span>
      </p>
    </>
  );

  return (
    <section aria-labelledby={headingId} className={compact ? 'space-y-2' : 'space-y-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4'}>
      <header className={compact ? 'sr-only' : 'flex flex-wrap items-center justify-between gap-2'}>
        <h4 id={headingId} className="text-xs font-black uppercase tracking-wide text-[#001a33]">Resumo da seleção</h4>
        <p className="text-[11px] font-medium text-slate-500">Data-base: {formatRenegociacaoDate(summary.asOf)}</p>
      </header>
      <dl className={compact ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4'}>
        {!compact ? <SummaryCard label="Parcelas selecionadas" value={String(summary.count)} /> : null}
        <SummaryCard label="Valor normal" value={formatCents(summary.totals.principalCents)} compact={compact} />
        <SummaryCard label="Com desconto de pontualidade" value={discountedPrincipal} compact={compact} />
        <SummaryCard label="Com multa e juros" value={formatCents(summary.totals.grossDebtCents)} compact={compact} />
      </dl>
      {compact ? (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer rounded-lg py-2 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            Ver juros, multa e detalhes
          </summary>
          <div className="space-y-2 pt-1">{details}</div>
        </details>
      ) : details}
    </section>
  );
};

const SummaryCard: React.FC<{ label: string; value: string; compact?: boolean }> = ({ label, value, compact }) => (
  <div className={`min-w-0 rounded-xl border border-slate-200 bg-slate-50 ${compact ? 'p-2 sm:p-3' : 'p-3'}`}>
    <dt className="text-[9px] font-black uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className={`mt-1 break-words font-black text-[#001a33] ${compact ? 'text-sm sm:text-lg' : 'text-lg'}`}>{value}</dd>
  </div>
);

const DetailValue: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-[10px] font-medium text-slate-500">{label}</dt>
    <dd className="mt-0.5 text-xs font-bold text-slate-700">{value}</dd>
  </div>
);

export default SelectionSummaryPanel;
