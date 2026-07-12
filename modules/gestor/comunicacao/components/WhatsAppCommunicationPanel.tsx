import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  BookUser,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Save,
  Search,
  Send,
  Wallet,
  X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { financeiroService } from '../../financeiro/financeiro.service';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { MensageriaConfigData, mensageriaService } from '../../configuracoes/mensageria/mensageria.service';
import WhatsAppInbox from './whatsapp/WhatsAppInbox';
import { whatsappService } from './whatsapp/whatsapp.service';
import {
  defaultMessageFor,
  formatDocument,
  formatPhone,
  initials,
  normalizePhone,
} from './whatsapp/whatsapp.utils';

type WhatsAppOpsTab = 'conversas' | 'automacoes' | 'atrasados';

const DEFAULT_AUTOMATION: Partial<MensageriaConfigData> = {
  waDueNoticeDays: 3,
  waSendDueNotice: true,
  waDueNoticeTemplate: 'Olá {{nome_aluno}}, sua parcela de {{valor_fatura}} vence em {{data_vencimento}}. Para pagar, acesse: {{link_pagamento}}',
  waSendPaymentReceipt: true,
  waPaymentReceiptTemplate: 'Olá {{nome_aluno}}, recebemos seu pagamento de {{valor_fatura}} referente a {{descricao_fatura}}. Obrigado!',
  waSendOverdueNotice: true,
  waOverdueNoticeDays: 1,
  waDefaultOverdueTemplate: 'Olá {{nome_aluno}}, identificamos uma parcela em atraso no valor de {{valor_fatura}}, vencida em {{data_vencimento}}. Regularize pelo link: {{link_pagamento}}',
  waSendMultipleOverdueNotice: true,
  waMultipleOverdueMinInstallments: 2,
  waMultipleOverdueTemplate: 'Olá {{nome_aluno}}, identificamos {{quantidade_parcelas}} parcelas em atraso, totalizando {{valor_total_atrasado}}. Para regularizar, acesse: {{link_pagamento}}',
};

const TEMPLATE_VARIABLES = {
  due: ['{{nome_aluno}}', '{{valor_fatura}}', '{{data_vencimento}}', '{{link_pagamento}}'],
  receipt: ['{{nome_aluno}}', '{{valor_fatura}}', '{{descricao_fatura}}'],
  overdue: ['{{nome_aluno}}', '{{valor_fatura}}', '{{data_vencimento}}', '{{link_pagamento}}'],
  multiple: ['{{nome_aluno}}', '{{quantidade_parcelas}}', '{{valor_total_atrasado}}', '{{link_pagamento}}'],
};

type AutomationTone = 'blue' | 'emerald' | 'amber' | 'rose';

