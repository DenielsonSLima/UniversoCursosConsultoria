export type MatriculasModalidade = 'todos' | 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO' | 'SUPERIOR';

export interface MatriculasReportFilters {
  poloId?: string | null;
  modalidade: MatriculasModalidade;
  turmaId: string;
  status: string;
  dataInicio: string;
  dataFim: string;
  page: number;
  pageSize: number;
}

export interface MatriculaReportRow {
  id: string;
  alunoId: string;
  alunoNome: string;
  alunoCpf: string;
  matricula: string;
  dataMatricula?: string | null;
  status: string;
  cursoNome: string;
  modalidade: string;
  turmaId: string;
  turmaNome: string;
  turmaCodigo: string;
  poloNome: string;
}

export interface MatriculasReportPage {
  rows: MatriculaReportRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MatriculasTurmaOption {
  id: string;
  nome: string;
  codigo: string;
}
