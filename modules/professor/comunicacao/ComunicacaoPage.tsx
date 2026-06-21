import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { MessageSquare, Send, Paperclip, Clock, CheckCircle, Tag, Plus, X, Sparkles } from 'lucide-react';

interface ComunicacaoPageProps {
  professorId: string;
  professorNome: string;
}

const ComunicacaoPage: React.FC<ComunicacaoPageProps> = ({ professorId, professorNome }) => {
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  
  // New Chat Form States
  const [newChatCategory, setNewChatCategory] = useState('');
  const [newChatSubject, setNewChatSubject] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Categories
  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ['comunicacao-categorias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comunicacao_categorias')
        .select('*')
        .eq('ativo', true);
      if (error) throw error;
      return data || [];
    }
  });

  // 2. Fetch Teacher's Chats
  const { data: chats = [], isLoading: loadingChats } = useQuery<any[]>({
    queryKey: ['professor-chats', professorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comunicacao_chats')
        .select('*')
        .eq('remetente_id', professorId)
        .order('ultima_data', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  // 3. Fetch Messages for Active Chat
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

  // 4. Realtime subscription for active chat's messages
  useEffect(() => {
    if (!activeChatId) return;

    const msgsChannel = supabase
      .channel(`chat_msgs_realtime_${activeChatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comunicacao_mensagens',
          filter: `chat_id=eq.${activeChatId}`,
        },
        (payload) => {
          console.log('Realtime message received:', payload.new);
          queryClient.setQueryData(['chat-messages', activeChatId], (oldData: any[] | undefined) => {
            if (!oldData) return [payload.new];
            if (oldData.some(m => m.id === payload.new.id)) return oldData;
            return [...oldData, payload.new];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgsChannel);
    };
  }, [activeChatId, queryClient]);

  // 5. Realtime subscription for chats list updates
  useEffect(() => {
    const chatsChannel = supabase
      .channel(`professor_chats_realtime_${professorId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comunicacao_chats',
          filter: `remetente_id=eq.${professorId}`
        },
        (payload) => {
          console.log('Chats list update detected, invalidating...');
          queryClient.invalidateQueries({ queryKey: ['professor-chats', professorId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chatsChannel);
    };
  }, [professorId, queryClient]);

  // 6. Autoscroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Set default active chat
  useEffect(() => {
    if (chats.length > 0 && !activeChatId) {
      setActiveChatId(chats[0].id);
    }
  }, [chats, activeChatId]);

  // Send Message
  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeChatId) return;
    const text = messageText;
    setMessageText('');

    try {
      const { data: newMsg, error: msgErr } = await supabase
        .from('comunicacao_mensagens')
        .insert({
          chat_id: activeChatId,
          remetente_id: professorId,
          remetente_nome: professorNome,
          remetente_tipo: 'professor',
          conteudo: text
        })
        .select()
        .single();

      if (msgErr) throw msgErr;

      const { error: chatErr } = await supabase
        .from('comunicacao_chats')
        .update({
          ultimo_texto: text,
          ultima_data: new Date().toISOString()
        })
        .eq('id', activeChatId);

      if (chatErr) throw chatErr;

      queryClient.setQueryData(['chat-messages', activeChatId], (oldData: any[] | undefined) => {
        if (!oldData) return [newMsg];
        if (oldData.some(m => m.id === newMsg.id)) return oldData;
        return [...oldData, newMsg];
      });
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      alert('Erro ao enviar mensagem.');
    }
  };

  // Open New Chat Ticket
  const handleCreateNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatCategory || !newChatSubject.trim()) return;

    try {
      const selectedCat = categories.find(c => c.id === newChatCategory);
      const catName = selectedCat ? selectedCat.nome : 'Suporte';

      const { data: newChat, error: chatErr } = await supabase
        .from('comunicacao_chats')
        .insert({
          remetente_id: professorId,
          remetente_nome: professorNome,
          remetente_tipo: 'Professor',
          categoria_id: newChatCategory,
          status: 'pendente',
          ultimo_texto: newChatSubject,
          ultima_data: new Date().toISOString()
        })
        .select()
        .single();

      if (chatErr) throw chatErr;

      const { error: msgErr } = await supabase
        .from('comunicacao_mensagens')
        .insert({
          chat_id: newChat.id,
          remetente_id: professorId,
          remetente_nome: professorNome,
          remetente_tipo: 'professor',
          conteudo: `Iniciou o chamado sobre [${catName}]: ${newChatSubject}`
        });

      if (msgErr) throw msgErr;

      setShowNewChatModal(false);
      setNewChatCategory('');
      setNewChatSubject('');
      
      queryClient.invalidateQueries({ queryKey: ['professor-chats', professorId] });
      setActiveChatId(newChat.id);
      
      alert('Chamado aberto com sucesso!');
    } catch (err) {
      console.error('Erro ao abrir chamado:', err);
      alert('Erro ao abrir chamado.');
    }
  };

  const currentChat = chats.find(c => c.id === activeChatId);

  const getCategoryInfo = (catId: string | null) => {
    if (!catId) return { nome: 'Geral', cor: '#475569' };
    const cat = categories.find(c => c.id === catId);
    return cat || { nome: 'Geral', cor: '#475569' };
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm animate-fadeIn">
      {/* Top Header */}
      <div className="bg-white px-6 py-4 border-b border-slate-150 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-50 text-purple-650 rounded-2xl flex items-center justify-center">
            <MessageSquare size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Comunicação e Suporte</h1>
            <p className="text-xs text-slate-450 font-medium">Fale com a coordenação pedagógica ou setor operacional da escola</p>
          </div>
        </div>

        <button 
          onClick={() => setShowNewChatModal(true)}
          className="flex items-center gap-1.5 px-4.5 py-2.5 bg-[#001a33] hover:bg-purple-650 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
        >
          <Plus size={14} />
          <span>Novo Chamado</span>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* Left Sidebar */}
        <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50 shrink-0">
          <div className="p-3 bg-white border-b border-slate-200 text-[10px] text-slate-400 font-black uppercase tracking-wider">
            Histórico de Chamados
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
            {loadingChats ? (
              <div className="flex justify-center items-center py-10">
                <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : chats.length === 0 ? (
              <div className="text-center py-12 text-slate-400 px-4">
                <MessageSquare size={24} className="mx-auto text-slate-350 mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest">Nenhum chamado</p>
                <p className="text-[9px] mt-0.5">Use o botão acima para abrir um chamado com a coordenação.</p>
              </div>
            ) : (
              chats.map(chat => {
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
                    <div className="w-9 h-9 bg-purple-50 text-purple-650 rounded-xl flex items-center justify-center shrink-0">
                      <MessageSquare size={16} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h4 className="font-bold truncate text-xs text-[#001a33]">
                          Coordenação Universo
                        </h4>
                        <span className="text-[9px] text-slate-400 font-bold shrink-0">{formatTime(chat.ultima_data)}</span>
                      </div>
                      
                      <p className="text-[10px] text-slate-500 truncate font-medium">
                        {chat.ultimo_texto}
                      </p>

                      <div className="flex items-center gap-1.5 mt-2">
                         <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: catInfo.cor }}></div>
                         <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider">{catInfo.nome}</span>
                         <span className="text-[8px] text-slate-300 font-medium">|</span>
                         <span className={`text-[8px] font-black uppercase tracking-wider ${
                           chat.status === 'pendente' ? 'text-amber-600' : 'text-emerald-600'
                         }`}>
                           {chat.status === 'pendente' ? 'Aberto' : 'Resolvido'}
                         </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right chat panel */}
        {activeChatId && currentChat ? (
          <div className="flex-1 flex flex-col bg-white">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-purple-50 text-purple-650 rounded-xl flex items-center justify-center">
                  <MessageSquare size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-slate-800">
                    Chamado de Suporte Docente
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
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
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-4 custom-scrollbar">
              {loadingMessages ? (
                <div className="flex justify-center items-center py-20">
                  <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isSelf = msg.remetente_id === professorId || msg.remetente_tipo === 'professor';
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
                      className={`flex items-end gap-2 ${isSelf ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isSelf && (
                        <div className="w-7 h-7 bg-purple-650 text-white rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 uppercase">
                          AD
                        </div>
                      )}
                      
                      <div 
                        className={`p-3 rounded-2xl max-w-md shadow-sm border ${
                          isSelf 
                            ? 'bg-[#001a33] text-white border-transparent rounded-br-sm' 
                            : 'bg-white text-slate-700 border-slate-100 rounded-bl-sm'
                        }`}
                      >
                        <p className={`text-[8px] font-black uppercase tracking-wider mb-1 ${
                          isSelf ? 'text-purple-300' : 'text-purple-600'
                        }`}>
                          {isSelf ? 'Você' : msg.remetente_nome}
                        </p>
                        <p className="text-xs font-medium leading-relaxed break-words">{msg.conteudo}</p>
                        <div className="flex items-center justify-end mt-1">
                          <span className="text-[8px] font-bold text-slate-400">{formatTime(msg.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 bg-white border-t border-slate-200">
              {currentChat.status === 'solucionada' ? (
                <div className="text-center py-3 bg-slate-50 rounded-xl border border-slate-150 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                  Este chamado foi solucionado.
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button className="p-2.5 text-slate-450 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors">
                    <Paperclip size={18} />
                  </button>
                  
                  <div className="flex-1 bg-slate-50 rounded-xl overflow-hidden flex items-center px-4.5 py-1.5 border border-slate-150 focus-within:border-purple-500 focus-within:bg-white transition-all shadow-inner">
                    <input 
                      type="text" 
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Escreva sua mensagem..."
                      className="w-full bg-transparent border-none outline-none text-xs text-slate-700 py-1.5 font-medium"
                    />
                  </div>

                  <button 
                    onClick={handleSendMessage}
                    disabled={!messageText.trim()}
                    className="p-2.5 bg-[#001a33] text-white rounded-xl hover:bg-purple-650 transition-colors shadow-lg disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 px-8 text-center">
            <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-300 mb-4 shadow-sm">
              <MessageSquare size={30} />
            </div>
            <h3 className="text-lg font-black text-[#001a33] tracking-tight">Suporte ao Docente</h3>
            <p className="text-slate-400 text-xs font-medium max-w-xs mt-1">
              Selecione um chamado ao lado para abrir a conversa, ou clique em Novo Chamado para se conectar com a coordenação pedagógica.
            </p>
          </div>
        )}
      </div>

      {/* NEW TICKET MODAL */}
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
              <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Novo Chamado Docente</h4>
              <p className="text-slate-550 text-xs mt-1">Fale diretamente com os setores administrativos e coordenação.</p>
            </div>

            <form onSubmit={handleCreateNewChat} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-555">Setor / Assunto</label>
                <select
                  required
                  value={newChatCategory}
                  onChange={(e) => setNewChatCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:border-purple-500 focus:bg-white transition-all cursor-pointer"
                >
                  <option value="">Selecione uma categoria...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-555">Mensagem / Solicitação</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Escreva detalhadamente o que você precisa..."
                  value={newChatSubject}
                  onChange={(e) => setNewChatSubject(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 text-xs font-medium text-slate-700 focus:border-purple-500 focus:bg-white transition-all resize-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewChatModal(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-205 text-slate-650 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newChatCategory || !newChatSubject.trim()}
                  className="px-5 py-3 bg-[#001a33] hover:bg-purple-650 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors shadow-md"
                >
                  Confirmar Chamado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default ComunicacaoPage;
