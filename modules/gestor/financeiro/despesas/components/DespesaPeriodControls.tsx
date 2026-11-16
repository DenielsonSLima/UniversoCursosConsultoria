import React from 'react';
import FinancialSelect from '../../components/FinancialSelect';
import type { DespesaOrdem, DespesaSituacao, DespesaStatusScope } from '../despesas.queryKeys';
import { despesaOrdemLabels, despesaSituacaoLabels, getDespesaPeriodoLabel } from './despesa-periodo-apresentacao';

interface Props {
  statusScope: DespesaStatusScope;
  situacao: DespesaSituacao;
  ordem: DespesaOrdem;
  onSituacaoChange: (value: DespesaSituacao) => void;
  onOrdemChange: (value: DespesaOrdem) => void;
}

export default function DespesaPeriodControls({ statusScope, situacao, ordem, onSituacaoChange, onOrdemChange }: Props) {
  const fixed = statusScope === 'em_aberto' || statusScope === 'vencidos';
  const selectClass = '[&>.financial-select-search]:hidden [&>input]:!pl-3';
  return <div className="flex min-w-0 max-w-full shrink-0 flex-wrap items-center gap-2" role="group" aria-label="Situação e ordem das despesas">
    <div className="min-w-0">
      <p className="sr-only">Situação{fixed ? ' da aba' : ''}</p>
      <FinancialSelect value={situacao} onValueChange={value => onSituacaoChange(value as DespesaSituacao)}
        ariaLabel="Filtrar despesas por situação" disabled={fixed} className={`w-32 ${selectClass}`}
        options={(Object.entries(despesaSituacaoLabels) as [DespesaSituacao, string][]).map(([value, label]) => ({ value, label }))} />
    </div>
    <div className="min-w-0">
      <p className="sr-only">Ordenar por vencimento</p>
      <FinancialSelect value={ordem} onValueChange={value => onOrdemChange(value as DespesaOrdem)}
        ariaLabel="Ordenar despesas por vencimento" className={`w-48 ${selectClass}`}
        options={(Object.entries(despesaOrdemLabels) as [DespesaOrdem, string][]).map(([value, label]) => ({ value, label }))} />
    </div>
  </div>;
}

export function DespesaPeriodCaption({ statusScope, situacao, dataInicio, dataFim }: Pick<Props, 'statusScope' | 'situacao'> & {
  dataInicio: string; dataFim: string;
}) {
  const fixed = statusScope === 'em_aberto' || statusScope === 'vencidos';
  return <p className="text-xs leading-5 text-slate-500">
    {getDespesaPeriodoLabel(statusScope, dataInicio, dataFim)}
    {fixed ? ` · ${despesaSituacaoLabels[situacao]}` : ''}
  </p>;
}
