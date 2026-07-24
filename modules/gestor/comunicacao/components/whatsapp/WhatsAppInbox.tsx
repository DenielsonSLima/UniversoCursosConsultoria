import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, CheckCircle2, MessageCircle, PauseCircle, RefreshCcw } from 'lucide-react';
import { WhatsAppConversation, WhatsAppFlowSession, WhatsAppMessage } from './whatsapp.types';
import { formatPhone, normalizePhone } from './whatsapp.utils';
import { whatsappService } from './whatsapp.service';
import BatchMessageModal, { BatchSendResult } from './inbox/BatchMessageModal';
import ContactAvatar from './inbox/ContactAvatar';
import ConversationListItem from './inbox/ConversationListItem';
import ConversationToolbar, { ConversationStatusFilter } from './inbox/ConversationToolbar';
import MessageComposer from './inbox/MessageComposer';
import MessageThread from './inbox/MessageThread';
import TypingIndicator from './inbox/TypingIndicator';
import { fileToBase64 } from './inbox/mediaUtils';
import { useWhatsAppTypingPresence } from './inbox/useWhatsAppTypingPresence';

interface WhatsAppInboxProps {
  connectionId: string;
  conversations: WhatsAppConversation[];
  messages: WhatsAppMessage[];
  flowSessions: WhatsAppFlowSession[];
  activeConversationId: string | null;
  apiReady: boolean;
  loadingConversations: boolean;
  loadingMessages: boolean;
  onSelectConversation: (conversationId: string) => void;
  onSendReply: (message: string) => Promise<void>;
  onDeleteConversations: (conversationIds: string[]) => Promise<void>;
  onPauseFlow: (conversationId: string) => void;
  onResetFlow: (conversationId: string) => void;
  onCloseConversation: (conversationId: string) => void;
  onReopenConversation: (conversationId: string) => void;
}

const WhatsAppInbox: React.FC<WhatsAppInboxProps> = ({
  connectionId,
  conversations,
  messages,
  flowSessions,
  activeConversationId,
  apiReady,
  loadingConversations,
  loadingMessages,
  onSelectConversation,
  onSendReply,
  onDeleteConversations,
  onPauseFlow,
  onResetFlow,
  onCloseConversation,
  onReopenConversation,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConversationStatusFilter>('aberta');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const activeConversation = conversations.find((item) => item.id === activeConversationId) || null;
  const flowByConversation = useMemo(
    () => new Map(flowSessions.map((session) => [session.conversa_id, session])),
    [flowSessions]
  );
  const activeFlowSession = activeConversation ? flowByConversation.get(activeConversation.id) || null : null;
  const { isContactTyping, sendTyping } = useWhatsAppTypingPresence(activeConversationId);
  const filtered = conversations.filter((item) => {
    if (item.status !== statusFilter) return false;
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
    () => selectedConversations.filter((item) => item.status === 'aberta' && item.aluno_id && normalizePhone(item.telefone)),
    [selectedConversations]
  );
  const filteredIds = filtered.map((item) => item.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  const changeStatusFilter = (next: ConversationStatusFilter) => {
    setStatusFilter(next);
    setSelectedIds(new Set());
  };

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
        await whatsappService.sendMessage({ connectionId, alunoId: conversation.aluno_id!, to: conversation.telefone, message });
        sent += 1;
      } catch (error: any) {
        failures.push(`${conversation.contato_nome}: ${error?.message || 'falha no envio'}`);
      }
    }

    queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'mensagens'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
    if (sent > 0) setSelectedIds(new Set());
    return { sent, skipped: selectedConversations.length - sendableSelectedConversations.length, failures };
  };

  useEffect(() => {
    sendTyping(false);
  }, [activeConversationId, sendTyping]);

  const sendMedia = async ({ file, kind, caption }: { file: File; kind: 'image' | 'audio' | 'document'; caption: string }) => {
    if (!activeConversation?.aluno_id) throw new Error('Esta conversa ainda não está vinculada a um aluno cadastrado.');
    await whatsappService.sendMediaMessage({
      connectionId,
      alunoId: activeConversation.aluno_id,
      to: activeConversation.telefone,
      kind,
      caption,
      file: { base64: await fileToBase64(file), type: file.type || 'application/octet-stream', name: file.name },
    });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'mensagens', activeConversation.id] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
        <ConversationToolbar
          search={search}
          statusFilter={statusFilter}
          allSelected={allFilteredSelected}
          selectedCount={validSelectedIds.length}
          sendableCount={sendableSelectedConversations.length}
          selectableCount={filteredIds.length}
          openCount={conversations.filter((item) => item.status === 'aberta').length}
          closedCount={conversations.filter((item) => item.status === 'arquivada').length}
          deleting={deleting}
          onStatusFilterChange={changeStatusFilter}
          onToggleAll={toggleAllFiltered}
          onSearchChange={setSearch}
          onBatchSend={() => setBatchOpen(true)}
          onDelete={handleDeleteSelected}
        />

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
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                flowSession={flowByConversation.get(conversation.id)}
                active={conversation.id === activeConversationId}
                selected={selectedIds.has(conversation.id)}
                onSelect={() => onSelectConversation(conversation.id)}
                onToggleSelected={() => toggleConversationSelection(conversation.id)}
              />
            ))
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
              {activeConversation.status === 'aberta' ? (
                <>
                  <button
                    type="button"
                    onClick={() => onPauseFlow(activeConversation.id)}
                    className="inline-flex min-h-[34px] items-center gap-2 rounded-xl bg-amber-50 px-3 text-[11px] font-bold uppercase text-amber-700 transition-colors hover:bg-amber-100"
                    title="Assumir atendimento e pausar robô"
                  >
                    <PauseCircle size={14} />
                    Assumir
                  </button>
                  <button
                    type="button"
                    onClick={() => onCloseConversation(activeConversation.id)}
                    className="inline-flex min-h-[34px] items-center gap-2 rounded-xl bg-emerald-50 px-3 text-[11px] font-bold uppercase text-emerald-700 transition-colors hover:bg-emerald-100"
                    title="Encerrar e mover a conversa para Finalizadas"
                  >
                    <CheckCircle2 size={14} />
                    Encerrar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onReopenConversation(activeConversation.id)}
                  className="inline-flex min-h-[34px] items-center gap-2 rounded-xl bg-slate-100 px-3 text-[11px] font-bold uppercase text-slate-600 transition-colors hover:bg-slate-200"
                  title="Reabrir este atendimento"
                >
                  <RefreshCcw size={14} />
                  Reabrir
                </button>
              )}
              {activeConversation.status === 'aberta' && activeFlowSession && (
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

        <MessageComposer activeConversation={activeConversation} apiReady={apiReady} closed={activeConversation?.status === 'arquivada'} sendTyping={sendTyping} onSendReply={onSendReply} onSendMedia={sendMedia} />
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
