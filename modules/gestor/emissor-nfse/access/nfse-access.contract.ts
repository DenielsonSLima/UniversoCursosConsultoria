export interface NfseAccessIdentity {
  authUserId: string;
  contextId: string;
}

export interface NfseAccessDecision extends NfseAccessIdentity {
  allowed: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isNfseAccessIdentity = (identity: NfseAccessIdentity) => (
  UUID.test(identity.authUserId) && UUID.test(identity.contextId)
);

export const hasNfseAccessDecision = (
  decision: NfseAccessDecision | undefined,
  identity: NfseAccessIdentity,
) => Boolean(decision?.allowed === true
  && isNfseAccessIdentity(identity)
  && decision.authUserId === identity.authUserId
  && decision.contextId === identity.contextId);

export const nfseAccessQueryKey = (identity: NfseAccessIdentity) => [
  'nfse-pilot-access', identity.authUserId, identity.contextId,
] as const;

export function resolveNfsePilotAccessState(identity: NfseAccessIdentity, eligible: boolean, query: {
  data?: NfseAccessDecision;
  isError: boolean;
  isFetching: boolean;
}) {
  const hasCurrentDecision = isNfseAccessIdentity(identity)
    && typeof query.data?.allowed === 'boolean'
    && query.data.authUserId === identity.authUserId
    && query.data.contextId === identity.contextId;
  return {
    allowed: eligible && !query.isError && hasNfseAccessDecision(query.data, identity),
    isChecking: eligible && query.isFetching && !hasCurrentDecision,
  };
}

export function createNfseAccessReader(dependencies: {
  currentAuthUserId: () => Promise<string | null>;
  request: (contextId: string, signal?: AbortSignal) => Promise<unknown>;
}) {
  return async (identity: NfseAccessIdentity, signal?: AbortSignal): Promise<NfseAccessDecision> => {
    if (!isNfseAccessIdentity(identity)) throw new Error('Contexto de acesso NFS-e inválido.');
    if (await dependencies.currentAuthUserId() !== identity.authUserId) {
      throw new Error('A sessão de acesso NFS-e mudou.');
    }
    const allowed = await dependencies.request(identity.contextId, signal);
    if (typeof allowed !== 'boolean') throw new Error('Resposta de acesso NFS-e inválida.');
    if (signal?.aborted || await dependencies.currentAuthUserId() !== identity.authUserId) {
      throw new Error('A sessão de acesso NFS-e mudou.');
    }
    return { ...identity, allowed };
  };
}
