import React from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, FileText, Receipt } from 'lucide-react';
import {
  formatCents,
  formatPolicyPercentage,
  formatRenegociacaoDate,
  renegociacaoPolicyInheritedLabel,
} from '../renegociacoes.model';
import type {
  RenegociacaoPolicySnapshot,
  RenegociacaoPreviewTotals,
  RenegociacaoScheduleEntry,
  RenegociacaoSourceItem,
} from '../renegociacoes.types';

interface CanonicalSummaryProps {
  totals: RenegociacaoPreviewTotals;
  schedule: { installmentCount: number; firstDueDate: string; entries: RenegociacaoScheduleEntry[] };
  policy: RenegociacaoPolicySnapshot;
  sourceItems: RenegociacaoSourceItem[];
  requiresApproval?: boolean;
  approvalReasons?: string[];
}

const penaltyLabel = (penalty: RenegociacaoPolicySnapshot['effective']['penalty']) =>
  penalty.kind === 'PERCENTAGE' ? formatPolicyPercentage(penalty) : formatCents(penalty.amountCents || 0);

const CanonicalSummary: React.FC<CanonicalSummaryProps> = ({
  totals,
  schedule,
  policy,
  sourceItems,
  requiresApproval,
  approvalReasons = [],
}) => (
  <div className="space-y-4">
    {requiresApproval ? (
      <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
          <AlertTriangle size={17} /> Proposta sujeita à aprovação
        </p>
        <p className="mt-1 text-xs font-medium">
          As condições diferem do padrão e serão registradas com a justificativa.
        </p>
        {approvalReasons.length ? (
          <ul className="mt-2 list-inside list-disc text-xs">
            {approvalReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>
    ) : (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
        <CheckCircle2 size={16} /> Condições sem necessidade de aprovação.
      </div>
    )}

    <section aria-labelledby="renegociacao-composicao" className="rounded-2xl border border-slate-200 bg-white p-4">
      <h4
        id="renegociacao-composicao"
        className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]"
      >
        <Receipt size={16} className="text-blue-600" /> Composição canônica
      </h4>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Value label="Principal" value={formatCents(totals.principalCents)} />
        <Value label="Juros apurados" value={formatCents(totals.accruedInterestCents)} />
        <Value label="Multa apurada" value={formatCents(totals.accruedPenaltyCents)} />
        <Value label="Dívida bruta" value={formatCents(totals.grossDebtCents)} />
        <Value label="Perdão de juros" value={`− ${formatCents(totals.waivedInterestCents)}`} />
        <Value label="Perdão de multa" value={`− ${formatCents(totals.waivedPenaltyCents)}`} />
        <Value label="Desconto comercial" value={`− ${formatCents(totals.commercialDiscountCents)}`} />
        <Value label="Total negociado" value={formatCents(totals.negotiatedCents)} strong />
        <Value label="Entrada" value={formatCents(totals.downPaymentCents)} />
        <Value label="Saldo parcelado" value={formatCents(totals.financedCents)} strong />
      </dl>
    </section>

    <section aria-labelledby="renegociacao-politica" className="rounded-2xl border border-slate-200 bg-white p-4">
      <h4 id="renegociacao-politica" className="text-xs font-black uppercase tracking-wide text-[#001a33]">
        Condições financeiras
      </h4>
      <p className="mt-1 text-[11px] font-medium text-slate-500">
        Origem: {policy.defaults.origin}. Regras aplicáveis às novas parcelas em caso de atraso ou pagamento pontual;
        não alteram os encargos originais.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <PolicyValue
          label="Desconto de pontualidade"
          value={formatCents(policy.effective.punctualDiscount.amountCents)}
          provenance={policy.provenance.punctualDiscount}
          inheritedFrom={renegociacaoPolicyInheritedLabel(policy.defaults.origin)}
        />
        <PolicyValue
          label="Juros por atraso ao mês"
          value={formatPolicyPercentage(policy.effective.monthlyInterest)}
          provenance={policy.provenance.monthlyInterest}
          inheritedFrom={renegociacaoPolicyInheritedLabel(policy.defaults.origin)}
        />
        <PolicyValue
          label="Multa"
          value={penaltyLabel(policy.effective.penalty)}
          provenance={policy.provenance.penalty}
          inheritedFrom={renegociacaoPolicyInheritedLabel(policy.defaults.origin)}
        />
      </div>
    </section>

    <section aria-labelledby="renegociacao-cronograma" className="rounded-2xl border border-slate-200 bg-white p-4">
      <h4
        id="renegociacao-cronograma"
        className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]"
      >
        <CalendarDays size={16} className="text-blue-600" /> Cronograma
      </h4>
      <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
        {schedule.entries.map((entry) => (
          <div
            key={`${entry.kind}-${entry.sequence}`}
            className="flex items-center justify-between gap-4 px-3 py-2.5 text-xs"
          >
            <span>
              <strong className="text-slate-700">
                {entry.kind === 'DOWN_PAYMENT' ? 'Entrada' : `Parcela ${entry.sequence}`}
              </strong>
              <span className="ml-2 text-slate-400">{formatRenegociacaoDate(entry.dueDate)}</span>
            </span>
            <strong className="shrink-0 text-[#001a33]">{formatCents(entry.amountCents)}</strong>
          </div>
        ))}
      </div>
    </section>

    <section aria-labelledby="renegociacao-originais" className="rounded-2xl border border-slate-200 bg-white p-4">
      <h4
        id="renegociacao-originais"
        className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#001a33]"
      >
        <FileText size={16} className="text-blue-600" /> Títulos originais ({sourceItems.length})
      </h4>
      <div className="mt-3 divide-y divide-slate-100">
        {sourceItems.map((item) => (
          <div key={item.receivableId} className="flex items-center justify-between gap-4 py-2 text-xs">
            <span className="text-slate-500">
              Parcela {item.number ?? item.position} • {formatRenegociacaoDate(item.dueDate)}
              {item.overdue ? ' • vencida' : ' • em aberto'}
            </span>
            <strong className="shrink-0 text-slate-700">{formatCents(item.openAmountCents)}</strong>
          </div>
        ))}
      </div>
    </section>
  </div>
);

const Value: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div>
    <dt className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className={`mt-0.5 text-sm ${strong ? 'font-black text-blue-800' : 'font-bold text-slate-700'}`}>{value}</dd>
  </div>
);
const PolicyValue: React.FC<{
  label: string;
  value: string;
  provenance: 'HERDADO' | 'PROPOSTO';
  inheritedFrom: string;
}> = ({ label, value, provenance, inheritedFrom }) => (
  <div className="rounded-xl bg-slate-50 p-3">
    <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</p>
    <p className="mt-1 text-sm font-black text-slate-700">{value}</p>
    <span
      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-black ${provenance === 'HERDADO' ? 'bg-blue-50 text-blue-700' : 'bg-amber-100 text-amber-800'}`}
    >
      {provenance === 'HERDADO' ? inheritedFrom : 'Alterado nesta proposta'}
    </span>
  </div>
);

export default CanonicalSummary;
