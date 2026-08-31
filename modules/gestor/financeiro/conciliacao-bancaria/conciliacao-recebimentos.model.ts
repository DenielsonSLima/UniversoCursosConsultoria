import type {
  BaneseReceivable,
  ConciliacaoChannelCounts,
  FetchConciliacaoParams,
} from './conciliacao-bancaria.fetch';
import type { CanalBaixaConciliacao } from './conciliacao-bancaria.utils';

type JsonRecord = Record<string, unknown>;

const RECEIPT_CHANNELS = new Set<CanalBaixaConciliacao>([
  'API_BANESE',
  'CNAB240',
  'CAIXA_MANUAL',
  'HISTORICO_MIGRADO',
  'MERCADO_PAGO',
  'OUTRO',
]);

export const asReceiptRecord = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
);

const asString = (value: unknown) => {
  const normalized = value === null || value === undefined
    ? ''
    : String(value).trim();
  return normalized || undefined;
};

const asNumber = (value: unknown, fallback = 0) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
};

const asNullableNumber = (value: unknown) => (
  value === null || value === undefined ? null : asNumber(value)
);

const originToChannel = (value: unknown): CanalBaixaConciliacao => {
  switch (asString(value)?.toUpperCase()) {
    case 'AUTOMATICA_BANESE': return 'API_BANESE';
    case 'MANUAL': return 'CAIXA_MANUAL';
    case 'HISTORICO_MIGRADO': return 'HISTORICO_MIGRADO';
    case 'CNAB240': return 'CNAB240';
    case 'MERCADO_PAGO': return 'MERCADO_PAGO';
    default: return 'OUTRO';
  }
};

export const channelToFinancialReceiptOrigin = (
  channel: FetchConciliacaoParams['canal'],
) => {
  switch (channel) {
    case 'API_BANESE': return 'AUTOMATICA_BANESE';
    case 'CAIXA_MANUAL': return 'MANUAL';
    case 'HISTORICO_MIGRADO': return 'HISTORICO_MIGRADO';
    case 'CNAB240': return 'CNAB240';
    case 'MERCADO_PAGO': return 'MERCADO_PAGO';
    case 'OUTRO': return 'OUTRO';
    default: return 'TODOS';
  }
};

export const shouldUseFinancialReceiptsFeed = (
  params: FetchConciliacaoParams,
) => (
  String(params.status || '').toUpperCase() === 'PAGO'
  || (params.canal !== undefined
    && params.canal !== 'TODOS'
    && RECEIPT_CHANNELS.has(params.canal))
);

export const mapFinancialReceipt = (value: unknown): BaneseReceivable => {
  const row = asReceiptRecord(value);
  const origin = asString(row.origem) || 'OUTRO';

  return {
    id: asString(row.id) || '',
    descricao: asString(row.descricao) || 'Recebimento',
    status: 'PAGO',
    valor: asNumber(row.valor_nominal),
    dataVencimento: asString(row.data_vencimento) || '',
    dataPagamento: asString(row.data_pagamento),
    valorPago: asNullableNumber(row.valor_pago) ?? undefined,
    nossoNumero: asString(row.nosso_numero),
    canalBaixa: originToChannel(origin),
    empresaId: asString(row.empresa_id),
    empresaNome: asString(row.empresa_nome),
    poloId: asString(row.polo_id),
    poloNome: asString(row.polo_nome),
    clienteNome: asString(row.cliente_nome),
    clienteDocumentoMascarado: asString(row.cliente_cpf_cnpj),
    baixaRegistradaEm: asString(row.baixa_registrada_em),
    baixaTempoProveniencia: asString(row.baixa_tempo_proveniencia),
    cursoNome: asString(row.curso_nome),
    turmaNome: asString(row.turma_nome),
    matriculaCodigo: asString(row.matricula_codigo),
    parcelaLabel: asString(row.parcela_label),
    jurosAplicados: asNullableNumber(row.juros_aplicados),
    multaAplicada: asNullableNumber(row.multa_aplicada),
    acrescimoAplicado: asNullableNumber(row.acrescimo_aplicado),
    descontoAplicado: asNullableNumber(row.desconto_aplicado),
    diferencaNaoDiscriminada: asNullableNumber(row.diferenca_nao_discriminada),
    composicaoStatus: asString(row.composicao_status),
    composicaoProveniencia: asString(row.composicao_proveniencia),
    formaPagamento: asString(row.forma_pagamento),
    origemRecebimento: origin,
    operadorNome: asString(row.operador_nome),
    contaRecebedoraNome: asString(row.conta_recebedora_nome),
    comprovanteUrl: asString(row.comprovante_url),
  };
};

export const mapFinancialReceiptCounts = (
  value: unknown,
): ConciliacaoChannelCounts => {
  const counts = asReceiptRecord(value);
  return {
    totalCount: asNumber(counts.total),
    pendenteCount: 0,
    apiCount: asNumber(counts.automatica_banese),
    cnabCount: asNumber(counts.cnab240),
    caixaCount: asNumber(counts.manual),
    historicoCount: asNumber(counts.historico_migrado),
    mpCount: asNumber(counts.mercado_pago),
    outroCount: asNumber(counts.outro),
  };
};

export const receiptNumber = asNumber;
