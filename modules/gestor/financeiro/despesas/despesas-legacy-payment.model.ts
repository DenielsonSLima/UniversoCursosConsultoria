import type { DespesaLancamento } from './despesas.types';

export interface LegacyDespesaBaixaParams {
  requestId: string;
  contaBancariaId: string;
  dataPagamento: string;
  formaPagamento: string;
  jurosValor?: number;
  multaValor?: number;
  descontoValor?: number;
}

/** Only the pre-existing integral path for canonical convenio links. */
export function usesLegacyExpenseSettlement(item: DespesaLancamento): boolean {
  return !item.paymentSummary?.hasEvents && !item.isRateioDerived
    && ['PENDENTE', 'VENCIDO'].includes(item.status)
    && Boolean(item.convenioMesId || item.convenioId);
}
