import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { whatsappService } from './whatsapp/whatsapp.service';
import { WhatsAppContact } from './whatsapp/whatsapp.types';
import { defaultMessageFor, normalizePhone } from './whatsapp/whatsapp.utils';
import { useWhatsAppRealtime } from './whatsapp/useWhatsAppRealtime';
import { DEFAULT_AUTOMATION, DEFAULT_MODALITIES } from './whatsapp-panel/constants';
import AutomationsTab from './whatsapp-panel/AutomationsTab';
import OverdueTab from './whatsapp-panel/OverdueTab';
import StartConversationModal from './whatsapp-panel/StartConversationModal';
import WhatsAppPanelHeader from './whatsapp-panel/WhatsAppPanelHeader';
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
    queryKey: ['whatsapp', 'conversas'],
    queryFn: whatsappService.getConversations,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: conversationMessages = [], isLoading: loadingConversationMessages } = useQuery({
    queryKey: ['whatsapp', 'mensagens', activeConversationId],
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

  useWhatsAppRealtime(queryClient);
  const whatsappFlow = useWhatsAppFlow(queryClient, toast);
  const birthdayAgent = useBirthdayAgent(queryClient, toast);

  useEffect(() => { if (activeTab === 'configuracoes') queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] }); }, [activeTab, queryClient]);

  const apiReady = Boolean(config?.waEnabled && config?.waPhoneNumberId && config?.waTokenConfigured);

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
          await whatsappService.sendMessage({ alunoId: studentId, to: phone, message: buildOverdueBatchMessage(items) });
          sent += 1;
        } catch (error: any) {
          failures.push(`${first?.clienteNome || 'Aluno'}: ${error?.message || 'falha no envio'}`);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'mensagens'] });
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
      const data = await whatsappService.sendMessage({ alunoId: selectedContact.id, to: phone, message: quickMessage.trim() });
      toast.success('WhatsApp enviado', `Mensagem enviada para ${selectedContact.nome} pela API da Meta.`);
      if ((data as any)?.conversaId) setActiveConversationId((data as any).conversaId);
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'mensagens'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
      setIsStartModalOpen(false);
      setActiveTab('conversas');
    } catch (error: any) {
      toast.error('Erro no WhatsApp', error?.message || 'Não foi possível enviar pela API da Meta.');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const selectConversation = async (conversationId: string) => {
    setActiveConversationId(conversationId);
    await whatsappService.markConversationRead(conversationId);
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'mensagens', conversationId] });
  };

  const sendConversationReply = async (message: string) => {
    const conversation = conversations.find((item) => item.id === activeConversationId);
    if (!conversation?.aluno_id) throw new Error('Esta conversa ainda não está vinculada a um aluno cadastrado.');

    await whatsappService.sendMessage({ alunoId: conversation.aluno_id, to: conversation.telefone, message });
    toast.success('Resposta enviada', `Mensagem enviada para ${conversation.contato_nome}.`);
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'mensagens', activeConversationId] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
  };

  const deleteWhatsAppConversations = async (conversationIds: string[]) => {
    await whatsappService.deleteConversations(conversationIds);
    if (activeConversationId && conversationIds.includes(activeConversationId)) setActiveConversationId(null);
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'mensagens'] });
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

      <WhatsAppPanelHeader
        activeTab={activeTab}
        apiReady={apiReady}
        onTabChange={setActiveTab}
        onOpenStartModal={() => setIsStartModalOpen(true)}
      />

      {activeTab === 'conversas' && (
        <WhatsAppInbox conversations={conversations} messages={conversationMessages} flowSessions={whatsappFlow.sessions} activeConversationId={activeConversationId} apiReady={apiReady} loadingConversations={loadingConversations} loadingMessages={loadingConversationMessages} onSelectConversation={selectConversation} onOpenStartModal={() => setIsStartModalOpen(true)} onSendReply={sendConversationReply} onDeleteConversations={deleteWhatsAppConversations} onPauseFlow={whatsappFlow.pause} onResetFlow={whatsappFlow.reset} />
      )}

      {activeTab === 'automacoes' && (
        <AutomationsTab automation={automation} loadingConfig={loadingConfig} openAutomation={openAutomation} onToggleOpen={(key) => setOpenAutomation((current) => current === key ? null : key)} onAutomationChange={setAutomation} onModalitiesChange={updateAutomationModalities} onSave={(key) => saveAutomationMutation.mutate(key)} isSaving={saveAutomationMutation.isPending} savingKey={saveAutomationMutation.variables} />
      )}

      {activeTab === 'atrasados' && (
        <OverdueTab loading={loadingReceivables} totals={overdueTotals} groups={overdueGroups} selectedIds={selectedOverdueIds} selectedSummary={selectedOverdueSummary} collapsedGroups={collapsedOverdueGroups} apiReady={apiReady} isSending={isSendingOverdueBatch} onToggleGroup={toggleCollapsedOverdueGroup} onSetItemsSelected={setOverdueItemsSelected} onToggleItemSelected={(item, checked) => setOverdueItemsSelected([item], checked)} onClearSelection={() => setSelectedOverdueIds(new Set())} onSendSelected={sendSelectedOverdueMessages} />
      )}

      {activeTab === 'fluxos' && (
        <WhatsAppFlowPanel settings={whatsappFlow.settings} sessions={whatsappFlow.sessions} loading={whatsappFlow.loading} saving={whatsappFlow.saving} onSave={whatsappFlow.save} onPauseSession={whatsappFlow.pause} onResetSession={whatsappFlow.reset} />
      )}

      {activeTab === 'agentes' && (
        <BirthdayAgentPanel settings={birthdayAgent.settings} bankStats={birthdayAgent.bankStats} loading={birthdayAgent.loading} saving={birthdayAgent.saving} onSave={birthdayAgent.save} />
      )}

      {activeTab === 'perfil' && (
        <WhatsAppProfilePanel apiReady={apiReady} />
      )}

      {activeTab === 'configuracoes' && (
        <WhatsAppSettingsPanel summary={usageSummary} birthdayProjection={birthdayAgent.projection} loading={loadingUsageSummary} />
      )}

      {isStartModalOpen && (
        <StartConversationModal contacts={contacts} filteredContacts={filteredContacts} loadingContacts={loadingContacts} contactSearch={contactSearch} selectedContact={selectedContact} quickMessage={quickMessage} isSendingWhatsApp={isSendingWhatsApp} apiReady={apiReady} onSearchChange={setContactSearch} onSelectContact={selectStartContact} onQuickMessageChange={setQuickMessage} onSendWhatsAppMessage={sendWhatsAppMessage} onOpenWhatsApp={openWhatsApp} onClose={() => setIsStartModalOpen(false)} />
      )}
    </div>
  );
};

export default WhatsAppCommunicationPanel;
