import { supabase } from '../../../../lib/supabase';
import type {
  BanesePollingDashboard,
  BanesePollingErrorSummary,
  BanesePollingMode,
  BanesePollingRunsFilters,
  BanesePollingRunsPage,
} from './consulta-api-banese.types';

export const banesePollingQueryKey = ['configuracoes', 'consulta-api-banese'] as const;

export const consultaApiBaneseService = {
  async getDashboard(): Promise<BanesePollingDashboard> {
    const { data, error } = await supabase.rpc('get_banese_reconciliation_dashboard');
    if (error) throw new Error(error.message || 'Não foi possível carregar a consulta Banese.');
    return (data || { available: false, environment: 'sandbox' }) as BanesePollingDashboard;
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

  async getRunsPage(filters: BanesePollingRunsFilters): Promise<BanesePollingRunsPage> {
    const { data, error } = await supabase.rpc('get_banese_reconciliation_runs_page', {
      p_page: filters.page,
      p_search: filters.search?.trim() || null,
      p_started_from: filters.startedFrom || null,
      p_started_to: filters.startedTo || null,
      p_errors_only: filters.errorsOnly,
    });
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

  async getErrorSummary(): Promise<BanesePollingErrorSummary> {
    const { data, error } = await supabase.rpc('get_banese_reconciliation_error_summary');
    if (error) throw new Error(error.message || 'Não foi possível carregar os erros da consulta Banese.');
    return (data || {
      attemptsLastHour: 0,
      throttledLastHour: 0,
      authLastHour: 0,
      lastErrorAt: null,
      lastErrors: [],
    }) as BanesePollingErrorSummary;
  },
};
