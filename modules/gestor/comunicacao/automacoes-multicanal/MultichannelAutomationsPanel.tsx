import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BellRing, Cake, Check, ChevronDown, Clock3, CreditCard, Inbox,
  Layers3, MessageCircle, Radio, ReceiptText, RefreshCw, Route,
  ShieldCheck, Sparkles, WalletCards,
} from 'lucide-react';
import { multichannelAutomationService } from './multichannel-automation.service';
import AutomationDraftEditor from './AutomationDraftEditor';
import {
  MultichannelAutomationChannel,
  MultichannelAutomationEvent,
  MultichannelAutomationViewModel,
  MultichannelCourseModality,
} from './multichannel-automation.types';

type CategoryFilter = 'todos' | 'financeiro' | 'relacionamento' | 'academico';

const MODALITIES: Array<{ id: MultichannelCourseModality; label: string }> = [
  { id: 'TECNICO', label: 'Técnico' },
  { id: 'EAD', label: 'EAD' },
  { id: 'LIVRE', label: 'Livres' },
  { id: 'ESPECIALIZACAO', label: 'Especialização' },
  { id: 'SUPERIOR', label: 'Superior' },
];

const CHANNELS: Array<{
  id: MultichannelAutomationChannel;
  label: string;
  compactLabel: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  active: string;
}> = [
  { id: 'app_message', label: 'Mensagem no app', compactLabel: 'App', description: 'Caixa de entrada do aluno', icon: Inbox, accent: 'text-blue-700 bg-blue-50 ring-blue-100', active: 'bg-blue-600 ring-blue-600' },
  { id: 'push', label: 'Notificação no celular', compactLabel: 'Celular', description: 'Alerta que abre o app', icon: BellRing, accent: 'text-violet-700 bg-violet-50 ring-violet-100', active: 'bg-violet-700 ring-violet-700' },
  { id: 'whatsapp', label: 'WhatsApp', compactLabel: 'WhatsApp', description: 'Via API oficial da Meta', icon: MessageCircle, accent: 'text-emerald-700 bg-emerald-50 ring-emerald-100', active: 'bg-emerald-700 ring-emerald-700' },
];

