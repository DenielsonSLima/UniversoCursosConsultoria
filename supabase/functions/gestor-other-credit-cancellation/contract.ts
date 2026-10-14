export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_CANCELLATION_ITEMS = 25;

export class CancellationRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export type CancellationRequest = {
  idempotencyKey: string;
  receivableIds: string[];
  reason: string;
};
export type CancellationResult = {
  receivableId: string;
  status: 'CANCELED' | 'REVIEW_REQUIRED' | 'FAILED' | 'PROCESSING';
  message?: string;
};
export type CancellationResponse = { operationId: string; results: CancellationResult[] };

export function parseCancellationRequest(value: unknown): CancellationRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CancellationRequestError(400, 'Solicitação de cancelamento inválida.');
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).sort().join(',') !== 'idempotencyKey,reason,receivableIds' ||
    typeof body.idempotencyKey !== 'string' || !UUID_RE.test(body.idempotencyKey) ||
    !Array.isArray(body.receivableIds) || body.receivableIds.length < 1 ||
    body.receivableIds.length > MAX_CANCELLATION_ITEMS ||
    body.receivableIds.some(id => typeof id !== 'string' || !UUID_RE.test(id)) ||
    new Set(body.receivableIds.map(id => String(id).toLowerCase())).size !== body.receivableIds.length) {
    throw new CancellationRequestError(400, 'Selecione de 1 a 25 créditos diferentes para cancelar.');
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 5 || reason.length > 500 || Array.from(reason).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new CancellationRequestError(400, 'Informe o motivo do cancelamento, entre 5 e 500 caracteres.');
  }
  return {
    idempotencyKey: body.idempotencyKey.toLowerCase(),
    receivableIds: body.receivableIds.map(id => String(id).toLowerCase()).sort(),
    reason,
  };
}
