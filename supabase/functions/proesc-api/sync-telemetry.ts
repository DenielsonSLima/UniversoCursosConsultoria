import { ProescV1ReadError } from './v1-client.ts';

export type SyncStage = 'CREDENTIAL' | 'FETCH' | 'OBSERVE' | 'SNAPSHOT' | 'APPLY' | 'RUNTIME';
export type ItemResult = 'APPLIED' | 'UNCHANGED' | 'REVIEW' | 'FAILED';
export type SyncTelemetry = {
  http: Array<{ unitId: string; year: number; month: number; httpStatus: number; durationMs: number; errorCode: string | null }>;
  items: Array<{ linkId: string; snapshotId: string | null; result: ItemResult; stage: SyncStage; errorCode: string | null }>;
  errorCode: string | null;
  stage: SyncStage | null;
};
export class SyncTelemetryError extends Error {
  constructor(readonly code: 'CREDENTIAL_UNAVAILABLE' | 'CREDENTIAL_CHANGED' | 'SNAPSHOT_REJECTED' | 'TIMEOUT' | 'INTERNAL_ERROR') {
    super(code);
  }
}
export const createSyncTelemetry = (): SyncTelemetry => ({ http: [], items: [], errorCode: null, stage: null });

// Never read message, cause, URLs, headers or response bodies into telemetry.
export function safeSyncError(error: unknown, stage: SyncStage): { code: string; httpStatus: number } {
  if (error instanceof ProescV1ReadError) return { code: error.code, httpStatus: error.upstreamStatus };
  if (error instanceof SyncTelemetryError) return { code: error.code, httpStatus: 0 };
  return { code: stage === 'SNAPSHOT' ? 'SNAPSHOT_REJECTED'
    : stage === 'OBSERVE' ? 'OBSERVATION_ERROR' : 'INTERNAL_ERROR', httpStatus: 0 };
}
export function markSyncFailure(telemetry: SyncTelemetry, error: unknown, stage: SyncStage) {
  if (telemetry.errorCode === null) {
    telemetry.errorCode = safeSyncError(error, stage).code;
    telemetry.stage = stage;
  }
}
