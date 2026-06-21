import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import {
  MessageSquare, Send, Paperclip, Clock, CheckCircle, Tag, Plus, X, Sparkles,
  FileText, FileSpreadsheet, Presentation, Image, File, Download, Trash2, AlertTriangle
} from 'lucide-react';
import ToastNotification, { useToast } from '../../gestor/components/ToastNotification';

interface ComunicacaoPageProps {
  alunoId: string;
  alunoNome: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = 'image/*,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx';

const getFileIcon = (url: string | null, type?: string) => {
  if (!url && !type) return <File size={14} />;
  const lower = (url || type || '').toLowerCase();
  if (/\.(jpe?g|png|gif|webp|svg)/.test(lower) || (type || '').startsWith('image/'))
    return <Image size={14} className="text-blue-500" />;
  if (/\.pdf/.test(lower) || lower.includes('pdf'))
    return <FileText size={14} className="text-red-500" />;
  if (/\.(ppt|pptx)/.test(lower) || lower.includes('presentation'))
    return <Presentation size={14} className="text-orange-500" />;
  if (/\.(xls|xlsx)/.test(lower) || lower.includes('spreadsheet'))
    return <FileSpreadsheet size={14} className="text-emerald-600" />;
  if (/\.(doc|docx)/.test(lower) || lower.includes('word'))
    return <FileText size={14} className="text-blue-600" />;
  return <File size={14} className="text-slate-500" />;
};

const isImageUrl = (url: string) =>
  /\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(url);

// ─── Component ───────────────────────────────────────────────────────────────

const ComunicacaoPage: React.FC<ComunicacaoPageProps> = ({ alunoId, alunoNome }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatCategory, setNewChatCategory] = useState('');
  const [newChatSubject, setNewChatSubject] = useState('');
  const [unreadChatIds, setUnreadChatIds] = useState<Set<string>>(new Set());

  // Attachment state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Delete confirm modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);

