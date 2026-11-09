import type { CategoriaFinanceira, DespesaLancamento } from '../despesas.types';

// Apenas entradas editáveis: nenhum identificador, fornecedor ou evento de baixa é reutilizado.
export function buildDespesaCloneDraft(item: DespesaLancamento) {
  const money = (value: number) => value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return {
    descricao: item.descricao,
    categoriaId: item.categoriaFinanceiraId || '',
    valor: money(item.valorBase),
    jurosValor: money(item.jurosValor),
    multaValor: money(item.multaValor),
    descontoValor: money(item.descontoValor),
    dataLancamento: item.dataLancamento || item.dataVencimento,
    dataVencimento: item.dataVencimento,
    dataPagamento: item.dataPagamento || '',
    formaPagamento: item.formaPagamento || 'PIX',
    contaBancariaId: item.contaBancariaId || '',
    pago: item.status === 'PAGO',
  };
}

export type DespesaCloneDraft = ReturnType<typeof buildDespesaCloneDraft>;

export function resolveDespesaCloneCategoria(id: string, categorias?: CategoriaFinanceira[]) {
  if (!categorias) return id;
  return categorias.some((categoria) => categoria.id === id && categoria.status === 'ativo') ? id : '';
}
