export interface ActivityResponseDraft {
  texto?: string;
  anexoUrl?: string;
  respostas?: Record<number, string>;
}

export interface AtividadeExtraClasse {
  id: string;
  titulo: string;
  tema?: string | null;
  texto?: string | null;
  video_url?: string | null;
  perguntas?: Array<{ pergunta?: string } | string>;
  carga_horaria_compensacao?: number | string | null;
  prazo_entrega?: string | null;
  disciplina?: {
    nome?: string | null;
  } | null;
  respostas?: AtividadeExtraClasseResposta[];
}

export interface AtividadeExtraClasseResposta {
  id: string;
  resposta_texto?: string | null;
  respostas?: Array<{ pergunta?: string; resposta?: string }>;
  anexo_url?: string | null;
  status?: string | null;
  nota?: number | string | null;
  feedback?: string | null;
}
