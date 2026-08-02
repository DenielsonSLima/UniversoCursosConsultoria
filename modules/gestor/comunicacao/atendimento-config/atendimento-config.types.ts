export type AtendimentoStatusMode = 'automatico' | 'online' | 'offline';

export interface AtendimentoHorario {
  ativo: boolean;
  inicio: string;
  fim: string;
}

export type AtendimentoHorarios = Record<string, AtendimentoHorario>;

export interface AtendimentoConfig {
  id?: string;
  polo_id: string;
  status_modo: AtendimentoStatusMode;
  permite_chat_publico: boolean;
  permite_chat_app: boolean;
  permite_novo_chamado: boolean;
  solicitar_notificacao_resposta: boolean;
  tempo_medio_resposta_minutos: number;
  mensagem_online: string;
  mensagem_offline: string;
  texto_notificacao_optin: string;
  horarios: AtendimentoHorarios;
  updated_at?: string;
}

export interface AtendimentoPolo {
  id: string;
  nome: string;
  cidade: string;
  estado: string;
  is_matriz: boolean;
}

export interface AtendimentoUsuario {
  id: string;
  nome: string;
  email: string;
  setor_comunicacao: string | null;
  polo_comunicacao_id: string | null;
  polo_ids: string[];
  pode_visualizar_todos_polos: boolean;
  foto_path: string | null;
}

export interface AtendimentoResponsavel {
  id: string;
  polo_id: string;
  usuario_id: string;
  setor: string;
  ativo: boolean;
  prioridade: number;
}

export interface AtendimentoWorkspace {
  polos: AtendimentoPolo[];
  configs: AtendimentoConfig[];
  usuarios: AtendimentoUsuario[];
  responsaveis: AtendimentoResponsavel[];
}

