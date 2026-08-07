export type AtividadeModo = 'GESTOR' | 'PROFESSOR';

export interface AtividadesExtraClasseProps {
  turmaId: string;
  cursoId?: string | null;
  disciplinaIdRestrita?: string | null;
  professorId?: string | null;
  modo?: AtividadeModo;
  readOnly?: boolean;
  readOnlyMessage?: string;
}

export interface DisciplinaOption {
  id: string;
  nome: string;
  cargaHoraria: number;
  periodoStatus: string | null;
  professorId?: string | null;
  professorNome?: string | null;
}

export type AtividadeTipoResposta = 'TEXTO' | 'PERGUNTAS' | 'ENVIO' | 'MISTO';

export interface AtividadeExtraClasseFormState {
  disciplinaId: string;
  titulo: string;
  tema: string;
  horas: string;
  prazoEntrega: string;
  texto: string;
  videoUrl: string;
  perguntas: string;
  tipoResposta: AtividadeTipoResposta;
}

export interface CorrectionDraft {
  nota: string;
  feedback: string;
}

export type AtividadeExtraClasseStatus = 'RASCUNHO' | 'PUBLICADA' | 'ARQUIVADA';

export type AtividadeExtraClasseRespostaStatus = 'PENDENTE' | 'ENTREGUE' | 'CORRIGIDA';

export type AtividadeExtraClassePergunta = { pergunta?: string } | string;

export interface AtividadeExtraClasseRespostaItem {
  pergunta?: string;
  resposta?: string;
}

export interface AtividadeExtraClasseRecord {
  id: string;
  disciplina_id: string;
  titulo: string;
  tema?: string | null;
  tipo_resposta: AtividadeTipoResposta;
  texto?: string | null;
  video_url?: string | null;
  perguntas?: AtividadeExtraClassePergunta[];
  carga_horaria_compensacao: number | string;
  prazo_entrega?: string | null;
  status: AtividadeExtraClasseStatus;
  created_at?: string | null;
  updated_at?: string | null;
  criado_por_auth_id?: string | null;
  atualizado_por_auth_id?: string | null;
  disciplina?: {
    id?: string;
    nome?: string | null;
    carga_horaria?: number | string | null;
  } | null;
  professor?: {
    id?: string | null;
    nome?: string | null;
  } | null;
  respostas?: AtividadeExtraClasseResposta[];
}

export interface AtividadeExtraClasseResposta {
  id: string;
  atividade_id: string;
  aluno_id: string;
  resposta_texto?: string | null;
  respostas?: AtividadeExtraClasseRespostaItem[];
  anexo_url?: string | null;
  status: AtividadeExtraClasseRespostaStatus;
  nota?: number | string | null;
  feedback?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  entregue_em?: string | null;
  corrigido_em?: string | null;
  aluno?: {
    id?: string;
    nome?: string | null;
  } | null;
}

export interface AtividadeAlunoRoster {
  id: string;
  nome: string;
  matricula?: string | null;
  status?: string | null;
}

export interface AtividadeAlunoComResposta {
  id: string;
  nome: string;
  matricula: string | null;
  matriculaStatus: string | null;
  resposta: AtividadeExtraClasseResposta | null;
}

export type AtividadeAlunoFiltro = 'TODOS' | 'AGUARDANDO' | 'REVISAR' | 'CORRIGIDOS';
