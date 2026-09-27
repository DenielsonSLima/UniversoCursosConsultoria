import type { CategoriaFinanceira, DespesaLancamento } from './despesas.types';

const toUpper = (value?: string | null) => (value || '').trim().toLocaleUpperCase('pt-BR');

export const mapCategoriaFinanceira = (row: any): CategoriaFinanceira => ({
  id: row.id,
  nome: toUpper(row.nome),
  tipo: row.tipo,
  descricao: row.descricao ? toUpper(row.descricao) : undefined,
  status: row.status,
  createdAt: row.created_at,
});

export const normalizeCategoriaFinanceiraInput = (value?: string | null) => toUpper(value);

export const mapLancamento = (row: any): DespesaLancamento => ({
  id: row.id,
  despesaLancamentoId: row.despesa_lancamento_id ?? row.id,
  poloId: row.polo_id,
  poloNome: row.polo_nome ?? row.polos?.nome ?? '',
  tipo: row.tipo,
  descricao: row.descricao,
  valorBase: Number(row.valor_base ?? row.valor ?? 0),
  jurosValor: Number(row.juros_valor || 0),
  multaValor: Number(row.multa_valor || 0),
  descontoValor: Number(row.desconto_valor || 0),
  valor: Number(row.valor || 0),
  dataLancamento: row.data_lancamento ?? undefined,
  dataVencimento: row.data_vencimento,
  dataPagamento: row.data_pagamento ?? undefined,
  valorPago: row.valor_pago !== null && row.valor_pago !== undefined
    ? Number(row.valor_pago)
    : undefined,
  status: row.status,
  categoriaFinanceiraId: row.categoria_financeira_id ?? undefined,
  categoriaNome: row.categoria_nome ?? row.categorias_financeiras?.nome ?? undefined,
  fornecedorId: row.fornecedor_id ?? undefined,
  fornecedorNome: row.fornecedor_nome ?? row.parceiros?.nome ?? undefined,
  formaPagamento: row.forma_pagamento ?? undefined,
  contaBancariaId: row.conta_bancaria_id ?? undefined,
  contaBancariaNome: row.conta_bancaria_nome ?? undefined,
  parcelaNumero: Number(row.parcela_numero || 1),
  totalParcelas: Number(row.total_parcelas || 1),
  grupoParcelas: row.grupo_parcelas_id ?? undefined,
  observacao: row.observacao ?? undefined,
  turmaId: row.turma_id ?? undefined,
  turmaNome: row.turma_nome ?? row.turmas?.nome ?? undefined,
  anexoBucket: row.anexo_bucket ?? undefined,
  anexoPath: row.anexo_path ?? undefined,
  anexoNome: row.anexo_nome ?? undefined,
  anexoMime: row.anexo_mime ?? undefined,
  anexoTamanho: row.anexo_tamanho !== null && row.anexo_tamanho !== undefined
    ? Number(row.anexo_tamanho)
    : undefined,
  cancelamentoMotivo: row.cancelamento_motivo ?? undefined,
  canceladoEm: row.cancelado_em ?? undefined,
  estornadoEm: row.estornado_em ?? undefined,
  createdAt: row.created_at,
  isRateioDerived: Boolean(row.is_rateio_derivado),
  rateioMode: row.rateio_modo ?? 'SEM_RATEIO',
  rateioPolosQuantidade: row.rateio_polos_quantidade !== null
    && row.rateio_polos_quantidade !== undefined
    ? Number(row.rateio_polos_quantidade)
    : undefined,
  poloMatrizId: row.polo_matriz_id ?? undefined,
  poloMatrizNome: row.polo_matriz_nome ?? undefined,
  convenioMesId: row.convenio_mes_id ?? undefined,
  convenioId: row.convenio_id ?? undefined,
  convenioNome: row.convenio_nome ?? undefined,
  convenioCompetencia: row.convenio_competencia ?? undefined,
});
