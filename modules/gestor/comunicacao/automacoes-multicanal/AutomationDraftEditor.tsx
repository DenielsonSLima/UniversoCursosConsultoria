import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, Check, Inbox, Loader2, MessageCircle, Save, X } from 'lucide-react';
import { multichannelAutomationService } from './multichannel-automation.service';
import {
  MULTICHANNEL_AUTOMATION_CHANNELS,
  MULTICHANNEL_COURSE_MODALITIES,
  MultichannelAutomationChannel,
  MultichannelAutomationChannelConfig,
  MultichannelAutomationDraftInput,
  MultichannelAutomationRoute,
  MultichannelAutomationTrigger,
  MultichannelAutomationViewModel,
} from './multichannel-automation.types';

const CHANNEL_UI: Record<MultichannelAutomationChannel, { label: string; icon: React.ElementType; color: string }> = {
  app_message: { label: 'Mensagem no app', icon: Inbox, color: 'text-blue-700 bg-blue-50' },
  push: { label: 'Notificação no celular', icon: BellRing, color: 'text-violet-700 bg-violet-50' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-700 bg-emerald-50' },
};

const MODALITY_LABELS = {
  TECNICO: 'Técnico',
  EAD: 'EAD',
  LIVRE: 'Livres',
  ESPECIALIZACAO: 'Especialização',
  SUPERIOR: 'Superior',
} as const;

const ENROLLMENT_STATUSES = [
  ['ATIVO', 'Ativo'],
  ['CONCLUIDO', 'Concluído'],
  ['TRANCADO', 'Trancado'],
  ['CANCELADO', 'Cancelado'],
  ['DESISTENTE', 'Desistente'],
] as const;

const normalizeChannels = (automation: MultichannelAutomationViewModel): MultichannelAutomationChannelConfig[] =>
  MULTICHANNEL_AUTOMATION_CHANNELS.map((channel) => {
    const existing = automation.channels.find((item) => item.channel === channel);
    if (channel === 'push') {
      return {
        channel,
        titleTemplate: existing?.channel === channel ? existing.titleTemplate || 'Nova mensagem da Universo' : 'Nova mensagem da Universo',
        bodyTemplate: existing?.bodyTemplate || 'Você recebeu uma nova mensagem. Abra o app para conferir.',
        deepLink: existing?.channel === channel ? existing.deepLink || '/aluno/comunicacao' : '/aluno/comunicacao',
        privacy: 'private',
        settings: { ...(existing?.settings || {}), privacy: 'private' },
      };
    }
    if (channel === 'whatsapp') {
      return {
        channel,
        bodyTemplate: existing?.bodyTemplate || 'Olá, {{nome_aluno}}.',
        metaTemplateName: existing?.channel === channel ? existing.metaTemplateName : null,
        metaTemplateLanguage: existing?.channel === channel ? existing.metaTemplateLanguage : 'pt_BR',
        category: existing?.channel === channel ? existing.category : 'utility',
        settings: {
          ...(existing?.settings || {}),
          category: existing?.channel === channel ? existing.category : 'utility',
          metaTemplateName: existing?.channel === channel ? existing.metaTemplateName : null,
          metaTemplateLanguage: existing?.channel === channel ? existing.metaTemplateLanguage : 'pt_BR',
        },
      };
    }
    return {
      channel,
      titleTemplate: existing?.channel === channel ? existing.titleTemplate || automation.name : automation.name,
      bodyTemplate: existing?.bodyTemplate || 'Olá, {{nome_aluno}}.',
      deepLink: existing?.channel === channel ? existing.deepLink || '/aluno/comunicacao' : '/aluno/comunicacao',
      settings: existing?.settings || {},
    };
  });

const normalizeRoutes = (automation: MultichannelAutomationViewModel): MultichannelAutomationRoute[] =>
  MULTICHANNEL_COURSE_MODALITIES.flatMap((modality) =>
    MULTICHANNEL_AUTOMATION_CHANNELS.map((channel) => automation.routes.find(
      (item) => item.modality === modality && item.channel === channel,
    ) || {
      modality,
      channel,
      enabled: false,
      mode: 'parallel' as const,
      priority: 1,
      fallbackAfterMinutes: null,
      fallbackCondition: null,
    }),
  );

const createDraft = (automation: MultichannelAutomationViewModel): MultichannelAutomationDraftInput => ({
  name: automation.name,
  description: automation.description,
  enrollmentStatuses: [...automation.enrollmentStatuses],
  trigger: { ...automation.trigger },
  channels: normalizeChannels(automation),
  routes: normalizeRoutes(automation),
});

interface TriggerEditorProps {
  trigger: MultichannelAutomationTrigger;
  onChange: (trigger: MultichannelAutomationTrigger) => void;
}

const TriggerEditor: React.FC<TriggerEditorProps> = ({ trigger, onChange }) => {
  const numberField = (label: string, value: number, update: (value: number) => void, min = 0) => (
    <label className="block text-xs font-black text-slate-600">
      {label}
      <input type="number" min={min} value={value} onChange={(event) => update(Number(event.target.value))} className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#001a33] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
    </label>
  );
  const timeField = (value: string, update: (value: string) => void) => (
    <label className="block text-xs font-black text-slate-600">
      Horário
      <input type="time" value={value} onChange={(event) => update(event.target.value)} className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#001a33] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
    </label>
  );

  switch (trigger.event) {
    case 'payment_due':
      return <div className="grid gap-3 sm:grid-cols-2">{numberField('Dias antes do vencimento', trigger.daysBefore, (daysBefore) => onChange({ ...trigger, daysBefore }))}{timeField(trigger.sendTime, (sendTime) => onChange({ ...trigger, sendTime }))}</div>;
    case 'payment_received':
      return <div>{numberField('Minutos após a confirmação', trigger.delayMinutes, (delayMinutes) => onChange({ ...trigger, delayMinutes }))}</div>;
    case 'payment_overdue':
      return <div className="grid gap-3 sm:grid-cols-2">{numberField('Dias após o vencimento', trigger.daysAfter, (daysAfter) => onChange({ ...trigger, daysAfter }))}{timeField(trigger.sendTime, (sendTime) => onChange({ ...trigger, sendTime }))}</div>;
    case 'multiple_overdue':
      return <div className="grid gap-3 sm:grid-cols-2">{numberField('Quantidade mínima de parcelas', trigger.minimumInstallments, (minimumInstallments) => onChange({ ...trigger, minimumInstallments }), 2)}{timeField(trigger.sendTime, (sendTime) => onChange({ ...trigger, sendTime }))}</div>;
    case 'birthday':
      return <div>{timeField(trigger.sendTime, (sendTime) => onChange({ ...trigger, sendTime }))}</div>;
  }
};

interface AutomationDraftEditorProps {
  automation: MultichannelAutomationViewModel;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

const AutomationDraftEditor: React.FC<AutomationDraftEditorProps> = ({ automation, onCancel, onDirtyChange }) => {
  const queryClient = useQueryClient();
  const [baseline, setBaseline] = useState(() => createDraft(automation));
  const [draft, setDraft] = useState(() => createDraft(automation));
  const [baseVersion, setBaseVersion] = useState(automation.currentVersion);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [baseline, draft]);
  const hasRemoteConflict = automation.currentVersion !== baseVersion;
  const selectedRoutes = useMemo(() => draft.routes.filter((route) => route.enabled).length, [draft.routes]);
  const messagesAreValid = useMemo(() => draft.channels.every((channel) => {
    if (!channel.bodyTemplate.trim()) return false;
    if (channel.channel === 'whatsapp') return true;
    if (!channel.titleTemplate?.trim() || !/^\/aluno(?:\/|$)/.test(channel.deepLink || '')) return false;
    return channel.channel !== 'push' || !/(\{\{|r\$|pagament|parcela|vencid|atras|valor)/i.test(`${channel.titleTemplate} ${channel.bodyTemplate}`);
  }), [draft.channels]);

  useEffect(() => {
    const preventAccidentalExit = (event: Event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', preventAccidentalExit);
    return () => window.removeEventListener('beforeunload', preventAccidentalExit);
  }, [isDirty]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const saveMutation = useMutation({
    mutationFn: () => multichannelAutomationService.saveDraft({
      automationId: automation.id,
      expectedVersion: baseVersion,
      requestId,
      reason: reason.trim(),
      draft,
    }),
    onSuccess: async (result) => {
      setBaseVersion(result.version);
      setBaseline(draft);
      setRequestId(crypto.randomUUID());
      setReason('');
      setFeedback({ tone: 'success', message: `Rascunho versão ${result.version} salvo. Nenhum disparo foi realizado.` });
      await queryClient.invalidateQueries({ queryKey: ['comunicacao', 'automacoes-multicanal'] });
    },
    onError: (error) => setFeedback({
      tone: 'error',
      message: error instanceof Error ? error.message : 'Não foi possível salvar o rascunho.',
    }),
  });

  const toggleStatus = (status: string) => setDraft((current) => ({
    ...current,
    enrollmentStatuses: current.enrollmentStatuses.includes(status)
      ? current.enrollmentStatuses.filter((item) => item !== status)
      : [...current.enrollmentStatuses, status],
  }));

  const toggleRoute = (modality: MultichannelAutomationRoute['modality'], channel: MultichannelAutomationChannel) => setDraft((current) => ({
    ...current,
    routes: current.routes.map((route) => route.modality === modality && route.channel === channel
      ? { ...route, enabled: !route.enabled }
      : route),
  }));

  const updateChannel = (channel: MultichannelAutomationChannel, field: 'titleTemplate' | 'bodyTemplate' | 'deepLink', value: string) => setDraft((current) => ({
    ...current,
    channels: current.channels.map((item) => item.channel === channel ? { ...item, [field]: value } : item) as MultichannelAutomationChannelConfig[],
  }));

  const saveDisabled = saveMutation.isPending
    || !isDirty
    || hasRemoteConflict
    || draft.name.trim().length < 3
    || draft.enrollmentStatuses.length === 0
    || !messagesAreValid
    || reason.trim().length < 3;

  const handleCancel = () => onCancel();

  return (
    <div className="mt-4 rounded-[22px] border border-blue-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Editor de rascunho</p>
          <h4 className="mt-1 text-lg font-black text-[#001a33]">Editando a partir da versão {baseVersion}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-600">Salvar criará a versão {baseVersion + 1}. A regra permanece sem execução.</p>
        </div>
        <button type="button" onClick={handleCancel} className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><X size={15} /> Fechar editor</button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="block text-xs font-black text-slate-600">Nome da regra<input value={draft.name} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-200 px-3 text-sm text-[#001a33] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
        <label className="block text-xs font-black text-slate-600">Descrição<input value={draft.description || ''} maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value || null }))} className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-200 px-3 text-sm text-[#001a33] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div><p className="mb-3 text-xs font-black text-slate-600">Gatilho</p><TriggerEditor trigger={draft.trigger} onChange={(trigger) => setDraft((current) => ({ ...current, trigger }))} /></div>
        <fieldset><legend className="mb-3 text-xs font-black text-slate-600">Situação da matrícula</legend><div className="flex flex-wrap gap-2">{ENROLLMENT_STATUSES.map(([id, label]) => { const checked = draft.enrollmentStatuses.includes(id); return <button key={id} type="button" aria-pressed={checked} onClick={() => toggleStatus(id)} className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3 text-xs font-black ring-1 ${checked ? 'bg-blue-600 text-white ring-blue-600' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>{checked && <Check size={13} />}{label}</button>; })}</div></fieldset>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-black text-slate-600">Cursos e canais</p><p className="mt-1 text-xs text-slate-500">Selecione onde esta regra poderá aparecer quando for publicada no futuro.</p></div><span className="rounded-full bg-[#001a33] px-3 py-1.5 text-xs font-black text-white">{selectedRoutes} combinações</span></div>
        <p className="mb-2 text-xs text-slate-500 sm:hidden">Deslize a matriz para conferir todas as modalidades.</p>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" tabIndex={0} aria-label="Matriz editável de cursos e canais">
          <table className="min-w-[720px] w-full border-collapse">
            <caption className="sr-only">Canais habilitados por modalidade de curso</caption>
            <thead className="bg-slate-50"><tr><th scope="col" className="px-3 py-3 text-left text-xs font-black text-slate-600">Canal</th>{MULTICHANNEL_COURSE_MODALITIES.map((modality) => <th key={modality} scope="col" className="border-l border-slate-200 px-3 py-3 text-xs font-black text-slate-600">{MODALITY_LABELS[modality]}</th>)}</tr></thead>
            <tbody>{MULTICHANNEL_AUTOMATION_CHANNELS.map((channel) => { const ui = CHANNEL_UI[channel]; const Icon = ui.icon; return <tr key={channel} className="border-t border-slate-100"><th scope="row" className="px-3 py-3 text-left"><span className="flex items-center gap-2 text-xs font-black text-[#001a33]"><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${ui.color}`}><Icon size={15} /></span>{ui.label}</span></th>{MULTICHANNEL_COURSE_MODALITIES.map((modality) => { const enabled = draft.routes.some((route) => route.modality === modality && route.channel === channel && route.enabled); return <td key={modality} className="border-l border-slate-100 p-2 text-center"><button type="button" aria-label={`${ui.label} em ${MODALITY_LABELS[modality]}`} aria-pressed={enabled} onClick={() => toggleRoute(modality, channel)} className={`mx-auto flex min-h-[40px] min-w-[74px] items-center justify-center gap-1 rounded-xl px-2 text-xs font-black ring-1 ${enabled ? 'bg-blue-600 text-white ring-blue-600' : 'bg-slate-50 text-slate-500 ring-slate-200'}`}>{enabled && <Check size={13} />}{enabled ? 'Usar' : 'Não usar'}</button></td>; })}</tr>; })}</tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 grid gap-3 xl:grid-cols-3">
        {draft.channels.map((channel) => {
          const ui = CHANNEL_UI[channel.channel];
          const Icon = ui.icon;
          return <fieldset key={channel.channel} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><legend className="px-1 text-xs font-black text-[#001a33]"><span className="inline-flex items-center gap-2"><Icon size={15} className={ui.color.split(' ')[0]} />{ui.label}</span></legend>{channel.channel !== 'whatsapp' && <label className="mt-2 block text-xs font-bold text-slate-600">Título<input value={channel.titleTemplate || ''} maxLength={120} onChange={(event) => updateChannel(channel.channel, 'titleTemplate', event.target.value)} className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>}<label className="mt-3 block text-xs font-bold text-slate-600">Mensagem<textarea value={channel.bodyTemplate} maxLength={8000} rows={5} onChange={(event) => updateChannel(channel.channel, 'bodyTemplate', event.target.value)} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm leading-5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>{channel.channel !== 'whatsapp' && <label className="mt-3 block text-xs font-bold text-slate-600">Destino no app<input value={channel.deepLink || ''} onChange={(event) => updateChannel(channel.channel, 'deepLink', event.target.value)} placeholder="/aluno/comunicacao" className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>}{channel.channel === 'push' && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-violet-700"><BellRing size={14} className="mt-0.5 shrink-0" />Push não aceita dados financeiros nem variáveis na tela bloqueada.</p>}</fieldset>;
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" /><div><p className="text-xs font-black text-amber-950">Motivo obrigatório para auditoria</p><p className="mt-1 text-xs leading-5 text-amber-800">Descreva brevemente por que esta versão está sendo salva.</p></div></div><input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: habilitar aviso de vencimento para cursos EAD" className="mt-3 min-h-[44px] w-full rounded-xl border border-amber-200 bg-white px-3 text-sm text-[#001a33] outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" /></div>

      {hasRemoteConflict && <div role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">Outra pessoa salvou uma nova versão enquanto este editor estava aberto. Copie o que precisar e feche o editor para recarregar antes de salvar.</div>}
      {selectedRoutes === 0 && <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">Nenhuma combinação está selecionada. O rascunho pode ser salvo, mas não alcançará alunos quando a publicação for implementada.</p>}
      {!messagesAreValid && <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">Revise os títulos, destinos internos e mensagens. Notificações no celular não podem conter variáveis.</p>}
      {feedback && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-xs font-bold ${feedback.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{feedback.message}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={handleCancel} disabled={saveMutation.isPending} className="min-h-[44px] rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50">Fechar editor</button><button type="button" onClick={() => saveMutation.mutate()} disabled={saveDisabled} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saveMutation.isPending ? 'Salvando…' : 'Salvar rascunho'}</button></div>
    </div>
  );
};

export default AutomationDraftEditor;
