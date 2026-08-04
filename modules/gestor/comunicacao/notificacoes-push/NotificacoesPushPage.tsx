import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  MapPin,
  Radio,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  UsersRound,
  X,
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { pushNotificationKeys, pushNotificationService } from './notificacoes-push.service';
import type {
  PushAudienceType,
  PushCampaign,
  PushCampaignCategory,
  PushCampaignDraft,
  PushCampaignPreview,
  PushCampaignStatus,
} from './notificacoes-push.types';

const PAGE_SIZE = 12;
const TITLE_LIMIT = 70;
const BODY_LIMIT = 180;

const EMPTY_DRAFT: PushCampaignDraft = {
  title: '',
  body: '',
  category: 'institutional',
  deepLink: '/aluno/',
  audienceType: 'all',
  poloId: null,
  turmaId: null,
  scheduledAt: null,
};

const categoryOptions: Array<{ value: PushCampaignCategory; label: string }> = [
  { value: 'institutional', label: 'Institucional' },
  { value: 'academic', label: 'Acadêmica' },
  { value: 'service', label: 'Atendimento' },
  { value: 'financial', label: 'Financeira (texto privado)' },
  { value: 'marketing', label: 'Campanha e divulgação' },
];

const destinationOptions = [
  { value: '/aluno/', label: 'Início do aplicativo' },
  { value: '/aluno/comunicacao', label: 'Comunicação e conversas' },
  { value: '/aluno/?module=calendario', label: 'Calendário e aulas' },
  { value: '/aluno/?module=financeiro', label: 'Financeiro' },
];

const statusOptions: Array<{ value: PushCampaignStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos os status' },
  { value: 'scheduled', label: 'Agendadas' },
  { value: 'queued', label: 'Na fila' },
  { value: 'processing', label: 'Processando' },
  { value: 'completed', label: 'Concluídas' },
  { value: 'partial', label: 'Parciais' },
  { value: 'failed', label: 'Com falha' },
  { value: 'cancelled', label: 'Canceladas' },
];

const statusUi: Record<PushCampaignStatus, { label: string; style: string }> = {
  draft: { label: 'Rascunho', style: 'bg-slate-100 text-slate-700' },
  scheduled: { label: 'Agendada', style: 'bg-blue-50 text-blue-700' },
  queued: { label: 'Na fila', style: 'bg-amber-50 text-amber-700' },
  processing: { label: 'Processando', style: 'bg-violet-50 text-violet-700' },
  completed: { label: 'Concluída', style: 'bg-emerald-50 text-emerald-700' },
  partial: { label: 'Entrega parcial', style: 'bg-orange-50 text-orange-700' },
  failed: { label: 'Falha', style: 'bg-rose-50 text-rose-700' },
  cancelled: { label: 'Cancelada', style: 'bg-slate-100 text-slate-500' },
};

