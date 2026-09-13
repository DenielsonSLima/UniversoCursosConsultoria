import type { ContasReceber } from '../financeiro.types';

export type StatusScope = 'received' | 'pending' | 'canceled' | 'all';
export type CreditMode = 'LOCAL_PAGO' | 'LOCAL_RECEBER' | 'GATEWAY';
export type OtherCreditGroupMode = 'partner' | 'polo' | 'none';

export const today = () => new Date().toISOString().slice(0, 10);

export const PENDING_OUTROS_CREDIT_STATUSES: ReadonlySet<string> = new Set([
  'PENDENTE',
  'VENCIDO',
  'SUSPENSO',
  'AGUARDANDO_CONFIRMACAO',
  'AGUARDANDO_PAGAMENTO',
]);

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export const normalizeCurrencyInput = (value: string) => value.replace(/[^\d.,]/g, '');

export const parseCurrencyInput = (value: string) => {
  const normalized = normalizeCurrencyInput(value).replace(/\./g, '').replace(',', '.');
  return Number(normalized || 0);
};

export const formatCurrencyInput = (value: string) => {
  const parsed = parseCurrencyInput(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatDate = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '-';

export const statusClass = (status: string) => {
  if (status === 'PAGO') return 'bg-emerald-50 text-emerald-700';
  if (status === 'VENCIDO') return 'bg-rose-50 text-rose-700';
  if (status === 'CANCELADO' || status === 'ESTORNADO') return 'bg-slate-100 text-slate-500';
  return 'bg-amber-50 text-amber-700';
};

export const origemLabel = (item: ContasReceber) => {
  if (item.gatewayProvider === 'mercado_pago' || item.origemPagamento === 'MERCADO_PAGO') return 'Mercado Pago';
  if (item.gatewayProvider === 'banese_card' || item.origemPagamento === 'BANESE') return 'Banese';
  if (item.gatewayProvider === 'banco_inter' || item.origemPagamento === 'BANCO_INTER') return 'Banco Inter';
  if (item.gatewayProvider === 'asaas' || item.origemPagamento === 'ASAAS' || item.asaasPaymentId || item.asaasPaymentLinkId) return 'Asaas';
  if (item.origemPagamento === 'SISTEMA_ANTERIOR') return 'Proesc';
  if (item.origemPagamento === 'PRESENCIAL') return 'Local/Caixa';
  return 'Conta local';
};

export const isPendingOutrosCredito = (status: string) => PENDING_OUTROS_CREDIT_STATUSES.has(status);

