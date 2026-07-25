import type { ContasReceber } from '../../../financeiro.service';
import type { GroupMode, StatusScope } from './modalidade-receber.types';

export const statusScopeLabels: Record<StatusScope, string> = {
  pending: 'Pendentes',
  received: 'Recebidos',
  canceled: 'Cancelados',
  all: 'Todos',
};

export const groupModeLabels: Record<GroupMode, string> = {
  none: 'Sem agrupamento',
  student: 'Por aluno',
  class: 'Por turma',
  polo: 'Por polo',
};

const paymentGatewayLabels: Record<string, string> = {
  asaas: 'Asaas',
  banese: 'Banese',
  banese_card: 'Banese',
  mercado_pago: 'Mercado Pago',
  banco_inter: 'Banco Inter',
  inter: 'Banco Inter',
  gateway: 'Gateway bancário',
};

export const paymentGatewayCode = (item: ContasReceber): string | null => {
  const chargeUrl = String(item.asaasBankSlipUrl || item.asaasInvoiceUrl || '');
  if (chargeUrl.includes('banesePayment=')) return 'banese_card';

  const explicitProvider = String(item.gatewayProvider || '').trim().toLowerCase();
  if (explicitProvider) return explicitProvider;

  const origin = String(item.origemPagamento || '').trim().toUpperCase();
  if (origin.includes('BANESE')) return 'banese_card';
  if (origin.includes('MERCADO_PAGO') || origin.includes('MERCADO PAGO')) return 'mercado_pago';
  if (origin.includes('BANCO_INTER') || origin === 'INTER') return 'banco_inter';
  if (origin.includes('ASAAS')) return 'asaas';
  if (origin.startsWith('GATEWAY')) return 'gateway';

  // Compatibilidade com cobranças Asaas anteriores à coluna gateway_provider.
  if (item.asaasPaymentId) return 'asaas';
  return null;
};

export const paymentGatewayLabel = (item: ContasReceber) => {
  const providerCode = paymentGatewayCode(item);
  if (!providerCode) return 'Integração bancária';
  if (paymentGatewayLabels[providerCode]) return paymentGatewayLabels[providerCode];

  return providerCode
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
};

export const paymentGatewayStatusLabel = (item: ContasReceber) => {
  const normalized = String(item.asaasStatus || '').toUpperCase();
  if (!normalized) {
    if (paymentGatewayCode(item) === 'banese_card' || paymentGatewayCode(item) === 'banese') {
      return 'Boleto/Pix Banese';
    }
    return 'Não sincronizado';
  }

  const providerLabel = paymentGatewayLabel(item);
  const providerReference = providerLabel === 'Gateway bancário' || providerLabel === 'Integração bancária'
    ? providerLabel.toLowerCase()
    : providerLabel;
  const labels: Record<string, string> = {
    PENDING: `Pendente no ${providerReference}`,
    CONFIRMED: `Confirmado no ${providerReference}`,
    RECEIVED: `Recebido no ${providerReference}`,
    OVERDUE: `Vencido no ${providerReference}`,
    DELETED: `Cancelado no ${providerReference}`,
    CANCELED: `Cancelado no ${providerReference}`,
    REFUNDED: `Estornado no ${providerReference}`,
    REFUND_REQUESTED: 'Estorno solicitado',
    AWAITING_RISK_ANALYSIS: `Em análise no ${providerReference}`,
  };
  return labels[normalized] || normalized;
};

export const paymentGatewayStatusClass = (status?: string) => {
  const normalized = String(status || '').toUpperCase();
  if (['CONFIRMED', 'RECEIVED'].includes(normalized)) return 'text-emerald-600';
  if (['DELETED', 'CANCELED'].includes(normalized)) return 'text-rose-600';
  if (normalized === 'PENDING') return 'text-blue-600';
  if (normalized === 'OVERDUE') return 'text-amber-600';
  return 'text-slate-400';
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export const formatOptionalCurrency = (
  value: number | null | undefined,
  missingLabel = '—',
) => value === null || value === undefined ? missingLabel : formatCurrency(value);

export const formatReceivableDate = (value: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '—';

export const formatNextPendingDueDate = (
  pendingCount: number,
  nextDue: string,
) => pendingCount > 0 && nextDue ? formatReceivableDate(nextDue) : '—';

export const paymentOriginLabel = (item: ContasReceber) => {
  if (item.origemPagamento === 'PRESENCIAL') {
    return ['DELETED', 'CANCELED'].includes(String(item.asaasStatus || '').toUpperCase())
      ? `Manual, cobrança ${paymentGatewayLabel(item)} cancelada`
      : 'Manual';
  }
  if (paymentGatewayCode(item)) return paymentGatewayLabel(item);
  if (item.origemPagamento === 'LOCAL') return 'Local';
  return item.status === 'PAGO' ? 'Manual' : 'Aguardando';
};

export const paymentMethodLabel = (item: ContasReceber) => {
  if (item.formaPagamento === 'CARTAO') return 'Cartão';
  if (item.formaPagamento === 'BOLETO') return 'Boleto';
  if (item.formaPagamento === 'PIX') return 'Pix';
  if (item.formaPagamento === 'DINHEIRO') return 'Dinheiro';
  return item.asaasPaymentId ? `Link ${paymentGatewayLabel(item)}` : 'Não definido';
};

export const getPersistedGatewayFee = (item: ContasReceber): number | null =>
  item.taxa ?? null;

export const getPersistedGatewayNet = (item: ContasReceber): number | null =>
  item.valorLiquido ?? null;

export const canReverseManualSettlement = (item: ContasReceber) =>
  item.status === 'PAGO' && item.origemPagamento === 'PRESENCIAL';

export const isPaidThroughAsaas = (item: ContasReceber) => {
  const asaasStatus = String(item.asaasStatus || '').toUpperCase();
  return item.status === 'PAGO' && paymentGatewayCode(item) === 'asaas' && (
    String(item.origemPagamento || '').toUpperCase() === 'ASAAS'
    || ['RECEIVED', 'CONFIRMED'].includes(asaasStatus)
    || Boolean(item.asaasTransactionReceiptUrl)
  );
};
