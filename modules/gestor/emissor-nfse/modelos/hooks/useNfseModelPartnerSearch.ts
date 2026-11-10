import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import { isNfseScopeValid } from '../../types/nfse.scope';
import { nfseModelPartnersService } from '../services/nfse-model-partners.service';

export function useNfseModelPartnerSearch(scope: NfseScope | null, selectedId?: string | null) {
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);
  const enabled = isNfseScopeValid(scope);
  const prefix = ['nfse', 'model-partner-search', scope?.contextKey, scope?.poloId, scope?.environment];
  const selected = useQuery({ queryKey: [...prefix, 'selected', selectedId || ''],
    enabled: enabled && Boolean(selectedId), retry: false, staleTime: 60_000,
    queryFn: ({ signal }) => nfseModelPartnersService.search(scope!, '', selectedId, signal) });
  const results = useQuery({ queryKey: [...prefix, 'search', term], enabled: enabled && term.length >= 2,
    retry: false, staleTime: 60_000, queryFn: ({ signal }) => nfseModelPartnersService.search(scope!, term, null, signal) });
  const rows = [...(selected.data || []), ...(results.data || [])];
  const options = [...new Map(rows.map(row => [row.value, row])).values()];
  return { options, loading: selected.isFetching || results.isFetching,
    error: Boolean(selected.error || results.error), search: setText,
    retry: () => { if (selectedId) void selected.refetch(); if (term.length >= 2) void results.refetch(); } };
}
