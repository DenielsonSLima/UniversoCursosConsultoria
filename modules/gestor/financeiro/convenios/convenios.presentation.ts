import type {
  ConvenioMesStatus,
  ConvenioMovimentoStatus,
  ConvenioMovimentoTipo,
} from './convenios.types';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const month = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export const formatConvenioCurrency = (value: number) => currency.format(value);

export const formatConvenioCompetencia = (value: string) => {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  const formatted = month.format(parsed);
  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`;
};

export const formatConvenioDate = (value: string) => {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

export const convenioStatusLabel = (status: ConvenioMesStatus) => (
  status === 'ABERTO' ? 'Em aberto' : 'Finalizado'
);

export const convenioStatusClass = (status: ConvenioMesStatus) => (
  status === 'ABERTO'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
);

export const movimentoTipoLabel = (tipo: ConvenioMovimentoTipo) => ({
  SALDO_INICIAL: 'Saldo de abertura',
  CREDITO: 'Crédito recebido',
  DESPESA: 'Despesa vinculada',
}[tipo]);

export const movimentoStatusLabel = (status: ConvenioMovimentoStatus) => ({
  CONFIRMADO: 'Confirmado',
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
  ESTORNADO: 'Estornado',
}[status]);

export const parseConvenioCurrencyInput = (value: string) => {
  const normalized = value.replace(/[^\d,-]/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const createConvenioRequestId = () => (
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const random = Math.floor(Math.random() * 16);
        return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
      })
);
