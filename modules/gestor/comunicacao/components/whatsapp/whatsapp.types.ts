export interface WhatsAppConversation {
  id: string;
  aluno_id: string | null;
  contato_nome: string;
  telefone: string;
  status: 'aberta' | 'arquivada';
  ultimo_texto: string | null;
  ultima_data: string;
  unread_count: number;
}

export interface WhatsAppMessage {
  id: string;
  conversa_id: string;
  aluno_id: string | null;
  meta_message_id: string | null;
  direcao: 'entrada' | 'saida' | 'status';
  remetente_tipo: 'aluno' | 'gestor' | 'sistema';
  remetente_nome: string;
  conteudo: string;
  message_type: string;
  status: string | null;
  lida: boolean;
  created_at: string;
}

export interface WhatsAppContact {
  id: string;
  nome: string;
  tipo: string;
  email: string | null;
  telefone: string | null;
  cpfCnpj: string | null;
  cidade: string | null;
  status: string | null;
  foto: string | null;
  poloNome: string;
}
