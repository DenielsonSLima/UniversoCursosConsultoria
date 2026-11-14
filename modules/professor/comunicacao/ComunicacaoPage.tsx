import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { resolveCommunicationAttachmentUrls } from '../../shared/comunicacao/comunicacao-attachments.service';
import useMediaQuery from '../../shared/hooks/useMediaQuery';
import ToastNotification, { useToast } from '../../gestor/components/ToastNotification';
import { ProfessorNewChatModal } from './ProfessorNewChatModal';
import { professorComunicacaoService } from './professor-comunicacao.service';
import { professorComunicacaoQueryKeys } from './professor-comunicacao.query-keys';
import { useProfessorComunicacaoRealtime } from './useProfessorComunicacaoRealtime';
import ProfessorChatList from './ProfessorChatList';
import ProfessorChatThread from './ProfessorChatThread';
import '../components/professor-screens.css';
import './professor-chat.css';

interface ComunicacaoPageProps { professorId: string; professorNome: string; }
const ComunicacaoPage: React.FC<ComunicacaoPageProps> = ({ professorId, professorNome }) => {
  const client = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const desktop = useMediaQuery('(min-width: 768px)');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatCategory, setNewChatCategory] = useState('');
  const [newChatSubject, setNewChatSubject] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const sendingRef = useRef(false);
  const creatingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useProfessorComunicacaoRealtime(professorId, activeChatId);

  const categoriesQuery = useQuery<any[]>({
    queryKey: professorComunicacaoQueryKeys.categories,
    refetchOnReconnect: 'always',
    queryFn: async () => {
      const { data, error } = await supabase.from('comunicacao_categorias').select('*').eq('ativo', true);
      if (error) throw error;
      return data || [];
    },
  });
  const chatsQuery = useQuery<any[]>({
    queryKey: professorComunicacaoQueryKeys.chats(professorId),
    enabled: Boolean(professorId),
    refetchOnReconnect: 'always',
    queryFn: async () => {
      const { data, error } = await supabase.from('comunicacao_chats').select('*')
        .eq('remetente_id', professorId).order('ultima_data', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const messagesQuery = useQuery<any[]>({
    queryKey: professorComunicacaoQueryKeys.messages(activeChatId || ''),
    enabled: Boolean(activeChatId),
    refetchOnReconnect: 'always',
    queryFn: async () => {
      const { data, error } = await supabase.from('comunicacao_mensagens').select('*')
        .eq('chat_id', activeChatId).order('created_at', { ascending: true });
      if (error) throw error;
      return resolveCommunicationAttachmentUrls(data || []);
    },
  });
  const categories = categoriesQuery.data || [];
  const chats = chatsQuery.data || [];
  const messages = messagesQuery.data || [];
  const currentChat = chats.find((chat) => chat.id === activeChatId);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messagesQuery.data]);
  useEffect(() => {
    if (desktop && chats.length > 0 && !activeChatId) setActiveChatId(chats[0].id);
  }, [desktop, chatsQuery.data, activeChatId]);
  useEffect(() => {
    setActiveChatId(null);
    setMessageText('');
    setPendingFile(null);
  }, [professorId]);

  const handleSendMessage = async () => {
    if (!activeChatId || sendingRef.current) return;
    const chatId = activeChatId;
    const text = messageText.trim();
    const file = pendingFile;
    if (!text && !file) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await professorComunicacaoService.sendMessage({ chatId, file, professorId, professorNome, text });
      setMessageText('');
      setPendingFile(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: professorComunicacaoQueryKeys.messages(chatId), exact: true }),
        client.invalidateQueries({ queryKey: professorComunicacaoQueryKeys.chats(professorId), exact: true }),
      ]);
    } catch (error) {
      toast.error('Mensagem não enviada', error instanceof Error ? error.message : 'A mensagem foi preservada para você tentar novamente.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  const handleCreateNewChat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newChatCategory || !newChatSubject.trim() || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const category = categories.find((item) => item.id === newChatCategory);
      const { data: chat, error } = await supabase.from('comunicacao_chats').insert({
        remetente_id: professorId,
        remetente_nome: professorNome,
        remetente_tipo: 'Professor',
        categoria_id: newChatCategory,
        status: 'pendente',
        ultimo_texto: newChatSubject,
        ultima_data: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      const { error: messageError } = await supabase.from('comunicacao_mensagens').insert({
        chat_id: chat.id,
        remetente_id: professorId,
        remetente_nome: professorNome,
        remetente_tipo: 'professor',
        conteudo: `Iniciou o chamado sobre [${category?.nome || 'Suporte'}]: ${newChatSubject}`,
      });
      if (messageError) throw messageError;
      setShowNewChatModal(false);
      setNewChatCategory('');
      setNewChatSubject('');
      await client.invalidateQueries({ queryKey: professorComunicacaoQueryKeys.chats(professorId), exact: true });
      setActiveChatId(chat.id);
      toast.success('Chamado aberto', 'Sua solicitação foi enviada à coordenação.');
    } catch (error) {
      toast.error('Chamado não aberto', error instanceof Error ? error.message : 'Revise os dados e tente novamente.');
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  return (
    <div className="professor-screen professor-chatpage" data-chat-open={Boolean(activeChatId && currentChat)}>
      <header>
        <div><h2>Comunicação e suporte</h2><p className="mt-1 professor-help">Fale com a coordenação pedagógica e os setores da escola.</p></div>
        <button type="button" className="professor-button professor-button--primary" onClick={() => setShowNewChatModal(true)}><Plus size={16} />Novo chamado</button>
      </header>
      <div className="professor-chatbody">
        <ProfessorChatList chats={chats} activeId={activeChatId} loading={chatsQuery.isPending} error={chatsQuery.isError} categories={categories} onSelect={setActiveChatId} />
        <ProfessorChatThread
          chat={currentChat} category={categories.find((item) => item.id === currentChat?.categoria_id)?.nome || 'Geral'}
          professorId={professorId} messages={messages} loading={messagesQuery.isPending}
          error={messagesQuery.isError} messageText={messageText} pendingFile={pendingFile} sending={sending}
          fileInputRef={fileInputRef} messagesEndRef={messagesEndRef} onBack={() => setActiveChatId(null)}
          onMessage={setMessageText} onFile={setPendingFile} onFileError={(message) => toast.error('Anexo não selecionado', message)} onSend={handleSendMessage}
        />
      </div>
      {showNewChatModal && (
        <ProfessorNewChatModal
          categories={categories} categoryId={newChatCategory} subject={newChatSubject} busy={creating}
          categoriesLoading={categoriesQuery.isPending} categoriesError={categoriesQuery.isError}
          onCategoryChange={setNewChatCategory} onClose={() => setShowNewChatModal(false)}
          onSubmit={handleCreateNewChat} onSubjectChange={setNewChatSubject}
        />
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};
export default ComunicacaoPage;
