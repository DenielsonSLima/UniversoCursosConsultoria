/* global MediaRecorder, MediaStream */
import React, { useEffect, useState, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
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

const InternalCommunicationPage: React.FC<ComunicacaoPageProps> = ({
  gestorProfile,
  embedded = false,
}) => {
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
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const gestorNome = gestorProfile?.nome || 'Gestor (Escola)';
  const gestorId = gestorProfile?.id || null;

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);

  const clearRecordingResources = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const startRecording = async () => {
    if (recording || uploadingFile) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast.error('Gravação indisponível', 'Este navegador não oferece suporte à gravação de áudio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Recorder = window.MediaRecorder;
      const preferredTypes = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
      ];
      const mimeType = preferredTypes.find((type) => Recorder.isTypeSupported(type));
      const recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const canonicalType = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0];
        const extension = canonicalType.includes('ogg')
          ? 'ogg'
          : canonicalType.includes('webm')
            ? 'webm'
            : canonicalType.includes('mpeg')
              ? 'mp3'
              : 'm4a';
        const blob = new Blob(recordingChunksRef.current, { type: canonicalType });
        if (blob.size > 0) {
          setPendingFile(new File([blob], `mensagem-de-voz-${Date.now()}.${extension}`, {
            type: canonicalType,
          }));
        } else {
          toast.error('Áudio vazio', 'Não foi possível capturar a mensagem de voz. Tente novamente.');
        }
        recordingChunksRef.current = [];
        recorderRef.current = null;
        setRecording(false);
        clearRecordingResources();
      };

      recorder.start(250);
      setRecordingSeconds(0);
      setRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => {
          if (current >= 299) stopRecording();
          return current + 1;
        });
      }, 1_000);
    } catch (error) {
      clearRecordingResources();
      setRecording(false);
      const blocked = (error as { name?: string } | null)?.name === 'NotAllowedError';
      toast.error(
        blocked ? 'Microfone bloqueado' : 'Erro ao gravar',
        blocked
          ? 'Permita o uso do microfone no navegador para enviar mensagens de voz.'
          : 'Não foi possível iniciar a gravação de áudio.',
      );
    }
  };

  useEffect(() => {
    setMessageText('');
    setPendingFile(null);
    return () => {
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
        recorderRef.current = null;
      }
      recordingChunksRef.current = [];
      clearRecordingResources();
      setRecording(false);
    };
  }, [activeChatId]);


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

      const attachmentFallback = fileToSend?.type.startsWith('audio/')
        ? '🎤 Mensagem de voz'
        : fileToSend
          ? `📎 ${fileToSend.name}`
          : '';
      const msgPayload: any = {
        chat_id: activeChatId,
        remetente_id: gestorId,
        remetente_nome: gestorNome,
        remetente_tipo: 'gestor',
        conteudo: text || attachmentFallback,
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
        ultimo_texto: text || attachmentFallback,
        ultima_data: new Date().toISOString(),
        ...(currentChat?.origem === 'publico' && !currentChat.primeira_resposta_em
          ? { primeira_resposta_em: new Date().toISOString() }
          : {}),
      }).eq('id', activeChatId);

      const [resolvedMessage] = await resolveCommunicationAttachmentUrls([newMsg as GestorMessage]);
      setMessages(prev => {
        if (prev.some(m => m.id === resolvedMessage.id)) return prev;
        return [...prev, resolvedMessage];
      });
      playGestorMessageSound('send');
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      setMessageText(text);
      setPendingFile(fileToSend);
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
        .update({ status: 'solucionada', encerrado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
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
    <div className={`flex min-h-0 flex-col overflow-hidden bg-white antialiased ${embedded ? 'h-full flex-1' : 'h-[calc(100vh-120px)] rounded-3xl border border-slate-100 shadow-sm animate-fadeIn'}`}>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <StartInternalConversationModal
        open={showStartConversation}
        categories={categories}
        onClose={() => setShowStartConversation(false)}
        onStart={handleStartInternalConversation}
      />

      {!embedded && (
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <MessageSquare size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#001a33]">Mensagens internas</h1>
              <p className="text-xs font-medium text-slate-400">
                {pendingCount} em aberto, {solvedCount} solucionadas
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
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
          recording={recording}
          recordingSeconds={recordingSeconds}
          uploading={uploadingFile}
          onDelete={() => setShowDeleteConfirm(true)}
          onFile={setPendingFile}
          onMessage={setMessageText}
          onRecord={recording ? stopRecording : startRecording}
          onSend={handleSendMessage}
          onSolve={handleMarkAsSolved}
          onTransfer={handleTransferCategory}
        />
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

const ComunicacaoPage: React.FC<ComunicacaoPageProps> = (props) => {
  if (props.channel === 'whatsapp') {
    return (
      <div className={`flex min-h-0 flex-col overflow-hidden bg-white antialiased ${props.embedded ? 'h-full flex-1' : 'h-[calc(100vh-120px)] rounded-3xl border border-slate-100 shadow-sm animate-fadeIn'}`}>
        <div className="min-h-0 flex-1 overflow-hidden">
          <WhatsAppCommunicationPanel
            initialTab={props.whatsappInitialTab}
            showModuleTabs={props.showWhatsAppModuleTabs}
          />
        </div>
      </div>
    );
  }

  return <InternalCommunicationPage {...props} />;
};

export default ComunicacaoPage;
