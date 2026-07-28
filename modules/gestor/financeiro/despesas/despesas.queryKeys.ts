// File: modules/gestor/financeiro/despesas/despesas.queryKeys.ts

export type DespesaTipo = 'DESPESA_FIXA' | 'DESPESA_VARIAVEL' | 'OUTRO_DEBITO';
export type CategoriaFinanceiraTipo = DespesaTipo | 'OUTRO_CREDITO';
export type DespesaStatusScope = 'mes_atual' | 'em_aberto' | 'todos';

export interface DespesasFilters {
  tipo?: DespesaTipo;
  poloId?: string;
  dataInicio?: string;
  dataFim?: string;
  categoriaId?: string;
  statusScope?: DespesaStatusScope;
  search?: string;
  turmaId?: string;
}

export const despesasQueryKeys = {
  all: ['despesas'] as const,

  // Lançamentos
  lancamentosRoot: ['despesas', 'lancamentos'] as const,
  lancamentosList: (filters: DespesasFilters) =>
    ['despesas', 'lancamentos', 'list', filters] as const,

  // Resumo canônico calculado no banco
  summaryRoot: ['despesas', 'summary'] as const,
  summaryList: (filters: DespesasFilters) =>
    ['despesas', 'summary', filters] as const,

  // Resumo canônico por categoria calculado no banco
  groupSummaryRoot: ['despesas', 'group-summary'] as const,
  groupSummaryList: (filters: DespesasFilters) =>
    ['despesas', 'group-summary', filters] as const,

  // Categorias Financeiras
  categoriasRoot: ['despesas', 'categorias-financeiras'] as const,
  categoriasList: (tipo?: CategoriaFinanceiraTipo) =>
    ['despesas', 'categorias-financeiras', 'list', tipo ?? 'all'] as const,
};
