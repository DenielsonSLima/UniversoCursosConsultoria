import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Activity from 'lucide-react/dist/esm/icons/activity';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import Gauge from 'lucide-react/dist/esm/icons/gauge';
import LockKeyhole from 'lucide-react/dist/esm/icons/lock-keyhole';
import PauseCircle from 'lucide-react/dist/esm/icons/pause-circle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import Zap from 'lucide-react/dist/esm/icons/zap';
import { supabase } from '../../../../lib/supabase';
import {
  banesePollingQueryKey,
  consultaApiBaneseService,
} from './consulta-api-banese.service';
import { BaneseRunsPanel } from './BaneseRunsPanel';
import {
  profileOperationalExample,
  profileScaleExample,
} from './banese-profile-examples';
import type {
  BanesePollingAttempt,
  BanesePollingMode,
} from './consulta-api-banese.types';

type TabId = 'overview' | 'profiles' | 'runs' | 'queries' | 'settlements' | 'errors' | 'audit';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'profiles', label: 'Perfis' },
  { id: 'runs', label: 'Execuções' },
  { id: 'queries', label: 'Consultas' },
  { id: 'settlements', label: 'Baixas' },
  { id: 'errors', label: 'Erros' },
  { id: 'audit', label: 'Auditoria' },
];

const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Maceio',
  }).format(new Date(value))
  : 'Ainda não registrado';

const duration = (milliseconds?: number | null) => {
  if (milliseconds === null || milliseconds === undefined) return '—';
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
};

