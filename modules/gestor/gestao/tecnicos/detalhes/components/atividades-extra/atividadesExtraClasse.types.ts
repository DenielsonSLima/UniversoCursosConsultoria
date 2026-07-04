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
}

export interface AtividadeExtraClasseFormState {
  disciplinaId: string;
  titulo: string;
  tema: string;
  horas: string;
  prazoEntrega: string;
  texto: string;
  videoUrl: string;
  perguntas: string;
}

export interface CorrectionDraft {
  nota: string;
  feedback: string;
}

export interface AtividadeExtraClasseRecord {
  id: string;
  disciplina_id: string;
  titulo: string;
  tema?: string | null;
  tipo_resposta?: string | null;
  texto?: string | null;
  video_url?: string | null;
  perguntas?: Array<{ pergunta?: string } | string>;
  carga_horaria_compensacao: number | string;
  prazo_entrega?: string | null;
  status: string;
  disciplina?: {
    id?: string;
    nome?: string | null;
    carga_horaria?: number | string | null;
  } | null;
  respostas?: AtividadeExtraClasseResposta[];
}

export interface AtividadeExtraClasseResposta {
  id: string;
  atividade_id: string;
  aluno_id: string;
  resposta_texto?: string | null;
  respostas?: Array<{ pergunta?: string; resposta?: string }>;
  anexo_url?: string | null;
  status: string;
  nota?: number | string | null;
  feedback?: string | null;
  aluno?: {
    id?: string;
    nome?: string | null;
  } | null;
}
