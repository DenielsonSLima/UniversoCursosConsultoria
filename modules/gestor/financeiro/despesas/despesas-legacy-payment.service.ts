import { supabase } from '../../../../lib/supabase';
import type { DespesaLancamento } from './despesas.types';
import { usesLegacyExpenseSettlement, type LegacyDespesaBaixaParams } from './despesas-legacy-payment.model';

export async function settleLegacyExpense(item: DespesaLancamento, params: LegacyDespesaBaixaParams) {
  if (!usesLegacyExpenseSettlement(item)) throw new Error('A baixa integral não está disponível para esta despesa. Abra o lançamento novamente.');
  const { error } = await supabase.rpc('baixar_despesa_secure', {
    p_despesa_id: item.id,
    p_request_id: params.requestId,
    p_conta_bancaria_id: params.contaBancariaId,
    p_data_pagamento: params.dataPagamento,
    p_forma_pagamento: params.formaPagamento,
    p_juros_valor: params.jurosValor || 0,
    p_multa_valor: params.multaValor || 0,
    p_desconto_valor: params.descontoValor || 0,
  });
  if (error) throw error;
}
