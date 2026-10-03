import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RenegociacaoIdentity } from '../renegociacoes.types';
import { canonicalSelectionIds, selectionIdsKey } from '../renegociacoes.selection-summary';
import { getRenegociacaoSelectionSummary } from '../renegociacoes.selection-summary.service';

export const selectionSummaryKey = (
  identity: RenegociacaoIdentity,
  ids: readonly string[],
  asOf?: string | null,
) => ['financeiro', 'renegociacoes', 'selection-summary', identity.poloId,
  identity.alunoId, identity.matriculaId, identity.turmaId, asOf || 'hoje', selectionIdsKey(ids)] as const;

export const useRenegociacaoSelectionSummary = (
  identity: RenegociacaoIdentity,
  ids: readonly string[],
  asOf?: string | null,
) => {
  const key = selectionSummaryKey(identity, ids, asOf);
  const signature = JSON.stringify(key);
  const [settledSignature, setSettledSignature] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledSignature(signature), 150);
    return () => window.clearTimeout(timer);
  }, [signature]);
  const waitingForSelection = settledSignature !== signature;
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getRenegociacaoSelectionSummary(identity, canonicalSelectionIds(ids), asOf, signal),
    enabled: ids.length > 0 && !waitingForSelection,
    retry: false,
    networkMode: 'always',
    staleTime: 0,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  // Never show the previous selection or an old amount while a canonical refresh is pending.
  const loading = ids.length > 0 && (waitingForSelection || query.isPending || query.isFetching);
  return { ...query, data: loading || query.isError ? undefined : query.data, loading };
};
