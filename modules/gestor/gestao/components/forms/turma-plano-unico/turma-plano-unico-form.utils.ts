import type { TurmaPlanoUnicoPoloOption } from './turma-plano-unico-form.types';
import type { ParcelaPlanoFinanceiroUnico } from '../../../presencial-financeiro-unico/types';

export const formatCurrencyBRL = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);

export const formatPercentageBR = (value: number) => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);

export const parseCurrencyBRLInput = (value: string) => {
  const sanitized = value.replace(/[^\d,.]/g, '');
  if (!sanitized) return 0;

  const decimalSeparator = sanitized.lastIndexOf(',') >= 0
    ? ','
    : sanitized.lastIndexOf('.') >= 0
      ? '.'
      : '';
  const [integerPart, ...decimalParts] = decimalSeparator
    ? sanitized.split(decimalSeparator)
    : [sanitized];
  const normalizedInteger = integerPart.replace(/\D/g, '') || '0';
  const normalizedDecimal = decimalParts.join('').replace(/\D/g, '');
  const normalized = decimalSeparator
    ? `${normalizedInteger}.${normalizedDecimal}`
    : normalizedInteger;
  const amount = Number(normalized);

  return Number.isFinite(amount) ? Number(Math.max(0, amount).toFixed(2)) : 0;
};

const getValidIsoDateParts = (isoDate: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > lastDay) return null;

  return { year, monthIndex, day };
};

export const formatCivilDate = (isoDate: string, fallback = '—') => {
  const parts = getValidIsoDateParts(isoDate);
  if (!parts) return fallback;
  return `${String(parts.day).padStart(2, '0')}/${String(parts.monthIndex + 1).padStart(2, '0')}/${parts.year}`;
};

export const getPreviewInstallments = (schedule: ParcelaPlanoFinanceiroUnico[]) => {
  if (schedule.length <= 6) return schedule;
  return [...schedule.slice(0, 3), ...schedule.slice(-2)];
};

export const getPoloLabel = (polo?: TurmaPlanoUnicoPoloOption) => {
  if (!polo) return '';
  return polo.nomeFantasia || polo.nome || polo.cidade;
};

export const getFriendlyPlanoUnicoSubmitError = (error: unknown) => {
  const message = error instanceof Error
    ? error.message.trim()
    : String((error as { message?: unknown } | null)?.message || '').trim();
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('row-level security') || lowerMessage.includes('sem permissão')) {
    return 'Seu usuário não tem permissão para abrir uma turma neste polo.';
  }
  if (lowerMessage.includes('duplicate key') || lowerMessage.includes('turmas_codigo_key')) {
    return 'Já existe uma turma com este código. Ajuste curso, turno, polo ou data de início.';
  }
  if (lowerMessage.includes('plano financeiro') || lowerMessage.includes('parcelas')) {
    return message || 'O plano financeiro não foi aceito. Revise valor, parcelas e encargos.';
  }
  return message || 'Não foi possível abrir a turma. Revise os dados e tente novamente.';
};
