import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCircle2, Clock3 } from 'lucide-react';
import ToastNotification, { useToast } from '../components/ToastNotification';
import WhatsAppInbox from './components/whatsapp/WhatsAppInbox';
import WhatsAppLineSwitcher from './components/whatsapp-panel/WhatsAppLineSwitcher';
import { useWhatsAppFlow } from './components/whatsapp-flow/useWhatsAppFlow';
import { whatsappService } from './components/whatsapp/whatsapp.service';
import { isWhatsAppConnectionReady, type WhatsAppConexao, type WhatsAppSector } from './components/whatsapp/whatsapp.types';
import { useWhatsAppRealtime } from './components/whatsapp/useWhatsAppRealtime';
import { installWhatsAppSoundUnlock, isWhatsAppSoundEnabled, playIncomingWhatsAppSound, setWhatsAppSoundEnabled } from './components/whatsapp/inbox/notificationSound';
import type { UnifiedSupportItem } from './unified-support-inbox.model';
import UnifiedWhatsAppStart from './UnifiedWhatsAppStart';

interface UnifiedWhatsAppDetailProps {
  connections: WhatsAppConexao[];
  selection: UnifiedSupportItem | null;
  startOpen: boolean;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onStartClose: () => void;
  onCreated: (conversationId: string, connectionId: string) => void;
  onConnectionChange: () => void;
}

const UnifiedWhatsAppDetail: React.FC<UnifiedWhatsAppDetailProps> = ({
  connections, selection, startOpen, selectedIds, onSelectionChange,
  onStartClose, onCreated, onConnectionChange,
}) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [preferredConnectionId, setPreferredConnectionId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(isWhatsAppSoundEnabled);
  const connection = connections.find((item) => item.id === selection?.connectionId)
    || connections.find((item) => item.id === preferredConnectionId)
    || connections.find((item) => item.is_default) || connections[0] || null;
  const connectionId = connection?.id || null;
  useEffect(() => {
    if (selection?.connectionId) setPreferredConnectionId(selection.connectionId);
  }, [selection?.connectionId]);
  const conversationId = selection?.channel === 'whatsapp' ? selection.conversationId : null;
  const apiReady = isWhatsAppConnectionReady(connection);
  const conversationsQuery = useQuery({
    queryKey: ['whatsapp', connectionId, 'conversas'],
    queryFn: () => whatsappService.getConversations(connectionId!),
    enabled: Boolean(connectionId),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const messagesQuery = useQuery({
    queryKey: ['whatsapp', connectionId, 'mensagens', conversationId],
    queryFn: () => whatsappService.getMessages(conversationId),
    enabled: Boolean(connectionId && conversationId),
    staleTime: 0,
  });
  const flow = useWhatsAppFlow(connectionId, queryClient, toast);
  useWhatsAppRealtime(queryClient, connectionId);
  useEffect(() => installWhatsAppSoundUnlock(), []);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    whatsappService.markConversationRead(conversationId)
      .then(() => { if (active) void queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'conversas'] }); })
      .catch(() => { if (active) toast.error('Erro de atualização', 'Não foi possível marcar a conversa como lida.'); });
    return () => { active = false; };
  }, [connectionId, conversationId, queryClient, toast]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'conversas'] });
    void queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'mensagens'] });
    void queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
  };

  const sendReply = async (message: string) => {
    const conversation = conversationsQuery.data?.find((item) => item.id === conversationId);
    if (!connectionId || !conversation) throw new Error('Selecione uma conversa.');
    await whatsappService.sendMessage({ connectionId, alunoId: conversation.aluno_id,
      conversationId: conversation.id, to: conversation.telefone, message });
    toast.success('Resposta enviada', `Mensagem enviada para ${conversation.contato_nome}.`);
    refresh();
  };

  const transfer = async (input: { conversationId: string; setor: WhatsAppSector; poloId: string; motivo?: string }) => {
    await whatsappService.transferConversation(input);
    void queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
    toast.success('Atendimento transferido', 'A conversa foi encaminhada para o setor e polo selecionados.');
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="flex min-h-[68px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <WhatsAppLineSwitcher connections={connections} activeConnectionId={connectionId} loading={false} onChange={(id) => { setPreferredConnectionId(id); onConnectionChange(); }} />
        </div>
        <button type="button" aria-label={soundEnabled ? 'Desligar som de novas mensagens' : 'Ligar som de novas mensagens'} onClick={() => {
          const next = !soundEnabled;
          setSoundEnabled(next);
          setWhatsAppSoundEnabled(next);
          if (next) playIncomingWhatsAppSound();
        }} className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">{soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}</button>
        <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-3 text-xs font-bold ${apiReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{apiReady ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}{apiReady ? 'API configurada' : 'Aguardando API'}</span>
      </div>
      {(conversationsQuery.error || messagesQuery.error) && <p role="status" className="bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">Não foi possível atualizar o WhatsApp. Tente novamente em instantes.</p>}
      {connectionId ? (
        <WhatsAppInbox
          key={connectionId}
          connectionId={connectionId}
          conversations={conversationsQuery.data || []}
          messages={messagesQuery.data || []}
          flowSessions={flow.sessions}
          activeConversationId={conversationId}
          apiReady={apiReady}
          loadingConversations={conversationsQuery.isLoading}
          loadingMessages={messagesQuery.isLoading}
          externalSelection={{ ids: selectedIds, onChange: onSelectionChange }}
          onSelectConversation={(id) => onCreated(id, connectionId)}
          onSendReply={sendReply}
          onDeleteConversations={async (ids) => { await whatsappService.deleteConversations(ids); refresh(); toast.success('Conversas apagadas', `${ids.length} conversa(s) removida(s).`); }}
          onPauseFlow={flow.pause}
          onResetFlow={flow.reset}
          onCloseConversation={flow.close}
          onReopenConversation={flow.reopen}
          onTransferConversation={transfer}
        />
      ) : <div className="flex flex-1 items-center justify-center px-8 text-center text-sm font-semibold text-slate-400">Nenhuma linha WhatsApp configurada.</div>}
      {startOpen && <UnifiedWhatsAppStart connectionId={connectionId} apiReady={apiReady} onClose={onStartClose} onCreated={onCreated} onError={toast.error} onSuccess={toast.success} />}
    </div>
  );
};

export default UnifiedWhatsAppDetail;
