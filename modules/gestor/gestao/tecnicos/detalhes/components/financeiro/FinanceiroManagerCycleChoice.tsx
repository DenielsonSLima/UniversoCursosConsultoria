import React from 'react';
import type { ManagerCycleDecision } from '../../../../../../shared/financeiro/matricula/contract';
import { cycleDecisionReasons } from '../../../../../../shared/financeiro/matricula/labels';

export default function FinanceiroManagerCycleChoice({ decision, value, disabled, onChange, onDoNotIssue }: {
  decision: ManagerCycleDecision; value: number | null; disabled: boolean;
  onChange: (cycle: 1 | 2) => void; onDoNotIssue: () => void;
}) {
  return <fieldset disabled={disabled} className="mb-4 rounded-xl border border-slate-200 p-3">
    <legend className="px-1 text-xs font-bold text-slate-700">Decisão do gestor para esta matrícula</legend>
    <label className="text-xs font-semibold text-slate-600">Ciclo
      <select aria-label="Escolher ciclo financeiro" value={value ?? ''}
        onChange={(event) => { if (event.target.value) onChange(Number(event.target.value) as 1 | 2); }}
        className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
        <option value="">Selecione um ciclo</option>
        {decision.opcoes.map((o) => <option key={o.cicloNumero} value={o.cicloNumero} disabled={!o.podeGerar}>
          {o.cicloNumero}º ciclo{o.motivo ? ` — ${cycleDecisionReasons[o.motivo] ?? o.motivo}` : ''}
        </option>)}
      </select>
    </label>
    <button type="button" onClick={onDoNotIssue} className="ml-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Não emitir</button>
    <p className="mt-2 text-xs text-slate-500">A escolha não altera o histórico. Nenhuma emissão ocorre antes da revisão e confirmação.</p>
  </fieldset>;
}
