import { ContaBancaria } from '../../financeiro.service';
import { DespesaLancamento } from '../despesas.service';

export const formatDespesaCurrency = (value?: number) => (
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
);

export const formatDespesaDate = (value?: string) => (
  value
    ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')
    : 'Não informado'
);

export const formatContaBancaria = (conta: ContaBancaria) => (
  conta.natureza === 'CAIXA_INTERNO'
    ? `${conta.banco} • ${conta.conta}`
    : `${conta.banco} • Ag. ${conta.agencia} • Conta ${conta.conta}`
);

/**
 * A RPC detalhada traz um rótulo imutável da conta usada. Durante a transição
 * da migration, a lista compartilhada de contas mantém a informação visível
 * sem expor uma conta física de rateio derivado para outro polo.
 */
export const getDespesaContaLabel = (
  item: DespesaLancamento,
  contas: ContaBancaria[],
) => {
  if (item.isRateioDerived) return undefined;
  if (item.contaBancariaNome) return item.contaBancariaNome;
  const conta = contas.find((candidate) => candidate.id === item.contaBancariaId);
  return conta ? formatContaBancaria(conta) : undefined;
};

export const getDescricaoSemSufixoDeParcela = (item: DespesaLancamento) => (
  item.totalParcelas > 1
    ? item.descricao.replace(/ \(\d+\/\d+\)$/, '')
    : item.descricao
);

export const isDespesaValorEstimado = (item: DespesaLancamento) => Boolean(item.valorEstimado && !item.valorConfirmadoEm);

export const isDespesaEstimadaPendente = (item: DespesaLancamento) => (
  isDespesaValorEstimado(item) && item.status !== 'CANCELADO' && !item.valorSemCobrancaEm
);

export const getDespesaStatusLabel = (item: DespesaLancamento) => (
  item.valorSemCobrancaEm ? 'Sem cobrança neste mês' : isDespesaEstimadaPendente(item) ? 'Fatura a confirmar' : item.status
);

export const getDespesaEstimativaLabel = (item: DespesaLancamento) => (
  item.valorEstimado ? `${item.valorSemCobrancaEm ? 'Sem cobrança neste mês' : isDespesaValorEstimado(item) ? 'Valor estimado' : 'Valor confirmado'}${
    item.valorEstimadoOriginal != null ? ` · ${item.isRateioDerived ? 'Cota estimada original' : 'Estimativa original'}: ${formatDespesaCurrency(item.valorEstimadoOriginal)}` : ''}` : ''
);

export const hasDespesaPagamentoDetalhado = (item: DespesaLancamento) => (
  item.status === 'PAGO' && !item.isRateioDerived
  && (!item.paymentSummary?.hasEvents || item.pagamentoUnico === true)
);
