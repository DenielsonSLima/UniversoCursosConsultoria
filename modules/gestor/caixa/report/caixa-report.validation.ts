import type { CaixaCompositionStatus } from './caixa-report.types';

export type JsonRecord = Record<string, unknown>;

export const record = (value: unknown, field: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return value as JsonRecord;
};

export const array = (value: unknown, field: string): JsonRecord[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return value.map((item, index) => record(item, `${field}[${index}]`));
};

export const string = (value: unknown, field: string, nullable = false) => {
  if (nullable && value === null) return '';
  if (typeof value !== 'string') {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return value;
};

export const number = (value: unknown, field: string) => {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return value;
};

export const requiredNumber = (value: unknown, field: string) => {
  const parsed = number(value, field);
  if (parsed === null) throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  return parsed;
};

export const integer = (value: unknown, field: string) => {
  const parsed = requiredNumber(value, field);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return parsed;
};

export const boolean = (value: unknown, field: string) => {
  if (typeof value !== 'boolean') {
    throw new Error(`Contrato inválido do relatório do Caixa: ${field}.`);
  }
  return value;
};

export const composition = (value: unknown): CaixaCompositionStatus => {
  if (
    value !== 'COMPOSICAO_EXPLICITA'
    && value !== 'SEM_DIFERENCA_FINANCEIRA'
    && value !== 'NAO_DISCRIMINADA'
    && value !== 'NAO_DISCRIMINADA_PELO_GATEWAY'
    && value !== 'CONCILIADO_POR_FORMULA_BANESE'
    && value !== 'CONCILIADO_POR_CONFERENCIA_PROESC'
  ) {
    throw new Error('Contrato inválido do relatório do Caixa: composicao_status.');
  }
  return value;
};

