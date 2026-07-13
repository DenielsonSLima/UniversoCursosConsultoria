import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Bot, CheckSquare2, MessageCircle, PauseCircle, RefreshCcw, Search, Send, Square, Trash2 } from 'lucide-react';
import { WhatsAppConversation, WhatsAppFlowSession, WhatsAppMessage } from './whatsapp.types';
import { formatMessageDate, formatPhone, normalizePhone } from './whatsapp.utils';
import { whatsappService } from './whatsapp.service';
import BatchMessageModal, { BatchSendResult } from './inbox/BatchMessageModal';
import ContactAvatar from './inbox/ContactAvatar';
import MessageComposer from './inbox/MessageComposer';
import MessageThread from './inbox/MessageThread';
import TypingIndicator from './inbox/TypingIndicator';
import { fileToBase64 } from './inbox/mediaUtils';
import { isWhatsAppSoundEnabled, playIncomingWhatsAppSound, setWhatsAppSoundEnabled } from './inbox/notificationSound';
import { useWhatsAppTypingPresence } from './inbox/useWhatsAppTypingPresence';

interface WhatsAppInboxProps {
  conversations: WhatsAppConversation[];
  messages: WhatsAppMessage[];
  flowSessions: WhatsAppFlowSession[];
  activeConversationId: string | null;
  apiReady: boolean;
  loadingConversations: boolean;
  loadingMessages: boolean;
  onSelectConversation: (conversationId: string) => void;
  onOpenStartModal: () => void;
  onSendReply: (message: string) => Promise<void>;
  onDeleteConversations: (conversationIds: string[]) => Promise<void>;
  onPauseFlow: (conversationId: string) => void;
  onResetFlow: (conversationId: string) => void;
}