const sensitivePattern = /(r\$|\d+[,.]\d{2}|boleto|pix|valor|vencid|atras|parcela|pagamento|inadimpl|mensalidade|saldo|cobran[çc]a|cart[aã]o|cpf|cnpj|matr[ií]cula|e-?mail|telefone|celular|senha|token|documento|\{\{|[\w.%+-]+@[\w.-]+\.[a-z]{2,})/i;

type PushConfirmation = {
  draft: PushCampaignDraft;
  preview: PushCampaignPreview;
  requestIds: { create: string; enqueue: string };
};

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : 'Envio imediato';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';

const randomId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const PushPhonePreview = ({ draft }: { draft: PushCampaignDraft }) => (
  <div className="relative mx-auto w-full max-w-[310px] overflow-hidden rounded-[34px] border-[7px] border-[#06182a] bg-[linear-gradient(155deg,#0b2e51,#001a33_55%,#103d69)] p-3 shadow-[0_24px_55px_rgba(0,26,51,.25)]">
    <div className="mx-auto mb-5 h-5 w-24 rounded-b-2xl bg-[#06182a]" />
    <p className="px-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">Tela bloqueada</p>
    <div className="mt-2 rounded-[22px] bg-white/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#001a33] text-white"><BellRing size={15} /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Universo · agora</p><p className="mt-1 break-words text-sm font-black leading-5 text-[#001a33]">{draft.title.trim() || 'Título da notificação'}</p></div>
      </div>
      <p className="mt-3 break-words text-xs font-medium leading-5 text-slate-600">{draft.body.trim() || 'A mensagem aparecerá aqui exatamente como o aluno verá no celular.'}</p>
    </div>
    <div className="h-24" />
    <div className="mx-auto h-1 w-24 rounded-full bg-white/50" />
  </div>
);

interface ConfirmationModalProps {
  draft: PushCampaignDraft;
  preview: PushCampaignPreview;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmationModal = ({ draft, preview, pending, onCancel, onConfirm }: ConfirmationModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="push-confirm-title">
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/20 bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
        <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700"><ShieldCheck size={21} /></span><div><h2 id="push-confirm-title" className="text-xl font-black text-[#001a33]">Confirmar {draft.scheduledAt ? 'agendamento' : 'envio'}</h2><p className="mt-1 text-sm font-medium text-slate-500">Confira público, conteúdo e horário. Esta confirmação cria e enfileira a campanha.</p></div></div>
        <button type="button" onClick={onCancel} disabled={pending} aria-label="Fechar confirmação" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Público</p><p className="mt-2 font-black text-[#001a33]">{preview.audienceLabel}</p><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-white p-3"><p className="text-xl font-black text-blue-700">{preview.eligibleUsers}</p><p className="text-xs font-bold text-slate-500">alunos elegíveis</p></div><div className="rounded-xl bg-white p-3"><p className="text-xl font-black text-violet-700">{preview.eligibleDevices}</p><p className="text-xs font-bold text-slate-500">dispositivos</p></div></div></div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Plataformas</p><div className="mt-3 flex items-center justify-between rounded-xl bg-white p-3 text-sm font-bold text-slate-600"><span>Android</span><strong className="text-[#001a33]">{preview.androidDevices}</strong></div><div className="mt-2 flex items-center justify-between rounded-xl bg-white p-3 text-sm font-bold text-slate-600"><span>iPhone</span><strong className="text-[#001a33]">{preview.iosDevices}</strong></div></div>
        <div className="sm:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-blue-600">Mensagem</p><p className="mt-2 font-black text-blue-950">{draft.title}</p><p className="mt-1 text-sm leading-6 text-blue-900/75">{draft.body}</p><p className="mt-3 flex items-center gap-2 text-xs font-bold text-blue-700"><CalendarClock size={14} /> {formatDate(draft.scheduledAt)}</p></div>
        {preview.warnings.map((warning) => <div key={warning} className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{warning}</div>)}
        {preview.blockedReason && <div className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{preview.blockedReason}</div>}
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 p-5 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} disabled={pending} className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-50">Voltar e revisar</button><button type="button" onClick={onConfirm} disabled={pending || Boolean(preview.blockedReason) || preview.eligibleDevices === 0 || !preview.validationToken} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0f62fe] px-5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45">{pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}{draft.scheduledAt ? 'Confirmar agendamento' : 'Confirmar e enfileirar'}</button></div>
    </div>
  </div>
);

const HistoryCard: React.FC<{ campaign: PushCampaign }> = ({ campaign }) => {
  const status = statusUi[campaign.status] || statusUi.draft;
  const handled = campaign.sentCount + campaign.failedCount + campaign.skippedCount;
  const progress = campaign.eligibleDevices > 0 ? Math.min(100, Math.round((handled / campaign.eligibleDevices) * 100)) : 0;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${status.style}`}>{status.label}</span><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{campaign.audienceLabel}</span></div><h3 className="mt-2 truncate text-sm font-black text-[#001a33]">{campaign.title}</h3><p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-500">{campaign.body}</p></div><p className="shrink-0 text-xs font-bold text-slate-500">{formatDate(campaign.scheduledAt || campaign.createdAt)}</p></div>
      <div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-emerald-50 px-3 py-2"><p className="text-lg font-black text-emerald-700">{campaign.sentCount}</p><p className="text-[10px] font-bold text-emerald-700/70">enviadas</p></div><div className="rounded-xl bg-rose-50 px-3 py-2"><p className="text-lg font-black text-rose-700">{campaign.failedCount}</p><p className="text-[10px] font-bold text-rose-700/70">falhas</p></div><div className="rounded-xl bg-slate-100 px-3 py-2"><p className="text-lg font-black text-slate-700">{campaign.skippedCount}</p><p className="text-[10px] font-bold text-slate-500">ignoradas</p></div></div>
      {['queued', 'processing', 'partial'].includes(campaign.status) && <div className="mt-4"><div className="mb-1.5 flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-400"><span>Processamento</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div></div>}
      <p className="mt-3 text-[10px] font-bold text-slate-400">Criada por {campaign.createdByName || 'Gestor'} · {campaign.eligibleDevices} dispositivo{campaign.eligibleDevices === 1 ? '' : 's'} elegível{campaign.eligibleDevices === 1 ? '' : 'eis'}</p>
    </article>
  );
};

const NotificacoesPushPage = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [draft, setDraft] = useState<PushCampaignDraft>(EMPTY_DRAFT);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleLocal, setScheduleLocal] = useState('');
  const [confirmation, setConfirmation] = useState<PushConfirmation | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<PushCampaignStatus | 'all'>('all');
  const [page, setPage] = useState(1);

  const listParams = useMemo(() => ({ status, search: deferredSearch, page, pageSize: PAGE_SIZE }), [status, deferredSearch, page]);
  const segmentsQuery = useQuery({ queryKey: pushNotificationKeys.segments, queryFn: pushNotificationService.listSegments, staleTime: 5 * 60_000 });
  const campaignsQuery = useQuery({ queryKey: pushNotificationKeys.campaigns(listParams), queryFn: () => pushNotificationService.listCampaigns(listParams), placeholderData: (previous) => previous, staleTime: 20_000, refetchInterval: 60_000 });

  useEffect(() => setPage(1), [deferredSearch, status]);
  useEffect(() => {
    const channel = supabase.channel('comunicacao-push-campanhas-ui')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comunicacao_push_campanha_eventos' }, () => { void queryClient.invalidateQueries({ queryKey: pushNotificationKeys.all }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);

  const previewMutation = useMutation({
    mutationFn: pushNotificationService.previewCampaign,
    onSuccess: (result, reviewedDraft) => {
      setConfirmation({
        draft: reviewedDraft,
        preview: result,
        requestIds: { create: randomId(), enqueue: randomId() },
      });
    },
    onError: (error) => toast.error('Prévia indisponível', errorMessage(error)),
  });
  const sendMutation = useMutation({
    mutationFn: async ({ currentDraft, currentPreview, requestIds }: { currentDraft: PushCampaignDraft; currentPreview: PushCampaignPreview; requestIds: { create: string; enqueue: string } }) => {
      const created = await pushNotificationService.createCampaign({ ...currentDraft, previewToken: currentPreview.validationToken, requestId: requestIds.create });
      return pushNotificationService.enqueueCampaign(created.id, requestIds.enqueue);
    },
    onSuccess: (result) => {
      setConfirmation(null);
      setDraft(EMPTY_DRAFT);
      setScheduleEnabled(false);
      setScheduleLocal('');
      void queryClient.invalidateQueries({ queryKey: pushNotificationKeys.all });
      toast.success(result.status === 'scheduled' ? 'Notificação agendada' : 'Notificação enfileirada', 'O histórico será atualizado automaticamente conforme o processamento.');
    },
    onError: (error) => toast.error('Não foi possível confirmar', errorMessage(error)),
  });

  const localPrivacyBlocked = sensitivePattern.test(`${draft.title} ${draft.body}`);
  const invalidAudience = (draft.audienceType === 'polo' && !draft.poloId) || (draft.audienceType === 'turma' && !draft.turmaId);
  const scheduledAt = scheduleEnabled && scheduleLocal ? new Date(scheduleLocal).toISOString() : null;
  const invalidSchedule = scheduleEnabled && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now());
  const canPreview = draft.title.trim().length >= 3 && draft.body.trim().length >= 5 && !invalidAudience && !invalidSchedule && !previewMutation.isPending && !segmentsQuery.isError;
  const total = campaignsQuery.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const updateAudience = (audienceType: PushAudienceType) => setDraft((current) => ({ ...current, audienceType, poloId: null, turmaId: null }));
  const requestPreview = () => {
    if (!canPreview) return;
    previewMutation.mutate({ ...draft, scheduledAt });
  };

  return (
    <div className="animate-fadeIn space-y-6">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <header className="relative overflow-hidden rounded-[2rem] bg-[#001a33] p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_85%_10%,rgba(124,58,237,.75),transparent_28%),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:auto,30px_30px,30px_30px]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-3 flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 rounded-full bg-violet-400/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-violet-200 ring-1 ring-inset ring-violet-300/20"><BellRing size={14} /> Notificações e Push</span><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-200 ring-1 ring-inset ring-emerald-300/20"><Radio size={11} /> Histórico em tempo real</span></div><h1 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Fale com o aplicativo.</h1><p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-300">Envie comunicados personalizados com segmentação por polo ou turma, confirmação de audiência e conteúdo protegido para a tela bloqueada.</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-inset ring-white/10"><p className="text-2xl font-black">{segmentsQuery.data?.polos.length ?? '—'}</p><p className="mt-1 text-xs font-bold text-slate-300">Polos disponíveis</p></div><div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-inset ring-white/10"><p className="text-2xl font-black">{segmentsQuery.data?.turmas.length ?? '—'}</p><p className="mt-1 text-xs font-bold text-slate-300">Turmas disponíveis</p></div></div></div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:p-6"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Send size={18} /></span><div><h2 className="text-lg font-black text-[#001a33]">Nova mensagem personalizada</h2><p className="mt-1 text-xs font-medium text-slate-500">Nenhum envio ocorre antes da tela de confirmação.</p></div></div></div>
          <div className="space-y-6 p-5 sm:p-6">
            <fieldset><legend className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">1. Quem recebe</legend><div className="grid gap-2 sm:grid-cols-3">{([{ id: 'all', label: 'Todos', icon: UsersRound }, { id: 'polo', label: 'Por polo', icon: MapPin }, { id: 'turma', label: 'Por turma', icon: UsersRound }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => updateAudience(id)} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition ${draft.audienceType === id ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/15' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-200 hover:bg-blue-50'}`}><Icon size={15} />{label}</button>)}</div>
              {draft.audienceType === 'polo' && <select value={draft.poloId || ''} onChange={(event) => setDraft((current) => ({ ...current, poloId: event.target.value || null }))} className="mt-3 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"><option value="">Selecione o polo</option>{(segmentsQuery.data?.polos || []).map((polo) => <option key={polo.id} value={polo.id}>{polo.nome} · {polo.eligibleDevices} dispositivo(s)</option>)}</select>}
              {draft.audienceType === 'turma' && <select value={draft.turmaId || ''} onChange={(event) => setDraft((current) => ({ ...current, turmaId: event.target.value || null }))} className="mt-3 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"><option value="">Selecione a turma</option>{(segmentsQuery.data?.turmas || []).map((turma) => <option key={turma.id} value={turma.id}>{turma.nome}{turma.poloNome ? ` · ${turma.poloNome}` : ''} · {turma.eligibleDevices} dispositivo(s)</option>)}</select>}
              {segmentsQuery.isError && <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{errorMessage(segmentsQuery.error)}</p>}
            </fieldset>

            <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">2. Conteúdo e destino</legend><label className="block text-xs font-bold text-slate-600">Categoria<select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as PushCampaignCategory }))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50">{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="block text-xs font-bold text-slate-600">Abrir no aplicativo<select value={draft.deepLink} onChange={(event) => setDraft((current) => ({ ...current, deepLink: event.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50">{destinationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="block text-xs font-bold text-slate-600 sm:col-span-2">Título<div className="relative mt-2"><input value={draft.title} maxLength={TITLE_LIMIT} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Comunicado importante" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 pr-16 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50" /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">{draft.title.length}/{TITLE_LIMIT}</span></div></label><label className="block text-xs font-bold text-slate-600 sm:col-span-2">Mensagem<div className="relative mt-2"><textarea value={draft.body} maxLength={BODY_LIMIT} rows={4} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} placeholder="Escreva uma mensagem curta e objetiva. Os detalhes ficam dentro do aplicativo." className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 pb-8 text-sm font-medium leading-6 text-slate-700 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50" /><span className="absolute bottom-3 right-4 text-[10px] font-black text-slate-400">{draft.body.length}/{BODY_LIMIT}</span></div></label></fieldset>

            <div className={`flex items-start gap-3 rounded-2xl border p-4 ${localPrivacyBlocked ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-emerald-100 bg-emerald-50 text-emerald-800'}`}>{localPrivacyBlocked ? <AlertTriangle size={18} className="mt-0.5 shrink-0" /> : <ShieldCheck size={18} className="mt-0.5 shrink-0" />}<div><p className="text-xs font-black">{localPrivacyBlocked ? 'A checagem preliminar encontrou conteúdo sensível' : 'Nenhum indicador sensível encontrado nesta checagem preliminar'}</p><p className="mt-1 text-xs font-medium leading-5 opacity-80">{localPrivacyBlocked ? 'Revise valores, cobrança, documentos, contatos ou credenciais. A validação definitiva será feita pelo servidor antes de qualquer envio.' : 'A validação definitiva de privacidade ainda será executada pelo servidor na próxima etapa.'}</p></div></div>

            <fieldset><legend className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">3. Quando enviar</legend><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setScheduleEnabled(false)} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border text-xs font-black ${!scheduleEnabled ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}><Send size={14} />Assim que confirmar</button><button type="button" onClick={() => setScheduleEnabled(true)} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border text-xs font-black ${scheduleEnabled ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}><CalendarClock size={14} />Agendar data e hora</button></div>{scheduleEnabled && <input type="datetime-local" value={scheduleLocal} onChange={(event) => setScheduleLocal(event.target.value)} className="mt-3 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />}{invalidSchedule && <p className="mt-2 text-xs font-bold text-rose-600">Escolha um horário futuro.</p>}</fieldset>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-start gap-2 text-xs font-medium leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-blue-600" />A audiência será recalculada no servidor antes da confirmação.</p><button type="button" onClick={requestPreview} disabled={!canPreview} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-6 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-blue-950/10 hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-40">{previewMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}Revisar e confirmar</button></div>
          </div>
        </div>
        <aside className="self-start xl:sticky xl:top-6"><PushPhonePreview draft={draft} /><div className="mx-auto mt-4 max-w-[310px] rounded-2xl border border-violet-100 bg-violet-50 p-4"><p className="flex items-center gap-2 text-xs font-black text-violet-900"><Smartphone size={15} />Android e iPhone</p><p className="mt-2 text-xs font-medium leading-5 text-violet-800/75">A mesma campanha será entregue pelo FCM. Apenas aparelhos ativos, consentidos e vinculados ao público selecionado entram na fila.</p></div></aside>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[#f7f9fb] shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-white p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><History size={18} /></span><div><h2 className="text-lg font-black text-[#001a33]">Histórico de notificações</h2><p className="mt-1 text-xs font-medium text-slate-500">Status, processamento e resultados são sincronizados automaticamente.</p></div></div><div className="grid gap-2 sm:grid-cols-[minmax(230px,1fr)_190px]"><label className="relative"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar título ou mensagem" className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:bg-white" /></label><select value={status} onChange={(event) => setStatus(event.target.value as PushCampaignStatus | 'all')} className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></div>
        {campaignsQuery.isLoading ? <div className="flex min-h-64 items-center justify-center" role="status"><Loader2 size={28} className="animate-spin text-blue-600" /><span className="sr-only">Carregando histórico</span></div> : campaignsQuery.isError ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><AlertTriangle size={32} className="text-rose-500" /><h3 className="mt-3 font-black text-[#001a33]">Histórico indisponível</h3><p className="mt-2 max-w-lg text-sm font-medium leading-6 text-slate-500">{errorMessage(campaignsQuery.error)}</p></div> : !campaignsQuery.data?.rows.length ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><BellRing size={36} className="text-slate-300" /><h3 className="mt-3 font-black text-[#001a33]">Nenhuma notificação encontrada</h3><p className="mt-1 text-sm font-medium text-slate-500">Os envios confirmados e agendados aparecerão aqui.</p></div> : <div className="grid gap-3 p-4 lg:grid-cols-2 lg:p-5">{campaignsQuery.data.rows.map((campaign) => <HistoryCard key={campaign.id} campaign={campaign} />)}</div>}
        <footer className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-bold text-slate-500">{total ? `${total} campanha${total === 1 ? '' : 's'}` : 'Nenhum resultado'}{campaignsQuery.isFetching && !campaignsQuery.isLoading ? <span className="ml-2 inline-flex items-center gap-1 text-blue-600"><Radio size={10} /> Sincronizando</span> : null}</p><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label="Página anterior" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-40"><ChevronLeft size={17} /></button><span className="min-w-24 text-center text-xs font-black text-slate-600">{page} de {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} aria-label="Próxima página" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-40"><ChevronRight size={17} /></button></div></footer>
      </section>

      {confirmation && <ConfirmationModal draft={confirmation.draft} preview={confirmation.preview} pending={sendMutation.isPending} onCancel={() => setConfirmation(null)} onConfirm={() => sendMutation.mutate({ currentDraft: confirmation.draft, currentPreview: confirmation.preview, requestIds: confirmation.requestIds })} />}
    </div>
  );
};

export default NotificacoesPushPage;
