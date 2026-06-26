export interface ComunicacaoPageProps {
  alunoId: string;
  alunoNome: string;
}

export interface ComunicacaoCategoria {
  id: string;
  nome: string;
  cor?: string | null;
  ativo?: boolean;
}

export interface ComunicacaoChat {
  id: string;
  remetente_id: string;
  remetente_nome?: string | null;
  remetente_tipo?: string | null;
  categoria_id?: string | null;
  status?: string | null;
  ultimo_texto?: string | null;
  ultima_data?: string | null;
  deleted_by_aluno?: boolean | null;
}

export interface ComunicacaoMensagem {
  id: string;
  chat_id: string;
  remetente_id?: string | null;
  remetente_nome?: string | null;
  remetente_tipo?: string | null;
  conteudo?: string | null;
  anexo_url?: string | null;
  lida?: boolean | null;
  created_at?: string | null;
}

export interface CreateAlunoChatInput {
  alunoId: string;
  alunoNome: string;
  categoryId: string;
  categoryName: string;
  subject: string;
}

export interface SendAlunoMessageInput {
  chatId: string;
  alunoId: string;
  alunoNome: string;
  text: string;
  file?: File | null;
}
