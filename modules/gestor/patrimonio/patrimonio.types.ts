export type PatrimonioViewMode = 'cards' | 'tabela';

export type PatrimonioStatus = 'ativo' | 'baixado' | 'excluido';
export type PatrimonioStatusFilter = 'ativos' | 'baixados' | 'excluidos' | 'todos';
export type PatrimonioWriteOffReason = 'perda' | 'furto' | 'dano' | 'obsolescencia' | 'outro';
export type PatrimonioPendingAction = 'edit' | 'writeOff' | 'remove';

export interface PatrimonioActionState {
  enabled: boolean;
  reason?: string;
}

export interface PatrimonioActionAvailability {
  edit: PatrimonioActionState;
  writeOff: PatrimonioActionState;
  remove: PatrimonioActionState;
}

export interface PatrimonioItem {
  id: string;
  poloId: string;
  poloNome?: string;
  dataAquisicao: string;
  tipoProdutoId?: string;
  tipoProduto: string;
  descricao: string;
  status: PatrimonioStatus;
  quantidadeOriginal: number;
  quantidadeBaixada: number;
  quantidadeDisponivel: number;
  valorUnitario: string;
  valorTotalOriginal: string;
  valorDisponivel: string;
  numeroSerie?: string;
  observacao?: string;
  dataUltimaBaixa?: string;
  motivoUltimaBaixa?: string;
  deletedAt?: string;
  canEdit: boolean;
  canEditEconomicFields: boolean;
  canWriteOff: boolean;
  canDelete: boolean;
  createdAt?: string;
  updatedAt: string;
}

export interface PatrimonioListFilters {
  poloId?: string | null;
  search?: string;
  tipoProduto?: string;
  status: PatrimonioStatusFilter;
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
  tipoProdutoId: string;
  descricao: string;
  quantidade: number;
  valorUnitario: string;
  numeroSerie?: string;
  observacao?: string;
}

export interface UpdatePatrimonioInput {
  requestId: string;
  patrimonioId: string;
  poloId: string;
  expectedUpdatedAt: string;
  dataAquisicao: string;
  tipoProdutoId: string;
  descricao: string;
  quantidade: number;
  valorUnitario: string;
  numeroSerie?: string;
  observacao?: string;
  motivo: string;
}

export interface WriteOffPatrimonioInput {
  requestId: string;
  patrimonioId: string;
  poloId: string;
  expectedUpdatedAt: string;
  dataBaixa: string;
  quantidadeBaixa: number;
  motivo: PatrimonioWriteOffReason;
  observacao?: string;
}

export interface RemovePatrimonioInput {
  requestId: string;
  patrimonioId: string;
  poloId: string;
  expectedUpdatedAt: string;
  motivo: string;
}
