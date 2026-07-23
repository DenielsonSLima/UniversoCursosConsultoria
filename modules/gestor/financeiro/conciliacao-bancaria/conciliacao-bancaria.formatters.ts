import type { BaneseCnabExchangeFile } from './conciliacao-bancaria.types';
import { BANESE_RECONCILIATION_TIME_ZONE } from './conciliacao-bancaria.utils';

export const formatConciliacaoCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

export const formatConciliacaoDate = (value?: string | null) => {
  if (!value) return '-';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR', {
    timeZone: BANESE_RECONCILIATION_TIME_ZONE,
  });
};

export const formatCnabFileSize = (value: number) => {
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

export const conciliacaoStatusClass = (status: string) => {
  switch (status) {
    case 'PAGO':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'VENCIDO':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    case 'PENDENTE':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
};

export const cnabFileStatusLabel = (status: BaneseCnabExchangeFile['status']) => ({
  PREVIEWED: 'Prévia',
  PROCESSING: 'Processando',
  PROCESSED: 'Processado',
  PARTIAL: 'Parcial',
  REJECTED: 'Rejeitado',
  CREATING: 'Criando',
  GENERATED: 'Gerado',
}[status]);

export const cnabFileStatusClass = (status: BaneseCnabExchangeFile['status']) => {
  if (status === 'PROCESSED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'PREVIEWED') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'PROCESSING' || status === 'PARTIAL') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-rose-200 bg-rose-50 text-rose-700';
};
