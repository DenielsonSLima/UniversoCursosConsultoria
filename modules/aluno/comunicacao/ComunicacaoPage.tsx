import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Clock, CheckCircle, Tag, Plus, Trash2 } from 'lucide-react';
import ToastNotification, { useToast } from '../../gestor/components/ToastNotification';
import { formatChatTime } from './comunicacao.helpers';
import {
  AlunoChatPagination,
  AlunoDeleteChatModal,
  AlunoMessageComposer,
  AlunoMessageList,
  AlunoNewChatModal,
  CHAT_PAGE_SIZE,
} from './AlunoComunicacaoParts';
import {
  alunoComunicacaoKeys,
  alunoComunicacaoService,
} from './comunicacao.service';
import { useAlunoComunicacaoRealtime } from './useAlunoComunicacaoRealtime';
import {
  ComunicacaoCategoria,
  ComunicacaoChat,
  ComunicacaoMensagem,
  ComunicacaoPageProps,
} from './comunicacao.types';

// ─── Component ───────────────────────────────────────────────────────────────

const playMessageSound = (tone: 'send' | 'receive') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = tone === 'send' ? 660 : 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    window.setTimeout(() => context.close().catch(() => undefined), 260);
  } catch {
    // Se o navegador bloquear áudio, o envio/recebimento segue funcionando.
  }
};