  // ── 1. Fetch Categories ──
  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ['comunicacao-categorias'],
    queryFn: async () => {
      const { data, error } = await supabase.from('comunicacao_categorias').select('*').eq('ativo', true);
      if (error) throw error;
      return data || [];
    }
  });

  // ── 2. Fetch Aluno's Chats (mais recente primeiro, excluindo soft-deleted) ──
  const { data: chats = [], isLoading: loadingChats } = useQuery<any[]>({
    queryKey: ['aluno-chats', alunoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comunicacao_chats')
        .select('*')
        .eq('remetente_id', alunoId)
        .eq('deleted_by_aluno', false)      // ← só mostra os não excluídos
        .order('ultima_data', { ascending: false }); // ← mais recente primeiro
      if (error) throw error;
      return data || [];
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // ── 3. Fetch Messages for Active Chat ──
  const { data: messages = [], isLoading: loadingMessages } = useQuery<any[]>({
    queryKey: ['chat-messages', activeChatId],
    enabled: !!activeChatId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comunicacao_mensagens')
        .select('*')
        .eq('chat_id', activeChatId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  // ── 3.1 Fetch and Subscribe to global unread messages ──
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { data: studentChats } = await supabase
          .from('comunicacao_chats')
          .select('id')
          .eq('remetente_id', alunoId)
          .eq('deleted_by_aluno', false);
        
        const chatIds = studentChats?.map(c => c.id) || [];
        if (chatIds.length === 0) {
          setUnreadChatIds(new Set());
          return;
        }

        const { data } = await supabase
          .from('comunicacao_mensagens')
          .select('chat_id')
          .in('chat_id', chatIds)
          .eq('lida', false)
          .in('remetente_tipo', ['gestor', 'sistema']);
        
        setUnreadChatIds(new Set(data?.map(m => m.chat_id) || []));
      } catch (err) {
        console.error('Erro ao buscar chamados não lidos:', err);
      }
    };
    
    fetchUnread();

    const msgsGlobalChannel = supabase
      .channel('aluno_comunicacao_msgs_global_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comunicacao_mensagens' },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgsGlobalChannel);
    };
  }, [alunoId]);

  // Helper: marcar mensagens como lidas
  const markMessagesAsRead = async (chatId: string) => {
    try {
      await supabase
        .from('comunicacao_mensagens')
        .update({ lida: true })
        .eq('chat_id', chatId)
        .in('remetente_tipo', ['gestor', 'sistema'])
        .eq('lida', false);
    } catch (err) {
      console.error('Erro ao marcar mensagens como lidas:', err);
    }
  };

  // ── 4. Realtime: Messages of active chat ──
  useEffect(() => {
    if (!activeChatId) return;
    const msgsChannel = supabase
      .channel(`aluno_msgs_realtime_${activeChatId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'comunicacao_mensagens',
        filter: `chat_id=eq.${activeChatId}`,
      }, (payload) => {
        queryClient.setQueryData(['chat-messages', activeChatId], (oldData: any[] | undefined) => {
          if (!oldData) return [payload.new];
          if (oldData.some(m => m.id === payload.new.id)) return oldData;
          return [...oldData, payload.new];
        });
        if (payload.new.remetente_tipo === 'gestor' || payload.new.remetente_tipo === 'sistema') {
          markMessagesAsRead(activeChatId);
        }
      })
      .subscribe();

    markMessagesAsRead(activeChatId);

    return () => { supabase.removeChannel(msgsChannel); };
  }, [activeChatId, queryClient]);

  // ── 5. Realtime: Chat list updates ──
  useEffect(() => {
    const chatsChannel = supabase
      .channel(`aluno_chats_realtime_${alunoId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'comunicacao_chats',
        filter: `remetente_id=eq.${alunoId}`
      }, () => { queryClient.invalidateQueries({ queryKey: ['aluno-chats', alunoId] }); })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'comunicacao_chats',
        filter: `remetente_id=eq.${alunoId}`
      }, async (payload) => {
        const changedId = (payload.new as { id: string }).id;
        const { data: freshChat } = await supabase.from('comunicacao_chats').select('*').eq('id', changedId).single();
        if (!freshChat) return;
        queryClient.setQueryData(['aluno-chats', alunoId], (oldData: any[] | undefined) => {
          if (!oldData) return [freshChat];
          const updated = oldData.map(c => c.id === freshChat.id ? freshChat : c);
          return [...updated].sort((a, b) => new Date(b.ultima_data).getTime() - new Date(a.ultima_data).getTime());
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(chatsChannel); };
  }, [alunoId, queryClient]);

  // ── 6. Autoscroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── 7. Default active chat ──
  useEffect(() => {
    if (chats.length > 0 && !activeChatId) setActiveChatId(chats[0].id);
  }, [chats, activeChatId]);

  // ── Upload helper ──
  const uploadAttachment = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `comunicacao/${alunoId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('anexos').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('anexos').getPublicUrl(path);
    return urlData?.publicUrl || null;
  };

  // ── Send Message ──
  const handleSendMessage = async () => {
    if (!activeChatId) return;
    const text = messageText.trim();
    const fileToSend = pendingFile;
    if (!text && !fileToSend) return;

    setMessageText('');
    setPendingFile(null);
    setUploadingFile(!!fileToSend);

    try {
      let anexoUrl: string | null = null;
      if (fileToSend) {
        anexoUrl = await uploadAttachment(fileToSend);
      }

      const msgPayload: any = {
        chat_id: activeChatId,
        remetente_id: alunoId,
        remetente_nome: alunoNome,
        remetente_tipo: 'aluno',
        conteudo: text || (fileToSend ? `📎 ${fileToSend.name}` : ''),
        anexo_url: anexoUrl,
      };

      const { data: newMsg, error: msgErr } = await supabase
        .from('comunicacao_mensagens').insert(msgPayload).select().single();
      if (msgErr) throw msgErr;

      await supabase.from('comunicacao_chats').update({
        ultimo_texto: text || `📎 ${fileToSend?.name}`,
        ultima_data: new Date().toISOString()
      }).eq('id', activeChatId);

      queryClient.setQueryData(['chat-messages', activeChatId], (oldData: any[] | undefined) => {
        if (!oldData) return [newMsg];
        if (oldData.some(m => m.id === newMsg.id)) return oldData;
        return [...oldData, newMsg];
      });
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      toast.error('Erro ao enviar', 'Não foi possível enviar a mensagem.');
    } finally {
      setUploadingFile(false);
    }
  };

  // ── Soft-delete chat (aluno) ──
  // O chat some da visão do aluno, mas os arquivos e mensagens ficam no banco.
  // O gestor ainda pode ver e administrar o atendimento normalmente.
  const handleDeleteChat = async () => {
    if (!activeChatId) return;
    setDeletingChat(true);
    try {
      const { error } = await supabase
        .from('comunicacao_chats')
        .update({ deleted_by_aluno: true })
        .eq('id', activeChatId)
        .eq('remetente_id', alunoId); // segurança: só pode excluir o próprio

      if (error) throw error;

      // Remove do cache local imediatamente
      queryClient.setQueryData(['aluno-chats', alunoId], (oldData: any[] | undefined) =>
        (oldData || []).filter(c => c.id !== activeChatId)
      );
      setActiveChatId(null);
      setShowDeleteConfirm(false);
      toast.success('Chamado removido', 'O chamado foi removido da sua lista.');
    } catch (err) {
      console.error(err);
      toast.error('Erro', 'Não foi possível remover o chamado.');
    } finally {
      setDeletingChat(false);
    }
  };

  // ── Open New Chat ──
  const handleCreateNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatCategory || !newChatSubject.trim()) return;
    try {
      const selectedCat = categories.find(c => c.id === newChatCategory);
      const catName = selectedCat ? selectedCat.nome : 'Suporte';

      const { data: newChat, error: chatErr } = await supabase.from('comunicacao_chats').insert({
        remetente_id: alunoId,
        remetente_nome: alunoNome,
        remetente_tipo: 'Aluno',
        categoria_id: newChatCategory,
        status: 'pendente',
        ultimo_texto: newChatSubject,
        ultima_data: new Date().toISOString()
      }).select().single();
      if (chatErr) throw chatErr;

      await supabase.from('comunicacao_mensagens').insert({
        chat_id: newChat.id,
        remetente_id: alunoId,
        remetente_nome: alunoNome,
        remetente_tipo: 'aluno',
        conteudo: `Iniciou o chamado sobre [${catName}]: ${newChatSubject}`
      });

      setShowNewChatModal(false);
      setNewChatCategory('');
      setNewChatSubject('');
      queryClient.invalidateQueries({ queryKey: ['aluno-chats', alunoId] });
      setActiveChatId(newChat.id);
      toast.success('Chamado aberto', 'Nossa equipe responderá em breve!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao abrir chamado', 'Não foi possível abrir o chamado.');
    }
  };

  // ── Helpers ──
  const currentChat = chats.find(c => c.id === activeChatId);

  const getCategoryInfo = (catId: string | null) => {
    if (!catId) return { nome: 'Geral', cor: '#475569' };
    return categories.find(c => c.id === catId) || { nome: 'Geral', cor: '#475569' };
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const today = new Date();
    if (d.toDateString() === today.toDateString())
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      {/* ── Top Header ── */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
            <MessageSquare size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Central de Atendimento</h1>
            <p className="text-xs text-slate-400 font-medium">Fale com a secretaria, financeiro ou suporte pedagógico</p>
          </div>
        </div>
        <button
          onClick={() => setShowNewChatModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#001a33] hover:bg-blue-900 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
        >
          <Plus size={14} /> Novo Chamado
        </button>
      </div>

      {/* ── Main Layout ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Left: Chat list ── */}
        <div className="w-72 border-r border-slate-200 flex flex-col bg-slate-50/50 shrink-0">
          <div className="px-4 py-3 border-b border-slate-200 bg-white">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Seus Chamados</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
            {loadingChats ? (
              <div className="flex justify-center items-center py-10">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : chats.length === 0 ? (
              <div className="text-center py-12 text-slate-400 px-4">
                <MessageSquare size={24} className="mx-auto mb-2 text-slate-300" />
                <p className="text-[10px] font-black uppercase tracking-widest">Nenhum chamado aberto</p>
                <p className="text-[9px] mt-1">Clique em "Novo Chamado" para iniciar um atendimento.</p>
              </div>
            ) : (
              chats.map(chat => {
                const catInfo = getCategoryInfo(chat.categoria_id);
                const isSelected = activeChatId === chat.id;
                const isPending = chat.status === 'pendente';

                return (
                  <button
                    key={chat.id}
                    onClick={() => setActiveChatId(chat.id)}
                    className={`w-full flex items-start gap-3 p-3 rounded-2xl text-left transition-all ${
                      isSelected
                        ? 'bg-white shadow-md border border-blue-100'
                        : 'hover:bg-white/70 border border-transparent'
                    }`}
                  >
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                      isPending ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {isPending ? <Clock size={16} /> : <CheckCircle size={16} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h4 className="font-bold truncate text-xs text-[#001a33] flex items-center gap-1.5">
                          Suporte Universo
                          {unreadChatIds.has(chat.id) && (
                            <span className="w-2 h-2 bg-red-500 rounded-full shrink-0 animate-pulse" />
                          )}
                        </h4>
                        <span className="text-[9px] text-slate-400 font-bold shrink-0 ml-1">{formatTime(chat.ultima_data)}</span>
                      </div>

                      <p className="text-[10px] text-slate-500 truncate font-medium">{chat.ultimo_texto || '...'}</p>

                      <div className="flex items-center gap-1.5 mt-1.5">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: catInfo.cor }} />
                        <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider">{catInfo.nome}</span>
                        <span className="text-[8px] text-slate-300">|</span>
                        <span className={`text-[8px] font-black uppercase tracking-wider ${
                          isPending ? 'text-amber-600' : 'text-emerald-600'
                        }`}>
                          {isPending ? 'Aberto' : 'Resolvido'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: Chat Panel ── */}
        {activeChatId && currentChat ? (
          <div className="flex-1 flex flex-col min-h-0 bg-white">

            {/* Chat Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  currentChat.status === 'pendente' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {currentChat.status === 'pendente' ? <Clock size={16} /> : <CheckCircle size={16} />}
                </div>
                <div>
                  <h3 className="font-bold text-xs text-[#001a33]">Suporte Universo</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider flex items-center gap-1">
                      <Tag size={9} /> {getCategoryInfo(currentChat.categoria_id).nome}
                    </span>
                    <span className="w-1 h-1 bg-slate-300 rounded-full" />
                    <span className={`text-[9px] uppercase font-black tracking-wider flex items-center gap-1 ${
                      currentChat.status === 'pendente' ? 'text-amber-500' : 'text-emerald-500'
                    }`}>
                      {currentChat.status === 'pendente' ? <Clock size={9} /> : <CheckCircle size={9} />}
                      {currentChat.status === 'pendente' ? 'Aberto' : 'Resolvido'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Delete button */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title="Remover da minha lista"
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Messages Area — scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/40">
              {loadingMessages ? (
                <div className="flex justify-center items-center py-20">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                messages.map((msg) => {
                  const isSelf = msg.remetente_tipo === 'aluno';
                  const isSystem = msg.remetente_tipo === 'sistema';

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <span className="bg-slate-100 border border-slate-200 text-slate-500 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-inner flex items-center gap-1">
                          <Sparkles size={9} /> {msg.conteudo}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className={`flex items-end gap-2 ${isSelf ? 'justify-end' : 'justify-start'}`}>
                      {!isSelf && (
                        <div className="w-7 h-7 bg-[#001a33] text-white rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0">
                          AD
                        </div>
                      )}
                      <div className={`rounded-2xl max-w-sm shadow-sm border overflow-hidden ${
                        isSelf
                          ? 'bg-[#001a33] text-white border-transparent rounded-br-sm'
                          : 'bg-white text-slate-700 border-slate-100 rounded-bl-sm'
                      }`}>
                        {/* Attachment preview */}
                        {msg.anexo_url && (
                          <div className="p-2 border-b border-white/10">
                            {isImageUrl(msg.anexo_url) ? (
                              <img
                                src={msg.anexo_url}
                                alt="anexo"
                                className="max-w-[220px] max-h-[160px] rounded-xl object-cover cursor-pointer"
                                onClick={() => window.open(msg.anexo_url, '_blank')}
                              />
                            ) : (
                              <a
                                href={msg.anexo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                                  isSelf ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                                }`}
                              >
                                {getFileIcon(msg.anexo_url)}
                                <span className="truncate max-w-[160px]">{msg.anexo_url.split('/').pop()}</span>
                                <Download size={12} className="shrink-0" />
                              </a>
                            )}
                          </div>
                        )}
                        {/* Text */}
                        {msg.conteudo && !msg.conteudo.startsWith('📎') && (
                          <div className="px-3 pt-2 pb-1">
                            <p className={`text-[8px] font-black uppercase tracking-wider mb-1 ${isSelf ? 'text-blue-300' : 'text-blue-600'}`}>
                              {isSelf ? 'Você' : msg.remetente_nome}
                            </p>
                            <p className="text-xs font-medium leading-relaxed break-words">{msg.conteudo}</p>
                          </div>
                        )}
                        <div className={`flex items-center justify-end px-3 pb-1.5 ${msg.conteudo && !msg.conteudo.startsWith('📎') ? '' : 'pt-1.5'}`}>
                          <span className="text-[8px] font-bold text-slate-400">{formatTime(msg.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Box — FIXED at bottom ── */}
            <div className="shrink-0 border-t border-slate-200 bg-white">
              {currentChat.status === 'solucionada' ? (
                <div className="px-4 py-4 text-center">
                  <div className="bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-xl py-3 flex items-center justify-center gap-2">
                    <CheckCircle size={12} /> Este atendimento foi finalizado pela instituição.
                  </div>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {/* Pending file preview */}
                  {pendingFile && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
                      {getFileIcon(null, pendingFile.type)}
                      <span className="text-xs font-bold text-slate-700 truncate flex-1">{pendingFile.name}</span>
                      <button
                        onClick={() => setPendingFile(null)}
                        className="p-0.5 hover:bg-blue-200 rounded-full transition-colors"
                      >
                        <X size={12} className="text-slate-500" />
                      </button>
                    </div>
                  )}

                  {/* Input row */}
                  <div className="flex items-center gap-2">
                    {/* File attach button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0"
                      title="Anexar arquivo"
                    >
                      <Paperclip size={18} />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_TYPES}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setPendingFile(f);
                        e.target.value = '';
                      }}
                    />

                    {/* Text input */}
                    <div className="flex-1 bg-slate-50 rounded-xl flex items-center px-4 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white transition-all">
                      <input
                        type="text"
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                        placeholder="Escreva sua mensagem..."
                        className="w-full bg-transparent border-none outline-none text-xs text-slate-700 py-3 font-medium"
                      />
                    </div>

                    {/* Send button */}
                    <button
                      onClick={handleSendMessage}
                      disabled={!messageText.trim() && !pendingFile || uploadingFile}
                      className="p-2.5 bg-[#001a33] text-white rounded-xl hover:bg-blue-900 transition-colors shadow-md disabled:opacity-40 shrink-0"
                    >
                      {uploadingFile
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <Send size={16} />
                      }
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 pl-12 font-medium">
                    Aceita: imagens, PDF, Word, Excel, PowerPoint
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/40 px-8 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-300 mb-4 shadow-sm">
              <MessageSquare size={30} />
            </div>
            <h3 className="text-lg font-black text-[#001a33] tracking-tight">Central de Atendimento</h3>
            <p className="text-slate-400 text-xs font-medium max-w-xs mt-1">
              Selecione um chamado à esquerda ou crie um novo chamado para tirar suas dúvidas.
            </p>
          </div>
        )}
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full border border-slate-100 shadow-2xl relative animate-fadeIn">
            <div className="flex flex-col items-center text-center gap-4">
              {/* Icon */}
              <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center">
                <AlertTriangle size={28} />
              </div>

              <div>
                <h4 className="text-base font-black text-[#001a33] uppercase tracking-tight">Remover Chamado</h4>
                <p className="text-slate-500 text-xs mt-2 leading-relaxed">
                  Este chamado será removido <strong>apenas da sua lista</strong>. As mensagens
                  e arquivos <strong>não serão apagados</strong> — o atendimento continuará
                  visível para a equipe da escola.
                </p>
              </div>

              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deletingChat}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-widest rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteChat}
                  disabled={deletingChat}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deletingChat
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><Trash2 size={13} /> Remover</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New Ticket Modal ── */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full border border-slate-100 shadow-2xl relative animate-fadeIn">
            <button
              onClick={() => setShowNewChatModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors"
            >
              <X size={18} />
            </button>
            <div className="mb-6">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-3">
                <MessageSquare size={20} />
              </div>
              <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Abrir Novo Chamado</h4>
              <p className="text-slate-500 text-xs mt-1">Selecione o setor e descreva sua dúvida ou problema.</p>
            </div>

            <form onSubmit={handleCreateNewChat} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Setor de Destino</label>
                <select
                  required
                  value={newChatCategory}
                  onChange={(e) => setNewChatCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                >
                  <option value="">Selecione uma categoria...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Dúvida / Assunto</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Descreva detalhadamente o que você precisa..."
                  value={newChatSubject}
                  onChange={(e) => setNewChatSubject(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 text-xs font-medium text-slate-700 focus:border-blue-500 focus:bg-white transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#001a33] hover:bg-blue-900 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg"
              >
                Abrir Chamado
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComunicacaoPage;
