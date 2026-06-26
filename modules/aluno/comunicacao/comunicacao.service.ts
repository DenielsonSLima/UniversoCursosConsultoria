import { supabase } from '../../../lib/supabase';
import {
  ComunicacaoCategoria,
  ComunicacaoChat,
  ComunicacaoMensagem,
  CreateAlunoChatInput,
  SendAlunoMessageInput,
} from './comunicacao.types';

export const alunoComunicacaoKeys = {
  categories: ['comunicacao-categorias'] as const,
  chats: (alunoId: string) => ['aluno-chats', alunoId] as const,
  messages: (chatId: string | null) => ['chat-messages', chatId] as const,
};

const getCategories = async (): Promise<ComunicacaoCategoria[]> => {
  const { data, error } = await supabase
    .from('comunicacao_categorias')
    .select('*')
    .eq('ativo', true);

  if (error) throw error;
  return data || [];
};

const getAlunoChats = async (alunoId: string): Promise<ComunicacaoChat[]> => {
  const { data, error } = await supabase
    .from('comunicacao_chats')
    .select('*')
    .eq('remetente_id', alunoId)
    .eq('deleted_by_aluno', false)
    .order('ultima_data', { ascending: false });

  if (error) throw error;
  return data || [];
};

const getMessages = async (chatId: string): Promise<ComunicacaoMensagem[]> => {
  const { data, error } = await supabase
    .from('comunicacao_mensagens')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

const getUnreadChatIds = async (alunoId: string): Promise<Set<string>> => {
  const { data: studentChats } = await supabase
    .from('comunicacao_chats')
    .select('id')
    .eq('remetente_id', alunoId)
    .eq('deleted_by_aluno', false);

  const chatIds = studentChats?.map(chat => chat.id) || [];
  if (chatIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('comunicacao_mensagens')
    .select('chat_id')
    .in('chat_id', chatIds)
    .eq('lida', false)
    .in('remetente_tipo', ['gestor', 'sistema']);

  if (error) throw error;
  return new Set(data?.map(message => message.chat_id) || []);
};

const markMessagesAsRead = async (chatId: string) => {
  const { error } = await supabase
    .from('comunicacao_mensagens')
    .update({ lida: true })
    .eq('chat_id', chatId)
    .in('remetente_tipo', ['gestor', 'sistema'])
    .eq('lida', false);

  if (error) throw error;
};

const getChatById = async (chatId: string): Promise<ComunicacaoChat | null> => {
  const { data, error } = await supabase
    .from('comunicacao_chats')
    .select('*')
    .eq('id', chatId)
    .single();

  if (error) throw error;
  return data || null;
};

const uploadAttachment = async (file: File, alunoId: string): Promise<string | null> => {
  const ext = file.name.split('.').pop();
  const path = `comunicacao/${alunoId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('anexos').upload(path, file, { upsert: true });
  if (error) throw error;

  const { data: urlData } = supabase.storage.from('anexos').getPublicUrl(path);
  return urlData?.publicUrl || null;
};

const sendMessage = async ({ chatId, alunoId, alunoNome, text, file }: SendAlunoMessageInput) => {
  let anexoUrl: string | null = null;

  if (file) {
    anexoUrl = await uploadAttachment(file, alunoId);
  }

  const content = text || (file ? `📎 ${file.name}` : '');
  const { data: newMessage, error: messageError } = await supabase
    .from('comunicacao_mensagens')
    .insert({
      chat_id: chatId,
      remetente_id: alunoId,
      remetente_nome: alunoNome,
      remetente_tipo: 'aluno',
      conteudo: content,
      anexo_url: anexoUrl,
    })
    .select()
    .single();

  if (messageError) throw messageError;

  const { error: chatError } = await supabase
    .from('comunicacao_chats')
    .update({
      ultimo_texto: text || `📎 ${file?.name}`,
      ultima_data: new Date().toISOString(),
    })
    .eq('id', chatId);

  if (chatError) throw chatError;
  return newMessage as ComunicacaoMensagem;
};

const deleteChatForAluno = async (chatId: string, alunoId: string) => {
  const { error } = await supabase
    .from('comunicacao_chats')
    .update({ deleted_by_aluno: true })
    .eq('id', chatId)
    .eq('remetente_id', alunoId);

  if (error) throw error;
};

const createChat = async ({ alunoId, alunoNome, categoryId, categoryName, subject }: CreateAlunoChatInput) => {
  const { data: newChat, error: chatError } = await supabase
    .from('comunicacao_chats')
    .insert({
      remetente_id: alunoId,
      remetente_nome: alunoNome,
      remetente_tipo: 'Aluno',
      categoria_id: categoryId,
      status: 'pendente',
      ultimo_texto: subject,
      ultima_data: new Date().toISOString(),
    })
    .select()
    .single();

  if (chatError) throw chatError;

  const { error: messageError } = await supabase
    .from('comunicacao_mensagens')
    .insert({
      chat_id: newChat.id,
      remetente_id: alunoId,
      remetente_nome: alunoNome,
      remetente_tipo: 'aluno',
      conteudo: `Iniciou o chamado sobre [${categoryName}]: ${subject}`,
    });

  if (messageError) throw messageError;
  return newChat as ComunicacaoChat;
};

export const alunoComunicacaoService = {
  createChat,
  deleteChatForAluno,
  getAlunoChats,
  getCategories,
  getChatById,
  getMessages,
  getUnreadChatIds,
  markMessagesAsRead,
  sendMessage,
};
