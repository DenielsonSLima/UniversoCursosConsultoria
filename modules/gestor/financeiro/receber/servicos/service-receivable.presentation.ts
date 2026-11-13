import { hasPartialPayment } from '../../settlements/financial-payment.presentation';
import { canOpenBaneseDocument } from '../components/modalidade-receber/modalidade-receber.utils';
import type { ServiceReceivable } from './servicos-receber.contract';

export const canReceiveService = (item: ServiceReceivable) => item.operationCapabilities?.canSettle === true
  && ['PENDENTE', 'VENCIDO'].includes(item.status) && !item.nfseFiscalCancelledAt
  && !['PENDING', 'REVIEW_REQUIRED', 'CANCELLED'].includes(item.nfseCancellationState || '');

export const canOpenServiceCharge = (item: ServiceReceivable) => item.operationCapabilities?.canOpenExisting === true
  && canOpenBaneseDocument(item);

export const serviceReceiptBlockReason = (item: ServiceReceivable): string | null => {
  if (item.nfseCancellationState === 'REVIEW_REQUIRED') return item.nfseCancellationReason === 'PAYMENT_HISTORY'
    ? 'Cancelamento financeiro requer revisão: há histórico de recebimento.' : 'O cancelamento financeiro precisa de conferência.';
  if (item.nfseCancellationState === 'PENDING') return 'Cancelamento da cobrança em processamento.';
  if (item.nfseFiscalCancelledAt) return `${item.nfseNumber ? `NFS-e nº ${item.nfseNumber}` : 'NFS-e'} cancelada. Novo recebimento indisponível.`;
  if (['PENDENTE', 'VENCIDO'].includes(item.status) && !canReceiveService(item)) {
    return item.operationCapabilities?.readOnlyReason || 'Recebimento indisponível para este título.';
  }
  return null;
};

export const serviceReceiptStatus = (item: ServiceReceivable) => item.status === 'PAGO' ? 'Recebido'
  : item.nfseCancellationState === 'PENDING' ? 'Cancelando cobrança'
    : item.nfseCancellationState === 'REVIEW_REQUIRED' ? 'Revisar cancelamento'
      : ['CANCELADO', 'ESTORNADO', 'DEVOLVIDO', 'SUSPENSO'].includes(item.status) ? item.status
        : hasPartialPayment(item.paymentSummary) ? 'Baixa parcial' : item.status;
