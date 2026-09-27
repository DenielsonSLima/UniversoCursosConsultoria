import type {
  ConvenioFinanceiroMes,
  ConvenioMesDetalhe,
  ConvenioMesStatus,
  ConvenioMovimento,
  ConvenioMovimentoStatus,
  ConvenioMovimentoTipo,
  ConveniosListResult,
  ConveniosResumo,
  CriarConvenioResult,
  FinalizarConvenioMesResult,
  LancarConvenioCreditoResult,
} from './convenios.types';

type JsonRecord = Record<string, unknown>;

const record = (value: unknown, field: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Contrato inválido de Convênios: ${field}.`);
  }
  return value as JsonRecord;
};

const list = (value: unknown, field: string) => {
  if (!Array.isArray(value)) throw new Error(`Contrato inválido de Convênios: ${field}.`);
  return value;
};

const string = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Contrato inválido de Convênios: ${field}.`);
  }
  return value;
};

const optionalString = (value: unknown, field: string) => {
  if (value === null || value === undefined || value === '') return null;
  return string(value, field);
};

const number = (value: unknown, field: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Contrato inválido de Convênios: ${field}.`);
  return parsed;
};

const integer = (value: unknown, field: string) => {
  const parsed = number(value, field);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Contrato inválido de Convênios: ${field}.`);
  }
  return parsed;
};

const boolean = (value: unknown, field: string) => {
  if (typeof value !== 'boolean') throw new Error(`Contrato inválido de Convênios: ${field}.`);
  return value;
};

const status = (value: unknown, field: string): ConvenioMesStatus => {
  if (value !== 'ABERTO' && value !== 'FINALIZADO') {
    throw new Error(`Contrato inválido de Convênios: ${field}.`);
  }
  return value;
};

export const mapConvenioMes = (value: unknown, field = 'item'): ConvenioFinanceiroMes => {
  const item = record(value, field);
  return {
    id: string(item.id, `${field}.id`),
    convenioId: string(item.convenio_id, `${field}.convenio_id`),
    nome: string(item.convenio_nome, `${field}.convenio_nome`),
    parceiroId: optionalString(item.parceiro_id, `${field}.parceiro_id`),
    parceiroNome: optionalString(item.parceiro_nome, `${field}.parceiro_nome`),
    poloId: string(item.polo_id, `${field}.polo_id`),
    poloNome: string(item.polo_nome, `${field}.polo_nome`),
    competencia: string(item.competencia, `${field}.competencia`),
    status: status(item.status, `${field}.status`),
    saldoInicial: number(item.saldo_inicial, `${field}.saldo_inicial`),
    creditos: number(item.creditos, `${field}.creditos`),
    despesasPagas: number(item.despesas_pagas, `${field}.despesas_pagas`),
    despesasPendentes: number(item.despesas_pendentes, `${field}.despesas_pendentes`),
    saldoDisponivel: number(item.saldo_disponivel, `${field}.saldo_disponivel`),
    saldoProjetado: number(item.saldo_projetado, `${field}.saldo_projetado`),
    quantidadeCreditos: integer(item.quantidade_creditos, `${field}.quantidade_creditos`),
    quantidadeDespesas: integer(item.quantidade_despesas, `${field}.quantidade_despesas`),
    fechadoEm: optionalString(item.fechado_em, `${field}.fechado_em`),
    observacao: optionalString(item.observacao, `${field}.observacao`),
    sucessoraId: optionalString(item.sucessora_id, `${field}.sucessora_id`),
  };
};

const mapResumo = (value: unknown): ConveniosResumo => {
  const resumo = record(value, 'resumo');
  return {
    conveniosAtivos: integer(resumo.convenios_ativos, 'resumo.convenios_ativos'),
    mesesAbertos: integer(resumo.meses_abertos, 'resumo.meses_abertos'),
    mesesFinalizados: integer(resumo.meses_finalizados, 'resumo.meses_finalizados'),
    saldoInicial: number(resumo.saldo_inicial, 'resumo.saldo_inicial'),
    creditos: number(resumo.creditos, 'resumo.creditos'),
    despesasPagas: number(resumo.despesas_pagas, 'resumo.despesas_pagas'),
    despesasPendentes: number(resumo.despesas_pendentes, 'resumo.despesas_pendentes'),
    saldoDisponivel: number(resumo.saldo_disponivel, 'resumo.saldo_disponivel'),
    saldoProjetado: number(resumo.saldo_projetado, 'resumo.saldo_projetado'),
  };
};

