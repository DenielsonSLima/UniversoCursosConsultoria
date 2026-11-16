import React from 'react';
import FinancialSelect from '../../components/FinancialSelect';
import type { DespesaOrdem, DespesaSituacao, DespesaStatusScope } from '../despesas.queryKeys';
import { despesaOrdemLabels, despesaSituacaoLabels, getDespesaPeriodoLabel } from './despesa-periodo-apresentacao';

interface Props {
  statusScope: DespesaStatusScope;
  situacao: DespesaSituacao;
  ordem: DespesaOrdem;
  dataInicio: string;
  dataFim: string;
  onSituacaoChange: (value: DespesaSituacao) => void;
  onOrdemChange: (value: DespesaOrdem) => void;
}

export default function DespesaPeriodControls({ statusScope, situacao, ordem, dataInicio, dataFim, onSituacaoChange, onOrdemChange }: Props) {
  const fixed = statusScope === 'em_aberto' || statusScope === 'vencidos';
  return <div className="grid min-w-0 grid-cols-2 gap-3" role="group" aria-label="Situação e ordem das despesas">
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-slate-500">Situação{fixed ? ' da aba' : ''}</p>
      <FinancialSelect value={situacao} onValueChange={value => onSituacaoChange(value as DespesaSituacao)}
        ariaLabel="Filtrar despesas por situação" disabled={fixed} className="w-full min-w-0"
        options={(Object.entries(despesaSituacaoLabels) as [DespesaSituacao, string][]).map(([value, label]) => ({ value, label }))} />
    </div>
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-slate-500">Ordenar por vencimento</p>
      <FinancialSelect value={ordem} onValueChange={value => onOrdemChange(value as DespesaOrdem)}
        ariaLabel="Ordenar despesas por vencimento" className="w-full min-w-0"
        options={(Object.entries(despesaOrdemLabels) as [DespesaOrdem, string][]).map(([value, label]) => ({ value, label }))} />
    </div>
    <p className="col-span-2 text-xs leading-5 text-slate-600">
      {getDespesaPeriodoLabel(statusScope, dataInicio, dataFim)}
      {fixed ? ` · ${despesaSituacaoLabels[situacao]}` : ''}
    </p>
  </div>;
}
