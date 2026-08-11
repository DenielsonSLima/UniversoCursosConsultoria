import type {
  EmprestimoContaCredito,
  EmprestimoFinanceiro,
  EmprestimoParcela,
  EmprestimoParcelaRateio,
  EmprestimoParcelaStatus,
  EmprestimoRateioModo,
  EmprestimoRateioStatus,
  EmprestimoStatus,
} from './emprestimos.types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const asRecord = (value: unknown): UnknownRecord => (isRecord(value) ? value : {});

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

const asOptionalString = (value: unknown) => {
  const normalized = asString(value).trim();
  return normalized || undefined;
};

const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asOptionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const uniquePoloIds = (values: Iterable<unknown>) => Array.from(new Set(
  Array.from(values, asString).map((value) => value.trim()).filter(Boolean),
));

const asEmprestimoStatus = (value: unknown): EmprestimoStatus => {
  if (value === 'QUITADO' || value === 'CANCELADO') return value;
  return 'ATIVO';
};

const asParcelaStatus = (value: unknown): EmprestimoParcelaStatus => {
  if (value === 'PAGO' || value === 'VENCIDO' || value === 'CANCELADO') return value;
  return 'PENDENTE';
};

const asRateioStatus = (value: unknown): EmprestimoRateioStatus => (
  asParcelaStatus(value)
);

const asRateioModo = (
  value: unknown,
  hasRateios: boolean,
): EmprestimoRateioModo => {
  if (value === 'TODOS' || value === 'SELECIONADOS' || value === 'SEM_RATEIO') return value;
  // Compatibilidade de leitura para uma resposta antiga que tenha rateios,
  // mas ainda não exponha o modo explicitamente.
  return hasRateios ? 'SELECIONADOS' : 'SEM_RATEIO';
};

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const mapContaCredito = (value: unknown): EmprestimoContaCredito | undefined => {
  const row = asRecord(parseJson(value));
  const id = asOptionalString(row.id);
  if (!id) return undefined;

  return {
    id,
    banco: asString(row.banco),
    titular: asString(row.titular),
    agencia: asString(row.agencia),
    conta: asString(row.conta),
    natureza: row.natureza === 'CAIXA_INTERNO' ? 'CAIXA_INTERNO' : 'BANCARIA',
  };
};

export const mapEmprestimoParcelaRateio = (value: unknown): EmprestimoParcelaRateio => {
  const row = asRecord(parseJson(value));
  return {
    id: asString(row.id),
    poloId: asString(row.polo_id ?? row.poloId),
    poloNome: asString(row.polo_nome ?? row.poloNome ?? row.nome),
    valorPrincipal: asNumber(row.valor_principal ?? row.valorPrincipal),
    valorEncargos: asNumber(row.valor_encargos ?? row.valorEncargos),
    valorTotal: asNumber(row.valor_total ?? row.valorTotal),
    valorPago: asOptionalNumber(row.valor_pago ?? row.valorPago),
    status: asRateioStatus(row.status),
  };
};

export const mapEmprestimoParcela = (value: unknown): EmprestimoParcela => {
  const row = asRecord(parseJson(value));
  const rateios = asArray(row.rateios ?? row.emprestimo_parcela_rateios)
    .map(mapEmprestimoParcelaRateio);
  const valorPago = row.valor_pago ?? row.valorPago;

  return {
    id: asString(row.id),
    numero: asNumber(row.numero ?? row.parcela_numero),
    dataVencimento: asString(row.data_vencimento ?? row.dataVencimento),
    valorPrincipal: asNumber(row.valor_principal ?? row.valorPrincipal),
    valorEncargos: asNumber(row.valor_encargos ?? row.valorEncargos),
    valorTotal: asNumber(row.valor_total ?? row.valorTotal),
    status: asParcelaStatus(row.status),
    dataPagamento: asOptionalString(row.data_pagamento ?? row.dataPagamento),
    valorPago: valorPago === null || valorPago === undefined
      ? undefined
      : asNumber(valorPago),
    jurosValor: asOptionalNumber(row.juros_valor ?? row.jurosValor),
    multaValor: asOptionalNumber(row.multa_valor ?? row.multaValor),
    descontoValor: asOptionalNumber(row.desconto_valor ?? row.descontoValor),
    observacaoBaixa: asOptionalString(row.observacao_baixa ?? row.observacaoBaixa),
    contaPagarId: asOptionalString(row.conta_pagar_id ?? row.contaPagarId),
    rateios,
  };
};

