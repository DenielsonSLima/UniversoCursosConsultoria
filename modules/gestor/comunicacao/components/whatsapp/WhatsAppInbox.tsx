import React, { useState } from 'react';
import { BookUser, CalendarClock, CheckCircle2, MessageCircle, Search, Send, Wallet } from 'lucide-react';
import { WhatsAppConversation, WhatsAppMessage } from './whatsapp.types';
import { formatMessageDate, formatMessageTime, formatPhone, initials, normalizePhone } from './whatsapp.utils';

interface WhatsAppInboxProps {
  conversations: WhatsAppConversation[];
  messages: WhatsAppMessage[];
  activeConversationId: string | null;
  apiReady: boolean;
  automationCount: number;
  overdueCount: number;
  loadingConversations: boolean;
  loadingMessages: boolean;
  onSelectConversation: (conversationId: string) => void;
  onOpenStartModal: () => void;
  onOpenAutomations: () => void;
  onOpenOverdue: () => void;
  onSendReply: (message: string) => Promise<void>;
}

const WhatsAppInbox: React.FC<WhatsAppInboxProps> = ({
  conversations,
  messages,
  activeConversationId,
  apiReady,
  automationCount,
  overdueCount,
  loadingConversations,
  loadingMessages,
  onSelectConversation,
  onOpenStartModal,
  onOpenAutomations,
  onOpenOverdue,
  onSendReply,
}) => {
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const activeConversation = conversations.find((item) => item.id === activeConversationId) || null;
  const filtered = conversations.filter((item) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [item.contato_nome, item.telefone, item.ultimo_texto].filter(Boolean).join(' ').toLowerCase().includes(term);
  });
  const unreadTotal = conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0);

  const handleSend = async () => {
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    try {
      await onSendReply(text);
      setReply('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid h-[calc(100%-132px)] min-h-[520px] grid-cols-[360px_minmax(0,1fr)] overflow-hidden xl:grid-cols-[360px_minmax(0,1fr)_300px]">
      <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#001a33]">Conversas</h3>
              <p className="text-xs font-medium text-slate-400">Caixa de entrada WhatsApp</p>
            </div>
            <button
              onClick={onOpenStartModal}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
              title="Iniciar conversa"
            >
              <Send size={15} />
            </button>
          </div>

          <label className="relative block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar conversa..."
              className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-200 focus:bg-white"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-center text-xs font-bold text-slate-500">Todas <span className="ml-1 text-slate-400">{conversations.length}</span></div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-center text-xs font-bold text-slate-500">Abertas <span className="ml-1 text-slate-400">{conversations.filter((item) => item.status === 'aberta').length}</span></div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-center text-xs font-bold text-slate-500">Não lidas <span className="ml-1 text-slate-400">{unreadTotal}</span></div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
          {loadingConversations ? (
            <div className="p-8 text-center text-xs font-bold text-slate-400">Carregando conversas...</div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center px-8 text-center">
              <MessageCircle size={34} className="mb-3 text-slate-300" />
              <p className="text-sm font-bold text-slate-600">Nenhuma conversa recebida</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-400">Assim que o webhook da Meta receber mensagem, ela aparece aqui.</p>
            </div>
          ) : (
            filtered.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
                className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                  conversation.id === activeConversationId ? 'bg-emerald-50 ring-1 ring-emerald-100' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {initials(conversation.contato_nome)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-[#001a33]">{conversation.contato_nome}</p>
                    <span className="shrink-0 text-[11px] font-semibold text-slate-400">{formatMessageDate(conversation.ultima_data)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-medium text-slate-500">{conversation.ultimo_texto || formatPhone(conversation.telefone)}</p>
                </div>
                {conversation.unread_count > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
                    {conversation.unread_count}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="flex min-h-0 flex-col bg-[#f7f9fb]">
        <div className="flex min-h-[72px] items-center justify-between border-b border-slate-100 bg-white px-5">
          {activeConversation ? (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                {initials(activeConversation.contato_nome)}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-[#001a33]">{activeConversation.contato_nome}</h3>
                <p className="text-xs font-medium text-slate-400">{formatPhone(activeConversation.telefone)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <MessageCircle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#001a33]">Selecione uma conversa</h3>
                <p className="text-xs font-medium text-slate-400">Ou inicie uma nova mensagem para um aluno</p>
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
          {!activeConversation ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-emerald-500 shadow-sm">
                <MessageCircle size={30} />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-[#001a33]">WhatsApp conectado ao atendimento</h3>
              <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-500">
                As mensagens enviadas e recebidas pela API ficam salvas aqui.
              </p>
            </div>
          ) : loadingMessages ? (
            <div className="p-8 text-center text-xs font-bold text-slate-400">Carregando mensagens...</div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => {
                const outgoing = message.direcao === 'saida';
                return (
                  <div key={message.id} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[76%] rounded-2xl px-4 py-3 shadow-sm ${
                      outgoing ? 'bg-emerald-600 text-white' : 'bg-white text-slate-800'
                    }`}>
                      <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed">{message.conteudo}</p>
                      <div className={`mt-1 flex justify-end gap-1 text-[10px] font-semibold ${outgoing ? 'text-emerald-50/80' : 'text-slate-400'}`}>
                        <span>{formatMessageTime(message.created_at)}</span>
                        {outgoing && <span>{message.status || 'sent'}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {activeConversation && (
          <div className="border-t border-slate-100 bg-white p-4">
            <div className="flex items-end gap-3">
              <textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                rows={1}
                placeholder={activeConversation.aluno_id ? 'Escreva sua resposta...' : 'Contato sem aluno vinculado'}
                disabled={!activeConversation.aluno_id || !apiReady}
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-emerald-500 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={sending || !reply.trim() || !activeConversation.aluno_id || !normalizePhone(activeConversation.telefone) || !apiReady}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
              >
                <Send size={17} />
              </button>
            </div>
          </div>
        )}
      </main>

      <aside className="hidden min-h-0 flex-col border-l border-slate-200 bg-white p-5 xl:flex">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-400">Status da API</p>
          <p className={`mt-1 text-sm font-bold ${apiReady ? 'text-emerald-700' : 'text-amber-700'}`}>
            {apiReady ? 'Pronta para envio' : 'Aguardando configuração'}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400">Avisos ativos</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-[#001a33]">{automationCount}</p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
            <p className="text-xs font-medium text-rose-400">Atrasos</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-rose-700">{overdueCount}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <button
            onClick={onOpenAutomations}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <CalendarClock size={15} />
            Automações
          </button>
          <button
            onClick={onOpenOverdue}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100"
          >
            <Wallet size={15} />
            Ver atrasados
          </button>
        </div>

        <div className="mt-auto rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-emerald-800">
            <CheckCircle2 size={14} />
            Webhook
          </p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-emerald-800/80">
            Quando a Meta chamar a URL do webhook, as conversas entram nesta caixa em tempo real.
          </p>
        </div>
      </aside>
    </div>
  );
};

export default WhatsAppInbox;
