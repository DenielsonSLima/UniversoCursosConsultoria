import { baneseCancellationLabel } from '../../../../../../financeiro/financeiro.operation-capabilities';
import { isProescFinancialComposition } from '../../../../../../financeiro/financeiro.composition-presentation';
import { hasProescEvidence } from '../../../../../../financeiro/financeiro.proesc-evidence';
import { receivableIssuanceNotice } from '../../../../../../financeiro/financeiro.receivable-issuance';
import {
  canOpenBaneseDocument,
  isBaneseIdentityQuarantined,
  paymentGatewayCode,
  paymentGatewayLabel,
  paymentGatewayStatusLabel,
  paymentMethodLabel,
  paymentOriginLabel,
} from '../../../../../../financeiro/receber/components/modalidade-receber/modalidade-receber.utils';
import type { AlunoExtratoRecebivel } from './alunoExtrato.mapper';

const isProesc = (item: AlunoExtratoRecebivel) => (
  hasProescEvidence(item) || isProescFinancialComposition(item.composicaoStatus)
  || item.operationCapabilities?.sourceSystem === 'PROESC'
);

export const extratoPaymentOrigin = (item: AlunoExtratoRecebivel) => (
  isProesc(item) ? 'Proesc'
    : item.operationCapabilities?.provenanceKind === 'BANESE_LEGACY_IMPORTED'
      ? 'Banese importado' : paymentOriginLabel(item)
);

export const extratoPaymentMethod = (item: AlunoExtratoRecebivel) => {
  if (item.status === 'PAGO' && item.origemPagamento === 'PRESENCIAL') {
    const manualMethods: Record<string, string> = {
      PIX: 'Pix', BOLETO: 'Boleto', CARTAO: 'Cartão', DINHEIRO: 'Dinheiro',
    };
    return manualMethods[item.formaPagamento || ''] || 'Não definido';
  }
  return paymentMethodLabel(item);
};

export const extratoChargePresentation = (item: AlunoExtratoRecebivel) => {
  const cancellation = baneseCancellationLabel(item);
  if (cancellation) return { label: cancellation, detail: '', tone: 'neutral' };
  if (item.status === 'CANCELADO') return { label: 'Cancelada', detail: '', tone: 'neutral' };
  if (item.operationCapabilities?.sourceSystem === 'CONFLICT') {
    return { label: 'Origem em revisão', detail: 'Operações bloqueadas.', tone: 'warning' };
  }
  if (isProesc(item)) return { label: 'Histórico Proesc', detail: 'Somente consulta', tone: 'neutral' };
  if (item.origemPagamento === 'SISTEMA_ANTERIOR' && !paymentGatewayCode(item)) {
    return { label: 'Sistema anterior', detail: 'Somente consulta', tone: 'neutral' };
  }
  const gatewayStatus = String(item.asaasStatus || '').toUpperCase();
  if (['DELETED', 'CANCELED', 'CANCELLED', 'REFUNDED'].includes(gatewayStatus)) {
    return { label: paymentGatewayStatusLabel(item), detail: '', tone: 'neutral' };
  }
  // Manual settlement cancels the bank title. A stale cycle issuance state
  // must never tell the operator to reissue a charge that is already paid.
  if (item.status === 'PAGO') return { label: 'Pagamento registrado', detail: '', tone: 'confirmed' };
  if (isBaneseIdentityQuarantined(item)) {
    return { label: 'Boleto em revisão', detail: 'Dados bancários em conferência.', tone: 'warning' };
  }
  const notice = receivableIssuanceNotice(item);
  if (notice) return { label: notice.title, detail: notice.message, tone: 'neutral' };
  const gateway = paymentGatewayCode(item);
  if (gateway && (item.emissaoCicloStatus === 'EMITIDO' || item.asaasPaymentId
    || item.boletoNossoNumero || item.asaasInvoiceUrl || item.asaasBankSlipUrl)) {
    return {
      label: ['banese_card', 'banese'].includes(gateway) ? 'Boleto emitido' : 'Cobrança emitida',
      detail: paymentGatewayLabel(item),
      tone: 'confirmed',
    };
  }
  if (item.origemPagamento === 'LOCAL' || item.origemPagamento === 'PRESENCIAL') {
    return { label: 'Recebimento local', detail: '', tone: 'neutral' };
  }
  return { label: 'Sem boleto emitido', detail: '', tone: 'neutral' };
};

// This action only opens existing documents. Missing server capabilities
// do not grant permission to open Banese.
export const extratoChargeAction = (item: AlunoExtratoRecebivel): 'banese' | 'external' | null => {
  if (!['PENDENTE', 'VENCIDO'].includes(item.status)
    || isProesc(item) || item.operationCapabilities?.sourceSystem === 'CONFLICT'
    || baneseCancellationLabel(item) || receivableIssuanceNotice(item)
    || isBaneseIdentityQuarantined(item)
    || ['DELETED', 'CANCELED', 'CANCELLED', 'REFUNDED'].includes(String(item.asaasStatus || '').toUpperCase())) {
    return null;
  }
  if (['banese_card', 'banese'].includes(paymentGatewayCode(item) || '')) {
    return item.operationCapabilities?.canOpenExisting === true && canOpenBaneseDocument(item)
      ? 'banese' : null;
  }
  return item.asaasInvoiceUrl || item.asaasBankSlipUrl ? 'external' : null;
};
