import React, { useState, useRef } from 'react';
import { MessageSquare, MessageCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  removeCommunicationAttachmentPaths,
  removeCommunicationAttachments,
  resolveCommunicationAttachmentUrls,
  uploadCommunicationAttachment,
} from '../../shared/comunicacao/comunicacao-attachments.service';
import WhatsAppCommunicationPanel from './components/WhatsAppCommunicationPanel';
import StartInternalConversationModal, { InternalConversationContact } from './components/StartInternalConversationModal';
import ToastNotification, { useToast } from '../components/ToastNotification';
import {
  ComunicacaoPageProps,
  GestorMessage,
  getGestorCategoryInfo,
  playGestorMessageSound,
} from './gestor-comunicacao.types';
import { useGestorComunicacaoRealtime } from './useGestorComunicacaoRealtime';
import { GestorChatPanel, GestorDeleteChatModal, GestorInbox } from './GestorComunicacaoParts';

const ComunicacaoPage: React.FC<ComunicacaoPageProps> = ({ gestorProfile, channel = 'mensagem' }) => {
  const { toasts, removeToast, toast } = useToast();
  const [activeTicketStatus, setActiveTicketStatus] = useState<'pendente' | 'solucionada'>('pendente');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('todos');
  const [searchText, setSearchText] = useState('');
  
  const {
    activeChatId,
    categories,
    chats,
    loadingChats,
    loadingMessages,
    messages,
    messagesEndRef,
    setActiveChatId,
    setChats,
    setMessages,
    unreadChatIds,
  } = useGestorComunicacaoRealtime();
  
  // Input State
  const [messageText, setMessageText] = useState('');
  const [showStartConversation, setShowStartConversation] = useState(false);

  // Attachment state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gestorNome = gestorProfile?.nome || 'Gestor (Escola)';
  const gestorId = gestorProfile?.id || null;

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);


  // Send Message
  const handleSendMessage = async () => {
    if (!activeChatId) return;
    const text = messageText.trim();
    const fileToSend = pendingFile;
    if (!text && !fileToSend) return;

    setMessageText('');
    setPendingFile(null);
    setUploadingFile(!!fileToSend);

    try {
      let attachmentPath: string | null = null;
      if (fileToSend) {
        attachmentPath = await uploadCommunicationAttachment({
          actor: { type: 'gestor' },
          chatId: activeChatId,
          file: fileToSend,
        });
      }

      const msgPayload: any = {
        chat_id: activeChatId,
        remetente_id: gestorId,
        remetente_nome: gestorNome,
        remetente_tipo: 'gestor',
        conteudo: text || (fileToSend ? `📎 ${fileToSend.name}` : ''),
        anexo_path: attachmentPath,
        anexo_url: null,
      };

      const { data: newMsg, error: msgErr } = await supabase
        .from('comunicacao_mensagens').insert(msgPayload).select().single();
      if (msgErr) {
        if (attachmentPath) {
          await removeCommunicationAttachmentPaths([attachmentPath]).catch(() => undefined);
        }
        throw msgErr;
      }

      await supabase.from('comunicacao_chats').update({
        ultimo_texto: text || `📎 ${fileToSend?.name}`,
        ultima_data: new Date().toISOString()
      }).eq('id', activeChatId);

      const [resolvedMessage] = await resolveCommunicationAttachmentUrls([newMsg as GestorMessage]);
      setMessages(prev => {
        if (prev.some(m => m.id === resolvedMessage.id)) return prev;
        return [...prev, resolvedMessage];
      });
      playGestorMessageSound('send');
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      toast.error('Erro ao enviar', 'Não foi possível enviar sua resposta.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleStartInternalConversation = async (
    contact: InternalConversationContact,
    content: string,
    categoryId: string | null
  ) => {
    const existingChat = chats.find((chat) =>
      chat.remetente_id === contact.id && chat.status === 'pendente'
    );

    try {
      if (existingChat) {
        const { data: newMsg, error: msgErr } = await supabase
          .from('comunicacao_mensagens')
          .insert({
            chat_id: existingChat.id,
            remetente_id: gestorId,
            remetente_nome: gestorNome,
            remetente_tipo: 'gestor',
            conteudo: content,
          })
          .select()
          .single();
        if (msgErr) throw msgErr;

        const nextDate = new Date().toISOString();
        const { error: chatErr } = await supabase
          .from('comunicacao_chats')
          .update({
            categoria_id: categoryId || existingChat.categoria_id,
            ultimo_texto: content,
            ultima_data: nextDate,
            updated_at: nextDate,
          })
          .eq('id', existingChat.id);
        if (chatErr) throw chatErr;

        setChats(prev => prev.map(chat => chat.id === existingChat.id
          ? {
              ...chat,
              categoria_id: categoryId || chat.categoria_id,
              ultimo_texto: content,
              ultima_data: nextDate,
              updated_at: nextDate,
            }
          : chat
        ).sort((a, b) => new Date(b.ultima_data).getTime() - new Date(a.ultima_data).getTime()));
        setMessages(prev => activeChatId === existingChat.id && newMsg && !prev.some(msg => msg.id === newMsg.id)
          ? [...prev, newMsg]
          : prev
        );
        setActiveTicketStatus('pendente');
        setActiveChatId(existingChat.id);
        playGestorMessageSound('send');
        toast.success('Atendimento aberto', `Conversa existente com ${contact.nome} foi atualizada.`);
        return;
      }

      const now = new Date().toISOString();
      const { data: chat, error: chatError } = await supabase
        .from('comunicacao_chats')
        .insert({
          remetente_id: contact.id,
          remetente_nome: contact.nome,
          remetente_tipo: contact.tipo,
          categoria_id: categoryId,
          status: 'pendente',
          ultimo_texto: content,
          ultima_data: now,
        })
        .select()
        .single();
      if (chatError) throw chatError;

      const { data: newMsg, error: messageError } = await supabase
        .from('comunicacao_mensagens')
        .insert({
          chat_id: chat.id,
          remetente_id: gestorId,
          remetente_nome: gestorNome,
          remetente_tipo: 'gestor',
          conteudo: content,
        })
        .select()
        .single();
      if (messageError) throw messageError;

      setChats(prev => prev.some(item => item.id === chat.id) ? prev : [chat, ...prev]);
      setMessages(newMsg ? [newMsg] : []);
      setActiveTicketStatus('pendente');
      setActiveChatId(chat.id);
      playGestorMessageSound('send');
      toast.success('Atendimento iniciado', `Conversa interna criada para ${contact.nome}.`);
    } catch (err: any) {
      console.error('Erro ao iniciar atendimento interno:', err);
      toast.error('Erro ao iniciar atendimento', err?.message || 'Não foi possível criar a conversa.');
      throw err;
    }
  };

  const handleTransferCategory = async (nextCategoryId: string) => {
    if (!activeChatId || !currentChat || !nextCategoryId || nextCategoryId === currentChat.categoria_id) return;
    const previousCategory = getGestorCategoryInfo(categories, currentChat.categoria_id).nome;
    const nextCategory = getGestorCategoryInfo(categories, nextCategoryId).nome;

    try {
      const { error: chatErr } = await supabase
        .from('comunicacao_chats')
        .update({
          categoria_id: nextCategoryId,
          ultimo_texto: `Atendimento transferido para ${nextCategory}`,
          ultima_data: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', activeChatId);

      if (chatErr) throw chatErr;

      const { data: systemMessage, error: msgErr } = await supabase
        .from('comunicacao_mensagens')
        .insert({
          chat_id: activeChatId,
          remetente_nome: 'Sistema',
          remetente_tipo: 'sistema',
          conteudo: `${gestorNome} transferiu o atendimento de ${previousCategory} para ${nextCategory}.`
        })
        .select()
        .single();

      if (msgErr) throw msgErr;

      setChats(prev => prev.map(chat => chat.id === activeChatId
        ? {
            ...chat,
            categoria_id: nextCategoryId,
            ultimo_texto: `Atendimento transferido para ${nextCategory}`,
            ultima_data: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        : chat
      ));
      setMessages(prev => systemMessage && !prev.some(message => message.id === systemMessage.id) ? [...prev, systemMessage] : prev);
      toast.success('Atendimento transferido', `Conversa movida para ${nextCategory}.`);
    } catch (err) {
      console.error('Erro ao transferir atendimento:', err);
      toast.error('Erro ao transferir', 'Não foi possível mudar o setor do atendimento.');
    }
  };

  // Mark Chat as Solved
  const handleMarkAsSolved = async () => {
    if (!activeChatId) return;

    try {
      // 1. Update status
      const { error: chatErr } = await supabase
        .from('comunicacao_chats')
        .update({ status: 'solucionada', updated_at: new Date().toISOString() })
        .eq('id', activeChatId);

      if (chatErr) throw chatErr;

      // 2. Insert system notification message
      const { error: msgErr } = await supabase
        .from('comunicacao_mensagens')
        .insert({
          chat_id: activeChatId,
          remetente_nome: 'Sistema',
          remetente_tipo: 'sistema',
          conteudo: 'Este atendimento foi finalizado pelo gestor da escola.'
        });

      if (msgErr) throw msgErr;

      toast.success('Atendimento finalizado', 'O atendimento foi finalizado com sucesso!');
    } catch (err) {
      console.error('Erro ao finalizar atendimento:', err);
      toast.error('Erro ao finalizar', 'Não foi possível finalizar o atendimento.');
    }
  };

  // ── Hard-delete chat (gestor) ──────────────────────────────────────────────────────────
  // 1. Busca todas as mensagens com anexo do chat
  // 2. Deleta cada arquivo do Supabase Storage
  // 3. Deleta o chat (CASCADE apaga as mensagens automaticamente)
  // 4. Chat some da lista de ambos (aluno e gestor)
  const handleDeleteChat = async () => {
    if (!activeChatId) return;
    setDeletingChat(true);

    try {
      // 1. Busca mensagens com anexo
      const { data: msgsWithAnexo, error: attachmentsError } = await supabase
        .from('comunicacao_mensagens')
        .select('anexo_path,anexo_url')
        .eq('chat_id', activeChatId);
      if (attachmentsError) throw attachmentsError;

      // 2. Deleta arquivos do Storage
      if (msgsWithAnexo && msgsWithAnexo.length > 0) {
        await removeCommunicationAttachments(msgsWithAnexo);
      }

      // 3. Deleta o chat (CASCADE remove as mensagens)
      const { error: deleteErr } = await supabase
        .from('comunicacao_chats')
        .delete()
        .eq('id', activeChatId);

      if (deleteErr) throw deleteErr;

      // 4. Atualiza o estado local
      setChats(prev => prev.filter(c => c.id !== activeChatId));
      setActiveChatId(null);
      setMessages([]);
      setShowDeleteConfirm(false);

      toast.success('Atendimento excluído', 'O atendimento e todos os arquivos foram removidos.');
    } catch (err) {
      console.error('Erro ao excluir atendimento:', err);
      toast.error(
        'Erro ao excluir',
        'Não foi possível concluir a exclusão com segurança. O atendimento foi preservado.',
      );
    } finally {
      setDeletingChat(false);
    }
  };

  // Get active chat data
  const currentChat = chats.find(c => c.id === activeChatId);
  const pendingCount = chats.filter(chat => chat.status === 'pendente').length;
  const solvedCount = chats.filter(chat => chat.status === 'solucionada').length;

  // Filtered chats list
  const filteredChats = chats.filter(c => {
    if (c.status !== activeTicketStatus) return false;
    if (selectedCategoryFilter !== 'todos' && c.categoria_id !== selectedCategoryFilter) return false;
    if (searchText && !c.remetente_nome.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm animate-fadeIn antialiased">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <StartInternalConversationModal
        open={showStartConversation}
        categories={categories}
        onClose={() => setShowStartConversation(false)}
        onStart={handleStartInternalConversation}
      />

      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
            channel === 'whatsapp' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
          }`}>
            {channel === 'whatsapp' ? <MessageCircle size={22} /> : <MessageSquare size={22} />}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#001a33]">
              {channel === 'whatsapp' ? 'Comunicação WhatsApp' : 'Mensagens internas'}
            </h1>
            <p className="text-xs font-medium text-slate-400">
              {channel === 'whatsapp'
                ? 'Caixa externa de atendimento e automações financeiras.'
                : `${pendingCount} em aberto, ${solvedCount} solucionadas`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {channel === 'whatsapp' ? (
          <WhatsAppCommunicationPanel />
        ) : (
          <>
            <GestorInbox
              activeChatId={activeChatId}
              activeStatus={activeTicketStatus}
              categories={categories}
              chats={chats}
              filteredChats={filteredChats}
              loading={loadingChats}
              pendingCount={pendingCount}
              searchText={searchText}
              selectedCategory={selectedCategoryFilter}
              solvedCount={solvedCount}
              unreadChatIds={unreadChatIds}
              onActiveChat={setActiveChatId}
              onActiveStatus={setActiveTicketStatus}
              onCategory={setSelectedCategoryFilter}
              onSearch={setSearchText}
              onStart={() => setShowStartConversation(true)}
            />
            <GestorChatPanel
              categories={categories}
              chat={currentChat}
              fileInputRef={fileInputRef}
              loading={loadingMessages}
              messageText={messageText}
              messages={messages}
              messagesEndRef={messagesEndRef}
              pendingFile={pendingFile}
              uploading={uploadingFile}
              onDelete={() => setShowDeleteConfirm(true)}
              onFile={setPendingFile}
              onMessage={setMessageText}
              onSend={handleSendMessage}
              onSolve={handleMarkAsSolved}
              onTransfer={handleTransferCategory}
            />
          </>
        )}
      </div>

      {showDeleteConfirm && (
        <GestorDeleteChatModal
          deleting={deletingChat}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteChat}
        />
      )}
    </div>
  );
};

export default ComunicacaoPage;
