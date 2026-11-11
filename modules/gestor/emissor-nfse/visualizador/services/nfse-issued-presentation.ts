import type { QueryClient } from '@tanstack/react-query';
import type { NfseDocument, NfsePage, NfseScope } from '../../types/nfse.types';
import type { DanfseDocument, DanfseRenderOptions } from '../danfse.types';
import { nfseQueryKeys } from '../../queries/nfse.queryKeys';
import { NfseAccessError } from '../../services/nfse.errors';

export type IssuedNfseIdentity = Pick<NfseDocument, 'id' | 'status' | 'number' | 'accessKey' | 'state' | 'cancelPreviewId'>;
export interface IssuedDanfseDocument extends DanfseDocument { renderOptions: DanfseRenderOptions }

/** The authenticated list supplies fiscal state; original XML remains unchanged. */
export function withIssuedDanfsePresentation(document: DanfseDocument, selected: IssuedNfseIdentity): IssuedDanfseDocument {
  return { ...document, renderOptions: { cancellationState: selected.state === 'CANCELLED' ? 'CONFIRMED' : null } };
}

export function nfseIssuedXmlQueryKey(scope: NfseScope | null, document: IssuedNfseIdentity) {
  return ['nfse-issued-xml', scope?.contextKey, scope?.poloId, scope?.environment, scope?.month,
    document.id, document.accessKey, document.number, document.state ?? null, document.cancelPreviewId ?? null] as const;
}

export function resolveNfseIssuedDocument(client: QueryClient, scope: NfseScope, selected: NfseDocument): NfseDocument | null {
  const queries = client.getQueryCache().findAll({ queryKey: [...nfseQueryKeys.scope(scope), 'documents', 'EMITIDA'] });
  if (queries.some(query => query.state.error instanceof NfseAccessError)) return null;
  const activeRefreshAt = queries.reduce((latest, query) => query.queryKey.at(-1) === 'ACTIVE'
    && query.state.status === 'success' && !query.state.isInvalidated && query.state.fetchStatus === 'idle'
    ? Math.max(latest, query.state.dataUpdatedAt) : latest, -1);
  let current = selected, updatedAt = -1, found = false;
  for (const query of queries) {
    const data = query.state.data as NfsePage<NfseDocument> | undefined;
    const candidate = data?.rows?.find(row => row.id === selected.id && row.accessKey === selected.accessKey && row.number === selected.number);
    if (!candidate || query.state.error) continue;
    if (candidate.state !== 'CANCELLED' && (query.state.isInvalidated || query.state.dataUpdatedAt < activeRefreshAt)) continue;
    found = true;
    if (current.state === 'CANCELLED' && candidate.state !== 'CANCELLED') continue;
    if (candidate.state === 'CANCELLED' || query.state.dataUpdatedAt > updatedAt) {
      current = candidate; updatedAt = query.state.dataUpdatedAt;
    }
  }
  // A refreshed Active page can remove a newly cancelled note. Hide the stale
  // viewer/download until its canonical Cancelled row is available; never infer it.
  if (!found && current.state !== 'CANCELLED' && queries.some(query => query.queryKey.at(-1) === 'ACTIVE')) return null;
  return current;
}
