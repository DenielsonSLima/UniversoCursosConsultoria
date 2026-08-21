export type ProfessorCoordenacaoStatus = 'ATIVA' | 'REVOGADA' | 'EXPIRADA' | string;

export interface CoordenacoesScope {
  /** Polo selecionado no cabeçalho; a autorização é revalidada pela RPC. */
  poloId: string;
  /** Solicitação explícita; somente o backend decide se o ator pode usá-la. */
  includeGlobal: boolean;
}

export interface ProfessorCoordenacao {
  id: string;
  professorId: string;
  professorNome: string;
  cursoId: string;
  cursoNome: string;
  poloId: string;
  poloNome: string;
  status: ProfessorCoordenacaoStatus;
  vigenteDe: string | null;
  vigenteAte: string | null;
  observacao: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CoordenacaoOption {
  id: string;
  nome: string;
}

export interface ProfessorCoordenacaoOption extends CoordenacaoOption {
  /** Polos já reduzidos pelo serviço ao escopo simultâneo do professor e ator. */
  poloIds: readonly string[];
}

export interface CoordenacaoOpcoesCadastro {
  professores: readonly ProfessorCoordenacaoOption[];
  cursos: readonly CoordenacaoOption[];
  polos: readonly CoordenacaoOption[];
}

/** Envelope paginado canônico devolvido pela RPC; o cursor é opaco para a UI. */
export interface ProfessorCoordenacoesListResult {
  items: readonly ProfessorCoordenacao[];
  nextCursor: string | null;
}

export interface ProfessorCoordenacaoSalvarInput {
  scope: CoordenacoesScope;
  professorCoordenacaoId?: string | null;
  dados: {
    professorId: string;
    cursoId: string;
    poloId: string;
    vigenteDe?: string | null;
    vigenteAte?: string | null;
    observacao?: string | null;
  };
  requestId: string;
}

export interface ProfessorCoordenacaoSalvarResult {
  professorCoordenacaoId: string;
  professorId: string;
  cursoId: string;
  poloId: string;
  status: ProfessorCoordenacaoStatus;
}

export interface ProfessorCoordenacaoRevogarInput {
  scope: CoordenacoesScope;
  professorCoordenacaoId: string;
  motivo: string;
  requestId: string;
}

export interface ProfessorCoordenacaoRevogarResult {
  professorCoordenacaoId: string;
  poloId: string;
  status: ProfessorCoordenacaoStatus;
  revogadaEm: string | null;
}
