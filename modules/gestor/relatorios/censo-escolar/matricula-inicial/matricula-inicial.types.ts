export type CensoSeverity = 'erro' | 'aviso';
export type CensoDomain = 'aluno' | 'turma';
export type CensoEntityType = 'ALUNO' | 'TURMA';

export interface CensoReadinessFilters {
  poloId?: string | null;
  modalidade: 'todos' | 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO';
  status: string;
}

export interface CensoReadinessRow {
  matriculaId: string;
  alunoId: string;
  alunoNome: string;
  alunoCpf?: string | null;
  dataNascimento?: string | null;
  sexo?: string | null;
  nomeMae?: string | null;
  racaCor?: string | null;
  naturalidade?: string | null;
  nacionalidade?: string | null;
  cep?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  status: string;
  turmaId: string;
  turmaNome: string;
  turmaCodigo?: string | null;
  turmaInicio?: string | null;
  turmaFim?: string | null;
  turno?: string | null;
  cursoNome: string;
  modalidade: string;
  poloNome: string;
}

export interface CensoReadinessIssue {
  id: string;
  severity: CensoSeverity;
  domain: CensoDomain;
  entityType: CensoEntityType;
  entityId: string;
  entityName: string;
  field: string;
  message: string;
}

export interface CensoReadinessResult {
  issues: CensoReadinessIssue[];
  totalAlunos: number;
  totalTurmas: number;
  alunosComPendencia: number;
  erros: number;
  avisos: number;
}
