import { isCaixaCanonicalDecimalText } from '../caixa.formatters.ts';
import type {
  CaixaWorkspaceAvailableSection,
  CaixaWorkspaceIncompleteCode,
} from './caixa-workspace.types.ts';

export type JsonRecord = Record<string, unknown>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/;
const MONEY_PATTERN = /^\d+\.\d{2}$/;
const consideredSourcesContract = [
  ['public.contas_pagar', 'TITULOS_LEGADOS'],
  ['public.despesas_lancamentos', 'DESPESAS'],
  ['public.despesas_lancamentos_rateios', 'RATEIO_ECONOMICO'],
] as const;
const incompleteCodes = new Set<CaixaWorkspaceIncompleteCode>([
  'OBRIGACOES_SEM_VENCIMENTO',
  'OBRIGACOES_SEM_DATA_REGISTRO',
  'PAGAMENTOS_SEM_DATA',
  'PAGAMENTOS_SEM_VALOR',
  'PAGAMENTOS_PARCIAIS_SEM_ESTADO_CANONICO',
  'CANCELAMENTOS_E_EXCLUSOES_SEM_VIGENCIA_HISTORICA',
]);

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const SNAPSHOT_PATTERN = /^caixa-v2-[0-9a-f]{32}$/;

export const fail = (field: string): never => {
  throw new Error(`Contrato físico inválido do Caixa Workspace v2: ${field}.`);
};

export const record = (value: unknown, field: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field);
  return value as JsonRecord;
};

export const exactKeys = (value: JsonRecord, expected: string[], field: string) => {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    fail(field);
  }
};

export const count = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(field);
  return Number(value);
};

export const money = (value: unknown, field: string): string => {
  if (
    !isCaixaCanonicalDecimalText(value)
    || typeof value !== 'string'
    || !MONEY_PATTERN.test(value)
  ) fail(field);
  return value as string;
};

export const date = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) fail(field);
  const canonical = value as string;
  const [year, month, day] = canonical.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) fail(field);
  return canonical;
};

export const timestamp = (value: unknown, field: string): string => {
  if (
    typeof value !== 'string'
    || !TIMESTAMP_PATTERN.test(value)
    || !Number.isFinite(Date.parse(value))
  ) fail(field);
  return value as string;
};

export const addDays = (canonical: string, days: number): string => {
  const [year, month, day] = canonical.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

export const startOfNextMonth = (canonical: string): string => {
  const [year, month] = canonical.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
};

export const moneyCount = (value: unknown, field: string): JsonRecord => {
  const item = record(value, field);
  exactKeys(item, ['valor', 'quantidade'], field);
  money(item.valor, `${field}.valor`);
  count(item.quantidade, `${field}.quantidade`);
  return item;
};

export const consideredSources = (value: unknown, field: string) => {
  if (!Array.isArray(value) || value.length !== consideredSourcesContract.length) fail(field);
  (value as unknown[]).forEach((rawSource, index) => {
    const source = record(rawSource, `${field}[${index}]`);
    exactKeys(source, ['fonte', 'finalidade'], `${field}[${index}]`);
    const expected = consideredSourcesContract[index];
    if (source.fonte !== expected[0] || source.finalidade !== expected[1]) {
      fail(`${field}[${index}]`);
    }
  });
};

export const unavailableSources = (value: unknown, field: string): JsonRecord[] => {
  if (!Array.isArray(value)) fail(field);
  const sources = (value as unknown[]).map((rawSource, index) => {
    const source = record(rawSource, `${field}[${index}]`);
    exactKeys(source, ['fonte', 'motivo'], `${field}[${index}]`);
    const validLater = (
      source.fonte === 'CONTAS_A_RECEBER_CANONICA'
      || source.fonte === 'INADIMPLENCIA_CANONICA'
    ) && source.motivo === 'ETAPA_POSTERIOR';
    const validHistorical = source.fonte === 'VIGENCIA_HISTORICA_CANCELAMENTOS_EXCLUSOES'
      && source.motivo === 'FONTE_NAO_BITEMPORAL';
    if (!validLater && !validHistorical) fail(`${field}[${index}]`);
    return source;
  });
  if (new Set(sources.map((source) => source.fonte)).size !== sources.length) fail(field);
  return sources;
};

export const exactUnavailableSources = (
  actual: JsonRecord[],
  expected: ReadonlyArray<readonly [string, string]>,
  field: string,
) => {
  if (
    actual.length !== expected.length
    || actual.some((source, index) => (
      source.fonte !== expected[index][0] || source.motivo !== expected[index][1]
    ))
  ) fail(field);
};

export const incompleteReasons = (
  value: unknown,
  field: string,
): CaixaWorkspaceIncompleteCode[] => {
  if (!Array.isArray(value)) fail(field);
  const reasons = (value as unknown[]).map((item, index) => {
    if (typeof item !== 'string' || !incompleteCodes.has(item as CaixaWorkspaceIncompleteCode)) {
      fail(`${field}[${index}]`);
    }
    return item as CaixaWorkspaceIncompleteCode;
  });
  if (new Set(reasons).size !== reasons.length) fail(field);
  return reasons;
};

export const sameReasons = (
  actual: CaixaWorkspaceIncompleteCode[],
  expected: CaixaWorkspaceIncompleteCode[],
  field: string,
) => {
  if (
    actual.length !== expected.length
    || actual.some((reason, index) => reason !== expected[index])
  ) fail(field);
};

export const laterSection = (value: unknown, field: string) => {
  const section = record(value, field);
  exactKeys(section, ['disponivel', 'completo', 'motivo', 'observacao', 'dados'], field);
  if (
    section.disponivel !== false
    || section.completo !== false
    || section.motivo !== 'ETAPA_POSTERIOR'
    || typeof section.observacao !== 'string'
    || section.observacao.trim() === ''
    || section.dados !== null
  ) fail(field);
};

export const availableSection = <T>(
  value: unknown,
  field: string,
  validateData: (data: unknown, field: string) => T,
): CaixaWorkspaceAvailableSection<T> => {
  const section = record(value, field);
  exactKeys(section, ['disponivel', 'completo', 'motivo', 'observacao', 'dados'], field);
  if (
    section.disponivel !== true
    || typeof section.completo !== 'boolean'
    || typeof section.observacao !== 'string'
    || section.observacao.trim() === ''
    || (section.completo === true && section.motivo !== null)
    || (section.completo === false && section.motivo !== 'DADOS_INCOMPLETOS')
  ) fail(field);
  validateData(section.dados, `${field}.dados`);
  return section as unknown as CaixaWorkspaceAvailableSection<T>;
};
