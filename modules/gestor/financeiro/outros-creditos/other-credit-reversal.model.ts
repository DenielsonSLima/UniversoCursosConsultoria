import type { ContasReceber } from '../financeiro.types';

/** Presentation only. The RPC independently authorizes and validates the current row. */
export function canReverseOtherCredit(item: ContasReceber): boolean {
  return Boolean(item.id && item.categoria === 'OUTROS_CREDITOS' && item.status === 'PAGO'
    && ['PRESENCIAL', 'LOCAL'].includes(String(item.origemPagamento || '').trim().toUpperCase())
    && item.contaBancariaId && Number(item.valorPago) > 0 && item.dataPagamento
    && (!item.tipoLancamento || item.tipoLancamento === 'OUTRO_CREDITO')
    && !item.matriculaId && !item.turmaId && !item.origemCronogramaId && !item.outrosCreditosPlanoId
    && !item.gatewayProvider && !item.asaasPaymentId && !item.asaasPaymentLinkId
    && !item.boletoNossoNumero && !item.nossoNumeroAsaas);
}

export function validReversalReason(reason: string): boolean {
  return reason.trim().length >= 5 && reason.trim().length <= 500;
}