const WhatsAppInbox: React.FC<WhatsAppInboxProps> = ({
  conversations,
  messages,
  flowSessions,
  activeConversationId,
  apiReady,
  loadingConversations,
  loadingMessages,
  onSelectConversation,
  onOpenStartModal,
  onSendReply,
  onDeleteConversations,
  onPauseFlow,
  onResetFlow,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => isWhatsAppSoundEnabled());
  const activeConversation = conversations.find((item) => item.id === activeConversationId) || null;
  const flowByConversation = useMemo(
    () => new Map(flowSessions.map((session) => [session.conversa_id, session])),
    [flowSessions]
  );
  const activeFlowSession = activeConversation ? flowByConversation.get(activeConversation.id) || null : null;
  const { isContactTyping, sendTyping } = useWhatsAppTypingPresence(activeConversationId);
  const filtered = conversations.filter((item) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [item.contato_nome, item.telefone, item.ultimo_texto].filter(Boolean).join(' ').toLowerCase().includes(term);
  });
  const validSelectedIds = useMemo(
    () => [...selectedIds].filter((id) => conversations.some((item) => item.id === id)),
    [conversations, selectedIds]
  );
  const selectedConversations = useMemo(
    () => validSelectedIds.map((id) => conversations.find((item) => item.id === id)).filter(Boolean) as WhatsAppConversation[],
    [conversations, validSelectedIds]
  );
  const sendableSelectedConversations = useMemo(
    () => selectedConversations.filter((item) => item.aluno_id && normalizePhone(item.telefone)),
    [selectedConversations]
  );
  const filteredIds = filtered.map((item) => item.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const unreadTotal = conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0);

  const toggleConversationSelection = (conversationId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (validSelectedIds.length === 0) return;
    const confirmed = window.confirm(
      `Apagar ${validSelectedIds.length} conversa(s) do WhatsApp? O histórico de mensagens dessas conversas também será removido.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await onDeleteConversations(validSelectedIds);
      setSelectedIds(new Set());
    } finally {
      setDeleting(false);
    }
  };

  const handleBatchSend = async (message: string): Promise<BatchSendResult> => {
    let sent = 0;
    const failures: string[] = [];

    for (const conversation of sendableSelectedConversations) {
      try {
        await whatsappService.sendMessage({ alunoId: conversation.aluno_id!, to: conversation.telefone, message });
        sent += 1;
      } catch (error: any) {
        failures.push(`${conversation.contato_nome}: ${error?.message || 'falha no envio'}`);
      }
    }

    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'mensagens'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
    if (sent > 0) setSelectedIds(new Set());
    return { sent, skipped: selectedConversations.length - sendableSelectedConversations.length, failures };
  };

  const toggleSound = () => {
    setSoundEnabled((current) => {
      const next = !current;
      setWhatsAppSoundEnabled(next);
      if (next) playIncomingWhatsAppSound();
      return next;
    });
  };

  useEffect(() => {
    sendTyping(false);
  }, [activeConversationId, sendTyping]);

  const sendMedia = async ({ file, kind, caption }: { file: File; kind: 'image' | 'audio' | 'document'; caption: string }) => {
    if (!activeConversation?.aluno_id) throw new Error('Esta conversa ainda não está vinculada a um aluno cadastrado.');
    await whatsappService.sendMediaMessage({
      alunoId: activeConversation.aluno_id,
      to: activeConversation.telefone,
      kind,
      caption,
      file: { base64: await fileToBase64(file), type: file.type || 'application/octet-stream', name: file.name },
    });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'mensagens', activeConversation.id] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#001a33]">Conversas</h3>
              <p className="text-xs font-medium text-slate-400">Caixa de entrada WhatsApp</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSound}
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${soundEnabled ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                title={soundEnabled ? 'Som de novas mensagens ligado' : 'Som de novas mensagens desligado'}
              >
                {soundEnabled ? <Bell size={15} /> : <BellOff size={15} />}
              </button>
              <button
                onClick={onOpenStartModal}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
                title="Iniciar conversa"
              >
                <Send size={15} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleAllFiltered}
              disabled={filteredIds.length === 0}
              className="flex min-h-[36px] items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40"
              title={allFilteredSelected ? 'Limpar seleção' : 'Selecionar conversas'}
            >
              {allFilteredSelected ? <CheckSquare2 size={15} /> : <Square size={15} />}
              {validSelectedIds.length > 0 ? `${validSelectedIds.length} selecionada(s)` : 'Selecionar'}
            </button>
            {validSelectedIds.length > 0 && (
              <>
              <button
                type="button"
                onClick={() => setBatchOpen(true)}
                disabled={sendableSelectedConversations.length === 0}
                className="flex min-h-[36px] items-center gap-2 rounded-xl bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-40"
                title="Enviar mensagem em lote"
              >
                <Send size={15} />
                Mensagem
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="flex min-h-[36px] items-center gap-2 rounded-xl bg-rose-50 px-3 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                title="Apagar conversas selecionadas"
              >
                <Trash2 size={15} />
                {deleting ? 'Apagando...' : 'Apagar'}
              </button>
              </>
            )}
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
            filtered.map((conversation) => {
              const isSelected = selectedIds.has(conversation.id);
              const flowSession = flowByConversation.get(conversation.id);
              const isHandoff = flowSession?.handoff_required || flowSession?.status === 'handoff';
              return (
              <div
                key={conversation.id}
                className={`flex w-full items-center gap-2 rounded-2xl p-2 transition-all ${
                  conversation.id === activeConversationId ? 'bg-emerald-50 ring-1 ring-emerald-100' : 'hover:bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleConversationSelection(conversation.id)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    isSelected ? 'bg-emerald-100 text-emerald-700' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'
                  }`}
                  title={isSelected ? 'Remover da seleção' : 'Selecionar conversa'}
                >
                  {isSelected ? <CheckSquare2 size={17} /> : <Square size={17} />}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectConversation(conversation.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left"
                >
                  <ContactAvatar name={conversation.contato_nome} photo={conversation.contato_foto} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-[#001a33]">{conversation.contato_nome}</p>
                      <span className="shrink-0 text-[11px] font-semibold text-slate-400">{formatMessageDate(conversation.ultima_data)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-slate-500">{conversation.ultimo_texto || formatPhone(conversation.telefone)}</p>
                    {flowSession && (
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isHandoff ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isHandoff ? 'Atendente' : 'Robô ativo'}
                      </span>
                    )}
                  </div>
                  {conversation.unread_count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
                      {conversation.unread_count}
                    </span>
                  )}
                </button>
              </div>
            );
            })
          )}
        </div>
      </aside>

      <main className="flex min-h-0 flex-col bg-[#f7f9fb]">
        <div className="flex min-h-[72px] items-center justify-between border-b border-slate-100 bg-white px-5">
          {activeConversation ? (
            <div className="flex min-w-0 items-center gap-3">
              <ContactAvatar name={activeConversation.contato_nome} photo={activeConversation.contato_foto} />
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-[#001a33]">{activeConversation.contato_nome}</h3>
                {isContactTyping ? (
                  <TypingIndicator name={activeConversation.contato_nome} />
                ) : (
                  <p className="text-xs font-medium text-slate-400">{formatPhone(activeConversation.telefone)}</p>
                )}
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
          {activeConversation && (
            <div className="flex items-center gap-2">
              {activeFlowSession && (
                <span className={`inline-flex min-h-[30px] items-center gap-1 rounded-xl px-3 text-[11px] font-bold uppercase ${activeFlowSession.handoff_required || activeFlowSession.status === 'handoff' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  <Bot size={13} />
                  {activeFlowSession.handoff_required || activeFlowSession.status === 'handoff' ? 'Atendente' : 'Robô ativo'}
                </span>
              )}
              <button
                type="button"
                onClick={() => onPauseFlow(activeConversation.id)}
                className="inline-flex min-h-[34px] items-center gap-2 rounded-xl bg-amber-50 px-3 text-[11px] font-bold uppercase text-amber-700 transition-colors hover:bg-amber-100"
                title="Assumir atendimento e pausar robô"
              >
                <PauseCircle size={14} />
                Assumir
              </button>
              {activeFlowSession && (
                <button
                  type="button"
                  onClick={() => onResetFlow(activeConversation.id)}
                  className="inline-flex min-h-[34px] items-center gap-2 rounded-xl bg-slate-100 px-3 text-[11px] font-bold uppercase text-slate-600 transition-colors hover:bg-slate-200"
                  title="Retomar robô na próxima mensagem"
                >
                  <RefreshCcw size={14} />
                  Retomar
                </button>
              )}
            </div>
          )}
        </div>

        <MessageThread activeConversation={activeConversation} messages={messages} loadingMessages={loadingMessages} />

        <MessageComposer activeConversation={activeConversation} apiReady={apiReady} sendTyping={sendTyping} onSendReply={onSendReply} onSendMedia={sendMedia} />
      </main>

      {batchOpen && (
        <BatchMessageModal
          selectedCount={selectedConversations.length}
          sendableCount={sendableSelectedConversations.length}
          apiReady={apiReady}
          onClose={() => setBatchOpen(false)}
          onSend={handleBatchSend}
        />
      )}

    </div>
  );
};

export default WhatsAppInbox;
