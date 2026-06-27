// File: modules/gestor/financeiro/despesas/despesas.queryKeys.ts

export type DespesaTipo = 'DESPESA_FIXA' | 'DESPESA_VARIAVEL' | 'OUTRO_DEBITO';
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

  // Categorias Financeiras
  categoriasRoot: ['despesas', 'categorias-financeiras'] as const,
  categoriasList: (tipo?: DespesaTipo) =>
    ['despesas', 'categorias-financeiras', 'list', tipo ?? 'all'] as const,
};
