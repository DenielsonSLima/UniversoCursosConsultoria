import type { RefObject } from 'react';
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  MessageSquare,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  AlunoChatPagination,
  AlunoMessageComposer,
  AlunoMessageList,
} from '../AlunoComunicacaoParts';
import { formatChatTime } from '../comunicacao.helpers';
import type {
  ComunicacaoCategoria,
  ComunicacaoChat,
  ComunicacaoMensagem,
} from '../comunicacao.types';

interface AlunoMobileComunicacaoProps {
  activeCallTab: 'pendentes' | 'resolvidos';
  activePage: number;
  categories: ComunicacaoCategoria[];
  chatsError: boolean;
  currentChat?: ComunicacaoChat;
  displayedChats: ComunicacaoChat[];
  loadingChats: boolean;
  loadingMessages: boolean;
  messagesError: boolean;
  messageText: string;
  messages: ComunicacaoMensagem[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  pendingCount: number;
  pendingFile: File | null;
  resolvedCount: number;
  showConversation: boolean;
  totalChatsInTab: number;
  unreadChatIds: Set<string>;
  uploadingFile: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onDelete: () => void;
  onFileChange: (file: File | null) => void;
  onMessageChange: (value: string) => void;
  onNewChat: () => void;
  onPageChange: (page: number) => void;
  onRetryChats: () => void;
  onRetryMessages: () => void;
  onSelectChat: (chatId: string) => void;
  onSend: () => void;
  onTabChange: (tab: 'pendentes' | 'resolvidos') => void;
}

const AlunoMobileComunicacao = ({
  activeCallTab,
  activePage,
  categories,
  chatsError,
  currentChat,
  displayedChats,
  loadingChats,
  loadingMessages,
  messagesError,
  messageText,
  messages,
  messagesEndRef,
  pendingCount,
  pendingFile,
  resolvedCount,
  showConversation,
  totalChatsInTab,
  unreadChatIds,
  uploadingFile,
  fileInputRef,
  onBack,
  onDelete,
  onFileChange,
  onMessageChange,
  onNewChat,
  onPageChange,
  onRetryChats,
  onRetryMessages,
  onSelectChat,
  onSend,
  onTabChange,
}: AlunoMobileComunicacaoProps) => {
  const getCategoryInfo = (categoryId?: string | null) => (
    categories.find((category) => category.id === categoryId)
    || { nome: 'Geral', cor: '#475569' }
  );

  if (showConversation && currentChat) {
    const category = getCategoryInfo(currentChat.categoria_id);
    const isPending = currentChat.status === 'pendente';

    return (
      <section className="flex h-[calc(100dvh-10.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm animate-fadeIn motion-reduce:animate-none">
        <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-3 shadow-sm">
          <button type="button" onClick={onBack} aria-label="Voltar para chamados" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#001a33] active:scale-95 motion-reduce:transform-none">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-black text-[#001a33]">Suporte Universo</h2>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <span className="flex min-w-0 items-center gap-1 truncate text-[10px] font-black uppercase tracking-wider text-slate-500">
                <Tag size={10} className="shrink-0" /> {category.nome}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${isPending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {isPending ? 'Em atendimento' : 'Resolvido'}
              </span>
            </div>
          </div>
          <button type="button" onClick={onDelete} aria-label="Remover chamado da lista" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors active:bg-rose-50 active:text-rose-600">
            <Trash2 size={18} />
          </button>
        </header>

        <AlunoMessageList loading={loadingMessages} error={messagesError} messages={messages} endRef={messagesEndRef} onRetry={onRetryMessages} />

        <div className="shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
          {currentChat.status === 'solucionada' ? (
            <div className="p-3">
              <div className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-center text-[10px] font-black uppercase tracking-wider text-emerald-700">
                <CheckCircle size={13} /> Atendimento finalizado pela instituição
              </div>
            </div>
          ) : (
            <AlunoMessageComposer
              fileInputRef={fileInputRef}
              messageText={messageText}
              pendingFile={pendingFile}
              uploading={uploadingFile}
              onFileChange={onFileChange}
              onMessageChange={onMessageChange}
              onSend={onSend}
            />
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 animate-fadeIn motion-reduce:animate-none">
      <header className="relative overflow-hidden rounded-[1.75rem] bg-[#001a33] px-5 py-5 text-white shadow-lg shadow-slate-900/10">
        <div aria-hidden="true" className="absolute -right-10 -top-12 h-36 w-36 rounded-full border-[22px] border-blue-500/15" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300">Fale com a Universo</p>
            <h1 className="mt-1 text-xl font-black uppercase tracking-tight">Atendimento</h1>
            <p className="mt-1 max-w-[220px] text-xs font-medium leading-relaxed text-slate-300">Secretaria, financeiro e suporte em um só lugar.</p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-blue-300 ring-1 ring-white/10">
            <MessageSquare size={23} />
          </div>
        </div>
        <button type="button" onClick={onNewChat} className="relative mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-blue-950/30 active:scale-[0.99] motion-reduce:transform-none">
          <Plus size={17} /> Abrir novo chamado
        </button>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Filtrar chamados">
        <div className="grid grid-cols-2 gap-1">
          <button type="button" role="tab" aria-selected={activeCallTab === 'pendentes'} onClick={() => onTabChange('pendentes')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors motion-reduce:transition-none ${activeCallTab === 'pendentes' ? 'bg-amber-50 text-amber-700 shadow-sm' : 'text-slate-500'}`}>
            <Clock size={14} /> Em aberto <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] shadow-sm">{pendingCount}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeCallTab === 'resolvidos'} onClick={() => onTabChange('resolvidos')} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors motion-reduce:transition-none ${activeCallTab === 'resolvidos' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500'}`}>
            <CheckCircle size={14} /> Resolvidos <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] shadow-sm">{resolvedCount}</span>
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {loadingChats ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white" role="status" aria-label="Carregando chamados">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent motion-reduce:animate-none" />
          </div>
        ) : chatsError ? (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-rose-100 bg-white px-6 text-center" role="alert">
            <h3 className="text-sm font-black text-rose-700">Não foi possível carregar os chamados</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">Verifique sua conexão e tente novamente.</p>
            <button type="button" onClick={onRetryChats} className="mt-4 min-h-11 rounded-xl bg-[#001a33] px-4 text-[10px] font-black uppercase tracking-wider text-white">Tentar novamente</button>
          </div>
        ) : displayedChats.length ? displayedChats.map((chat) => {
          const category = getCategoryInfo(chat.categoria_id);
          const isPending = chat.status === 'pendente';
          const isUnread = unreadChatIds.has(chat.id);
          return (
            <button key={chat.id} type="button" onClick={() => onSelectChat(chat.id)} className="flex min-h-[92px] w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.99] active:border-blue-200 motion-reduce:transform-none motion-reduce:transition-none">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isPending ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {isPending ? <Clock size={19} /> : <CheckCircle size={19} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex min-w-0 items-center gap-2 truncate text-sm font-black text-[#001a33]">
                    Suporte Universo {isUnread ? <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Mensagem não lida" /> : null}
                  </h3>
                  <time className="shrink-0 text-[10px] font-bold text-slate-400">{formatChatTime(chat.ultima_data)}</time>
                </div>
                <p className="mt-1 truncate text-xs font-medium text-slate-500">{chat.ultimo_texto || 'Aguardando mensagem...'}</p>
                <div className="mt-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: category.cor || '#475569' }} />
                  <span className="truncate text-slate-400">{category.nome}</span>
                  <span className={isPending ? 'text-amber-600' : 'text-emerald-600'}>{isPending ? 'Aberto' : 'Resolvido'}</span>
                </div>
              </div>
            </button>
          );
        }) : (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-300"><MessageSquare size={23} /></div>
            <h3 className="mt-4 text-sm font-black text-[#001a33]">Nenhum chamado {activeCallTab === 'pendentes' ? 'em aberto' : 'resolvido'}</h3>
            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-400">{activeCallTab === 'pendentes' ? 'Quando precisar de ajuda, abra um novo atendimento.' : 'Os atendimentos concluídos aparecerão aqui.'}</p>
          </div>
        )}
      </div>

      <AlunoChatPagination page={activePage} total={totalChatsInTab} onPage={onPageChange} />
    </section>
  );
};

export default AlunoMobileComunicacao;
