import React from 'react';
import type { DespesaLancamento } from '../despesas.types';
import { formatDespesaCurrency, isDespesaValorEstimado } from './despesaPresentation';

export default function DespesaEstimativaBadge({ item }: { item: DespesaLancamento }) {
  if (!item.valorEstimado) return null;
  const pending = isDespesaValorEstimado(item);
  return <div className="mt-1 text-xs leading-5 text-slate-600">
    <span className={`inline-flex rounded-md border px-2 py-0.5 ${pending
      ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50'}`}>
      {item.valorSemCobrancaEm ? 'Sem cobrança neste mês' : pending ? 'Valor estimado' : 'Valor confirmado'}
    </span>
    {item.valorEstimadoOriginal != null && <p>
      {item.isRateioDerived ? 'Cota estimada original' : 'Estimativa original'}: {formatDespesaCurrency(item.valorEstimadoOriginal)}
    </p>}
  </div>;
}
