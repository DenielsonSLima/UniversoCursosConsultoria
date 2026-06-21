import React, { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, CheckCircle, Clock, Send, Paperclip, MoreVertical, Filter, Tag, Settings, Sparkles, X, FileText, FileSpreadsheet, Image, File, Download, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import ComunicacaoConfig from './components/ComunicacaoConfig';
import ToastNotification, { useToast } from '../components/ToastNotification';

interface Chat {
  id: string;
  remetente_id: string;
  remetente_nome: string;
  remetente_tipo: 'Aluno' | 'Professor';
  categoria_id: string | null;
  status: 'pendente' | 'solucionada';
  ultimo_texto: string | null;
  ultima_data: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  chat_id: string;
  remetente_id: string | null;
  remetente_nome: string;
  remetente_tipo: 'aluno' | 'professor' | 'gestor' | 'sistema';
  conteudo: string;
  anexo_url: string | null;
  lida: boolean;
  created_at: string;
}

interface Category {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  ativo: boolean;
}

const ComunicacaoPage: React.FC = () => {
  const { toasts, removeToast, toast } = useToast();
  const [mainTab, setMainTab] = useState<'tickets' | 'config'>('tickets');
  const [activeTicketStatus, setActiveTicketStatus] = useState<'pendente' | 'solucionada'>('pendente');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('todos');
  const [searchText, setSearchText] = useState('');
  
  // Realtime Data States
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [unreadChatIds, setUnreadChatIds] = useState<Set<string>>(new Set());
  
  // Input State
  const [messageText, setMessageText] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Attachment state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Initial Load: Chats and Categories
  useEffect(() => {
    loadInitialData();
  }, []);

  // 1.1 Realtime: manter o estado global de chats não lidos atualizado
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { data } = await supabase
          .from('comunicacao_mensagens')
          .select('chat_id')
          .eq('lida', false)
          .in('remetente_tipo', ['aluno', 'professor']);
        setUnreadChatIds(new Set(data?.map(m => m.chat_id) || []));
      } catch (err) {
        console.error('Erro ao buscar chats não lidos:', err);
      }
    };

    fetchUnread();

    const msgsGlobalChannel = supabase
      .channel('comunicacao_msgs_global_realtime')
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
  }, []);

  // 2. Realtime Subscription: Chats — robusto, busca o registro completo em cada evento
  useEffect(() => {
    const chatsChannel = supabase
      .channel('comunicacao_chats_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comunicacao_chats' },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id: string }).id;
            setChats(prev => prev.filter(c => c.id !== oldId));
            return;
          }

          // Para INSERT e UPDATE, busca o registro completo para garantir dados corretos
          const changedId = (payload.new as { id: string }).id;
          const { data: freshChat } = await supabase
            .from('comunicacao_chats')
            .select('*')
            .eq('id', changedId)
            .single();

          if (!freshChat) return;

          if (payload.eventType === 'INSERT') {
            setChats(prev => {
              if (prev.some(c => c.id === freshChat.id)) return prev;
              // Novo chat vai pro topo (mais recente primeiro)
              return [freshChat, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setChats(prev => {
              const updated = prev.map(c => c.id === freshChat.id ? freshChat : c);
              // Reordena por ultima_data para que chats com nova mensagem subam
              return [...updated].sort((a, b) =>
                new Date(b.ultima_data).getTime() - new Date(a.ultima_data).getTime()
              );
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chatsChannel);
    };
  }, []);

  // Helper: marcar mensagens do chat ativo como lidas
  const markMessagesAsRead = async (chatId: string) => {
    try {
      await supabase
        .from('comunicacao_mensagens')
        .update({ lida: true })
        .eq('chat_id', chatId)
        .in('remetente_tipo', ['aluno', 'professor'])
        .eq('lida', false);
    } catch (err) {
      console.error('Erro ao marcar mensagens como lidas:', err);
    }
  };

  // 3. Realtime Subscription: Messages of the Active Chat
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    loadMessages(activeChatId);

    const msgsChannel = supabase
      .channel(`comunicacao_msgs_realtime_${activeChatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comunicacao_mensagens',
          filter: `chat_id=eq.${activeChatId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.remetente_tipo === 'aluno' || newMsg.remetente_tipo === 'professor') {
            markMessagesAsRead(activeChatId);
          }
        }
      )
      .subscribe();

    markMessagesAsRead(activeChatId);

    return () => {
      supabase.removeChannel(msgsChannel);
    };
  }, [activeChatId]);

  // 4. Autoscroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadInitialData = async () => {
    setLoadingChats(true);
    try {
      // Fetch categories
      const { data: catData } = await supabase
        .from('comunicacao_categorias')
        .select('*')
        .order('nome', { ascending: true });
      
      setCategories(catData || []);

      // Fetch chats
      const { data: chatData } = await supabase
        .from('comunicacao_chats')
        .select('*')
        .order('ultima_data', { ascending: false });
      
      setChats(chatData || []);

      // Fetch initial unread message chat IDs
      const { data: unreadData } = await supabase
        .from('comunicacao_mensagens')
        .select('chat_id')
        .eq('lida', false)
        .in('remetente_tipo', ['aluno', 'professor']);
      setUnreadChatIds(new Set(unreadData?.map(m => m.chat_id) || []));

      if (chatData && chatData.length > 0) {
        // Find first pending chat to set active by default
        const firstPending = chatData.find(c => c.status === 'pendente');
        if (firstPending) {
          setActiveChatId(firstPending.id);
        } else {
          setActiveChatId(chatData[0].id);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados iniciais de comunicação:', err);
    } finally {
      setLoadingChats(false);
    }
  };

  const loadMessages = async (chatId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('comunicacao_mensagens')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // ── Upload helper ──
  const uploadAttachment = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `comunicacao/gestor/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('anexos').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('anexos').getPublicUrl(path);
    return urlData?.publicUrl || null;
  };

  // ── File icon helper ──
  const getFileIcon = (url: string | null, type?: string) => {
    const lower = (url || type || '').toLowerCase();
    if (/\.(jpe?g|png|gif|webp|svg)/.test(lower) || (type || '').startsWith('image/'))
      return <Image size={14} className="text-blue-500" />;
    if (/\.pdf/.test(lower)) return <FileText size={14} className="text-red-500" />;
    if (/\.(ppt|pptx)/.test(lower)) return <File size={14} className="text-orange-500" />;
    if (/\.(xls|xlsx)/.test(lower)) return <FileSpreadsheet size={14} className="text-emerald-600" />;
    if (/\.(doc|docx)/.test(lower)) return <FileText size={14} className="text-blue-600" />;
    return <File size={14} className="text-slate-500" />;
  };

  const isImageUrl = (url: string) => /\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(url);

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
      let anexoUrl: string | null = null;
      if (fileToSend) {
        anexoUrl = await uploadAttachment(fileToSend);
      }

      const msgPayload: any = {
        chat_id: activeChatId,
        remetente_nome: 'Gestor (Escola)',
        remetente_tipo: 'gestor',
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

      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      toast.error('Erro ao enviar', 'Não foi possível enviar sua resposta.');
    } finally {
      setUploadingFile(false);
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
      const { data: msgsWithAnexo } = await supabase
        .from('comunicacao_mensagens')
        .select('anexo_url')
        .eq('chat_id', activeChatId)
        .not('anexo_url', 'is', null);

      // 2. Deleta arquivos do Storage
      if (msgsWithAnexo && msgsWithAnexo.length > 0) {
        const paths = msgsWithAnexo
          .map((m: any) => {
            try {
              // Extrai o path relativo da URL pública
              // Ex: https://xxx.supabase.co/storage/v1/object/public/anexos/comunicacao/gestor/123.pdf
              const url = new URL(m.anexo_url);
              const pathParts = url.pathname.split('/object/public/anexos/');
              return pathParts[1] || null;
            } catch {
              return null;
            }
          })
          .filter(Boolean) as string[];

        if (paths.length > 0) {
          const { error: storageErr } = await supabase.storage
            .from('anexos')
            .remove(paths);
          if (storageErr) {
            console.warn('Alguns arquivos não puderam ser removidos:', storageErr);
          }
        }
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
      toast.error('Erro ao excluir', 'Não foi possível excluir o atendimento.');
    } finally {
      setDeletingChat(false);
    }
  };

  // Get active chat data
  const currentChat = chats.find(c => c.id === activeChatId);

  // Filtered chats list
  const filteredChats = chats.filter(c => {
    if (c.status !== activeTicketStatus) return false;
    if (selectedCategoryFilter !== 'todos' && c.categoria_id !== selectedCategoryFilter) return false;
    if (searchText && !c.remetente_nome.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  // Helpers for category visual mapping
  const getCategoryInfo = (catId: string | null) => {
    if (!catId) return { nome: 'Geral', cor: '#475569' };
    const cat = categories.find(c => c.id === catId);
    return cat || { nome: 'Geral', cor: '#475569' };
  };

  // Format timestamp (HH:MM or Date)
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden shadow-sm animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      
      {/* Top Header & Navigation Tabs */}
      <div className="bg-white px-6 py-4 border-b border-slate-150 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
            <MessageSquare size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Central de Comunicação</h1>
            <p className="text-xs text-slate-400 font-medium">Atendimentos internos em tempo real</p>
          </div>
        </div>

        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setMainTab('tickets')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              mainTab === 'tickets' ? 'bg-[#001a33] text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <MessageSquare size={14} /> Atendimentos
          </button>
          <button
            onClick={() => setMainTab('config')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              mainTab === 'config' ? 'bg-[#001a33] text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Settings size={14} /> Configurações
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {mainTab === 'config' ? (
          <ComunicacaoConfig />
        ) : (
          <>
            {/* Sidebar: Tickets list */}
            <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50 shrink-0">
              
              {/* Ticket Status Selectors */}
              <div className="p-4 border-b border-slate-200 bg-white space-y-4">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                  <button 
                    onClick={() => {
                      setActiveTicketStatus('pendente');
                      // Auto select first match if available
                      const matches = chats.filter(c => c.status === 'pendente');
                      if (matches.length > 0) setActiveChatId(matches[0].id);
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
                      activeTicketStatus === 'pendente' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-amber-600'
                    }`}
                  >
                    <Clock size={14} /> Pendentes
                  </button>
                  <button 
                    onClick={() => {
                      setActiveTicketStatus('solucionada');
                      const matches = chats.filter(c => c.status === 'solucionada');
                      if (matches.length > 0) setActiveChatId(matches[0].id);
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
                      activeTicketStatus === 'solucionada' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-emerald-600'
                    }`}
                  >
                    <CheckCircle size={14} /> Solucionadas
                  </button>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Buscar por nome..."
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className="w-full bg-slate-100 border border-transparent focus:border-blue-500 outline-none rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 transition-all"
                    />
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                  
                  <div className="relative">
                    <select
                      value={selectedCategoryFilter}
                      onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                      className="w-full appearance-none bg-slate-100 border border-transparent outline-none rounded-xl pl-9 pr-8 py-2 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      <option value="todos">Todas Categorias</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                    <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Scrollable Tickets List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                {loadingChats ? (
                  <div className="flex justify-center items-center py-10">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : filteredChats.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 px-4">
                    <MessageSquare size={24} className="mx-auto text-slate-350 mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Nenhum atendimento</p>
                    <p className="text-[9px] mt-0.5">Use o Simulador na aba Configurações para abrir atendimentos de teste.</p>
                  </div>
                ) : (
                  filteredChats.map(chat => {
                    const catInfo = getCategoryInfo(chat.categoria_id);
                    const isSelected = activeChatId === chat.id;

                    return (
                      <button 
                        key={chat.id}
                        onClick={() => setActiveChatId(chat.id)}
                        className={`w-full flex items-start gap-3 p-3 rounded-2xl text-left transition-all ${
                          isSelected ? 'bg-white shadow-sm border border-slate-200' : 'hover:bg-slate-100 border border-transparent'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm ${
                          chat.remetente_tipo === 'Professor' ? 'bg-purple-600' : 'bg-blue-600'
                        }`}>
                          {chat.remetente_nome.slice(0, 2).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-0.5">
                            <h4 className="font-bold truncate text-xs text-[#001a33] flex items-center gap-1.5">
                              {chat.remetente_nome}
                              {unreadChatIds.has(chat.id) && (
                                <span className="w-2 h-2 bg-red-500 rounded-full shrink-0 animate-pulse" />
                              )}
                            </h4>
                            <span className="text-[9px] text-slate-400 font-bold shrink-0">{formatTime(chat.ultima_data)}</span>
                          </div>
                          
                          <p className="text-[10px] text-slate-500 truncate font-medium">
                            {chat.ultimo_texto || 'Sem mensagens...'}
                          </p>

                          <div className="flex items-center gap-1.5 mt-2">
                             <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: catInfo.cor }}></div>
                             <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider">{catInfo.nome}</span>
                             <span className="text-[8px] text-slate-300 font-medium">|</span>
                             <span className={`text-[8px] font-black uppercase tracking-wider ${
                               chat.remetente_tipo === 'Professor' ? 'text-purple-600 bg-purple-50' : 'text-blue-600 bg-blue-50'
                             } px-1 rounded`}>
                               {chat.remetente_tipo}
                             </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Chat Area (Conversas e mensagens) */}
            {activeChatId && currentChat ? (
              <div className="flex-1 flex flex-col bg-white">
                
                {/* Chat Topbar */}
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-10">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white ${
                      currentChat.remetente_tipo === 'Professor' ? 'bg-purple-600' : 'bg-blue-600'
                    }`}>
                      {currentChat.remetente_nome.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-xs text-slate-800 flex items-center gap-2">
                        {currentChat.remetente_nome}
                        <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          currentChat.remetente_tipo === 'Professor' ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
                        }`}>
                          {currentChat.remetente_tipo}
                        </span>
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider flex items-center gap-1">
                          <Tag size={9} /> {getCategoryInfo(currentChat.categoria_id).nome}
                        </span>
                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                        <span className={`text-[9px] uppercase font-black tracking-wider flex items-center gap-1 ${
                          currentChat.status === 'pendente' ? 'text-amber-500' : 'text-emerald-500'
                        }`}>
                          {currentChat.status === 'pendente' ? <Clock size={9} /> : <CheckCircle size={9} />}
                          {currentChat.status === 'pendente' ? 'Aberto' : 'Resolvido'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {currentChat.status === 'pendente' && (
                      <button 
                        onClick={handleMarkAsSolved}
                        className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                      >
                        <CheckCircle size={12} /> Finalizar Atendimento
                      </button>
                    )}
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      title="Excluir atendimento e arquivos"
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Messages Display */}
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-4 custom-scrollbar">
                  {loadingMessages ? (
                    <div className="flex justify-center items-center py-20">
                      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isGestor = msg.remetente_tipo === 'gestor';
                      const isSystem = msg.remetente_tipo === 'sistema';

                      if (isSystem) {
                        return (
                          <div key={msg.id} className="flex justify-center my-6">
                            <span className="bg-slate-100 border border-slate-200 text-slate-500 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-inner flex items-center gap-1">
                              <Sparkles size={9} /> {msg.conteudo}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div 
                          key={msg.id} 
                          className={`flex items-end gap-2 ${isGestor ? 'justify-end' : 'justify-start'}`}
                        >
                          {!isGestor && (
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0 ${
                              currentChat.remetente_tipo === 'Professor' ? 'bg-purple-500' : 'bg-blue-500'
                            }`}>
                              {msg.remetente_nome.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          
                          <div 
                            className={`rounded-2xl max-w-md shadow-sm border overflow-hidden ${
                              isGestor 
                                ? 'bg-[#001a33] text-white border-transparent rounded-br-sm' 
                                : 'bg-white text-slate-700 border-slate-100 rounded-bl-sm'
                            }`}
                          >
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
                                      isGestor ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
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
                                <p className={`text-[8px] font-black uppercase tracking-wider mb-1 ${
                                  isGestor ? 'text-blue-300' : 'text-blue-600'
                                }`}>
                                  {msg.remetente_nome}
                                </p>
                                <p className="text-xs font-medium leading-relaxed break-words">{msg.conteudo}</p>
                              </div>
                            )}
                            <div className={`flex items-center justify-end px-3 pb-1.5 ${ msg.conteudo && !msg.conteudo.startsWith('📎') ? '' : 'pt-1.5' }`}>
                              <span className="text-[8px] font-bold text-slate-400">{formatTime(msg.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Messages Input Box */}
                <div className="shrink-0 border-t border-slate-200 bg-white">
                  {currentChat.status === 'solucionada' ? (
                    <div className="px-4 py-4">
                      <div className="text-center bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                        <CheckCircle size={12} /> Esta solicitação já foi finalizada.
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 space-y-2">
                      {/* Pending file preview */}
                      {pendingFile && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
                          {getFileIcon(null, pendingFile.type)}
                          <span className="text-xs font-bold text-slate-700 truncate flex-1">{pendingFile.name}</span>
                          <button onClick={() => setPendingFile(null)} className="p-0.5 hover:bg-blue-200 rounded-full transition-colors">
                            <X size={12} className="text-slate-500" />
                          </button>
                        </div>
                      )}

                      {/* Input row */}
                      <div className="flex items-center gap-2">
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
                          accept="image/*,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            setPendingFile(f);
                            e.target.value = '';
                          }}
                        />

                        <div className="flex-1 bg-slate-50 rounded-xl flex items-center px-4 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white transition-all">
                          <input 
                            type="text" 
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                            placeholder="Escreva sua resposta..."
                            className="w-full bg-transparent border-none outline-none text-xs text-slate-700 py-3 font-medium"
                          />
                        </div>

                        <button 
                          onClick={handleSendMessage}
                          disabled={!messageText.trim() && !pendingFile || uploadingFile}
                          className="p-2.5 bg-[#001a33] text-white rounded-xl hover:bg-blue-900 transition-colors shadow-lg disabled:opacity-40 shrink-0"
                        >
                          {uploadingFile
                            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Send size={16} />}
                        </button>
                      </div>
                      <p className="text-[9px] text-slate-400 pl-12 font-medium">Aceita: imagens, PDF, Word, Excel, PowerPoint</p>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 px-8 text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-300 mb-4 shadow-sm">
                  <MessageSquare size={30} />
                </div>
                <h3 className="text-lg font-black text-[#001a33] tracking-tight">Atendimento ao Usuário</h3>
                <p className="text-slate-400 text-xs font-medium max-w-xs mt-1">
                  Selecione um chamado ao lado para iniciar a conversa em tempo real.
                </p>
              </div>
            )}
          </>
        )}

      </div>

      {/* ── Hard-Delete Confirmation Modal (Gestor) ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full border border-slate-100 shadow-2xl relative animate-fadeIn">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center">
                <AlertTriangle size={28} />
              </div>

              <div>
                <h4 className="text-base font-black text-[#001a33] uppercase tracking-tight">Excluir Atendimento</h4>
                <p className="text-slate-500 text-xs mt-2 leading-relaxed">
                  Esta ação é <strong>irreversível</strong>. O atendimento, todas as mensagens
                  e <strong>todos os arquivos anexados</strong> serão permanentemente deletados.
                  O aluno também perderá acesso ao histórico.
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
                    : <><Trash2 size={13} /> Excluir Tudo</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComunicacaoPage;
