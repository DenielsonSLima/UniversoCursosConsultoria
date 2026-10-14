import type { ContasReceber } from '../financeiro.types';

export const OTHER_CREDIT_CANCELLATION_LIMIT = 25;

export function otherCreditCancellationBlockReason(item: ContasReceber): string | null {
  if (!item.id || item.categoria !== 'OUTROS_CREDITOS') return 'Este lançamento não é um crédito avulso.';
  if (item.otherCreditCancellationEligible !== true) return 'O cancelamento não está disponível para este crédito. Confira sua situação e origem.';
  if (!['PENDENTE', 'VENCIDO'].includes(item.status)) return 'Somente créditos pendentes podem ser cancelados.';
  if (item.dataPagamento || (item.valorPago || 0) > 0 || item.manualSettlementId) return 'Há um recebimento vinculado a este crédito.';
  if (item.matriculaId || item.turmaId || item.origemCronogramaId) return 'Cobranças acadêmicas devem ser tratadas no financeiro da matrícula.';
  if (item.origemPagamento === 'SISTEMA_ANTERIOR' || item.gatewayProvider === 'proesc') return 'Histórico importado é somente consulta.';
  if (item.baneseCancellation || /AMBIG|REVIEW|PROCESS|CANCEL|PAID|RECEIVED|CONFIRMED|SETTLED|LIQUID/i.test(item.asaasStatus || '')) {
    return 'Esta cobrança precisa de conferência antes do cancelamento.';
  }
  if (item.gatewayProvider === 'banese_card' || item.gatewayProvider === 'banese') {
    if ((item.gatewayPaymentMethod || item.formaPagamento) !== 'BOLETO' || !item.asaasPaymentId) return 'A identidade do boleto Banese ainda não foi confirmada.';
    if (item.gatewaySettlementSource === 'CNAB240') return 'Este boleto deve ser regularizado pelo canal CNAB.';
    return null;
  }
  if ((item.gatewayProvider && item.gatewayProvider !== 'local') || item.asaasPaymentId || item.asaasPaymentLinkId || item.boletoNossoNumero || item.nossoNumeroAsaas || item.origemPagamento === 'BANESE') {
    return 'O cancelamento deste provedor não está disponível nesta seleção.';
  }
  return null;
}

export const selectableOtherCredits = (items: ContasReceber[]) => items.filter(item => !otherCreditCancellationBlockReason(item));

export function toggleOtherCreditSelection(selected: Set<string>, items: ContasReceber[]): Set<string> {
  const eligible = selectableOtherCredits(items);
  const remove = eligible.length > 0 && (eligible.every(item => selected.has(item.id!))
    || (selected.size >= OTHER_CREDIT_CANCELLATION_LIMIT && eligible.some(item => selected.has(item.id!))));
  const next = new Set(selected);
  for (const item of eligible) {
    if (remove) next.delete(item.id!);
    else if (next.size < OTHER_CREDIT_CANCELLATION_LIMIT) next.add(item.id!);
  }
  return next;
}

export function otherCreditCancellationSnapshot(item: ContasReceber): string {
  return JSON.stringify([item.id, item.status, item.valor, item.dataVencimento, item.dataPagamento,
    item.valorPago, item.manualSettlementId, item.gatewayProvider, item.asaasPaymentId,
    item.asaasPaymentLinkId, item.boletoNossoNumero, item.asaasStatus]);
}
