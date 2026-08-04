import type { WhatsAppSector } from '../../gestor/comunicacao/components/whatsapp/whatsapp.types';

export interface ComunicacaoPageProps {
  alunoId: string;
  alunoNome: string;
  onNavigate?: (moduleId: string) => void;
}

export interface ComunicacaoCategoria {
  id: string;
  nome: string;
  cor?: string | null;
  ativo?: boolean;
}

export interface ComunicacaoChat {
  id: string;
  remetente_id: string | null;
  remetente_nome?: string | null;
  remetente_tipo?: string | null;
  categoria_id?: string | null;
  status?: string | null;
  ultimo_texto?: string | null;
  ultima_data?: string | null;
  deleted_by_aluno?: boolean | null;
  origem?: 'app' | 'portal' | 'publico' | null;
  polo_id?: string | null;
  setor?: string | null;
  assunto?: string | null;
  protocolo?: string | null;
  notificar_resposta?: boolean | null;
}

export interface AtendimentoHorarioDia {
  ativo: boolean;
  inicio: string;
  fim: string;
}

export interface AlunoAtendimentoConfig {
  polo_id: string | null;
  polo_nome: string;
  status_modo: 'automatico' | 'online' | 'offline';
  permite_chat_app: boolean;
  permite_novo_chamado: boolean;
  solicitar_notificacao_resposta: boolean;
  tempo_medio_resposta_minutos: number;
  mensagem_online: string;
  mensagem_offline: string;
  texto_notificacao_optin: string;
  horarios: Record<string, AtendimentoHorarioDia>;
}

export interface ComunicacaoMensagem {
  id: string;
  chat_id: string;
  remetente_id?: string | null;
  remetente_nome?: string | null;
  remetente_tipo?: string | null;
  conteudo?: string | null;
  anexo_path?: string | null;
  anexo_url?: string | null;
  anexo_display_url?: string | null;
  lida?: boolean | null;
  created_at?: string | null;
}

export interface CreateAlunoChatInput {
  sector: WhatsAppSector;
  subject: string;
  message: string;
  poloLabel?: string | null;
  notifyOnResponse?: boolean;
  origin: 'app' | 'portal';
}

export interface SendAlunoMessageInput {
  chatId: string;
  alunoId: string;
  alunoNome: string;
  text: string;
  file?: File | null;
}
