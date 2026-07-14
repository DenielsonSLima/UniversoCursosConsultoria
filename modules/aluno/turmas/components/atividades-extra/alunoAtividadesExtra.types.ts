export interface ActivityResponseDraft {
  texto?: string;
  anexoUrl?: string;
  respostas?: Record<number, string>;
}

export type AtividadeRespostaStatus = 'PENDENTE' | 'ENTREGUE' | 'CORRIGIDA';
export type AtividadeTipoResposta = 'TEXTO' | 'PERGUNTAS' | 'ENVIO' | 'MISTO';

export type AtividadePergunta = { pergunta?: string } | string;

export interface AtividadeExtraClasse {
  id: string;
  titulo: string;
  tema?: string | null;
  texto?: string | null;
  video_url?: string | null;
  tipo_resposta: AtividadeTipoResposta;
  perguntas?: AtividadePergunta[];
  carga_horaria_compensacao?: number | string | null;
  prazo_entrega?: string | null;
  disciplina?: {
    id?: string;
    nome?: string | null;
  } | null;
  respostas?: AtividadeExtraClasseResposta[];
}

export interface AtividadeExtraClasseResposta {
  id: string;
  resposta_texto?: string | null;
  respostas?: Array<{ pergunta?: string; resposta?: string }>;
  anexo_url?: string | null;
  status?: AtividadeRespostaStatus | null;
  nota?: number | string | null;
  feedback?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  entregue_em?: string | null;
  corrigido_em?: string | null;
}
