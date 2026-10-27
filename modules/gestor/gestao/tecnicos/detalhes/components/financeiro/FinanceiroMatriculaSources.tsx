import React from 'react';
import type { EnrollmentFinancialContext } from '../../../../../../shared/financeiro/matricula/contract';
import { financialOriginLabels } from '../../../../../../shared/financeiro/matricula/labels';
import type { FinancialOriginFilter } from '../../../../../../shared/financeiro/matricula/selectors';

export const FinanceiroMatriculaSourceFilter = ({ value, onChange }: {
  value: FinancialOriginFilter; onChange: (value: FinancialOriginFilter) => void;
}) => <label className="text-[10px] font-bold text-slate-600">Origem financeira
  <select aria-label="Filtrar origem financeira por matrícula" value={value}
    onChange={(event) => onChange(event.target.value as FinancialOriginFilter)}
    className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
    <option value="TODAS">Todas</option><option value="MISTAS">Matrículas com fontes mistas</option>
    {Object.entries(financialOriginLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </select>
</label>;

export default function FinanceiroMatriculaSources({ context }: { context: EnrollmentFinancialContext }) {
  const labels = [...new Set(context.fontes.map((s) => financialOriginLabels[s.origem]))];
  return <div className="mt-1 text-[10px] font-semibold leading-4 text-slate-600">
    <p>{labels.length ? labels.join(' · ') : 'Sem títulos nesta matrícula'}</p>
    <p>{context.mensalidades.lancadas} mensalidades lançadas · {context.mensalidades.bancariasEmitidas} emitidas no Banese
      {' · '}{context.mensalidades.externasConhecidas} externas conhecidas · {context.taxas} taxas</p>
    {context.ajustesResiduais > 0 && <p>{context.ajustesResiduais} ajustes residuais preservados, fora da contagem de mensalidades.</p>}
    {context.mensalidades.emRevisao > 0 && <p className="text-amber-700">{context.mensalidades.emRevisao} mensalidades com vínculo a conferir; não presume quitação.</p>}
  </div>;
}
