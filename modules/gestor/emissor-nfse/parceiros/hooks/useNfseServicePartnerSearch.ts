import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NfseScope } from '../../types/nfse.types';
import { nfsePartnerServices } from '../services/nfse-partner-services.service';

export function useNfseServicePartnerSearch(scope: NfseScope, selectedId: string) {
  const [text, setText] = useState(''), [term, setTerm] = useState('');
  useEffect(() => { const timer = setTimeout(() => setTerm(text.trim()), 200); return () => clearTimeout(timer); }, [text]);
  const key = ['nfse', 'service-partner-search', scope.contextKey, scope.poloId, scope.environment, scope.month];
  const selected = useQuery({ queryKey: [...key, 'selected', selectedId], enabled: Boolean(selectedId), retry: false, staleTime: 60_000, gcTime: 0,
    queryFn: ({ signal }) => nfsePartnerServices.searchPartners(scope, '', selectedId, signal) });
  const results = useQuery({ queryKey: [...key, 'search', term], enabled: term.length >= 2, retry: false, staleTime: 60_000, gcTime: 0,
    queryFn: ({ signal }) => nfsePartnerServices.searchPartners(scope, term, null, signal) });
  const pending = text.trim() !== term;
  const options = !pending && term.length >= 2 && !results.error ? results.data || [] : [];
  const selectedRow = selected.data?.find(row => row.id === selectedId) || results.data?.find(row => row.id === selectedId);
  const rows = [...new Map([...(selectedRow ? [selectedRow] : []), ...options].map(row => [row.id, row])).values()];
  return { rows, options, search: setText, loading: selected.isFetching || (text.trim().length >= 2 && (pending || results.isFetching)),
    error: selected.error || (!pending && term.length >= 2 ? results.error : null),
    retry: () => { if (selectedId) void selected.refetch(); if (term.length >= 2) void results.refetch(); } };
}
