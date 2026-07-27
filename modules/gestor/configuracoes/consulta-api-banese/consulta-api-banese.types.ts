export type BanesePollingMode = 'MANUAL' | 'AUTOMATIC' | 'PAUSED';

export interface BanesePollingProfile {
  id: number;
  name: string;
  titles_per_minute: number;
  estimated_requests_per_minute: number;
  capacity_per_hour: number;
  group_name: 'CONSERVATIVE' | 'EXPERIMENTAL';
  sicredi_reference_percent?: number | null;
  selectable: boolean;
  source_note: string;
}

export interface BanesePollingConfig {
  environment: 'sandbox' | 'production';
  mode: BanesePollingMode;
  selected_profile_id: number;
  effective_profile_id: number;
  last_stable_profile_id: number;
  state: 'OBSERVING' | 'STABLE' | 'COOLDOWN' | 'SUSPENDED' | 'PAUSED';
  stable_since: string;
  cooldown_until?: string | null;
  suspended_reason?: string | null;
  oauth_reuse_enabled: boolean;
  oauth_refresh_margin_seconds: number;
  version: number;
  updated_at: string;
}

export interface BanesePollingRun {
  id: string;
  environment: string;
  mode: string;
  profile_id: number;
  target_titles: number;
  status: string;
  claimed: number;
  checked: number;
  pending: number;
  paid: number;
  failed: number;
  throttled: boolean;
  oauth_requests: number;
  oauth_reused: boolean;
  decision?: string | null;
  duration_ms?: number | null;
  started_at: string;
  finished_at?: string | null;
}

export interface BanesePollingAttempt {
  id: number;
  run_id: string;
  receivable_id: string;
  modality: string;
  result: 'PENDING' | 'PAID' | 'ERROR' | 'THROTTLED';
  remote_status?: string | null;
  error_class?: string | null;
  http_status?: number | null;
  duration_ms: number;
  created_at: string;
}

export interface BanesePollingTransition {
  id: number;
  transition_type: string;
  from_profile_id?: number | null;
  to_profile_id?: number | null;
  from_mode?: string | null;
  to_mode?: string | null;
  reason: string;
  created_at: string;
}

export interface BanesePollingDashboard {
  available: boolean;
  environment: 'sandbox' | 'production';
  config?: BanesePollingConfig;
  profiles?: BanesePollingProfile[];
  queue?: {
    ready: number;
    leased: number;
    eadReady: number;
    quarantined: number;
  };
  lastRuns?: BanesePollingRun[];
  lastAttempts?: BanesePollingAttempt[];
  transitions?: BanesePollingTransition[];
}

export interface BanesePollingRunGroup {
  window_start: string;
  window_end: string;
  run_count: number;
  profile_ids: number[];
  statuses: string[];
  claimed: number;
  checked: number;
  paid: number;
  failed: number;
  oauth_requests: number;
  oauth_reused_count: number;
  average_duration_ms?: number | null;
  runs: BanesePollingRun[];
}

export interface BanesePollingRunsPage {
  items: BanesePollingRunGroup[];
  page: number;
  minutesPerPage: 60;
  groupsPerPage: 6;
  totalGroups: number;
  totalPages: number;
  totalRuns: number;
}

export interface BanesePollingRunsFilters {
  page: number;
  search?: string;
  startedFrom?: string;
  startedTo?: string;
  errorsOnly: boolean;
}

export interface BanesePollingErrorSummary {
  attemptsLastHour: number;
  throttledLastHour: number;
  authLastHour: number;
  lastErrorAt?: string | null;
  lastErrors: Array<Pick<
    BanesePollingAttempt,
    'id' | 'modality' | 'result' | 'error_class' | 'http_status' | 'created_at'
  >>;
}