export const mapConveniosList = (value: unknown): ConveniosListResult => {
  const payload = record(value, 'lista');
  if (payload.versao !== 1) throw new Error('Contrato inválido de Convênios: lista.versao.');
  return {
    versao: 1,
    resumo: mapResumo(payload.resumo),
    itens: list(payload.itens, 'lista.itens').map((item, index) => mapConvenioMes(item, `itens[${index}]`)),
  };
};

const movimentoTipo = (value: unknown, field: string): ConvenioMovimentoTipo => {
  if (value !== 'SALDO_INICIAL' && value !== 'CREDITO' && value !== 'DESPESA') {
    throw new Error(`Contrato inválido de Convênios: ${field}.`);
  }
  return value;
};

const movimentoStatus = (value: unknown, field: string): ConvenioMovimentoStatus => {
  const statuses: ConvenioMovimentoStatus[] = ['CONFIRMADO', 'PENDENTE', 'PAGO', 'CANCELADO', 'ESTORNADO'];
  if (!statuses.includes(value as ConvenioMovimentoStatus)) {
    throw new Error(`Contrato inválido de Convênios: ${field}.`);
  }
  return value as ConvenioMovimentoStatus;
};

const mapMovimento = (value: unknown, index: number): ConvenioMovimento => {
  const field = `movimentos[${index}]`;
  const item = record(value, field);
  return {
    id: string(item.id, `${field}.id`),
    tipo: movimentoTipo(item.tipo, `${field}.tipo`),
    status: movimentoStatus(item.status, `${field}.status`),
    data: string(item.data, `${field}.data`),
    descricao: string(item.descricao, `${field}.descricao`),
    valor: number(item.valor, `${field}.valor`),
    contaNome: optionalString(item.conta_nome, `${field}.conta_nome`),
    origemId: optionalString(item.origem_id, `${field}.origem_id`),
    observacao: optionalString(item.observacao, `${field}.observacao`),
  };
};

export const mapConvenioDetail = (value: unknown): ConvenioMesDetalhe => {
  const payload = record(value, 'detalhe');
  if (payload.versao !== 1) throw new Error('Contrato inválido de Convênios: detalhe.versao.');
  return {
    versao: 1,
    mes: mapConvenioMes(payload.mes, 'detalhe.mes'),
    movimentos: list(payload.movimentos, 'detalhe.movimentos').map(mapMovimento),
  };
};

const mapMutationBase = (value: unknown, field: string) => {
  const payload = record(value, field);
  return { payload, replayed: boolean(payload.replayed, `${field}.replayed`) };
};

export const mapCriarConvenioResult = (value: unknown): CriarConvenioResult => {
  const { payload, replayed } = mapMutationBase(value, 'criar');
  return { replayed, mes: mapConvenioMes(payload.mes, 'criar.mes') };
};

export const mapLancarCreditoResult = (value: unknown): LancarConvenioCreditoResult => {
  const { payload, replayed } = mapMutationBase(value, 'credito');
  return { replayed, mes: mapConvenioMes(payload.mes, 'credito.mes') };
};

export const mapFinalizarMesResult = (value: unknown): FinalizarConvenioMesResult => {
  const { payload, replayed } = mapMutationBase(value, 'finalizar');
  return {
    replayed,
    mesFechado: mapConvenioMes(payload.mes_fechado, 'finalizar.mes_fechado'),
    proximaMes: payload.proxima_mes === null
      ? null
      : mapConvenioMes(payload.proxima_mes, 'finalizar.proxima_mes'),
  };
};