export const mapEmprestimoFinanceiro = (value: unknown): EmprestimoFinanceiro => {
  const row = asRecord(parseJson(value));
  const parcelas = asArray(row.parcelas ?? row.emprestimo_parcelas)
    .map(mapEmprestimoParcela);
  // A criação devolve rateio_polos; a listagem devolve os rateios de cada
  // parcela. Unimos somente os IDs canônicos para invalidar cada Caixa
  // afetado, sem inferir valor ou rateio no cliente.
  const rateioPoloIds = uniquePoloIds([
    ...asArray(row.rateio_polos ?? row.rateioPolos)
      .map((rateio) => {
        const rateioRow = asRecord(parseJson(rateio));
        return rateioRow.polo_id ?? rateioRow.poloId;
      }),
    ...parcelas.flatMap((parcela) => parcela.rateios.map((rateio) => rateio.poloId)),
  ]);

  return {
    id: asString(row.id),
    poloResponsavelId: asString(
      row.polo_responsavel_id
      ?? row.polo_responsavelId
      ?? row.polo_matriz_id
      ?? row.poloMatrizId,
    ),
    poloResponsavelNome: asOptionalString(
      row.polo_responsavel_nome
      ?? row.polo_responsavelNome
      ?? row.polo_matriz_nome
      ?? row.poloMatrizNome,
    ),
    poloResponsavelIsMatriz: row.polo_responsavel_is_matriz === true
      || row.poloResponsavelIsMatriz === true
      || row.is_matriz === true,
    rateioModo: asRateioModo(
      row.rateio_modo ?? row.rateioModo,
      parcelas.some((parcela) => parcela.rateios.length > 0),
    ),
    credorParceiroId: asOptionalString(
      row.credor_parceiro_id ?? row.credorParceiroId,
    ),
    credorNome: asString(row.credor_nome ?? row.credorNome),
    descricao: asString(row.descricao),
    valorLiberado: asNumber(row.valor_liberado ?? row.valorLiberado),
    valorTotalDivida: asNumber(row.valor_total_divida ?? row.valorTotalDivida),
    valorEncargos: asNumber(row.valor_encargos ?? row.valorEncargos),
    valorPago: asOptionalNumber(row.valor_pago ?? row.valorPago),
    valorPendente: asOptionalNumber(row.valor_pendente ?? row.valorPendente),
    dataLiberacao: asString(row.data_liberacao ?? row.dataLiberacao),
    contaCredito: mapContaCredito(row.conta_credito ?? row.contaCredito),
    totalParcelas: asNumber(row.total_parcelas ?? row.totalParcelas),
    status: asEmprestimoStatus(row.status),
    observacao: asOptionalString(row.observacao),
    cancelamentoMotivo: asOptionalString(row.cancelamento_motivo ?? row.cancelamentoMotivo),
    canceladoEm: asOptionalString(row.cancelado_em ?? row.canceladoEm),
    estornadoEm: asOptionalString(row.estornado_em ?? row.estornadoEm),
    possuiBaixa: row.possui_baixa === true || row.possuiBaixa === true,
    rateioPoloIds,
    parcelas,
  };
};

export const mapEmprestimosFinanceiros = (value: unknown): EmprestimoFinanceiro[] => {
  const payload = parseJson(value);
  const row = asRecord(payload);
  const items = Array.isArray(payload)
    ? payload
    : asArray(row.items ?? row.emprestimos ?? row.data);

  return items.map(mapEmprestimoFinanceiro).filter((item) => Boolean(item.id));
};
