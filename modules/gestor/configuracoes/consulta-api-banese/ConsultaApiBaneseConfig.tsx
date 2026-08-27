import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import BaneseAutopilotProgress from './BaneseAutopilotProgress';
import BaneseAttemptsTable from './BaneseAttemptsTable';
import BaneseConsoleHeader from './BaneseConsoleHeader';
import BaneseTabsNav, { type BaneseTabId } from './BaneseTabsNav';
import { BaneseRunsPanel } from './BaneseRunsPanel';
import {
  profileOperationalExample,
  profileScaleExample,
} from './banese-profile-examples';
import { BaneseStatusPill, formatBaneseDateTime } from './banese-display';
import type { BanesePollingMode } from './consulta-api-banese.types';

const ConsultaApiBaneseConfig = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<BaneseTabId>('overview');
  const [attemptsPage, setAttemptsPage] = useState(1);
  const [draftMode, setDraftMode] = useState<BanesePollingMode>('AUTOMATIC');
  const [draftProfile, setDraftProfile] = useState(6);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const handleTabChange = (tab: BaneseTabId) => {
    setActiveTab(tab);
    setAttemptsPage(1);
  };

  const dashboardQuery = useQuery({
    queryKey: banesePollingQueryKey,
    queryFn: consultaApiBaneseService.getDashboard,
    refetchInterval: 30_000,
  });
  const dashboard = dashboardQuery.data;
  const config = dashboard?.config;
  const configMode = config?.mode;
  const configuredProfileId = config?.selected_profile_id;
  const errorSummaryQuery = useQuery({
    queryKey: [...banesePollingQueryKey, 'error-summary'],
    queryFn: consultaApiBaneseService.getErrorSummary,
    enabled: dashboard?.available === true,
    refetchInterval: 30_000,
  });

  const isAttemptTab = ['queries', 'settlements', 'errors'].includes(activeTab);
  const attemptsQuery = useQuery({
    queryKey: [...banesePollingQueryKey, 'attempts', activeTab, attemptsPage],
    queryFn: () => consultaApiBaneseService.getAttemptsPage(
      activeTab as 'queries' | 'settlements' | 'errors',
      attemptsPage,
      20,
    ),
    enabled: isAttemptTab && dashboard?.available === true,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!configMode || configuredProfileId === undefined) return;
    setDraftMode(configMode);
    setDraftProfile(configuredProfileId);
  }, [configMode, configuredProfileId]);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'banese_reconciliation_attempts' }, () => {
        void queryClient.invalidateQueries({ queryKey: [...banesePollingQueryKey, 'attempts'] });
        void queryClient.invalidateQueries({ queryKey: [...banesePollingQueryKey, 'error-summary'] });
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
  const autopilot = dashboard.autopilot;
  const effective = profiles.find((profile) => profile.id === config.effective_profile_id);
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
    <div className="banese-console space-y-6">
      <BaneseConsoleHeader
        environment={dashboard.environment}
        config={config}
        effective={effective}
        previousProfileId={previousProfileId}
      />

      <BaneseTabsNav activeTab={activeTab} onChange={handleTabChange} />

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
                  ? `Automático P3 → P9: P${config.effective_profile_id} agora`
                  : config.mode === 'MANUAL'
                    ? `Manual: P${config.effective_profile_id}`
                    : `Pausado no P${config.effective_profile_id}`}
              </h3>
              <p className="mt-2 text-xs font-semibold leading-relaxed">
                {config.mode === 'AUTOMATIC'
                  ? 'O marcador acompanha o perfil efetivo entre o piso P3 e o teto P9. O sistema avança gradualmente nessa faixa e recua se detectar erro ou HTTP 429.'
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
                    {error.http_status ? ` • HTTP ${error.http_status}` : ''} • {formatBaneseDateTime(error.created_at)}
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

          {config.mode === 'AUTOMATIC' && autopilot ? (
            <BaneseAutopilotProgress config={config} autopilot={autopilot} />
          ) : null}

          <section className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <Gauge className="text-blue-600" size={22} />
                <div>
                  <h3 className="font-black text-[#001a33]">Controle operacional</h3>
                  <p className="text-xs font-semibold text-slate-500">No manual você escolhe o perfil; no automático o sistema controla sozinho o perfil efetivo.</p>
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
                      <input
                        type="radio"
                        name="banese-mode"
                        value={value}
                        checked={draftMode === value}
                        onChange={() => {
                          setDraftMode(value);
                          if (value === 'AUTOMATIC') setDraftProfile(9);
                        }}
                      />
                      {value === 'PAUSED' ? <PauseCircle size={15} /> : <Activity size={15} />}
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {draftMode === 'AUTOMATIC' ? (
                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="font-black uppercase tracking-wider text-blue-700">Perfil controlado pelo automático</p>
                  <p className="mt-2 text-lg font-black text-[#001a33]">P{config.effective_profile_id} — {effective?.name}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    O usuário não altera o perfil enquanto este modo estiver ativo. O sistema avança sozinho do piso P3 ao teto P9 após a amostra estável e retorna ao fallback anterior ao detectar qualquer erro.
                  </p>
                </div>
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
                    Na escada automática P3 → P9, a promoção exige uma hora e amostra real sem erros. Qualquer erro recua para o fallback seguro; HTTP 429 também interrompe o lote e abre resfriamento de uma hora.
                  </p>
                </div></div>
              </article>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Estável desde</p>
                  <p className="mt-2 text-xs font-black text-[#001a33]">{formatBaneseDateTime(config.stable_since)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Última atualização</p>
                  <p className="mt-2 text-xs font-black text-[#001a33]">{formatBaneseDateTime(config.updated_at)}</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'profiles' ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-900">
            No automático, o marcador acompanha o perfil efetivo e fica bloqueado para edição. A escada vai do piso P3 ao teto P9, com avanço condicionado a amostra real estável. P10–P16 são testes manuais temporários e P17–P20 permanecem bloqueados aguardando retorno.
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
                        <span className="inline-flex rounded-full bg-white px-2 py-1 font-black uppercase tracking-wider text-slate-600">
                          {profile.automatic_selectable
                            ? 'Automático'
                            : profile.group_name === 'CONSERVATIVE'
                              ? 'Somente manual'
                              : profile.group_name === 'REAL_TEST'
                                ? 'Teste geral'
                                : profile.group_name === 'PRIORITY_WINDOW'
                                  ? 'EAD + vencimento'
                                  : 'Aguardando Banese'}
                        </span>
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
      {isAttemptTab ? (
        <BaneseAttemptsTable
          attempts={attemptsQuery.data?.items || []}
          context={activeTab as 'queries' | 'settlements' | 'errors'}
          canViewReceivableDetails={dashboard.canViewReceivableDetails === true}
          page={attemptsPage}
          totalPages={attemptsQuery.data?.totalPages || 0}
          totalCount={attemptsQuery.data?.totalCount || 0}
          pageSize={attemptsQuery.data?.pageSize || 20}
          onPageChange={setAttemptsPage}
          isLoading={attemptsQuery.isLoading}
          isFetching={attemptsQuery.isFetching}
        />
      ) : null}
      {activeTab === 'audit' ? (
        <div className="space-y-3">
          {(dashboard.transitions || []).map((transition) => (
            <article key={transition.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <BaneseStatusPill value={transition.transition_type} />
                <time className="text-[10px] font-bold text-slate-400">{formatBaneseDateTime(transition.created_at)}</time>
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
