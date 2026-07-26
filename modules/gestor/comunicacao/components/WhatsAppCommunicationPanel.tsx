import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Bot, CheckCircle2, Clock3, Send } from 'lucide-react';
import { ContasReceber, financeiroService } from '../../financeiro/financeiro.service';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { MensageriaConfigData, mensageriaService } from '../../configuracoes/mensageria/mensageria.service';
import WhatsAppInbox from './whatsapp/WhatsAppInbox';
import WhatsAppProfilePanel from './whatsapp/WhatsAppProfilePanel';
import WhatsAppSettingsPanel from './whatsapp/WhatsAppSettingsPanel';
import WhatsAppFlowPanel from './whatsapp-flow/WhatsAppFlowPanel';
import { useWhatsAppFlow } from './whatsapp-flow/useWhatsAppFlow';
import BirthdayAgentPanel from './whatsapp-agents/BirthdayAgentPanel';
import { useBirthdayAgent } from './whatsapp-agents/useBirthdayAgent';
import CourseSupportAgentPanel from './whatsapp-agents/CourseSupportAgentPanel';
import { useCourseAgent } from './whatsapp-agents/useCourseAgent';
import { whatsappService } from './whatsapp/whatsapp.service';
import { isWhatsAppConnectionReady, WhatsAppContact, WhatsAppSector } from './whatsapp/whatsapp.types';
import { defaultMessageFor, normalizePhone } from './whatsapp/whatsapp.utils';
import { useWhatsAppRealtime } from './whatsapp/useWhatsAppRealtime';
import { installWhatsAppSoundUnlock, isWhatsAppSoundEnabled, playIncomingWhatsAppSound, setWhatsAppSoundEnabled } from './whatsapp/inbox/notificationSound';
import { DEFAULT_AUTOMATION, DEFAULT_MODALITIES } from './whatsapp-panel/constants';
import AutomationsTab from './whatsapp-panel/AutomationsTab';
import OverdueTab from './whatsapp-panel/OverdueTab';
import StartConversationModal, { StartConversationBatchResult } from './whatsapp-panel/StartConversationModal';
import WhatsAppPanelHeader from './whatsapp-panel/WhatsAppPanelHeader';
import WhatsAppLineSwitcher from './whatsapp-panel/WhatsAppLineSwitcher';
import { AutomationField, AutomationKey, WhatsAppOpsTab } from './whatsapp-panel/types';
import { applyTemplate, firstPaymentLink, formatCpfFinal, formatDate, formatMoney, groupOverdueReceivables, isOverdue, receivableId } from './whatsapp-panel/utils';

const automationLabels: Record<AutomationKey, string> = {
  due: 'Aviso de vencimento',
  receipt: 'Aviso de recebimento',
  overdue: 'Aviso de atraso',
  multiple: 'Múltiplas parcelas em atraso',
};

const WhatsAppCommunicationPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<WhatsAppOpsTab>('conversas');
  const [automation, setAutomation] = useState<MensageriaConfigData>({ tipo: 'whatsapp', ...DEFAULT_AUTOMATION });
  const [openAutomation, setOpenAutomation] = useState<AutomationKey | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [quickMessage, setQuickMessage] = useState('');
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isSendingOverdueBatch, setIsSendingOverdueBatch] = useState(false);
  const [selectedOverdueIds, setSelectedOverdueIds] = useState<Set<string>>(new Set());
  const [collapsedOverdueGroups, setCollapsedOverdueGroups] = useState<Set<string>>(new Set());
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => isWhatsAppSoundEnabled());
  const [activeAgentView, setActiveAgentView] = useState<'courses' | 'birthday'>('courses');

  const { data: connections = [], isLoading: loadingConnections } = useQuery({
    queryKey: ['whatsapp_conexoes'],
    queryFn: whatsappService.getConexoes,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (connections.length === 0) {
      setActiveConnectionId(null);
      return;
    }
    if (activeConnectionId && connections.some((item) => item.id === activeConnectionId)) return;
    const preferred = connections.find((item) => item.is_default) || connections[0];
    setActiveConnectionId(preferred.id);
  }, [activeConnectionId, connections]);

  const activeConnection = useMemo(
    () => connections.find((item) => item.id === activeConnectionId) || null,
    [activeConnectionId, connections],
  );
  const isFinancialLine = activeConnection?.is_matriz_financeira === true;

  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ['mensageria_config', 'whatsapp'],
    queryFn: () => mensageriaService.getConfig('whatsapp'),
  });

  const { data: receivables = [], isLoading: loadingReceivables } = useQuery({
    queryKey: ['whatsapp', 'recebiveis-atrasados'],
    queryFn: () => financeiroService.getContasReceber(),
    staleTime: 30_000,
  });

  const { data: contacts = [], isLoading: loadingContacts } = useQuery({
    queryKey: ['whatsapp', 'iniciar-conversa-alunos'],
    queryFn: whatsappService.getContacts,
    staleTime: 60_000,
  });

  const { data: conversations = [], isLoading: loadingConversations } = useQuery({
    queryKey: ['whatsapp', activeConnectionId, 'conversas'],
    queryFn: () => whatsappService.getConversations(activeConnectionId!),
    enabled: Boolean(activeConnectionId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: conversationMessages = [], isLoading: loadingConversationMessages } = useQuery({
    queryKey: ['whatsapp', activeConnectionId, 'mensagens', activeConversationId],
    queryFn: () => whatsappService.getMessages(activeConversationId),
    enabled: Boolean(activeConversationId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: usageSummary = null, isLoading: loadingUsageSummary } = useQuery({
    queryKey: ['whatsapp', 'uso-mensal'],
    queryFn: whatsappService.getUsageSummary,
    staleTime: 0,
    refetchOnMount: 'always', refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const next = {
      tipo: 'whatsapp' as const,
      ...DEFAULT_AUTOMATION,
      ...config,
      waDueNoticeModalities: config?.waDueNoticeModalities?.length ? config.waDueNoticeModalities : DEFAULT_MODALITIES,
      waPaymentReceiptModalities: config?.waPaymentReceiptModalities?.length ? config.waPaymentReceiptModalities : DEFAULT_MODALITIES,
      waOverdueNoticeModalities: config?.waOverdueNoticeModalities?.length ? config.waOverdueNoticeModalities : DEFAULT_MODALITIES,
      waMultipleOverdueModalities: config?.waMultipleOverdueModalities?.length ? config.waMultipleOverdueModalities : DEFAULT_MODALITIES,
    };
    setAutomation(next);
  }, [config]);

  useWhatsAppRealtime(queryClient, activeConnectionId);
  const whatsappFlow = useWhatsAppFlow(activeConnectionId, queryClient, toast);
  const birthdayAgent = useBirthdayAgent(queryClient, toast);
  const courseAgent = useCourseAgent(activeConnectionId, queryClient, toast);

  useEffect(() => installWhatsAppSoundUnlock(), []);

  const toggleSound = () => {
    setSoundEnabled((current) => {
      const next = !current;
      setWhatsAppSoundEnabled(next);
      if (next) playIncomingWhatsAppSound();
      return next;
    });
  };

  useEffect(() => { if (activeTab === 'configuracoes') queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] }); }, [activeTab, queryClient]);

  const apiReady = isWhatsAppConnectionReady(activeConnection);

  const changeConnection = (connectionId: string) => {
    setActiveConnectionId(connectionId);
    setActiveConversationId(null);
    setSelectedContactId(null);
    setQuickMessage('');
    setSelectedOverdueIds(new Set());
    if (!connections.find((item) => item.id === connectionId)?.is_matriz_financeira &&
      ['automacoes', 'atrasados'].includes(activeTab)) {
      setActiveTab('conversas');
    }
  };

  const overdueReceivables = useMemo(
    () => receivables.filter((item) => isOverdue(item.status, item.dataVencimento)),
    [receivables],
  );

  const overdueTotals = useMemo(() => ({
    count: overdueReceivables.length,
    value: overdueReceivables.reduce((sum, item) => sum + Number(item.valor || 0), 0),
  }), [overdueReceivables]);

  const overdueGroups = useMemo(
    () => groupOverdueReceivables(overdueReceivables),
    [overdueReceivables],
  );

  const selectedOverdueReceivables = useMemo(
    () => overdueReceivables.filter((item) => selectedOverdueIds.has(receivableId(item))),
    [overdueReceivables, selectedOverdueIds],
  );

  const selectedOverdueSummary = useMemo(() => {
    const recipients = new Set(selectedOverdueReceivables.map((item) => item.clienteId).filter(Boolean));
    return {
      count: selectedOverdueReceivables.length,
      recipients: recipients.size,
      value: selectedOverdueReceivables.reduce((sum, item) => sum + Number(item.valor || 0), 0),
    };
  }, [selectedOverdueReceivables]);

  const filteredContacts = useMemo(() => {
    const term = contactSearch.trim().toLowerCase();
    if (!term) return contacts;

    return contacts.filter((contact) => {
      const searchable = [
        contact.nome,
        contact.tipo,
        contact.email,
        contact.telefone,
        contact.cpfCnpj,
        contact.cidade,
        contact.poloNome,
        ...contact.matriculas.flatMap((enrollment) => [
          enrollment.cursoNome,
          enrollment.modalidade,
          enrollment.turmaNome,
          enrollment.turmaCodigo,
        ]),
      ].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(term);
    });
  }, [contacts, contactSearch]);
  const selectedContact = useMemo(() => {
    if (!selectedContactId) return null;
    return contacts.find((contact) => contact.id === selectedContactId) || null;
  }, [contacts, selectedContactId]);

  useEffect(() => {
    if (!selectedContactId) {
      setQuickMessage('');
      return;
    }

    if (!selectedContact) {
      setSelectedContactId(null);
      setQuickMessage('');
      return;
    }

    setQuickMessage((current) => current || defaultMessageFor(selectedContact));
  }, [selectedContactId, selectedContact?.id, selectedContact]);

  const saveAutomationMutation = useMutation({
    mutationFn: (key: AutomationKey) => mensageriaService.saveWhatsappAutomationConfig(automation).then(() => key),
    onSuccess: (key) => {
      queryClient.invalidateQueries({ queryKey: ['mensageria_config', 'whatsapp'] });
      toast.success('Aviso salvo', `${automationLabels[key]} atualizado.`);
    },
    onError: (err: any) => toast.error('Erro ao salvar', err?.message || 'Não foi possível salvar as automações.'),
  });

  const updateAutomationModalities = (field: AutomationField, value: string[]) => {
    setAutomation((current) => ({ ...current, [field]: value }));
  };

  const toggleCollapsedOverdueGroup = (groupId: string) => {
    setCollapsedOverdueGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const setOverdueItemsSelected = (items: ContasReceber[], checked: boolean) => {
    setSelectedOverdueIds((current) => {
      const next = new Set(current);
      items.forEach((item) => {
        if (!item.clienteId || !normalizePhone(item.clienteTelefone)) return;
        const id = receivableId(item);
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const buildOverdueBatchMessage = (items: ContasReceber[]) => {
    const sorted = [...items].sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
    const first = sorted[0];
    const total = sorted.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const useMultipleTemplate = sorted.length >= (automation.waMultipleOverdueMinInstallments || 2);
    const template = useMultipleTemplate
      ? automation.waMultipleOverdueTemplate || DEFAULT_AUTOMATION.waMultipleOverdueTemplate || ''
      : automation.waDefaultOverdueTemplate || DEFAULT_AUTOMATION.waDefaultOverdueTemplate || '';

    return applyTemplate(template, {
      nome_aluno: first?.clienteNome || 'aluno(a)',
      nome_curso: first?.cursoNome || 'curso não informado',
      nome_turma: first?.turmaNome || 'turma não informada',
      valor_fatura: formatMoney(first?.valor || total),
      numero_mensalidade: first?.parcelaNumero
        ? String(first.parcelaNumero).padStart(2, '0')
        : 'não informado',
      data_vencimento: formatDate(first?.dataVencimento),
      cpf_final: formatCpfFinal(first?.clienteCpfCnpj),
      link_pagamento: firstPaymentLink(sorted) || 'solicite o link de pagamento neste atendimento',
      descricao_fatura: first?.descricao || 'parcela',
      quantidade_parcelas: String(sorted.length),
      valor_total_atrasado: formatMoney(total),
    });
  };

  const sendSelectedOverdueMessages = async () => {
    if (selectedOverdueReceivables.length === 0) {
      toast.info('Nenhuma seleção', 'Selecione pelo menos uma cobrança para enviar mensagem em lote.');
      return;
    }
    if (!apiReady) {
      toast.info('API não configurada', 'Configure e ative a API da Meta antes do envio em lote.');
      return;
    }

    const byStudent = selectedOverdueReceivables.reduce((map, item) => {
      if (!item.clienteId) return map;
      map.set(item.clienteId, [...(map.get(item.clienteId) || []), item]);
      return map;
    }, new Map<string, ContasReceber[]>());

    setIsSendingOverdueBatch(true);
    let sent = 0;
    let skipped = 0;
    const failures: string[] = [];

    try {
      for (const [studentId, items] of byStudent.entries()) {
        const first = items[0];
        const phone = normalizePhone(first?.clienteTelefone);
        if (!phone) {
          skipped += 1;
          continue;
        }

        try {
          await whatsappService.sendMessage({ connectionId: activeConnectionId!, alunoId: studentId, to: phone, message: buildOverdueBatchMessage(items) });
          sent += 1;
        } catch (error: any) {
          failures.push(`${first?.clienteNome || 'Aluno'}: ${error?.message || 'falha no envio'}`);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'conversas'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'mensagens'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });

      if (sent > 0) {
        setSelectedOverdueIds(new Set());
        toast.success('Envio em lote concluído', `${sent} aluno(s) receberam mensagem.${skipped ? ` ${skipped} sem WhatsApp foram ignorados.` : ''}`);
      }
      if (failures.length > 0) toast.error('Alguns envios falharam', failures.slice(0, 2).join(' | '));
      else if (sent === 0) toast.info('Nenhum envio realizado', skipped ? 'Os selecionados não possuem WhatsApp válido.' : 'Não foi possível enviar as mensagens selecionadas.');
    } finally {
      setIsSendingOverdueBatch(false);
    }
  };

  const sendWhatsAppMessage = async () => {
    if (!selectedContact) return;
    if (!apiReady) {
      toast.info('API não configurada', 'Configure e ative a API da Meta em Configurações > WhatsApp API.');
      return;
    }

    const phone = normalizePhone(selectedContact.telefone);
    if (!phone) {
      toast.info('Aluno sem WhatsApp', 'Cadastre o telefone/WhatsApp do aluno antes do envio externo.');
      return;
    }
    if (!quickMessage.trim()) {
      toast.error('Mensagem vazia', 'Escreva a mensagem antes de enviar pelo WhatsApp.');
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const data = await whatsappService.sendMessage({ connectionId: activeConnectionId!, alunoId: selectedContact.id, to: phone, message: quickMessage.trim() });
      toast.success('WhatsApp enviado', `Mensagem enviada para ${selectedContact.nome} pela API da Meta.`);
      if ((data as any)?.conversaId) setActiveConversationId((data as any).conversaId);
      queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'conversas'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'mensagens'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
      setIsStartModalOpen(false);
      setActiveTab('conversas');
    } catch (error: any) {
      toast.error('Erro no WhatsApp', error?.message || 'Não foi possível enviar pela API da Meta.');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const sendWhatsAppBatch = async (
    recipients: WhatsAppContact[],
    message: string,
  ): Promise<StartConversationBatchResult> => {
    const text = message.trim();
    if (!apiReady || !activeConnectionId || !text) {
      return {
        sent: 0,
        skipped: recipients.length,
        failures: ['A API não está disponível ou a mensagem está vazia.'],
      };
    }

    let sent = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (const contact of recipients) {
      const phone = normalizePhone(contact.telefone);
      if (!phone) {
        skipped += 1;
        continue;
      }

      try {
        await whatsappService.sendMessage({
          connectionId: activeConnectionId,
          alunoId: contact.id,
          to: phone,
          message: text,
        });
        sent += 1;
      } catch (error: any) {
        failures.push(`${contact.nome}: ${error?.message || 'falha no envio'}`);
      }
    }

    queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'mensagens'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });

    if (sent > 0) {
      toast.success(
        'Envio em massa concluído',
        `${sent} aluno(s) receberam a mensagem.${failures.length ? ` ${failures.length} envio(s) falharam.` : ''}`,
      );
    } else {
      toast.error(
        'Nenhuma mensagem enviada',
        failures[0] || 'Os alunos selecionados não possuem telefone válido.',
      );
    }

    return { sent, skipped, failures };
  };

  const selectConversation = async (conversationId: string) => {
    setActiveConversationId(conversationId);
    await whatsappService.markConversationRead(conversationId);
    queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'mensagens', conversationId] });
  };

  const sendConversationReply = async (message: string) => {
    const conversation = conversations.find((item) => item.id === activeConversationId);
    if (!conversation) throw new Error('Selecione uma conversa.');

    await whatsappService.sendMessage({
      connectionId: activeConnectionId!,
      alunoId: conversation.aluno_id,
      conversationId: conversation.id,
      to: conversation.telefone,
      message,
    });
    toast.success('Resposta enviada', `Mensagem enviada para ${conversation.contato_nome}.`);
    queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'mensagens', activeConversationId] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
  };

  const transferConversation = async (input: {
    conversationId: string;
    setor: WhatsAppSector;
    poloId: string;
    motivo?: string;
  }) => {
    await whatsappService.transferConversation(input);
    queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
    toast.success(
      'Atendimento transferido',
      'A conversa agora está visível para o setor e polo selecionados.',
    );
  };

  const deleteWhatsAppConversations = async (conversationIds: string[]) => {
    await whatsappService.deleteConversations(conversationIds);
    if (activeConversationId && conversationIds.includes(activeConversationId)) setActiveConversationId(null);
    queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', activeConnectionId, 'mensagens'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
    toast.success('Conversas apagadas', `${conversationIds.length} conversa(s) removida(s) da caixa WhatsApp.`);
  };

  const openWhatsApp = () => {
    if (!selectedContact) return;
    const phone = normalizePhone(selectedContact.telefone);
    if (!phone) {
      toast.info('Contato sem WhatsApp', 'Cadastre um telefone/WhatsApp para este contato antes do envio externo.');
      return;
    }

    const text = quickMessage.trim() || defaultMessageFor(selectedContact);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const selectStartContact = (contact: WhatsAppContact) => {
    setSelectedContactId(contact.id);
    setQuickMessage(defaultMessageFor(contact));
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white antialiased">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <div className="flex min-h-[68px] shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
            <img src="/logos/whatsapp.svg" alt="" aria-hidden="true" className="h-[22px] w-[22px]" />
          </div>
          <WhatsAppLineSwitcher
            connections={connections}
            activeConnectionId={activeConnectionId}
            loading={loadingConnections}
            onChange={changeConnection}
          />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <button
            type="button"
            onClick={toggleSound}
            className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition-colors ${soundEnabled ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 hover:bg-emerald-100' : 'bg-slate-50 text-slate-400 ring-slate-100 hover:bg-slate-100'}`}
            title={soundEnabled ? 'Som de novas mensagens ligado' : 'Som de novas mensagens desligado'}
            aria-label={soundEnabled ? 'Desligar som de novas mensagens' : 'Ligar som de novas mensagens'}
          >
            {soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
          </button>
          <span className={`inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs font-bold ${
            apiReady ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
          }`}>
            {apiReady ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
            {apiReady ? 'API configurada' : 'Aguardando API'}
          </span>
          <button
            type="button"
            onClick={() => setIsStartModalOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-600 px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <Send size={14} />
            Iniciar conversa
          </button>
        </div>
      </div>

      <WhatsAppPanelHeader
        activeTab={activeTab}
        isFinancialLine={isFinancialLine}
        onTabChange={setActiveTab}
      />

      {activeTab === 'conversas' && activeConnectionId && (
        <WhatsAppInbox connectionId={activeConnectionId} conversations={conversations} messages={conversationMessages} flowSessions={whatsappFlow.sessions} activeConversationId={activeConversationId} apiReady={apiReady} loadingConversations={loadingConversations} loadingMessages={loadingConversationMessages} onSelectConversation={selectConversation} onSendReply={sendConversationReply} onDeleteConversations={deleteWhatsAppConversations} onPauseFlow={whatsappFlow.pause} onResetFlow={whatsappFlow.reset} onCloseConversation={whatsappFlow.close} onReopenConversation={whatsappFlow.reopen} onTransferConversation={transferConversation} />
      )}

      {activeTab === 'automacoes' && (
        <AutomationsTab automation={automation} loadingConfig={loadingConfig} openAutomation={openAutomation} onToggleOpen={(key) => setOpenAutomation((current) => current === key ? null : key)} onAutomationChange={setAutomation} onModalitiesChange={updateAutomationModalities} onSave={(key) => saveAutomationMutation.mutate(key)} isSaving={saveAutomationMutation.isPending} savingKey={saveAutomationMutation.variables} />
      )}

      {activeTab === 'atrasados' && (
        <OverdueTab loading={loadingReceivables} totals={overdueTotals} groups={overdueGroups} selectedIds={selectedOverdueIds} selectedSummary={selectedOverdueSummary} collapsedGroups={collapsedOverdueGroups} apiReady={apiReady} isSending={isSendingOverdueBatch} onToggleGroup={toggleCollapsedOverdueGroup} onSetItemsSelected={setOverdueItemsSelected} onToggleItemSelected={(item, checked) => setOverdueItemsSelected([item], checked)} onClearSelection={() => setSelectedOverdueIds(new Set())} onSendSelected={sendSelectedOverdueMessages} />
      )}

      {activeTab === 'fluxos' && (
        <WhatsAppFlowPanel connectionName={activeConnection?.nome} settings={whatsappFlow.settings} sessions={whatsappFlow.sessions} loading={whatsappFlow.loading} saving={whatsappFlow.saving} onSave={whatsappFlow.save} onPauseSession={whatsappFlow.pause} onResetSession={whatsappFlow.reset} />
      )}

      {activeTab === 'agentes' && isFinancialLine && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-5 pt-3">
            <button
              type="button"
              onClick={() => setActiveAgentView('courses')}
              className={`relative inline-flex min-h-[44px] items-center gap-2 px-4 text-sm font-black transition-colors ${
                activeAgentView === 'courses' ? 'text-emerald-700' : 'text-slate-500 hover:text-[#001a33]'
              }`}
            >
              <Bot size={17} />
              Cursos e dúvidas
              {courseAgent.settings?.enabled && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
              {activeAgentView === 'courses' && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-emerald-600" />}
            </button>
            <button
              type="button"
              onClick={() => setActiveAgentView('birthday')}
              className={`relative inline-flex min-h-[44px] items-center gap-2 px-4 text-sm font-black transition-colors ${
                activeAgentView === 'birthday' ? 'text-emerald-700' : 'text-slate-500 hover:text-[#001a33]'
              }`}
            >
              Aniversário
              {birthdayAgent.settings?.enabled && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
              {activeAgentView === 'birthday' && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-emerald-600" />}
            </button>
          </div>
          {activeAgentView === 'courses' && activeConnectionId && (
            <CourseSupportAgentPanel
              connectionId={activeConnectionId}
              settings={courseAgent.settings}
              faqs={courseAgent.faqs}
              stats={courseAgent.stats}
              loading={courseAgent.loading}
              savingSettings={courseAgent.savingSettings}
              savingFaq={courseAgent.savingFaq}
              deletingFaq={courseAgent.deletingFaq}
              onSaveSettings={courseAgent.saveSettings}
              onSaveFaq={courseAgent.saveFaq}
              onDeleteFaq={courseAgent.deleteFaq}
            />
          )}
          {activeAgentView === 'birthday' && (
            <BirthdayAgentPanel settings={birthdayAgent.settings} bankStats={birthdayAgent.bankStats} loading={birthdayAgent.loading} saving={birthdayAgent.saving} onSave={birthdayAgent.save} />
          )}
        </div>
      )}

      {activeTab === 'agentes' && !isFinancialLine && (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-8">
          <div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Bot size={24} /></div>
            <h3 className="mt-4 text-lg font-black text-[#001a33]">Nenhum agente ativo nesta linha</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
              O agente financeiro e o agente de aniversário permanecem vinculados ao número principal. Novos agentes de {activeConnection?.nome} poderão ser configurados aqui sem afetar as outras linhas.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'perfil' && activeConnectionId && activeConnection && (
        <WhatsAppProfilePanel apiReady={apiReady} connectionId={activeConnectionId} connectionName={activeConnection.nome} />
      )}

      {activeTab === 'configuracoes' && isFinancialLine && (
        <WhatsAppSettingsPanel summary={usageSummary} birthdayProjection={birthdayAgent.projection} loading={loadingUsageSummary} />
      )}

      {activeTab === 'configuracoes' && !isFinancialLine && activeConnection && (
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-6">
          <div className="max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-black text-[#001a33]">Resumo da linha {activeConnection.nome}</h3>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Número: {activeConnection.telefone || 'não informado'} · instituição: {activeConnection.instituicao} · modo: {activeConnection.connection_mode === 'coexistence' ? 'Coexistência' : 'Cloud API'}.
            </p>
            <p className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-800">
              Credenciais e conexão são administradas em Configurações → WhatsApp API. Esta área mantém somente dados operacionais do número selecionado.
            </p>
          </div>
        </div>
      )}

      {isStartModalOpen && (
        <StartConversationModal contacts={contacts} filteredContacts={filteredContacts} loadingContacts={loadingContacts} contactSearch={contactSearch} selectedContact={selectedContact} quickMessage={quickMessage} isSendingWhatsApp={isSendingWhatsApp} apiReady={apiReady} onSearchChange={setContactSearch} onSelectContact={selectStartContact} onQuickMessageChange={setQuickMessage} onSendWhatsAppMessage={sendWhatsAppMessage} onSendWhatsAppBatch={sendWhatsAppBatch} onOpenWhatsApp={openWhatsApp} onClose={() => setIsStartModalOpen(false)} />
      )}
    </div>
  );
};

export default WhatsAppCommunicationPanel;
