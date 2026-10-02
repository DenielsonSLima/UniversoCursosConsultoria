import type {
  CaixaComposicaoDados,
  CaixaComposicaoMensalPayload,
  CaixaComposicaoSecao,
} from './caixa-composicao.types.ts';

type JsonRecord = Record<string, unknown>;

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;
const COMPETENCIA_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^\d+\.\d{2}$/;
const SIGNED_MONEY_PATTERN = /^-?\d+\.\d{2}$/;

function fail(field: string): never {
  throw new Error(`Contrato físico inválido da composição mensal do Caixa: ${field}.`);
}

const record = (value: unknown, field: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field);
  return value as JsonRecord;
};

const exactKeys = (value: JsonRecord, expected: string[], field: string) => {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    fail(field);
  }
};

const date = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) fail(field);
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) fail(field);
  return value;
};

const nextMonth = (competencia: string) => {
  const [year, month] = competencia.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
};

const count = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(field);
  return Number(value);
};

const money = (value: unknown, field: string, signed = false): string => {
  const pattern = signed ? SIGNED_MONEY_PATTERN : MONEY_PATTERN;
  if (typeof value !== 'string' || !pattern.test(value)) fail(field);
  return value;
};

const nullableMoney = (value: unknown, field: string, signed = false): string | null => (
  value === null ? null : money(value, field, signed)
);

const nonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') fail(field);
  return value;
};

const dados = (value: unknown, field: string): CaixaComposicaoDados => {
  const item = record(value, field);
  exactKeys(item, [
    'total',
    'quantidade',
    'base',
    'juros',
    'multa',
    'acrescimo',
    'desconto',
    'diferenca_a_conferir',
    'quantidade_a_conferir',
  ], field);
  return {
    total: money(item.total, `${field}.total`),
    quantidade: count(item.quantidade, `${field}.quantidade`),
    base: nullableMoney(item.base, `${field}.base`),
    juros: nullableMoney(item.juros, `${field}.juros`),
    multa: nullableMoney(item.multa, `${field}.multa`),
    acrescimo: nullableMoney(item.acrescimo, `${field}.acrescimo`),
    desconto: nullableMoney(item.desconto, `${field}.desconto`),
    diferenca_a_conferir: nullableMoney(
      item.diferenca_a_conferir,
      `${field}.diferenca_a_conferir`,
      true,
    ),
    quantidade_a_conferir: count(
      item.quantidade_a_conferir,
      `${field}.quantidade_a_conferir`,
    ),
  };
};

const section = (value: unknown, field: string): CaixaComposicaoSecao => {
  const item = record(value, field);
  exactKeys(item, ['disponivel', 'completo', 'motivo', 'observacao', 'dados'], field);

  if (
    item.disponivel === true
    && item.completo === true
    && item.motivo === null
    && item.observacao === null
  ) {
    const completeData = dados(item.dados, `${field}.dados`);
    if (
      completeData.quantidade_a_conferir !== 0
      || completeData.base === null
      || completeData.juros === null
      || completeData.multa === null
      || completeData.acrescimo === null
      || completeData.desconto === null
      || completeData.diferenca_a_conferir === null
    ) fail(`${field}.dados.completude`);
    return {
      disponivel: true,
      completo: true,
      motivo: null,
      observacao: null,
      dados: completeData,
    };
  }

  if (
    item.disponivel === true
    && item.completo === false
    && item.motivo === 'DADOS_INCOMPLETOS'
  ) {
    const partialData = dados(item.dados, `${field}.dados`);
    if (partialData.quantidade_a_conferir === 0) fail(`${field}.dados.quantidade_a_conferir`);
    return {
      disponivel: true,
      completo: false,
      motivo: 'DADOS_INCOMPLETOS',
      observacao: nonEmptyString(item.observacao, `${field}.observacao`),
      dados: partialData,
    };
  }

  if (
    item.disponivel === false
    && item.completo === false
    && item.motivo === 'FONTE_INDISPONIVEL'
    && item.dados === null
  ) {
    return {
      disponivel: false,
      completo: false,
      motivo: 'FONTE_INDISPONIVEL',
      observacao: nonEmptyString(item.observacao, `${field}.observacao`),
      dados: null,
    };
  }

  return fail(field);
};

export function assertCaixaComposicaoMensalPayload(
  value: unknown,
): asserts value is CaixaComposicaoMensalPayload {
  const payload = record(value, 'payload');
  exactKeys(payload, [
    'versao',
    'competencia',
    'periodo_inicio',
    'periodo_fim_exclusivo',
    'escopo_tipo',
    'polo_id',
    'gerado_em',
    'recebimentos',
    'despesas',
  ], 'payload');

  if (payload.versao !== 1) fail('versao');
  const competencia = date(payload.competencia, 'competencia');
  if (!COMPETENCIA_PATTERN.test(competencia)) fail('competencia');
  if (date(payload.periodo_inicio, 'periodo_inicio') !== competencia) fail('periodo_inicio');
  if (date(payload.periodo_fim_exclusivo, 'periodo_fim_exclusivo') !== nextMonth(competencia)) {
    fail('periodo_fim_exclusivo');
  }

  const isGlobal = payload.escopo_tipo === 'GLOBAL' && payload.polo_id === null;
  const isPolo = payload.escopo_tipo === 'POLO'
    && typeof payload.polo_id === 'string'
    && UUID_PATTERN.test(payload.polo_id);
  if (!isGlobal && !isPolo) fail('escopo');

  if (
    typeof payload.gerado_em !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(payload.gerado_em)
    || !Number.isFinite(Date.parse(payload.gerado_em))
  ) fail('gerado_em');

  section(payload.recebimentos, 'recebimentos');
  section(payload.despesas, 'despesas');
}

export const isCaixaComposicaoMensalPayload = (
  value: unknown,
): value is CaixaComposicaoMensalPayload => {
  try {
    assertCaixaComposicaoMensalPayload(value);
    return true;
  } catch {
    return false;
  }
};