const AUTOMATION_TONES: Record<AutomationTone, {
  section: string;
  rail: string;
  icon: string;
  step: string;
  panel: string;
  focus: string;
  variable: string;
}> = {
  blue: {
    section: 'border-blue-200 bg-blue-50/45',
    rail: 'bg-blue-600',
    icon: 'bg-blue-100 text-blue-700',
    step: 'bg-blue-600 text-white',
    panel: 'border-blue-100 bg-white/75 text-blue-900',
    focus: 'focus-within:border-blue-500 focus:border-blue-500',
    variable: 'hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
  },
  emerald: {
    section: 'border-emerald-200 bg-emerald-50/45',
    rail: 'bg-emerald-600',
    icon: 'bg-emerald-100 text-emerald-700',
    step: 'bg-emerald-600 text-white',
    panel: 'border-emerald-100 bg-white/75 text-emerald-900',
    focus: 'focus-within:border-emerald-500 focus:border-emerald-500',
    variable: 'hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700',
  },
  amber: {
    section: 'border-amber-200 bg-amber-50/50',
    rail: 'bg-amber-500',
    icon: 'bg-amber-100 text-amber-700',
    step: 'bg-amber-500 text-white',
    panel: 'border-amber-100 bg-white/75 text-amber-900',
    focus: 'focus-within:border-amber-500 focus:border-amber-500',
    variable: 'hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700',
  },
  rose: {
    section: 'border-rose-200 bg-rose-50/45',
    rail: 'bg-rose-600',
    icon: 'bg-rose-100 text-rose-700',
    step: 'bg-rose-600 text-white',
    panel: 'border-rose-100 bg-white/75 text-rose-900',
    focus: 'focus-within:border-rose-500 focus:border-rose-500',
    variable: 'hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700',
  },
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatDate = (value?: string) => {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const isOverdue = (status: string, dueDate: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  return status === 'VENCIDO' || (status === 'PENDENTE' && due < today);
};

const contactTone = (type?: string) => {
  if (type === 'Aluno') return { label: 'Aluno', avatar: 'bg-blue-600', badge: 'bg-blue-50 text-blue-700 border-blue-100' };
  if (type === 'Professor') return { label: 'Professor', avatar: 'bg-purple-600', badge: 'bg-purple-50 text-purple-700 border-purple-100' };
  if (type === 'PJ') return { label: 'Pessoa Jurídica', avatar: 'bg-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  return { label: 'Pessoa Física', avatar: 'bg-slate-700', badge: 'bg-slate-50 text-slate-700 border-slate-100' };
};

const AutomationCard = ({
  icon: Icon,
  step,
  tone,
  title,
  description,
  triggerValue,
  audienceValue,
  checked,
  onChange,
  timingLabel,
  timingValue,
  onTimingChange,
  timingSuffix,
  message,
  onMessageChange,
  variables,
}: {
  icon: React.ElementType;
  step: string;
  tone: AutomationTone;
  title: string;
  description: string;
  triggerValue: string;
  audienceValue: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  timingLabel?: string;
  timingValue?: number;
  onTimingChange?: (value: number) => void;
  timingSuffix?: string;
  message: string;
  onMessageChange: (value: string) => void;
  variables: string[];
}) => {
  const classes = AUTOMATION_TONES[tone];

  return (
  <section className={`relative overflow-hidden rounded-xl border p-4 transition-colors ${checked ? classes.section : 'border-slate-100 bg-slate-50 opacity-70'}`}>
    <span className={`absolute left-0 top-0 h-full w-1 ${checked ? classes.rail : 'bg-slate-200'}`} />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${checked ? classes.icon : 'bg-slate-100 text-slate-400'}`}>
          <Icon size={18} />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex h-6 items-center rounded-full px-2 text-[10px] font-black uppercase tracking-wide ${checked ? classes.step : 'bg-slate-200 text-slate-500'}`}>
              {step}
            </span>
            <h3 className="text-base font-black tracking-tight text-[#001a33]">{title}</h3>
          </div>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 accent-emerald-600"
        />
        {checked ? 'Ativo' : 'Inativo'}
      </label>
    </div>

    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className={`rounded-xl border p-3 ${classes.panel}`}>
        <p className="text-[10px] font-black uppercase tracking-wide opacity-60">Quando dispara</p>
        <p className="mt-1 text-sm font-black">{triggerValue}</p>
      </div>
      <div className={`rounded-xl border p-3 ${classes.panel}`}>
        <p className="text-[10px] font-black uppercase tracking-wide opacity-60">Quem recebe</p>
        <p className="mt-1 text-sm font-black">{audienceValue}</p>
      </div>
    </div>

    {timingLabel && onTimingChange && (
      <label className="mt-4 block space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{timingLabel}</span>
        <div className={`flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white ${classes.focus}`}>
          <input
            type="number"
            min="0"
            value={timingValue ?? 0}
            onChange={(event) => onTimingChange(Number(event.target.value))}
            className="h-11 w-24 border-0 px-4 text-sm font-bold text-[#001a33] outline-none"
          />
          <span className="border-l border-slate-100 px-3 text-xs font-semibold text-slate-500">{timingSuffix}</span>
        </div>
      </label>
    )}

    <label className="mt-4 block space-y-2">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Mensagem enviada</span>
      <textarea
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
        className={`h-28 w-full resize-none rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold leading-relaxed text-slate-700 outline-none ${classes.focus}`}
      />
    </label>

    <div className="mt-3 flex flex-wrap gap-2">
      {variables.map((variable) => (
        <button
          key={`${title}-${variable}`}
          type="button"
          onClick={() => onMessageChange(`${message}${message.endsWith(' ') || message.length === 0 ? '' : ' '}${variable}`)}
          className={`rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 transition-colors ${classes.variable}`}
        >
          {variable}
        </button>
      ))}
    </div>
  </section>
  );
};

const WhatsAppCommunicationPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<WhatsAppOpsTab>('conversas');
  const [automation, setAutomation] = useState<MensageriaConfigData>({ tipo: 'whatsapp', ...DEFAULT_AUTOMATION });
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [quickMessage, setQuickMessage] = useState('');
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ['mensageria_config', 'whatsapp'],
    queryFn: () => mensageriaService.getConfig('whatsapp'),
  });

  const { data: receivables = [], isLoading: loadingReceivables } = useQuery({
    queryKey: ['whatsapp', 'recebiveis-atrasados'],
    queryFn: () => financeiroService.getContasReceber(),
  });

  const { data: contacts = [], isLoading: loadingContacts } = useQuery({
    queryKey: ['whatsapp', 'iniciar-conversa-alunos'],
    queryFn: whatsappService.getContacts,
  });

  const { data: conversations = [], isLoading: loadingConversations } = useQuery({
    queryKey: ['whatsapp', 'conversas'],
    queryFn: whatsappService.getConversations,
  });

  const { data: conversationMessages = [], isLoading: loadingConversationMessages } = useQuery({
    queryKey: ['whatsapp', 'mensagens', activeConversationId],
    queryFn: () => whatsappService.getMessages(activeConversationId),
  });

  useEffect(() => {
    const next = {
      tipo: 'whatsapp' as const,
      ...DEFAULT_AUTOMATION,
      ...config,
    };
    setAutomation(next);
  }, [config]);

  useEffect(() => {
    const channel = supabase
      .channel('whatsapp_inbox_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversas' }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_mensagens' }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'mensagens'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const overdueReceivables = useMemo(
    () => receivables.filter((item) => isOverdue(item.status, item.dataVencimento)),
    [receivables]
  );

  const totals = useMemo(() => ({
    count: overdueReceivables.length,
    value: overdueReceivables.reduce((sum, item) => sum + Number(item.valor || 0), 0),
  }), [overdueReceivables]);

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
  }, [selectedContactId, selectedContact?.id]);

  const contactStats = useMemo(() => ({
    total: contacts.length,
    ativos: contacts.filter((contact) => String(contact.status || '').toLowerCase() === 'ativo').length,
    telefone: contacts.filter((contact) => normalizePhone(contact.telefone)).length,
    email: contacts.filter((contact) => contact.email).length,
  }), [contacts]);

  const saveMutation = useMutation({
    mutationFn: () => mensageriaService.saveConfig('whatsapp', automation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mensageria_config', 'whatsapp'] });
      toast.success('Automações salvas', 'Regras de comunicação WhatsApp atualizadas.');
    },
    onError: (err: any) => toast.error('Erro ao salvar', err?.message || 'Não foi possível salvar as automações.'),
  });

  const apiReady = Boolean(config?.waEnabled && config?.waPhoneNumberId && config?.waTokenConfigured);

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

    const text = quickMessage.trim();
    if (!text) {
      toast.error('Mensagem vazia', 'Escreva a mensagem antes de enviar pelo WhatsApp.');
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const data = await whatsappService.sendMessage({
        alunoId: selectedContact.id,
        to: phone,
        message: text,
      });

      toast.success('WhatsApp enviado', `Mensagem enviada para ${selectedContact.nome} pela API da Meta.`);
      if ((data as any)?.conversaId) setActiveConversationId((data as any).conversaId);
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'mensagens'] });
      setIsStartModalOpen(false);
      setActiveTab('conversas');
    } catch (error: any) {
      console.error('Erro ao enviar WhatsApp:', error);
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
    if (!conversation?.aluno_id) {
      throw new Error('Esta conversa ainda não está vinculada a um aluno cadastrado.');
    }

    await whatsappService.sendMessage({
      alunoId: conversation.aluno_id,
      to: conversation.telefone,
      message,
    });
    toast.success('Resposta enviada', `Mensagem enviada para ${conversation.contato_nome}.`);
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversas'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'mensagens', activeConversationId] });
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

  return (
    <div className="flex-1 overflow-hidden bg-white antialiased">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <div className="flex min-h-[74px] flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#001a33]">WhatsApp da escola</h2>
          <p className="mt-1 text-xs font-medium text-slate-400">Conversas externas, mensagens para alunos e avisos financeiros.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex min-h-[34px] items-center gap-2 rounded-xl px-3 text-xs font-bold ${
            apiReady ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
          }`}>
            {apiReady ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
            {apiReady ? 'API configurada' : 'Aguardando API'}
          </span>
          <button
            onClick={() => setIsStartModalOpen(true)}
            className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <Send size={14} />
            Iniciar conversa
          </button>
        </div>
      </div>

      <div className="flex w-full gap-1 overflow-x-auto border-b border-slate-100 bg-white px-5 py-3">
        {[
          { id: 'conversas', label: 'Conversas', icon: MessageCircle },
          { id: 'automacoes', label: 'Automações', icon: CalendarClock },
          { id: 'atrasados', label: 'Atrasados', icon: Wallet },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as WhatsAppOpsTab)}
              className={`flex min-h-[38px] shrink-0 items-center gap-2 rounded-xl px-4 text-xs font-bold uppercase tracking-wide transition-all ${
                activeTab === item.id ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-emerald-700'
              }`}
            >
              <Icon size={14} />
              {item.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'conversas' && (
        <WhatsAppInbox
          conversations={conversations}
          messages={conversationMessages}
          activeConversationId={activeConversationId}
          apiReady={apiReady}
          automationCount={[automation.waSendDueNotice, automation.waSendPaymentReceipt, automation.waSendOverdueNotice].filter(Boolean).length}
          overdueCount={totals.count}
          loadingConversations={loadingConversations}
          loadingMessages={loadingConversationMessages}
          onSelectConversation={selectConversation}
          onOpenStartModal={() => setIsStartModalOpen(true)}
          onOpenAutomations={() => setActiveTab('automacoes')}
          onOpenOverdue={() => setActiveTab('atrasados')}
          onSendReply={sendConversationReply}
        />
      )}

      {isStartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001a33]/45 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex min-h-[70px] items-center justify-between border-b border-slate-100 px-5">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-[#001a33]">Iniciar conversa WhatsApp</h3>
                <p className="mt-1 text-xs font-medium text-slate-500">Pesquise o aluno, confira CPF e telefone, depois envie pela API.</p>
              </div>
              <button
                onClick={() => setIsStartModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[390px_minmax(0,1fr)]">
              <aside className="flex min-h-0 flex-col border-r border-slate-100 bg-slate-50/70">
                <div className="space-y-3 border-b border-slate-100 bg-white p-4">
                  <label className="relative block">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      autoFocus
                      value={contactSearch}
                      onChange={(event) => setContactSearch(event.target.value)}
                      placeholder="Digite nome, CPF ou telefone..."
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-[#001a33] p-3 text-white">
                      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Alunos</p>
                      <p className="mt-1 text-xl font-bold">{contactStats.total}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Com telefone</p>
                      <p className="mt-1 text-xl font-bold">{contactStats.telefone}</p>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
                  {loadingContacts ? (
                    <div className="p-6 text-center text-xs font-bold text-slate-400">Carregando alunos...</div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="p-6 text-center text-xs font-bold text-slate-400">Nenhum aluno encontrado.</div>
                  ) : (
                    filteredContacts.map((contact) => {
                      const tone = contactTone(contact.tipo);
                      const isSelected = selectedContact?.id === contact.id;

                      return (
                        <button
                          key={contact.id}
                          onClick={() => {
                            setSelectedContactId(contact.id);
                            setQuickMessage(defaultMessageFor(contact));
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all ${
                            isSelected ? 'bg-white shadow-sm ring-1 ring-emerald-200' : 'hover:bg-white'
                          }`}
                        >
                          <div className={`h-11 w-11 shrink-0 overflow-hidden rounded-xl ${tone.avatar} text-white shadow-sm`}>
                            {contact.foto ? (
                              <img src={contact.foto} alt={contact.nome} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-bold">{initials(contact.nome)}</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-[#001a33]">{contact.nome}</p>
                            <p className="mt-1 truncate text-xs font-medium text-slate-500">
                              {formatPhone(contact.telefone)}
                            </p>
                          </div>
                          {normalizePhone(contact.telefone) ? (
                            <CheckCircle2 size={16} className="text-emerald-500" />
                          ) : (
                            <Clock3 size={16} className="text-amber-500" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              <section className="min-h-0 overflow-y-auto p-5 custom-scrollbar">
                {selectedContact ? (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className={`h-16 w-16 shrink-0 overflow-hidden rounded-2xl ${contactTone(selectedContact.tipo).avatar} text-white shadow-sm`}>
                          {selectedContact.foto ? (
                            <img src={selectedContact.foto} alt={selectedContact.nome} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-lg font-bold">{initials(selectedContact.nome)}</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Aluno selecionado</p>
                          <h4 className="mt-1 truncate text-2xl font-bold tracking-tight text-[#001a33]">{selectedContact.nome}</h4>
                          <p className="mt-1 truncate text-xs font-medium text-slate-500">{selectedContact.poloNome || selectedContact.cidade || 'Cadastro geral'}</p>
                        </div>
                      </div>
                      <span className={`inline-flex min-h-[30px] items-center rounded-lg border px-3 text-xs font-bold ${contactTone(selectedContact.tipo).badge}`}>
                        {selectedContact.status || 'ATIVO'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                          <FileText size={14} />
                          CPF
                        </div>
                        <p className="mt-2 font-mono text-sm font-bold text-slate-800">{formatDocument(selectedContact.cpfCnpj)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                          <Phone size={14} />
                          Telefone
                        </div>
                        <p className="mt-2 font-mono text-sm font-bold text-slate-800">{formatPhone(selectedContact.telefone)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                          <Mail size={14} />
                          E-mail
                        </div>
                        <p className="mt-2 truncate text-sm font-bold text-slate-800">{selectedContact.email || 'Não cadastrado'}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                      <p className="text-sm font-bold text-amber-900">Teste da Meta</p>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
                        Se o aluno ainda não estiver como destinatário de teste no painel da Meta, ou se não houver janela de atendimento aberta, a Meta pode aceitar a chamada mas não entregar mensagem livre. Para abrir conversa real fora da janela, o próximo passo é usar template aprovado.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <MessageCircle size={17} className="text-emerald-600" />
                        <p className="text-sm font-bold text-[#001a33]">Mensagem</p>
                      </div>
                      <textarea
                        value={quickMessage}
                        onChange={(event) => setQuickMessage(event.target.value)}
                        className="h-36 w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold leading-relaxed text-slate-700 outline-none transition-all focus:border-emerald-500"
                        placeholder="Escreva a mensagem para este aluno..."
                      />

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <button
                          onClick={sendWhatsAppMessage}
                          disabled={isSendingWhatsApp || !apiReady || !normalizePhone(selectedContact.telefone)}
                          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isSendingWhatsApp ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                          {isSendingWhatsApp ? 'Enviando...' : 'Enviar pela API'}
                        </button>
                        <button
                          onClick={openWhatsApp}
                          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-blue-900"
                        >
                          <MessageCircle size={15} />
                          Abrir manual
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                    <BookUser size={42} className="text-slate-300" />
                    <p className="mt-4 text-base font-bold text-slate-600">Digite e selecione um aluno</p>
                    <p className="mt-1 max-w-sm text-sm font-medium leading-relaxed text-slate-400">
                      Depois da seleção, o nome, CPF formatado e telefone formatado aparecem aqui para conferência antes do envio.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'automacoes' && (
        <div className="h-[calc(100%-132px)] overflow-y-auto p-5 custom-scrollbar">
          <div className="max-w-5xl space-y-5">
          {loadingConfig ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
              <RefreshCw size={18} className="animate-spin" />
              Carregando regras...
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-[#001a33]">Automações financeiras por WhatsApp</p>
                  <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-500">
                    Configure cada aviso separadamente. O texto salvo aqui será usado no disparo automático ou em envios manuais futuros.
                  </p>
                </div>
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#001a33] px-5 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-blue-900 disabled:opacity-50"
                >
                  {saveMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  Salvar alterações
                </button>
              </div>

              <div className="space-y-4">
                <AutomationCard
                  icon={CalendarClock}
                  step="01"
                  tone="blue"
                  title="Aviso de vencimento"
                  description="Enviado somente para alunos que ainda não pagaram a parcela. Se a parcela já estiver paga, este aviso não deve disparar."
                  triggerValue={`${automation.waDueNoticeDays ?? 3} dia(s) antes do vencimento`}
                  audienceValue="Aluno com parcela aberta e não paga"
                  checked={Boolean(automation.waSendDueNotice)}
                  onChange={(checked) => setAutomation((current) => ({ ...current, waSendDueNotice: checked }))}
                  timingLabel="Avisar quantos dias antes"
                  timingValue={automation.waDueNoticeDays ?? 3}
                  onTimingChange={(value) => setAutomation((current) => ({ ...current, waDueNoticeDays: value }))}
                  timingSuffix="dia(s) antes do vencimento"
                  message={automation.waDueNoticeTemplate || DEFAULT_AUTOMATION.waDueNoticeTemplate || ''}
                  onMessageChange={(value) => setAutomation((current) => ({ ...current, waDueNoticeTemplate: value }))}
                  variables={TEMPLATE_VARIABLES.due}
                />

                <AutomationCard
                  icon={BadgeCheck}
                  step="02"
                  tone="emerald"
                  title="Aviso de recebimento"
                  description="Enviado na confirmação do pagamento, quando a baixa/recebimento for reconhecida no financeiro."
                  triggerValue="Na confirmação do pagamento"
                  audienceValue="Aluno que teve a parcela recebida"
                  checked={Boolean(automation.waSendPaymentReceipt)}
                  onChange={(checked) => setAutomation((current) => ({ ...current, waSendPaymentReceipt: checked }))}
                  message={automation.waPaymentReceiptTemplate || DEFAULT_AUTOMATION.waPaymentReceiptTemplate || ''}
                  onMessageChange={(value) => setAutomation((current) => ({ ...current, waPaymentReceiptTemplate: value }))}
                  variables={TEMPLATE_VARIABLES.receipt}
                />

                <AutomationCard
                  icon={Clock3}
                  step="03"
                  tone="amber"
                  title="Aviso de atraso"
                  description="Enviado para aluno com parcela vencida e ainda não paga. Use para cobrança simples de atraso."
                  triggerValue={`${automation.waOverdueNoticeDays ?? 1} dia(s) após o vencimento`}
                  audienceValue="Aluno com uma parcela vencida"
                  checked={Boolean(automation.waSendOverdueNotice)}
                  onChange={(checked) => setAutomation((current) => ({ ...current, waSendOverdueNotice: checked }))}
                  timingLabel="Avisar quantos dias depois"
                  timingValue={automation.waOverdueNoticeDays ?? 1}
                  onTimingChange={(value) => setAutomation((current) => ({ ...current, waOverdueNoticeDays: value }))}
                  timingSuffix="dia(s) após o vencimento"
                  message={automation.waDefaultOverdueTemplate || DEFAULT_AUTOMATION.waDefaultOverdueTemplate || ''}
                  onMessageChange={(value) => setAutomation((current) => ({ ...current, waDefaultOverdueTemplate: value }))}
                  variables={TEMPLATE_VARIABLES.overdue}
                />

                <AutomationCard
                  icon={FileText}
                  step="04"
                  tone="rose"
                  title="Múltiplas parcelas em atraso"
                  description="Enviado quando o aluno acumula mais de uma parcela vencida. Use esta regra para uma cobrança mais direta, separada do atraso comum."
                  triggerValue={`A partir de ${automation.waMultipleOverdueMinInstallments ?? 2} parcelas vencidas`}
                  audienceValue="Aluno com atraso recorrente"
                  checked={Boolean(automation.waSendMultipleOverdueNotice)}
                  onChange={(checked) => setAutomation((current) => ({ ...current, waSendMultipleOverdueNotice: checked }))}
                  timingLabel="Disparar a partir de quantas parcelas"
                  timingValue={automation.waMultipleOverdueMinInstallments ?? 2}
                  onTimingChange={(value) => setAutomation((current) => ({ ...current, waMultipleOverdueMinInstallments: Math.max(value, 2) }))}
                  timingSuffix="parcelas vencidas"
                  message={automation.waMultipleOverdueTemplate || DEFAULT_AUTOMATION.waMultipleOverdueTemplate || ''}
                  onMessageChange={(value) => setAutomation((current) => ({ ...current, waMultipleOverdueTemplate: value }))}
                  variables={TEMPLATE_VARIABLES.multiple}
                />
              </div>
            </>
          )}
          </div>
        </div>
      )}

      {activeTab === 'atrasados' && (
        <div className="h-[calc(100%-132px)] space-y-4 overflow-y-auto p-5 custom-scrollbar">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-[#001a33]">{totals.count} parcelas em atraso</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Total em aberto: {formatMoney(totals.value)}</p>
            </div>
            <button
              disabled
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-slate-300 px-5 text-xs font-bold uppercase tracking-wide text-white"
            >
              <Send size={14} />
              Enviar selecionados
            </button>
          </div>

          {loadingReceivables ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500">
              <RefreshCw size={18} className="animate-spin" />
              Carregando atrasos...
            </div>
          ) : overdueReceivables.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
              <CheckCircle2 className="mx-auto text-emerald-600" size={30} />
              <p className="mt-3 text-sm font-bold text-emerald-700">Nenhuma parcela em atraso</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Aluno</th>
                    <th className="px-4 py-3">Cobrança</th>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overdueReceivables.slice(0, 12).map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-[#001a33]">{item.clienteNome}</td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-500">{item.descricao}</td>
                      <td className="px-4 py-3 text-xs font-bold text-rose-600">{formatDate(item.dataVencimento)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{formatMoney(item.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WhatsAppCommunicationPanel;
