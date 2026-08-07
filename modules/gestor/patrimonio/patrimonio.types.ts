export type PatrimonioViewMode = 'cards' | 'tabela';

export interface PatrimonioItem {
  id: string;
  poloId: string;
  poloNome?: string;
  dataAquisicao: string;
  tipoProduto: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  numeroSerie?: string;
  observacao?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PatrimonioListFilters {
  poloId?: string | null;
  search?: string;
  tipoProduto?: string;
  limit: number;
  offset: number;
}

export interface PatrimonioListResult {
  items: PatrimonioItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreatePatrimonioInput {
  requestId: string;
  poloId: string;
  dataAquisicao: string;
  tipoProduto: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  numeroSerie?: string;
  observacao?: string;
}