const EVENT_UI: Record<MultichannelAutomationEvent, { eyebrow: string; icon: React.ElementType; accent: string; number: string }> = {
  payment_due: { eyebrow: 'Antes do vencimento', icon: Clock3, accent: 'bg-amber-50 text-amber-700 ring-amber-100', number: '01' },
  payment_received: { eyebrow: 'Após a confirmação', icon: CreditCard, accent: 'bg-emerald-50 text-emerald-700 ring-emerald-100', number: '02' },
  payment_overdue: { eyebrow: 'Parcela vencida', icon: ReceiptText, accent: 'bg-orange-50 text-orange-700 ring-orange-100', number: '03' },
  multiple_overdue: { eyebrow: 'Duas ou mais parcelas', icon: WalletCards, accent: 'bg-rose-50 text-rose-700 ring-rose-100', number: '04' },
  birthday: { eyebrow: 'Relacionamento', icon: Cake, accent: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100', number: '05' },
};

const triggerLabel = (automation: MultichannelAutomationViewModel) => {
  const trigger = automation.trigger;
  switch (trigger.event) {
    case 'payment_due': return `${trigger.daysBefore} dia${trigger.daysBefore === 1 ? '' : 's'} antes, às ${trigger.sendTime}`;
    case 'payment_received': return trigger.delayMinutes > 0 ? `${trigger.delayMinutes} min após a baixa` : 'Assim que o pagamento for confirmado';
    case 'payment_overdue': return `${trigger.daysAfter} dia${trigger.daysAfter === 1 ? '' : 's'} após vencer, às ${trigger.sendTime}`;
    case 'multiple_overdue': return `A partir de ${trigger.minimumInstallments} parcelas, às ${trigger.sendTime}`;
    case 'birthday': return `No dia do aniversário, às ${trigger.sendTime}`;
    default: return 'Gatilho configurado';
  }
};

const enabledRouteCount = (automation: MultichannelAutomationViewModel) => automation.routes.filter((route) => route.enabled).length;

const statusPresentation = (automation: MultichannelAutomationViewModel) => {
  if (automation.executionEnabled) return { label: 'Ativa · disparando', style: 'bg-emerald-50 text-emerald-800 ring-emerald-200' };
  if (automation.status === 'publicada') return { label: 'Publicada · execução desligada', style: 'bg-blue-50 text-blue-800 ring-blue-200' };
  if (automation.status === 'pausada') return { label: 'Pausada · sem disparos', style: 'bg-orange-50 text-orange-800 ring-orange-200' };
  if (automation.status === 'arquivada') return { label: 'Arquivada', style: 'bg-slate-100 text-slate-700 ring-slate-200' };
  return { label: 'Rascunho · sem disparos', style: 'bg-amber-50 text-amber-800 ring-amber-200' };
};

const isRouteEnabled = (automation: MultichannelAutomationViewModel, modality: MultichannelCourseModality, channel: MultichannelAutomationChannel) =>
  automation.routes.some((route) => route.modality === modality && route.channel === channel && route.enabled);

const LoadingState = () => (
  <div className="grid gap-4 p-5 lg:grid-cols-2" role="status" aria-live="polite">
    <span className="sr-only">Carregando automações.</span>
    {[0, 1, 2, 3].map((item) => (
      <div key={item} aria-hidden="true" className="h-56 animate-pulse rounded-[24px] border border-slate-200 bg-white p-5 motion-reduce:animate-none">
        <div className="mb-5 h-11 w-11 rounded-2xl bg-slate-100" />
        <div className="mb-3 h-4 w-32 rounded bg-slate-100" />
        <div className="mb-7 h-7 w-3/5 rounded bg-slate-100" />
        <div className="h-16 rounded-2xl bg-slate-50" />
      </div>
    ))}
  </div>
);

const EmptyState: React.FC<{ actionLabel: string; onAction: () => void; error?: boolean; filtered?: boolean }> = ({ actionLabel, onAction, error = false, filtered = false }) => (
  <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">{error ? <RefreshCw size={24} /> : <Route size={24} />}</div>
    <h3 className="text-lg font-black text-[#001a33]">{error ? 'Não foi possível carregar agora' : filtered ? 'Nenhuma regra neste filtro' : 'Nenhuma automação disponível'}</h3>
    <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{error ? 'A configuração foi preservada. Tente consultar novamente.' : filtered ? 'Escolha outra categoria para continuar.' : 'As regras multicanal aparecerão aqui quando forem preparadas.'}</p>
    <button type="button" onClick={onAction} className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#0f62fe] px-4 text-sm font-bold text-white transition-colors hover:bg-[#074fcf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
      {error && <RefreshCw size={16} />} {actionLabel}
    </button>
  </div>
);

const RouteMatrix: React.FC<{ automation: MultichannelAutomationViewModel }> = ({ automation }) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 sm:hidden">Deslize a tabela para conferir todas as modalidades.</p>
    <div className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500" tabIndex={0} aria-label={`Rotas de ${automation.name}`}>
      <table className="min-w-[720px] w-full border-collapse">
        <caption className="sr-only">Canais e modalidades configurados para {automation.name}</caption>
        <thead className="bg-slate-50/80">
          <tr className="border-b border-slate-200">
            <th scope="col" className="sticky left-0 z-10 w-[210px] bg-slate-50 px-4 py-3 text-left text-xs font-black uppercase tracking-[0.12em] text-slate-600"><span className="flex items-center gap-2"><Route size={14} /> Canal</span></th>
            {MODALITIES.map((modality) => <th key={modality.id} scope="col" className="border-l border-slate-200 px-3 py-3 text-center text-xs font-black text-slate-600">{modality.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {CHANNELS.map((channel, channelIndex) => {
          const Icon = channel.icon;
          return (
            <tr key={channel.id} className={channelIndex < CHANNELS.length - 1 ? 'border-b border-slate-100' : ''}>
              <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3.5 text-left">
                <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${channel.accent}`}><Icon size={15} /></span>
                <div><p className="text-xs font-black text-[#001a33]">{channel.label}</p><p className="mt-0.5 text-xs font-normal text-slate-600">{channel.description}</p></div>
                </div>
              </th>
              {MODALITIES.map((modality) => {
                const enabled = isRouteEnabled(automation, modality.id, channel.id);
                const enabledLabel = channel.id === 'whatsapp' && automation.legacySource ? 'Legado' : 'Selecionado';
                return (
                  <td key={modality.id} className="border-l border-slate-100 px-3 py-3.5 text-center" aria-label={`${modality.label}, ${channel.label}: ${enabled ? enabledLabel : 'não selecionado'}`}>
                    <span aria-hidden="true" className={`mx-auto flex h-8 min-w-[72px] items-center justify-center gap-1.5 rounded-full px-2 text-xs font-black ring-1 ${enabled ? `${channel.active} text-white shadow-sm` : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
                      {enabled ? <Check size={12} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}{enabled ? enabledLabel : 'Não usado'}
                    </span>
                  </td>
                );
              })}
            </tr>
          );
        })}
        </tbody>
      </table>
    </div>
  </div>
);