const ComunicacaoPage: React.FC<ComunicacaoPageProps> = ({ alunoId, alunoNome }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatCategory, setNewChatCategory] = useState('');
  const [newChatSubject, setNewChatSubject] = useState('');
  const [unreadChatIds, setUnreadChatIds] = useState<Set<string>>(new Set());
  const [activeCallTab, setActiveCallTab] = useState<'pendentes' | 'resolvidos'>('pendentes');
  const [pendingPage, setPendingPage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);

  // Attachment state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  // Delete confirm modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);

  // ── 1. Fetch Categories ──
  const { data: categories = [] } = useQuery<ComunicacaoCategoria[]>({
    queryKey: alunoComunicacaoKeys.categories,
    queryFn: alunoComunicacaoService.getCategories
  });

  // ── 2. Fetch Aluno's Chats (mais recente primeiro, excluindo soft-deleted) ──
  const { data: chats = [], isLoading: loadingChats } = useQuery<ComunicacaoChat[]>({
    queryKey: alunoComunicacaoKeys.chats(alunoId),
    queryFn: () => alunoComunicacaoService.getAlunoChats(alunoId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // ── 3. Fetch Messages for Active Chat ──
  const { data: messages = [], isLoading: loadingMessages } = useQuery<ComunicacaoMensagem[]>({
    queryKey: alunoComunicacaoKeys.messages(activeChatId),
    enabled: !!activeChatId,
    queryFn: () => alunoComunicacaoService.getMessages(activeChatId!)
  });

  const isPendingChat = (chat: ComunicacaoChat) => chat.status === 'pendente';
  const pendentes = useMemo(() => chats.filter(isPendingChat), [chats]);
  const resolvidos = useMemo(() => chats.filter((chat) => !isPendingChat(chat)), [chats]);
  const activeCallChats = activeCallTab === 'pendentes' ? pendentes : resolvidos;
  const activePage = activeCallTab === 'pendentes' ? pendingPage : resolvedPage;
  const activeStartIndex = (activePage - 1) * CHAT_PAGE_SIZE;
  const displayedChats = activeCallChats.slice(activeStartIndex, activeStartIndex + CHAT_PAGE_SIZE);
  const handlePageChange = (page: number) => {
    if (activeCallTab === 'pendentes') setPendingPage(page);
    else setResolvedPage(page);
  };

  useAlunoComunicacaoRealtime({ alunoId, activeChatId, setUnreadChatIds });

  useEffect(() => {
    seenMessageIdsRef.current = new Set();
  }, [activeChatId]);

  useEffect(() => {
    const seen = seenMessageIdsRef.current;
    const hasLoadedBefore = seen.size > 0;
    const hasNewIncoming = messages.some(message => (
      !seen.has(message.id) && message.remetente_tipo !== 'aluno'
    ));

    if (hasLoadedBefore && hasNewIncoming) {
      playMessageSound('receive');
    }

    seenMessageIdsRef.current = new Set(messages.map(message => message.id));
  }, [messages]);

  // ── 6. Autoscroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── 7. Default active chat ──
  useEffect(() => {
    const isCurrentInTab = activeCallChats.some(c => c.id === activeChatId);
    const totalPagesForTab = Math.max(1, Math.ceil(activeCallChats.length / CHAT_PAGE_SIZE));

    if (activeCallTab === 'pendentes' && pendingPage > totalPagesForTab) {
      setPendingPage(totalPagesForTab);
    }
    if (activeCallTab === 'resolvidos' && resolvedPage > totalPagesForTab) {
      setResolvedPage(totalPagesForTab);
    }

    if (activeCallChats.length === 0) {
      setActiveChatId(null);
      return;
    }

    if (!activeChatId || !isCurrentInTab) {
      setActiveChatId(activeCallChats[0].id);
    }
  }, [
    activeCallChats,
    activeCallTab,
    activeChatId,
    pendingPage,
    resolvedPage
  ]);

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
      const newMsg = await alunoComunicacaoService.sendMessage({
        chatId: activeChatId,
        alunoId,
        alunoNome,
        text,
        file: fileToSend,
      });

      queryClient.setQueryData(alunoComunicacaoKeys.messages(activeChatId), (oldData: ComunicacaoMensagem[] | undefined) => {
        if (!oldData) return [newMsg];
        if (oldData.some(m => m.id === newMsg.id)) return oldData;
        return [...oldData, newMsg];
      });
      playMessageSound('send');
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
      await alunoComunicacaoService.deleteChatForAluno(activeChatId, alunoId);

      // Remove do cache local imediatamente
      queryClient.setQueryData(alunoComunicacaoKeys.chats(alunoId), (oldData: ComunicacaoChat[] | undefined) =>
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

      const newChat = await alunoComunicacaoService.createChat({
        alunoId,
        alunoNome,
        categoryId: newChatCategory,
        categoryName: catName,
        subject: newChatSubject,
      });

      setShowNewChatModal(false);
      setNewChatCategory('');
      setNewChatSubject('');
      queryClient.invalidateQueries({ queryKey: alunoComunicacaoKeys.chats(alunoId) });
      setActiveCallTab('pendentes');
      setPendingPage(1);
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
          <div className="px-2 pt-2 border-b border-slate-200 bg-white">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => {
                  setActiveCallTab('pendentes');
                  setPendingPage(1);
                }}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  activeCallTab === 'pendentes'
                    ? 'bg-white text-amber-600 shadow-sm'
                    : 'text-slate-500 hover:text-amber-600'
                }`}
              >
                <Clock size={12} />
                Pendentes ({pendentes.length})
              </button>
              <button
                onClick={() => {
                  setActiveCallTab('resolvidos');
                  setResolvedPage(1);
                }}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  activeCallTab === 'resolvidos'
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-slate-500 hover:text-emerald-600'
                }`}
              >
                <CheckCircle size={12} />
                Resolvidos ({resolvidos.length})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
            {loadingChats ? (
              <div className="flex justify-center items-center py-10">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : displayedChats.length === 0 ? (
              <div className="text-center py-12 text-slate-400 px-4">
                <MessageSquare size={24} className="mx-auto mb-2 text-slate-300" />
                <p className="text-[10px] font-black uppercase tracking-widest">Nenhum chamado aberto</p>
                <p className="text-[9px] mt-1">Clique em "Novo Chamado" para iniciar um atendimento.</p>
              </div>
            ) : (
              displayedChats.map(chat => {
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
                        <span className="text-[9px] text-slate-400 font-bold shrink-0 ml-1">{formatChatTime(chat.ultima_data)}</span>
                      </div>

                      <p className="text-[10px] text-slate-500 truncate font-medium">{chat.ultimo_texto || '...'}</p>

                      <div className="flex items-center gap-1.5 mt-1.5">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: catInfo.cor }} />
                        <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider">Setor: {catInfo.nome}</span>
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
          <AlunoChatPagination page={activePage} total={activeCallChats.length} onPage={handlePageChange} />
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
                      <Tag size={9} /> Setor: {getCategoryInfo(currentChat.categoria_id).nome}
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
            <AlunoMessageList loading={loadingMessages} messages={messages} endRef={messagesEndRef} />

            {/* ── Input Box — FIXED at bottom ── */}
            <div className="shrink-0 border-t border-slate-200 bg-white">
              {currentChat.status === 'solucionada' ? (
                <div className="px-4 py-4 text-center">
                  <div className="bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-xl py-3 flex items-center justify-center gap-2">
                    <CheckCircle size={12} /> Este atendimento foi finalizado pela instituição.
                  </div>
                </div>
              ) : (
                <AlunoMessageComposer
                  fileInputRef={fileInputRef}
                  messageText={messageText}
                  pendingFile={pendingFile}
                  uploading={uploadingFile}
                  onFileChange={setPendingFile}
                  onMessageChange={setMessageText}
                  onSend={handleSendMessage}
                />
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
        <AlunoDeleteChatModal deleting={deletingChat} onCancel={() => setShowDeleteConfirm(false)} onConfirm={handleDeleteChat} />
      )}

      {/* ── New Ticket Modal ── */}
      {showNewChatModal && (
        <AlunoNewChatModal
          categories={categories}
          categoryId={newChatCategory}
          subject={newChatSubject}
          onCategoryChange={setNewChatCategory}
          onClose={() => setShowNewChatModal(false)}
          onSubmit={handleCreateNewChat}
          onSubjectChange={setNewChatSubject}
        />
      )}
    </div>
  );
};

export default ComunicacaoPage;
