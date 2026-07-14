export type VacinaStatus = 'pendente' | 'em_analise' | 'aprovado' | 'reprovado';
export type VacinaOrigem = 'aluno' | 'secretaria';

export interface VacinaDoseRequirement {
  numero: number;
  label: string;
}

export interface CursoVacinaRequirement {
  codigo: string;
  nome: string;
  obrigatoria: boolean;
  doses: VacinaDoseRequirement[];
}

export interface CursoVacinasConfig {
  exigirCarteiraEstagio: boolean;
  observacao?: string;
  vacinas: CursoVacinaRequirement[];
}

export interface AlunoVacinaRegistro {
  id?: string;
  alunoId: string;
  cursoId: string;
  matriculaId?: string | null;
  turmaId?: string | null;
  vacinaCodigo: string;
  vacinaNome: string;
  doseNumero: number;
  doseLabel: string;
  dataAplicacao?: string | null;
  lote?: string | null;
  localAplicacao?: string | null;
  arquivoPath?: string | null;
  arquivoUrl?: string | null;
  status: VacinaStatus;
  origem: VacinaOrigem;
  observacao?: string | null;
  validadoEm?: string | null;
  updatedAt?: string | null;
}

export interface AlunoVacinaCursoContext {
  matriculaId: string | null;
  turmaId: string | null;
  turmaNome: string | null;
  cursoId: string;
  cursoNome: string;
  config: CursoVacinasConfig;
}

export interface SaveAlunoVacinaInput {
  alunoId: string;
  cursoId: string;
  matriculaId?: string | null;
  turmaId?: string | null;
  vacinaCodigo: string;
  vacinaNome: string;
  doseNumero: number;
  doseLabel: string;
  dataAplicacao?: string | null;
  lote?: string | null;
  localAplicacao?: string | null;
  arquivoPath?: string | null;
  origem?: VacinaOrigem;
}
