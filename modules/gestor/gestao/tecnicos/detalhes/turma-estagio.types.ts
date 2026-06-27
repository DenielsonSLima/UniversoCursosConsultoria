export type ProcedimentoStatus = 'A' | 'E' | 'O' | '';

export interface EstagioAluno {
  matriculaId: string;
  id: string;
  nome: string;
  cpf: string;
  statusMatricula: string;
}

export interface EstagioAvaliacaoFormItem {
  nota: number;
  obs: string;
}

export type EstagioCriteriosValores = Record<string, Record<string, EstagioAvaliacaoFormItem>>;

export interface EstagioProcedimentoLogItem {
  status: ProcedimentoStatus;
  data: string;
}

export type EstagioProcedimentosLog = Record<string, EstagioProcedimentoLogItem>;

export interface TurmaEstagioData {
  disciplinasEstagio: any[];
  alunos: EstagioAluno[];
}

export interface EstagioEvaluationDraft {
  instrumentosConfig: any[];
  checklistUcsConfig: any[];
  perfilAluno: string;
  instrutorNome: string;
  dataAvaliacao: string;
  frequenciaEstagio: number;
  criteriosValores: EstagioCriteriosValores;
  procedimentosLog: EstagioProcedimentosLog;
}

export interface SaveEstagioEvaluationInput {
  turmaId: string;
  disciplinaId: string;
  alunoId: string;
  frequencia: number;
  criterios: EstagioCriteriosValores;
  procedimentosLog: EstagioProcedimentosLog;
  perfilAluno: string;
  instrutorNome: string;
  dataAvaliacao: string;
}
