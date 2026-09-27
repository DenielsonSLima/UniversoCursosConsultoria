import { UUID_PATTERN } from './caixa-workspace.validation';

type RealtimePayload = {
  new?: unknown;
};

export type CaixaWorkspaceInvalidation =
  | { kind: 'IGNORE'; scopes: readonly [] }
  | { kind: 'COMPANY'; scopes: readonly [] }
  | { kind: 'SCOPES'; scopes: readonly (string | null)[] };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

/**
 * Resolve somente o alcance do refetch. O evento nunca é aplicado ao cache:
 * o snapshot completo volta a ser lido pela RPC canônica.
 */
export const getCaixaWorkspaceInvalidation = (
  payload: RealtimePayload,
  companyPoloIds: ReadonlySet<string>,
): CaixaWorkspaceInvalidation => {
  if (!isRecord(payload.new) || !('polo_id' in payload.new)) {
    return { kind: 'COMPANY', scopes: [] };
  }

  const poloId = payload.new.polo_id;
  if (poloId === null) return { kind: 'SCOPES', scopes: [null] };
  if (typeof poloId !== 'string' || !UUID_PATTERN.test(poloId)) {
    return { kind: 'COMPANY', scopes: [] };
  }
  // O evento legado não carrega company_id. Um polo desconhecido pode ser
  // novo ou estar ausente da lista do consumidor, então invalidamos a empresa.
  if (!companyPoloIds.has(poloId)) return { kind: 'COMPANY', scopes: [] };

  return { kind: 'SCOPES', scopes: [poloId, null] };
};