const statusTone = (status: string) => {
  if (['SUCCESS', 'PAID', 'STABLE'].includes(status)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (['FAILED', 'ERROR', 'SUSPENDED', 'THROTTLED'].includes(status)) return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const StatusPill = ({ value }: { value: string }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${statusTone(value)}`}>
    {value}
  </span>
);

const AttemptsTable = ({ attempts }: { attempts: BanesePollingAttempt[] }) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200">
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
          <tr>
            <th className="px-4 py-3">Horário</th>
            <th className="px-4 py-3">Modalidade</th>
            <th className="px-4 py-3">Resultado</th>
            <th className="px-4 py-3">Situação remota</th>
            <th className="px-4 py-3">Classe segura</th>
            <th className="px-4 py-3">Duração</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {attempts.map((attempt) => (
            <tr key={attempt.id} className="text-slate-600">
              <td className="whitespace-nowrap px-4 py-3 font-bold">{dateTime(attempt.created_at)}</td>
              <td className="px-4 py-3 font-black text-[#001a33]">{attempt.modality}</td>
              <td className="px-4 py-3"><StatusPill value={attempt.result} /></td>
              <td className="px-4 py-3">{attempt.remote_status || '—'}</td>
              <td className="px-4 py-3">{attempt.error_class || '—'}{attempt.http_status ? ` (${attempt.http_status})` : ''}</td>
              <td className="px-4 py-3">{duration(attempt.duration_ms)}</td>
            </tr>
          ))}
          {!attempts.length ? (
            <tr><td colSpan={6} className="px-4 py-10 text-center font-semibold text-slate-400">Nenhuma consulta neste filtro.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  </div>
);

const ConsultaApiBaneseConfig = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [draftMode, setDraftMode] = useState<BanesePollingMode>('AUTOMATIC');
  const [draftProfile, setDraftProfile] = useState(6);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const dashboardQuery = useQuery({
    queryKey: banesePollingQueryKey,
    queryFn: consultaApiBaneseService.getDashboard,
    refetchInterval: 30_000,
  });
  const dashboard = dashboardQuery.data;
  const config = dashboard?.config;
  const errorSummaryQuery = useQuery({
    queryKey: [...banesePollingQueryKey, 'error-summary'],
    queryFn: consultaApiBaneseService.getErrorSummary,
    enabled: dashboard?.available === true,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!config) return;
    setDraftMode(config.mode);
    setDraftProfile(config.selected_profile_id);
  }, [config?.mode, config?.selected_profile_id]);

  useEffect(() => {
    const channel = supabase
      .channel('config-consulta-api-banese')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'banese_reconciliation_config' }, () => {
        void queryClient.invalidateQueries({ queryKey: banesePollingQueryKey });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'banese_reconciliation_runs' }, () => {
        void queryClient.invalidateQueries({ queryKey: banesePollingQueryKey });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'banese_reconciliation_transitions' }, () => {
        void queryClient.invalidateQueries({ queryKey: banesePollingQueryKey });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const updateMutation = useMutation({
    mutationFn: () => consultaApiBaneseService.updateConfig({
      mode: draftMode,
      profileId: draftProfile,
      expectedVersion: config?.version || 0,
      reason,
    }),
    onSuccess: async () => {
      setFeedback('Configuração salva e registrada na auditoria.');
      setReason('');
      await queryClient.invalidateQueries({ queryKey: banesePollingQueryKey });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : 'Não foi possível salvar.'),
  });

  const attempts = dashboard?.lastAttempts || [];
  const filteredAttempts = useMemo(() => {
    if (activeTab === 'settlements') return attempts.filter((item) => item.result === 'PAID');
    if (activeTab === 'errors') return attempts.filter((item) => ['ERROR', 'THROTTLED'].includes(item.result));
    return attempts;
  }, [activeTab, attempts]);

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-3 text-sm font-bold text-slate-500">
        <RefreshCw className="animate-spin" size={18} /> Carregando operação Banese...
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="font-black">Não foi possível carregar a Consulta API Banese.</p>
        <p className="mt-1 text-sm font-semibold">{dashboardQuery.error instanceof Error ? dashboardQuery.error.message : 'Tente novamente.'}</p>
      </div>
    );
  }

  if (!dashboard?.available || !config) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <p className="font-black">Banese não é o provedor responsável no ambiente atual.</p>
        <p className="mt-1 text-sm font-semibold">O painel fica disponível somente quando uma rota Banese estiver ativa.</p>
      </div>
    );
  }

  const profiles = dashboard.profiles || [];
  const queue = dashboard.queue || { ready: 0, leased: 0, eadReady: 0, quarantined: 0 };
  const effective = profiles.find((profile) => profile.id === config.effective_profile_id);
  const ceiling = profiles.find((profile) => profile.id === config.selected_profile_id);
  const previousTransition = dashboard.transitions?.find((transition) => (
    transition.from_profile_id
    && transition.to_profile_id === config.effective_profile_id
    && transition.from_profile_id !== transition.to_profile_id
  ));
  const previousProfileId = previousTransition?.from_profile_id;
  const errorSummary = errorSummaryQuery.data;
  const recentErrors = errorSummary?.lastErrors || [];
  const recentErrorCount = errorSummary?.attemptsLastHour || 0;
  const errorSummaryUnavailable = errorSummaryQuery.isError;
  const hasChanges = draftMode !== config.mode || draftProfile !== config.selected_profile_id;

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-[2rem] bg-[#001a33] text-white shadow-xl shadow-blue-950/10">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200">
                Ambiente {dashboard.environment === 'production' ? 'Produção' : 'Homologação'}
              </span>
              <StatusPill value={config.state} />
            </div>
            <h2 className="mt-4 text-3xl font-black uppercase tracking-tight">Consulta API Banese</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-300">
              Confirma pagamentos de títulos já emitidos, prioriza EAD e ajusta o ritmo com rollback automático.
              Este módulo não cria, reemite, cancela nem gera cobranças.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Anterior</p>
                <p className="mt-1 text-xl font-black text-slate-200">{previousProfileId ? `P${previousProfileId}` : '—'}</p>
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-wider text-blue-200">Teto configurado</p>
                <p className="mt-1 text-xl font-black text-blue-200">P{config.selected_profile_id}</p>
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-wider text-emerald-200">Efetivo agora</p>
                <p className="mt-1 text-3xl font-black text-emerald-300">P{config.effective_profile_id}</p>
              </div>
            </div>
            <p className="mt-3 text-sm font-black text-white">{effective?.name} • {effective?.titles_per_minute || 0} títulos/min</p>
            <p className="mt-2 border-t border-white/10 pt-3 text-[11px] font-semibold leading-relaxed text-slate-300">
              Exemplo real: {profileOperationalExample(effective, 20)}
            </p>
            <p className="mt-1 text-[9px] font-bold text-slate-400">Estimativa de capacidade; não é prazo de compensação nem SLA do Banese.</p>
          </div>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Seções da consulta Banese">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-11 shrink-0 rounded-xl px-4 text-[10px] font-black uppercase tracking-wider transition ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-md'
                : 'border border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Fila pronta', value: queue.ready, icon: Clock3, tone: 'text-blue-700 bg-blue-50' },
              { label: 'EAD prioritário', value: queue.eadReady, icon: Zap, tone: 'text-emerald-700 bg-emerald-50' },
              { label: 'Em consulta', value: queue.leased, icon: Activity, tone: 'text-violet-700 bg-violet-50' },
              { label: 'Em revisão', value: queue.quarantined, icon: AlertTriangle, tone: 'text-amber-700 bg-amber-50' },
            ].map(({ label, value, icon: Icon, tone }) => (
              <article key={label} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}><Icon size={20} /></div>
                <p className="mt-4 text-3xl font-black text-[#001a33]">{value}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-600">Exemplo do seletor atual</p>
              <h3 className="mt-2 text-lg font-black">
                {config.mode === 'AUTOMATIC'
                  ? `Automático: P${config.effective_profile_id} agora, teto P${config.selected_profile_id}`
                  : config.mode === 'MANUAL'
                    ? `Manual: P${config.effective_profile_id}`
                    : `Pausado no P${config.effective_profile_id}`}
              </h3>
              <p className="mt-2 text-xs font-semibold leading-relaxed">
                {config.mode === 'AUTOMATIC'
                  ? `O marcador acompanha o perfil efetivo. O sistema pode avançar gradualmente até ${ceiling?.name || `P${config.selected_profile_id}`} e recua se detectar erro ou HTTP 429.`
                  : config.mode === 'MANUAL'
                    ? 'O perfil escolhido é aplicado diretamente e permanece fixo até nova alteração auditada.'
                    : 'Nenhum novo título é reservado enquanto a operação estiver pausada.'}
              </p>
              <p className="mt-3 rounded-2xl bg-white/70 p-3 text-xs font-bold leading-relaxed">
                {profileOperationalExample(effective, Math.max(queue.ready, 20))}
              </p>
            </article>

            <article className={`rounded-3xl border p-5 ${
              errorSummaryUnavailable
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : recentErrorCount
                  ? 'border-red-200 bg-red-50 text-red-950'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-950'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Logs de erro • última hora</p>
                  <h3 className="mt-2 text-lg font-black">
                    {errorSummaryUnavailable
                      ? 'Resumo temporariamente indisponível'
                      : recentErrorCount
                        ? `${recentErrorCount} falha(s) recente(s)`
                        : 'Nenhuma falha recente'}
                  </h3>
                </div>
                {errorSummaryUnavailable || recentErrorCount ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
              </div>
              <div className="mt-3 space-y-2">
                {!errorSummaryUnavailable ? recentErrors.map((error) => (
                  <div key={error.id} className="rounded-xl bg-white/70 px-3 py-2 text-[11px] font-semibold">
                    <span className="font-black">{error.error_class || error.result}</span>
                    {error.http_status ? ` • HTTP ${error.http_status}` : ''} • {dateTime(error.created_at)}
                  </div>
                )) : null}
                {errorSummaryUnavailable ? (
                  <p className="text-xs font-semibold">Não foi possível confirmar a saúde das consultas agora. A tela tentará novamente automaticamente.</p>
                ) : !recentErrorCount ? (
                  <p className="text-xs font-semibold">As consultas recentes não registraram ERROR nem THROTTLED.</p>
                ) : null}
              </div>
            </article>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <Gauge className="text-blue-600" size={22} />
                <div>
                  <h3 className="font-black text-[#001a33]">Controle operacional</h3>
                  <p className="text-xs font-semibold text-slate-500">O teto é escolhido por você; o automático define o perfil efetivo.</p>
                </div>
              </div>
              <fieldset className="mt-5">
                <legend className="text-[10px] font-black uppercase tracking-widest text-slate-400">Modo</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {([
                    ['AUTOMATIC', 'Automático'],
                    ['MANUAL', 'Manual'],
                    ['PAUSED', 'Pausado'],
                  ] as Array<[BanesePollingMode, string]>).map(([value, label]) => (
                    <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-black ${
                      draftMode === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
                    }`}>
                      <input type="radio" name="banese-mode" value={value} checked={draftMode === value} onChange={() => setDraftMode(value)} />
                      {value === 'PAUSED' ? <PauseCircle size={15} /> : <Activity size={15} />}
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {draftMode === 'AUTOMATIC' ? (
                <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Teto máximo do automático
                  <select
                    value={draftProfile}
                    onChange={(event) => setDraftProfile(Number(event.target.value))}
                    className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black normal-case tracking-normal text-[#001a33] outline-none focus:border-blue-500"
                  >
                    {profiles.filter((profile) => profile.selectable).map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        P{profile.id} — {profile.name} • {profile.titles_per_minute}/min ({profile.titles_per_minute * 5} a cada 5 min)
                      </option>
                    ))}
                  </select>
                  <span className="mt-2 block text-[11px] font-semibold normal-case tracking-normal text-slate-500">
                    O teto não é o perfil atual. O automático começa no efetivo e só avança após estabilidade.
                  </span>
                </label>
              ) : null}
              <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                Motivo da alteração
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ex.: iniciar operação gradual após homologação interna"
                  maxLength={300}
                  className="mt-2 min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold normal-case tracking-normal text-slate-700 outline-none focus:border-blue-500"
                />
              </label>
              <button
                type="button"
                disabled={!hasChanges || reason.trim().length < 5 || updateMutation.isPending}
                onClick={() => {
                  setFeedback('');
                  updateMutation.mutate();
                }}
                className="mt-3 min-h-11 w-full rounded-xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {updateMutation.isPending ? 'Salvando...' : 'Salvar com auditoria'}
              </button>
              <p className="mt-2 text-xs font-semibold text-slate-500" aria-live="polite">{feedback}</p>
            </div>

            <div className="space-y-4">
              <article className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
                <div className="flex gap-3"><ShieldCheck className="shrink-0" size={22} /><div>
                  <h3 className="font-black">OAuth reutilizado com segurança</h3>
                  <p className="mt-1 text-xs font-semibold leading-relaxed">
                    O token informado por até 3.600 segundos é reaproveitado enquanto válido na mesma instância, com renovação antecipada de {config.oauth_refresh_margin_seconds}s. Ele nunca aparece nos logs.
                  </p>
                </div></div>
              </article>
              <article className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
                <div className="flex gap-3"><AlertTriangle className="shrink-0" size={22} /><div>
                  <h3 className="font-black">Autopiloto conservador</h3>
                  <p className="mt-1 text-xs font-semibold leading-relaxed">
                    Promoção exige uma hora e amostra real sem erros. HTTP 429 recua um perfil e abre resfriamento. P9–P12 nunca entram no automático sem autorização formal do Banese.
                  </p>
                </div></div>
              </article>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Estável desde</p>
                  <p className="mt-2 text-xs font-black text-[#001a33]">{dateTime(config.stable_since)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Última atualização</p>
                  <p className="mt-2 text-xs font-black text-[#001a33]">{dateTime(config.updated_at)}</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'profiles' ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-900">
            No automático, o marcador acompanha o perfil efetivo atual; o teto configurado aparece em azul e pode ser alterado na Visão geral. P9–P12 são apenas cenários avançados bloqueados: não representam limite homologado pelo Banese.
          </div>
          <fieldset>
            <legend className="sr-only">Perfis operacionais da consulta Banese</legend>
            <div className="grid gap-3 md:grid-cols-2">
              {profiles.map((profile) => {
                const automatic = draftMode === 'AUTOMATIC';
                const profileSelectionLocked = draftMode !== 'MANUAL';
                const selected = profileSelectionLocked
                  ? config.effective_profile_id === profile.id
                  : draftProfile === profile.id;
                const isConfiguredCeiling = config.selected_profile_id === profile.id;
                const isDraftCeiling = automatic
                  && draftProfile !== config.selected_profile_id
                  && draftProfile === profile.id;
                return (
                  <label key={profile.id} className={`relative flex min-h-36 gap-4 rounded-2xl border p-4 transition ${
                    profile.selectable
                      ? selected
                        ? automatic
                          ? 'border-emerald-500 bg-emerald-50 shadow-md'
                          : 'cursor-pointer border-blue-500 bg-blue-50 shadow-md'
                        : automatic
                          ? 'border-slate-200 bg-white'
                          : 'cursor-pointer border-slate-200 bg-white hover:border-blue-200'
                      : 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-80'
                  }`}>
                    <input
                      type="radio"
                      name="banese-profile"
                      value={profile.id}
                      checked={selected}
                      disabled={!profile.selectable || profileSelectionLocked}
                      onChange={() => setDraftProfile(profile.id)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-black text-[#001a33]">P{profile.id} — {profile.name}</p>
                        <div className="flex flex-wrap gap-1">
                        {!profile.selectable ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-slate-600">
                            <LockKeyhole size={10} /> Bloqueado
                          </span>
                        ) : config.effective_profile_id === profile.id ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-emerald-700">
                            <CheckCircle2 size={10} /> Efetivo agora
                          </span>
                        ) : null}
                        {isConfiguredCeiling ? (
                          <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-blue-700">
                            Teto configurado
                          </span>
                        ) : null}
                        {isDraftCeiling ? (
                          <span className="inline-flex rounded-full bg-violet-100 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-violet-700">
                            Novo teto • não salvo
                          </span>
                        ) : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs font-black text-slate-700">
                        <span>{profile.titles_per_minute} títulos/min</span>
                        <span>{profile.capacity_per_hour.toLocaleString('pt-BR')}/hora</span>
                        <span>{profile.estimated_requests_per_minute} GETs/min</span>
                      </div>
                      <p className="mt-3 text-[11px] font-semibold leading-relaxed text-slate-500">{profile.source_note}</p>
                      <p className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-[10px] font-bold leading-relaxed text-slate-700">
                        {profileScaleExample(profile)}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </section>
      ) : null}

      <div className={activeTab === 'runs' ? 'block' : 'hidden'}>
        <BaneseRunsPanel active={activeTab === 'runs'} />
      </div>
      {['queries', 'settlements', 'errors'].includes(activeTab) ? <AttemptsTable attempts={filteredAttempts} /> : null}
      {activeTab === 'audit' ? (
        <div className="space-y-3">
          {(dashboard.transitions || []).map((transition) => (
            <article key={transition.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusPill value={transition.transition_type} />
                <time className="text-[10px] font-bold text-slate-400">{dateTime(transition.created_at)}</time>
              </div>
              <p className="mt-3 text-sm font-black text-[#001a33]">
                {transition.from_profile_id ? `P${transition.from_profile_id}` : '—'} → {transition.to_profile_id ? `P${transition.to_profile_id}` : '—'}
              </p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{transition.reason}</p>
            </article>
          ))}
          {!dashboard.transitions?.length ? <p className="py-10 text-center text-sm font-semibold text-slate-400">Nenhuma transição registrada.</p> : null}
        </div>
      ) : null}
    </div>
  );
};

export default ConsultaApiBaneseConfig;
