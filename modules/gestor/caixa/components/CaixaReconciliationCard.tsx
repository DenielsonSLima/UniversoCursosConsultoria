import React from 'react';
import { CheckCircle2, Clock3 } from 'lucide-react';
import type { CaixaMonthlyStatement } from '../caixa.service';
import { formatCaixaDateTime } from '../caixa.formatters';

export const CaixaReconciliationCard: React.FC<{
  reconciliation: CaixaMonthlyStatement['conciliacao'];
}> = ({ reconciliation }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <CheckCircle2 size={17} className="text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">Conciliação do período</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Rastreabilidade dos movimentos que compõem esta prestação.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Value label="Recebimentos" value={reconciliation.recebimentosConciliados} />
        <Value label="Pagamentos" value={reconciliation.pagamentosConciliados} />
        <Value
          label="Pendências"
          value={reconciliation.pendentes}
          tone={reconciliation.pendentes > 0 ? 'amber' : 'green'}
        />
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[10px] text-slate-500">
            <Clock3 size={10} /> Atualização
          </p>
          <p className="mt-1 whitespace-nowrap text-[11px] font-semibold text-slate-700">
            {formatCaixaDateTime(reconciliation.ultimaAtualizacao)}
          </p>
        </div>
      </div>
    </div>
  </section>
);

const Value: React.FC<{
  label: string;
  value: number;
  tone?: 'default' | 'amber' | 'green';
}> = ({ label, value, tone = 'default' }) => {
  const color = tone === 'amber'
    ? 'text-amber-600'
    : tone === 'green'
      ? 'text-emerald-700'
      : 'text-slate-900';
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-bold ${color}`}>{value}</p>
    </div>
  );
};

