export type ProescFeedContext = 'runs' | 'observations' | 'settlements' | 'errors';
export type ProescConsoleTab = 'overview' | ProescFeedContext;
export interface ProescConsoleFilters {
  poloId: string | null;
  startedFrom: string | null;
  startedTo: string | null;
}
export interface ProescRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'ABANDONED' | 'RUNNING';
  durationMs: number | null;
  claimed: number;
  consulted: number;
  applied: number;
  unchanged: number;
  review: number;
  failed: number;
  httpRequests: number | null;
  httpFailed: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  stage: string | null;
  telemetryComplete: boolean;
  metricsScope?: 'GLOBAL' | 'POLO_ITEMS_SHARED_EXECUTION';
}
export interface ProescObservation {
  id: string;
  observedAt: string;
  recordedAt: string;
  runId?: string | null;
  classId: string;
  classCode: string;
  className: string;
  poloId: string;
  poloName: string;
  sourceStatus: string;
  verification: 'VERIFIED' | 'REVIEW';
  reviewReasons: string[];
  receivableId?: string;
  studentName?: string | null;
  description?: string | null;
  externalKey?: string | null;
  principalAmount?: number;
  receivedAmount?: number | null;
  paymentDate?: string | null;
}
export interface ProescSettlement {
  id: string;
  recordedAt: string;
  mode: 'AUTO' | 'IMPORT' | 'CORRECTION';
  result: 'APPLIED';
  classCode: string;
  poloName: string;
  receivableId?: string;
  studentName?: string | null;
  description?: string | null;
  externalKey?: string | null;
  principalAmount?: number;
  receivedAmount?: number | null;
  paymentDate?: string | null;
}
export interface ProescConsoleError {
  receivableId?: string;
  studentName?: string | null;
  description?: string | null;
  externalKey?: string | null;
  id: string;
  runId: string;
  recordedAt: string;
  stage: string;
  errorCode: string;
  errorMessage: string;
  httpStatus?: number | null;
  durationMs?: number | null;
  classCode?: string;
  poloName?: string;
}
export interface ProescFeedItems {
  runs: ProescRun;
  observations: ProescObservation;
  settlements: ProescSettlement;
  errors: ProescConsoleError;
}
export interface ProescFeedPage<T = ProescFeedItems[ProescFeedContext]> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}
export interface ProescDashboard {
  available: boolean;
  configured: boolean;
  canViewReceivableDetails: boolean;
  historyStartedAt: string | null;
  selectedPoloId: string | null;
  polos: Array<{ id: string; name: string }>;
  period: { startedFrom: string; startedTo: string };
  monitor: {
    enabled: boolean;
    schedule: string | null;
    running: boolean;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    lastDurationMs: number | null;
    lastCounts: { consulted?: number; applied?: number; unchanged?: number; review?: number; failed?: number } | null;
  };
  totals: {
    monitored: number;
    autoEnabled: number;
    observations: number;
    appliedAuto: number;
    appliedImport: number;
    review: number;
    failedRuns: number;
    httpRequests: number | null;
  };
}
