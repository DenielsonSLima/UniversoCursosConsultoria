import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, CheckCircle2, Clock3, MessageCircle, PauseCircle, RefreshCcw, Send, Trash2, X } from 'lucide-react';
import { WhatsAppConversation, WhatsAppFlowSession, WhatsAppMessage, WhatsAppSector } from './whatsapp.types';
import { formatPhone, normalizePhone } from './whatsapp.utils';
import { whatsappService } from './whatsapp.service';
import BatchMessageModal, { BatchSendResult } from './inbox/BatchMessageModal';
import ContactAvatar from './inbox/ContactAvatar';
import ConversationListItem from './inbox/ConversationListItem';
import ConversationToolbar, { ConversationStatusFilter } from './inbox/ConversationToolbar';
import MessageComposer from './inbox/MessageComposer';
import MessageThread from './inbox/MessageThread';
import TypingIndicator from './inbox/TypingIndicator';
import TransferConversationMenu from './inbox/TransferConversationMenu';
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
  externalSelection?: {
    ids: Set<string>;
    onChange: (ids: Set<string>) => void;
  };
  onSelectConversation: (conversationId: string) => void;
  onSendReply: (message: string) => Promise<void>;
  onDeleteConversations: (conversationIds: string[]) => Promise<void>;
  onPauseFlow: (conversationId: string) => void;
  onResetFlow: (conversationId: string) => void;
  onCloseConversation: (conversationId: string) => void;
  onReopenConversation: (conversationId: string) => void;
  onTransferConversation: (input: {
    conversationId: string;
    setor: WhatsAppSector;
    poloId: string;
    motivo?: string;
  }) => Promise<void>;
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
  externalSelection,
  onSelectConversation,
  onSendReply,
  onDeleteConversations,
  onPauseFlow,
  onResetFlow,
  onCloseConversation,
  onReopenConversation,
  onTransferConversation,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConversationStatusFilter>('aberta');
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());
  const selectedIds = externalSelection?.ids || localSelectedIds;
  const currentSelectionRef = useRef(selectedIds);
  const mountedRef = useRef(false);
  const operationScopeRef = useRef(0);
  useLayoutEffect(() => { currentSelectionRef.current = selectedIds; }, [selectedIds]);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationScopeRef.current += 1;
    };
  }, [connectionId]);
  const selectionIsCurrent = (snapshot: Set<string>, scope: number) =>
    mountedRef.current && operationScopeRef.current === scope && currentSelectionRef.current === snapshot;
  const setSelectedIds = (value: Set<string> | ((current: Set<string>) => Set<string>)) => {
    const next = typeof value === 'function' ? value(selectedIds) : value;
    if (externalSelection) externalSelection.onChange(next);
    else setLocalSelectedIds(next);
  };
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [batchOpen, setBatchOpen] = useState(false);
  const { data: routingPolos = [] } = useQuery({
    queryKey: ['whatsapp', 'routing-polos'],
    queryFn: whatsappService.getRoutingPolos,
    staleTime: 5 * 60_000,
  });
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
    const selectionSnapshot = selectedIds;
    const operationScope = operationScopeRef.current;
    setDeleting(true);
    setDeleteError('');
    try {
      await onDeleteConversations(validSelectedIds);
      if (selectionIsCurrent(selectionSnapshot, operationScope)) {
        setSelectedIds(new Set());
        setDeleteConfirmOpen(false);
      }
    } catch (error) {
      if (mountedRef.current && operationScopeRef.current === operationScope) {
        setDeleteError(error instanceof Error ? error.message : 'Não foi possível apagar as conversas.');
      }
    } finally {
      if (mountedRef.current && operationScopeRef.current === operationScope) setDeleting(false);
    }
  };

  const handleBatchSend = async (message: string): Promise<BatchSendResult> => {
    const selectionSnapshot = selectedIds;
    const operationScope = operationScopeRef.current;
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
    if (sent > 0 && selectionIsCurrent(selectionSnapshot, operationScope)) setSelectedIds(new Set());
    return { sent, skipped: selectedConversations.length - sendableSelectedConversations.length, failures };
  };

  useEffect(() => {
    sendTyping(false);
  }, [activeConversationId, sendTyping]);

  const sendMedia = async ({ file, kind, caption }: { file: File; kind: 'image' | 'audio' | 'document'; caption: string }) => {
    if (!activeConversation) throw new Error('Selecione uma conversa.');
    await whatsappService.sendMediaMessage({
      connectionId,
      alunoId: activeConversation.aluno_id,
      conversationId: activeConversation.id,
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
    <div data-unified-whatsapp-layout className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)] overflow-hidden">
      <aside data-unified-inbox-sidebar className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
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
          onDelete={() => setDeleteConfirmOpen(true)}
          onClearSelection={() => setSelectedIds(new Set())}
        />

        <div className="min-h-0 flex-1 overflow-y-auto bg-white custom-scrollbar">
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
                selectionMode={validSelectedIds.length > 0}
                onSelect={() => onSelectConversation(conversation.id)}
                onToggleSelected={() => toggleConversationSelection(conversation.id)}
              />
            ))
          )}
        </div>
      </aside>

      <main className="flex min-h-0 flex-col bg-[#efeae2]">
        {externalSelection && validSelectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2">
            <button type="button" onClick={() => setSelectedIds(new Set())} aria-label="Cancelar seleção de conversas" className="rounded-lg p-2 text-slate-500 hover:bg-white"><X size={17} /></button>
            <span className="mr-auto text-xs font-bold text-emerald-800">{validSelectedIds.length} conversa(s) selecionada(s)</span>
            <button type="button" disabled={sendableSelectedConversations.length === 0} onClick={() => setBatchOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-40"><Send size={14} /> Enviar em lote</button>
            <button type="button" onClick={() => setDeleteConfirmOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-rose-700"><Trash2 size={14} /> Apagar selecionadas</button>
          </div>
        )}
        <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-2 border-b border-[#d8dbdf] bg-[#f0f2f5] px-5 py-3">
          {activeConversation ? (
            <div className="flex min-w-0 items-center gap-3">
              <ContactAvatar name={activeConversation.contato_nome} photo={activeConversation.contato_foto} />
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-[#111b21]">{activeConversation.contato_nome}</h3>
                {isContactTyping ? (
                  <TypingIndicator name={activeConversation.contato_nome} />
                ) : (
                  <p className="text-xs font-normal text-[#667781]">{formatPhone(activeConversation.telefone)}</p>
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              {activeFlowSession && (
                <span className={`inline-flex min-h-[30px] items-center gap-1 rounded-xl px-3 text-[11px] font-bold uppercase ${activeFlowSession.handoff_required || activeFlowSession.status === 'handoff' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  <Bot size={13} />
                  {activeFlowSession.handoff_required || activeFlowSession.status === 'handoff' ? 'Atendente' : 'Robô ativo'}
                </span>
              )}
              {activeConversation.status === 'aberta' ? (
                <>
                  <TransferConversationMenu
                    conversation={activeConversation}
                    polos={routingPolos}
                    onTransfer={onTransferConversation}
                  />
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
                    disabled={activeConversation.status_atendimento === 'aguardando_avaliacao'}
                    className="inline-flex min-h-[34px] items-center gap-2 rounded-xl bg-emerald-50 px-3 text-[11px] font-bold uppercase text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    title={activeConversation.status_atendimento === 'aguardando_avaliacao' ? 'Aguardando a nota do aluno' : 'Enviar pesquisa de satisfação e encerrar'}
                  >
                    {activeConversation.status_atendimento === 'aguardando_avaliacao'
                      ? <Clock3 size={14} />
                      : <CheckCircle2 size={14} />}
                    {activeConversation.status_atendimento === 'aguardando_avaliacao'
                      ? 'Aguardando nota'
                      : 'Encerrar'}
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

      {deleteConfirmOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-whatsapp-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#001a33]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 id="delete-whatsapp-title" className="text-lg font-black text-[#001a33]">Apagar conversas selecionadas?</h3>
            <p className="mt-3 text-sm font-medium text-slate-500">As {validSelectedIds.length} conversa(s) e seus históricos serão removidos. Esta ação não pode ser desfeita.</p>
            {deleteError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={deleting} onClick={() => setDeleteConfirmOpen(false)} className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold text-slate-600">Cancelar</button>
              <button type="button" disabled={deleting || validSelectedIds.length === 0} onClick={handleDeleteSelected} className="rounded-xl bg-rose-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-40">{deleting ? 'Apagando...' : 'Apagar conversas'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default WhatsAppInbox;
