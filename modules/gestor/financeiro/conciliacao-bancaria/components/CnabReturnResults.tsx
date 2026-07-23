import React from 'react';
import type {
  BaneseCnabReturnRecord,
  BaneseCnabReturnSummary,
} from '../conciliacao-bancaria.types';

const outcomeStatusClass = (status: BaneseCnabReturnRecord['status']) => {
  if (['MATCHED', 'RECORDED', 'ACTIVATED'].includes(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['REVIEW_REQUIRED', 'ACTIVATION_PENDING', 'SKIPPED'].includes(status)) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-rose-200 bg-rose-50 text-rose-700';
};

export const CnabSummaryGrid: React.FC<{ summary: BaneseCnabReturnSummary }> = ({
  summary,
}) => {
  const cards = [
    { label: 'Eventos lidos', value: Number(summary.events || 0), tone: 'text-slate-800' },
    { label: 'Correspondências', value: Number(summary.matched || 0), tone: 'text-emerald-700' },
    { label: 'Revisão manual', value: Number(summary.reviewRequired || 0), tone: 'text-amber-700' },
    { label: 'Baixas aplicadas', value: Number(summary.applied || 0), tone: 'text-blue-700' },
    { label: 'Erros', value: Number(summary.errors || 0), tone: 'text-rose-700' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{card.label}</p>
          <p className={`mt-1 text-xl font-black ${card.tone}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
};

export const CnabOutcomeList: React.FC<{ outcomes: BaneseCnabReturnRecord[] }> = ({
  outcomes,
}) => {
  if (outcomes.length === 0) {
    return <p className="text-xs font-semibold text-slate-500">Nenhum evento detalhado foi retornado.</p>;
  }

  const visibleOutcomes = outcomes.slice(0, 40);
  return (
    <div className="space-y-2">
      {visibleOutcomes.map((outcome, index) => (
        <div
          key={outcome.id || `${outcome.lineNumber}-${outcome.nossoNumero}-${index}`}
          className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[auto_1fr]"
        >
          <span className={`h-fit rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${outcomeStatusClass(outcome.status)}`}>
            {outcome.status}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black text-slate-700">
              Linha {outcome.lineNumber || '-'} · Nosso número {outcome.nossoNumero || '-'}
            </p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
              {outcome.message || 'Evento validado sem observações adicionais.'}
            </p>
          </div>
        </div>
      ))}
      {outcomes.length > visibleOutcomes.length ? (
        <p className="text-[10px] font-bold text-slate-500">
          Exibindo os primeiros {visibleOutcomes.length} de {outcomes.length} eventos. O arquivo completo permanece registrado para auditoria.
        </p>
      ) : null}
    </div>
  );
};
