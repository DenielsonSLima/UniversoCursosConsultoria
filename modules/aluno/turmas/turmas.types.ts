export interface TurmasPageProps {
  alunoId: string;
  initialCourseId?: string | null;
  initialTurmaId?: string | null;
  onInitialSelectionConsumed?: () => void;
}

export interface CursoAluno {
  id: string;
  nome?: string | null;
  modalidade?: string | null;
  area?: string | null;
  imagem_url?: string | null;
  carga_horaria?: number | string | null;
  ead_config?: Record<string, unknown> | null;
}

export interface TurmaAluno {
  id: string;
  nome?: string | null;
  codigo?: string | null;
  status?: string | null;
  turno?: string | null;
  cursos?: CursoAluno | null;
}

export interface MatriculaAluno {
  id: string;
  aluno_id?: string | null;
  turma_id?: string | null;
  status?: string | null;
  data_matricula?: string | null;
  created_at?: string | null;
  turmas?: TurmaAluno | null;
}

export interface TurmaDisciplinaAluno {
  id: string;
  disciplina_id?: string | null;
  periodo_letivo_id?: string | null;
  professor_nome?: string | null;
  concluida?: boolean | null;
  disciplinas?: {
    id?: string | null;
    nome?: string | null;
    ordem?: number | string | null;
    modulo_id?: string | null;
    modulo?: {
      id?: string | null;
      nome?: string | null;
      ordem?: number | string | null;
    } | null;
    carga_horaria?: number | string | null;
    carga_horaria_estagio?: number | string | null;
  } | null;
  periodo_letivo?: {
    id?: string | null;
    nome?: string | null;
    ordem?: number | null;
    status?: 'PLANEJADO' | 'ABERTO' | 'EM_FECHAMENTO' | 'FECHADO' | string | null;
    data_inicio?: string | null;
    data_fim?: string | null;
  } | null;
}

export interface AulaTurmaAluno {
  id: string;
  titulo?: string | null;
  carga_horaria?: number | string | null;
  data_aula?: string | null;
  disciplina_id?: string | null;
  sessao?: 'M' | 'T' | 'N' | 'U' | string | null;
}

export interface FrequenciaAluno {
  disciplina_id?: string | null;
  aula_id?: string | null;
  status?: string | null;
}

export interface ResultadoDiarioAluno {
  turma_id?: string | null;
  disciplina_id?: string | null;
  aluno_id?: string | null;
  nota_p?: number | string | null;
  nota_ti?: number | string | null;
  nota_tg?: number | string | null;
  nota_s?: number | string | null;
  nota_cq?: number | string | null;
  nota_o?: number | string | null;
  nota_rec?: number | string | null;
  total_aulas?: number | string | null;
  total_faltas?: number | string | null;
  frequencia_percent?: number | string | null;
  media_parcial?: number | string | null;
  media_final?: number | string | null;
  resultado_final?: string | null;
}

export interface EstagioAluno {
  id?: string | null;
  turma_id?: string | null;
  disciplina_id?: string | null;
  aluno_id?: string | null;
  created_at?: string | null;
  data_avaliacao?: string | null;
  instrutor_nome?: string | null;
  frequencia_estagio?: number | string | null;
  nota_final?: number | string | null;
  nota_comportamento?: number | string | null;
  nota_registros?: number | string | null;
  nota_tecnicas?: number | string | null;
}

export interface CertificadoAluno {
  id: string;
  matricula_id?: string | null;
  turma_id?: string | null;
  status?: string | null;
  data_conclusao?: string | null;
  nota_final?: number | string | null;
  codigo_validacao?: string | null;
}

export interface DisciplinaResumoAluno {
  id: string;
  nome: string;
  ordem: number;
  modulo: {
    id: string;
    nome: string;
    ordem: number;
    status?: string | null;
  };
  cargaHoraria: number;
  professor: string;
  concluida: boolean;
  notas: ResultadoDiarioAluno | null;
  attendance: { presentes: number; faltas: number; total: number };
  frequency: number | null;
}

export interface ModuloCurricularAluno<T> {
  id: string;
  nome: string;
  ordem: number;
  status?: string | null;
  itens: T[];
}

export type TurmaDetailTab = 'resumo' | 'diario' | 'atividades' | 'notas' | 'estagio' | 'certificado';

export interface QueryDisplayState {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export interface ProgressDisplayState {
  isLoading: boolean;
  isError: boolean;
}
