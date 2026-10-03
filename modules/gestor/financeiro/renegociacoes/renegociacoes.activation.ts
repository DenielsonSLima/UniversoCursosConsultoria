export type RenegociacaoActivationState = 'CANCELING_SOURCES' | 'ISSUING_REPLACEMENTS' | 'ACTIVE' | 'REVIEW_REQUIRED';

export interface ActivateRenegociacaoInput {
  agreementId: string;
  requestId: string;
  expectedVersion: number;
  expectedFingerprint: string;
  confirm: true;
  approveCustomTerms: boolean;
}

export interface RenegociacaoActivationProgress {
  agreementId: string;
  operationId: string;
  requestId: string;
  state: RenegociacaoActivationState;
  sourcesTotal: number;
  sourcesCanceled: number;
  replacementsTotal: number;
  replacementsIssued: number;
  retryable: boolean;
}

export interface RenegociacaoActivationOperation extends RenegociacaoActivationProgress {
  approvedCustomTerms: boolean;
  expectedVersion: number;
  expectedFingerprint: string;
  agreementVersion: number;
  proposalFingerprint: string;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface RenegociacaoActivationResult extends RenegociacaoActivationProgress {
  success: boolean;
  code: string | null;
  message: string;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const required = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`O servidor não retornou ${label} da efetivação.`);
  return value;
};
const integer = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('O servidor retornou um contador inválido da efetivação.');
  return value;
};

const parseProgress = (value: unknown, agreementId: string, requestId?: string): RenegociacaoActivationProgress => {
  const row = record(value);
  if (row.agreementId !== agreementId || (requestId && row.requestId !== requestId))
    throw new Error('A resposta de efetivação não pertence a esta proposta e solicitação.');
  if (!['CANCELING_SOURCES', 'ISSUING_REPLACEMENTS', 'ACTIVE', 'REVIEW_REQUIRED'].includes(String(row.state)))
    throw new Error('O servidor retornou uma situação desconhecida da efetivação.');
  if (typeof row.retryable !== 'boolean') throw new Error('O servidor não confirmou se a efetivação pode continuar.');
  const progress = {
    agreementId, operationId: required(row.operationId, 'a operação'), requestId: required(row.requestId, 'a solicitação'),
    state: row.state as RenegociacaoActivationState,
    sourcesTotal: integer(row.sourcesTotal), sourcesCanceled: integer(row.sourcesCanceled),
    replacementsTotal: integer(row.replacementsTotal), replacementsIssued: integer(row.replacementsIssued),
    retryable: row.retryable,
  };
  if (progress.sourcesCanceled > progress.sourcesTotal || progress.replacementsIssued > progress.replacementsTotal
    || ((progress.state === 'ACTIVE' || progress.state === 'REVIEW_REQUIRED') && progress.retryable))
    throw new Error('O servidor retornou progresso inconsistente da efetivação.');
  if (progress.state === 'ACTIVE' && (progress.sourcesTotal === 0 || progress.replacementsTotal === 0
    || progress.sourcesCanceled !== progress.sourcesTotal || progress.replacementsIssued !== progress.replacementsTotal))
    throw new Error('A efetivação ainda não tem todos os títulos confirmados pelo servidor.');
  return progress;
};

export const parseActivationOperation = (value: unknown, agreementId: string): RenegociacaoActivationOperation | null => {
  const unwrapped = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (unwrapped === null) return null;
  const row = record(unwrapped);
  if (typeof row.approvedCustomTerms !== 'boolean')
    throw new Error('O servidor não confirmou a aprovação original das condições desta operação.');
  return {
    ...parseProgress(row, agreementId), approvedCustomTerms: row.approvedCustomTerms,
    expectedVersion: integer(row.expectedVersion),
    expectedFingerprint: required(row.expectedFingerprint, 'a identidade original'),
    agreementVersion: integer(row.agreementVersion), proposalFingerprint: required(row.proposalFingerprint, 'a identidade da proposta'),
    lastErrorCode: typeof row.lastErrorCode === 'string' ? row.lastErrorCode : null,
    createdAt: required(row.createdAt, 'a data de início'), updatedAt: required(row.updatedAt, 'a atualização'),
    completedAt: typeof row.completedAt === 'string' ? row.completedAt : null,
  };
};

export const parseActivationResult = (value: unknown, input: ActivateRenegociacaoInput): RenegociacaoActivationResult => {
  const row = record(value);
  const progress = parseProgress(row, input.agreementId, input.requestId);
  if (typeof row.success !== 'boolean' || row.success !== (progress.state === 'ACTIVE'))
    throw new Error('O servidor não confirmou a conclusão da efetivação.');
  return { ...progress, success: row.success, code: typeof row.code === 'string' ? row.code : null,
    message: required(row.message, 'a mensagem de andamento') };
};

export const resumeActivationInput = (operation: RenegociacaoActivationOperation): ActivateRenegociacaoInput => ({
  agreementId: operation.agreementId, requestId: operation.requestId,
  expectedVersion: operation.expectedVersion, expectedFingerprint: operation.expectedFingerprint,
  confirm: true, approveCustomTerms: operation.approvedCustomTerms,
});

export const activationStateLabel: Record<RenegociacaoActivationState, string> = {
  CANCELING_SOURCES: 'Confirmando cancelamento dos títulos originais',
  ISSUING_REPLACEMENTS: 'Emitindo os novos títulos',
  ACTIVE: 'Acordo efetivado', REVIEW_REQUIRED: 'Revisão necessária',
};

/** Banking progress is monotonic. An older GET must not hide a confirmed Edge response. */
export const latestActivationProgress = (
  operation?: RenegociacaoActivationProgress | null,
  result?: RenegociacaoActivationProgress | null,
): RenegociacaoActivationProgress | undefined => {
  if (!operation) return result || undefined;
  if (!result || operation.operationId !== result.operationId || operation.requestId !== result.requestId
    || operation.agreementId !== result.agreementId) return operation;
  if (operation.state === 'REVIEW_REQUIRED') return operation;
  if (result.state === 'REVIEW_REQUIRED') return result;
  if (operation.state === 'ACTIVE') return operation;
  if (result.state === 'ACTIVE') return result;
  if (operation.state === 'ISSUING_REPLACEMENTS' && result.state === 'CANCELING_SOURCES') return operation;
  if (result.state === 'ISSUING_REPLACEMENTS' && operation.state === 'CANCELING_SOURCES') return result;
  return result.sourcesCanceled > operation.sourcesCanceled || result.replacementsIssued > operation.replacementsIssued
    ? result : operation;
};