const ChannelPreviews: React.FC<{ automation: MultichannelAutomationViewModel }> = ({ automation }) => (
  <div className="mt-4 grid gap-3 xl:grid-cols-3">
    {CHANNELS.map((channel) => {
      const config = automation.channels.find((item) => item.channel === channel.id);
      const Icon = channel.icon;
      const enabled = automation.routes.some((route) => route.channel === channel.id && route.enabled);
      const imported = channel.id === 'whatsapp' && Boolean(automation.legacySource);
      const pushContent = config?.channel === 'push' ? `${config.titleTemplate || ''} ${config.bodyTemplate}` : '';
      const pushContentIsPrivate = channel.id !== 'push' || !/(valor|r\$|vencid|atras|parcela|pagamento)/i.test(pushContent);
      return (
        <div key={channel.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${channel.accent}`}><Icon size={16} /></span><div><p className="text-xs font-black text-[#001a33]">{channel.label}</p><p className="text-xs font-bold text-slate-600">Modelo da mensagem</p></div></div>
            <span className={`rounded-full px-2 py-1 text-xs font-black ${enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{imported ? 'Importado' : enabled ? 'Selecionado' : 'Preparado'}</span>
          </div>
          <details className="group">
            <summary className="cursor-pointer list-none text-xs leading-5 text-slate-700 marker:hidden"><span className="line-clamp-3 break-words">{config?.bodyTemplate || 'Modelo preparado para configuração.'}</span><span className="mt-2 inline-block font-bold text-blue-700 group-open:hidden">Ver conteúdo completo</span></summary>
            <p className="mt-2 break-words text-xs leading-5 text-slate-700">{config?.bodyTemplate}</p>
          </details>
          {channel.id === 'push' && <div className={`mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 text-xs font-bold ${pushContentIsPrivate ? 'text-violet-700' : 'text-rose-700'}`}><ShieldCheck size={13} /> {pushContentIsPrivate ? 'Conteúdo adequado para a tela bloqueada' : 'Revise: o texto pode revelar dados na tela bloqueada'}</div>}
        </div>
      );
    })}
  </div>
);

const AutomationCard: React.FC<{ automation: MultichannelAutomationViewModel; expanded: boolean; editing: boolean; onToggle: () => void; onEdit: () => void; onCancelEdit: () => void; onDirtyChange: (dirty: boolean) => void }> = ({ automation, expanded, editing, onToggle, onEdit, onCancelEdit, onDirtyChange }) => {
  const ui = EVENT_UI[automation.event];
  const Icon = ui.icon;
  const enabledCount = enabledRouteCount(automation);
  const enabledChannels = CHANNELS.filter((channel) => automation.routes.some((route) => route.channel === channel.id && route.enabled));
  const triggerId = `automation-trigger-${automation.id}`;
  const panelId = `automation-panel-${automation.id}`;
  const status = statusPresentation(automation);

  return (
    <article className={`overflow-hidden rounded-[26px] border bg-white transition-[border-color,box-shadow] ${expanded ? 'border-blue-200 shadow-[0_18px_50px_rgba(15,98,254,0.10)]' : 'border-slate-200 shadow-[0_8px_24px_rgba(15,23,42,0.035)] hover:border-slate-300'}`}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={panelId} aria-labelledby={triggerId} className="w-full p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0"><span className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${ui.accent}`}><Icon size={21} /></span><span aria-hidden="true" className="absolute -right-2 -top-2 rounded-full bg-[#001a33] px-1.5 py-0.5 text-xs font-black text-white">{ui.number}</span></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-blue-700">{ui.eyebrow}</span><span className={`rounded-full px-2 py-1 text-xs font-black ring-1 ${status.style}`}>{status.label}</span></div>
            <h3 id={triggerId} className="mt-2 text-xl font-black tracking-[-0.025em] text-[#001a33]">{automation.name}</h3>
            {automation.description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{automation.description}</p>}
          </div>
          <span className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500 ring-1 ring-slate-200 transition-transform ${expanded ? 'rotate-180' : ''}`}><ChevronDown size={17} /></span>
        </div>
        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-end">
          <div><p className="mb-1.5 text-xs font-black text-slate-600">Quando acontece</p><p className="flex items-center gap-2 text-xs font-bold text-slate-700"><Clock3 size={14} className="text-blue-600" />{triggerLabel(automation)}</p></div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {enabledChannels.length > 0 ? enabledChannels.map((channel) => { const ChannelIcon = channel.icon; return <span key={channel.id} className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-black ring-1 ${channel.accent}`}><ChannelIcon size={13} />{channel.compactLabel}</span>; }) : <span className="inline-flex h-8 items-center rounded-xl bg-slate-50 px-3 text-xs font-black text-slate-600 ring-1 ring-slate-200">Nenhum canal selecionado</span>}
            <span className="inline-flex h-8 items-center rounded-xl bg-[#001a33] px-3 text-xs font-black text-white">{enabledCount} combinação{enabledCount === 1 ? '' : 'ões'}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div id={panelId} role="region" aria-labelledby={triggerId} className="border-t border-blue-100 bg-[#f7faff] p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-700" /><div><p className="text-xs font-black text-blue-950">Configuração protegida nesta etapa</p><p className="mt-1 text-xs leading-5 text-blue-800/70">Visualização da versão {automation.currentVersion}. Esta tela consulta as regras, mas não executa disparos.</p></div></div>
            {automation.status === 'rascunho' && !automation.executionEnabled ? <button type="button" onClick={editing ? onCancelEdit : onEdit} className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">{editing ? 'Fechar edição' : 'Editar rascunho'}</button> : <span className="whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs font-black text-blue-700 ring-1 ring-blue-200">Somente leitura</span>}
          </div>
          {editing ? <AutomationDraftEditor automation={automation} onCancel={onCancelEdit} onDirtyChange={onDirtyChange} /> : <><RouteMatrix automation={automation} /><ChannelPreviews automation={automation} /></>}
        </div>
      )}
    </article>
  );
};

interface MultichannelAutomationsPanelProps {
  onOpenLegacyWhatsApp?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const MultichannelAutomationsPanel: React.FC<MultichannelAutomationsPanelProps> = ({ onOpenLegacyWhatsApp, onDirtyChange }) => {
  const [category, setCategory] = useState<CategoryFilter>('todos');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const { data: automations = [], isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['comunicacao', 'automacoes-multicanal'],
    queryFn: multichannelAutomationService.list,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const filtered = useMemo(() => automations.filter((item) => category === 'todos' || item.category === category), [automations, category]);
  const enabledRoutes = useMemo(() => automations.reduce((total, item) => total + enabledRouteCount(item), 0), [automations]);
  const enabledChannelCount = useMemo(() => CHANNELS.filter((channel) => automations.some((automation) => automation.routes.some((route) => route.channel === channel.id && route.enabled))).length, [automations]);
  const publishedCount = useMemo(() => automations.filter((automation) => automation.status === 'publicada').length, [automations]);
  const activeCount = useMemo(() => automations.filter((automation) => automation.executionEnabled).length, [automations]);
  const draftCount = useMemo(() => automations.filter((automation) => automation.status === 'rascunho').length, [automations]);
  useEffect(() => {
    onDirtyChange?.(editorDirty);
  }, [editorDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const handleEditorDirtyChange = useCallback((dirty: boolean) => setEditorDirty(dirty), []);
  const confirmEditorExit = () => !editorDirty || window.confirm('Descartar as alterações não salvas deste rascunho?');
  const closeEditor = () => {
    if (!confirmEditorExit()) return;
    setEditingId(null);
    setEditorDirty(false);
  };

  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-[#f3f7fb]" aria-busy={isLoading || isFetching}>
      <div className="relative overflow-hidden border-b border-[#0f2d4c] bg-[#001a33] px-5 py-7 text-white sm:px-7 lg:px-9">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative mx-auto max-w-[1380px]">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 rounded-full bg-blue-500/15 px-3 py-1.5 text-xs font-black text-blue-200 ring-1 ring-inset ring-blue-300/20"><Radio size={13} /> Central de automações</span><span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-slate-200 ring-1 ring-inset ring-white/15"><Layers3 size={13} /> Configuração global · todos os polos</span><span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-3 py-1.5 text-xs font-black text-amber-200 ring-1 ring-inset ring-amber-300/20"><ShieldCheck size={13} /> {draftCount} rascunho{draftCount === 1 ? '' : 's'}</span><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-200 ring-1 ring-inset ring-emerald-300/20"><Radio size={13} /> {activeCount} executando</span>{isFetching && !isLoading && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-200" role="status"><RefreshCw size={13} className="animate-spin motion-reduce:animate-none" /> Atualizando</span>}</div>
              <h2 className="text-3xl font-black tracking-[-0.045em] sm:text-4xl">Uma regra. Vários canais.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-[15px]">Organize mensagens do app, notificações no celular e WhatsApp por evento e modalidade — com uma única visão operacional.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3 sm:gap-3">
              <div className="rounded-2xl bg-white/[0.07] p-3 ring-1 ring-inset ring-white/10 backdrop-blur-sm"><p className="text-2xl font-black">{isLoading ? '—' : automations.length}</p><p className="mt-1 text-xs font-bold text-slate-300">Regras</p></div>
              <div className="rounded-2xl bg-white/[0.07] p-3 ring-1 ring-inset ring-white/10 backdrop-blur-sm"><p className="text-2xl font-black">{isLoading ? '—' : enabledRoutes}</p><p className="mt-1 text-xs font-bold text-slate-300">Combinações</p></div>
              <div className="rounded-2xl bg-white/[0.07] p-3 ring-1 ring-inset ring-white/10 backdrop-blur-sm"><p className="text-2xl font-black">{isLoading ? '—' : enabledChannelCount}<span className="text-sm text-slate-400">/3</span></p><p className="mt-1 text-xs font-bold text-slate-300">Canais selecionados</p></div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1380px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 px-1"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100"><Layers3 size={18} /></span><div><p className="text-sm font-black text-[#001a33]">Jornada de comunicação</p><p className="text-xs text-slate-500">Revise ou edite os rascunhos com execução desligada.</p></div></div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {onOpenLegacyWhatsApp && <button type="button" onClick={() => { if (confirmEditorExit()) { setEditingId(null); onOpenLegacyWhatsApp(); } }} className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
              <MessageCircle size={14} /> Abrir editor antigo do WhatsApp (produção)
            </button>}
            <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1" role="group" aria-label="Filtrar automações">
              {([['todos', 'Todas'], ['financeiro', 'Financeiro'], ['relacionamento', 'Relacionamento'], ...(automations.some((item) => item.category === 'academico') ? [['academico', 'Acadêmico']] : [])] as Array<[CategoryFilter, string]>).map(([id, label]) => <button key={id} type="button" onClick={() => { if (confirmEditorExit()) { setEditingId(null); setCategory(id); } }} aria-pressed={category === id} className={`min-h-[38px] rounded-lg px-2 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-3 ${category === id ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-[#001a33]'}`}>{label}</button>)}
            </div>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">{filtered.length} regra{filtered.length === 1 ? '' : 's'} encontrada{filtered.length === 1 ? '' : 's'}.</p>
        {isLoading ? <LoadingState /> : isError ? <EmptyState error actionLabel="Tentar novamente" onAction={() => refetch()} /> : filtered.length === 0 && automations.length > 0 ? <EmptyState filtered actionLabel="Limpar filtro" onAction={() => setCategory('todos')} /> : filtered.length === 0 ? <EmptyState actionLabel="Atualizar consulta" onAction={() => refetch()} /> : <div className="grid gap-4 xl:gap-5">{filtered.map((automation) => <AutomationCard key={automation.id} automation={automation} expanded={expandedId === automation.id} editing={editingId === automation.id} onToggle={() => { if (!confirmEditorExit()) return; setExpandedId((current) => current === automation.id ? null : automation.id); setEditingId(null); setEditorDirty(false); }} onEdit={() => setEditingId(automation.id)} onCancelEdit={closeEditor} onDirtyChange={handleEditorDirtyChange} />)}</div>}
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 ring-1 ring-blue-100"><Sparkles size={16} /></span><div><p className="text-xs font-black text-blue-950">{activeCount > 0 ? 'Execução protegida' : 'Publicação protegida'}</p><p className="mt-1 text-xs leading-5 text-blue-800/70">{activeCount > 0 ? `${activeCount} regra${activeCount === 1 ? '' : 's'} em execução. Salvar um rascunho não altera a versão ativa.` : 'A edição salva somente rascunhos versionados. Publicação e disparos continuam bloqueados nesta etapa.'}</p></div></div>
          <span className="ml-12 whitespace-nowrap text-xs font-black text-blue-700 sm:ml-0">Publicadas: {publishedCount} · Executando: {activeCount}</span>
        </div>
      </div>
    </section>
  );
};

export default MultichannelAutomationsPanel;
