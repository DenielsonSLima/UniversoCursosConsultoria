export class OtherCreditPlanRpcError extends Error {
  readonly code: string | null;
  readonly status: number | undefined;

  constructor(message: string, code?: string | null, status?: number) {
    super(message);
    this.name = 'OtherCreditPlanRpcError';
    this.code = code || null;
    this.status = status;
  }
}

/** A SQL rejection describes this RPC call, not the outcome of an earlier ambiguous call. */
export function isDefinitiveOtherCreditPlanCreationError(error: unknown): error is OtherCreditPlanRpcError {
  return error instanceof OtherCreditPlanRpcError
    && ['22023', '42501'].includes(error.code || '')
    && Boolean(error.status && error.status >= 400 && error.status < 500);
}
