import { supabase } from '../../../../lib/supabase';
import type {
  BanesePollingAttemptsPage,
  BanesePollingDashboard,
  BanesePollingErrorSummary,
  BanesePollingMode,
  BanesePollingRunsFilters,
  BanesePollingRunsPage,
} from './consulta-api-banese.types';
import type { BaneseAttemptsContext } from './banese-attempt-feed';

export const banesePollingQueryKey = ['configuracoes', 'consulta-api-banese'] as const;

export const consultaApiBaneseService = {
  async getDashboard(input?: AbortSignal | { signal: AbortSignal }): Promise<BanesePollingDashboard> {
    // Also preserve the existing direct queryFn consumer in ConfiguracoesPage.
    const signal = !input ? undefined : 'signal' in input ? input.signal : input;
    signal?.throwIfAborted();
    const dashboardRequest = supabase.rpc('get_banese_reconciliation_dashboard');
    const autopilotRequest = supabase.rpc('get_banese_reconciliation_autopilot_progress');
    if (signal) { dashboardRequest.abortSignal(signal); autopilotRequest.abortSignal(signal); }
    const [
      { data, error },
      { data: autopilot, error: autopilotError },
    ] = await Promise.all([
      dashboardRequest,
      autopilotRequest,
    ]);
    signal?.throwIfAborted();
    if (error) throw new Error(error.message || 'Não foi possível carregar a consulta Banese.');
    return {
      ...(data || { available: false, environment: 'sandbox' }),
      autopilot: autopilotError ? undefined : autopilot,
    } as BanesePollingDashboard;
  },

  async updateConfig(input: {
    mode: BanesePollingMode;
    profileId: number;
    expectedVersion: number;
    reason: string;
  }) {
    const { data, error } = await supabase.rpc('update_banese_reconciliation_config', {
      p_mode: input.mode,
      p_profile_id: input.profileId,
      p_expected_version: input.expectedVersion,
      p_reason: input.reason,
    });
    if (error) throw new Error(error.message || 'Não foi possível salvar a configuração Banese.');
    return data;
  },

  async getRunsPage(filters: BanesePollingRunsFilters, signal?: AbortSignal): Promise<BanesePollingRunsPage> {
    signal?.throwIfAborted();
    const request = supabase.rpc('get_banese_reconciliation_runs_page', {
      p_page: filters.page,
      p_search: filters.search?.trim() || null,
      p_started_from: filters.startedFrom || null,
      p_started_to: filters.startedTo || null,
      p_errors_only: filters.errorsOnly,
    });
    if (signal) request.abortSignal(signal);
    const { data, error } = await request;
    signal?.throwIfAborted();
    if (error) throw new Error(error.message || 'Não foi possível carregar as execuções Banese.');
    return (data || {
      items: [],
      page: filters.page,
      minutesPerPage: 60,
      groupsPerPage: 6,
      totalGroups: 0,
      totalPages: 0,
      totalRuns: 0,
    }) as BanesePollingRunsPage;
  },

  async getErrorSummary(signal?: AbortSignal): Promise<BanesePollingErrorSummary> {
    signal?.throwIfAborted();
    const request = supabase.rpc('get_banese_reconciliation_error_summary');
    if (signal) request.abortSignal(signal);
    const { data, error } = await request;
    signal?.throwIfAborted();
    if (error) throw new Error(error.message || 'Não foi possível carregar os erros da consulta Banese.');
    return (data || {
      attemptsLastHour: 0,
      throttledLastHour: 0,
      authLastHour: 0,
      lastErrorAt: null,
      lastErrors: [],
    }) as BanesePollingErrorSummary;
  },

  async getAttemptsPage(
    context: BaneseAttemptsContext,
    page: number = 1,
    pageSize: number = 20,
    signal?: AbortSignal,
  ): Promise<BanesePollingAttemptsPage> {
    signal?.throwIfAborted();
    const request = supabase.rpc('get_banese_reconciliation_attempts_page', {
      p_context: context,
      p_page: page,
      p_page_size: pageSize,
    });
    if (signal) request.abortSignal(signal);
    const { data, error } = await request;
    signal?.throwIfAborted();
    if (error) throw new Error(error.message || 'Não foi possível carregar os registros da consulta Banese.');
    return (data || {
      items: [],
      page,
      pageSize,
      totalCount: 0,
      totalPages: 0,
    }) as BanesePollingAttemptsPage;
  },
};
