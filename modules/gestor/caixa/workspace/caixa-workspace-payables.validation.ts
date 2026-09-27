import { isCaixaCanonicalDecimalText } from '../caixa.formatters';
import type {
  CaixaWorkspacePayablesFilter,
  CaixaWorkspacePayablesPayload,
} from './caixa-workspace-payables.types';
import { UUID_PATTERN, date, exactKeys, record } from './caixa-workspace.validation';

const SNAPSHOT_PATTERN = /^caixa-v2-drilldown-[0-9a-f]{32}$/;
const keyPrefixes = new Set(['CONTA_PAGAR', 'DESPESA', 'RATEIO']);
const filters = new Set<CaixaWorkspacePayablesFilter>([
  'ATRASADAS',
  'HOJE',
  'PROXIMOS_7_DIAS',
  'COMPETENCIA',
  'PAGAS_COMPETENCIA',
  'A_VENCER_COMPETENCIA',
]);
const sources = new Set(['CONTA_PAGAR_LEGADA', 'DESPESA', 'RATEIO_ECONOMICO']);

const fail = (field: string): never => {
  throw new Error(`Contrato inválido do drill-down do Caixa Workspace v2: ${field}.`);
};

const integer = (value: unknown, field: string, minimum = 0) => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) fail(field);
  return Number(value);
};

const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') fail(field);
  return value as string;
};

const money = (value: unknown, field: string) => {
  if (!isCaixaCanonicalDecimalText(value) || !/^\d+\.\d{2}$/.test(value)) fail(field);
};

export const assertCaixaWorkspacePayablesPayload: (
  value: unknown,
) => asserts value is CaixaWorkspacePayablesPayload = (value) => {
  const payload = record(value, 'payload');
  exactKeys(payload, ['versao', 'meta', 'filtro', 'paginacao', 'itens'], 'payload');
  if (payload.versao !== 2 || !filters.has(payload.filtro as CaixaWorkspacePayablesFilter)) {
    fail('versao_ou_filtro');
  }

  const meta = record(payload.meta, 'meta');
  exactKeys(meta, [
    'snapshot_id', 'empresa_id', 'polo_id', 'escopo_tipo', 'competencia',
    'periodo_inicio', 'periodo_fim_exclusivo', 'data_corte', 'data_institucional',
    'timezone', 'criterio', 'unidade_contagem', 'all_polos_admin_global_sistema',
  ], 'meta');
  if (typeof meta.snapshot_id !== 'string' || !SNAPSHOT_PATTERN.test(meta.snapshot_id)) {
    fail('meta.snapshot_id');
  }
  if (typeof meta.empresa_id !== 'string' || !UUID_PATTERN.test(meta.empresa_id)) {
    fail('meta.empresa_id');
  }
  const globalScope = meta.escopo_tipo === 'GLOBAL' && meta.polo_id === null;
  const poloScope = meta.escopo_tipo === 'POLO'
    && typeof meta.polo_id === 'string'
    && UUID_PATTERN.test(meta.polo_id);
  if (!globalScope && !poloScope) fail('meta.escopo');
  const competence = date(meta.competencia, 'meta.competencia');
  if (
    date(meta.periodo_inicio, 'meta.periodo_inicio') !== competence
    || !competence.endsWith('-01')
    || date(meta.data_corte, 'meta.data_corte') < competence
  ) fail('meta.periodo');
  date(meta.periodo_fim_exclusivo, 'meta.periodo_fim_exclusivo');
  date(meta.data_institucional, 'meta.data_institucional');
  if (
    meta.timezone !== 'America/Maceio'
    || meta.criterio !== 'POSICAO_REEXPRESSA_NO_CORTE'
    || meta.unidade_contagem !== 'LINHA_ECONOMICA'
    || meta.all_polos_admin_global_sistema !== true
  ) fail('meta.criterios');

  const pagination = record(payload.paginacao, 'paginacao');
  exactKeys(pagination, [
    'pagina', 'tamanho_pagina', 'total_itens', 'total_paginas',
    'tem_anterior', 'tem_proxima',
  ], 'paginacao');
  integer(pagination.pagina, 'paginacao.pagina', 1);
  const size = integer(pagination.tamanho_pagina, 'paginacao.tamanho_pagina', 1);
  integer(pagination.total_itens, 'paginacao.total_itens');
  integer(pagination.total_paginas, 'paginacao.total_paginas');
  if (
    size > 100
    || typeof pagination.tem_anterior !== 'boolean'
    || typeof pagination.tem_proxima !== 'boolean'
  ) fail('paginacao.coerencia');

  const items = Array.isArray(payload.itens) ? payload.itens : fail('itens');
  if (items.length > size) fail('itens');
  items.forEach((rawItem, index) => {
    const field = `itens[${index}]`;
    const item = record(rawItem, field);
    exactKeys(item, [
      'chave', 'fonte', 'polo', 'descricao', 'status', 'datas',
      'valor_programado', 'valor_pago', 'saldo_aberto',
    ], field);
    const itemKey = text(item.chave, `${field}.chave`);
    const [keyPrefix, keyId, extraKeyPart] = itemKey.split(':');
    if (
      extraKeyPart !== undefined
      || !keyPrefixes.has(keyPrefix)
      || typeof keyId !== 'string'
      || !UUID_PATTERN.test(keyId)
    ) {
      fail(`${field}.chave`);
    }
    if (!sources.has(String(item.fonte))) fail(`${field}.fonte`);
    const polo = record(item.polo, `${field}.polo`);
    exactKeys(polo, ['id', 'nome'], `${field}.polo`);
    if (typeof polo.id !== 'string' || !UUID_PATTERN.test(polo.id)) fail(`${field}.polo.id`);
    text(polo.nome, `${field}.polo.nome`);
    text(item.descricao, `${field}.descricao`);
    text(item.status, `${field}.status`);
    const dates = record(item.datas, `${field}.datas`);
    exactKeys(dates, ['vencimento', 'pagamento', 'registro'], `${field}.datas`);
    date(dates.vencimento, `${field}.datas.vencimento`);
    if (dates.pagamento !== null) date(dates.pagamento, `${field}.datas.pagamento`);
    date(dates.registro, `${field}.datas.registro`);
    money(item.valor_programado, `${field}.valor_programado`);
    money(item.valor_pago, `${field}.valor_pago`);
    money(item.saldo_aberto, `${field}.saldo_aberto`);
  });
};
